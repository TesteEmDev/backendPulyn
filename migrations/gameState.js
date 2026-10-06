const { query, DB_DRIVER } = require('../database');

async function ensureGameStateSchema() {
  const isPostgres = DB_DRIVER === 'postgres' || DB_DRIVER === 'postgresql';

  if (isPostgres) {
    await query(`
      CREATE TABLE IF NOT EXISTS estadoJogoEvento (
        eventoId varchar(36) PRIMARY KEY,
        empresaId varchar(36) NOT NULL,
        modo varchar(20) NOT NULL DEFAULT 'idle',
        tipoJogo varchar(50) NOT NULL DEFAULT 'none',
        brincadeiraId varchar(36),
        nomeBrincadeira varchar(255),
        iniciadoEm timestamptz,
        paradoEm timestamptz,
        atualizadoEm timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await query('CREATE INDEX IF NOT EXISTS idx_event_game_state_empresa ON estadoJogoEvento (empresaId)');
    return;
  }

  await query(`
    IF OBJECT_ID('dbo.event_game_state', 'U') IS NULL
    BEGIN
      CREATE TABLE estadoJogoEvento (
        eventoId NVARCHAR(36) NOT NULL PRIMARY KEY,
        empresaId NVARCHAR(36) NOT NULL,
        modo NVARCHAR(20) NOT NULL DEFAULT 'idle',
        tipoJogo NVARCHAR(50) NOT NULL DEFAULT 'none',
        brincadeiraId NVARCHAR(36) NULL,
        nomeBrincadeira NVARCHAR(255) NULL,
        iniciadoEm DATETIME2 NULL,
        paradoEm DATETIME2 NULL,
        atualizadoEm DATETIME2 NOT NULL DEFAULT GETDATE()
      )
    END
  `);
}

module.exports = { ensureGameStateSchema };