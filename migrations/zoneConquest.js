const { query, DB_DRIVER } = require('../database');

async function ensureZoneConquestSchema() {
  const isPostgres = DB_DRIVER === 'postgres' || DB_DRIVER === 'postgresql';

  if (isPostgres) {
    // Verificar e corrigir tabela zonas_equipes_scans existente
    try {
      const checkColumn = await query(`
        SELECT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_name = 'zonas_equipes_scans' 
          AND column_name = 'partida_id'
        )`);
      
      if (!checkColumn || !checkColumn[0]?.exists) {
        console.log('🔧 Adicionando coluna partida_id à tabela zonas_equipes_scans...');
        try {
          await query(`
            ALTER TABLE zonas_equipes_scans
            ADD COLUMN partida_id varchar(36)
          `);
        } catch (altErr) {
          if (!altErr.message.includes('already exists')) {
            console.warn('⚠️ Erro ao adicionar partida_id:', altErr.message);
          }
        }
      }
    } catch (checkErr) {
      console.warn('⚠️ Tabela zonas_equipes_scans pode não existir ainda, será criada...');
    }

    // Tabela principal de partidas de zona
    await query(`
      CREATE TABLE IF NOT EXISTS zonas_equipes_partidas (
        id varchar(36) PRIMARY KEY,
        empresa_id varchar(36) NOT NULL,
        evento_id varchar(36) NOT NULL,
        brincadeira_id varchar(36),
        status varchar(20) NOT NULL DEFAULT 'active',
        version integer NOT NULL DEFAULT 0,
        started_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        finished_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabela de estado das equipes nas zonas
    await query(`
      CREATE TABLE IF NOT EXISTS zonas_equipes_teams_states (
        id varchar(36) PRIMARY KEY,
        partida_id varchar(36) NOT NULL,
        empresa_id varchar(36) NOT NULL,
        evento_id varchar(36) NOT NULL,
        time_id varchar(36) NOT NULL,
        status varchar(20) NOT NULL DEFAULT 'active',
        version integer NOT NULL DEFAULT 0,
        defeated_at timestamptz,
        victory_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Índice único para garantir uma entrada por partida/equipe
    await query('CREATE UNIQUE INDEX IF NOT EXISTS uq_zonas_equipes_team_state ON zonas_equipes_teams_states (partida_id, time_id)');
    await query('CREATE INDEX IF NOT EXISTS idx_zonas_equipes_team_states_evento ON zonas_equipes_teams_states (empresa_id, evento_id, partida_id)');

    // Tabela de leituras/scans da zona
    await query(`
      CREATE TABLE IF NOT EXISTS zonas_equipes_scans (
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
        version integer NOT NULL DEFAULT 0,
        scanned_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query('CREATE INDEX IF NOT EXISTS idx_zonas_equipes_scans_checkpoint ON zonas_equipes_scans (partida_id, checkpoint_id, scanned_at)');
    await query('CREATE INDEX IF NOT EXISTS idx_zonas_equipes_partidas_evento ON zonas_equipes_partidas (empresa_id, evento_id, status)');
    await query('CREATE UNIQUE INDEX IF NOT EXISTS uq_zonas_equipes_scan_reading ON zonas_equipes_scans (leitura_id) WHERE leitura_id IS NOT NULL');
    await query('CREATE INDEX IF NOT EXISTS idx_zonas_equipes_scans_evento ON zonas_equipes_scans (empresa_id, evento_id, partida_id)');
    return;
  }

  // SQL Server
  await query(`
    IF OBJECT_ID('dbo.zonas_equipes_partidas', 'U') IS NULL
    BEGIN
      CREATE TABLE zonas_equipes_partidas (
        id NVARCHAR(36) NOT NULL PRIMARY KEY,
        empresa_id NVARCHAR(36) NOT NULL,
        evento_id NVARCHAR(36) NOT NULL,
        brincadeira_id NVARCHAR(36) NULL,
        status NVARCHAR(20) NOT NULL DEFAULT 'active',
        version INT NOT NULL DEFAULT 0,
        started_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        finished_at DATETIME2 NULL,
        created_at DATETIME2 NOT NULL DEFAULT GETDATE()
      )
    END
  `);

  await query(`
    IF OBJECT_ID('dbo.zonas_equipes_teams_states', 'U') IS NULL
    BEGIN
      CREATE TABLE zonas_equipes_teams_states (
        id NVARCHAR(36) NOT NULL PRIMARY KEY,
        partida_id NVARCHAR(36) NOT NULL,
        empresa_id NVARCHAR(36) NOT NULL,
        evento_id NVARCHAR(36) NOT NULL,
        time_id NVARCHAR(36) NOT NULL,
        status NVARCHAR(20) NOT NULL DEFAULT 'active',
        version INT NOT NULL DEFAULT 0,
        defeated_at DATETIME2 NULL,
        victory_at DATETIME2 NULL,
        created_at DATETIME2 NOT NULL DEFAULT GETDATE()
      )
    END
  `);

  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'uq_zonas_equipes_team_state' AND object_id = OBJECT_ID('dbo.zonas_equipes_teams_states'))
      CREATE UNIQUE INDEX uq_zonas_equipes_team_state ON zonas_equipes_teams_states (partida_id, time_id)
  `);

  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_zonas_equipes_team_states_evento' AND object_id = OBJECT_ID('dbo.zonas_equipes_teams_states'))
      CREATE INDEX idx_zonas_equipes_team_states_evento ON zonas_equipes_teams_states (empresa_id, evento_id, partida_id)
  `);

  await query(`
    IF OBJECT_ID('dbo.zonas_equipes_scans', 'U') IS NULL
    BEGIN
      CREATE TABLE zonas_equipes_scans (
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
        version INT NOT NULL DEFAULT 0,
        scanned_at DATETIME2 NOT NULL DEFAULT GETDATE()
      )
    END
  `);

  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_zonas_equipes_scans_checkpoint' AND object_id = OBJECT_ID('dbo.zonas_equipes_scans'))
      CREATE INDEX idx_zonas_equipes_scans_checkpoint ON zonas_equipes_scans (partida_id, checkpoint_id, scanned_at)
  `);

  await query(`
    IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'uq_zonas_equipes_scan_reading' AND object_id = OBJECT_ID('dbo.zonas_equipes_scans') AND filter_definition IS NULL)
      DROP INDEX uq_zonas_equipes_scan_reading ON zonas_equipes_scans
  `);

  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'uq_zonas_equipes_scan_reading' AND object_id = OBJECT_ID('dbo.zonas_equipes_scans'))
      CREATE UNIQUE INDEX uq_zonas_equipes_scan_reading ON zonas_equipes_scans (leitura_id) WHERE leitura_id IS NOT NULL
  `);

  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_zonas_equipes_partidas_evento' AND object_id = OBJECT_ID('dbo.zonas_equipes_partidas'))
      CREATE INDEX idx_zonas_equipes_partidas_evento ON zonas_equipes_partidas (empresa_id, evento_id, status)
  `);

  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_zonas_equipes_scans_evento' AND object_id = OBJECT_ID('dbo.zonas_equipes_scans'))
      CREATE INDEX idx_zonas_equipes_scans_evento ON zonas_equipes_scans (empresa_id, evento_id, partida_id)
  `);
}

module.exports = { ensureZoneConquestSchema };
