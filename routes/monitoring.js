// routes/monitoring.js - Monitoramento derivado do estado real do banco
const express = require('express');
const router = express.Router();
const { allQuery } = require('../database');
const { verifyToken, isMaster } = require('../utils/middleware');

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

async function loadMonitoringData() {
  const [companies, pontoVerificacao, events] = await Promise.all([
    allQuery(`
      SELECT empresaId, nome, cidade, estado, status
      FROM empresa
      WHERE nome <> @masterName
      ORDER BY nome
    `, { masterName: 'Master Admin' }),
    allQuery(`
      SELECT checkpointId, eventoId, empresaId, nome, status, ultimoVisto, ip, zona, pontos
      FROM pontoVerificacao
      WHERE LOWER(COALESCE(proposito, 'game')) <> 'reception'
    `),
    allQuery(`
      SELECT eventoId, empresaId, nome, [data] AS event_date, [hora] AS event_time, criadoEm
      FROM evento
      WHERE empresaId IS NOT NULL
    `),
  ]);

  const eventById = new Map(events.map(event => [String(event.eventoId), event]));
  const checkpointsByCompany = new Map();
  pontoVerificacao.forEach(checkpoint => {
    const event = eventById.get(String(checkpoint.eventoId));
    const companyId = checkpoint.empresaId || event?.empresaId;
    if (!companyId) return;
    const key = String(companyId);
    if (!checkpointsByCompany.has(key)) checkpointsByCompany.set(key, []);
    checkpointsByCompany.get(key).push({ ...checkpoint, event });
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

  const staleLimit = Date.now() - (5 * 60 * 1000);
  const units = companies.map(company => {
    const companyCheckpoints = checkpointsByCompany.get(String(company.empresaId)) || [];
    const checkpointItems = companyCheckpoints.map(checkpoint => {
      const lastSeen = asDate(checkpoint.ultimoVisto);
      const statusValue = String(checkpoint.status || '').toLowerCase();
      const online = statusValue === 'online' && (!lastSeen || lastSeen.getTime() >= staleLimit);
      return {
        id: checkpoint.checkpointId,
        name: checkpoint.nome,
        status: online ? 'online' : 'offline',
        lastSeen: checkpoint.ultimoVisto || null,
        ip: checkpoint.ip || null,
        zone: checkpoint.zona || null,
        points: checkpoint.pontos,
      };
    });
    const onlineCount = checkpointItems.filter(checkpoint => checkpoint.status === 'online').length;
    const alerts = checkpointItems
      .filter(checkpoint => checkpoint.status !== 'online')
      .map(checkpoint => `${checkpoint.name || checkpoint.id} offline`);
    if (checkpointItems.length === 0) alerts.push('Nenhum checkpoint cadastrado');
    if (String(company.status || '').toLowerCase() !== 'active') alerts.push(`Empresa ${company.status || 'inativa'}`);

    return {
      id: company.empresaId,
      name: company.nome,
      cidade: company.cidade,
      estado: company.estado,
      status: onlineCount > 0 ? 'online' : 'offline',
      checkpointsActive: onlineCount,
      checkpointsTotal: checkpointItems.length,
      lastEvent: formatEvent(eventsByCompany.get(String(company.empresaId))),
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
    const onlineUnits = units.filter(unit => unit.status === 'online').length;
    const offlineUnits = units.length - onlineUnits;
    const alerts = units.reduce((total, unit) => total + unit.alerts.length, 0);
    const latencies = units.map(unit => unit.latency).filter(value => Number.isFinite(Number(value)));
    const avgLatency = latencies.length
      ? Math.round(latencies.reduce((sum, value) => sum + Number(value), 0) / latencies.length)
      : null;

    return res.json({
      onlineUnits,
      offlineUnits,
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
