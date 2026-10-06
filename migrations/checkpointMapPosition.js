const { query, DB_DRIVER } = require('../database');

async function ensureCheckpointMapPositionSchema() {
  const isPostgres = DB_DRIVER === 'postgres' || DB_DRIVER === 'postgresql';

  if (isPostgres) {
    await query(`
      ALTER TABLE "pontoVerificacao"
      ADD COLUMN IF NOT EXISTS map_x integer,
      ADD COLUMN IF NOT EXISTS map_y integer
    `);
    return;
  }

  await query(`
    IF COL_LENGTH('dbo.pontoVerificacao', 'map_x') IS NULL
    BEGIN
      ALTER TABLE pontoVerificacao ADD map_x INT NULL
    END
    IF COL_LENGTH('dbo.pontoVerificacao', 'map_y') IS NULL
    BEGIN
      ALTER TABLE pontoVerificacao ADD map_y INT NULL
    END
  `);
}

module.exports = { ensureCheckpointMapPositionSchema };
