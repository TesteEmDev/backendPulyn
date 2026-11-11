// routes/checkpointsRecebimento.js - o admin do buffet recebe os checkpoints transferidos pelo super admin
// Montada em /api/pontoVerificacao/recebimento. Só o admin do buffet (empresaId do token). Ciclo de vida e regras:
// utils/checkpointTransferencia.js. Enquanto a chave interna é o checkpointId, as rotas o usam no caminho.
const express = require('express');
const router = express.Router();
const { query, queryOne, allQuery } = require('../database');
const { verifyToken, requireRole } = require('../utils/middleware');
const { STATUS, validarNumCheck, validarNumeroPorFinalidade } = require('../utils/checkpointTransferencia');
const { statusEfetivo } = require('../utils/statusCheckpoint');

// O banco guarda 'online' e nada o volta para 'offline': o status que a tela vê é calculado pelo último sinal da placa.
const comStatusReal = (linha) => (linha ? { ...linha, status: statusEfetivo(linha.status, linha.ultimoVisto) } : linha);

router.use(verifyToken, requireRole('admin'));

const COLUNAS = `p.checkpointId, p.numCheck, p.macAddress, p.nome, p.tipo, p.proposito, p.status, p.ultimoVisto,
  p.statusTransferencia, p.eventoId, p.transferidoEm, p.zona, p.pontos, e.nome AS eventoNome,
  (SELECT ev.nome FROM eventoCheckpoint h JOIN evento ev ON ev.eventoId = h.eventoId
   WHERE h.checkpointId = p.checkpointId ORDER BY h.usadoEm DESC LIMIT 1) AS ultimoEventoNome`;

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

const violouUnicidade = (err) => err && err.code === '23505';

// Checkpoints recebidos do super admin que ainda não têm número: o admin do buffet os define nesta lista.
router.get('/sem-numero', async (req, res) => {
  try {
    const linhas = await allQuery(
      `SELECT ${COLUNAS}
       FROM pontoVerificacao p LEFT JOIN evento e ON e.eventoId = p.eventoId
       WHERE p.empresaId = @empresaId AND p.statusTransferencia = @aceito AND p.numCheck IS NULL
       ORDER BY p.transferidoEm, p.checkpointId`,
      { empresaId: req.user.empresaId, aceito: STATUS.ACEITO }
    );
    res.json(linhas.map(comStatusReal));
  } catch (err) {
    console.error('❌ [RECEBIMENTO] Erro ao listar checkpoints sem número:', err);
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
    res.json(linhas.map(comStatusReal));
  } catch (err) {
    console.error('❌ [RECEBIMENTO] Erro ao listar checkpoints sem evento:', err);
    res.status(500).json({ error: err.message });
  }
});

// Carrega um checkpoint já aceito do buffet. `exigirMac`: só os que vieram do cadastro do super admin (com MAC); os
// mais antigos seguem pelas telas de antes.
async function checkpointDoBuffet(req, res, { exigirMac = false } = {}) {
  const atual = await buscar(req.params.checkpointId);
  if (!atual || atual.empresaId !== req.user.empresaId) {
    res.status(404).json({ error: 'Checkpoint não encontrado' });
    return null;
  }
  if (atual.statusTransferencia !== STATUS.ACEITO) {
    res.status(409).json({ error: 'Este checkpoint ainda não foi aceito' });
    return null;
  }
  if (exigirMac && !atual.macAddress) {
    res.status(409).json({ error: 'Só checkpoints recebidos pelo cadastro novo (com MAC) podem ser alterados aqui' });
    return null;
  }
  return atual;
}

// Troca o número do checkpoint. Os jogos e o histórico apontam para o id (que nunca muda), então nada se perde. Vale
// para qualquer checkpoint aceito do buffet, com ou sem MAC.
router.patch('/:checkpointId/numero', async (req, res) => {
  try {
    const atual = await checkpointDoBuffet(req, res);
    if (!atual) return;

    const numero = validarNumCheck(req.body.numCheck);
    if (!numero.ok) return res.status(400).json({ error: numero.erro });
    if (!numero.valor) return res.status(400).json({ error: 'Informe o número do checkpoint' });
    // Recepção: R1, R2...; os demais não usam esse formato
    const porFinalidade = validarNumeroPorFinalidade(atual.proposito, numero.valor);
    if (!porFinalidade.ok) return res.status(400).json({ error: porFinalidade.erro });
    numero.valor = porFinalidade.valor;

    const repetido = await numeroEmUso(req.user.empresaId, numero.valor, atual.checkpointId);
    if (repetido) {
      return res.status(409).json({ error: `Já existe um checkpoint com o número "${numero.valor}" no seu buffet (${repetido.nome}). Use outro número.` });
    }

    await query(
      'UPDATE pontoVerificacao SET numCheck = @numCheck, codigo = @numCheck, atualizadoEm = now() WHERE checkpointId = @checkpointId',
      { numCheck: numero.valor, checkpointId: atual.checkpointId }
    );
    console.log(`🔢 [RECEBIMENTO] Checkpoint ${atual.checkpointId}: número ${atual.numCheck} -> ${numero.valor}`);
    res.json(comStatusReal(await buscar(atual.checkpointId)));
  } catch (err) {
    if (violouUnicidade(err)) return res.status(409).json({ error: 'Já existe um checkpoint com esse número no seu buffet' });
    console.error('❌ [RECEBIMENTO] Erro ao trocar o número:', err);
    res.status(500).json({ error: err.message });
  }
});

