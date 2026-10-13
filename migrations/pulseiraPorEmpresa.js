// migrations/pulseiraPorEmpresa.js - o código da pulseira passa a ser único POR BUFFET
//
// Antes a chave primária de pulseira era só o código, então dois buffets não podiam cadastrar o mesmo código.
// Agora é (empresaId, codigo). O ESP32 não participa: a leitura já descobre o buffet pelo checkpoint.
const { query, queryOne } = require('../database');
const { DB_DRIVER } = require('../database');

async function ensurePulseiraPorEmpresaSchema() {
  const isPostgres = DB_DRIVER === 'postgres' || DB_DRIVER === 'postgresql';
  if (!isPostgres) return;

  const pk = await queryOne(
    `SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
     WHERE conrelid = 'pulseira'::regclass AND contype = 'p'`
  );
  if (!pk) return;
  if (/empresaid/i.test(pk.def)) return;   // já migrada

  const semEmpresa = await queryOne('SELECT COUNT(*) AS total FROM pulseira WHERE empresaId IS NULL');
  if (Number(semEmpresa?.total || 0) > 0) {
    console.warn(`⚠️ Pulseiras sem empresa (${semEmpresa.total}): a chave (empresaId, codigo) não foi criada. Corrija os dados e reinicie.`);
    return;
  }

  await query(`ALTER TABLE pulseira DROP CONSTRAINT "${pk.conname}"`);
  await query('ALTER TABLE pulseira ALTER COLUMN empresaId SET NOT NULL');
  await query('ALTER TABLE pulseira ADD PRIMARY KEY (empresaId, codigo)');
  console.log('✅ Pulseiras: código único por buffet (chave empresaId + codigo)');
}

module.exports = { ensurePulseiraPorEmpresaSchema };
