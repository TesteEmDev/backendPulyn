// routes/checkpointsRecebimento.js - o admin do buffet recebe os checkpoints transferidos pelo super admin
// Montada em /api/pontoVerificacao/recebimento. Só o admin do buffet (empresaId do token). Ciclo de vida e regras:
// utils/checkpointTransferencia.js. Enquanto a chave interna é o checkpointId, as rotas o usam no caminho.
const express = require('express');
const router = express.Router();
const { query, queryOne, allQuery } = require('../database');
const { verifyToken, requireRole } = require('../utils/middleware');
const { STATUS, validarNumCheck, podeAceitar, podeRecusar } = require('../utils/checkpointTransferencia');

router.use(verifyToken, requireRole('admin'));

const COLUNAS = `p.checkpointId, p.numCheck, p.macAddress, p.nome, p.tipo, p.proposito, p.status, p.ultimoVisto,
  p.statusTransferencia, p.eventoId, p.transferidoEm, e.nome AS eventoNome`;

const buscar = (checkpointId) => queryOne(
  `SELECT ${COLUNAS}, p.empresaId, p.empresaDestinoId
   FROM pontoVerificacao p LEFT JOIN evento e ON e.eventoId = p.eventoId
   WHERE p.checkpointId = @checkpointId`,
  { checkpointId }
);

const eventoDoBuffet = (eventoId, empresaId) => queryOne(
  'SELECT eventoId, nome FROM evento WHERE eventoId = @eventoId AND empresaId = @empresaId',
  { eventoId, empresaId }
);

// Número já usado por outro checkpoint do mesmo buffet (sem diferenciar maiúsculas de minúsculas).
const numeroEmUso = (empresaId, numCheck, ignorarCheckpointId) => queryOne(
  `SELECT checkpointId, nome FROM pontoVerificacao
   WHERE empresaId = @empresaId AND LOWER(numCheck) = LOWER(@numCheck) AND checkpointId <> @ignorar`,
  { empresaId, numCheck, ignorar: ignorarCheckpointId }
);

// Pendente para o buffet ou já dele. Quem não tem nada a ver com o checkpoint recebe 404, sem saber que ele existe.
const eDoBuffet = (cp, empresaId) => cp.empresaDestinoId === empresaId || cp.empresaId === empresaId;

const violouUnicidade = (err) => err && err.code === '23505';

// Checkpoints transferidos para este buffet que esperam o aceite.
router.get('/pendentes', async (req, res) => {
  try {
    const linhas = await allQuery(
      `SELECT p.checkpointId, p.numCheck, p.macAddress, p.nome, p.tipo, p.proposito, p.transferidoEm
       FROM pontoVerificacao p
       WHERE p.empresaDestinoId = @empresaId AND p.statusTransferencia = @pendente
       ORDER BY p.transferidoEm, p.checkpointId`,
      { empresaId: req.user.empresaId, pendente: STATUS.PENDENTE }
    );
    res.json(linhas);
  } catch (err) {
    console.error('❌ [RECEBIMENTO] Erro ao listar pendentes:', err);
    res.status(500).json({ error: err.message });
  }
});

// Checkpoints do buffet, vindos do fluxo novo (com MAC), que ainda não estão em nenhum evento.
router.get('/sem-evento', async (req, res) => {
  try {
    const linhas = await allQuery(
      `SELECT ${COLUNAS}
       FROM pontoVerificacao p LEFT JOIN evento e ON e.eventoId = p.eventoId
       WHERE p.empresaId = @empresaId AND p.statusTransferencia = @aceito
         AND p.macAddress IS NOT NULL AND p.eventoId IS NULL
       ORDER BY p.nome, p.checkpointId`,
      { empresaId: req.user.empresaId, aceito: STATUS.ACEITO }
    );
    res.json(linhas);
  } catch (err) {
    console.error('❌ [RECEBIMENTO] Erro ao listar checkpoints sem evento:', err);
    res.status(500).json({ error: err.message });
  }
});

