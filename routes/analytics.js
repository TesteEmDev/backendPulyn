const express = require('express');
const router = express.Router();
const { query, queryOne, allQuery } = require('../database');
const { verifyToken, isMaster } = require('../utils/middleware');

// ✅ Métricas gerais da plataforma - APENAS para master
router.get('/metrics', verifyToken, async (req, res) => {
  try {
    // ✅ Apenas master pode acessar métricas globais
    if (!isMaster(req)) {
      return res.status(403).json({ error: 'Acesso negado: apenas master pode ver métricas globais' });
    }

    const totalEvents = await queryOne('SELECT COUNT(*) as count FROM eventos WHERE empresa_id IS NOT NULL');
    const totalCheckpoints = await queryOne('SELECT COUNT(*) as count FROM checkpoints');
    const activeEvents = await queryOne("SELECT COUNT(*) as count FROM eventos WHERE status = 'active' AND empresa_id IS NOT NULL");
    const totalChildren = await queryOne('SELECT COUNT(*) as count FROM criancas');
    
    const clients = await queryOne('SELECT COUNT(*) as count FROM empresas WHERE nome != @name', { name: 'Master Admin' });
    const activeClients = await queryOne('SELECT COUNT(*) as count FROM empresas WHERE status = @status AND nome != @name', { status: 'active', name: 'Master Admin' });
    
    res.json({
      activeClients: activeClients?.count || 0,
      totalClients: clients?.count || 0,
      totalEvents: totalEvents?.count || 0,
      totalCheckpoints: totalCheckpoints?.count || 0,
      activeEvents: activeEvents?.count || 0,
      totalChildren: totalChildren?.count || 0,
      avgEventsPerClient: clients?.count > 0 ? Math.round((totalEvents?.count || 0) / clients.count) : 0,
    });
  } catch (err) {
    console.error('❌ Erro ao buscar métricas:', err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Crescimento de clientes por mês - APENAS para master
router.get('/client-growth', verifyToken, async (req, res) => {
  try {
    // ✅ Apenas master pode acessar crescimento global
    if (!isMaster(req)) {
      return res.status(403).json({ error: 'Acesso negado: apenas master pode ver crescimento de clientes' });
    }

    const data = await allQuery(`
      SELECT 
        CONVERT(VARCHAR(7), data_criacao, 120) as month,
        COUNT(*) as clients
      FROM empresas
      WHERE data_criacao IS NOT NULL AND nome != 'Master Admin'
      GROUP BY CONVERT(VARCHAR(7), data_criacao, 120)
      ORDER BY CONVERT(VARCHAR(7), data_criacao, 120) ASC
    `);
    
    // Formatar dados com nomes de meses legíveis
    const formattedData = (data || []).map(item => {
      const [year, monthNum] = item.month.split('-');
      const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
      const monthName = months[parseInt(monthNum) - 1];
      return {
        month: `${monthName} ${year.slice(2)}`,
        clients: item.clients
      };
    });
    
    res.json(formattedData);
  } catch (err) {
    console.error('❌ Erro ao buscar crescimento de clientes:', err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Eventos por mês - APENAS para master
router.get('/events-per-month', verifyToken, async (req, res) => {
  try {
    // ✅ Apenas master pode acessar eventos globais
    if (!isMaster(req)) {
      return res.status(403).json({ error: 'Acesso negado: apenas master pode ver eventos globais' });
    }

    const data = await allQuery(`
      SELECT 
        CONVERT(VARCHAR(7), [date], 120) as month,
        COUNT(*) as events
      FROM eventos
      WHERE [date] IS NOT NULL AND empresa_id IS NOT NULL
      GROUP BY CONVERT(VARCHAR(7), [date], 120)
      ORDER BY CONVERT(VARCHAR(7), [date], 120) ASC
    `);
    
    // Formatar dados com nomes de meses legíveis
    const formattedData = (data || []).map(item => {
      const [year, monthNum] = item.month.split('-');
      const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
      const monthName = months[parseInt(monthNum) - 1];
      return {
        month: `${monthName} ${year.slice(2)}`,
        events: item.events
      };
    });
    
    res.json(formattedData);
  } catch (err) {
    console.error('❌ Erro ao buscar eventos por mês:', err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Checkpoints ao longo do tempo - APENAS para master
router.get('/checkpoints-over-time', verifyToken, async (req, res) => {
  try {
    // ✅ Apenas master pode acessar checkpoints globais
    if (!isMaster(req)) {
      return res.status(403).json({ error: 'Acesso negado: apenas master pode ver checkpoints globais' });
    }

    const data = await allQuery(`
      SELECT 
        CONVERT(VARCHAR(7), ISNULL(data_criacao, GETDATE()), 120) as month,
        COUNT(DISTINCT id) as checkpoints
      FROM checkpoints
      GROUP BY CONVERT(VARCHAR(7), ISNULL(data_criacao, GETDATE()), 120)
      ORDER BY CONVERT(VARCHAR(7), ISNULL(data_criacao, GETDATE()), 120) ASC
    `);
    
    // Formatar dados com nomes de meses legíveis
    const formattedData = (data || []).map(item => {
      const [year, monthNum] = item.month.split('-');
      const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
      const monthName = months[parseInt(monthNum) - 1];
      return {
        month: `${monthName} ${year.slice(2)}`,
        checkpoints: item.checkpoints
      };
    });
    
    res.json(formattedData);
  } catch (err) {
    console.error('❌ Erro ao buscar checkpoints ao longo do tempo:', err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Receita por plano - APENAS para master
router.get('/revenue-by-plan', verifyToken, async (req, res) => {
  try {
    // ✅ Apenas master pode acessar receita global
    if (!isMaster(req)) {
      return res.status(403).json({ error: 'Acesso negado: apenas master pode ver receita' });
    }

    const data = await allQuery(`
      SELECT 
        e.plano as plan,
        COUNT(*) as clientCount,
        SUM(CASE 
          WHEN e.plano = 'enterprise' THEN 2000
          WHEN e.plano = 'professional' THEN 1000
          WHEN e.plano = 'starter' THEN 500
          ELSE 0
        END) as revenue
      FROM empresas e
      WHERE e.nome != 'Master Admin' AND e.status = 'active'
      GROUP BY e.plano
    `);
    
    res.json(data || []);
  } catch (err) {
    console.error('❌ Erro ao buscar receita por plano:', err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ MRR calculado - APENAS para master
router.get('/mrr', verifyToken, async (req, res) => {
  try {
    // ✅ Apenas master pode acessar MRR global
    if (!isMaster(req)) {
      return res.status(403).json({ error: 'Acesso negado: apenas master pode ver MRR' });
    }

    const result = await queryOne(`
      SELECT 
        SUM(CASE 
          WHEN plano = 'enterprise' THEN 2000
          WHEN plano = 'professional' THEN 1000
          WHEN plano = 'starter' THEN 500
          ELSE 0
        END) as total
      FROM empresas
      WHERE status = 'active' AND nome != 'Master Admin'
    `);
    
    res.json({
      mrr: result?.total || 0,
      currency: 'BRL'
    });
  } catch (err) {
    console.error('❌ Erro ao calcular MRR:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
