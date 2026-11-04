// utils/apagarCliente.js - exclusão de cliente (buffet) sem violar chaves estrangeiras
//
// Exclusão definitiva, na ordem certa e numa transação (tudo ou nada):
//   - eventos: os que estão em andamento são encerrados antes (para os jogos); depois cada evento é apagado com tudo o
//     que é dele (participantes, times, pontos, leituras, jogos...), como na exclusão de evento (utils/apagarEvento.js);
//   - checkpoints: os com MAC (aparelhos do master) voltam ao estoque do master, também os ainda pendentes de aceite;
//     os antigos, sem MAC, são apagados. As leituras e pontos deles neste buffet saem junto;
//   - o que sobrar do buffet: pulseiras, brincadeiras, códigos de vínculo, logins, a empresa e o cadastro legado.
const { STATUS } = require('./checkpointTransferencia');
const { apagarEventoDentroDaTransacao } = require('./apagarEvento');
const { finishEvent } = require('./eventLifecycle');

const n = (r) => Number(r?.n || 0);
const conta = (r) => Number(r?.rowsAffected?.[0] || 0);

const DO_CHECKPOINT = 'LOWER(checkpointId) IN (SELECT LOWER(checkpointId) FROM pontoVerificacao WHERE LOWER(empresaId) = LOWER(@empresaId) OR LOWER(empresaDestinoId) = LOWER(@empresaId))';

// O que será apagado, para o aviso na tela antes de confirmar.
async function resumoDoCliente(empresaId, q) {
  const p = { empresaId };
  const um = async (sql) => n(await q.queryOne(sql, p));
  return {
    eventos: await um('SELECT COUNT(*)::int AS n FROM evento WHERE LOWER(empresaId) = LOWER(@empresaId)'),
    eventosEmAndamento: await um("SELECT COUNT(*)::int AS n FROM evento WHERE LOWER(empresaId) = LOWER(@empresaId) AND LOWER(status) = 'active'"),
    participantes: await um('SELECT COUNT(*)::int AS n FROM crianca WHERE LOWER(empresaId) = LOWER(@empresaId)'),
    times: await um('SELECT COUNT(*)::int AS n FROM "time" WHERE LOWER(empresaId) = LOWER(@empresaId)'),
    pulseiras: await um('SELECT COUNT(*)::int AS n FROM pulseira WHERE LOWER(empresaId) = LOWER(@empresaId)'),
    brincadeiras: await um('SELECT COUNT(*)::int AS n FROM brincadeira WHERE LOWER(empresaId) = LOWER(@empresaId)'),
    leituras: await um('SELECT COUNT(*)::int AS n FROM leitura WHERE LOWER(empresaId) = LOWER(@empresaId)'),
    pontuacoes: await um('SELECT COUNT(*)::int AS n FROM pontuacao WHERE LOWER(empresaId) = LOWER(@empresaId)'),
    checkpointsParaEstoque: await um(
      `SELECT COUNT(*)::int AS n FROM pontoVerificacao WHERE macAddress IS NOT NULL
       AND (LOWER(empresaId) = LOWER(@empresaId) OR LOWER(empresaDestinoId) = LOWER(@empresaId))`),
    checkpointsApagados: await um(
      `SELECT COUNT(*)::int AS n FROM pontoVerificacao WHERE macAddress IS NULL
       AND (LOWER(empresaId) = LOWER(@empresaId) OR LOWER(empresaDestinoId) = LOWER(@empresaId))`),
    usuarios: await um('SELECT COUNT(*)::int AS n FROM login WHERE LOWER(empresaId) = LOWER(@empresaId)'),
  };
}

// Encerra os eventos em andamento do cliente (para os jogos e guarda o fim). Fora da transação: cada encerramento é
// uma operação própria, e se a exclusão falhar depois os eventos já ficam encerrados.
async function encerrarEventosEmAndamento(empresaId, q, { stopGame } = {}) {
  const ativos = await q.allQuery(
    "SELECT eventoId FROM evento WHERE LOWER(empresaId) = LOWER(@empresaId) AND LOWER(status) = 'active'", { empresaId });
  for (const { eventoId } of ativos) await finishEvent(eventoId, { source: 'manual', stopGame });
  return ativos.length;
}