// Aceita o checkpoint: passa a ser do buffet, com o número que o admin definir e, se quiser já, um evento.
router.post('/:checkpointId/aceitar', async (req, res) => {
  try {
    const { empresaId } = req.user;
    const atual = await buscar(req.params.checkpointId);
    if (!atual || !eDoBuffet(atual, empresaId)) return res.status(404).json({ error: 'Checkpoint não encontrado' });
    if (!podeAceitar(atual.statusTransferencia)) {
      return res.status(409).json({ error: `Este checkpoint não está pendente (situação: "${atual.statusTransferencia}")` });
    }

    const numero = validarNumCheck(req.body.numCheck ?? atual.numCheck);
    if (!numero.ok) return res.status(400).json({ error: numero.erro });
    if (!numero.valor) return res.status(400).json({ error: 'Informe o número do checkpoint' });

    const repetido = await numeroEmUso(empresaId, numero.valor, atual.checkpointId);
    if (repetido) {
      return res.status(409).json({ error: `Já existe um checkpoint com o número "${numero.valor}" no seu buffet (${repetido.nome}). Use outro número.` });
    }

    let eventoId = null;
    if (req.body.eventoId) {
      const evento = await eventoDoBuffet(String(req.body.eventoId), empresaId);
      if (!evento) return res.status(404).json({ error: 'Evento não encontrado neste buffet' });
      eventoId = evento.eventoId;
    }

    // `codigo` acompanha o número enquanto as rotas atuais ainda o usam como o ID exibido do checkpoint.
    const atualizado = await queryOne(
      `UPDATE pontoVerificacao
       SET statusTransferencia = @aceito, empresaId = @empresaId, empresaDestinoId = NULL,
           numCheck = @numCheck, codigo = @numCheck, eventoId = @eventoId, atualizadoEm = now()
       WHERE checkpointId = @checkpointId AND statusTransferencia = @pendente AND empresaDestinoId = @empresaId
       RETURNING checkpointId`,
      { aceito: STATUS.ACEITO, pendente: STATUS.PENDENTE, empresaId, numCheck: numero.valor, eventoId, checkpointId: atual.checkpointId }
    );
    if (!atualizado) return res.status(409).json({ error: 'O checkpoint mudou de situação; atualize a lista e tente de novo' });

    console.log(`✅ [RECEBIMENTO] Buffet ${empresaId} aceitou o checkpoint ${atual.checkpointId} como nº ${numero.valor}${eventoId ? ` (evento ${eventoId})` : ''}`);
    res.json(await buscar(atual.checkpointId));
  } catch (err) {
    if (violouUnicidade(err)) return res.status(409).json({ error: 'Já existe um checkpoint com esse número no seu buffet' });
    console.error('❌ [RECEBIMENTO] Erro ao aceitar:', err);
    res.status(500).json({ error: err.message });
  }
});

// Recusa: o checkpoint volta ao estoque do super admin.
router.post('/:checkpointId/recusar', async (req, res) => {
  try {
    const { empresaId } = req.user;
    const atual = await buscar(req.params.checkpointId);
    if (!atual || !eDoBuffet(atual, empresaId)) return res.status(404).json({ error: 'Checkpoint não encontrado' });
    if (!podeRecusar(atual.statusTransferencia)) {
      return res.status(409).json({ error: `Este checkpoint não está pendente (situação: "${atual.statusTransferencia}")` });
    }

    const atualizado = await queryOne(
      `UPDATE pontoVerificacao
       SET statusTransferencia = @estoque, empresaDestinoId = NULL, transferidoEm = NULL, atualizadoEm = now()
       WHERE checkpointId = @checkpointId AND statusTransferencia = @pendente AND empresaDestinoId = @empresaId
       RETURNING checkpointId`,
      { estoque: STATUS.ESTOQUE, pendente: STATUS.PENDENTE, empresaId, checkpointId: atual.checkpointId }
    );
    if (!atualizado) return res.status(409).json({ error: 'O checkpoint mudou de situação; atualize a lista e tente de novo' });

    console.log(`↩️ [RECEBIMENTO] Buffet ${empresaId} recusou o checkpoint ${atual.checkpointId}`);
    res.json({ success: true });
  } catch (err) {
    console.error('❌ [RECEBIMENTO] Erro ao recusar:', err);
    res.status(500).json({ error: err.message });
  }
});

