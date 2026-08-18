const { query, DB_DRIVER } = require('../database');

async function ensureEventFloorPlanSchema() {
  const isPostgres = DB_DRIVER === 'postgres' || DB_DRIVER === 'postgresql';

  if (isPostgres) {
    await query(`
      ALTER TABLE eventos
      ADD COLUMN IF NOT EXISTS floor_plan_data text,
      ADD COLUMN IF NOT EXISTS floor_plan_name varchar(255),
      ADD COLUMN IF NOT EXISTS floor_plan_type varchar(100)
    `);
    return;
  }

  await query(`
    IF COL_LENGTH('dbo.eventos', 'floor_plan_data') IS NULL
    BEGIN
      ALTER TABLE eventos ADD floor_plan_data NVARCHAR(MAX) NULL
    END
    IF COL_LENGTH('dbo.eventos', 'floor_plan_name') IS NULL
    BEGIN
      ALTER TABLE eventos ADD floor_plan_name NVARCHAR(255) NULL
    END
    IF COL_LENGTH('dbo.eventos', 'floor_plan_type') IS NULL
    BEGIN
      ALTER TABLE eventos ADD floor_plan_type VARCHAR(100) NULL
    END
  `);
}

module.exports = { ensureEventFloorPlanSchema };
