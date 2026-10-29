// migrations/codigoBuffet.js - ID de checkpoint por buffet (ver utils/codigoBuffet.js)
//
// empresa.codigo:            código curto do buffet (único), preenchido para todos os buffets existentes.
// pontoVerificacao.codigo:   o ID que o recreacionista deu ao checkpoint; único por buffet. Nos checkpoints que já
//                            existem vale o próprio checkpointId (nada muda para eles nem para os ESP32 já gravados).
const { query, allQuery, DB_DRIVER } = require('../database');
const { preencherCodigos } = require('../utils/codigoBuffet');

async function ensureCodigoBuffetSchema() {
  const isPostgres = DB_DRIVER === 'postgres' || DB_DRIVER === 'postgresql';
  if (!isPostgres) return;

  await query('ALTER TABLE empresa ADD COLUMN IF NOT EXISTS codigo varchar(12)');
  await query('CREATE UNIQUE INDEX IF NOT EXISTS uq_empresa_codigo ON empresa (LOWER(codigo)) WHERE codigo IS NOT NULL');
  const preenchidas = await preencherCodigos();
  if (preenchidas > 0) console.log(`✅ Código do buffet gerado para ${preenchidas} empresa(s)`);

  const colunaExistia = (await allQuery(
    `SELECT 1 AS ok FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = 'pontoVerificacao' AND column_name = 'codigo'`
  )).length > 0;
  await query('ALTER TABLE pontoVerificacao ADD COLUMN IF NOT EXISTS codigo varchar(60)');
  // Só quando a coluna acaba de nascer. Depois disso o codigo acompanha o número que o buffet deu ao checkpoint e fica
  // vazio nos que ainda não têm buffet; preencher de novo a cada início daria a eles um número que ninguém definiu.
  if (!colunaExistia) await query('UPDATE pontoVerificacao SET codigo = checkpointId WHERE codigo IS NULL');
  try {
    await query('CREATE UNIQUE INDEX IF NOT EXISTS uq_pontoverificacao_empresa_codigo ON pontoVerificacao (empresaId, LOWER(codigo))');
  } catch (erro) {
    // Já existem IDs repetidos dentro do mesmo buffet (dados antigos): avisa e segue; a checagem na criação continua valendo.
    console.warn(`⚠️ Índice de ID único por buffet não criado: ${erro.message}`);
  }

  // As chaves estrangeiras para pontoVerificacao passam a acompanhar a troca da chave (ON UPDATE CASCADE),
  // necessário para a troca da chave do checkpoint (migrations/checkpointIdNumerico.js).
  const fks = await allQuery(
    `SELECT conrelid::regclass::text AS tabela, conname, pg_get_constraintdef(oid) AS def
     FROM pg_constraint
     WHERE contype = 'f' AND confrelid = '"pontoVerificacao"'::regclass AND confupdtype <> 'c'`
  );
  for (const fk of fks) {
    await query(`ALTER TABLE ${fk.tabela} DROP CONSTRAINT "${fk.conname}"`);
    await query(`ALTER TABLE ${fk.tabela} ADD CONSTRAINT "${fk.conname}" ${fk.def} ON UPDATE CASCADE`);
  }
  if (fks.length > 0) console.log(`✅ ${fks.length} chave(s) estrangeira(s) de checkpoint com ON UPDATE CASCADE`);
}

module.exports = { ensureCodigoBuffetSchema };
