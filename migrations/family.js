const { query, queryOne, DB_DRIVER } = require('../database');

async function ensureFamilySchema() {
  const isPostgres = DB_DRIVER === 'postgres' || DB_DRIVER === 'postgresql';

  if (isPostgres) {
    await query(`
      CREATE TABLE IF NOT EXISTS conviteFamilia (
        conviteId varchar(36) PRIMARY KEY,
        empresaId varchar(36) NOT NULL,
        eventoId varchar(36) NOT NULL,
        criancaId varchar(36),
        email varchar(255),
        hashToken varchar(128) NOT NULL,
        status varchar(20) NOT NULL DEFAULT 'pending',
        expiramEm timestamptz NOT NULL,
        usadoEm timestamptz,
        criadoPor varchar(36),
        criadoEm timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS vinculoFamiliar (
        vinculoId varchar(36) PRIMARY KEY,
        loginId varchar(36) NOT NULL,
        criancaId varchar(36) NOT NULL,
        empresaId varchar(36) NOT NULL,
        relacionamento varchar(50) NOT NULL DEFAULT 'responsável',
        status varchar(20) NOT NULL DEFAULT 'pending',
        aprovadoPor varchar(36),
        aprovadoEm timestamptz,
        rejeitadoEm timestamptz,
        criadoEm timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await query('ALTER TABLE login ADD COLUMN IF NOT EXISTS nomeFamilia varchar(255)');
    await query('CREATE UNIQUE INDEX IF NOT EXISTS uq_family_invites_token_hash ON conviteFamilia (hashToken)');
    await query('CREATE UNIQUE INDEX IF NOT EXISTS uq_family_child_link ON vinculoFamiliar (loginId, criancaId)');
    return;
  }

  await query(`
    IF OBJECT_ID('dbo.family_invites', 'U') IS NULL
    BEGIN
      CREATE TABLE conviteFamilia (
        conviteId NVARCHAR(36) NOT NULL PRIMARY KEY,
        empresaId NVARCHAR(36) NOT NULL,
        eventoId NVARCHAR(36) NOT NULL,
        criancaId NVARCHAR(36) NULL,
        email NVARCHAR(255) NULL,
        hashToken NVARCHAR(128) NOT NULL,
        status NVARCHAR(20) NOT NULL DEFAULT 'pending',
        expiramEm DATETIME2 NOT NULL,
        usadoEm DATETIME2 NULL,
        criadoPor NVARCHAR(36) NULL,
        criadoEm DATETIME2 NOT NULL DEFAULT GETDATE()
      )
    END
  `);
  await query(`
    IF OBJECT_ID('dbo.family_child_links', 'U') IS NULL
    BEGIN
      CREATE TABLE vinculoFamiliar (
        vinculoId NVARCHAR(36) NOT NULL PRIMARY KEY,
        loginId NVARCHAR(36) NOT NULL,
        criancaId NVARCHAR(36) NOT NULL,
        empresaId NVARCHAR(36) NOT NULL,
        relacionamento NVARCHAR(50) NOT NULL DEFAULT 'responsável',
        status NVARCHAR(20) NOT NULL DEFAULT 'pending',
        aprovadoPor NVARCHAR(36) NULL,
        aprovadoEm DATETIME2 NULL,
        rejeitadoEm DATETIME2 NULL,
        criadoEm DATETIME2 NOT NULL DEFAULT GETDATE()
      )
    END
  `);
  const familyNameColumn = await queryOne(`
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'logins' AND COLUMN_NAME = 'family_name'
  `);
  if (!familyNameColumn) {
    await query('ALTER TABLE login ADD nomeFamilia NVARCHAR(255) NULL');
  }
  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'uq_family_invites_token_hash' AND object_id = OBJECT_ID('dbo.family_invites'))
      CREATE UNIQUE INDEX uq_family_invites_token_hash ON conviteFamilia (hashToken)
  `);
  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'uq_family_child_link' AND object_id = OBJECT_ID('dbo.family_child_links'))
      CREATE UNIQUE INDEX uq_family_child_link ON vinculoFamiliar (loginId, criancaId)
  `);
}

module.exports = { ensureFamilySchema };
