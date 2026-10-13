// migrations/codigoBuffet.js - ID de checkpoint por buffet (ver utils/codigoBuffet.js)
//
// empresa.codigo:            código curto do buffet (único), preenchido para todos os buffets existentes.
// pontoVerificacao.codigo:   o ID que o recreacionista deu ao checkpoint; único por buffet. Nos checkpoints que já
//                            existem vale o próprio checkpointId (nada muda para eles nem para os ESP32 já gravados).
const { query, DB_DRIVER } = require('../database');
const { preencherCodigos } = require('../utils/codigoBuffet');

async function ensureCodigoBuffetSchema() {
  const isPostgres = DB_DRIVER === 'postgres' || DB_DRIVER === 'postgresql';
  if (!isPostgres) return;

  await query('ALTER TABLE empresa ADD COLUMN IF NOT EXISTS codigo varchar(12)');
  await query('CREATE UNIQUE INDEX IF NOT EXISTS uq_empresa_codigo ON empresa (LOWER(codigo)) WHERE codigo IS NOT NULL');
  const preenchidas = await preencherCodigos();
  if (preenchidas > 0) console.log(`✅ Código do buffet gerado para ${preenchidas} empresa(s)`);

  await query('ALTER TABLE pontoVerificacao ADD COLUMN IF NOT EXISTS codigo varchar(60)');
  await query('UPDATE pontoVerificacao SET codigo = checkpointId WHERE codigo IS NULL');
  try {
    await query('CREATE UNIQUE INDEX IF NOT EXISTS uq_pontoverificacao_empresa_codigo ON pontoVerificacao (empresaId, LOWER(codigo))');
  } catch (erro) {
    // Já existem IDs repetidos dentro do mesmo buffet (dados antigos): avisa e segue; a checagem na criação continua valendo.
    console.warn(`⚠️ Índice de ID único por buffet não criado: ${erro.message}`);
  }
}

module.exports = { ensureCodigoBuffetSchema };
