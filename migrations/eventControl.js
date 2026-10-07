const { query, DB_DRIVER } = require('../database');

async function ensureEventControlSchema() {
  const isPostgres = DB_DRIVER === 'postgres' || DB_DRIVER === 'postgresql';

  if (isPostgres) {
    await query(`
      CREATE TABLE IF NOT EXISTS controleEventoEmpresa (
        empresaId varchar(36) PRIMARY KEY,
        eventoId varchar(36),
        atualizadoEm timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    return;
  }

  await query(`
    IF OBJECT_ID('dbo.empresa_event_control', 'U') IS NULL
    BEGIN
      CREATE TABLE empresa_event_control (
        empresaId NVARCHAR(36) NOT NULL PRIMARY KEY,
        eventoId NVARCHAR(36) NULL,
        updated_at DATETIME2 NOT NULL DEFAULT GETDATE()
      )
    END
  `);
}

module.exports = { ensureEventControlSchema };
