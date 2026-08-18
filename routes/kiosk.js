const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { withTransaction } = require('../database');
const { verifyToken, requireRole } = require('../utils/middleware');
const { normalizeUid, uidSqlExpression } = require('../utils/uid');
const { getAvatarForCreate } = require('../utils/avatar');

const router = express.Router();
const CLOSED_EVENT_STATUSES = new Set(['completed', 'cancelled', 'canceled', 'finished']);

function isOpenEvent(event) {
  return event && !CLOSED_EVENT_STATUSES.has(String(event.status || '').trim().toLowerCase());
}

function httpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function isDuplicateKeyError(error) {
  return error?.code === '23505' || error?.number === 2601 || error?.number === 2627;
}

// O kiosk tem uma superfície de API própria e não recebe acesso às rotas administrativas.
router.use(verifyToken, requireRole('kiosk'));

// Eventos abertos da própria empresa, com somente os campos necessários ao visor.
router.get('/events', async (req, res) => {
  try {
    const events = await require('../database').allQuery(
      `SELECT e.id, e.name, e.date, e.time, e.duration, e.status,
              CASE WHEN EXISTS (
                SELECT 1
                FROM checkpoints c
                WHERE c.evento_id = e.id
                  AND LOWER(COALESCE(c.checkpoint_purpose, 'game')) = 'reception'
              ) THEN 1 ELSE 0 END AS has_reception_checkpoint
       FROM eventos e
       WHERE e.empresa_id = @empresaId
         AND LOWER(COALESCE(e.status, 'scheduled')) NOT IN ('completed', 'cancelled', 'canceled', 'finished')
       ORDER BY e.date DESC`,
      { empresaId: req.user.empresa_id }
    );
    res.json(events || []);
  } catch (error) {
    console.error('❌ Kiosk: erro ao carregar eventos:', error.message);
    res.status(500).json({ error: 'Não foi possível carregar os eventos' });
  }
});

// Recupera leituras recentes caso o navegador perca o broadcast WebSocket.
// A fila é somente do processo atual e fica limitada às leituras recentes.
router.get('/events/:eventId/reception-readings', async (req, res) => {
  try {
    const { queryOne } = require('../database');
    const event = await queryOne(
      `SELECT id, empresa_id, status FROM eventos
       WHERE id = @eventId AND empresa_id = @empresaId`,
      { eventId: req.params.eventId, empresaId: req.user.empresa_id }
    );
    if (!event) return res.status(404).json({ error: 'Evento não encontrado' });
    if (!isOpenEvent(event)) return res.status(409).json({ error: 'Este evento não está aberto' });

    const since = Number(req.query.since || 0);
    const eventKey = String(event.id).trim().toLowerCase();
    const queue = global.receptionReadingQueues?.get(eventKey) || [];
    const readings = queue.filter(reading => Number(reading.receivedAt || 0) > since);
    res.json({ readings });
  } catch (error) {
    console.error('❌ Kiosk: erro ao recuperar leitura de recepção:', error.message);
    res.status(500).json({ error: 'Não foi possível recuperar a leitura' });
  }
});

// Times do evento selecionado, sempre limitados ao tenant do token.
router.get('/events/:eventId/teams', async (req, res) => {
  try {
    const { queryOne, allQuery } = require('../database');
    const event = await queryOne(
      `SELECT id, empresa_id, status FROM eventos
       WHERE id = @eventId AND empresa_id = @empresaId`,
      { eventId: req.params.eventId, empresaId: req.user.empresa_id }
    );
    if (!event) return res.status(404).json({ error: 'Evento não encontrado' });
    if (!isOpenEvent(event)) return res.status(409).json({ error: 'Este evento não está aberto para cadastro' });

    const teams = await allQuery(
      `SELECT id, name, color, points
       FROM times
       WHERE evento_id = @eventId AND empresa_id = @empresaId
       ORDER BY name`,
      { eventId: event.id, empresaId: req.user.empresa_id }
    );
    res.json(teams || []);
  } catch (error) {
    console.error('❌ Kiosk: erro ao carregar times:', error.message);
    res.status(500).json({ error: 'Não foi possível carregar os times' });
  }
});

// Consulta mínima de uma pulseira; não expõe inventário ou dados de crianças.
router.get('/bracelets/:code', async (req, res) => {
  try {
    const code = normalizeUid(req.params.code);
    if (!code) return res.status(400).json({ error: 'Código da pulseira inválido' });

    const { queryOne } = require('../database');
    const bracelet = await queryOne(
      `SELECT code, status, crianca_id, empresa_id
       FROM pulseiras
       WHERE ${uidSqlExpression('code')} = @code`,
      { code }
    );

    if (!bracelet) {
      return res.json({ code, exists: false, status: null, available: true });
    }
    if (String(bracelet.empresa_id).trim().toLowerCase() !== String(req.user.empresa_id).trim().toLowerCase()) {
      return res.status(403).json({ error: 'Esta pulseira não pertence a esta empresa' });
    }

    const available = String(bracelet.status || '').toLowerCase() === 'disponivel' && !bracelet.crianca_id;
    res.json({ code: bracelet.code, exists: true, status: bracelet.status, available });
  } catch (error) {
    console.error('❌ Kiosk: erro ao consultar pulseira:', error.message);
    res.status(500).json({ error: 'Não foi possível verificar a pulseira' });
  }
});

