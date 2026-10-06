const { query, DB_DRIVER } = require('../database');

async function ensureCheckpointMapPositionSchema() {
  const isPostgres = DB_DRIVER === 'postgres' || DB_DRIVER === 'postgresql';

  if (isPostgres) {
    await query(`
      ALTER TABLE pontoVerificacao
      ADD COLUMN IF NOT EXISTS mapaX integer,
      ADD COLUMN IF NOT EXISTS mapaY integer
    `);
    return;
  }

  await query(`
    IF COL_LENGTH('dbo.checkpoints', 'map_x') IS NULL
    BEGIN
      ALTER TABLE pontoVerificacao ADD mapaX INT NULL
    END
    IF COL_LENGTH('dbo.checkpoints', 'map_y') IS NULL
    BEGIN
      ALTER TABLE pontoVerificacao ADD mapaY INT NULL
    END
  `);
}

module.exports = { ensureCheckpointMapPositionSchema };
