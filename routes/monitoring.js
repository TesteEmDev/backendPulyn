// routes/monitoring.js - Monitoramento derivado do estado real do banco
const express = require('express');
const router = express.Router();
const { allQuery } = require('../database');
const { verifyToken, isMaster } = require('../utils/middleware');
const { statusEfetivo } = require('../utils/statusCheckpoint');
const { STATUS } = require('../utils/checkpointTransferencia');

function requireMaster(req, res, next) {
  if (!isMaster(req)) {
    return res.status(403).json({ error: 'Acesso negado: apenas master pode consultar monitoramento' });
  }
  return next();
}

function asDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatEvent(event) {
  if (!event) return 'Nenhum evento registrado';
  const date = asDate(event.event_date || event.criadoEm);
  const dateLabel = date ? date.toLocaleDateString('pt-BR') : '';
  const timeLabel = event.event_time ? String(event.event_time).slice(0, 5) : '';
  return [event.nome, dateLabel, timeLabel].filter(Boolean).join(' - ');
}

// "há 5 min", "há 3 h", "há 2 dias"
function tempoSemSinal(visto, agora) {
  const data = asDate(visto);
  if (!data) return 'nunca conectou';
  const min = Math.max(0, Math.round((agora - data.getTime()) / 60000));
  if (min < 60) return `sem sinal há ${min} min`;
  const h = Math.floor(min / 60);
  return h < 48 ? `sem sinal há ${h} h` : `sem sinal há ${Math.floor(h / 24)} dias`;
}

// Cada alerta é um fato do banco, nunca um texto fixo:
//  - checkpoint_offline: checkpoint do cliente sem sinal há mais de 3 min (alta se o evento dele está em andamento);
//  - evento_sem_checkpoint: evento em andamento sem nenhum checkpoint online;
//  - cliente_inativo: cliente bloqueado ou inativo.
// A situação do checkpoint vem do último sinal da placa (statusEfetivo): o `status` gravado só muda quando alguém avisa.
async function loadMonitoringData() {
  const [companies, pontoVerificacao, events] = await Promise.all([
    allQuery(`
      SELECT empresaId, nome, cidade, estado, status
      FROM empresa
      WHERE nome <> @masterName
        AND LOWER(COALESCE(plano, '')) <> 'family'
      ORDER BY nome
    `, { masterName: 'Master Admin' }),
    allQuery(`
      SELECT checkpointId, numCheck, eventoId, empresaId, nome, status, ultimoVisto, ip, zona, pontos, proposito
      FROM pontoVerificacao
      WHERE statusTransferencia = @aceito AND empresaId IS NOT NULL
    `, { aceito: STATUS.ACEITO }),
    allQuery(`
      SELECT eventoId, empresaId, nome, status, [data] AS event_date, [hora] AS event_time, criadoEm
      FROM evento
      WHERE empresaId IS NOT NULL
    `),
  ]);

  const agora = Date.now();
  const eventById = new Map(events.map(event => [String(event.eventoId), event]));
  const checkpointsByCompany = new Map();
  pontoVerificacao.forEach(checkpoint => {
    const key = String(checkpoint.empresaId);
    if (!checkpointsByCompany.has(key)) checkpointsByCompany.set(key, []);
    checkpointsByCompany.get(key).push(checkpoint);
  });

  const eventsByCompany = new Map();
  events.forEach(event => {
    const key = String(event.empresaId);
    const current = eventsByCompany.get(key);
    const currentDate = asDate(current?.event_date || current?.criadoEm);
    const eventDate = asDate(event.event_date || event.criadoEm);
    if (!current || (eventDate && (!currentDate || eventDate > currentDate))) {
      eventsByCompany.set(key, event);
    }
  });

  const units = companies.map(company => {
    const empresaKey = String(company.empresaId);
    const checkpointItems = (checkpointsByCompany.get(empresaKey) || []).map(checkpoint => {
      const online = statusEfetivo(checkpoint.status, checkpoint.ultimoVisto, agora) === 'online';
      const evento = eventById.get(String(checkpoint.eventoId));
      return {
        id: checkpoint.checkpointId,
        numero: checkpoint.numCheck || null,
        name: checkpoint.nome,
        status: online ? 'online' : 'offline',
        lastSeen: checkpoint.ultimoVisto || null,
        semSinal: online ? null : tempoSemSinal(checkpoint.ultimoVisto, agora),
        ip: checkpoint.ip || null,
        zone: checkpoint.zona || null,
        points: checkpoint.pontos,
        reception: String(checkpoint.proposito || 'game').toLowerCase() === 'reception',
        eventoId: checkpoint.eventoId || null,
        eventoNome: evento?.nome || null,
        eventoAtivo: String(evento?.status || '').toLowerCase() === 'active',
      };
    });
    const onlineCount = checkpointItems.filter(checkpoint => checkpoint.status === 'online').length;

    const alerts = [];
    checkpointItems.filter(cp => cp.status !== 'online').forEach(cp => {
      alerts.push({
        id: `cp-${cp.id}`,
        tipo: 'checkpoint_offline',
        gravidade: cp.eventoAtivo ? 'alta' : 'media',
        mensagem: `Checkpoint "${cp.name || cp.id}"${cp.numero ? ` (nº ${cp.numero})` : ''} offline`,
        detalhe: [cp.semSinal, cp.eventoAtivo ? `evento em andamento: ${cp.eventoNome}` : null].filter(Boolean).join(' · '),
        checkpointId: cp.id,
      });
    });
    // Evento em andamento sem nenhum checkpoint online
    const porEvento = new Map();
    checkpointItems.filter(cp => cp.eventoAtivo).forEach(cp => {
      const lista = porEvento.get(cp.eventoId) || { nome: cp.eventoNome, total: 0, online: 0 };
      lista.total += 1;
      if (cp.status === 'online') lista.online += 1;
      porEvento.set(cp.eventoId, lista);
    });
    porEvento.forEach((info, eventoId) => {
      if (info.online === 0) {
        alerts.push({
          id: `ev-${eventoId}`,
          tipo: 'evento_sem_checkpoint',
          gravidade: 'alta',
          mensagem: `Evento "${info.nome}" em andamento sem nenhum checkpoint online`,
          detalhe: `${info.total} checkpoint(s) no evento, todos sem sinal`,
          checkpointId: null,
        });
      }
    });
    if (String(company.status || '').toLowerCase() !== 'active') {
      alerts.push({
        id: `cli-${company.empresaId}`,
        tipo: 'cliente_inativo',
        gravidade: 'media',
        mensagem: `Cliente ${company.status || 'inativo'}`,
        detalhe: 'O acesso do cliente ao sistema está restrito',
        checkpointId: null,
      });
    }
    alerts.sort((x, y) => Number(y.gravidade === 'alta') - Number(x.gravidade === 'alta'));

    // online = todos com sinal; parcial = parte sem sinal; offline = nenhum com sinal; sem_checkpoints = ainda não recebeu
    const situacao = checkpointItems.length === 0
      ? 'sem_checkpoints'
      : onlineCount === checkpointItems.length ? 'online' : onlineCount > 0 ? 'parcial' : 'offline';

    return {
      id: company.empresaId,
      name: company.nome,
      cidade: company.cidade,
      estado: company.estado,
      clienteStatus: company.status,
      status: onlineCount > 0 ? 'online' : 'offline',
      situacao,
      checkpointsActive: onlineCount,
      checkpointsTotal: checkpointItems.length,
      lastEvent: formatEvent(eventsByCompany.get(empresaKey)),
      latency: null,
      uptime: null,
      alerts,
      pontoVerificacao: checkpointItems,
    };
  });

  return units;
}

