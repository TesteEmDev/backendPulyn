// routes/bomba.js - Conquistar e Destruir (PulynBall)
//
// Painéis (recreacionista, telão): exigem login e só enxergam eventos da própria empresa.
// Checkpoints (ESP32): /leitura e /pontoVerificacao/:id/estado ficam sem token, como o heartbeat e as demais
// leituras dos checkpoints; o checkpoint é validado pelo id cadastrado.
const express = require('express');
const { queryOne } = require('../database');
const { verifyToken, requireRole, isMaster } = require('../utils/middleware');
const bomba = require('../utils/bomba');

const router = express.Router();

const LER = requireRole('admin', 'game_master', 'master', 'reception', 'display');
const GERIR = requireRole('admin', 'game_master', 'master');

function responderErro(res, erro, mensagemPadrao) {
  if (erro.statusCode) return res.status(erro.statusCode).json({ error: erro.message });
  console.error(`❌ [BOMBA] ${mensagemPadrao}:`, erro);
  return res.status(500).json({ error: mensagemPadrao });
}

// O evento precisa existir e ser da empresa do usuário (o master vê todos).
async function carregarEvento(req, res) {
  const evento = await queryOne(
    'SELECT eventoId, empresaId FROM evento WHERE LOWER(eventoId) = LOWER(@eventoId)',
    { eventoId: req.params.eventoId }
  );
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

async function partidaAtivaOuErro(evento, res) {
  const partida = await bomba.buscarPartidaAtiva(evento.eventoId);
  if (!partida) {
    res.status(409).json({ error: 'Nenhuma partida de Conquistar e Destruir em andamento neste evento' });
    return null;
  }
  return partida;
}

// ---------- painéis ----------

router.get('/evento/:eventoId', verifyToken, LER, async (req, res) => {
  try {
    const evento = await carregarEvento(req, res);
    if (!evento) return;
    res.json(await bomba.obterEstado(evento.eventoId));
  } catch (erro) {
    responderErro(res, erro, 'Não foi possível carregar a partida');
  }
});

// Numera automaticamente quem ainda não tem número (o recreacionista pode ajustar depois).
router.post('/evento/:eventoId/numerar', verifyToken, GERIR, async (req, res) => {
  try {
    const evento = await carregarEvento(req, res);
    if (!evento) return;
    const partida = await partidaAtivaOuErro(evento, res);
    if (!partida) return;
    await bomba.numerarJogadores(evento.eventoId, [partida.timeAId, partida.timeBId]);
    res.json(await bomba.obterEstado(evento.eventoId));
  } catch (erro) {
    responderErro(res, erro, 'Não foi possível numerar os jogadores');
  }
});

router.put('/evento/:eventoId/jogador/:criancaId', verifyToken, GERIR, async (req, res) => {
  try {
    const evento = await carregarEvento(req, res);
    if (!evento) return;
    await bomba.definirNumeroJogador(evento.eventoId, req.params.criancaId, req.body?.numero);
    res.json(await bomba.obterEstado(evento.eventoId));
  } catch (erro) {
    responderErro(res, erro, 'Não foi possível salvar o número do jogador');
  }
});

// Equipes, lado inicial e regras (só antes do primeiro round).
router.post('/evento/:eventoId/partida/configurar', verifyToken, GERIR, async (req, res) => {
  try {
    const evento = await carregarEvento(req, res);
    if (!evento) return;
    const partida = await partidaAtivaOuErro(evento, res);
    if (!partida) return;
    res.json(await bomba.configurarPartida(partida.partidaId, req.body || {}));
  } catch (erro) {
    responderErro(res, erro, 'Não foi possível configurar a partida');
  }
});

router.post('/evento/:eventoId/round/iniciar', verifyToken, GERIR, async (req, res) => {
  try {
    const evento = await carregarEvento(req, res);
    if (!evento) return;
    const partida = await partidaAtivaOuErro(evento, res);
    if (!partida) return;
    res.json(await bomba.iniciarRound(partida.partidaId));
  } catch (erro) {
    responderErro(res, erro, 'Não foi possível iniciar o round');
  }
});

// Encerra o round à mão: { vencedor: 'tr' | 'ct' } (por exemplo, equipe inteira eliminada).
router.post('/evento/:eventoId/round/encerrar', verifyToken, GERIR, async (req, res) => {
  try {
    const evento = await carregarEvento(req, res);
    if (!evento) return;
    const partida = await partidaAtivaOuErro(evento, res);
    if (!partida) return;
    res.json(await bomba.encerrarRoundManual(partida.partidaId, req.body?.vencedor));
  } catch (erro) {
    responderErro(res, erro, 'Não foi possível encerrar o round');
  }
});

// ---------- checkpoints ----------

// Chamado a cada 500 ms enquanto a pulseira está no leitor.
router.post('/leitura', async (req, res) => {
  try {
    const { checkpointId, uid } = req.body || {};
    res.json(await bomba.processarLeitura({ checkpointId, uid }));
  } catch (erro) {
    responderErro(res, erro, 'Não foi possível processar a leitura');
  }
});

router.get('/pontoVerificacao/:checkpointId/estado', async (req, res) => {
  try {
    res.json(await bomba.obterEstadoCheckpoint(req.params.checkpointId));
  } catch (erro) {
    responderErro(res, erro, 'Não foi possível consultar o estado do checkpoint');
  }
});

module.exports = router;
