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
  return error?.codigo === '23505' || error?.number === 2601 || error?.number === 2627;
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
                WHERE c.eventoId = e.id
                  AND LOWER(COALESCE(c.propositoCheckpoint, 'game')) = 'reception'
              ) THEN 1 ELSE 0 END AS has_reception_checkpoint
       FROM eventos e
       WHERE e.empresaId = @empresaId
         AND LOWER(COALESCE(e.status, 'scheduled')) NOT IN ('completed', 'cancelled', 'canceled', 'finished')
       ORDER BY e.date DESC`,
      { empresaId: req.user.empresaId }
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
      `SELECT id, empresaId, status FROM eventos
       WHERE id = @eventId AND empresaId = @empresaId`,
      { eventId: req.params.eventId, empresaId: req.user.empresaId }
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
      `SELECT id, empresaId, status FROM eventos
       WHERE id = @eventId AND empresaId = @empresaId`,
      { eventId: req.params.eventId, empresaId: req.user.empresaId }
    );
    if (!event) return res.status(404).json({ error: 'Evento não encontrado' });
    if (!isOpenEvent(event)) return res.status(409).json({ error: 'Este evento não está aberto para cadastro' });

    const teams = await allQuery(
      `SELECT id, name, color, points
       FROM times
       WHERE eventoId = @eventId AND empresaId = @empresaId
       ORDER BY name`,
      { eventId: event.id, empresaId: req.user.empresaId }
    );
    res.json(teams || []);
  } catch (error) {
    console.error('❌ Kiosk: erro ao carregar times:', error.message);
    res.status(500).json({ error: 'Não foi possível carregar os times' });
  }
});

// Consulta mínima de uma pulseira; não expõe inventário ou dados de crianças.
router.get('/bracelets/:codigo', async (req, res) => {
  try {
    const codigo = normalizeUid(req.params.codigo);
    if (!codigo) return res.status(400).json({ error: 'Código da pulseira inválido' });

    const { queryOne } = require('../database');
    const bracelet = await queryOne(
      `SELECT codigo, status, criancaId, empresaId
       FROM pulseiras
       WHERE ${uidSqlExpression('codigo')} = @codigo`,
      { codigo }
    );

    if (!bracelet) {
      return res.json({ codigo, exists: false, status: null, available: true });
    }
    if (String(bracelet.empresaId).trim().toLowerCase() !== String(req.user.empresaId).trim().toLowerCase()) {
      return res.status(403).json({ error: 'Esta pulseira não pertence a esta empresa' });
    }

    const available = String(bracelet.status || '').toLowerCase() === 'disponivel' && !bracelet.criancaId;
    res.json({ codigo: bracelet.codigo, exists: true, status: bracelet.status, available });
  } catch (error) {
    console.error('❌ Kiosk: erro ao consultar pulseira:', error.message);
    res.status(500).json({ error: 'Não foi possível verificar a pulseira' });
  }
});

// Cadastro atômico: cria (se necessário) e vincula a pulseira junto com a criança.
router.post('/participants', async (req, res) => {
  try {
    const { eventId, name, nickname, age, avatar, braceletCode, timeId } = req.body || {};
    const codigo = normalizeUid(braceletCode);
    const cleanName = String(name || '').trim();
    const avatarValue = getAvatarForCreate(avatar);

    if (!avatarValue) {
      return res.status(400).json({ error: 'Avatar inválido' });
    }

    // O time é opcional: o recreacionista define (ou sorteia) os times depois do cadastro.
    if (!eventId || !cleanName || !codigo) {
      return res.status(400).json({ error: 'Evento, nome e pulseira são obrigatórios' });
    }
    if (cleanName.length > 100 || String(nickname || '').trim().length > 100) {
      return res.status(400).json({ error: 'Nome ou apelido excede o limite permitido' });
    }

    const participant = await withTransaction(async (tx) => {
      const event = await tx.queryOne(
        `SELECT id, empresaId, status FROM eventos
         WHERE id = @eventId AND empresaId = @empresaId`,
        { eventId, empresaId: req.user.empresaId }
      );
      if (!event) throw httpError('Evento não encontrado', 404);
      if (!isOpenEvent(event)) throw httpError('Este evento não está aberto para cadastro', 409);

      let team = null;
      if (timeId) {
        team = await tx.queryOne(
          `SELECT id, name FROM times
           WHERE id = @timeId AND eventoId = @eventId AND empresaId = @empresaId`,
          { timeId, eventId, empresaId: event.empresaId }
        );
        if (!team) throw httpError('Time não pertence ao evento selecionado', 400);
      }

      let bracelet = await tx.queryOne(
        `SELECT codigo, status, criancaId, empresaId
         FROM pulseiras
         WHERE ${uidSqlExpression('codigo')} = @codigo`,
        { codigo }
      );

      if (bracelet && String(bracelet.empresaId).trim().toLowerCase() !== String(event.empresaId).trim().toLowerCase()) {
        throw httpError('Esta pulseira pertence a outra empresa', 403);
      }
      if (!bracelet) {
        await tx.query(
          `INSERT INTO pulseiras (codigo, status, empresaId, criadoEm)
           VALUES (@codigo, 'disponivel', @empresaId, GETDATE())`,
          { codigo, empresaId: event.empresaId }
        );
        bracelet = { codigo, status: 'disponivel', criancaId: null, empresaId: event.empresaId };
      }

      if (String(bracelet.status || '').toLowerCase() !== 'disponivel' || bracelet.criancaId) {
        throw httpError('Esta pulseira não está disponível para vínculo', 409);
      }

      const childId = uuidv4();
      await tx.query(
        `INSERT INTO criancas
          (id, eventoId, empresaId, timeId, name, nickname, age, avatar, codigoPulseira, scores)
         VALUES (@id, @eventId, @empresaId, @timeId, @name, @nickname, @age, @avatar, @codigo, 0)`,
        {
          id: childId,
          eventId: event.id,
          empresaId: event.empresaId,
          timeId: team ? team.id : null,
          name: cleanName,
          nickname: String(nickname || '').trim() || cleanName.split(/\s+/)[0],
          age: Math.max(0, Math.min(18, Number.parseInt(age, 10) || 5)),
          avatar: avatarValue,
          codigo,
        }
      );

      const braceletUpdate = await tx.query(
        `UPDATE pulseiras
         SET status = 'em_uso', criancaId = @childId
         WHERE ${uidSqlExpression('codigo')} = @codigo
           AND empresaId = @empresaId
           AND status = 'disponivel'
           AND criancaId IS NULL`,
        { codigo, childId, empresaId: event.empresaId }
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
        braceletCode: codigo,
        timeId: team ? team.id : null,
        teamName: team ? team.name : null,
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
