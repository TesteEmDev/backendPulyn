// migrations/zoneConquest.js - Criar tabelas para Zone Conquest TEAM e INDIVIDUAL

const { query, DB_DRIVER } = require('../database');

async function ensureZoneConquestSchema() {
  const isPostgres = DB_DRIVER === 'postgres' || DB_DRIVER === 'postgresql';

  if (isPostgres) {
    // ========================================================================
    // ZONE CONQUEST TEAM (baseado em Treasure Hunt)
    // ========================================================================

    await query(`
      CREATE TABLE IF NOT EXISTS zone_conquest_team_partidas (
        id varchar(36) PRIMARY KEY,
        empresa_id varchar(36) NOT NULL,
        evento_id varchar(36) NOT NULL,
        brincadeira_id varchar(36) NOT NULL,
        status varchar(20) NOT NULL DEFAULT 'active',
        round_number integer NOT NULL DEFAULT 1,
        current_team_id varchar(36) NULL,
        started_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        finished_at timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS zone_conquest_team_tempos (
        id varchar(36) PRIMARY KEY,
        partida_id varchar(36) NOT NULL,
        empresa_id varchar(36) NOT NULL,
        evento_id varchar(36) NOT NULL,
        time_id varchar(36) NOT NULL,
        status varchar(20) NOT NULL DEFAULT 'active',
        zones_dominated integer NOT NULL DEFAULT 0,
        checkpoints_read integer NOT NULL DEFAULT 0,
        total_points numeric(10, 2) NOT NULL DEFAULT 0,
        started_at timestamptz NULL,
        completed_at timestamptz NULL,
        elapsed_ms integer NULL,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS zone_conquest_team_scans (
        id varchar(36) PRIMARY KEY,
        partida_id varchar(36) NOT NULL,
        empresa_id varchar(36) NOT NULL,
        evento_id varchar(36) NOT NULL,
        brincadeira_id varchar(36) NOT NULL,
        round_number integer NOT NULL,
        checkpoint_id varchar(36) NOT NULL,
        crianca_id varchar(36) NOT NULL,
        time_id varchar(36) NOT NULL,
        uid varchar(255),
        leitura_id varchar(36),
        points_awarded numeric(10, 2) NOT NULL DEFAULT 0,
        scanned_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ========================================================================
    // ZONE CONQUEST INDIVIDUAL (baseado em Monster Hunt com versionning)
    // ========================================================================

    await query(`
      CREATE TABLE IF NOT EXISTS zone_conquest_individual_partidas (
        id varchar(36) PRIMARY KEY,
        empresa_id varchar(36) NOT NULL,
        evento_id varchar(36) NOT NULL,
        brincadeira_id varchar(36) NOT NULL,
        status varchar(20) NOT NULL DEFAULT 'active',
        version integer NOT NULL DEFAULT 0,
        started_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        finished_at timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS zone_conquest_individual_participant_states (
        id varchar(36) PRIMARY KEY,
        partida_id varchar(36) NOT NULL,
        empresa_id varchar(36) NOT NULL,
        evento_id varchar(36) NOT NULL,
        crianca_id varchar(36) NOT NULL,
        status varchar(20) NOT NULL DEFAULT 'active',
        checkpoints_read integer NOT NULL DEFAULT 0,
        total_points numeric(10, 2) NOT NULL DEFAULT 0,
        ranking integer NULL,
        version integer NOT NULL DEFAULT 0,
        started_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        finished_at timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS zone_conquest_individual_scans (
        id varchar(36) PRIMARY KEY,
        partida_id varchar(36) NOT NULL,
        empresa_id varchar(36) NOT NULL,
        evento_id varchar(36) NOT NULL,
        brincadeira_id varchar(36) NOT NULL,
        checkpoint_id varchar(36) NOT NULL,
        crianca_id varchar(36) NOT NULL,
        uid varchar(255),
        leitura_id varchar(36),
        points_awarded numeric(10, 2) NOT NULL DEFAULT 0,
        version integer NOT NULL DEFAULT 0,
        scanned_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS zone_conquest_individual_checkpoint_protection (
        id varchar(36) PRIMARY KEY,
        partida_id varchar(36) NOT NULL,
        checkpoint_id varchar(36) NOT NULL,
        crianca_id varchar(36) NOT NULL,
        protection_until timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ========================================================================
    // ÍNDICES
    // ========================================================================

    // TEAM indices
    await query('CREATE INDEX IF NOT EXISTS idx_zone_team_partidas_evento ON zone_conquest_team_partidas (evento_id, status)');
    await query('CREATE INDEX IF NOT EXISTS idx_zone_team_tempos_partida ON zone_conquest_team_tempos (partida_id, time_id)');
    await query('CREATE UNIQUE INDEX IF NOT EXISTS uq_zone_team_scan_reading ON zone_conquest_team_scans (leitura_id) WHERE leitura_id IS NOT NULL');
    await query('CREATE INDEX IF NOT EXISTS idx_zone_team_scans_partida ON zone_conquest_team_scans (partida_id, round_number)');

    // INDIVIDUAL indices
    await query('CREATE INDEX IF NOT EXISTS idx_zone_individual_partidas_evento ON zone_conquest_individual_partidas (evento_id, status)');
    await query('CREATE INDEX IF NOT EXISTS idx_zone_individual_states_partida ON zone_conquest_individual_participant_states (partida_id, crianca_id)');
    await query('CREATE UNIQUE INDEX IF NOT EXISTS uq_zone_individual_scan_reading ON zone_conquest_individual_scans (leitura_id) WHERE leitura_id IS NOT NULL');
    await query('CREATE INDEX IF NOT EXISTS idx_zone_individual_scans_partida ON zone_conquest_individual_scans (partida_id, crianca_id)');
    await query('CREATE INDEX IF NOT EXISTS idx_zone_individual_protection_checkpoint ON zone_conquest_individual_checkpoint_protection (checkpoint_id, protection_until)');

    return;
  }

  // ========================================================================
  // SQL SERVER
  // ========================================================================

  // ZONE CONQUEST TEAM
  await query(`
    IF OBJECT_ID('dbo.zone_conquest_team_partidas', 'U') IS NULL
    BEGIN
      CREATE TABLE zone_conquest_team_partidas (
        id NVARCHAR(36) NOT NULL PRIMARY KEY,
        empresa_id NVARCHAR(36) NOT NULL,
        evento_id NVARCHAR(36) NOT NULL,
        brincadeira_id NVARCHAR(36) NOT NULL,
        status NVARCHAR(20) NOT NULL DEFAULT 'active',
        round_number INT NOT NULL DEFAULT 1,
        current_team_id NVARCHAR(36) NULL,
        started_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        finished_at DATETIME2 NULL,
        created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        updated_at DATETIME2 NOT NULL DEFAULT GETDATE()
      )
    END
  `);

  await query(`
    IF OBJECT_ID('dbo.zone_conquest_team_tempos', 'U') IS NULL
    BEGIN
      CREATE TABLE zone_conquest_team_tempos (
        id NVARCHAR(36) NOT NULL PRIMARY KEY,
        partida_id NVARCHAR(36) NOT NULL,
        empresa_id NVARCHAR(36) NOT NULL,
        evento_id NVARCHAR(36) NOT NULL,
        time_id NVARCHAR(36) NOT NULL,
        status NVARCHAR(20) NOT NULL DEFAULT 'active',
        zones_dominated INT NOT NULL DEFAULT 0,
        checkpoints_read INT NOT NULL DEFAULT 0,
        total_points NUMERIC(10, 2) NOT NULL DEFAULT 0,
        started_at DATETIME2 NULL,
        completed_at DATETIME2 NULL,
        elapsed_ms INT NULL,
        created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        updated_at DATETIME2 NOT NULL DEFAULT GETDATE()
      )
    END
  `);

  await query(`
    IF OBJECT_ID('dbo.zone_conquest_team_scans', 'U') IS NULL
    BEGIN
      CREATE TABLE zone_conquest_team_scans (
        id NVARCHAR(36) NOT NULL PRIMARY KEY,
        partida_id NVARCHAR(36) NOT NULL,
        empresa_id NVARCHAR(36) NOT NULL,
        evento_id NVARCHAR(36) NOT NULL,
        brincadeira_id NVARCHAR(36) NOT NULL,
        round_number INT NOT NULL,
        checkpoint_id NVARCHAR(36) NOT NULL,
        crianca_id NVARCHAR(36) NOT NULL,
        time_id NVARCHAR(36) NOT NULL,
        uid NVARCHAR(255) NULL,
        leitura_id NVARCHAR(36) NULL,
        points_awarded NUMERIC(10, 2) NOT NULL DEFAULT 0,
        scanned_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        created_at DATETIME2 NOT NULL DEFAULT GETDATE()
      )
    END
  `);

  // ZONE CONQUEST INDIVIDUAL
  await query(`
    IF OBJECT_ID('dbo.zone_conquest_individual_partidas', 'U') IS NULL
    BEGIN
      CREATE TABLE zone_conquest_individual_partidas (
        id NVARCHAR(36) NOT NULL PRIMARY KEY,
        empresa_id NVARCHAR(36) NOT NULL,
        evento_id NVARCHAR(36) NOT NULL,
        brincadeira_id NVARCHAR(36) NOT NULL,
        status NVARCHAR(20) NOT NULL DEFAULT 'active',
        version INT NOT NULL DEFAULT 0,
        started_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        finished_at DATETIME2 NULL,
        created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        updated_at DATETIME2 NOT NULL DEFAULT GETDATE()
      )
    END
  `);

  await query(`
    IF OBJECT_ID('dbo.zone_conquest_individual_participant_states', 'U') IS NULL
    BEGIN
      CREATE TABLE zone_conquest_individual_participant_states (
        id NVARCHAR(36) NOT NULL PRIMARY KEY,
        partida_id NVARCHAR(36) NOT NULL,
        empresa_id NVARCHAR(36) NOT NULL,
        evento_id NVARCHAR(36) NOT NULL,
        crianca_id NVARCHAR(36) NOT NULL,
        status NVARCHAR(20) NOT NULL DEFAULT 'active',
        checkpoints_read INT NOT NULL DEFAULT 0,
        total_points NUMERIC(10, 2) NOT NULL DEFAULT 0,
        ranking INT NULL,
        version INT NOT NULL DEFAULT 0,
        started_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        finished_at DATETIME2 NULL,
        created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        updated_at DATETIME2 NOT NULL DEFAULT GETDATE()
      )
    END
  `);

  await query(`
    IF OBJECT_ID('dbo.zone_conquest_individual_scans', 'U') IS NULL
    BEGIN
      CREATE TABLE zone_conquest_individual_scans (
        id NVARCHAR(36) NOT NULL PRIMARY KEY,
        partida_id NVARCHAR(36) NOT NULL,
        empresa_id NVARCHAR(36) NOT NULL,
        evento_id NVARCHAR(36) NOT NULL,
        brincadeira_id NVARCHAR(36) NOT NULL,
        checkpoint_id NVARCHAR(36) NOT NULL,
        crianca_id NVARCHAR(36) NOT NULL,
        uid NVARCHAR(255) NULL,
        leitura_id NVARCHAR(36) NULL,
        points_awarded NUMERIC(10, 2) NOT NULL DEFAULT 0,
        version INT NOT NULL DEFAULT 0,
        scanned_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        created_at DATETIME2 NOT NULL DEFAULT GETDATE()
      )
    END
  `);

  await query(`
    IF OBJECT_ID('dbo.zone_conquest_individual_checkpoint_protection', 'U') IS NULL
    BEGIN
      CREATE TABLE zone_conquest_individual_checkpoint_protection (
        id NVARCHAR(36) NOT NULL PRIMARY KEY,
        partida_id NVARCHAR(36) NOT NULL,
        checkpoint_id NVARCHAR(36) NOT NULL,
        crianca_id NVARCHAR(36) NOT NULL,
        protection_until DATETIME2 NOT NULL,
        created_at DATETIME2 NOT NULL DEFAULT GETDATE()
      )
    END
  `);

  // ========================================================================
  // SQL SERVER INDICES
  // ========================================================================

  // TEAM indices
  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_zone_team_partidas_evento' AND object_id = OBJECT_ID('dbo.zone_conquest_team_partidas'))
      CREATE INDEX idx_zone_team_partidas_evento ON zone_conquest_team_partidas (evento_id, status)
  `);

  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_zone_team_tempos_partida' AND object_id = OBJECT_ID('dbo.zone_conquest_team_tempos'))
      CREATE INDEX idx_zone_team_tempos_partida ON zone_conquest_team_tempos (partida_id, time_id)
  `);

  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'uq_zone_team_scan_reading' AND object_id = OBJECT_ID('dbo.zone_conquest_team_scans'))
      CREATE UNIQUE INDEX uq_zone_team_scan_reading ON zone_conquest_team_scans (leitura_id) WHERE leitura_id IS NOT NULL
  `);

  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_zone_team_scans_partida' AND object_id = OBJECT_ID('dbo.zone_conquest_team_scans'))
      CREATE INDEX idx_zone_team_scans_partida ON zone_conquest_team_scans (partida_id, round_number)
  `);

  // INDIVIDUAL indices
  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_zone_individual_partidas_evento' AND object_id = OBJECT_ID('dbo.zone_conquest_individual_partidas'))
      CREATE INDEX idx_zone_individual_partidas_evento ON zone_conquest_individual_partidas (evento_id, status)
  `);

  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_zone_individual_states_partida' AND object_id = OBJECT_ID('dbo.zone_conquest_individual_participant_states'))
      CREATE INDEX idx_zone_individual_states_partida ON zone_conquest_individual_participant_states (partida_id, crianca_id)
  `);

  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'uq_zone_individual_scan_reading' AND object_id = OBJECT_ID('dbo.zone_conquest_individual_scans'))
      CREATE UNIQUE INDEX uq_zone_individual_scan_reading ON zone_conquest_individual_scans (leitura_id) WHERE leitura_id IS NOT NULL
  `);

  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_zone_individual_scans_partida' AND object_id = OBJECT_ID('dbo.zone_conquest_individual_scans'))
      CREATE INDEX idx_zone_individual_scans_partida ON zone_conquest_individual_scans (partida_id, crianca_id)
  `);

  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_zone_individual_protection_checkpoint' AND object_id = OBJECT_ID('dbo.zone_conquest_individual_checkpoint_protection'))
      CREATE INDEX idx_zone_individual_protection_checkpoint ON zone_conquest_individual_checkpoint_protection (checkpoint_id, protection_until)
  `);
}

module.exports = { ensureZoneConquestSchema };
