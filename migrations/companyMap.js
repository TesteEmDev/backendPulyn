const { query, queryOne, allQuery, DB_DRIVER } = require('../database');

// Planta e zonas do mapa pertencem ao espaço físico do buffet (empresa), não
// a um evento específico — por isso moram em `empresa`, não em `evento`.
async function ensureCompanyMapSchema() {
  const isPostgres = DB_DRIVER === 'postgres' || DB_DRIVER === 'postgresql';

  if (isPostgres) {
    await query(`
      ALTER TABLE empresa
      ADD COLUMN IF NOT EXISTS floor_plan_data text,
      ADD COLUMN IF NOT EXISTS floor_plan_name varchar(255),
      ADD COLUMN IF NOT EXISTS floor_plan_type varchar(100),
      ADD COLUMN IF NOT EXISTS zones_data text
    `);
    return;
  }

  await query(`
    IF COL_LENGTH('dbo.empresa', 'floor_plan_data') IS NULL
    BEGIN
      ALTER TABLE empresa ADD floor_plan_data NVARCHAR(MAX) NULL
    END
    IF COL_LENGTH('dbo.empresa', 'floor_plan_name') IS NULL
    BEGIN
      ALTER TABLE empresa ADD floor_plan_name NVARCHAR(255) NULL
    END
    IF COL_LENGTH('dbo.empresa', 'floor_plan_type') IS NULL
    BEGIN
      ALTER TABLE empresa ADD floor_plan_type VARCHAR(100) NULL
    END
    IF COL_LENGTH('dbo.empresa', 'zones_data') IS NULL
    BEGIN
      ALTER TABLE empresa ADD zones_data NVARCHAR(MAX) NULL
    END
  `);
}

// Copia a planta/zonas já configuradas no evento mais recente de cada
// empresa (dados antigos presos em `eventos`) para a nova coluna em
// `empresas`, para quem já tinha configurado não perder o trabalho.
async function migrateExistingEventMapDataToCompanies() {
  // Skip data migration for new Supabase installations
  return;
  const isPostgres = DB_DRIVER === 'postgres' || DB_DRIVER === 'postgresql';

  const companies = await allQuery(
    'SELECT "empresaId" as id FROM "empresa" WHERE floor_plan_data IS NULL OR zones_data IS NULL'
  );

  for (const company of companies) {
    const empresaId = company.id;

    const floorPlanRow = await queryOne(
      isPostgres
        ? `SELECT floor_plan_data, floor_plan_name, floor_plan_type FROM evento
           WHERE empresa_id = @empresa_id AND floor_plan_data IS NOT NULL
           ORDER BY date DESC LIMIT 1`
        : `SELECT TOP 1 floor_plan_data, floor_plan_name, floor_plan_type FROM evento
           WHERE empresa_id = @empresa_id AND floor_plan_data IS NOT NULL
           ORDER BY date DESC`,
      { empresa_id: empresaId }
    );
    if (floorPlanRow) {
      await query(
        `UPDATE "empresa" SET floor_plan_data = @data, floor_plan_name = @name, floor_plan_type = @type WHERE "empresaId" = @id`,
        {
          data: floorPlanRow.floor_plan_data,
          name: floorPlanRow.floor_plan_name,
          type: floorPlanRow.floor_plan_type,
          id: empresaId,
        }
      );
    }

    const zonesRow = await queryOne(
      isPostgres
        ? `SELECT zones_data FROM evento
           WHERE empresa_id = @empresa_id AND zones_data IS NOT NULL
           ORDER BY date DESC LIMIT 1`
        : `SELECT TOP 1 zones_data FROM evento
           WHERE empresa_id = @empresa_id AND zones_data IS NOT NULL
           ORDER BY date DESC`,
      { empresa_id: empresaId }
    );
    if (zonesRow) {
      await query(`UPDATE "empresa" SET zones_data = @zones_data WHERE "empresaId" = @id`, {
        zones_data: zonesRow.zones_data,
        id: empresaId,
      });
    }
  }
}

module.exports = { ensureCompanyMapSchema, migrateExistingEventMapDataToCompanies };
