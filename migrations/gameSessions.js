// migrations/gameSessions.js - Tabela de sessões/partidas de jogos
const { query } = require('../database');

async function ensureGameSessionsSchema() {
  try {
    // PostgreSQL
    await query(`
      CREATE TABLE IF NOT EXISTS "game_sessions" (
        "id" varchar(36) PRIMARY KEY,
        "evento_id" varchar(36) NOT NULL,
        "brincadeira_id" varchar(36) NOT NULL,
        "game_type" varchar(50) NOT NULL,
        "mode" varchar(20), -- 'team', 'individual', etc
        "status" varchar(20) NOT NULL DEFAULT 'active', -- 'active', 'finished'
        "started_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "finished_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS "idx_game_sessions_evento" ON "game_sessions"("evento_id");
      CREATE INDEX IF NOT EXISTS "idx_game_sessions_brincadeira" ON "game_sessions"("brincadeira_id");
      CREATE INDEX IF NOT EXISTS "idx_game_sessions_status" ON "game_sessions"("status");
    `);
    
    console.log('✅ Schema de game_sessions verificado (PostgreSQL)');
  } catch (err) {
    // SQL Server fallback
    try {
      await query(`
        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='game_sessions' AND xtype='U')
        CREATE TABLE [game_sessions] (
          [id] VARCHAR(36) PRIMARY KEY,
          [evento_id] VARCHAR(36) NOT NULL,
          [brincadeira_id] VARCHAR(36) NOT NULL,
          [game_type] VARCHAR(50) NOT NULL,
          [mode] VARCHAR(20),
          [status] VARCHAR(20) NOT NULL DEFAULT 'active',
          [started_at] DATETIME2 NOT NULL DEFAULT GETDATE(),
          [finished_at] DATETIME2,
          [created_at] DATETIME2 NOT NULL DEFAULT GETDATE(),
          [updated_at] DATETIME2 NOT NULL DEFAULT GETDATE()
        );
        
        IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='idx_game_sessions_evento')
          CREATE INDEX idx_game_sessions_evento ON [game_sessions]([evento_id]);
        IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='idx_game_sessions_brincadeira')
          CREATE INDEX idx_game_sessions_brincadeira ON [game_sessions]([brincadeira_id]);
        IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='idx_game_sessions_status')
          CREATE INDEX idx_game_sessions_status ON [game_sessions]([status]);
      `);
      
      console.log('✅ Schema de game_sessions verificado (SQL Server)');
    } catch (sqlErr) {
      console.error('❌ Erro ao criar game_sessions:', sqlErr.message);
      throw sqlErr;
    }
  }
}

module.exports = { ensureGameSessionsSchema };
