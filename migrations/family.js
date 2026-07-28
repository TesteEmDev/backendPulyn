const { query, queryOne, DB_DRIVER } = require('../database');

async function ensureFamilySchema() {
  const isPostgres = DB_DRIVER === 'postgres' || DB_DRIVER === 'postgresql';

  if (isPostgres) {
    await query(`
      CREATE TABLE IF NOT EXISTS family_invites (
        id varchar(36) PRIMARY KEY,
        empresa_id varchar(36) NOT NULL,
        evento_id varchar(36) NOT NULL,
        crianca_id varchar(36),
        email varchar(255),
        token_hash varchar(128) NOT NULL,
        status varchar(20) NOT NULL DEFAULT 'pending',
        expires_at timestamptz NOT NULL,
        used_at timestamptz,
        created_by varchar(36),
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS family_child_links (
        id varchar(36) PRIMARY KEY,
        login_id varchar(36) NOT NULL,
        crianca_id varchar(36) NOT NULL,
        empresa_id varchar(36) NOT NULL,
        relationship varchar(50) NOT NULL DEFAULT 'responsável',
        status varchar(20) NOT NULL DEFAULT 'pending',
        approved_by varchar(36),
        approved_at timestamptz,
        rejected_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await query('ALTER TABLE logins ADD COLUMN IF NOT EXISTS family_name varchar(255)');
    await query('CREATE UNIQUE INDEX IF NOT EXISTS uq_family_invites_token_hash ON family_invites (token_hash)');
    await query('CREATE UNIQUE INDEX IF NOT EXISTS uq_family_child_link ON family_child_links (login_id, crianca_id)');
    return;
  }

  await query(`
    IF OBJECT_ID('dbo.family_invites', 'U') IS NULL
    BEGIN
      CREATE TABLE family_invites (
        id NVARCHAR(36) NOT NULL PRIMARY KEY,
        empresa_id NVARCHAR(36) NOT NULL,
        evento_id NVARCHAR(36) NOT NULL,
        crianca_id NVARCHAR(36) NULL,
        email NVARCHAR(255) NULL,
        token_hash NVARCHAR(128) NOT NULL,
        status NVARCHAR(20) NOT NULL DEFAULT 'pending',
        expires_at DATETIME2 NOT NULL,
        used_at DATETIME2 NULL,
        created_by NVARCHAR(36) NULL,
        created_at DATETIME2 NOT NULL DEFAULT GETDATE()
      )
    END
  `);
  await query(`
    IF OBJECT_ID('dbo.family_child_links', 'U') IS NULL
    BEGIN
      CREATE TABLE family_child_links (
        id NVARCHAR(36) NOT NULL PRIMARY KEY,
        login_id NVARCHAR(36) NOT NULL,
        crianca_id NVARCHAR(36) NOT NULL,
        empresa_id NVARCHAR(36) NOT NULL,
        relationship NVARCHAR(50) NOT NULL DEFAULT 'responsável',
        status NVARCHAR(20) NOT NULL DEFAULT 'pending',
        approved_by NVARCHAR(36) NULL,
        approved_at DATETIME2 NULL,
        rejected_at DATETIME2 NULL,
        created_at DATETIME2 NOT NULL DEFAULT GETDATE()
      )
    END
  `);
  const familyNameColumn = await queryOne(`
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'logins' AND COLUMN_NAME = 'family_name'
  `);
  if (!familyNameColumn) {
    await query('ALTER TABLE logins ADD family_name NVARCHAR(255) NULL');
  }
  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'uq_family_invites_token_hash' AND object_id = OBJECT_ID('dbo.family_invites'))
      CREATE UNIQUE INDEX uq_family_invites_token_hash ON family_invites (token_hash)
  `);
  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'uq_family_child_link' AND object_id = OBJECT_ID('dbo.family_child_links'))
      CREATE UNIQUE INDEX uq_family_child_link ON family_child_links (login_id, crianca_id)
  `);
}

module.exports = { ensureFamilySchema };