// Devolve os checkpoints do buffet (aceitos ou ainda pendentes de aceite).
async function devolverCheckpointsDoCliente(empresaId, q) {
  const p = { empresaId };
  // O histórico fica preso ao buffet (FK em leitura/pontuação): sai junto, como na devolução pela tela do admin.
  await q.query(`DELETE FROM pontuacao WHERE ${DO_CHECKPOINT}`, p);
  await q.query(`DELETE FROM leitura WHERE ${DO_CHECKPOINT}`, p);
  await q.query(`DELETE FROM "etiquetaCheckpoint" WHERE ${DO_CHECKPOINT}`, p);

  const devolvidos = await q.query(
    `UPDATE pontoVerificacao
     SET statusTransferencia = @estoque, empresaId = NULL, eventoId = NULL, empresaDestinoId = NULL, transferidoEm = NULL,
         devolvidoEm = now(), devolvidoMotivo = 'cliente_excluido',
         devolvidoPorNome = (SELECT nome FROM empresa WHERE empresaId = @empresaId),
         numCheck = NULL, codigo = NULL, territorioDonoTimeId = NULL, territorioDonosCriancaId = NULL,
         territorioTravadoAte = NULL, territorioCooldownAte = NULL, ultimoConquistadoEm = NULL, atualizadoEm = now()
     WHERE macAddress IS NOT NULL AND (LOWER(empresaId) = LOWER(@empresaId) OR LOWER(empresaDestinoId) = LOWER(@empresaId))`,
    { ...p, estoque: STATUS.ESTOQUE });
  const apagados = await q.query(
    `DELETE FROM pontoVerificacao
     WHERE macAddress IS NULL AND (LOWER(empresaId) = LOWER(@empresaId) OR LOWER(empresaDestinoId) = LOWER(@empresaId))`, p);
  return { devolvidos: conta(devolvidos), apagados: conta(apagados) };
}

// Apaga o cliente. Roda dentro de uma transação já aberta; os eventos em andamento já devem ter sido encerrados.
async function apagarClienteDentroDaTransacao(empresaId, idsLegados, q) {
  const p = { empresaId };
  const eventos = await q.allQuery('SELECT eventoId FROM evento WHERE LOWER(empresaId) = LOWER(@empresaId)', p);
  for (const { eventoId } of eventos) await apagarEventoDentroDaTransacao(eventoId);

  const checkpoints = await devolverCheckpointsDoCliente(empresaId, q);

  // Sobras do buffet que não são de nenhum evento
  await q.query('DELETE FROM "codigoVinculoFamiliar" WHERE LOWER(empresaId) = LOWER(@empresaId)', p);
  await q.query('DELETE FROM leitura WHERE LOWER(empresaId) = LOWER(@empresaId)', p);
  await q.query('DELETE FROM pontuacao WHERE LOWER(empresaId) = LOWER(@empresaId)', p);
  await q.query('DELETE FROM crianca WHERE LOWER(empresaId) = LOWER(@empresaId)', p);
  await q.query('DELETE FROM "time" WHERE LOWER(empresaId) = LOWER(@empresaId)', p);
  await q.query('DELETE FROM pulseira WHERE LOWER(empresaId) = LOWER(@empresaId)', p);
  await q.query('DELETE FROM brincadeira WHERE LOWER(empresaId) = LOWER(@empresaId)', p);

  await q.query('DELETE FROM login WHERE LOWER(empresaId) = LOWER(@empresaId)', p);
  await q.query('DELETE FROM empresa WHERE LOWER(empresaId) = LOWER(@empresaId)', p);
  for (const id of idsLegados) await q.query('DELETE FROM cliente WHERE clienteId = @id', { id });
  return { eventosApagados: eventos.length, checkpoints };
}

module.exports = { resumoDoCliente, encerrarEventosEmAndamento, devolverCheckpointsDoCliente, apagarClienteDentroDaTransacao };
