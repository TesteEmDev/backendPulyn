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
    const code = normalizeUid(req.body?.uid);
    const eventId = String(req.body?.eventId || '').trim();
    if (!code || !eventId) {
      return res.status(400).json({ error: 'eventId e uid são obrigatórios' });
    }

    const controlledEvent = await getActiveEvent(req.user.empresa_id);
    if (!controlledEvent || String(controlledEvent.id).toLowerCase() !== eventId.toLowerCase()) {
      return res.status(409).json({ error: 'A recepção ainda não selecionou este evento' });
    }

    const event = await queryOne(
      `SELECT id, empresa_id, status
       FROM eventos
       WHERE id = @eventId AND empresa_id = @empresaId`,
      { eventId, empresaId: req.user.empresa_id }
    );
    if (!event) return res.status(404).json({ error: 'Evento não encontrado' });
    if (!isOpenEvent(event)) return res.status(409).json({ error: 'Este evento não está aberto' });

    const reading = {
      readingId: uuidv4(),
      braceletCode: code,
      timestamp: new Date().toISOString(),
      receivedAt: Date.now(),
      eventoId: event.id,
      source: 'score-kiosk',
    };
    rememberScoreKioskReading(reading);
    if (global.broadcastToEvent) {
      global.broadcastToEvent(event.id, { type: 'NFC_READING_DETECTED', payload: reading });
    }

    res.json({ ok: true, readingId: reading.readingId, eventId: event.id });
  } catch (error) {
    console.error('❌ Score kiosk: erro ao receber leitura do Arduino:', error.message);
    res.status(500).json({ error: 'Não foi possível receber a leitura da pulseira' });
  }
});

router.get('/events/:eventId/score-readings', async (req, res) => {
  try {
    const event = await queryOne(
      `SELECT id, status FROM eventos
       WHERE id = @eventId AND empresa_id = @empresaId`,
      { eventId: req.params.eventId, empresaId: req.user.empresa_id }
    );
    if (!event) return res.status(404).json({ error: 'Evento não encontrado' });
    if (!isOpenEvent(event)) return res.status(409).json({ error: 'Este evento não está aberto' });

    const since = Number(req.query.since || 0);
    const eventKey = String(event.id).trim().toLowerCase();
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
      `SELECT id, name, date, time, duration, status
       FROM eventos
       WHERE empresa_id = @empresaId
         AND LOWER(COALESCE(status, 'scheduled')) NOT IN ('completed', 'cancelled', 'canceled', 'finished')
       ORDER BY date DESC`,
      { empresaId: req.user.empresa_id }
    );
    res.json(events || []);
  } catch (error) {
    console.error('❌ Score kiosk: erro ao carregar eventos:', error.message);
    res.status(500).json({ error: 'Não foi possível carregar os eventos' });
  }
});

router.get('/events/:eventId/reception-readings', async (req, res) => {
  try {
    const event = await queryOne(
      `SELECT id, status FROM eventos
       WHERE id = @eventId AND empresa_id = @empresaId`,
      { eventId: req.params.eventId, empresaId: req.user.empresa_id }
    );
    if (!event) return res.status(404).json({ error: 'Evento não encontrado' });
    if (!isOpenEvent(event)) return res.status(409).json({ error: 'Este evento não está aberto' });

    const since = Number(req.query.since || 0);
    const eventKey = String(event.id).trim().toLowerCase();
    const queue = global.receptionReadingQueues?.get(eventKey) || [];
    res.json({ readings: queue.filter(reading => Number(reading.receivedAt || 0) > since) });
  } catch (error) {
    console.error('❌ Score kiosk: erro ao recuperar leitura:', error.message);
    res.status(500).json({ error: 'Não foi possível recuperar a leitura' });
  }
});

router.get('/events/:eventId/bracelets/:code/score', async (req, res) => {
  try {
    const code = normalizeUid(req.params.code);
    if (!code) return res.status(400).json({ error: 'Código da pulseira inválido' });

    const event = await queryOne(
      `SELECT id, empresa_id, name, status
       FROM eventos
       WHERE id = @eventId AND empresa_id = @empresaId`,
      { eventId: req.params.eventId, empresaId: req.user.empresa_id }
    );
    if (!event) return res.status(404).json({ error: 'Evento não encontrado' });
    if (!isOpenEvent(event)) return res.status(409).json({ error: 'Este evento não está aberto' });

    const child = await queryOne(
      `SELECT c.id, c.name, c.nickname, c.avatar, c.scores, c.evento_id,
              t.name AS team_name, t.color AS team_color
       FROM pulseiras p
       JOIN criancas c ON c.id = p.crianca_id
         AND c.empresa_id = p.empresa_id
         AND c.evento_id = @eventId
         AND ${uidSqlExpression('c.bracelet_code')} = @code
       LEFT JOIN times t ON t.id = c.time_id
         AND t.evento_id = c.evento_id
         AND t.empresa_id = c.empresa_id
       WHERE ${uidSqlExpression('p.code')} = @code
         AND p.empresa_id = @empresaId
         AND LOWER(COALESCE(p.status, '')) = 'em_uso'
         AND p.crianca_id IS NOT NULL`,
      { code, eventId: event.id, empresaId: event.empresa_id }
    );
    if (!child) return res.status(404).json({ error: 'Pulseira não vinculada a uma criança deste evento' });

    const scores = await allQuery(
      `SELECT TOP 5 p.id, p.points, p.created_at,
              cp.name AS checkpoint_name
       FROM pontuacoes p
       LEFT JOIN checkpoints cp ON cp.id = p.checkpoint_id
       WHERE p.crianca_id = @childId
         AND p.evento_id = @eventId
         AND p.empresa_id = @empresaId
       ORDER BY p.created_at DESC`,
      { childId: child.id, eventId: event.id, empresaId: event.empresa_id }
    );

    res.json({
      child: {
        name: child.nickname || child.name,
        fullName: child.name,
        avatar: child.avatar || '👤',
        scores: Number(child.scores || 0),
        teamName: child.team_name || null,
        teamColor: child.team_color || '#8b5cf6',
      },
      scores: (scores || []).map(score => ({
        id: score.id,
        points: Number(score.points || 0),
        checkpointName: score.checkpoint_name || 'Conquista',
        createdAt: score.created_at,
      })),
    });
  } catch (error) {
    console.error('❌ Score kiosk: erro ao consultar pontuação:', error.message);
    res.status(500).json({ error: 'Não foi possível consultar a pontuação' });
  }
});

module.exports = router;
