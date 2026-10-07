// migrations/gameSessions.js - Tabela de sessões/partidas de jogos
const { query } = require('../database');

async function ensureGameSessionsSchema() {
  try {
    // PostgreSQL
    await query(`
      CREATE TABLE IF NOT EXISTS "sessaoJogo" (
        "id" varchar(36) PRIMARY KEY,
        "eventoId" varchar(36) NOT NULL,
        "brincadeiraId" varchar(36) NOT NULL,
        "tipoJogo" varchar(50) NOT NULL,
        "modo" varchar(20), -- 'team', 'individual', etc
        "status" varchar(20) NOT NULL DEFAULT 'active', -- 'active', 'finished'
        "iniciadoEm" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "finalizadoEm" timestamptz,
        "criadoEm" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "atualizadoEm" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS "idx_game_sessions_evento" ON "sessaoJogo"("eventoId");
      CREATE INDEX IF NOT EXISTS "idx_game_sessions_brincadeira" ON "sessaoJogo"("brincadeiraId");
      CREATE INDEX IF NOT EXISTS "idx_game_sessions_status" ON "sessaoJogo"("status");
    `);
    
    console.log('✅ Schema de game_sessions verificado (PostgreSQL)');
  } catch (err) {
    // SQL Server fallback
    try {
      await query(`
        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='game_sessions' AND xtype='U')
        CREATE TABLE [game_sessions] (
          [id] VARCHAR(36) PRIMARY KEY,
          [eventoId] VARCHAR(36) NOT NULL,
          [brincadeiraId] VARCHAR(36) NOT NULL,
          [tipoJogo] VARCHAR(50) NOT NULL,
          [mode] VARCHAR(20),
          [status] VARCHAR(20) NOT NULL DEFAULT 'active',
          [iniciadoEm] DATETIME2 NOT NULL DEFAULT GETDATE(),
          [finalizadoEm] DATETIME2,
          [created_at] DATETIME2 NOT NULL DEFAULT GETDATE(),
          [updated_at] DATETIME2 NOT NULL DEFAULT GETDATE()
        );
        
        IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='idx_game_sessions_evento')
          CREATE INDEX idx_game_sessions_evento ON [game_sessions]([eventoId]);
        IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='idx_game_sessions_brincadeira')
          CREATE INDEX idx_game_sessions_brincadeira ON [game_sessions]([brincadeiraId]);
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
