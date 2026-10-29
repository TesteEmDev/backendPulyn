// routes/checkpointsMaster.js - checkpoints cadastrados pelo super admin (master) e transferidos para os buffets
// Montada em /api/master/checkpoints. Só o master acessa. Regras e ciclo de vida: utils/checkpointTransferencia.js
const express = require('express');
const router = express.Router();
const { query, queryOne, allQuery, withTransaction } = require('../database');
const { verifyToken, requireRole } = require('../utils/middleware');
const {
  STATUS, PROPOSITOS, normalizarMac,
  podeTransferir, podeCancelarTransferencia, podeExcluir,
} = require('../utils/checkpointTransferencia');

// O ID do checkpoint é gerado pelo banco (autoincremento, só números) e o único valor que uma pessoa define é o
// número do checkpoint (numCheck), e só o admin do buffet, ao aceitar. O master nunca informa nem altera o número.
const ERRO_NUMERO_DO_BUFFET = 'O número do checkpoint é definido pelo admin do buffet, ao aceitar';
const informouNumero = (corpo) => corpo && corpo.numCheck !== undefined && corpo.numCheck !== null && String(corpo.numCheck).trim() !== '';

router.use(verifyToken, requireRole('master'));

const COLUNAS = `
  p.id, p.numCheck, p.macAddress, p.nome, p.tipo, p.proposito, p.status, p.ultimoVisto,
  p.statusTransferencia, p.empresaId, p.empresaDestinoId, p.eventoId, p.transferidoEm, p.criadoEm,
  e.nome AS empresaNome, d.nome AS empresaDestinoNome`;
const JUNCOES = `
  FROM pontoVerificacao p
  LEFT JOIN empresa e ON e.empresaId = p.empresaId
  LEFT JOIN empresa d ON d.empresaId = p.empresaDestinoId`;

const buscar = (id) => queryOne(`SELECT ${COLUNAS} ${JUNCOES} WHERE p.id = @id`, { id });

function lerId(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: 'ID de checkpoint inválido' });
    return null;
  }
  return id;
}

// O MAC é único no sistema inteiro. `ignorarId` serve para a edição não bater com o próprio checkpoint.
async function macEmUso(mac, ignorarId = null) {
  return queryOne(
    'SELECT id, nome FROM pontoVerificacao WHERE macAddress = @mac AND (@ignorarId::int IS NULL OR id <> @ignorarId::int)',
    { mac, ignorarId }
  );
}

// Buffets que podem receber um checkpoint (tabela empresa, a mesma que a transferência valida), sem a conta do master
// nem as contas de família.
router.get('/buffets', async (req, res) => {
  try {
    res.json(await allQuery(
      `SELECT empresaId, nome, cidade, estado FROM empresa
       WHERE nome <> 'Master Admin' AND LOWER(COALESCE(plano, '')) <> 'family'
       ORDER BY nome`
    ));
  } catch (err) {
    console.error('❌ [MASTER-CHECKPOINTS] Erro ao listar buffets:', err);
    res.status(500).json({ error: err.message });
  }
});

// Lista tudo que o master cadastrou ou já transferiu. ?statusTransferencia=estoque|pendente|aceito e ?empresaId=
router.get('/', async (req, res) => {
  try {
    const filtros = [];
    const params = {};
    if (req.query.statusTransferencia) {
      filtros.push('p.statusTransferencia = @statusTransferencia');
      params.statusTransferencia = String(req.query.statusTransferencia).toLowerCase();
    }
    if (req.query.empresaId) {
      filtros.push('(p.empresaId = @empresaId OR p.empresaDestinoId = @empresaId)');
      params.empresaId = String(req.query.empresaId);
    }
    const onde = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
    res.json(await allQuery(`SELECT ${COLUNAS} ${JUNCOES} ${onde} ORDER BY p.id`, params));
  } catch (err) {
    console.error('❌ [MASTER-CHECKPOINTS] Erro ao listar:', err);
    res.status(500).json({ error: err.message });
  }
});

