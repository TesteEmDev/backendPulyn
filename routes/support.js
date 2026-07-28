// routes/support.js - Tickets persistidos do suporte master
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();
const { query, queryOne, allQuery, DB_DRIVER } = require('../database');
const { verifyToken, isMaster } = require('../utils/middleware');

const VALID_STATUSES = new Set(['aberto', 'em_andamento', 'resolvido']);
const VALID_PRIORITIES = new Set(['alta', 'media', 'baixa']);
let supportTableReady;

function requireMaster(req, res, next) {
  if (!isMaster(req)) {
    return res.status(403).json({ error: 'Acesso negado: apenas master pode gerenciar tickets' });
  }
  return next();
}

async function ensureSupportTable() {
  if (supportTableReady) return supportTableReady;
  supportTableReady = (async () => {
    if (DB_DRIVER === 'postgres' || DB_DRIVER === 'postgresql') {
      await query(`
        CREATE TABLE IF NOT EXISTS support_tickets (
          id varchar(36) PRIMARY KEY,
          empresa_id varchar(36),
          client varchar(255) NOT NULL,
          subject varchar(255) NOT NULL,
          status varchar(20) NOT NULL DEFAULT 'aberto',
          priority varchar(20) NOT NULL DEFAULT 'media',
          description text,
          assignee varchar(255),
          created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
    } else {
      await query(`
        IF OBJECT_ID('dbo.support_tickets', 'U') IS NULL
        BEGIN
          CREATE TABLE support_tickets (
            id varchar(36) NOT NULL PRIMARY KEY,
            empresa_id varchar(36) NULL,
            client varchar(255) NOT NULL,
            subject varchar(255) NOT NULL,
            status varchar(20) NOT NULL DEFAULT 'aberto',
            priority varchar(20) NOT NULL DEFAULT 'media',
            description nvarchar(max) NULL,
            assignee varchar(255) NULL,
            created_at datetime2 NOT NULL DEFAULT GETDATE(),
            updated_at datetime2 NOT NULL DEFAULT GETDATE()
          )
        END
      `);
    }
  })().catch(err => {
    supportTableReady = null;
    throw err;
  });
  return supportTableReady;
}

function serializeTicket(ticket) {
  if (!ticket) return null;
  return {
    id: ticket.id,
    empresa_id: ticket.empresa_id || null,
    client: ticket.client,
    subject: ticket.subject,
    status: ticket.status,
    priority: ticket.priority,
    description: ticket.description || '',
    assignee: ticket.assignee || 'Atribuir',
    date: ticket.created_at,
    createdAt: ticket.created_at,
    updatedAt: ticket.updated_at,
  };
}

function parseLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 100;
  return Math.min(Math.max(parsed, 1), 500);
}

router.get('/stats', verifyToken, requireMaster, async (req, res) => {
  try {
    await ensureSupportTable();
    const stats = await queryOne(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'aberto' THEN 1 ELSE 0 END) as open_count,
        SUM(CASE WHEN status = 'em_andamento' THEN 1 ELSE 0 END) as in_progress_count,
        SUM(CASE WHEN status = 'resolvido' THEN 1 ELSE 0 END) as resolved_count
      FROM support_tickets
    `);
    const open = Number(stats?.open_count || 0);
    const inProgress = Number(stats?.in_progress_count || 0);
    const resolved = Number(stats?.resolved_count || 0);
    return res.json({
      total: Number(stats?.total || 0),
      open,
      inProgress,
      resolved,
      abertos: open,
      em_andamento: inProgress,
      resolvidos: resolved,
    });
  } catch (err) {
    console.error('❌ Erro ao consultar estatísticas de tickets:', err);
    return res.status(500).json({ error: err.message });
  }
});

router.get('/', verifyToken, requireMaster, async (req, res) => {
  try {
    await ensureSupportTable();
    const tickets = await allQuery(`
      SELECT TOP (@limit)
        id, empresa_id, client, subject, status, priority, description,
        assignee, created_at, updated_at
      FROM support_tickets
      ORDER BY created_at DESC
    `, { limit: parseLimit(req.query.limit) });
    return res.json(tickets.map(serializeTicket));
  } catch (err) {
    console.error('❌ Erro ao consultar tickets:', err);
    return res.status(500).json({ error: err.message });
  }
});

router.post('/', verifyToken, requireMaster, async (req, res) => {
  try {
    await ensureSupportTable();
    const { client, subject, priority, description, assignee, empresa_id } = req.body || {};
    if (!String(client || '').trim() || !String(subject || '').trim()) {
      return res.status(400).json({ error: 'client e subject são obrigatórios' });
    }
    const normalizedPriority = String(priority || 'media').toLowerCase();
    if (!VALID_PRIORITIES.has(normalizedPriority)) {
      return res.status(400).json({ error: 'priority inválida' });
    }

    const id = uuidv4();
    await query(`
      INSERT INTO support_tickets
        (id, empresa_id, client, subject, status, priority, description, assignee)
      VALUES
        (@id, @empresa_id, @client, @subject, @status, @priority, @description, @assignee)
    `, {
      id,
      empresa_id: empresa_id || null,
      client: String(client).trim(),
      subject: String(subject).trim(),
      status: 'aberto',
      priority: normalizedPriority,
      description: description ? String(description) : null,
      assignee: assignee ? String(assignee) : 'Atribuir',
    });

    const ticket = await queryOne('SELECT * FROM support_tickets WHERE id = @id', { id });
    return res.status(201).json(serializeTicket(ticket));
  } catch (err) {
    console.error('❌ Erro ao criar ticket:', err);
    return res.status(500).json({ error: err.message });
  }
});

router.put('/:id/status', verifyToken, requireMaster, async (req, res) => {
  try {
    await ensureSupportTable();
    const status = String(req.body?.status || '').toLowerCase();
    if (!VALID_STATUSES.has(status)) {
      return res.status(400).json({ error: 'status inválido' });
    }

    const existing = await queryOne('SELECT id FROM support_tickets WHERE id = @id', { id: req.params.id });
    if (!existing) return res.status(404).json({ error: 'Ticket não encontrado' });

    await query(`
      UPDATE support_tickets
      SET status = @status, updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `, { id: req.params.id, status });
    const ticket = await queryOne('SELECT * FROM support_tickets WHERE id = @id', { id: req.params.id });
    return res.json(serializeTicket(ticket));
  } catch (err) {
    console.error('❌ Erro ao atualizar status do ticket:', err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