router.get('/units', verifyToken, requireMaster, async (req, res) => {
  try {
    const units = await loadMonitoringData();
    return res.json(units);
  } catch (err) {
    console.error('❌ Erro ao carregar unidades de monitoramento:', err);
    return res.status(500).json({ error: err.message });
  }
});

router.get('/units/:id', verifyToken, requireMaster, async (req, res) => {
  try {
    const units = await loadMonitoringData();
    const unit = units.find(item => String(item.id) === String(req.params.id));
    if (!unit) return res.status(404).json({ error: 'Unidade não encontrada' });
    return res.json(unit);
  } catch (err) {
    console.error('❌ Erro ao carregar unidade de monitoramento:', err);
    return res.status(500).json({ error: err.message });
  }
});

router.get('/status', verifyToken, requireMaster, async (req, res) => {
  try {
    const units = await loadMonitoringData();
    const onlineUnits = units.filter(unit => unit.situacao === 'online' || unit.situacao === 'parcial').length;
    const offlineUnits = units.filter(unit => unit.situacao === 'offline').length;
    const semCheckpoints = units.filter(unit => unit.situacao === 'sem_checkpoints').length;
    const alerts = units.reduce((total, unit) => total + unit.alerts.length, 0);
    const latencies = units.map(unit => unit.latency).filter(value => Number.isFinite(Number(value)));
    const avgLatency = latencies.length
      ? Math.round(latencies.reduce((sum, value) => sum + Number(value), 0) / latencies.length)
      : null;

    return res.json({
      onlineUnits,
      offlineUnits,
      semCheckpoints,
      totalUnits: units.length,
      totalAlerts: alerts,
      avgLatency,
      checkpointsOnline: units.reduce((total, unit) => total + unit.checkpointsActive, 0),
      checkpointsTotal: units.reduce((total, unit) => total + unit.checkpointsTotal, 0),
    });
  } catch (err) {
    console.error('❌ Erro ao carregar status do monitoramento:', err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
