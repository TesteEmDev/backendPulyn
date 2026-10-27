// migrations/checkpointIdNumerico.js - a chave do checkpoint passa a ser o `id` numérico, gerado pelo banco
//
// Antes, pontoVerificacao.checkpointId era um texto digitado ("15", "R1", "FPUETV-R1", "cp-10"). Agora ele é SEMPRE o
// `id` (autoincremento, inteiro) escrito como texto: o banco o gera e só tem dígitos. O único valor que uma pessoa
// define é o numCheck (o número do checkpoint), e só o admin do buffet.
//
// Por que continua texto, e não inteiro: dezenas de consultas comparam LOWER(checkpointId) e as listas JSON dos jogos
// guardam o ID como texto. Converter a coluna quebraria tudo isso sem ganho; a regra abaixo garante o mesmo resultado.
//
//   checkpointId = id::text      CHECK ck_pontoverificacao_chave_igual_id (o banco recusa qualquer outro valor)
//   INSERT sem id nem chave      o gatilho trg_pontoverificacao_chave copia o id gerado para o checkpointId
//
// A migração reescreve, em uma transação, toda referência à chave antiga:
//   - tabelas com chave estrangeira (etiquetaCheckpoint, leitura, pontuacao): acompanham sozinhas (ON UPDATE CASCADE)
//   - demais colunas que guardam a chave: atualizadas aqui
//   - listas em texto JSON dos jogos e das partidas: reescritas aqui
// Referência a checkpoint que já foi apagado (órfã) só de dígitos ganha o prefixo "orfao:", senão passaria a apontar
// para o checkpoint que hoje tem esse id (ver utils/reescreverReferencias.js).
//
// Roda uma vez (a presença do CHECK marca como feita) e pode rodar de novo sem efeito.
const { withTransaction, DB_DRIVER } = require('../database');
const { criarMapa, reescreverLista, PREFIXO_ORFAO } = require('../utils/reescreverReferencias');

const CONSTRAINT = 'ck_pontoverificacao_chave_igual_id';

// Colunas que guardam a chave de um checkpoint e NÃO têm chave estrangeira.
const COLUNAS_SEM_FK = [
  ['brincadeiraParalela', 'checkpointId'],
  ['cacaTesourPartida', 'checkpointAlvoId'],
  ['cacaTesourScan', 'checkpointId'],
  ['monsterCacaLeitura', 'checkpointId'],
  ['monsterCacaPartida', 'checkpointEspecialId'],
  ['roundBomba', 'localCheckpointId'],
  ['zonaConquistaEstadoCheckpoint', 'checkpointId'],
  ['zonaConquistaLeituraIndividual', 'checkpointId'],
  ['zonaConquistaLeituraTime', 'checkpointId'],
  ['zonaConquistaProtecaoCheckpointIndividual', 'checkpointId'],
];

// Colunas com chave estrangeira: acompanham a troca da chave sozinhas. Aqui só para a checagem de "nada ficou de fora".
const COLUNAS_COM_FK = [
  ['etiquetaCheckpoint', 'checkpointId'],
  ['leitura', 'checkpointId'],
  ['pontuacao', 'checkpointId'],
];

// Listas em texto JSON: [tabela, coluna com a lista, coluna da chave primária da tabela].
const LISTAS_JSON = [
  ['brincadeira', 'checkpoints', 'brincadeiraId'],
  ['cacaTesourPartida', 'checkpointsCompletadosIds', 'partidaId'],
  ['partidaBomba', 'locaisIds', 'partidaId'],
  ['partidaRefem', 'sequenciaIds', 'partidaId'],
];

const ehMinusculoOuMisto = (nome) => /[A-Z]/.test(nome);
const aspas = (nome) => (ehMinusculoOuMisto(nome) ? `"${nome}"` : nome);

async function colunaExiste(tx, tabela, coluna) {
  const linha = await tx.queryOne(
    `SELECT 1 AS ok FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = @tabela AND column_name = @coluna`,
    { tabela, coluna }
  );
  return Boolean(linha);
}

