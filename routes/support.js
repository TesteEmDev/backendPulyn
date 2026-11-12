// routes/support.js - Tickets persistidos do suporte master
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();
const { query, queryOne, allQuery, DB_DRIVER } = require('../database');
const { verifyToken, isMaster, requireRole } = require('../utils/middleware');

const VALID_STATUSES = new Set(['aberto', 'em_andamento', 'resolvido']);
const VALID_PRIORITIES = new Set(['alta', 'media', 'baixa']);
let supportTableReady;

// Tipos de checkpoint que o buffet pode pedir (mesmos do cadastro do master)
const TIPOS_CHECKPOINT = { NFC: 'NFC/RFID', UHF: 'UHF longa distância' };
// Para que o buffet quer o checkpoint (informação para o master; não muda o cadastro do checkpoint)
const FINALIDADES = { jogo: 'Jogo', pontuacao: 'Pontuação', recepcao: 'Recepção' };
const MAX_QUANTIDADE_POR_ITEM = 500;
const MAX_LINHAS = 12;
const MAX_QUANTIDADE_PULSEIRAS = 5000;

// Valida as linhas da solicitação: [{ tipo, finalidade, quantidade }] → junta quantidades do mesmo tipo e finalidade
function normalizarItens(bruto) {
  if (!Array.isArray(bruto) || bruto.length === 0) return { erro: 'Informe o tipo e a quantidade de checkpoints' };
  if (bruto.length > MAX_LINHAS) return { erro: `No máximo ${MAX_LINHAS} linhas por solicitação` };
  const porTipo = new Map();
  for (const item of bruto) {
    const tipo = String(item?.tipo || '').trim().toUpperCase();
    const finalidade = String(item?.finalidade || '').trim().toLowerCase();
    const quantidade = Number(item?.quantidade);
    if (!TIPOS_CHECKPOINT[tipo]) return { erro: 'Tipo de checkpoint inválido' };
    if (!FINALIDADES[finalidade]) return { erro: 'Informe se o checkpoint é para jogo, pontuação ou recepção' };
    if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > MAX_QUANTIDADE_POR_ITEM) {
      return { erro: `A quantidade deve ser um número inteiro de 1 a ${MAX_QUANTIDADE_POR_ITEM}` };
    }
    const chave = `${tipo}|${finalidade}`;
    porTipo.set(chave, { tipo, finalidade, quantidade: (porTipo.get(chave)?.quantidade || 0) + quantidade });
  }
  const itens = [...porTipo.values()];
  if (itens.some((i) => i.quantidade > MAX_QUANTIDADE_POR_ITEM)) return { erro: `No máximo ${MAX_QUANTIDADE_POR_ITEM} por tipo e finalidade` };
  return { itens };
}

// Pedido de pulseiras: as pulseiras são todas iguais, então o pedido é só uma quantidade (1 a MAX_QUANTIDADE_PULSEIRAS).
// Aceita `quantidade` ou, por compatibilidade, uma lista `itens` de [{ quantidade }] (soma as quantidades).
function normalizarPedidoPulseiras(corpo) {
  const bruto = corpo?.quantidade ?? (Array.isArray(corpo?.itens) ? corpo.itens.reduce((soma, i) => soma + Number(i?.quantidade || 0), 0) : undefined);
  const quantidade = Number(bruto);
  if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > MAX_QUANTIDADE_PULSEIRAS) {
    return { erro: `A quantidade deve ser um número inteiro de 1 a ${MAX_QUANTIDADE_PULSEIRAS}` };
  }
  return { itens: [{ quantidade }], quantidade };
}

function resumoDosItens(itens) {
  return itens.map((i) => `${i.quantidade} × ${TIPOS_CHECKPOINT[i.tipo]} (${FINALIDADES[i.finalidade].toLowerCase()})`).join(', ');
}