// Devolve ao super admin um checkpoint aceito que ainda não está em evento nenhum (o que já está num evento é devolvido
// pela exclusão do evento, que também limpa as leituras e pontos dele).
router.post('/:checkpointId/devolver', async (req, res) => {
  try {
    const atual = await checkpointDoBuffet(req, res, { exigirMac: true });
    if (!atual) return;
    if (atual.eventoId) {
      return res.status(409).json({ error: 'Este checkpoint está em um evento: devolva pela lista de checkpoints do evento' });
    }

    const atualizado = await queryOne(
      `UPDATE pontoVerificacao
       SET statusTransferencia = @estoque, empresaId = NULL, eventoId = NULL, empresaDestinoId = NULL, transferidoEm = NULL,
           devolvidoEm = now(), devolvidoMotivo = 'devolvido',
           devolvidoPorNome = (SELECT nome FROM empresa WHERE empresaId = @empresaId),
           numCheck = NULL, codigo = NULL, territorioDonoTimeId = NULL, territorioDonosCriancaId = NULL,
           territorioTravadoAte = NULL, territorioCooldownAte = NULL, ultimoConquistadoEm = NULL, atualizadoEm = now()
       WHERE checkpointId = @checkpointId AND statusTransferencia = @aceito AND empresaId = @empresaId AND eventoId IS NULL
       RETURNING checkpointId`,
      { estoque: STATUS.ESTOQUE, aceito: STATUS.ACEITO, empresaId: req.user.empresaId, checkpointId: atual.checkpointId }
    );
    if (!atualizado) return res.status(409).json({ error: 'O checkpoint mudou de situação; atualize a lista e tente de novo' });

    console.log(`↩️ [RECEBIMENTO] Buffet ${req.user.empresaId} devolveu o checkpoint ${atual.checkpointId}`);
    res.json({ success: true, devolvido: true });
  } catch (err) {
    console.error('❌ [RECEBIMENTO] Erro ao devolver:', err);
    res.status(500).json({ error: err.message });
  }
});

// Coloca o checkpoint em um evento, troca de evento ou tira (eventoId null). O mesmo aparelho serve a vários eventos, um
// de cada vez. O histórico não anda junto: as leituras pertencem ao evento pelas crianças (crianca.eventoId) e os pontos
// têm o próprio eventoId, então o evento antigo continua com o que aconteceu nele. O que é só do evento em andamento
// (território conquistado) é zerado ao trocar.
router.patch('/:checkpointId/evento', async (req, res) => {
  try {
    const atual = await checkpointDoBuffet(req, res, { exigirMac: true });
    if (!atual) return;

    const pedido = req.body.eventoId ? String(req.body.eventoId) : null;
    if (pedido === atual.eventoId) return res.json(comStatusReal(atual));

    let eventoId = null;
    if (pedido) {
      const evento = await eventoDoBuffet(pedido, req.user.empresaId);
      if (!evento) return res.status(404).json({ error: 'Evento não encontrado neste buffet' });
      eventoId = evento.eventoId;
    }

    // O evento de onde ele sai guarda que usou este checkpoint
    if (atual.eventoId) {
      await query(
        `INSERT INTO eventoCheckpoint (id, empresaId, eventoId, checkpointId, numCheck, nome)
         VALUES (@id, @empresaId, @eventoId, @checkpointId, @numCheck, @nome)
         ON CONFLICT (eventoId, checkpointId) DO UPDATE SET numCheck = EXCLUDED.numCheck, nome = EXCLUDED.nome, usadoEm = CURRENT_TIMESTAMP`,
        { id: require('uuid').v4(), empresaId: atual.empresaId || null, eventoId: atual.eventoId, checkpointId: atual.checkpointId, numCheck: atual.numCheck ?? null, nome: atual.nome ?? null }
      );
    }

    await query(
      `UPDATE pontoVerificacao
       SET eventoId = @eventoId, atualizadoEm = now(),
           territorioDonoTimeId = NULL, territorioDonosCriancaId = NULL,
           territorioTravadoAte = NULL, territorioCooldownAte = NULL, ultimoConquistadoEm = NULL
       WHERE checkpointId = @checkpointId`,
      { eventoId, checkpointId: atual.checkpointId }
    );
    console.log(`📅 [RECEBIMENTO] Checkpoint ${atual.checkpointId}: evento ${atual.eventoId || '-'} -> ${eventoId || '-'}`);
    res.json(comStatusReal(await buscar(atual.checkpointId)));
  } catch (err) {
    console.error('❌ [RECEBIMENTO] Erro ao atribuir evento:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
