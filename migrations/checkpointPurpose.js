const { query, DB_DRIVER } = require('../database');

async function ensureCheckpointPurposeSchema() {
  const isPostgres = DB_DRIVER === 'postgres' || DB_DRIVER === 'postgresql';

  if (isPostgres) {
    await query(`
      ALTER TABLE "pontoVerificacao"
      ADD COLUMN IF NOT EXISTS checkpoint_purpose varchar(20) DEFAULT 'game'
    `);
  } else {
    await query(`
      IF COL_LENGTH('dbo.pontoVerificacao', 'checkpoint_purpose') IS NULL
      BEGIN
        ALTER TABLE pontoVerificacao
        ADD checkpoint_purpose varchar(20) NULL
      END
    `);
  }

  // Skip data updates - migrations focused on schema only
  // await query(`
  //   UPDATE "pontoVerificacao"
  //   SET checkpoint_purpose = 'game'
  //   WHERE checkpoint_purpose IS NULL
  // `);

  // O firmware exclusivo da recepção usa o ID lógico 1.
  // Nenhum registro é removido e os históricos permanecem intactos.
  // await query(`
  //   UPDATE "pontoVerificacao"
  //   SET checkpoint_purpose = 'reception'
  //   WHERE LOWER(CAST("checkpointId" AS VARCHAR(36))) = '1'
  // `);
}

module.exports = { ensureCheckpointPurposeSchema };
