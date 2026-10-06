// routes/messages.js - Mensagens persistidas do telão por evento
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();
const { query, queryOne, allQuery } = require('../database');
const { verifyToken, isMaster } = require('../utils/middleware');

const READ_ROLES = new Set(['admin', 'reception', 'game_master', 'display', 'master']);
const WRITE_ROLES = new Set(['admin', 'game_master', 'master']);
const MESSAGE_TYPES = new Set(['preset', 'custom']);

function requireRole(roles) {
  return (req, res, next) => {
    if (!roles.has(req.user?.role)) {
      return res.status(403).json({ error: 'Acesso negado para este perfil' });
    }
    return next();
  };
}

async function getEventForUser(req, eventoId) {
  const event = await queryOne(
    'SELECT id, empresaId FROM eventos WHERE id = @id',
    { id: eventoId }
  );
  if (!event) return null;
  if (!isMaster(req) && String(event.empresaId) !== String(req.user.empresaId)) {
    return false;
  }
  return event;
}

function serializeMessage(message) {
  return {
    id: message.id,
    eventoId: message.eventoId,
    texto: message.texto,
    type: message.type,
    remetente: message.remetente || null,
    timestamp: message.enviadoEm,
    enviadoEm: message.enviadoEm,
  };
}

router.get('/eventos/:eventoId', verifyToken, requireRole(READ_ROLES), async (req, res) => {
  try {
    const event = await getEventForUser(req, req.params.eventoId);
    if (event === null) return res.status(404).json({ error: 'Evento não encontrado' });
    if (event === false) return res.status(403).json({ error: 'Acesso negado ao evento' });

    const rawLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 50;
    const messages = await allQuery(`
      SELECT TOP (@limit) id, eventoId, texto, type, remetente, enviadoEm
      FROM mensagens_display
      WHERE eventoId = @eventoId
      ORDER BY enviadoEm DESC
    `, { eventoId: req.params.eventoId, limit });
    return res.json(messages.map(serializeMessage));
  } catch (err) {
    console.error('❌ Erro ao consultar mensagens do display:', err);
    return res.status(500).json({ error: err.message });
  }
});

router.post('/eventos/:eventoId', verifyToken, requireRole(WRITE_ROLES), async (req, res) => {
  try {
    const event = await getEventForUser(req, req.params.eventoId);
    if (event === null) return res.status(404).json({ error: 'Evento não encontrado' });
    if (event === false) return res.status(403).json({ error: 'Acesso negado ao evento' });

    const texto = String(req.body?.texto || '').trim();
    const type = String(req.body?.type || 'custom').toLowerCase();
    if (!texto) return res.status(400).json({ error: 'texto é obrigatório' });
    if (texto.length > 500) return res.status(400).json({ error: 'texto excede 500 caracteres' });
    if (!MESSAGE_TYPES.has(type)) return res.status(400).json({ error: 'type inválido' });

    const messageId = uuidv4();
    await query(`
      INSERT INTO mensagens_display (id, eventoId, texto, type, remetente, enviadoEm)
      VALUES (@id, @eventoId, @texto, @type, @remetente, CURRENT_TIMESTAMP)
    `, {
      id: messageId,
      eventoId: req.params.eventoId,
      texto,
      type,
      remetente: req.user.email || req.user.id || null,
    });

    const message = await queryOne(
      'SELECT id, eventoId, texto, type, remetente, enviadoEm FROM mensagens_display WHERE id = @id',
      { id: messageId }
    );
    const serialized = serializeMessage(message);
    const broadcastPayload = {
      type: 'DISPLAY_MESSAGE',
      payload: serialized,
      timestamp: new Date().toISOString(),
    };
    if (typeof global.broadcastToEvent === 'function') {
      global.broadcastToEvent(req.params.eventoId, broadcastPayload);
    }

    return res.status(201).json(serialized);
  } catch (err) {
    console.error('❌ Erro ao criar mensagem do display:', err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
