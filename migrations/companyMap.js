const { query, queryOne, allQuery, DB_DRIVER } = require('../database');

// Planta e zonas do mapa pertencem ao espaço físico do buffet (empresa), não
// a um evento específico — por isso moram em `empresa`, não em `evento`.
async function ensureCompanyMapSchema() {
  const isPostgres = DB_DRIVER === 'postgres' || DB_DRIVER === 'postgresql';

  if (isPostgres) {
    await query(`
      ALTER TABLE empresa
      ADD COLUMN IF NOT EXISTS dadosPlanoPiso text,
      ADD COLUMN IF NOT EXISTS nomePlanoPiso varchar(255),
      ADD COLUMN IF NOT EXISTS tipoPlanoPiso varchar(100),
      ADD COLUMN IF NOT EXISTS dadosZonas text
    `);
    return;
  }

  await query(`
    IF COL_LENGTH('dbo.empresa', 'dadosPlanoPiso') IS NULL
    BEGIN
      ALTER TABLE empresa ADD dadosPlanoPiso NVARCHAR(MAX) NULL
    END
    IF COL_LENGTH('dbo.empresa', 'nomePlanoPiso') IS NULL
    BEGIN
      ALTER TABLE empresa ADD nomePlanoPiso NVARCHAR(255) NULL
    END
    IF COL_LENGTH('dbo.empresa', 'tipoPlanoPiso') IS NULL
    BEGIN
      ALTER TABLE empresa ADD tipoPlanoPiso VARCHAR(100) NULL
    END
    IF COL_LENGTH('dbo.empresa', 'dadosZonas') IS NULL
    BEGIN
      ALTER TABLE empresa ADD dadosZonas NVARCHAR(MAX) NULL
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
    'SELECT "empresaId" as id FROM "empresa" WHERE dadosPlanoPiso IS NULL OR dadosZonas IS NULL'
  );

  for (const company of companies) {
    const empresaId = company.id;

    const floorPlanRow = await queryOne(
      isPostgres
        ? `SELECT dadosPlanoPiso, nomePlanoPiso, tipoPlanoPiso FROM evento
           WHERE empresaId = @empresaId AND dadosPlanoPiso IS NOT NULL
           ORDER BY data DESC LIMIT 1`
        : `SELECT TOP 1 dadosPlanoPiso, nomePlanoPiso, tipoPlanoPiso FROM evento
           WHERE empresaId = @empresaId AND dadosPlanoPiso IS NOT NULL
           ORDER BY data DESC`,
      { empresaId: empresaId }
    );
    if (floorPlanRow) {
      await query(
        `UPDATE "empresa" SET dadosPlanoPiso = @data, nomePlanoPiso = @name, tipoPlanoPiso = @type WHERE "empresaId" = @id`,
        {
          data: floorPlanRow.dadosPlanoPiso,
          name: floorPlanRow.nomePlanoPiso,
          type: floorPlanRow.tipoPlanoPiso,
          id: empresaId,
        }
      );
    }

    const zonesRow = await queryOne(
      isPostgres
        ? `SELECT dadosZonas FROM evento
           WHERE empresaId = @empresaId AND dadosZonas IS NOT NULL
           ORDER BY data DESC LIMIT 1`
        : `SELECT TOP 1 dadosZonas FROM evento
           WHERE empresaId = @empresaId AND dadosZonas IS NOT NULL
           ORDER BY data DESC`,
      { empresaId: empresaId }
    );
    if (zonesRow) {
      await query(`UPDATE "empresa" SET dadosZonas = @dadosZonas WHERE "empresaId" = @id`, {
        dadosZonas: zonesRow.dadosZonas,
        id: empresaId,
      });
    }
  }
}

module.exports = { ensureCompanyMapSchema, migrateExistingEventMapDataToCompanies };
