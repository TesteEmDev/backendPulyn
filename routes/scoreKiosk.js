const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { allQuery, queryOne } = require('../database');
const { verifyToken, requireRole } = require('../utils/middleware');
const { normalizeUid, uidSqlExpression } = require('../utils/uid');
const { getActiveEvent } = require('../utils/eventControl');

const router = express.Router();
const CLOSED_EVENT_STATUSES = new Set(['completed', 'cancelled', 'canceled', 'finished']);

function isOpenEvent(event) {
  return event && !CLOSED_EVENT_STATUSES.has(String(event.status || '').trim().toLowerCase());
}

function rememberScoreKioskReading(reading) {
  if (!global.scoreKioskReadingQueues) global.scoreKioskReadingQueues = new Map();
  const eventKey = String(reading.eventoId || '').trim().toLowerCase();
  if (!eventKey) return;
  const queue = global.scoreKioskReadingQueues.get(eventKey) || [];
  queue.push(reading);
  global.scoreKioskReadingQueues.set(eventKey, queue.slice(-50));
}

router.use(verifyToken, requireRole('kiosk', 'score_kiosk'));

// Leitura enviada pelo Arduino exclusivo do totem de pontuação.
// A recepção continua sendo a única fonte que seleciona o evento operacional.
router.post('/readings', async (req, res) => {
  try {
    const codigo = normalizeUid(req.body?.uid);
    const eventId = String(req.body?.eventId || '').trim();
    if (!codigo || !eventId) {
      return res.status(400).json({ error: 'eventId e uid são obrigatórios' });
    }

    const controlledEvent = await getActiveEvent(req.user.empresaId);
    if (!controlledEvent || String(controlledEvent.id).toLowerCase() !== eventId.toLowerCase()) {
      return res.status(409).json({ error: 'A recepção ainda não selecionou este evento' });
    }

    const event = await queryOne(
      `SELECT eventoId, empresaId, status
       FROM evento
       WHERE eventoId = @eventId AND empresaId = @empresaId`,
      { eventId, empresaId: req.user.empresaId }
    );
    if (!event) return res.status(404).json({ error: 'Evento não encontrado' });
    if (!isOpenEvent(event)) return res.status(409).json({ error: 'Este evento não está aberto' });

    const reading = {
      readingId: uuidv4(),
      braceletCode: codigo,
      timestamp: new Date().toISOString(),
      receivedAt: Date.now(),
      eventoId: event.eventoId,
      source: 'score-kiosk',
    };
    rememberScoreKioskReading(reading);
    if (global.broadcastToEvent) {
      global.broadcastToEvent(event.eventoId, { type: 'NFC_READING_DETECTED', payload: reading });
    }

    res.json({ ok: true, readingId: reading.readingId, eventId: event.eventoId });
  } catch (error) {
    console.error('❌ Score kiosk: erro ao receber leitura do Arduino:', error.message);
    res.status(500).json({ error: 'Não foi possível receber a leitura da pulseira' });
  }
});

router.get('/events/:eventId/score-readings', async (req, res) => {
  try {
    const event = await queryOne(
      `SELECT eventoId, status FROM evento
       WHERE eventoId = @eventId AND empresaId = @empresaId`,
      { eventId: req.params.eventId, empresaId: req.user.empresaId }
    );
    if (!event) return res.status(404).json({ error: 'Evento não encontrado' });
    if (!isOpenEvent(event)) return res.status(409).json({ error: 'Este evento não está aberto' });

    const since = Number(req.query.since || 0);
    const eventKey = String(event.eventoId).trim().toLowerCase();
    const queue = global.scoreKioskReadingQueues?.get(eventKey) || [];
    res.json({ readings: queue.filter(reading => Number(reading.receivedAt || 0) > since) });
  } catch (error) {
    console.error('❌ Score kiosk: erro ao recuperar leitura do Arduino:', error.message);
    res.status(500).json({ error: 'Não foi possível recuperar a leitura' });
  }
});

