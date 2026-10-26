// utils/chaveCheckpoint.js - troca da chave interna (pontoVerificacao.checkpointId) de um checkpoint.
//
// Quando dois buffets têm o mesmo ID de checkpoint, só um deles guarda o ID "simples" (ex.: 12); o outro guarda
// "<código do buffet>-12" (ver utils/codigoBuffet.js). O ESP32 gravado só com o número (12) fala com quem tem o ID
// simples. usarIdSimples() passa o ID simples para outro checkpoint: o antigo dono vira "<código dele>-12".
//
// Renomear a chave leva junto tudo que a referencia:
//   - tabelas com chave estrangeira (leitura, pontuacao, etiquetaCheckpoint): ON UPDATE CASCADE (migrations/codigoBuffet.js)
//   - demais tabelas com coluna checkpointId / localCheckpointId: atualizadas aqui
//   - listas em texto JSON dos jogos e partidas (brincadeira.checkpoints, partidaBomba.locaisIds, partidaRefem.sequenciaIds)
const { withTransaction } = require('../database');
const { garantirCodigo } = require('./codigoBuffet');
const { chaveComCodigoDoBuffet, cabeNoEsp32 } = require('./idCheckpoint');

function erroHttp(mensagem, statusCode) {
  const erro = new Error(mensagem);
  erro.statusCode = statusCode;
  return erro;
}

const mesmo = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();

// Troca `de` por `para` dentro de uma lista JSON (["10","11"] ou [{"id":"10",...}]). Devolve null se nada mudou.
function trocarNaLista(texto, de, para) {
  let lista;
  try { lista = JSON.parse(texto); } catch { return null; }
  if (!Array.isArray(lista)) return null;
  let mudou = false;
  const nova = lista.map((item) => {
    if (typeof item === 'string' || typeof item === 'number') {
      if (mesmo(item, de)) { mudou = true; return para; }
      return item;
    }
    if (item && typeof item === 'object') {
      const copia = { ...item };
      for (const campo of ['id', 'checkpointId']) {
        if (campo in copia && mesmo(copia[campo], de)) { copia[campo] = para; mudou = true; }
      }
      return copia;
    }
    return item;
  });
  return mudou ? JSON.stringify(nova) : null;
}

// Renomeia a chave dentro da transação `tx`. `empresaId` limita as listas JSON aos jogos do buffet dono do checkpoint.
async function renomearChave(tx, empresaId, de, para) {
  await tx.query('UPDATE pontoVerificacao SET checkpointId = @para WHERE checkpointId = @de', { de, para });   // FKs acompanham (CASCADE)

  // Tabelas sem chave estrangeira que guardam o ID do checkpoint.
  const colunas = await tx.allQuery(
    `SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema = current_schema() AND LOWER(column_name) IN ('checkpointid', 'localcheckpointid')
       AND LOWER(table_name) <> 'pontoverificacao'`
  );
  for (const { table_name: tabela, column_name: coluna } of colunas) {
    await tx.query(`UPDATE "${tabela}" SET "${coluna}" = @para WHERE "${coluna}" = @de`, { de, para });
  }

  // Listas em texto JSON.
  const listas = [
    ['brincadeira', 'checkpoints', 'brincadeiraId'],
    ['partidaBomba', 'locaisIds', 'partidaId'],
    ['partidaRefem', 'sequenciaIds', 'partidaId'],
  ];
  for (const [tabela, campo, chave] of listas) {
    const linhas = await tx.allQuery(
      `SELECT "${chave}" AS chave, "${campo}" AS texto FROM "${tabela}"
       WHERE "empresaId" = @empresaId AND "${campo}" LIKE @padrao`,
      { empresaId, padrao: `%${de}%` }
    );
    for (const linha of linhas) {
      const novo = trocarNaLista(linha.texto, de, para);
      if (novo !== null) {
        await tx.query(`UPDATE "${tabela}" SET "${campo}" = @novo WHERE "${chave}" = @chave`, { novo, chave: linha.chave });
      }
    }
  }
}

/**
 * Dá o ID simples (o próprio `codigo`) ao checkpoint `chave`, que hoje tem a chave com prefixo.
 * Quem tinha o ID simples (de outro buffet) passa a "<código do buffet dele>-<ID>".
 */
async function usarIdSimples(chave) {
  return withTransaction(async (tx) => {
    const alvo = await tx.queryOne(
      'SELECT checkpointId, codigo, empresaId, nome FROM pontoVerificacao WHERE checkpointId = @chave',
      { chave }
    );
    if (!alvo) throw erroHttp('Checkpoint não encontrado', 404);
    const simples = String(alvo.codigo || '').trim();
    if (!simples || mesmo(alvo.checkpointId, simples)) throw erroHttp('Este checkpoint já usa o ID simples', 409);

    const dono = await tx.queryOne(
      'SELECT checkpointId, codigo, empresaId, nome FROM pontoVerificacao WHERE LOWER(checkpointId) = LOWER(@simples)',
      { simples }
    );

    let donoAnterior = null;
    if (dono) {
      if (mesmo(dono.empresaId, alvo.empresaId)) {
        throw erroHttp('O ID simples já pertence a outro checkpoint do mesmo buffet', 409);
      }
      const codigoDoDono = await garantirCodigo(dono.empresaId);
      const novaChaveDoDono = chaveComCodigoDoBuffet(dono.codigo || dono.checkpointId, codigoDoDono);
      if (!cabeNoEsp32(novaChaveDoDono)) {
        throw erroHttp(`A chave "${novaChaveDoDono}" ficaria longa demais para o ESP32 (máximo 16 caracteres)`, 409);
      }
      const ocupada = await tx.queryOne('SELECT checkpointId FROM pontoVerificacao WHERE LOWER(checkpointId) = LOWER(@chave)', { chave: novaChaveDoDono });
      if (ocupada) throw erroHttp(`A chave "${novaChaveDoDono}" já está em uso`, 409);
      await renomearChave(tx, dono.empresaId, dono.checkpointId, novaChaveDoDono);
      donoAnterior = { chave: novaChaveDoDono, nome: dono.nome, empresaId: dono.empresaId };
    }

    await renomearChave(tx, alvo.empresaId, alvo.checkpointId, simples);
    return { chave: simples, nome: alvo.nome, donoAnterior };
  });
}

module.exports = { usarIdSimples, renomearChave, trocarNaLista };
