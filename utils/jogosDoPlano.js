// utils/jogosDoPlano.js - entrega ao cliente os jogos do plano dele, já cadastrados
//
// Cada plano permite alguns tipos de jogo (utils/planDefinitions.js) e o cliente recebe um jogo de cada um, com o
// nome, a descrição, as regras e os pontos padrão (utils/jogosPadrao.js). Ele não cria, renomeia nem arquiva jogos: só
// muda a duração, que vale para todos os eventos (o jogo é do cliente e os eventos usam o mesmo jogo).
//
// É seguro rodar quantas vezes quiser: só cria o que falta e nunca mexe em jogo que já existe. Jogo arquivado conta como
// ausente (o cliente antigo podia arquivar), então volta a ser entregue.
const { v4: uuidv4 } = require('uuid');
const { query, queryOne, allQuery } = require('../database');
const { tiposDeJogoDoPlano } = require('./planDefinitions');
const { JOGOS_PADRAO } = require('./jogosPadrao');

// Planos que não recebem jogos: a conta de família e a conta do master não têm buffet nem eventos próprios.
const PLANOS_SEM_JOGOS = new Set(['family']);

// Cria os jogos que faltam para uma empresa. `db` permite rodar dentro de uma transação. Devolve os tipos criados.
async function garantirJogosDaEmpresa(empresaId, db = { query, queryOne, allQuery }) {
  const empresa = await db.queryOne('SELECT empresaId, nome, plano FROM empresa WHERE LOWER(empresaId) = LOWER(@empresaId)', { empresaId });
  if (!empresa || empresa.nome === 'Master Admin') return [];
  const plano = String(empresa.plano || 'starter').trim().toLowerCase();
  if (PLANOS_SEM_JOGOS.has(plano)) return [];

  const existentes = await db.allQuery(
    `SELECT tipo FROM brincadeira
     WHERE LOWER(empresaId) = LOWER(@empresaId) AND LOWER(COALESCE(status, 'active')) <> 'archived'`,
    { empresaId: empresa.empresaId }
  );
  const jaTem = new Set(existentes.map((j) => j.tipo));

  const criados = [];
  for (const tipo of tiposDeJogoDoPlano(plano)) {
    if (jaTem.has(tipo) || !JOGOS_PADRAO[tipo]) continue;
    const padrao = JOGOS_PADRAO[tipo];
    await db.query(
      `INSERT INTO brincadeira (brincadeiraId, nome, descricao, regras, tipo, duracao, pontosPadrao, empresaId, status, eventoId, checkpoints)
       VALUES (@id, @nome, @descricao, @regras, @tipo, @duracao, @pontosPadrao, @empresaId, 'active', NULL, NULL)`,
      {
        id: uuidv4(), nome: padrao.nome, descricao: padrao.descricao, regras: padrao.regras, tipo,
        duracao: padrao.duracao, pontosPadrao: padrao.pontosPadrao, empresaId: empresa.empresaId,
      }
    );
    criados.push(tipo);
  }
  return criados;
}

// Todas as empresas (na subida do servidor): garante os jogos de quem ainda não tem.
async function garantirJogosDeTodasAsEmpresas(db = { query, queryOne, allQuery }) {
  const empresas = await db.allQuery("SELECT empresaId FROM empresa WHERE nome <> 'Master Admin'");
  let total = 0;
  for (const { empresaId } of empresas) total += (await garantirJogosDaEmpresa(empresaId, db)).length;
  return total;
}

// Duração mínima e máxima que o cliente pode escolher, em minutos.
const DURACAO_MIN = 1;
const DURACAO_MAX = 240;
function validarDuracao(valor) {
  const n = Number(valor);
  if (!Number.isInteger(n) || n < DURACAO_MIN || n > DURACAO_MAX) {
    return { ok: false, erro: `A duração deve ser um número inteiro de minutos, entre ${DURACAO_MIN} e ${DURACAO_MAX}` };
  }
  return { ok: true, valor: n };
}

module.exports = { garantirJogosDaEmpresa, garantirJogosDeTodasAsEmpresas, validarDuracao, DURACAO_MIN, DURACAO_MAX, PLANOS_SEM_JOGOS };