function lerItens(texto) {
  try {
    const itens = JSON.parse(texto || '[]');
    return Array.isArray(itens) ? itens : [];
  } catch {
    return [];
  }
}

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
        CREATE TABLE IF NOT EXISTS chamadoSuport (
          ticketId varchar(36) PRIMARY KEY,
          empresaId varchar(36),
          cliente varchar(255) NOT NULL,
          assunto varchar(255) NOT NULL,
          status varchar(20) NOT NULL DEFAULT 'aberto',
          prioridade varchar(20) NOT NULL DEFAULT 'media',
          descricao texto,
          atribuidoPara varchar(255),
          criadoEm timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
          atualizadoEm timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
    } else {
      await query(`
        IF OBJECT_ID('dbo.chamadoSuport', 'U') IS NULL
        BEGIN
          CREATE TABLE chamadoSuport (
            id varchar(36) NOT NULL PRIMARY KEY,
            empresaId varchar(36) NULL,
            cliente varchar(255) NOT NULL,
            subject varchar(255) NOT NULL,
            status varchar(20) NOT NULL DEFAULT 'aberto',
            priority varchar(20) NOT NULL DEFAULT 'media',
            description nvarchar(max) NULL,
            atribuidoPara varchar(255) NULL,
            criadoEm datetime2 NOT NULL DEFAULT GETDATE(),
            atualizadoEm datetime2 NOT NULL DEFAULT GETDATE()
          )
        END
      `);
    }
    // Solicitações de checkpoint feitas pelo admin do buffet usam a mesma fila: `tipoChamado` separa das demais
    if (DB_DRIVER === 'postgres' || DB_DRIVER === 'postgresql') {
      await query("ALTER TABLE chamadoSuport ADD COLUMN IF NOT EXISTS tipoChamado varchar(20) NOT NULL DEFAULT 'chamado'");
      await query('ALTER TABLE chamadoSuport ADD COLUMN IF NOT EXISTS itens text');
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
    id: ticket.ticketId,
    empresaId: ticket.empresaId || null,
    cliente: ticket.cliente,
    subject: ticket.assunto,
    status: ticket.status,
    priority: ticket.prioridade,
    description: ticket.descricao || '',
    atribuidoPara: ticket.atribuidoPara || 'Atribuir',
    tipoChamado: ticket.tipoChamado || 'chamado',
    itens: lerItens(ticket.itens),
    date: ticket.criadoEm,
    createdAt: ticket.criadoEm,
    updatedAt: ticket.atualizadoEm,
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
      FROM chamadoSuport
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
        ticketId, empresaId, cliente, assunto, status, prioridade, descricao,
        atribuidoPara, tipoChamado, itens, criadoEm, atualizadoEm
      FROM chamadoSuport
      ORDER BY criadoEm DESC
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
    const { cliente, subject, priority, description, atribuidoPara, empresaId } = req.body || {};
    if (!String(cliente || '').trim() || !String(subject || '').trim()) {
      return res.status(400).json({ error: 'cliente e subject são obrigatórios' });
    }
    const normalizedPriority = String(priority || 'media').toLowerCase();
    if (!VALID_PRIORITIES.has(normalizedPriority)) {
      return res.status(400).json({ error: 'priority inválida' });
    }

    const id = uuidv4();
    await query(`
      INSERT INTO chamadoSuport
        (ticketId, empresaId, cliente, assunto, status, prioridade, descricao, atribuidoPara)
      VALUES
        (@id, @empresaId, @cliente, @subject, @status, @priority, @description, @atribuidoPara)
    `, {
      id,
      empresaId: empresaId || null,
      cliente: String(cliente).trim(),
      subject: String(subject).trim(),
      status: 'aberto',
      priority: normalizedPriority,
      description: description ? String(description) : null,
      atribuidoPara: atribuidoPara ? String(atribuidoPara) : 'Atribuir',
    });

    const ticket = await queryOne('SELECT * FROM chamadoSuport WHERE ticketId = @id', { id });
    return res.status(201).json(serializeTicket(ticket));
  } catch (err) {
    console.error('❌ Erro ao criar ticket:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Admin do buffet pede checkpoints ao master: aparece na central de suporte como um chamado do tipo 'checkpoint'
router.post('/solicitar-checkpoints', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    await ensureSupportTable();
    const { empresaId } = req.user;
    if (!empresaId) return res.status(400).json({ error: 'Usuário sem empresa vinculada' });
    const lidos = normalizarItens(req.body?.itens);
    if (lidos.erro) return res.status(400).json({ error: lidos.erro });
    const observacao = String(req.body?.observacao || '').trim().slice(0, 1000);

    const empresa = await queryOne('SELECT nome FROM empresa WHERE empresaId = @empresaId', { empresaId });
    const resumo = resumoDosItens(lidos.itens);
    const id = uuidv4();
    await query(`
      INSERT INTO chamadoSuport
        (ticketId, empresaId, cliente, assunto, status, prioridade, descricao, atribuidoPara, tipoChamado, itens)
      VALUES
        (@id, @empresaId, @cliente, @subject, 'aberto', 'media', @description, 'Atribuir', 'checkpoint', @itens)
    `, {
      id,
      empresaId,
      cliente: empresa?.nome || req.user.email || 'Cliente',
      subject: `Solicitação de checkpoints: ${resumo}`,
      description: observacao || null,
      itens: JSON.stringify(lidos.itens),
    });
    const ticket = await queryOne('SELECT * FROM chamadoSuport WHERE ticketId = @id', { id });
    return res.status(201).json(serializeTicket(ticket));
  } catch (err) {
    console.error('❌ Erro ao solicitar checkpoints:', err);
    return res.status(500).json({ error: 'Não foi possível enviar a solicitação' });
  }
});