// Cadastro atômico: cria (se necessário) e vincula a pulseira junto com a criança.
router.post('/participants', async (req, res) => {
  try {
    const { eventId, name, nickname, age, avatar, braceletCode, timeId } = req.body || {};
    const code = normalizeUid(braceletCode);
    const cleanName = String(name || '').trim();
    const avatarValue = getAvatarForCreate(avatar);

    if (!avatarValue) {
      return res.status(400).json({ error: 'Avatar inválido' });
    }

    if (!eventId || !cleanName || !code || !timeId) {
      return res.status(400).json({ error: 'Evento, nome, time e pulseira são obrigatórios' });
    }
    if (cleanName.length > 100 || String(nickname || '').trim().length > 100) {
      return res.status(400).json({ error: 'Nome ou apelido excede o limite permitido' });
    }

    const participant = await withTransaction(async (tx) => {
      const event = await tx.queryOne(
        `SELECT id, empresa_id, status FROM eventos
         WHERE id = @eventId AND empresa_id = @empresaId`,
        { eventId, empresaId: req.user.empresa_id }
      );
      if (!event) throw httpError('Evento não encontrado', 404);
      if (!isOpenEvent(event)) throw httpError('Este evento não está aberto para cadastro', 409);

      const team = await tx.queryOne(
        `SELECT id, name FROM times
         WHERE id = @timeId AND evento_id = @eventId AND empresa_id = @empresaId`,
        { timeId, eventId, empresaId: event.empresa_id }
      );
      if (!team) throw httpError('Time não pertence ao evento selecionado', 400);

      let bracelet = await tx.queryOne(
        `SELECT code, status, crianca_id, empresa_id
         FROM pulseiras
         WHERE ${uidSqlExpression('code')} = @code`,
        { code }
      );

      if (bracelet && String(bracelet.empresa_id).trim().toLowerCase() !== String(event.empresa_id).trim().toLowerCase()) {
        throw httpError('Esta pulseira pertence a outra empresa', 403);
      }
      if (!bracelet) {
        await tx.query(
          `INSERT INTO pulseiras (code, status, empresa_id, created_at)
           VALUES (@code, 'disponivel', @empresaId, GETDATE())`,
          { code, empresaId: event.empresa_id }
        );
        bracelet = { code, status: 'disponivel', crianca_id: null, empresa_id: event.empresa_id };
      }

      if (String(bracelet.status || '').toLowerCase() !== 'disponivel' || bracelet.crianca_id) {
        throw httpError('Esta pulseira não está disponível para vínculo', 409);
      }

      const childId = uuidv4();
      await tx.query(
        `INSERT INTO criancas
          (id, evento_id, empresa_id, time_id, name, nickname, age, avatar, bracelet_code, scores)
         VALUES (@id, @eventId, @empresaId, @timeId, @name, @nickname, @age, @avatar, @code, 0)`,
        {
          id: childId,
          eventId: event.id,
          empresaId: event.empresa_id,
          timeId,
          name: cleanName,
          nickname: String(nickname || '').trim() || cleanName.split(/\s+/)[0],
          age: Math.max(0, Math.min(18, Number.parseInt(age, 10) || 5)),
          avatar: avatarValue,
          code,
        }
      );

      const braceletUpdate = await tx.query(
        `UPDATE pulseiras
         SET status = 'em_uso', crianca_id = @childId
         WHERE ${uidSqlExpression('code')} = @code
           AND empresa_id = @empresaId
           AND status = 'disponivel'
           AND crianca_id IS NULL`,
        { code, childId, empresaId: event.empresa_id }
      );
      if ((braceletUpdate.rowsAffected?.[0] || 0) === 0) {
        throw httpError('Esta pulseira acabou de ser vinculada. Aproxime outra pulseira', 409);
      }

      return {
        id: childId,
        name: cleanName,
        nickname: String(nickname || '').trim() || cleanName.split(/\s+/)[0],
        age: Math.max(0, Math.min(18, Number.parseInt(age, 10) || 5)),
        avatar: avatarValue,
        braceletCode: code,
        timeId: team.id,
        teamName: team.name,
        scores: 0,
      };
    });

    res.status(201).json(participant);
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    if (isDuplicateKeyError(error)) return res.status(409).json({ error: 'Esta pulseira já foi cadastrada. Aproxime-a novamente para atualizar o estado.' });
    console.error('❌ Kiosk: erro ao cadastrar participante:', error.message);
    res.status(500).json({ error: 'Não foi possível concluir o cadastro' });
  }
});

module.exports = router;