// Carrega um checkpoint já aceito do buffet e que veio do fluxo novo (tem MAC). Os mais antigos seguem pelas telas de antes.
async function checkpointDoBuffet(req, res) {
  const atual = await buscar(req.params.checkpointId);
  if (!atual || atual.empresaId !== req.user.empresaId) {
    res.status(404).json({ error: 'Checkpoint não encontrado' });
    return null;
  }
  if (atual.statusTransferencia !== STATUS.ACEITO || !atual.macAddress) {
    res.status(409).json({ error: 'Só checkpoints recebidos pelo cadastro novo (com MAC) podem ser alterados aqui' });
    return null;
  }
  return atual;
}

// Troca o número do checkpoint. Os jogos e o histórico apontam para a chave interna, então nada se perde.
router.patch('/:checkpointId/numero', async (req, res) => {
  try {
    const atual = await checkpointDoBuffet(req, res);
    if (!atual) return;

    const numero = validarNumCheck(req.body.numCheck);
    if (!numero.ok) return res.status(400).json({ error: numero.erro });
    if (!numero.valor) return res.status(400).json({ error: 'Informe o número do checkpoint' });

    const repetido = await numeroEmUso(req.user.empresaId, numero.valor, atual.checkpointId);
    if (repetido) {
      return res.status(409).json({ error: `Já existe um checkpoint com o número "${numero.valor}" no seu buffet (${repetido.nome}). Use outro número.` });
    }

    await query(
      'UPDATE pontoVerificacao SET numCheck = @numCheck, codigo = @numCheck, atualizadoEm = now() WHERE checkpointId = @checkpointId',
      { numCheck: numero.valor, checkpointId: atual.checkpointId }
    );
    console.log(`🔢 [RECEBIMENTO] Checkpoint ${atual.checkpointId}: número ${atual.numCheck} -> ${numero.valor}`);
    res.json(await buscar(atual.checkpointId));
  } catch (err) {
    if (violouUnicidade(err)) return res.status(409).json({ error: 'Já existe um checkpoint com esse número no seu buffet' });
    console.error('❌ [RECEBIMENTO] Erro ao trocar o número:', err);
    res.status(500).json({ error: err.message });
  }
});

// Coloca o checkpoint em um evento (ou tira, com eventoId null). Se ele já tem leituras ou pontos, o evento não muda:
// o histórico pertence ao evento em que foi feito.
router.patch('/:checkpointId/evento', async (req, res) => {
  try {
    const atual = await checkpointDoBuffet(req, res);
    if (!atual) return;

    const pedido = req.body.eventoId ? String(req.body.eventoId) : null;
    if (pedido === atual.eventoId) return res.json(atual);

    let eventoId = null;
    if (pedido) {
      const evento = await eventoDoBuffet(pedido, req.user.empresaId);
      if (!evento) return res.status(404).json({ error: 'Evento não encontrado neste buffet' });
      eventoId = evento.eventoId;
    }

    if (atual.eventoId) {
      const historico = await queryOne(
        `SELECT (SELECT COUNT(*) FROM leitura WHERE checkpointId = @checkpointId) AS leituras,
                (SELECT COUNT(*) FROM pontuacao WHERE checkpointId = @checkpointId) AS pontos`,
        { checkpointId: atual.checkpointId }
      );
      if (Number(historico.leituras) > 0 || Number(historico.pontos) > 0) {
        return res.status(409).json({ error: 'Este checkpoint já tem leituras ou pontos no evento atual, então não pode mudar de evento' });
      }
    }

    await query(
      'UPDATE pontoVerificacao SET eventoId = @eventoId, atualizadoEm = now() WHERE checkpointId = @checkpointId',
      { eventoId, checkpointId: atual.checkpointId }
    );
    console.log(`📅 [RECEBIMENTO] Checkpoint ${atual.checkpointId}: evento ${atual.eventoId || '-'} -> ${eventoId || '-'}`);
    res.json(await buscar(atual.checkpointId));
  } catch (err) {
    console.error('❌ [RECEBIMENTO] Erro ao atribuir evento:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
