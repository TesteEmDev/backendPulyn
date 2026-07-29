const { query, DB_DRIVER } = require('../database');

async function ensureGameStateSchema() {
  const isPostgres = DB_DRIVER === 'postgres' || DB_DRIVER === 'postgresql';

  if (isPostgres) {
    await query(`
      CREATE TABLE IF NOT EXISTS event_game_state (
        evento_id varchar(36) PRIMARY KEY,
        empresa_id varchar(36) NOT NULL,
        mode varchar(20) NOT NULL DEFAULT 'idle',
        game_type varchar(50) NOT NULL DEFAULT 'none',
        game_id varchar(36),
        game_name varchar(255),
        started_at timestamptz,
        stopped_at timestamptz,
        updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await query('CREATE INDEX IF NOT EXISTS idx_event_game_state_empresa ON event_game_state (empresa_id)');
    return;
  }

  await query(`
    IF OBJECT_ID('dbo.event_game_state', 'U') IS NULL
    BEGIN
      CREATE TABLE event_game_state (
        evento_id NVARCHAR(36) NOT NULL PRIMARY KEY,
        empresa_id NVARCHAR(36) NOT NULL,
        mode NVARCHAR(20) NOT NULL DEFAULT 'idle',
        game_type NVARCHAR(50) NOT NULL DEFAULT 'none',
        game_id NVARCHAR(36) NULL,
        game_name NVARCHAR(255) NULL,
        started_at DATETIME2 NULL,
        stopped_at DATETIME2 NULL,
        updated_at DATETIME2 NOT NULL DEFAULT GETDATE()
      )
    END
  `);
}

module.exports = { ensureGameStateSchema };