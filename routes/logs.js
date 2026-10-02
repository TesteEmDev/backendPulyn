// routes/logs.js - Sistema de Logs
const express = require('express');
const router = express.Router();
const { query, allQuery } = require('../database');
const { verifyToken, isMaster } = require('../utils/middleware');

router.get('/', verifyToken, async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const limit = parseInt(req.query.limit) || 100;
    
    let logs;
    if (isMaster(req)) {
      // Master vê todos os logs (exceto os da Master Admin)
      logs = await allQuery(`
        SELECT TOP (@limit) l.*, c.name as cliente_nome, e.nome as empresa_nome
        FROM logs l
        LEFT JOIN clientes c ON l.cliente_id = c.id
        LEFT JOIN empresas e ON l.empresa_id = e.id
        WHERE e.nome != 'Master Admin'
        ORDER BY l.created_at DESC
      `, { limit });
      console.log(`✅ ${logs.length} logs carregados (master)`);
    } else {
      logs = await allQuery(`
        SELECT TOP (@limit) l.*, c.name as cliente_nome
        FROM logs l
        LEFT JOIN clientes c ON l.cliente_id = c.id
        WHERE l.empresa_id = @empresa_id
        ORDER BY l.created_at DESC
      `, { limit, empresa_id });
      console.log(`✅ ${logs.length} logs carregados para empresa ${empresa_id}`);
    }
    
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', verifyToken, async (req, res) => {
  try {
    const { tipo, cliente_id, evento_id, message, details } = req.body;
    const empresa_id = req.user.empresa_id;
    
    await query(
      `INSERT INTO logs (tipo, cliente_id, evento_id, message, details, empresa_id) 
       VALUES (@tipo, @cliente_id, @evento_id, @message, @details, @empresa_id)`,
      { tipo, cliente_id, evento_id, message, details, empresa_id }
    );
    
    console.log(`✅ Log registrado para empresa ${empresa_id}`);
    res.json({ ok: true });
  } catch (err) {
    console.error('❌ Erro ao registrar log:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
