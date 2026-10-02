// routes/planos.js - Visão de planos e clientes para o dashboard master
const express = require('express');
const router = express.Router();
const { allQuery } = require('../database');
const { verifyToken, isMaster } = require('../utils/middleware');

const PLAN_DEFINITIONS = {
  starter: {
    name: 'Starter', price: 500, color: '#F59E0B', checkpointLimit: 3, eventsPerMonth: 4,
    features: ['Até 3 checkpoints simultâneos', 'Até 4 eventos por mês', 'Dashboard básico'],
  },
  professional: {
    name: 'Professional', price: 1000, color: '#29B6F6', checkpointLimit: 8, eventsPerMonth: 12,
    features: ['Até 8 checkpoints simultâneos', 'Até 12 eventos por mês', 'Dashboard completo'],
  },
  enterprise: {
    name: 'Enterprise', price: 2000, color: '#1E9BD7', checkpointLimit: -1, eventsPerMonth: -1,
    features: ['Checkpoints ilimitados', 'Eventos ilimitados', 'Dashboard completo + analytics'],
  },
};

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

async function loadCompanies() {
  return allQuery(`
    SELECT id, nome, cidade, estado, plano, status, data_criacao
    FROM empresas
    WHERE nome <> @masterName
    ORDER BY nome
  `, { masterName: 'Master Admin' });
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
        since: formatSince(company.data_criacao),
      }));

    return res.json(clients);
  } catch (err) {
    console.error('❌ Erro ao consultar clientes por plano:', err);
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
