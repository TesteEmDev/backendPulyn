// routes/parallelGames.js - Brincadeira paralela (corrida do checkpoint) do recreacionista
const express = require('express');
const router = express.Router();
const { queryOne } = require('../database');
const { verifyToken, requireRole, isMaster } = require('../utils/middleware');
const { getParallelGameOverview, startParallelGame, stopParallelGame } = require('../utils/parallelGame');
const { listObjects, addObject, renameObject, removeObject } = require('../utils/parallelObjects');

router.use(verifyToken, requireRole('admin', 'game_master', 'master'));

// O evento precisa ser da empresa do usuário (o master pode operar qualquer um).
async function loadEvent(req, res) {
  const evento = await queryOne('SELECT eventoId, empresaId FROM evento WHERE LOWER(eventoId) = LOWER(@id)', { id: req.params.eventoId });
  if (!evento) {
    res.status(404).json({ error: 'Evento não encontrado' });
    return null;
  }
  if (!isMaster(req) && String(evento.empresaId).toLowerCase() !== String(req.user.empresaId).toLowerCase()) {
    res.status(403).json({ error: 'Acesso negado: evento não pertence à sua empresa' });
    return null;
  }
  return evento;
}

const sendError = (res, err, label) => {
  if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
  console.error(`❌ [PARALELA] ${label}:`, err);
  return res.status(500).json({ error: err.message });
};

// ---- Lista de objetos da brincadeira "Ache o objeto" (por empresa) ----
router.get('/objects', async (req, res) => {
  try {
    res.json(await listObjects(req.user.empresaId));
  } catch (err) {
    sendError(res, err, 'Erro ao listar os objetos');
  }
});

router.post('/objects', async (req, res) => {
  try {
    res.status(201).json(await addObject(req.user.empresaId, req.body?.name));
  } catch (err) {
    sendError(res, err, 'Erro ao adicionar o objeto');
  }
});

router.put('/objects/:id', async (req, res) => {
  try {
    res.json(await renameObject(req.user.empresaId, req.params.id, req.body?.name));
  } catch (err) {
    sendError(res, err, 'Erro ao editar o objeto');
  }
});

router.delete('/objects/:id', async (req, res) => {
  try {
    await removeObject(req.user.empresaId, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err, 'Erro ao remover o objeto');
  }
});

router.get('/eventos/:eventoId', async (req, res) => {
  try {
    const evento = await loadEvent(req, res);
    if (!evento) return;
    res.json(await getParallelGameOverview(evento.eventoId));
  } catch (err) {
    sendError(res, err, 'Erro ao consultar a brincadeira paralela');
  }
});

router.post('/eventos/:eventoId/start', async (req, res) => {
  try {
    const evento = await loadEvent(req, res);
    if (!evento) return;
    const game = await startParallelGame({
      eventoId: evento.eventoId,
      empresaId: evento.empresaId,
      checkpointId: String(req.body?.checkpointId || '').trim(),
      userId: req.user.id,
    });
    res.status(201).json(game);
  } catch (err) {
    sendError(res, err, 'Erro ao iniciar a brincadeira paralela');
  }
});

router.post('/eventos/:eventoId/stop', async (req, res) => {
  try {
    const evento = await loadEvent(req, res);
    if (!evento) return;
    const stoppedId = await stopParallelGame(evento.eventoId, 'manual');
    if (!stoppedId) return res.status(404).json({ error: 'Nenhuma brincadeira paralela em andamento' });
    res.json({ ok: true, id: stoppedId });
  } catch (err) {
    sendError(res, err, 'Erro ao encerrar a brincadeira paralela');
  }
});

module.exports = router;
