const express = require('express');
const router = express.Router();
const { queryOne } = require('../database');
const { verifyToken, isMaster } = require('../utils/middleware');
const {
  getCheckpointTreasureStatus,
  getTreasureEventStatus,
} = require('../utils/treasure');

// Endpoint público usado pelo ESP32 para saber se este checkpoint é o alvo.
router.get('/checkpoints/:checkpointId/status', async (req, res) => {
  try {
    const status = await getCheckpointTreasureStatus(req.params.checkpointId);
    res.json(status);
  } catch (err) {
    console.error('❌ Erro ao consultar Caça ao Tesouro no checkpoint:', err);
    res.status(500).json({ error: err.message });
  }
});

// Status completo para o Game Master.
router.get('/eventos/:eventoId/status', verifyToken, async (req, res) => {
  try {
    const evento = await queryOne(
      'SELECT id, empresa_id FROM eventos WHERE LOWER(id) = LOWER(@eventoId)',
      { eventoId: req.params.eventoId }
    );
    if (!evento) return res.status(404).json({ error: 'Evento não encontrado' });
    if (!isMaster(req)
      && String(evento.empresa_id).trim().toLowerCase() !== String(req.user.empresa_id).trim().toLowerCase()) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence à sua empresa' });
    }

    res.json(await getTreasureEventStatus(req.params.eventoId));
  } catch (err) {
    console.error('❌ Erro ao consultar status do Caça ao Tesouro:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
