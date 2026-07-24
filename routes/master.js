// routes/master.js - Master Dashboard
const express = require('express');
const router = express.Router();
const { query, queryOne, allQuery } = require('../database');
const { verifyToken, isMaster } = require('../utils/middleware');

// ✅ Dados para o dashboard master - APENAS master
router.get('/dashboard', verifyToken, async (req, res) => {
  try {
    // ✅ Apenas master pode acessar dashboard master
    if (!isMaster(req)) {
      return res.status(403).json({ error: 'Acesso negado: apenas master pode acessar o dashboard master' });
    }

    console.log('📊 [MASTER] Buscando dados do dashboard...');
    
    // Clientes ativos (excluindo Master Admin)
    const activeClients = await queryOne(`
      SELECT COUNT(*) as count FROM empresas WHERE status = 'active' AND nome != 'Master Admin'
    `);
    
    // Eventos em andamento (com empresa_id e não da Master)
    const activeEvents = await queryOne(`
      SELECT COUNT(*) as count FROM eventos e
      LEFT JOIN empresas emp ON e.empresa_id = emp.id
      WHERE (e.status = 'active' OR e.status = 'scheduled')
        AND e.empresa_id IS NOT NULL
        AND emp.nome != 'Master Admin'
    `);
    
    // Checkpoints online
    const onlineCheckpoints = await queryOne(`
      SELECT COUNT(*) as count FROM checkpoints WHERE status = 'online'
    `);
    
    // Crianças ativas hoje
    const activeChildren = await queryOne(`
      SELECT COUNT(*) as count FROM criancas WHERE CAST(GETDATE() AS DATE) = CAST(created_at AS DATE)
    `);
    
    // Checkpoints offline
    const offlineCheckpoints = await queryOne(`
      SELECT COUNT(*) as count FROM checkpoints WHERE status = 'offline' OR status IS NULL
    `);
    
    // Total de clientes (excluindo Master Admin)
    const totalClients = await queryOne(`
      SELECT COUNT(*) as count FROM empresas WHERE nome != 'Master Admin'
    `);
    
    console.log('✅ Dashboard data loaded successfully');
    res.json({
      activeClients: activeClients?.count || 0,
      activeEvents: activeEvents?.count || 0,
      onlineCheckpoints: onlineCheckpoints?.count || 0,
      activeChildren: activeChildren?.count || 0,
      offlineCheckpoints: offlineCheckpoints?.count || 0,
      totalClients: totalClients?.count || 0,
    });
  } catch (err) {
    console.error('❌ Erro ao buscar dados do dashboard:', err.message);
    console.error('Stack:', err.stack);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Listar clientes para o mapa - APENAS master
router.get('/clients', verifyToken, async (req, res) => {
  try {
    // ✅ Apenas master pode listar todos os clientes
    if (!isMaster(req)) {
      return res.status(403).json({ error: 'Acesso negado: apenas master pode listar clientes' });
    }

    console.log('📍 [MASTER] Buscando clientes...');
    
    const clients = await allQuery(`
      SELECT 
        id,
        nome as name,
        cidade as city,
        estado as state,
        status,
        [plano] as plan,
        ISNULL([latitude], -15.7975) as lat,
        ISNULL([longitude], -47.8919) as lng
      FROM empresas
      WHERE nome != 'Master Admin'
      ORDER BY nome
    `);
    
    console.log(`✅ ${clients?.length || 0} clientes carregados`);
    res.json(clients || []);
  } catch (err) {
    console.error('❌ Erro ao buscar clientes:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Listar eventos em andamento - APENAS master
router.get('/active-events', verifyToken, async (req, res) => {
  try {
    // ✅ Apenas master pode listar todos os eventos
    if (!isMaster(req)) {
      return res.status(403).json({ error: 'Acesso negado: apenas master pode listar todos os eventos' });
    }

    console.log('⚡ [MASTER] Buscando eventos ativos...');
    
    const events = await allQuery(`
      SELECT TOP 10
        e.id,
        e.name,
        e2.nome as client,
        (SELECT COUNT(*) FROM criancas WHERE evento_id = e.id) as childrenCount,
        e.status,
        DATEDIFF(MINUTE, ISNULL(e.created_at, e.date), GETDATE()) as elapsed
      FROM eventos e
      LEFT JOIN empresas e2 ON e.empresa_id = e2.id
      WHERE e.status IN ('active', 'scheduled')
        AND e.empresa_id IS NOT NULL
        AND e2.nome != 'Master Admin'
      ORDER BY e.date DESC
    `);
    
    console.log(`✅ ${events?.length || 0} eventos carregados`);
    res.json(events || []);
  } catch (err) {
    console.error('❌ Erro ao buscar eventos ativos:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Listar alertas do sistema - APENAS master
router.get('/alerts', verifyToken, async (req, res) => {
  try {
    // ✅ Apenas master pode listar alertas globais
    if (!isMaster(req)) {
      return res.status(403).json({ error: 'Acesso negado: apenas master pode listar alertas' });
    }

    console.log('⚠️ [MASTER] Buscando alertas...');
    
    const alerts = await allQuery(`
      SELECT TOP 5
        NEWID() as id,
        'offline' as type,
        'Checkpoint offline' as message,
        'Sistema' as client,
        FORMAT(GETDATE(), 'HH:mm') as time
      FROM checkpoints
      WHERE status = 'offline'
    `);
    
    console.log(`✅ ${alerts?.length || 0} alertas carregados`);
    res.json(alerts || []);
  } catch (err) {
    console.error('❌ Erro ao buscar alertas:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
