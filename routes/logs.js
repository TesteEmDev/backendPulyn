// routes/logs.js - Sistema de Logs
const express = require('express');
const router = express.Router();
const { query, allQuery } = require('../database');
const { verifyToken, isMaster } = require('../utils/middleware');
const { listPlatformClients } = require('../utils/platformClients');
const { statusEfetivo } = require('../utils/statusCheckpoint');
const { STATUS } = require('../utils/checkpointTransferencia');

// A tabela `log` quase não recebe escrita (nenhuma rota grava nela por conta própria), então o feed é montado a partir
// do que já fica registrado no banco, com a data em que cada coisa aconteceu:
//   cliente    - clientes cadastrados;
//   evento     - evento criado, iniciado e encerrado (inclusive pelo início/fim automático);
//   checkpoint - cadastro, envio para o buffet, devolução/recusa e checkpoints sem sinal;
//   acesso     - último acesso de cada usuário ao sistema;
//   suporte    - chamados abertos e resolvidos;
//   sistema    - o que for gravado em `log` (POST abaixo).
// Cada linha leva `categoria` e `type` (error | warning | info | sync) para os filtros da tela.

const MOTIVO_DEVOLUCAO = {
  devolvido: 'devolvido pelo buffet',
  recusado: 'recusado pelo buffet',
  cliente_excluido: 'devolvido porque o cliente foi excluído',
};

const TIPOS_VALIDOS = new Set(['error', 'warning', 'info', 'sync']);
// Coluna DATE: o driver devolve um Date à meia-noite local (ou o texto AAAA-MM-DD); mostra só dia/mês/ano
const soData = (valor) => {
  if (valor instanceof Date) return `${String(valor.getDate()).padStart(2, '0')}/${String(valor.getMonth() + 1).padStart(2, '0')}/${valor.getFullYear()}`;
  return String(valor).slice(0, 10).split('-').reverse().join('/');
};
const dataLegivel = (valor) => {
  if (!valor) return '';
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? String(valor) : d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
};

