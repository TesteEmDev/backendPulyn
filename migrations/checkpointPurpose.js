const { query, DB_DRIVER } = require('../database');

async function ensureCheckpointPurposeSchema() {
  const isPostgres = DB_DRIVER === 'postgres' || DB_DRIVER === 'postgresql';

  if (isPostgres) {
    await query(`
      ALTER TABLE "pontoVerificacao"
      ADD COLUMN IF NOT EXISTS proposito varchar(20) DEFAULT 'game'
    `);
  } else {
    await query(`
      IF COL_LENGTH('dbo.pontoVerificacao', 'proposito') IS NULL
      BEGIN
        ALTER TABLE pontoVerificacao
        ADD proposito varchar(20) NULL
      END
    `);
  }

  // Skip data updates - migrations focused on schema only
  // await query(`
  //   UPDATE "pontoVerificacao"
  //   SET proposito = 'game'
  //   WHERE proposito IS NULL
  // `);

  // O firmware exclusivo da recepção usa o ID lógico 1.
  // Nenhum registro é removido e os históricos permanecem intactos.
  // await query(`
  //   UPDATE "pontoVerificacao"
  //   SET proposito = 'reception'
  //   WHERE LOWER(CAST("checkpointId" AS VARCHAR(36))) = '1'
  // `);
}

module.exports = { ensureCheckpointPurposeSchema };
