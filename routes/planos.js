// routes/planos.js - Visão de planos e cliente para o dashboard master
const express = require('express');
const router = express.Router();
const { allQuery } = require('../database');
const { verifyToken, isMaster } = require('../utils/middleware');
const { listPlatformClients } = require('../utils/platformClients');

const { PLAN_DEFINITIONS } = require('../utils/planDefinitions');

function requireMaster(req, res, next) {
  if (!isMaster(req)) {
    return res.status(403).json({ error: 'Acesso negado: apenas master pode consultar planos' });
  }
  return next();
}

function normalizePlan(value) {
  return String(value || 'starter').trim().toLowerCase();
}

function formatSince(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 7);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Empresas + cadastro legado `cliente`; o plano 'family' das contas de família continua contado.
async function loadCompanies() {
  const list = await listPlatformClients({ includeFamily: true });
  return list
    .map((c) => ({
      id: c.id, nome: c.name, cidade: c.city, estado: c.state,
      plano: c.plan, status: c.status, dataCriacao: c.createdAt,
    }))
    .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
}

router.get('/', verifyToken, requireMaster, async (req, res) => {
  try {
    const companies = await loadCompanies();
    const plans = Object.entries(PLAN_DEFINITIONS).map(([id, definition]) => {
      const clients = companies.filter(company => normalizePlan(company.plano) === id);
      const activeClients = clients.filter(company => String(company.status || '').toLowerCase() === 'active');
      return {
        id,
        ...definition,
        clientCount: clients.length,
        activeClientCount: activeClients.length,
        revenue: activeClients.length * definition.price,
      };
    });

    return res.json(plans);
  } catch (err) {
    console.error('❌ Erro ao consultar planos:', err);
    return res.status(500).json({ error: err.message });
  }
});

router.get('/:plano/clients', verifyToken, requireMaster, async (req, res) => {
  try {
    const plan = normalizePlan(req.params.plano);
    if (!PLAN_DEFINITIONS[plan]) {
      return res.status(404).json({ error: 'Plano não encontrado' });
    }

    const companies = await loadCompanies();
    const clients = companies
      .filter(company => normalizePlan(company.plano) === plan)
      .map(company => ({
        id: company.id,
        name: company.nome,
        city: company.cidade,
        state: company.estado,
        plan,
        status: company.status,
        since: formatSince(company.dataCriacao),
      }));

    return res.json(clients);
  } catch (err) {
    console.error('❌ Erro ao consultar cliente por plano:', err);
    return res.status(500).json({ error: err.message });
  }
});

router.get('/revenue', verifyToken, requireMaster, async (req, res) => {
  try {
    const companies = await loadCompanies();
    const revenue = companies.reduce((total, company) => {
      if (String(company.status || '').toLowerCase() !== 'active') return total;
      return total + (PLAN_DEFINITIONS[normalizePlan(company.plano)]?.price || 0);
    }, 0);

    return res.json({ revenue, totalRevenue: revenue, mrr: revenue, currency: 'BRL' });
  } catch (err) {
    console.error('❌ Erro ao calcular receita dos planos:', err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