router.get('/', verifyToken, async (req, res) => {
  try {
    const master = isMaster(req);
    const empresaId = req.user.empresaId;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 300, 1), 1000);
    const escopo = (coluna) => (master ? '' : `AND ${coluna} = @empresaId`);

    const [clientRows, ticketRows, eventoRows, checkpointRows, acessoRows, logRows] = await Promise.all([
      master
        ? listPlatformClients().then((list) =>
            list.map((c) => ({ empresaId: c.id, empresa_nome: c.name, dataCriacao: c.createdAt, plano: c.plan ?? null })))
        : allQuery(`
            SELECT empresaId, nome as empresa_nome, dataCriacao, plano
            FROM empresa
            WHERE nome <> 'Master Admin' AND empresaId = @empresaId
          `, { empresaId }),
      allQuery(`
        SELECT ticketId, cliente as empresa_nome, assunto, status, prioridade, criadoEm, atualizadoEm
        FROM chamadoSuport
        WHERE 1=1 ${escopo('empresaId')}
      `, { empresaId }),
      allQuery(`
        SELECT e.eventoId, e.nome, e.data, e.hora, e.duracao, e.status, e.autoInicio, e.autoFim, e.criadoEm, e.iniciadoEm, e.finalizadoEm,
               emp.nome as empresa_nome,
               (SELECT COUNT(*)::int FROM crianca c WHERE c.eventoId = e.eventoId) as participantes
        FROM evento e
        LEFT JOIN empresa emp ON emp.empresaId = e.empresaId
        WHERE e.empresaId IS NOT NULL AND emp.nome <> 'Master Admin' ${escopo('e.empresaId')}
      `, { empresaId }),
      allQuery(`
        SELECT c.checkpointId, c.numCheck, c.nome, c.zona, c.status, c.ultimoVisto, c.proposito, c.statusTransferencia,
               c.criadoEm, c.transferidoEm, c.devolvidoEm, c.devolvidoMotivo, c.devolvidoPorNome, c.macAddress,
               emp.nome as empresa_nome, dest.nome as destino_nome
        FROM pontoVerificacao c
        LEFT JOIN empresa emp ON emp.empresaId = c.empresaId
        LEFT JOIN empresa dest ON dest.empresaId = c.empresaDestinoId
        WHERE (emp.nome IS NULL OR emp.nome <> 'Master Admin')
          ${master ? '' : 'AND (c.empresaId = @empresaId OR c.empresaDestinoId = @empresaId)'}
      `, { empresaId }),
      allQuery(`
        SELECT l.loginId, l.email, l.perfil, l.status, l.ultimoAcesso, emp.nome as empresa_nome
        FROM login l
        LEFT JOIN empresa emp ON emp.empresaId = l.empresaId
        WHERE l.ultimoAcesso IS NOT NULL ${escopo('l.empresaId')}
      `, { empresaId }),
      allQuery(`
        SELECT l.logId, l.tipo, l.mensagem, l.detalhes, l.criadoEm, emp.nome as empresa_nome
        FROM log l
        LEFT JOIN empresa emp ON emp.empresaId = l.empresaId
        WHERE 1=1 ${escopo('l.empresaId')}
      `, { empresaId }),
    ]);

    const agora = Date.now();
    const entradas = [];
    const add = (id, timestamp, cliente, categoria, type, message, details = '') => {
      if (timestamp) entradas.push({ id, timestamp, cliente: cliente || '—', categoria, type, message, details });
    };

    clientRows.forEach((c) => add(`cliente-${c.empresaId}`, c.dataCriacao, c.empresa_nome, 'cliente', 'info',
      `Cliente cadastrado: ${c.empresa_nome}`, c.plano ? `Plano: ${c.plano}` : ''));

    eventoRows.forEach((e) => {
      const resumo = [
        e.data ? `Data prevista: ${soData(e.data)}${e.hora ? ` às ${String(e.hora).slice(0, 5)}` : ''}` : null,
        e.duracao ? `Duração: ${e.duracao} min` : null,
        `Participantes: ${e.participantes ?? 0}`,
      ].filter(Boolean).join('\n');
      add(`evento-criado-${e.eventoId}`, e.criadoEm, e.empresa_nome, 'evento', 'info', `Evento criado: ${e.nome}`, resumo);
      add(`evento-inicio-${e.eventoId}`, e.iniciadoEm, e.empresa_nome, 'evento', 'sync', `Evento iniciado: ${e.nome}`,
        `${e.autoInicio ? 'Início automático ligado' : 'Início manual'}\n${resumo}`);
      add(`evento-fim-${e.eventoId}`, e.finalizadoEm, e.empresa_nome, 'evento', 'sync', `Evento encerrado: ${e.nome}`,
        `${e.autoFim ? 'Encerramento automático ligado' : 'Encerramento manual'}\n${resumo}`);
    });

    checkpointRows.forEach((cp) => {
      const nome = `"${cp.nome || cp.checkpointId}"${cp.numCheck ? ` (nº ${cp.numCheck})` : ''}`;
      const ident = [cp.macAddress ? `MAC: ${cp.macAddress}` : null, cp.zona ? `Zona: ${cp.zona}` : null,
        String(cp.proposito || 'game').toLowerCase() === 'reception' ? 'Recepção' : null].filter(Boolean).join('\n');
      if (master) add(`cp-cadastro-${cp.checkpointId}`, cp.criadoEm, 'Super admin', 'checkpoint', 'info', `Checkpoint cadastrado: ${nome}`, ident);
      if (cp.transferidoEm && cp.statusTransferencia === STATUS.ACEITO) {
        const aceito = cp.statusTransferencia === STATUS.ACEITO;
        add(`cp-envio-${cp.checkpointId}`, cp.transferidoEm, cp.destino_nome || cp.empresa_nome, 'checkpoint', 'sync',
          `Checkpoint ${nome} enviado ao buffet`, `${aceito ? 'Já aceito pelo buffet' : 'Aguardando aceite do buffet'}\n${ident}`);
      }
      if (cp.devolvidoEm) {
        add(`cp-devolucao-${cp.checkpointId}`, cp.devolvidoEm, cp.devolvidoPorNome, 'checkpoint', 'warning',
          `Checkpoint ${nome} ${MOTIVO_DEVOLUCAO[cp.devolvidoMotivo] || 'devolvido'}`, ident);
      }
      // Situação real (pelo último sinal da placa), só de checkpoints que estão num buffet
      if (cp.statusTransferencia === STATUS.ACEITO && statusEfetivo(cp.status, cp.ultimoVisto, agora) === 'offline') {
        const minutos = cp.ultimoVisto ? Math.round((agora - new Date(cp.ultimoVisto).getTime()) / 60000) : null;
        add(`cp-offline-${cp.checkpointId}`, cp.ultimoVisto || cp.criadoEm, cp.empresa_nome || 'Sem empresa', 'checkpoint', 'error',
          `Checkpoint ${nome} está offline`,
          [cp.ultimoVisto ? `Último sinal: ${dataLegivel(cp.ultimoVisto)}` : 'Nunca conectou',
            minutos !== null ? `Sem sinal há ${minutos < 60 ? `${minutos} min` : minutos < 2880 ? `${Math.floor(minutos / 60)} h` : `${Math.floor(minutos / 1440)} dias`}` : null,
            ident].filter(Boolean).join('\n'));
      }
    });

    ticketRows.forEach((t) => {
      const resolvido = String(t.status || '').toLowerCase() === 'resolvido';
      const base = `Prioridade: ${t.prioridade || '—'}\nStatus: ${t.status || '—'}`;
      add(`ticket-${t.ticketId}`, t.criadoEm, t.empresa_nome, 'suporte', resolvido ? 'info' : 'warning', `Ticket de suporte aberto: ${t.assunto}`, base);
      if (resolvido) add(`ticket-resolvido-${t.ticketId}`, t.atualizadoEm, t.empresa_nome, 'suporte', 'info', `Ticket de suporte resolvido: ${t.assunto}`, base);
    });

    acessoRows.forEach((a) => add(`acesso-${a.loginId}`, a.ultimoAcesso, a.empresa_nome, 'acesso',
      String(a.status || '').toLowerCase() === 'active' ? 'info' : 'warning',
      `Acesso ao sistema: ${a.email}`, `Perfil: ${a.perfil || '—'}\nConta: ${a.status || '—'}\nÚltimo acesso registrado`));

    logRows.forEach((l) => add(`log-${l.logId}`, l.criadoEm, l.empresa_nome, 'sistema',
      TIPOS_VALIDOS.has(String(l.tipo || '').toLowerCase()) ? String(l.tipo).toLowerCase() : 'info', l.mensagem || 'Log registrado', l.detalhes || ''));

    const log = entradas
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);

    console.log(`✅ ${log.length} log carregados${master ? ' (master)' : ` para empresa ${empresaId}`}`);
    res.json(log);
  } catch (err) {
    console.error('❌ Erro ao montar log:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/', verifyToken, async (req, res) => {
  try {
    const { tipo, clienteId, eventoId, message, details } = req.body;
    const empresaId = req.user.empresaId;

    await query(
      `INSERT INTO log (tipo, clienteId, eventoId, mensagem, detalhes, empresaId)
       VALUES (@tipo, @clienteId, @eventoId, @message, @details, @empresaId)`,
      { tipo, clienteId, eventoId, message, details, empresaId }
    );

    console.log(`✅ Log registrado para empresa ${empresaId}`);
    res.json({ ok: true });
  } catch (err) {
    console.error('❌ Erro ao registrar log:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
