// routes/partidaPulynBall.js - rotas dos jogos de partida/rounds do PulynBall (Conquistar e Destruir, Resgate do Refém)
//
// criarRotas(motor, rotulo) monta as rotas de um jogo a partir do motor dele (utils/bomba.js, utils/refem.js), que
// oferece obterEstado, iniciarRound, processarLeitura etc. com a mesma assinatura.
//
// Painéis (recreacionista, telão): exigem login e só enxergam eventos da própria empresa.
// Checkpoints (ESP32): /leitura e /pontoVerificacao/:id/estado ficam sem token, como o heartbeat e as demais
// leituras dos checkpoints; o checkpoint é validado pelo id cadastrado.
const express = require('express');
const { queryOne } = require('../database');
const { verifyToken, requireRole, isMaster } = require('../utils/middleware');

function criarRotas(motor, rotulo) {
  const router = express.Router();

  const LER = requireRole('admin', 'game_master', 'master', 'reception', 'display');
  const GERIR = requireRole('admin', 'game_master', 'master');

  function responderErro(res, erro, mensagemPadrao) {
    if (erro.statusCode) return res.status(erro.statusCode).json({ error: erro.message });
    console.error(`❌ [PULYNBALL] ${mensagemPadrao}:`, erro);
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
    const partida = await motor.buscarPartidaAtiva(evento.eventoId);
    if (!partida) {
      res.status(409).json({ error: `Nenhuma partida de ${rotulo} em andamento neste evento` });
      return null;
    }
    return partida;
  }

  // ---------- tela PulynBall (admin): regras de cada jogo ----------

  // O jogo é do plano PulynBall: o master pode abrir em qualquer empresa.
  async function exigirPlanoPulynBall(req, res, empresaId) {
    if (isMaster(req) || await motor.empresaTemPlanoPulynBall(empresaId)) return true;
    res.status(403).json({ error: 'Este jogo é exclusivo do plano PulynBall.' });
    return false;
  }

  router.get('/jogos', verifyToken, requireRole('admin', 'master'), async (req, res) => {
    try {
      const eventoId = String(req.query.eventoId || '').trim();
      if (!eventoId) return res.status(400).json({ error: 'eventoId é obrigatório' });
      const evento = await queryOne('SELECT eventoId, empresaId FROM evento WHERE LOWER(eventoId) = LOWER(@eventoId)', { eventoId });
      if (!evento) return res.status(404).json({ error: 'Evento não encontrado' });
      if (!isMaster(req) && String(evento.empresaId).toLowerCase() !== String(req.user.empresaId).toLowerCase()) {
        return res.status(403).json({ error: 'Acesso negado: evento não pertence à sua empresa' });
      }
      if (!(await exigirPlanoPulynBall(req, res, evento.empresaId))) return;
      res.json({
        jogos: await motor.listarJogos(evento.eventoId, evento.empresaId),
        padroes: motor.PADROES,
        limites: motor.LIMITES,
      });
    } catch (erro) {
      responderErro(res, erro, 'Não foi possível carregar os jogos PulynBall');
    }
  });

  router.put('/jogos/:brincadeiraId', verifyToken, requireRole('admin', 'master'), async (req, res) => {
    try {
      const jogo = await queryOne('SELECT empresaId FROM brincadeira WHERE LOWER(brincadeiraId) = LOWER(@id)', { id: req.params.brincadeiraId });
      if (!jogo) return res.status(404).json({ error: 'Jogo não encontrado' });
      if (!isMaster(req) && String(jogo.empresaId).toLowerCase() !== String(req.user.empresaId).toLowerCase()) {
        return res.status(403).json({ error: 'Acesso negado: o jogo não pertence à sua empresa' });
      }
      if (!(await exigirPlanoPulynBall(req, res, jogo.empresaId))) return;
      res.json(await motor.salvarJogo(req.params.brincadeiraId, jogo.empresaId, req.body || {}));
    } catch (erro) {
      responderErro(res, erro, 'Não foi possível salvar o jogo');
    }
  });

  // ---------- painéis ----------

  router.get('/evento/:eventoId', verifyToken, LER, async (req, res) => {
    try {
      const evento = await carregarEvento(req, res);
      if (!evento) return;
      res.json(await motor.obterEstado(evento.eventoId));
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
      await motor.numerarJogadores(evento.eventoId, [partida.timeAId, partida.timeBId]);
      res.json(await motor.obterEstado(evento.eventoId));
    } catch (erro) {
      responderErro(res, erro, 'Não foi possível numerar os jogadores');
    }
  });

  router.put('/evento/:eventoId/jogador/:criancaId', verifyToken, GERIR, async (req, res) => {
    try {
      const evento = await carregarEvento(req, res);
      if (!evento) return;
      await motor.definirNumeroJogador(evento.eventoId, req.params.criancaId, req.body?.numero);
      res.json(await motor.obterEstado(evento.eventoId));
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
      res.json(await motor.configurarPartida(partida.partidaId, req.body || {}));
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
      res.json(await motor.iniciarRound(partida.partidaId));
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
      res.json(await motor.encerrarRoundManual(partida.partidaId, req.body?.vencedor));
    } catch (erro) {
      responderErro(res, erro, 'Não foi possível encerrar o round');
    }
  });

  // ---------- checkpoints ----------

  // Chamado a cada 500 ms enquanto a pulseira está no leitor.
  router.post('/leitura', async (req, res) => {
    try {
      const { checkpointId, uid } = req.body || {};
      res.json(await motor.processarLeitura({ checkpointId, uid }));
    } catch (erro) {
      responderErro(res, erro, 'Não foi possível processar a leitura');
    }
  });

  router.get('/pontoVerificacao/:checkpointId/estado', async (req, res) => {
    try {
      res.json(await motor.obterEstadoCheckpoint(req.params.checkpointId));
    } catch (erro) {
      responderErro(res, erro, 'Não foi possível consultar o estado do checkpoint');
    }
  });

  return router;
}

module.exports = criarRotas;
