// utils/perfilCrianca.js - Cadastro permanente da criança (perfilCrianca) e seus pontos em todos os eventos.
//
// perfilCrianca guarda quem a criança é e o último evento em que esteve; a linha de `crianca` é a participação
// dela em cada evento (time, pulseira e pontos do evento). As funções usam os helpers globais do banco, que já
// participam da transação aberta por withTransaction.
const { v4: uuidv4 } = require('uuid');
const { query, queryOne, allQuery } = require('../database');

const ACENTOS = 'áàâãäéèêëíìîïóòôõöúùûüçñ';
const SEM_ACENTOS = 'aaaaaeeeeiiiiooooouuuucn';

function normalizarBusca(texto) {
  return String(texto || '')
    .toLowerCase()
    .replace(/[%_\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split('')
    .map((ch) => { const i = ACENTOS.indexOf(ch); return i >= 0 ? SEM_ACENTOS[i] : ch; })
    .join('');
}

// Expressão SQL equivalente a normalizarBusca para colunas (sem depender da extensão unaccent).
function semAcentosSql(coluna) {
  return `translate(lower(COALESCE(${coluna}, '')), '${ACENTOS}', '${SEM_ACENTOS}')`;
}

// "Maria Souza Lima" -> "Maria L." — suficiente para a criança se reconhecer sem expor o nome inteiro no Kiosk.
function nomeParaExibir(nome) {
  const partes = String(nome || '').trim().split(/\s+/).filter(Boolean);
  if (partes.length <= 1) return partes[0] || '';
  return `${partes[0]} ${partes[partes.length - 1][0].toUpperCase()}.`;
}

function idadeValida(idade) {
  const valor = Number.parseInt(idade, 10);
  return Number.isFinite(valor) ? Math.max(0, Math.min(18, valor)) : null;
}

// Cria o perfil de uma criança nova e já aponta o último evento para o evento atual.
async function criarPerfil({ empresaId, eventoId, nome, apelido, idade, avatar }) {
  if (!String(nome || '').trim()) throw new Error('Nome da criança é obrigatório');
  const perfilCriancaId = uuidv4();
  await query(
    `INSERT INTO perfilCrianca (perfilCriancaId, empresaId, nome, apelido, idade, avatar, ultimoEventoId)
     VALUES (@perfilCriancaId, @empresaId, @nome, @apelido, @idade, @avatar, @eventoId)`,
    {
      perfilCriancaId,
      empresaId,
      nome: String(nome).trim(),
      apelido: String(apelido || '').trim() || null,
      idade: idadeValida(idade),
      avatar: avatar || null,
      eventoId: eventoId || null,
    }
  );
  return perfilCriancaId;
}

// Perfil existente da empresa (null se não existir ou for de outra empresa).
async function buscarPerfil(perfilCriancaId, empresaId) {
  if (!perfilCriancaId) return null;
  return (await queryOne(
    `SELECT perfilCriancaId, empresaId, nome, apelido, idade, avatar, ultimoEventoId
     FROM perfilCrianca WHERE perfilCriancaId = @perfilCriancaId AND empresaId = @empresaId`,
    { perfilCriancaId, empresaId }
  )) || null;
}

// A criança voltou: marca o evento atual como o último e atualiza o que mudou (idade, apelido, avatar).
async function registrarVolta({ perfilCriancaId, eventoId, apelido, idade, avatar }) {
  await query(
    `UPDATE perfilCrianca
     SET ultimoEventoId = @eventoId,
         apelido = COALESCE(@apelido, apelido),
         idade = COALESCE(@idade, idade),
         avatar = COALESCE(@avatar, avatar),
         atualizadoEm = CURRENT_TIMESTAMP
     WHERE perfilCriancaId = @perfilCriancaId`,
    {
      perfilCriancaId,
      eventoId,
      apelido: String(apelido || '').trim() || null,
      idade: idadeValida(idade),
      avatar: avatar || null,
    }
  );
}

// Quando alguém edita uma participação, o cadastro permanente acompanha.
async function atualizarDadosDoPerfil(perfilCriancaId, { nome, apelido, idade, avatar }) {
  if (!perfilCriancaId) return;
  await query(
    `UPDATE perfilCrianca
     SET nome = COALESCE(@nome, nome),
         apelido = COALESCE(@apelido, apelido),
         idade = COALESCE(@idade, idade),
         avatar = COALESCE(@avatar, avatar),
         atualizadoEm = CURRENT_TIMESTAMP
     WHERE perfilCriancaId = @perfilCriancaId`,
    {
      perfilCriancaId,
      nome: String(nome || '').trim() || null,
      apelido: String(apelido || '').trim() || null,
      idade: idadeValida(idade),
      avatar: avatar || null,
    }
  );
}

// Depois de remover uma participação, o "último evento" volta a ser o evento mais recente que sobrou (ou vazio).
async function recalcularUltimoEvento(perfilCriancaId) {
  if (!perfilCriancaId) return;
  await query(
    `UPDATE perfilCrianca SET ultimoEventoId = (
       SELECT c.eventoId FROM crianca c
       JOIN evento e ON e.eventoId = c.eventoId
       WHERE c.perfilCriancaId = @perfilCriancaId
       ORDER BY e.data DESC, c.criadoEm DESC
       LIMIT 1
     )
     WHERE perfilCriancaId = @perfilCriancaId`,
    { perfilCriancaId }
  );
}

// Busca para o Kiosk: só devolve o necessário para a criança se reconhecer (nome abreviado, apelido, idade, avatar).
async function buscarPerfisParaKiosk({ empresaId, termo, eventoId, limite = 8 }) {
  const busca = normalizarBusca(termo);
  if (busca.length < 2) return [];
  const rows = await allQuery(
    `SELECT TOP (@limite) p.perfilCriancaId, p.nome, p.apelido, p.idade, p.avatar
     FROM perfilCrianca p
     WHERE p.empresaId = @empresaId
       AND (${semAcentosSql('p.apelido')} LIKE @padrao OR ${semAcentosSql('p.nome')} LIKE @padrao)
       AND NOT EXISTS (
         SELECT 1 FROM crianca c WHERE c.perfilCriancaId = p.perfilCriancaId AND c.eventoId = @eventoId
       )
     ORDER BY p.atualizadoEm DESC`,
    { empresaId, eventoId, padrao: `%${busca}%`, limite }
  );
  return rows.map((row) => ({
    perfilCriancaId: row.perfilCriancaId,
    nomeExibicao: nomeParaExibir(row.nome),
    apelido: row.apelido || '',
    idade: row.idade,
    avatar: row.avatar,
  }));
}

// Pontos totais (todos os eventos) e por evento de um perfil.
async function pontosDoPerfil(perfilCriancaId, empresaId) {
  const perfil = await buscarPerfil(perfilCriancaId, empresaId);
  if (!perfil) return null;
  const eventos = await allQuery(
    `SELECT c.criancaId, c.eventoId, e.nome AS eventoNome, e.data AS eventoData, c.pontos
     FROM crianca c
     JOIN evento e ON e.eventoId = c.eventoId
     WHERE c.perfilCriancaId = @perfilCriancaId
     ORDER BY e.data DESC, c.criadoEm DESC`,
    { perfilCriancaId }
  );
  const porEvento = eventos.map((row) => ({
    criancaId: row.criancaId,
    eventoId: row.eventoId,
    eventoNome: row.eventoNome,
    eventoData: row.eventoData,
    pontos: Number(row.pontos) || 0,
  }));
  return {
    ...perfil,
    pontosTotais: porEvento.reduce((soma, item) => soma + item.pontos, 0),
    eventos: porEvento,
  };
}

module.exports = {
  criarPerfil,
  buscarPerfil,
  registrarVolta,
  atualizarDadosDoPerfil,
  recalcularUltimoEvento,
  buscarPerfisParaKiosk,
  pontosDoPerfil,
  nomeParaExibir,
  idadeValida,
  normalizarBusca,
};
