// routes/analytics.js - métricas da plataforma (visão master)
//
// Tudo aqui vem do banco: clientes = empresas + cadastro legado (utils/platformClients.js),
// receita = valor do plano (utils/planDefinitions.js) dos clientes ativos, e os números
// de eventos, crianças e pontoVerificacao consideram só o que pertence a clientes (empresa).
const express = require('express');
const router = express.Router();
const { allQuery, queryOne } = require('../database');
const { verifyToken, isMaster } = require('../utils/middleware');
const { listPlatformClients } = require('../utils/platformClients');
const { PLAN_DEFINITIONS } = require('../utils/planDefinitions');

const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const DAY_MS = 24 * 60 * 60 * 1000;

function requireMaster(message) {
  return (req, res, next) => {
    if (!isMaster(req)) return res.status(403).json({ error: message });
    return next();
  };
}

// Mês (AAAA-MM) de um instante, no fuso do Brasil: o servidor pode rodar em UTC e um
// cadastro feito às 22h do dia 31 não pode virar mês seguinte.
const monthFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' });
function monthKeyOf(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = Object.fromEntries(monthFormatter.formatToParts(date).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}`;
}

const monthLabel = (key) => {
  const [year, month] = key.split('-');
  return `${MONTH_NAMES[Number(month) - 1]} ${year.slice(2)}`;
};

// Todos os meses de `start` até `end` (inclusive), sem pular nenhum: mês sem dados vale zero.
function monthRange(start, end) {
  const keys = [];
  let [year, month] = start.split('-').map(Number);
  const [endYear, endMonth] = end.split('-').map(Number);
  while (year < endYear || (year === endYear && month <= endMonth)) {
    keys.push(`${year}-${String(month).padStart(2, '0')}`);
    month += 1;
    if (month > 12) { month = 1; year += 1; }
  }
  return keys;
}

const isActive = (cliente) => String(cliente.status || '').toLowerCase() === 'active';
const planPrice = (cliente) => PLAN_DEFINITIONS[String(cliente.plan || '').trim().toLowerCase()]?.price || 0;
const round1 = (value) => Math.round(value * 10) / 10;

// Receita mensal recorrente: só clientes ativos pagam (trial e bloqueado não entram).
const sumMrr = (clients) => clients.filter(isActive).reduce((sum, c) => sum + planPrice(c), 0);

// Escopo "de clientes": eventos de empresas (não os de teste sem empresa nem da conta Master).
const CUSTOMER_EVENTS = `e.empresaId IS NOT NULL
  AND e.empresaId NOT IN (SELECT id FROM empresas WHERE nome = 'Master Admin')`;

// ✅ Indicadores gerais
router.get('/metrics', verifyToken, requireMaster('Acesso negado: apenas master pode ver métricas globais'), async (req, res) => {
  try {
    const [clients, eventRow, checkpointRow, childrenRow] = await Promise.all([
      listPlatformClients(),
      queryOne(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN LOWER(COALESCE(e.status, '')) IN ('active', 'ongoing') THEN 1 ELSE 0 END) AS active,
          SUM(CASE WHEN LOWER(COALESCE(e.status, '')) = 'scheduled' THEN 1 ELSE 0 END) AS scheduled,
          SUM(CASE WHEN LOWER(COALESCE(e.status, '')) IN ('finished', 'completed') THEN 1 ELSE 0 END) AS finished
        FROM eventos e
        WHERE ${CUSTOMER_EVENTS}
      `),
      queryOne(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN LOWER(COALESCE(k.status, '')) = 'online' THEN 1 ELSE 0 END) AS online
        FROM pontoVerificacao k
        JOIN eventos e ON e.id = k.eventoId
        WHERE LOWER(COALESCE(k.propositoCheckpoint, 'game')) <> 'reception'
          AND ${CUSTOMER_EVENTS}
      `),
      queryOne(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN LOWER(COALESCE(c.status, 'active')) = 'active' THEN 1 ELSE 0 END) AS active
        FROM criancas c
        JOIN eventos e ON e.id = c.eventoId
        WHERE ${CUSTOMER_EVENTS}
      `),
    ]);

    const totalClients = clients.length;
    const activeClients = clients.filter(isActive).length;
    const mrr = sumMrr(clients);

    // Crescimento em 12 meses: clientes hoje contra os que já existiam há 12 meses.
    // Sem nenhum cliente com 12 meses de casa não há base de comparação (null, não zero).
    const now = Date.now();
    const timeOf = (c) => (c.createdAt ? new Date(c.createdAt).getTime() : NaN);
    const baseYearAgo = clients.filter((c) => timeOf(c) <= now - 365 * DAY_MS).length;
    const growthYoY = baseYearAgo > 0 ? round1(((totalClients - baseYearAgo) / baseYearAgo) * 100) : null;

    const totalEvents = Number(eventRow?.total) || 0;
    res.json({
      totalClients,
      activeClients,
      trialClients: clients.filter((c) => String(c.status).toLowerCase() === 'trial').length,
      blockedClients: clients.filter((c) => String(c.status).toLowerCase() === 'blocked').length,
      newClients30d: clients.filter((c) => timeOf(c) >= now - 30 * DAY_MS).length,
      growthYoY,
      mrr,
      arpu: activeClients > 0 ? Math.round(mrr / activeClients) : 0,
      totalEvents,
      activeEvents: Number(eventRow?.active) || 0,
      scheduledEvents: Number(eventRow?.scheduled) || 0,
      finishedEvents: Number(eventRow?.finished) || 0,
      avgEventsPerClient: totalClients > 0 ? round1(totalEvents / totalClients) : 0,
      totalCheckpoints: Number(checkpointRow?.total) || 0,
      onlineCheckpoints: Number(checkpointRow?.online) || 0,
      totalChildren: Number(childrenRow?.total) || 0,
      activeChildren: Number(childrenRow?.active) || 0,
    });
  } catch (err) {
    console.error('❌ Erro ao buscar métricas:', err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Crescimento de clientes: novos no mês e total acumulado, sem meses faltando
router.get('/cliente-growth', verifyToken, requireMaster('Acesso negado: apenas master pode ver crescimento de clientes'), async (req, res) => {
  try {
    const perMonth = new Map();
    (await listPlatformClients()).forEach((cliente) => {
      const key = monthKeyOf(cliente.createdAt);
      if (key) perMonth.set(key, (perMonth.get(key) || 0) + 1);
    });
    if (perMonth.size === 0) return res.json([]);

    const first = Array.from(perMonth.keys()).sort()[0];
    let total = 0;
    res.json(monthRange(first, monthKeyOf(new Date())).map((key) => {
      const added = perMonth.get(key) || 0;
      total += added;
      return { month: monthLabel(key), clients: added, total };
    }));
  } catch (err) {
    console.error('❌ Erro ao buscar crescimento de clientes:', err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Eventos por mês (pela data do evento), separados por situação
router.get('/events-per-month', verifyToken, requireMaster('Acesso negado: apenas master pode ver eventos globais'), async (req, res) => {
  try {
    const rows = await allQuery(`
      SELECT TO_CHAR(e.date, 'YYYY-MM') AS month, LOWER(COALESCE(e.status, '')) AS status
      FROM eventos e
      WHERE e.date IS NOT NULL AND ${CUSTOMER_EVENTS}
    `);
    if (!rows.length) return res.json([]);

    const perMonth = new Map();
    rows.forEach((row) => {
      const bucket = perMonth.get(row.month) || { finished: 0, active: 0, scheduled: 0, other: 0 };
      if (['finished', 'completed'].includes(row.status)) bucket.finished += 1;
      else if (['active', 'ongoing'].includes(row.status)) bucket.active += 1;
      else if (row.status === 'scheduled') bucket.scheduled += 1;
      else bucket.other += 1;
      perMonth.set(row.month, bucket);
    });

    const keys = Array.from(perMonth.keys()).sort();
    const current = monthKeyOf(new Date());
    const last = keys[keys.length - 1] > current ? keys[keys.length - 1] : current;
    res.json(monthRange(keys[0], last).map((key) => {
      const b = perMonth.get(key) || { finished: 0, active: 0, scheduled: 0, other: 0 };
      return {
        month: monthLabel(key),
        events: b.finished + b.active + b.scheduled + b.other,
        finished: b.finished,
        active: b.active,
        scheduled: b.scheduled,
      };
    }));
  } catch (err) {
    console.error('❌ Erro ao buscar eventos por mês:', err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Checkpoints cadastrados ao longo do tempo: novos no mês e total acumulado
router.get('/pontoVerificacao-over-time', verifyToken, requireMaster('Acesso negado: apenas master pode ver pontoVerificacao globais'), async (req, res) => {
  try {
    const rows = await allQuery(`
      SELECT k.criadoEm
      FROM pontoVerificacao k
      JOIN eventos e ON e.id = k.eventoId
      WHERE LOWER(COALESCE(k.propositoCheckpoint, 'game')) <> 'reception'
        AND ${CUSTOMER_EVENTS}
    `);

    const perMonth = new Map();
    rows.forEach((row) => {
      const key = monthKeyOf(row.criadoEm);
      if (key) perMonth.set(key, (perMonth.get(key) || 0) + 1);
    });
    if (perMonth.size === 0) return res.json([]);

    const first = Array.from(perMonth.keys()).sort()[0];
    let total = 0;
    res.json(monthRange(first, monthKeyOf(new Date())).map((key) => {
      const added = perMonth.get(key) || 0;
      total += added;
      return { month: monthLabel(key), pontoVerificacao: added, total };
    }));
  } catch (err) {
    console.error('❌ Erro ao buscar pontoVerificacao ao longo do tempo:', err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Receita por plano (clientes ativos, valor do plano), do maior plano para o menor
router.get('/revenue-by-plan', verifyToken, requireMaster('Acesso negado: apenas master pode ver receita'), async (req, res) => {
  try {
    const active = (await listPlatformClients()).filter(isActive);
    const byPlan = new Map();
    active.forEach((cliente) => {
      const plan = String(cliente.plan || 'starter').trim().toLowerCase();
      if (!PLAN_DEFINITIONS[plan]) return; // sem plano pago conhecido não gera receita
      byPlan.set(plan, (byPlan.get(plan) || 0) + 1);
    });

    res.json(
      Array.from(byPlan.entries())
        .map(([plan, clientCount]) => ({
          plan,
          name: PLAN_DEFINITIONS[plan].name,
          clientCount,
          price: PLAN_DEFINITIONS[plan].price,
          revenue: clientCount * PLAN_DEFINITIONS[plan].price,
        }))
        .sort((a, b) => b.price - a.price)
    );
  } catch (err) {
    console.error('❌ Erro ao buscar receita por plano:', err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ MRR
router.get('/mrr', verifyToken, requireMaster('Acesso negado: apenas master pode ver MRR'), async (req, res) => {
  try {
    res.json({ mrr: sumMrr(await listPlatformClients()), currency: 'BRL' });
  } catch (err) {
    console.error('❌ Erro ao calcular MRR:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
