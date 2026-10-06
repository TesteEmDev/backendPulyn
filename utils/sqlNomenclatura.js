// utils/sqlNomenclatura.js - ponte entre o banco (português/camelCase) e o restante do backend.
//
// 1) citarIdentificadoresCamelCase: o PostgreSQL transforma identificadores sem aspas em minúsculas, então
//    `criancaId` só funciona como "criancaId". Aqui o SQL do backend pode ser escrito de forma legível
//    (`SELECT c.criancaId FROM crianca c`) e as aspas entram automaticamente.
// 2) converterLinhasParaApi: cada coluna lida direto de uma tabela volta com a chave que a API sempre
//    expôs (`criancaId` -> `crianca_id`, `nome` -> `name`), mantendo o JSON que o frontend consome.
const { mapaChavesDaApi } = require('../schema/nomenclatura');

const INICIO_IDENTIFICADOR = /[A-Za-z_]/;
const CORPO_IDENTIFICADOR = /[A-Za-z0-9_]/;
const CAMEL_CASE = /^[a-z][a-z0-9_]*[A-Z]/;

function citarIdentificadoresCamelCase(sqlQuery) {
  let saida = '';
  let indice = 0;
  const tamanho = sqlQuery.length;

  while (indice < tamanho) {
    const caractere = sqlQuery[indice];
    const proximo = sqlQuery[indice + 1];

    // Texto entre aspas simples ou identificador já entre aspas duplas: copia sem mexer.
    if (caractere === "'" || caractere === '"') {
      let fim = indice + 1;
      while (fim < tamanho) {
        if (sqlQuery[fim] === caractere) {
          if (sqlQuery[fim + 1] === caractere) { fim += 2; continue; }
          break;
        }
        fim += 1;
      }
      saida += sqlQuery.slice(indice, fim + 1);
      indice = fim + 1;
      continue;
    }

    // Comentários.
    if (caractere === '-' && proximo === '-') {
      let fim = sqlQuery.indexOf('\n', indice);
      if (fim === -1) fim = tamanho;
      saida += sqlQuery.slice(indice, fim);
      indice = fim;
      continue;
    }
    if (caractere === '/' && proximo === '*') {
      let fim = sqlQuery.indexOf('*/', indice + 2);
      fim = fim === -1 ? tamanho : fim + 2;
      saida += sqlQuery.slice(indice, fim);
      indice = fim;
      continue;
    }

    // Parâmetros nomeados (@empresaId) e posicionais ($1) não são identificadores.
    if (caractere === '@' || caractere === '$') {
      let fim = indice + 1;
      while (fim < tamanho && CORPO_IDENTIFICADOR.test(sqlQuery[fim])) fim += 1;
      saida += sqlQuery.slice(indice, fim);
      indice = fim;
      continue;
    }

    if (INICIO_IDENTIFICADOR.test(caractere)) {
      let fim = indice + 1;
      while (fim < tamanho && CORPO_IDENTIFICADOR.test(sqlQuery[fim])) fim += 1;
      const palavra = sqlQuery.slice(indice, fim);
      saida += CAMEL_CASE.test(palavra) ? `"${palavra}"` : palavra;
      indice = fim;
      continue;
    }

    saida += caractere;
    indice += 1;
  }

  return saida;
}

// `catalogo`: Map<oidDaTabela, { tabela, colunas: Map<attnum, nomeDaColuna> }>
function chavesDaApi(fields, catalogo, mapasPorTabela = new Map()) {
  const chaves = fields.map(campo => {
    if (!campo.tableID) return campo.name;
    const tabela = catalogo.get(campo.tableID);
    if (!tabela) return campo.name;
    // Coluna com apelido explícito (AS ...) mantém o apelido.
    if (tabela.colunas.get(campo.columnID) !== campo.name) return campo.name;
    if (!mapasPorTabela.has(tabela.tabela)) mapasPorTabela.set(tabela.tabela, mapaChavesDaApi(tabela.tabela));
    const mapa = mapasPorTabela.get(tabela.tabela);
    return (mapa && mapa.get(campo.name)) || campo.name;
  });

  // Se a troca fizesse duas colunas colidirem na mesma chave, mantém os nomes do banco.
  const usadas = new Set();
  for (const chave of chaves) {
    if (usadas.has(chave)) return fields.map(campo => campo.name);
    usadas.add(chave);
  }
  return chaves;
}

function converterLinhasParaApi(fields, rows, catalogo, mapasPorTabela) {
  if (!fields || !fields.length || !rows.length) return rows;
  const chaves = chavesDaApi(fields, catalogo, mapasPorTabela);
  if (chaves.every((chave, posicao) => chave === fields[posicao].name)) return rows;
  return rows.map(linha => {
    const convertida = {};
    fields.forEach((campo, posicao) => { convertida[chaves[posicao]] = linha[campo.name]; });
    return convertida;
  });
}

module.exports = { citarIdentificadoresCamelCase, converterLinhasParaApi, chavesDaApi };
