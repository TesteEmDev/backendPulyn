// routes/ranking.js - Rankings
const express = require('express');
const router = express.Router();
const { allQuery, queryOne } = require('../database');
const { verifyToken, isMaster } = require('../utils/middleware');

router.use(verifyToken, (req, res, next) => {
  if (req.user?.role === 'family') return res.status(403).json({ error: 'Famílias devem usar os endpoints de vínculo familiar' });
  next();
});

router.get('/eventos/:eventoId/ranking/criancas', verifyToken, async (req, res) => {
  try {
    const empresaId = req.user.empresaId;
    const eventoId = req.params.eventoId;
    
    // ✅ Validar que o evento pertence à empresa do usuário
    const evento = await queryOne(
      'SELECT id, empresaId FROM eventos WHERE id = @id',
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
      SELECT c.id, c.name, c.nickname, c.avatar, c.scores, 
             t.name as time_name, t.color as time_color
      FROM criancas c
      LEFT JOIN times t ON c.timeId = t.id
      WHERE c.eventoId = @eventoId 
        AND (c.empresaId = @empresaId OR @isMaster = 1)
        AND c.status = 'active'
      ORDER BY c.scores DESC
    `, { eventoId, empresaId, isMaster: isMaster(req) ? 1 : 0 });
    
    res.json(ranking);
  } catch (err) {
    console.error('❌ Erro ao buscar ranking de crianças:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/eventos/:eventoId/ranking/times', verifyToken, async (req, res) => {
  try {
    const empresaId = req.user.empresaId;
    const eventoId = req.params.eventoId;
    
    // ✅ Validar que o evento pertence à empresa do usuário
    const evento = await queryOne(
      'SELECT id, empresaId FROM eventos WHERE id = @id',
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
      SELECT t.*, COUNT(c.id) as membros_count
      FROM times t
      LEFT JOIN criancas c ON c.timeId = t.id AND c.status = 'active'
      WHERE t.eventoId = @eventoId
        AND (t.empresaId = @empresaId OR @isMaster = 1)
      GROUP BY t.id, t.name, t.color, t.points, t.criadoEm, t.eventoId, t.empresaId
      ORDER BY t.points DESC
    `, { eventoId, empresaId, isMaster: isMaster(req) ? 1 : 0 });
    
    res.json(ranking);
  } catch (err) {
    console.error('❌ Erro ao buscar ranking de times:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
