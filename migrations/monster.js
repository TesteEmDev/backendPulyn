const { query, DB_DRIVER } = require('../database');

async function ensureMonsterHuntSchema() {
  const isPostgres = DB_DRIVER === 'postgres' || DB_DRIVER === 'postgresql';

  if (isPostgres) {
    await query(`
      CREATE TABLE IF NOT EXISTS monster_hunt_partidas (
        id varchar(36) PRIMARY KEY,
        empresa_id varchar(36) NOT NULL,
        evento_id varchar(36) NOT NULL,
        brincadeira_id varchar(36),
        status varchar(20) NOT NULL DEFAULT 'active',
        hp integer NOT NULL DEFAULT 500,
        max_hp integer NOT NULL DEFAULT 500,
        normal_damage integer NOT NULL DEFAULT 10,
        special_checkpoint_damage integer NOT NULL DEFAULT 30,
        special_attack_damage integer NOT NULL DEFAULT 50,
        special_checkpoint_id varchar(36),
        winner_time_id varchar(36),
        version integer NOT NULL DEFAULT 0,
        started_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        finished_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS monster_hunt_team_states (
        id varchar(36) PRIMARY KEY,
        partida_id varchar(36) NOT NULL,
        empresa_id varchar(36) NOT NULL,
        evento_id varchar(36) NOT NULL,
        time_id varchar(36) NOT NULL,
        hp integer NOT NULL DEFAULT 500,
        max_hp integer NOT NULL DEFAULT 500,
        status varchar(20) NOT NULL DEFAULT 'active',
        version integer NOT NULL DEFAULT 0,
        defeated_at timestamptz,
        victory_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await query('CREATE UNIQUE INDEX IF NOT EXISTS uq_monster_hunt_team_state ON monster_hunt_team_states (partida_id, time_id)');
    await query('CREATE INDEX IF NOT EXISTS idx_monster_hunt_team_states_evento ON monster_hunt_team_states (empresa_id, evento_id, partida_id)');
    await query(`
      CREATE TABLE IF NOT EXISTS monster_hunt_scans (
        id varchar(36) PRIMARY KEY,
        partida_id varchar(36) NOT NULL,
        empresa_id varchar(36) NOT NULL,
        evento_id varchar(36) NOT NULL,
        brincadeira_id varchar(36),
        checkpoint_id varchar(36) NOT NULL,
        crianca_id varchar(36) NOT NULL,
        time_id varchar(36),
        uid varchar(255),
        leitura_id varchar(36),
        attack_type varchar(30) NOT NULL,
        damage integer NOT NULL DEFAULT 0,
        monster_hp_after integer NOT NULL,
        monster_defeated boolean NOT NULL DEFAULT false,
        version integer NOT NULL DEFAULT 0,
        scanned_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await query('ALTER TABLE monster_hunt_scans DROP CONSTRAINT IF EXISTS "UQ_monster_hunt_scan_child"');
    await query('DROP INDEX IF EXISTS uq_monster_hunt_scan_child');
    await query('CREATE INDEX IF NOT EXISTS idx_monster_hunt_scans_checkpoint ON monster_hunt_scans (partida_id, checkpoint_id, scanned_at)');
    await query('CREATE UNIQUE INDEX IF NOT EXISTS uq_monster_hunt_scan_reading ON monster_hunt_scans (leitura_id) WHERE leitura_id IS NOT NULL');
    await query('CREATE INDEX IF NOT EXISTS idx_monster_hunt_partidas_evento ON monster_hunt_partidas (empresa_id, evento_id, status)');
    await query('CREATE INDEX IF NOT EXISTS idx_monster_hunt_scans_evento ON monster_hunt_scans (empresa_id, evento_id, partida_id)');
    return;
  }

  await query(`
    IF OBJECT_ID('dbo.monster_hunt_partidas', 'U') IS NULL
    BEGIN
      CREATE TABLE monster_hunt_partidas (
        id NVARCHAR(36) NOT NULL PRIMARY KEY,
        empresa_id NVARCHAR(36) NOT NULL,
        evento_id NVARCHAR(36) NOT NULL,
        brincadeira_id NVARCHAR(36) NULL,
        status NVARCHAR(20) NOT NULL DEFAULT 'active',
        hp INT NOT NULL DEFAULT 500,
        max_hp INT NOT NULL DEFAULT 500,
        normal_damage INT NOT NULL DEFAULT 10,
        special_checkpoint_damage INT NOT NULL DEFAULT 30,
        special_attack_damage INT NOT NULL DEFAULT 50,
        special_checkpoint_id NVARCHAR(36) NULL,
        winner_time_id NVARCHAR(36) NULL,
        version INT NOT NULL DEFAULT 0,
        started_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        finished_at DATETIME2 NULL,
        created_at DATETIME2 NOT NULL DEFAULT GETDATE()
      )
    END
  `);
  await query(`
    IF OBJECT_ID('dbo.monster_hunt_team_states', 'U') IS NULL
    BEGIN
      CREATE TABLE monster_hunt_team_states (
        id NVARCHAR(36) NOT NULL PRIMARY KEY,
        partida_id NVARCHAR(36) NOT NULL,
        empresa_id NVARCHAR(36) NOT NULL,
        evento_id NVARCHAR(36) NOT NULL,
        time_id NVARCHAR(36) NOT NULL,
        hp INT NOT NULL DEFAULT 500,
        max_hp INT NOT NULL DEFAULT 500,
        status NVARCHAR(20) NOT NULL DEFAULT 'active',
        version INT NOT NULL DEFAULT 0,
        defeated_at DATETIME2 NULL,
        victory_at DATETIME2 NULL,
        created_at DATETIME2 NOT NULL DEFAULT GETDATE()
      )
    END
  `);
  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'uq_monster_hunt_team_state' AND object_id = OBJECT_ID('dbo.monster_hunt_team_states'))
      CREATE UNIQUE INDEX uq_monster_hunt_team_state ON monster_hunt_team_states (partida_id, time_id)
  `);
  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_monster_hunt_team_states_evento' AND object_id = OBJECT_ID('dbo.monster_hunt_team_states'))
      CREATE INDEX idx_monster_hunt_team_states_evento ON monster_hunt_team_states (empresa_id, evento_id, partida_id)
  `);
  await query(`
    IF OBJECT_ID('dbo.monster_hunt_scans', 'U') IS NULL
    BEGIN
      CREATE TABLE monster_hunt_scans (
        id NVARCHAR(36) NOT NULL PRIMARY KEY,
        partida_id NVARCHAR(36) NOT NULL,
        empresa_id NVARCHAR(36) NOT NULL,
        evento_id NVARCHAR(36) NOT NULL,
        brincadeira_id NVARCHAR(36) NULL,
        checkpoint_id NVARCHAR(36) NOT NULL,
        crianca_id NVARCHAR(36) NOT NULL,
        time_id NVARCHAR(36) NULL,
        uid NVARCHAR(255) NULL,
        leitura_id NVARCHAR(36) NULL,
        attack_type NVARCHAR(30) NOT NULL,
        damage INT NOT NULL DEFAULT 0,
        monster_hp_after INT NOT NULL,
        monster_defeated BIT NOT NULL DEFAULT 0,
        version INT NOT NULL DEFAULT 0,
        scanned_at DATETIME2 NOT NULL DEFAULT GETDATE()
      )
    END
  `);
  await query(`
    IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'uq_monster_hunt_scan_child' AND parent_object_id = OBJECT_ID('dbo.monster_hunt_scans'))
      ALTER TABLE monster_hunt_scans DROP CONSTRAINT uq_monster_hunt_scan_child
  `);
  await query(`
    IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'uq_monster_hunt_scan_child' AND object_id = OBJECT_ID('dbo.monster_hunt_scans'))
      DROP INDEX uq_monster_hunt_scan_child ON monster_hunt_scans
  `);
  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_monster_hunt_scans_checkpoint' AND object_id = OBJECT_ID('dbo.monster_hunt_scans'))
      CREATE INDEX idx_monster_hunt_scans_checkpoint ON monster_hunt_scans (partida_id, checkpoint_id, scanned_at)
  `);
  await query(`
    IF EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = 'uq_monster_hunt_scan_reading'
        AND object_id = OBJECT_ID('dbo.monster_hunt_scans')
        AND filter_definition IS NULL
    )
      DROP INDEX uq_monster_hunt_scan_reading ON monster_hunt_scans
  `);
  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'uq_monster_hunt_scan_reading' AND object_id = OBJECT_ID('dbo.monster_hunt_scans'))
      CREATE UNIQUE INDEX uq_monster_hunt_scan_reading ON monster_hunt_scans (leitura_id) WHERE leitura_id IS NOT NULL
  `);
  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_monster_hunt_partidas_evento' AND object_id = OBJECT_ID('dbo.monster_hunt_partidas'))
      CREATE INDEX idx_monster_hunt_partidas_evento ON monster_hunt_partidas (empresa_id, evento_id, status)
  `);
  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_monster_hunt_scans_evento' AND object_id = OBJECT_ID('dbo.monster_hunt_scans'))
      CREATE INDEX idx_monster_hunt_scans_evento ON monster_hunt_scans (empresa_id, evento_id, partida_id)
  `);
}

module.exports = { ensureMonsterHuntSchema };
