const { query, DB_DRIVER } = require('../database');

async function ensureGameScoresSchema() {
  const isPostgres = DB_DRIVER === 'postgres' || DB_DRIVER === 'postgresql';

  if (isPostgres) {
    // Tabela principal de pontuação de jogos
    await query(`
      CREATE TABLE IF NOT EXISTS game_scores (
        id varchar(36) PRIMARY KEY,
        empresa_id varchar(36) NOT NULL,
        evento_id varchar(36) NOT NULL,
        time_id varchar(36) NOT NULL,
        game_type varchar(50) NOT NULL,
        round_number integer NOT NULL DEFAULT 1,
        points integer NOT NULL DEFAULT 0,
        bonus_points integer NOT NULL DEFAULT 0,
        total_points integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Índices para melhor performance
    await query('CREATE INDEX IF NOT EXISTS idx_game_scores_evento ON game_scores (empresa_id, evento_id)');
    await query('CREATE INDEX IF NOT EXISTS idx_game_scores_team ON game_scores (evento_id, time_id)');
    await query('CREATE INDEX IF NOT EXISTS idx_game_scores_game_type ON game_scores (evento_id, game_type)');
    await query('CREATE INDEX IF NOT EXISTS idx_game_scores_round ON game_scores (evento_id, round_number)');

    // Tabela de histórico de pontos (para auditoria)
    await query(`
      CREATE TABLE IF NOT EXISTS game_scores_history (
        id varchar(36) PRIMARY KEY,
        empresa_id varchar(36) NOT NULL,
        evento_id varchar(36) NOT NULL,
        time_id varchar(36) NOT NULL,
        game_type varchar(50) NOT NULL,
        round_number integer NOT NULL,
        action varchar(100) NOT NULL,
        points_earned integer NOT NULL DEFAULT 0,
        bonus_earned integer NOT NULL DEFAULT 0,
        total_before integer NOT NULL DEFAULT 0,
        total_after integer NOT NULL DEFAULT 0,
        details jsonb,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query('CREATE INDEX IF NOT EXISTS idx_game_scores_history_evento ON game_scores_history (empresa_id, evento_id)');
    await query('CREATE INDEX IF NOT EXISTS idx_game_scores_history_team ON game_scores_history (evento_id, time_id)');

    return;
  }

  // SQL Server
  await query(`
    IF OBJECT_ID('dbo.game_scores', 'U') IS NULL
    BEGIN
      CREATE TABLE game_scores (
        id NVARCHAR(36) NOT NULL PRIMARY KEY,
        empresa_id NVARCHAR(36) NOT NULL,
        evento_id NVARCHAR(36) NOT NULL,
        time_id NVARCHAR(36) NOT NULL,
        game_type NVARCHAR(50) NOT NULL,
        round_number INT NOT NULL DEFAULT 1,
        points INT NOT NULL DEFAULT 0,
        bonus_points INT NOT NULL DEFAULT 0,
        total_points INT NOT NULL DEFAULT 0,
        created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        updated_at DATETIME2 NOT NULL DEFAULT GETDATE()
      )
    END
  `);

  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_game_scores_evento' AND object_id = OBJECT_ID('dbo.game_scores'))
      CREATE INDEX idx_game_scores_evento ON game_scores (empresa_id, evento_id)
  `);

  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_game_scores_team' AND object_id = OBJECT_ID('dbo.game_scores'))
      CREATE INDEX idx_game_scores_team ON game_scores (evento_id, time_id)
  `);

  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_game_scores_game_type' AND object_id = OBJECT_ID('dbo.game_scores'))
      CREATE INDEX idx_game_scores_game_type ON game_scores (evento_id, game_type)
  `);

  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_game_scores_round' AND object_id = OBJECT_ID('dbo.game_scores'))
      CREATE INDEX idx_game_scores_round ON game_scores (evento_id, round_number)
  `);

  // Tabela de histórico
  await query(`
    IF OBJECT_ID('dbo.game_scores_history', 'U') IS NULL
    BEGIN
      CREATE TABLE game_scores_history (
        id NVARCHAR(36) NOT NULL PRIMARY KEY,
        empresa_id NVARCHAR(36) NOT NULL,
        evento_id NVARCHAR(36) NOT NULL,
        time_id NVARCHAR(36) NOT NULL,
        game_type NVARCHAR(50) NOT NULL,
        round_number INT NOT NULL,
        action NVARCHAR(100) NOT NULL,
        points_earned INT NOT NULL DEFAULT 0,
        bonus_earned INT NOT NULL DEFAULT 0,
        total_before INT NOT NULL DEFAULT 0,
        total_after INT NOT NULL DEFAULT 0,
        details NVARCHAR(MAX),
        created_at DATETIME2 NOT NULL DEFAULT GETDATE()
      )
    END
  `);

  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_game_scores_history_evento' AND object_id = OBJECT_ID('dbo.game_scores_history'))
      CREATE INDEX idx_game_scores_history_evento ON game_scores_history (empresa_id, evento_id)
  `);

  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_game_scores_history_team' AND object_id = OBJECT_ID('dbo.game_scores_history'))
      CREATE INDEX idx_game_scores_history_team ON game_scores_history (evento_id, time_id)
  `);
}

module.exports = { ensureGameScoresSchema };
