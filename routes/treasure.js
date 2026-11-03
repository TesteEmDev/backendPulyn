const express = require('express');
const router = express.Router();
const { queryOne } = require('../database');
const { verifyToken, isMaster } = require('../utils/middleware');
const {
  getCheckpointTreasureStatus,
  getTreasureEventStatus,
  contarCheckpointsDisponiveis,
} = require('../utils/treasure');

// Endpoint público usado pelo ESP32 para saber se este checkpoint é o alvo.
router.get('/pontoVerificacao/:checkpointId/status', async (req, res) => {
  try {
    const status = await getCheckpointTreasureStatus(req.params.checkpointId);
    res.json(status);
  } catch (err) {
    console.error('❌ Erro ao consultar Caça ao Tesouro no checkpoint:', err);
    res.status(500).json({ error: err.message });
  }
});

// Status completo para o Game Master.
router.get('/evento/:eventoId/status', verifyToken, async (req, res) => {
  try {
    const evento = await queryOne(
      'SELECT eventoId, empresaId FROM evento WHERE LOWER(eventoId) = LOWER(@eventoId)',
      { eventoId: req.params.eventoId }
    );
    if (!evento) return res.status(404).json({ error: 'Evento não encontrado' });
    if (!isMaster(req)
      && String(evento.empresaId).trim().toLowerCase() !== String(req.user.empresaId).trim().toLowerCase()) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence à sua empresa' });
    }

    res.json(await getTreasureEventStatus(req.params.eventoId));
  } catch (err) {
    console.error('❌ Erro ao consultar status do Caça ao Tesouro:', err);
    res.status(500).json({ error: err.message });
  }
});

// Quantos checkpoints o jogo pode usar neste evento (da lista do jogo, online): o máximo da escolha do recreacionista.
router.get('/evento/:eventoId/checkpoints-disponiveis', verifyToken, async (req, res) => {
  try {
    const evento = await queryOne(
      'SELECT eventoId, empresaId FROM evento WHERE LOWER(eventoId) = LOWER(@eventoId)',
      { eventoId: req.params.eventoId }
    );
    if (!evento) return res.status(404).json({ error: 'Evento não encontrado' });
    if (!isMaster(req)
      && String(evento.empresaId).trim().toLowerCase() !== String(req.user.empresaId).trim().toLowerCase()) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence à sua empresa' });
    }
    const brincadeiraId = String(req.query.brincadeiraId || '').trim() || null;
    res.json({ total: await contarCheckpointsDisponiveis(evento.eventoId, brincadeiraId), minimo: 2 });
  } catch (err) {
    console.error('❌ Erro ao contar os checkpoints do Caça ao Tesouro:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
