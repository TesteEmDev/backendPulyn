// routes/zonaDominio.js - Zona (Domínio total, PulynBall): estado para o telão e o painel do recreacionista.
const express = require('express');
const { queryOne } = require('../database');
const { verifyToken, requireRole, isMaster } = require('../utils/middleware');
const { estadoDoDominio } = require('../utils/zonaDominio');

const router = express.Router();

router.get('/evento/:eventoId/estado', verifyToken, requireRole('admin', 'game_master', 'master', 'reception', 'display'), async (req, res) => {
  try {
    const evento = await queryOne(
      'SELECT eventoId, empresaId FROM evento WHERE LOWER(eventoId) = LOWER(@eventoId)',
      { eventoId: req.params.eventoId }
    );
    if (!evento) return res.status(404).json({ error: 'Evento não encontrado' });
    if (!isMaster(req) && String(evento.empresaId).toLowerCase() !== String(req.user.empresaId).toLowerCase()) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence à sua empresa' });
    }
    res.json(await estadoDoDominio(evento.eventoId));
  } catch (erro) {
    console.error('❌ [ZONA-DOMINIO] Erro ao obter o estado:', erro);
    res.status(500).json({ error: 'Não foi possível carregar o estado do jogo' });
  }
});

module.exports = router;
