// routes/gameSelection.js - "Sem jogos": tira a seleção do jogo e deixa o mapa livre no telão
//
// Escolher um jogo (POST /api/debug/select-game) faz o telão mostrar as regras dele. Aqui o recreacionista desfaz a escolha:
// o evento volta ao estado de antes de escolher qualquer jogo e o telão mostra o mapa livre. Com um jogo rodando não vale.
const express = require('express');
const router = express.Router();
const { queryOne } = require('../database');
const { verifyToken, requireRole, isMaster } = require('../utils/middleware');
const { getGameState, saveGameState } = require('../utils/gameState');
const { isClosedStatus } = require('../utils/eventLifecycle');

router.post('/clear-game-selection', verifyToken, requireRole('admin', 'game_master', 'master'), async (req, res) => {
  try {
    const { eventoId } = req.body || {};
    if (!eventoId) return res.status(400).json({ error: 'eventoId é obrigatório' });

    const evento = await queryOne(
      'SELECT eventoId, empresaId, status FROM evento WHERE LOWER("eventoId") = LOWER(@eventoId)',
      { eventoId }
    );
    if (!evento) return res.status(404).json({ error: 'Evento não encontrado' });
    if (!isMaster(req) && String(evento.empresaId).toLowerCase() !== String(req.user.empresaId).toLowerCase()) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence à sua empresa' });
    }
    if (isClosedStatus(evento.status)) return res.status(409).json({ error: 'Este evento já foi encerrado.' });

    const estado = await getGameState(evento.eventoId);
    if (estado?.modo === 'game') {
      return res.status(409).json({ error: 'Finalize o jogo atual antes de escolher "Sem jogos"' });
    }

    await saveGameState({
      eventoId: evento.eventoId,
      empresaId: evento.empresaId,
      mode: 'idle',
      gameType: 'none',
      gameId: null,
      gameName: null,
      startedAt: null,
      stoppedAt: estado?.paradoEm || null,
    });

    const payload = { eventoId: evento.eventoId, clearedAt: new Date().toISOString() };
    if (global.broadcastToEvent) {
      global.broadcastToEvent(evento.eventoId, { type: 'GAME_SELECTION_CLEARED', payload });
    }
    res.json({ ok: true, ...payload });
  } catch (error) {
    console.error('❌ Erro ao limpar a seleção do jogo:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