router.get('/events', async (req, res) => {
  try {
    const events = await allQuery(
      `SELECT eventoId, nome, data, hora, duracao, status
       FROM evento
       WHERE empresaId = @empresaId
         AND LOWER(COALESCE(status, 'scheduled')) NOT IN ('completed', 'cancelled', 'canceled', 'finished')
       ORDER BY data DESC`,
      { empresaId: req.user.empresaId }
    );
    res.json(events || []);
  } catch (error) {
    console.error('❌ Score kiosk: erro ao carregar evento:', error.message);
    res.status(500).json({ error: 'Não foi possível carregar os evento' });
  }
});

router.get('/events/:eventId/reception-readings', async (req, res) => {
  try {
    const event = await queryOne(
      `SELECT eventoId, status FROM evento
       WHERE eventoId = @eventId AND empresaId = @empresaId`,
      { eventId: req.params.eventId, empresaId: req.user.empresaId }
    );
    if (!event) return res.status(404).json({ error: 'Evento não encontrado' });
    if (!isOpenEvent(event)) return res.status(409).json({ error: 'Este evento não está aberto' });

    const since = Number(req.query.since || 0);
    const eventKey = String(event.eventoId).trim().toLowerCase();
    const queue = global.receptionReadingQueues?.get(eventKey) || [];
    res.json({ readings: queue.filter(reading => Number(reading.receivedAt || 0) > since) });
  } catch (error) {
    console.error('❌ Score kiosk: erro ao recuperar leitura:', error.message);
    res.status(500).json({ error: 'Não foi possível recuperar a leitura' });
  }
});

router.get('/events/:eventId/bracelets/:codigo/score', async (req, res) => {
  try {
    const codigo = normalizeUid(req.params.codigo);
    if (!codigo) return res.status(400).json({ error: 'Código da pulseira inválido' });

    const event = await queryOne(
      `SELECT eventoId, empresaId, nome, status
       FROM evento
       WHERE eventoId = @eventId AND empresaId = @empresaId`,
      { eventId: req.params.eventId, empresaId: req.user.empresaId }
    );
    if (!event) return res.status(404).json({ error: 'Evento não encontrado' });
    if (!isOpenEvent(event)) return res.status(409).json({ error: 'Este evento não está aberto' });

    const child = await queryOne(
      `SELECT c.criancaId, c.nome, c.apelido, c.avatar, c.pontos, c.eventoId,
              t.nome AS team_nome, t.cor AS team_color
       FROM pulseira p
       JOIN crianca c ON c.criancaId = p.criancaId
         AND c.empresaId = p.empresaId
         AND c.eventoId = @eventId
         AND ${uidSqlExpression('c.codigoPulseira')} = @codigo
       LEFT JOIN "time" t ON t.timeId = c.timeId
         AND t.eventoId = c.eventoId
         AND t.empresaId = c.empresaId
       WHERE ${uidSqlExpression('p.codigo')} = @codigo
         AND p.empresaId = @empresaId
         AND LOWER(COALESCE(p.status, '')) = 'em_uso'
         AND p.criancaId IS NOT NULL`,
      { codigo, eventId: event.eventoId, empresaId: event.empresaId }
    );
    if (!child) return res.status(404).json({ error: 'Pulseira não vinculada a uma criança deste evento' });

    const scores = await allQuery(
      `SELECT TOP 5 p.pontuacaoId, p.pontos, p.criadoEm,
              cp.nome AS checkpoint_name
       FROM pontuacao p
       LEFT JOIN pontoVerificacao cp ON cp.checkpointId = p.checkpointId
       WHERE p.criancaId = @childId
         AND p.eventoId = @eventId
         AND p.empresaId = @empresaId
       ORDER BY p.criadoEm DESC`,
      { childId: child.criancaId, eventId: event.eventoId, empresaId: event.empresaId }
    );

    res.json({
      child: {
        name: child.apelido || child.nome,
        fullName: child.nome,
        avatar: child.avatar || '👤',
        scores: Number(child.pontos || 0),
        teamName: child.team_name || null,
        teamColor: child.team_color || '#8b5cf6',
      },
      scores: (scores || []).map(score => ({
        id: score.pontuacaoId,
        points: Number(score.pontos || 0),
        checkpointName: score.checkpoint_name || 'Conquista',
        createdAt: score.criadoEm,
      })),
    });
  } catch (error) {
    console.error('❌ Score kiosk: erro ao consultar pontuação:', error.message);
    res.status(500).json({ error: 'Não foi possível consultar a pontuação' });
  }
});

module.exports = router;
