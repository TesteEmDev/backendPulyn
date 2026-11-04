// utils/apagarCliente.js - exclusão de cliente (buffet) sem violar chaves estrangeiras
//
// Antes de apagar, confere o que ainda pertence ao buffet. Os checkpoints não impedem a exclusão: voltam para o estoque
// do master (os com MAC, que são aparelhos) ou são apagados (cadastro antigo, sem MAC), junto com as leituras e pontos
// deles. O que impede é o que é do buffet de verdade (eventos, participantes, pulseiras...): o master apaga isso antes,
// pelas telas próprias, porque apagar tudo junto seria perder histórico sem querer.
const { STATUS } = require('./checkpointTransferencia');

// Onde o buffet ainda pode ter dados. `tabela` já vem citada quando precisa.
const BLOQUEIOS = [
  { tabela: 'evento', rotulo: 'evento(s)' },
  { tabela: 'crianca', rotulo: 'participante(s)' },
  { tabela: 'pulseira', rotulo: 'pulseira(s)' },
  { tabela: '"time"', rotulo: 'time(s)' },
  { tabela: 'brincadeira', rotulo: 'brincadeira(s) cadastrada(s)' },
  { tabela: '"codigoVinculoFamiliar"', rotulo: 'código(s) de vínculo familiar' },
];

// Lista o que impede a exclusão: [{ rotulo, quantidade }]. Vazia = pode excluir.
async function verificarExclusaoCliente(empresaId, q) {
  const bloqueios = [];
  for (const { tabela, rotulo } of BLOQUEIOS) {
    const r = await q.queryOne(`SELECT COUNT(*)::int AS n FROM ${tabela} WHERE LOWER("empresaId") = LOWER(@empresaId)`, { empresaId });
    if (Number(r.n) > 0) bloqueios.push({ rotulo, quantidade: Number(r.n) });
  }
  return bloqueios;
}

const DO_CHECKPOINT = 'LOWER(checkpointId) IN (SELECT LOWER(checkpointId) FROM pontoVerificacao WHERE LOWER(empresaId) = LOWER(@empresaId) OR LOWER(empresaDestinoId) = LOWER(@empresaId))';

// Devolve os checkpoints do buffet (aceitos ou ainda pendentes de aceite). Devolve { devolvidos, apagados }.
async function devolverCheckpointsDoCliente(empresaId, q) {
  const p = { empresaId };
  const lista = await q.allQuery(
    `SELECT checkpointId, macAddress FROM pontoVerificacao
     WHERE LOWER(empresaId) = LOWER(@empresaId) OR LOWER(empresaDestinoId) = LOWER(@empresaId)`, p);
  if (!lista.length) return { devolvidos: 0, apagados: 0 };

  // O histórico fica preso ao buffet (FK em leitura/pontuação): sai junto, como na devolução pela tela do admin.
  await q.query(`DELETE FROM pontuacao WHERE ${DO_CHECKPOINT}`, p);
  await q.query(`DELETE FROM leitura WHERE ${DO_CHECKPOINT}`, p);
  await q.query(`DELETE FROM "etiquetaCheckpoint" WHERE ${DO_CHECKPOINT}`, p);

  const devolvidos = await q.query(
    `UPDATE pontoVerificacao
     SET statusTransferencia = @estoque, empresaId = NULL, eventoId = NULL, empresaDestinoId = NULL, transferidoEm = NULL,
         numCheck = NULL, codigo = NULL, territorioDonoTimeId = NULL, territorioDonosCriancaId = NULL,
         territorioTravadoAte = NULL, territorioCooldownAte = NULL, ultimoConquistadoEm = NULL, atualizadoEm = now()
     WHERE macAddress IS NOT NULL AND (LOWER(empresaId) = LOWER(@empresaId) OR LOWER(empresaDestinoId) = LOWER(@empresaId))`,
    { ...p, estoque: STATUS.ESTOQUE });
  const apagados = await q.query(
    `DELETE FROM pontoVerificacao
     WHERE macAddress IS NULL AND (LOWER(empresaId) = LOWER(@empresaId) OR LOWER(empresaDestinoId) = LOWER(@empresaId))`, p);

  const conta = (r) => Number(r?.rowsAffected?.[0] || 0);
  return { devolvidos: conta(devolvidos), apagados: conta(apagados) };
}

// Exclui o cliente. Roda dentro de uma transação já aberta. Se algo impede, devolve { bloqueios } sem alterar nada.
async function apagarClienteDentroDaTransacao(empresaId, idsLegados, q) {
  const bloqueios = await verificarExclusaoCliente(empresaId, q);
  if (bloqueios.length) return { bloqueios };

  const checkpoints = await devolverCheckpointsDoCliente(empresaId, q);
  await q.query('DELETE FROM login WHERE LOWER(empresaId) = LOWER(@empresaId)', { empresaId });
  await q.query('DELETE FROM empresa WHERE LOWER(empresaId) = LOWER(@empresaId)', { empresaId });
  for (const id of idsLegados) await q.query('DELETE FROM cliente WHERE clienteId = @id', { id });
  return { bloqueios: [], checkpoints };
}

module.exports = { verificarExclusaoCliente, devolverCheckpointsDoCliente, apagarClienteDentroDaTransacao, BLOQUEIOS };
