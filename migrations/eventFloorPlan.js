const { query, DB_DRIVER } = require('../database');

async function ensureEventFloorPlanSchema() {
  const isPostgres = DB_DRIVER === 'postgres' || DB_DRIVER === 'postgresql';

  if (isPostgres) {
    await query(`
      ALTER TABLE evento
      ADD COLUMN IF NOT EXISTS dadosPlanoPiso text,
      ADD COLUMN IF NOT EXISTS nomePlanoPiso varchar(255),
      ADD COLUMN IF NOT EXISTS tipoPlanoPiso varchar(100)
    `);
    return;
  }

  await query(`
    IF COL_LENGTH('dbo.eventos', 'floor_plan_data') IS NULL
    BEGIN
      ALTER TABLE evento ADD dadosPlanoPiso NVARCHAR(MAX) NULL
    END
    IF COL_LENGTH('dbo.eventos', 'floor_plan_name') IS NULL
    BEGIN
      ALTER TABLE evento ADD nomePlanoPiso NVARCHAR(255) NULL
    END
    IF COL_LENGTH('dbo.eventos', 'floor_plan_type') IS NULL
    BEGIN
      ALTER TABLE evento ADD tipoPlanoPiso VARCHAR(100) NULL
    END
  `);
}

module.exports = { ensureEventFloorPlanSchema };
