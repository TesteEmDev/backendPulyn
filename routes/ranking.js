// routes/ranking.js - Rankings
const express = require('express');
const router = express.Router();
const { allQuery, queryOne } = require('../database');
const { verifyToken, isMaster } = require('../utils/middleware');

router.use(verifyToken, (req, res, next) => {
  if (req.user?.role === 'family') return res.status(403).json({ error: 'Famílias devem usar os endpoints de vínculo familiar' });
  next();
});

router.get('/eventos/:evento_id/ranking/criancas', verifyToken, async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const evento_id = req.params.evento_id;
    
    // ✅ Validar que o evento pertence à empresa do usuário
    const evento = await queryOne(
      'SELECT eventoId, empresaId FROM evento WHERE eventoId = @id',
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
      SELECT c.criancaId, c.nome, c.apelido, c.avatar, c.pontos, 
             t.nome as time_name, t.cor as time_color
      FROM crianca c
      LEFT JOIN time t ON c.timeId = t.timeId
      WHERE c.eventoId = @evento_id 
        AND (c.empresaId = @empresa_id OR @isMaster = 1)
        AND c.status = 'active'
      ORDER BY c.pontos DESC
    `, { evento_id, empresa_id, isMaster: isMaster(req) ? 1 : 0 });
    
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
      'SELECT eventoId, empresaId FROM evento WHERE eventoId = @id',
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
      SELECT t.*, COUNT(c.criancaId) as membros_count
      FROM time t
      LEFT JOIN crianca c ON c.timeId = t.timeId AND c.status = 'active'
      WHERE t.eventoId = @evento_id
        AND (t.empresaId = @empresa_id OR @isMaster = 1)
      GROUP BY t.timeId, t.nome, t.cor, t.pontos, t.criadoEm, t.eventoId, t.empresaId
      ORDER BY t.pontos DESC
    `, { evento_id, empresa_id, isMaster: isMaster(req) ? 1 : 0 });
    
    res.json(ranking);
  } catch (err) {
    console.error('❌ Erro ao buscar ranking de times:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
