const express = require('express');
const router = express.Router();
const { queryOne } = require('../database');
const { verifyToken, isMaster } = require('../utils/middleware');
const {
  getCheckpointMonsterStatus,
  getMonsterEventStatus,
} = require('../utils/monster');

router.get('/pontoVerificacao/:checkpointId/status', async (req, res) => {
  try {
    res.json(await getCheckpointMonsterStatus(req.params.checkpointId));
  } catch (err) {
    console.error('❌ Erro ao consultar Caça ao Monstro no checkpoint:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/evento/:eventoId/status', verifyToken, async (req, res) => {
  try {
    const evento = await queryOne(
      'SELECT id, empresaId FROM evento WHERE LOWER(id) = LOWER(@eventoId)',
      { eventoId: req.params.eventoId }
    );
    if (!evento) return res.status(404).json({ error: 'Evento não encontrado' });
    if (!isMaster(req)
      && String(evento.empresaId).trim().toLowerCase() !== String(req.user.empresaId).trim().toLowerCase()) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence à sua empresa' });
    }
    res.json(await getMonsterEventStatus(evento.id));
  } catch (err) {
    console.error('❌ Erro ao consultar status do Caça ao Monstro:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