// Cadastra um checkpoint no estoque do super admin. O `id` é gerado pelo banco; o MAC identifica o aparelho.
router.post('/', async (req, res) => {
  try {
    const mac = normalizarMac(req.body.macAddress);
    if (!mac) return res.status(400).json({ error: 'MAC inválido: use o formato AA:BB:CC:DD:EE:FF' });

    if (informouNumero(req.body)) return res.status(400).json({ error: ERRO_NUMERO_DO_BUFFET });

    const proposito = String(req.body.proposito || 'game').trim().toLowerCase();
    if (!PROPOSITOS.includes(proposito)) return res.status(400).json({ error: 'Finalidade inválida: use game ou reception' });

    const tipo = String(req.body.tipo || 'NFC').trim();
    if (tipo.length > 20) return res.status(400).json({ error: 'O tipo deve ter até 20 caracteres' });

    const nomeInformado = String(req.body.nome || '').trim();
    if (nomeInformado.length > 100) return res.status(400).json({ error: 'O nome deve ter até 100 caracteres' });

    const existente = await macEmUso(mac);
    if (existente) return res.status(409).json({ error: `O MAC ${mac} já está cadastrado (checkpoint ${existente.id})` });

    // Sem id nem chave no INSERT: o banco gera o id (autoincremento) e o gatilho copia o mesmo número para o
    // checkpointId (migrations/checkpointIdNumerico.js). O nome padrão leva o id, que só existe depois do INSERT.
    const id = await withTransaction(async (tx) => {
      const { id: novoId } = await tx.queryOne(
        `INSERT INTO pontoVerificacao (nome, tipo, proposito, macAddress, statusTransferencia, empresaId, eventoId)
         VALUES (@nome, @tipo, @proposito, @mac, @estoque, NULL, NULL)
         RETURNING id`,
        { nome: nomeInformado || 'Checkpoint', tipo, proposito, mac, estoque: STATUS.ESTOQUE }
      );
      if (!nomeInformado) await tx.query('UPDATE pontoVerificacao SET nome = @nome WHERE id = @id', { nome: `Checkpoint ${novoId}`, id: novoId });
      return Number(novoId);
    });

    console.log(`✅ [MASTER-CHECKPOINTS] Cadastrado no estoque: id ${id}, MAC ${mac}`);
    res.status(201).json(await buscar(id));
  } catch (err) {
    console.error('❌ [MASTER-CHECKPOINTS] Erro ao cadastrar:', err);
    res.status(500).json({ error: err.message });
  }
});

// Edita nome, tipo, finalidade, MAC e (enquanto não aceito) o número.
router.patch('/:id', async (req, res) => {
  try {
    const id = lerId(req, res);
    if (id === null) return;

    const atual = await buscar(id);
    if (!atual) return res.status(404).json({ error: 'Checkpoint não encontrado' });

    const campos = [];
    const params = { id };

    if (req.body.macAddress !== undefined) {
      const mac = normalizarMac(req.body.macAddress);
      if (!mac) return res.status(400).json({ error: 'MAC inválido: use o formato AA:BB:CC:DD:EE:FF' });
      const existente = await macEmUso(mac, id);
      if (existente) return res.status(409).json({ error: `O MAC ${mac} já está cadastrado (checkpoint ${existente.id})` });
      campos.push('macAddress = @mac');
      params.mac = mac;
    }
    if (req.body.nome !== undefined) {
      const nome = String(req.body.nome).trim();
      if (!nome || nome.length > 100) return res.status(400).json({ error: 'O nome deve ter de 1 a 100 caracteres' });
      campos.push('nome = @nome');
      params.nome = nome;
    }
    if (req.body.tipo !== undefined) {
      const tipo = String(req.body.tipo).trim();
      if (!tipo || tipo.length > 20) return res.status(400).json({ error: 'O tipo deve ter de 1 a 20 caracteres' });
      campos.push('tipo = @tipo');
      params.tipo = tipo;
    }
    if (req.body.proposito !== undefined) {
      const proposito = String(req.body.proposito).trim().toLowerCase();
      if (!PROPOSITOS.includes(proposito)) return res.status(400).json({ error: 'Finalidade inválida: use game ou reception' });
      campos.push('proposito = @proposito');
      params.proposito = proposito;
    }
    if (informouNumero(req.body)) return res.status(400).json({ error: ERRO_NUMERO_DO_BUFFET });

    if (campos.length === 0) return res.status(400).json({ error: 'Nenhum campo para atualizar' });

    await query(`UPDATE pontoVerificacao SET ${campos.join(', ')}, atualizadoEm = now() WHERE id = @id`, params);
    res.json(await buscar(id));
  } catch (err) {
    console.error('❌ [MASTER-CHECKPOINTS] Erro ao editar:', err);
    res.status(500).json({ error: err.message });
  }
});

