// routes/ranking.js - Rankings
const express = require('express');
const router = express.Router();
const { allQuery, queryOne } = require('../database');
const { verifyToken, isMaster } = require('../utils/middleware');

router.get('/eventos/:evento_id/ranking/criancas', verifyToken, async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const evento_id = req.params.evento_id;
    
    // ✅ Validar que o evento pertence à empresa do usuário
    const evento = await queryOne(
      'SELECT id, empresa_id FROM eventos WHERE id = @id',
      { id: evento_id }
    );
    
    if (!evento) {
      return res.status(404).json({ error: 'Evento não encontrado' });
    }
    
    // ✅ Verificar permissão (apenas master ou de mesma empresa)
    if (!isMaster(req) && evento.empresa_id !== empresa_id) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence a esta empresa' });
    }
    
    const ranking = await allQuery(`
      SELECT c.id, c.name, c.nickname, c.avatar, c.scores, 
             t.name as time_name, t.color as time_color
      FROM criancas c
      LEFT JOIN times t ON c.time_id = t.id
      WHERE c.evento_id = @evento_id 
        AND c.empresa_id = @empresa_id
        AND c.status = 'active'
      ORDER BY c.scores DESC
    `, { evento_id, empresa_id });
    
    res.json(ranking);
  } catch (err) {
    console.error('❌ Erro ao buscar ranking de crianças:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/eventos/:evento_id/ranking/times', verifyToken, async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const evento_id = req.params.evento_id;
    
    // ✅ Validar que o evento pertence à empresa do usuário
    const evento = await queryOne(
      'SELECT id, empresa_id FROM eventos WHERE id = @id',
      { id: evento_id }
    );
    
    if (!evento) {
      return res.status(404).json({ error: 'Evento não encontrado' });
    }
    
    // ✅ Verificar permissão (apenas master ou de mesma empresa)
    if (!isMaster(req) && evento.empresa_id !== empresa_id) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence a esta empresa' });
    }
    
    const ranking = await allQuery(`
      SELECT t.*, COUNT(c.id) as membros_count
      FROM times t
      LEFT JOIN criancas c ON c.time_id = t.id AND c.status = 'active'
      WHERE t.evento_id = @evento_id
        AND t.empresa_id = @empresa_id
      GROUP BY t.id, t.name, t.color, t.points, t.created_at, t.evento_id, t.empresa_id
      ORDER BY t.points DESC
    `, { evento_id, empresa_id });
    
    res.json(ranking);
  } catch (err) {
    console.error('❌ Erro ao buscar ranking de times:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
