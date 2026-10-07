// routes/ranking.js - Rankings
const express = require('express');
const router = express.Router();
const { allQuery, queryOne } = require('../database');
const { verifyToken, isMaster } = require('../utils/middleware');

router.use(verifyToken, (req, res, next) => {
  if (req.user?.role === 'family') return res.status(403).json({ error: 'Famílias devem usar os endpoints de vínculo familiar' });
  next();
});

router.get('/evento/:eventoId/ranking/crianca', verifyToken, async (req, res) => {
  try {
    const empresaId = req.user.empresaId;
    const eventoId = req.params.eventoId;
    
    // ✅ Validar que o evento pertence à empresa do usuário
    const evento = await queryOne(
      'SELECT eventoId, empresaId FROM evento WHERE eventoId = @id',
      { id: eventoId }
    );
    
    if (!evento) {
      return res.status(404).json({ error: 'Evento não encontrado' });
    }
    
    // ✅ Verificar permissão (apenas master ou de mesma empresa)
    if (!isMaster(req) && evento.empresaId !== empresaId) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence a esta empresa' });
    }
    
    const ranking = await allQuery(`
      SELECT c.criancaId, c.nome, c.apelido, c.avatar, c.pontos, 
             t.nome as time_nome, t.cor as time_color
      FROM crianca c
      LEFT JOIN "time" t ON c.timeId = t.timeId
      WHERE c.eventoId = @eventoId 
        AND (c.empresaId = @empresaId OR @isMaster = 1)
        AND c.status = 'active'
      ORDER BY c.pontos DESC
    `, { eventoId, empresaId, isMaster: isMaster(req) ? 1 : 0 });
    
    res.json(ranking);
  } catch (err) {
    console.error('❌ Erro ao buscar ranking de crianças:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/evento/:eventoId/ranking/time', verifyToken, async (req, res) => {
  try {
    const empresaId = req.user.empresaId;
    const eventoId = req.params.eventoId;
    
    // ✅ Validar que o evento pertence à empresa do usuário
    const evento = await queryOne(
      'SELECT eventoId, empresaId FROM evento WHERE eventoId = @id',
      { id: eventoId }
    );
    
    if (!evento) {
      return res.status(404).json({ error: 'Evento não encontrado' });
    }
    
    // ✅ Verificar permissão (apenas master ou de mesma empresa)
    if (!isMaster(req) && evento.empresaId !== empresaId) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence a esta empresa' });
    }
    
    const ranking = await allQuery(`
      SELECT t.*, COUNT(c.criancaId) as membros_count
      FROM "time" t
      LEFT JOIN crianca c ON c.timeId = t.timeId AND c.status = 'active'
      WHERE t.eventoId = @eventoId
        AND (t.empresaId = @empresaId OR @isMaster = 1)
      GROUP BY t.timeId, t.nome, t.cor, t.pontos, t.criadoEm, t.eventoId, t.empresaId
      ORDER BY t.pontos DESC
    `, { eventoId, empresaId, isMaster: isMaster(req) ? 1 : 0 });
    
    res.json(ranking);
  } catch (err) {
    console.error('❌ Erro ao buscar ranking de time:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