// Admin do buffet pede pulseiras ao master: chamado do tipo 'pulseira' na mesma fila do suporte
router.post('/solicitar-pulseiras', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    await ensureSupportTable();
    const { empresaId } = req.user;
    if (!empresaId) return res.status(400).json({ error: 'Usuário sem empresa vinculada' });
    const lidos = normalizarPedidoPulseiras(req.body);
    if (lidos.erro) return res.status(400).json({ error: lidos.erro });
    const observacao = String(req.body?.observacao || '').trim().slice(0, 1000);

    const empresa = await queryOne('SELECT nome FROM empresa WHERE empresaId = @empresaId', { empresaId });
    const id = uuidv4();
    await query(`
      INSERT INTO chamadoSuport
        (ticketId, empresaId, cliente, assunto, status, prioridade, descricao, atribuidoPara, tipoChamado, itens)
      VALUES
        (@id, @empresaId, @cliente, @subject, 'aberto', 'media', @description, 'Atribuir', 'pulseira', @itens)
    `, {
      id,
      empresaId,
      cliente: empresa?.nome || req.user.email || 'Cliente',
      subject: `Solicitação de pulseiras: ${lidos.quantidade}`,
      description: observacao || null,
      itens: JSON.stringify(lidos.itens),
    });
    const ticket = await queryOne('SELECT * FROM chamadoSuport WHERE ticketId = @id', { id });
    return res.status(201).json(serializeTicket(ticket));
  } catch (err) {
    console.error('❌ Erro ao solicitar pulseiras:', err);
    return res.status(500).json({ error: 'Não foi possível enviar a solicitação' });
  }
});

router.put('/:id/status', verifyToken, requireMaster, async (req, res) => {
  try {
    await ensureSupportTable();
    const status = String(req.body?.status || '').toLowerCase();
    if (!VALID_STATUSES.has(status)) {
      return res.status(400).json({ error: 'status inválido' });
    }

    const existing = await queryOne('SELECT ticketId FROM chamadoSuport WHERE ticketId = @id', { id: req.params.id });
    if (!existing) return res.status(404).json({ error: 'Ticket não encontrado' });

    await query(`
      UPDATE chamadoSuport
      SET status = @status, atualizadoEm = CURRENT_TIMESTAMP
      WHERE ticketId = @id
    `, { id: req.params.id, status });
    const ticket = await queryOne('SELECT * FROM chamadoSuport WHERE ticketId = @id', { id: req.params.id });
    return res.json(serializeTicket(ticket));
  } catch (err) {
    console.error('❌ Erro ao atualizar status do ticket:', err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.normalizarItens = normalizarItens;
module.exports.normalizarPedidoPulseiras = normalizarPedidoPulseiras;
module.exports.resumoDosItens = resumoDosItens;