// Transfere do estoque para um buffet. Fica 'pendente' até o admin do buffet aceitar.
router.post('/:id/transferir', async (req, res) => {
  try {
    const id = lerId(req, res);
    if (id === null) return;

    const empresaId = String(req.body.empresaId || '').trim();
    if (!empresaId) return res.status(400).json({ error: 'Informe o buffet (empresaId) de destino' });

    const atual = await buscar(id);
    if (!atual) return res.status(404).json({ error: 'Checkpoint não encontrado' });
    if (!podeTransferir(atual.statusTransferencia)) {
      return res.status(409).json({ error: `Só dá para transferir um checkpoint em estoque (este está "${atual.statusTransferencia}")` });
    }

    const empresa = await queryOne('SELECT empresaId, nome FROM empresa WHERE empresaId = @empresaId', { empresaId });
    if (!empresa) return res.status(404).json({ error: 'Buffet de destino não encontrado' });

    // A condição no WHERE evita transferir duas vezes se dois pedidos chegarem juntos.
    const atualizado = await queryOne(
      `UPDATE pontoVerificacao
       SET statusTransferencia = @pendente, empresaDestinoId = @empresaId, transferidoEm = now(), atualizadoEm = now()
       WHERE id = @id AND statusTransferencia = @estoque
       RETURNING id`,
      { id, empresaId, pendente: STATUS.PENDENTE, estoque: STATUS.ESTOQUE }
    );
    if (!atualizado) return res.status(409).json({ error: 'O checkpoint mudou de situação; atualize a lista e tente de novo' });

    console.log(`📤 [MASTER-CHECKPOINTS] Checkpoint ${id} transferido para "${empresa.nome}" (pendente)`);
    res.json(await buscar(id));
  } catch (err) {
    console.error('❌ [MASTER-CHECKPOINTS] Erro ao transferir:', err);
    res.status(500).json({ error: err.message });
  }
});

// Desfaz uma transferência que o buffet ainda não aceitou: volta para o estoque.
router.post('/:id/cancelar-transferencia', async (req, res) => {
  try {
    const id = lerId(req, res);
    if (id === null) return;

    const atual = await buscar(id);
    if (!atual) return res.status(404).json({ error: 'Checkpoint não encontrado' });
    if (!podeCancelarTransferencia(atual.statusTransferencia)) {
      return res.status(409).json({ error: `Só dá para cancelar uma transferência pendente (este está "${atual.statusTransferencia}")` });
    }

    const atualizado = await queryOne(
      `UPDATE pontoVerificacao
       SET statusTransferencia = @estoque, empresaDestinoId = NULL, transferidoEm = NULL, atualizadoEm = now()
       WHERE id = @id AND statusTransferencia = @pendente
       RETURNING id`,
      { id, estoque: STATUS.ESTOQUE, pendente: STATUS.PENDENTE }
    );
    if (!atualizado) return res.status(409).json({ error: 'O checkpoint mudou de situação; atualize a lista e tente de novo' });

    console.log(`↩️ [MASTER-CHECKPOINTS] Transferência do checkpoint ${id} cancelada`);
    res.json(await buscar(id));
  } catch (err) {
    console.error('❌ [MASTER-CHECKPOINTS] Erro ao cancelar transferência:', err);
    res.status(500).json({ error: err.message });
  }
});

// Exclui um checkpoint que ainda está no estoque (nunca foi para um buffet, então não tem histórico).
router.delete('/:id', async (req, res) => {
  try {
    const id = lerId(req, res);
    if (id === null) return;

    const atual = await buscar(id);
    if (!atual) return res.status(404).json({ error: 'Checkpoint não encontrado' });
    if (!podeExcluir(atual.statusTransferencia)) {
      return res.status(409).json({ error: `Só dá para excluir um checkpoint em estoque (este está "${atual.statusTransferencia}")` });
    }

    await query('DELETE FROM pontoVerificacao WHERE id = @id AND statusTransferencia = @estoque', { id, estoque: STATUS.ESTOQUE });
    console.log(`🗑️ [MASTER-CHECKPOINTS] Checkpoint ${id} excluído do estoque`);
    res.json({ success: true });
  } catch (err) {
    console.error('❌ [MASTER-CHECKPOINTS] Erro ao excluir:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
