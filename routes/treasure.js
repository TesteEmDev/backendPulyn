const express = require('express');
const router = express.Router();
const { queryOne, allQuery } = require('../database');
const { verifyToken, isMaster } = require('../utils/middleware');
const {
  getCheckpointTreasureStatus,
  getTreasureEventStatus,
  contarCheckpointsDisponiveis,
  getConfiguredTreasureCheckpointIds,
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

// Status completo para o recreacionista.
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
    const total = await contarCheckpointsDisponiveis(evento.eventoId, brincadeiraId);
    // Para o recreacionista escolher qual será o último: os mesmos checkpoints que o jogo pode usar agora
    const ids = await getConfiguredTreasureCheckpointIds(evento.eventoId, brincadeiraId);
    const nomes = new Map((await allQuery(
      'SELECT checkpointId, nome FROM "pontoVerificacao" WHERE LOWER(eventoId) = LOWER(@eventoId)',
      { eventoId: evento.eventoId }
    )).map((l) => [String(l.checkpointId).toLowerCase(), l.nome]));
    const checkpoints = ids.map((id) => ({ id, nome: nomes.get(String(id).toLowerCase()) || id }));
    res.json({ total, minimo: 2, checkpoints });
  } catch (err) {
    console.error('❌ Erro ao contar os checkpoints do Caça ao Tesouro:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
