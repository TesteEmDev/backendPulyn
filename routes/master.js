// routes/master.js - Master Dashboard
const express = require('express');
const router = express.Router();
const { query, queryOne, allQuery } = require('../database');
const { verifyToken, isMaster } = require('../utils/middleware');
const { listPlatformClients } = require('../utils/platformClients');

// ✅ Dados para o dashboard master - APENAS master
router.get('/dashboard', verifyToken, async (req, res) => {
  try {
    // ✅ Apenas master pode acessar dashboard master
    if (!isMaster(req)) {
      return res.status(403).json({ error: 'Acesso negado: apenas master pode acessar o dashboard master' });
    }

    console.log('📊 [MASTER] Buscando dados do dashboard...');
    
    // Clientes = empresas + cadastro legado `clientes` (sem contas de família)
    const platformClients = await listPlatformClients();
    
    // Eventos em andamento (com empresaId e não da Master)
    const activeEvents = await queryOne(`
      SELECT COUNT(*) as count FROM eventos e
      LEFT JOIN empresas emp ON e.empresaId = emp.id
      WHERE (e.status = 'active' OR e.status = 'scheduled')
        AND e.empresaId IS NOT NULL
        AND emp.nome != 'Master Admin'
    `);
    
    // Checkpoints online
    const onlineCheckpoints = await queryOne(`
      SELECT COUNT(*) as count
      FROM checkpoints c
      LEFT JOIN empresas emp ON c.empresaId = emp.id
      WHERE c.status = 'online'
        AND LOWER(COALESCE(c.propositoCheckpoint, 'game')) <> 'reception'
        AND emp.nome != 'Master Admin'
    `);
    
    // Crianças ativas hoje
    const activeChildren = await queryOne(`
      SELECT COUNT(*) as count
      FROM criancas c
      LEFT JOIN empresas emp ON c.empresaId = emp.id
      WHERE CAST(GETDATE() AS DATE) = CAST(c.criadoEm AS DATE)
        AND emp.nome != 'Master Admin'
    `);
    
    // Checkpoints offline
    const offlineCheckpoints = await queryOne(`
      SELECT COUNT(*) as count
      FROM checkpoints c
      LEFT JOIN empresas emp ON c.empresaId = emp.id
      WHERE (c.status = 'offline' OR c.status IS NULL)
        AND LOWER(COALESCE(c.propositoCheckpoint, 'game')) <> 'reception'
        AND emp.nome != 'Master Admin'
    `);
    
    console.log('✅ Dashboard data loaded successfully');
    res.json({
      activeClients: platformClients.filter((c) => String(c.status).toLowerCase() === 'active').length,
      activeEvents: activeEvents?.count || 0,
      onlineCheckpoints: onlineCheckpoints?.count || 0,
      activeChildren: activeChildren?.count || 0,
      offlineCheckpoints: offlineCheckpoints?.count || 0,
      totalClients: platformClients.length,
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

    // Sem coordenadas no cadastro: o mapa posiciona pelo estado/cidade. Une
    // `empresas` e o cadastro legado `clientes` (ver utils/platformClients.js).
    const clients = (await listPlatformClients()).map((c) => ({
      id: c.id,
      name: c.name,
      city: c.city,
      state: c.state,
      status: c.status,
      plan: c.plan,
    }));

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
    
    // O DATEDIFF com ISNULL aninhado vira SQL inválido no Postgres (o regex de
    // tradução corta os argumentos na vírgula do ISNULL), o que derrubava a
    // rota inteira e deixava "Eventos em Andamento" sempre vazio. O tempo
    // decorrido e o camelCase agora são montados em JS (alias sem aspas volta
    // minúsculo do Postgres, então childrenCount chegava undefined).
    const rows = await allQuery(`
      SELECT TOP 10
        e.id,
        e.name,
        e.empresaId,
        e2.nome as client,
        (SELECT COUNT(*) FROM criancas WHERE eventoId = e.id) as children_count,
        e.status,
        e.date as event_date,
        e.criadoEm
      FROM eventos e
      LEFT JOIN empresas e2 ON e.empresaId = e2.id
      WHERE e.status IN ('active', 'scheduled')
        AND e.empresaId IS NOT NULL
        AND e2.nome != 'Master Admin'
      ORDER BY e.date DESC
    `);

    const now = Date.now();
    const events = rows.map((e) => {
      const startedAt = new Date(e.criadoEm || e.event_date).getTime();
      return {
        id: e.id,
        name: e.name,
        clientId: e.empresaId,
        client: e.client,
        childrenCount: Number(e.children_count) || 0,
        status: e.status,
        date: e.event_date,
        elapsed: Number.isFinite(startedAt) ? Math.max(0, Math.round((now - startedAt) / 60000)) : 0,
      };
    });

    console.log(`✅ ${events.length} eventos carregados`);
    res.json(events);
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

    // Antes, a mensagem e o cliente eram textos fixos ('Checkpoint offline'
    // / 'Sistema') para toda e qualquer linha — nunca dizia QUAL checkpoint
    // nem DE QUEM. Agora busca os dados reais e monta a mensagem no JS
    // (evita depender de concatenação de string, que difere entre
    // SQL Server e Postgres).
    const offlineCheckpoints = await allQuery(`
      SELECT TOP 5
        c.id,
        c.name,
        c.zone,
        c.ultimoVisto,
        emp.nome as empresa_nome
      FROM checkpoints c
      LEFT JOIN empresas emp ON c.empresaId = emp.id
      WHERE c.status = 'offline'
        AND LOWER(COALESCE(c.propositoCheckpoint, 'game')) <> 'reception'
      ORDER BY c.ultimoVisto DESC
    `);

    const alerts = offlineCheckpoints.map((cp) => ({
      id: cp.id,
      type: 'offline',
      message: `Checkpoint "${cp.name || cp.id}" offline${cp.zone ? ` (${cp.zone})` : ''}`,
      client: cp.empresa_nome || 'Sem empresa',
      time: cp.ultimoVisto
        ? new Date(cp.ultimoVisto).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        : '—',
    }));

    console.log(`✅ ${alerts?.length || 0} alertas carregados`);
    res.json(alerts || []);
  } catch (err) {
    console.error('❌ Erro ao buscar alertas:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