async function criarGatilho(tx) {
  await tx.query(`
    CREATE OR REPLACE FUNCTION fn_pontoverificacao_chave() RETURNS trigger AS $$
    BEGIN
      IF NEW."checkpointId" IS NULL OR NEW."checkpointId" = '' THEN
        NEW."checkpointId" := NEW."id"::text;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);
  await tx.query('DROP TRIGGER IF EXISTS trg_pontoverificacao_chave ON "pontoVerificacao"');
  await tx.query(`
    CREATE TRIGGER trg_pontoverificacao_chave BEFORE INSERT ON "pontoVerificacao"
    FOR EACH ROW EXECUTE FUNCTION fn_pontoverificacao_chave()
  `);
}

async function migrar(tx) {
  // Garantia de que nenhuma coluna que guarda a chave ficou fora da lista: avisar é melhor que migrar pela metade.
  const conhecidas = new Set([...COLUNAS_SEM_FK, ...COLUNAS_COM_FK, ...LISTAS_JSON.map(([t, c]) => [t, c])]
    .map(([t, c]) => `${t}.${c}`.toLowerCase()));
  const candidatas = await tx.allQuery(
    `SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema = current_schema() AND column_name ~* 'checkpoint'
       AND data_type IN ('character varying', 'text') AND table_name <> 'pontoVerificacao'`
  );
  const esquecidas = candidatas.filter((c) => !conhecidas.has(`${c.table_name}.${c.column_name}`.toLowerCase()));
  if (esquecidas.length > 0) {
    throw new Error(`Colunas que citam checkpoint e a migração não conhece: ${esquecidas.map((c) => `${c.table_name}.${c.column_name}`).join(', ')}`);
  }

  await tx.query(`CREATE TEMP TABLE _mapa_chave ON COMMIT DROP AS SELECT "checkpointId" AS velha, "id"::text AS nova FROM "pontoVerificacao"`);
  const repetidas = await tx.queryOne('SELECT COUNT(*) AS n FROM (SELECT LOWER(velha) FROM _mapa_chave GROUP BY 1 HAVING COUNT(*) > 1) x');
  if (Number(repetidas.n) > 0) throw new Error('Há chaves de checkpoint que só diferem por maiúsculas; resolva antes de migrar');
  const mapaLinhas = await tx.allQuery('SELECT velha, nova FROM _mapa_chave');
  const mapa = criarMapa(mapaLinhas);

  let orfas = 0;
  let trocadas = 0;
  for (const [tabela, coluna] of COLUNAS_SEM_FK) {
    if (!(await colunaExiste(tx, tabela, coluna))) continue;
    const t = aspas(tabela);
    const c = aspas(coluna);
    // 1º as órfãs, antes de trocar qualquer coisa (depois da troca não dá mais para distinguir uma órfã "3" do id 3).
    // "Só dígitos" sem regex: o adaptador de SQL do projeto (database.js) troca [..] por aspas, até dentro de texto.
    const o = await tx.query(
      `UPDATE ${t} SET ${c} = '${PREFIXO_ORFAO}' || ${c}
       WHERE ${c} <> '' AND length(${c}) <= 28 AND translate(${c}, '0123456789', '') = ''
         AND LOWER(${c}) NOT IN (SELECT LOWER(velha) FROM _mapa_chave)`
    );
    orfas += o.rowsAffected[0];
    // Uma instrução só: chaves que se cruzam ("2" vira "15" e "15" vira "2") trocam juntas, sem encadear.
    const n = await tx.query(
      `UPDATE ${t} SET ${c} = m.nova FROM _mapa_chave m
       WHERE LOWER(${t}.${c}) = LOWER(m.velha) AND ${t}.${c} <> m.nova`
    );
    trocadas += n.rowsAffected[0];
  }

  let listas = 0;
  for (const [tabela, coluna, pk] of LISTAS_JSON) {
    if (!(await colunaExiste(tx, tabela, coluna))) continue;
    const linhas = await tx.allQuery(
      `SELECT ${aspas(pk)} AS chave, ${aspas(coluna)} AS texto FROM ${aspas(tabela)} WHERE ${aspas(coluna)} IS NOT NULL AND ${aspas(coluna)} <> ''`
    );
    for (const linha of linhas) {
      const novo = reescreverLista(linha.texto, mapa);
      if (novo === null) continue;
      await tx.query(`UPDATE ${aspas(tabela)} SET ${aspas(coluna)} = @novo WHERE ${aspas(pk)} = @chave`, { novo, chave: linha.chave });
      listas += 1;
    }
  }

  // A própria chave, em duas fases porque a chave primária não aceita valores repetidos nem por um instante (a chave
  // de uma linha pode ser o id de outra). As chaves estrangeiras acompanham pelo ON UPDATE CASCADE.
  await tx.query(`UPDATE "pontoVerificacao" SET "checkpointId" = '~' || "id"::text`);
  await tx.query(`UPDATE "pontoVerificacao" SET "checkpointId" = "id"::text`);

  await tx.query(`ALTER TABLE "pontoVerificacao" ADD CONSTRAINT ${CONSTRAINT} CHECK ("checkpointId" = "id"::text)`);
  await criarGatilho(tx);

  console.log(`✅ Chave do checkpoint agora é o id numérico: ${mapaLinhas.length} checkpoint(s), ${trocadas} referência(s) trocada(s), ${orfas} órfã(s) neutralizada(s), ${listas} lista(s) JSON reescrita(s)`);
}

async function ensureCheckpointIdNumericoSchema() {
  const isPostgres = DB_DRIVER === 'postgres' || DB_DRIVER === 'postgresql';
  if (!isPostgres) return;

  await withTransaction(async (tx) => {
    // Precisa do id automático criado por migrations/checkpointTransferencia.js.
    if (!(await colunaExiste(tx, 'pontoVerificacao', 'id'))) {
      console.warn('⚠️ Chave numérica do checkpoint não aplicada: falta a coluna id (migrations/checkpointTransferencia.js).');
      return;
    }

    const feita = await tx.queryOne('SELECT 1 AS ok FROM pg_constraint WHERE conname = @nome', { nome: CONSTRAINT });
    if (feita) {
      await criarGatilho(tx);   // idempotente: garante que o gatilho existe
      return;
    }
    await migrar(tx);
  });
}

module.exports = { ensureCheckpointIdNumericoSchema, CONSTRAINT };
