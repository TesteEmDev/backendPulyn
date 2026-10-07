// utils/sincronizacaoSql.js - funções puras do sincronizador (sem acesso a banco).

const LIMITE_PARAMETROS = 60000; // o Postgres aceita 65535 parâmetros por comando

function aspas(identificador) {
  return `"${String(identificador).replace(/"/g, '""')}"`;
}

function dividirEmLotes(itens, tamanho) {
  const lotes = [];
  for (let i = 0; i < itens.length; i += tamanho) lotes.push(itens.slice(i, i + tamanho));
  return lotes;
}

// Quantas linhas cabem num comando, dado o número de parâmetros por linha.
function linhasPorComando(parametrosPorLinha) {
  return Math.max(1, Math.floor(LIMITE_PARAMETROS / Math.max(1, parametrosPorLinha)));
}

// Junta entradas da fila que apontam para a mesma linha (mesma tabela e mesma chave). A ordem é a
// da primeira ocorrência: o pai de uma chave estrangeira entra na fila antes do filho, e manter
// essa ordem faz o envio respeitar as dependências. Todos os ids ficam anotados para serem
// marcados como enviados juntos.
function agruparFila(entradas, colunasChavePorTabela) {
  const grupos = new Map();
  for (const entrada of entradas) {
    const colunas = colunasChavePorTabela[entrada.tabela] || Object.keys(entrada.chave).sort();
    const valores = colunas.map((coluna) => String(entrada.chave[coluna]));
    const id = `${entrada.tabela}|${JSON.stringify(valores)}`;
    let grupo = grupos.get(id);
    if (!grupo) {
      grupo = { tabela: entrada.tabela, chave: entrada.chave, colunas, valores, ids: [], tentativas: 0 };
      grupos.set(id, grupo);
    }
    grupo.ids.push(entrada.filaId);
    grupo.tentativas = Math.max(grupo.tentativas, Number(entrada.tentativas) || 0);
  }
  return [...grupos.values()];
}

// Sequências consecutivas da mesma tabela, para enviar várias linhas num só comando sem trocar
// a ordem entre tabelas.
function particionarPorTabela(grupos) {
  const blocos = [];
  for (const grupo of grupos) {
    const ultimo = blocos[blocos.length - 1];
    if (ultimo && ultimo.tabela === grupo.tabela) ultimo.grupos.push(grupo);
    else blocos.push({ tabela: grupo.tabela, grupos: [grupo] });
  }
  return blocos;
}

function listaDeChaves(colunas, chaves, primeiroParametro = 1) {
  const values = [];
  const tuplas = chaves.map((valores) => {
    const marcadores = valores.map((valor) => {
      values.push(valor);
      return `$${primeiroParametro + values.length - 1}`;
    });
    return `(${marcadores.join(', ')})`;
  });
  return { texto: `(${colunas.map(aspas).join(', ')}) IN (${tuplas.join(', ')})`, values };
}

function montarSelectPorChave({ tabela, colunas, chaves }) {
  const filtro = listaDeChaves(colunas, chaves);
  return { text: `SELECT * FROM ${aspas(tabela)} WHERE ${filtro.texto}`, values: filtro.values };
}

function montarDelete({ tabela, colunas, chaves }) {
  const filtro = listaDeChaves(colunas, chaves);
  return { text: `DELETE FROM ${aspas(tabela)} WHERE ${filtro.texto}`, values: filtro.values };
}

// INSERT de várias linhas com ON CONFLICT na chave primária: grava a linha inteira (estado atual).
function montarUpsert({ tabela, colunas, colunasChave, linhas }) {
  const values = [];
  const tuplas = linhas.map((linha) => {
    const marcadores = colunas.map((coluna) => {
      values.push(linha[coluna] === undefined ? null : linha[coluna]);
      return `$${values.length}`;
    });
    return `(${marcadores.join(', ')})`;
  });
  const atualizaveis = colunas.filter((coluna) => !colunasChave.includes(coluna));
  const conflito = atualizaveis.length
    ? `DO UPDATE SET ${atualizaveis.map((coluna) => `${aspas(coluna)} = EXCLUDED.${aspas(coluna)}`).join(', ')}`
    : 'DO NOTHING';
  const text = `INSERT INTO ${aspas(tabela)} (${colunas.map(aspas).join(', ')}) VALUES ${tuplas.join(', ')} `
    + `ON CONFLICT (${colunasChave.map(aspas).join(', ')}) ${conflito}`;
  return { text, values };
}

// 5s, 10s, 20s... até 15 minutos.
function atrasoTentativaMs(tentativas) {
  const n = Math.max(1, Number(tentativas) || 1);
  return Math.min(5000 * 2 ** (n - 1), 15 * 60 * 1000);
}

// Pai antes do filho (ordenação topológica); empate em ordem alfabética. Ciclos vão para o fim.
function ordenarTabelas(tabelas, dependencias) {
  const pais = new Map(tabelas.map((tabela) => [tabela, new Set()]));
  for (const { filho, pai } of dependencias) {
    if (filho !== pai && pais.has(filho) && pais.has(pai)) pais.get(filho).add(pai);
  }
  const pendentes = new Set(tabelas);
  const resultado = [];
  while (pendentes.size) {
    const prontas = [...pendentes].filter((tabela) => [...pais.get(tabela)].every((pai) => !pendentes.has(pai))).sort();
    if (!prontas.length) { resultado.push(...[...pendentes].sort()); break; }
    for (const tabela of prontas) { resultado.push(tabela); pendentes.delete(tabela); }
  }
  return resultado;
}

// Falha de rede/conexão (a nuvem está fora do ar): não deve penalizar as linhas da fila.
function ehErroDeConexao(erro) {
  if (!erro) return false;
  const codigosDeRede = new Set(['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT', 'EAI_AGAIN', 'EPIPE', 'EHOSTUNREACH', 'ENETUNREACH']);
  if (codigosDeRede.has(erro.code)) return true;
  if (/^(08|57P0|53300|28)/.test(String(erro.code || ''))) return true; // conexão, desligamento, limite, autenticação
  return /connection terminated|connection timeout|timeout expired|server closed|socket/i.test(String(erro.message || ''))
    && !erro.severity;
}

module.exports = {
  aspas,
  dividirEmLotes,
  linhasPorComando,
  agruparFila,
  particionarPorTabela,
  montarSelectPorChave,
  montarDelete,
  montarUpsert,
  atrasoTentativaMs,
  ordenarTabelas,
  ehErroDeConexao,
};
