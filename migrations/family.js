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
    await query('CREATE UNIQUE INDEX IF NOT EXISTS uqConviteFamiliaHashToken ON conviteFamilia (hashToken)');
    await query('CREATE UNIQUE INDEX IF NOT EXISTS uqVinculoFamiliarLoginCrianca ON vinculoFamiliar (loginId, criancaId)');
    // Vínculo passa a seguir o cadastro permanente da criança, não só a participação no evento.
    await query('ALTER TABLE vinculoFamiliar ADD COLUMN IF NOT EXISTS perfilCriancaId varchar(36)');
    await query('CREATE INDEX IF NOT EXISTS ixVinculoFamiliarPerfil ON vinculoFamiliar (perfilCriancaId)');
    await query(`
      UPDATE vinculoFamiliar v SET perfilCriancaId = c.perfilCriancaId
      FROM crianca c
      WHERE c.criancaId = v.criancaId AND v.perfilCriancaId IS NULL AND c.perfilCriancaId IS NOT NULL
    `);
    // Pré-cadastro: o responsável ligado ao cadastro antes de a criança ter participação em evento.
    await query(`
      CREATE TABLE IF NOT EXISTS perfilVinculoFamiliar (
        vinculoId varchar(36) PRIMARY KEY,
        loginId varchar(36) NOT NULL,
        perfilCriancaId varchar(36) NOT NULL,
        empresaId varchar(36) NOT NULL,
        relacionamento varchar(50) NOT NULL DEFAULT 'responsável',
        criadoEm timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await query('CREATE UNIQUE INDEX IF NOT EXISTS uqPerfilVinculoFamiliar ON perfilVinculoFamiliar (loginId, perfilCriancaId)');
    // Eventos que a família adicionou pelo código de convite, mesmo sem criança vinculada a eles.
    await query(`
      CREATE TABLE IF NOT EXISTS familiaEvento (
        familiaEventoId varchar(36) PRIMARY KEY,
        loginId varchar(36) NOT NULL,
        eventoId varchar(36) NOT NULL,
        empresaId varchar(36),
        conviteId varchar(36),
        criadoEm timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await query('CREATE UNIQUE INDEX IF NOT EXISTS uqFamiliaEventoLoginEvento ON familiaEvento (loginId, eventoId)');
    return;
  }

  await query(`
    IF OBJECT_ID('dbo.conviteFamilia', 'U') IS NULL
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
    IF OBJECT_ID('dbo.vinculoFamiliar', 'U') IS NULL
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
  const nomeFamiliaColumn = await queryOne(`
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'login' AND COLUMN_NAME = 'nomeFamilia'
  `);
  if (!nomeFamiliaColumn) {
    await query('ALTER TABLE login ADD nomeFamilia NVARCHAR(255) NULL');
  }
  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'uqConviteFamiliaHashToken' AND object_id = OBJECT_ID('dbo.conviteFamilia'))
      CREATE UNIQUE INDEX uqConviteFamiliaHashToken ON conviteFamilia (hashToken)
  `);
  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'uqVinculoFamiliarLoginCrianca' AND object_id = OBJECT_ID('dbo.vinculoFamiliar'))
      CREATE UNIQUE INDEX uqVinculoFamiliarLoginCrianca ON vinculoFamiliar (loginId, criancaId)
  `);
  // Vínculo passa a seguir o cadastro permanente da criança, não só a participação no evento.
  await query(`
    IF COL_LENGTH('dbo.vinculoFamiliar', 'perfilCriancaId') IS NULL
      ALTER TABLE vinculoFamiliar ADD perfilCriancaId NVARCHAR(36) NULL
  `);
  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ixVinculoFamiliarPerfil' AND object_id = OBJECT_ID('dbo.vinculoFamiliar'))
      CREATE INDEX ixVinculoFamiliarPerfil ON vinculoFamiliar (perfilCriancaId)
  `);
  await query(`
    UPDATE v SET v.perfilCriancaId = c.perfilCriancaId
    FROM vinculoFamiliar v
    JOIN crianca c ON c.criancaId = v.criancaId
    WHERE v.perfilCriancaId IS NULL AND c.perfilCriancaId IS NOT NULL
  `);
  // Pré-cadastro: o responsável ligado ao cadastro antes de a criança ter participação em evento.
  await query(`
    IF OBJECT_ID('dbo.perfilVinculoFamiliar', 'U') IS NULL
    BEGIN
      CREATE TABLE perfilVinculoFamiliar (
        vinculoId NVARCHAR(36) NOT NULL PRIMARY KEY,
        loginId NVARCHAR(36) NOT NULL,
        perfilCriancaId NVARCHAR(36) NOT NULL,
        empresaId NVARCHAR(36) NOT NULL,
        relacionamento NVARCHAR(50) NOT NULL DEFAULT 'responsável',
        criadoEm DATETIME2 NOT NULL DEFAULT GETDATE()
      )
    END
  `);
  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'uqPerfilVinculoFamiliar' AND object_id = OBJECT_ID('dbo.perfilVinculoFamiliar'))
      CREATE UNIQUE INDEX uqPerfilVinculoFamiliar ON perfilVinculoFamiliar (loginId, perfilCriancaId)
  `);
  // Eventos que a família adicionou pelo código de convite, mesmo sem criança vinculada a eles.
  await query(`
    IF OBJECT_ID('dbo.familiaEvento', 'U') IS NULL
    BEGIN
      CREATE TABLE familiaEvento (
        familiaEventoId NVARCHAR(36) NOT NULL PRIMARY KEY,
        loginId NVARCHAR(36) NOT NULL,
        eventoId NVARCHAR(36) NOT NULL,
        empresaId NVARCHAR(36) NULL,
        conviteId NVARCHAR(36) NULL,
        criadoEm DATETIME2 NOT NULL DEFAULT GETDATE()
      )
    END
  `);
  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'uqFamiliaEventoLoginEvento' AND object_id = OBJECT_ID('dbo.familiaEvento'))
      CREATE UNIQUE INDEX uqFamiliaEventoLoginEvento ON familiaEvento (loginId, eventoId)
  `);
}

module.exports = { ensureFamilySchema };
