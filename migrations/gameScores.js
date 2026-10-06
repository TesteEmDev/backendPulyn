const { query, DB_DRIVER } = require('../database');

async function ensureGameScoresSchema() {
  const isPostgres = DB_DRIVER === 'postgres' || DB_DRIVER === 'postgresql';

  if (isPostgres) {
    // Tabela principal de pontuação de jogos
    await query(`
      CREATE TABLE IF NOT EXISTS pontuacaoJogo (
        id varchar(36) PRIMARY KEY,
        empresaId varchar(36) NOT NULL,
        eventoId varchar(36) NOT NULL,
        timeId varchar(36) NOT NULL,
        tipoJogo varchar(50) NOT NULL,
        numeroRonda integer NOT NULL DEFAULT 1,
        pontos integer NOT NULL DEFAULT 0,
        pontosBonus integer NOT NULL DEFAULT 0,
        pontosTotais integer NOT NULL DEFAULT 0,
        criadoEm timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        atualizadoEm timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Índices para melhor performance
    await query('CREATE INDEX IF NOT EXISTS idx_game_scores_evento ON pontuacaoJogo (empresaId, eventoId)');
    await query('CREATE INDEX IF NOT EXISTS idx_game_scores_team ON pontuacaoJogo (eventoId, timeId)');
    await query('CREATE INDEX IF NOT EXISTS idx_game_scores_game_type ON pontuacaoJogo (eventoId, tipoJogo)');
    await query('CREATE INDEX IF NOT EXISTS idx_game_scores_round ON pontuacaoJogo (eventoId, numeroRonda)');

    // Tabela de histórico de pontos (para auditoria)
    await query(`
      CREATE TABLE IF NOT EXISTS pontuacaoJogoHistorico (
        id varchar(36) PRIMARY KEY,
        empresaId varchar(36) NOT NULL,
        eventoId varchar(36) NOT NULL,
        timeId varchar(36) NOT NULL,
        tipoJogo varchar(50) NOT NULL,
        numeroRonda integer NOT NULL,
        acao varchar(100) NOT NULL,
        pontosGanhos integer NOT NULL DEFAULT 0,
        bonusGanho integer NOT NULL DEFAULT 0,
        totalAntes integer NOT NULL DEFAULT 0,
        totalDepois integer NOT NULL DEFAULT 0,
        detalhes jsonb,
        criadoEm timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query('CREATE INDEX IF NOT EXISTS idx_game_scores_history_evento ON pontuacaoJogoHistorico (empresaId, eventoId)');
    await query('CREATE INDEX IF NOT EXISTS idx_game_scores_history_team ON pontuacaoJogoHistorico (eventoId, timeId)');

    return;
  }

  // SQL Server
  await query(`
    IF OBJECT_ID('dbo.game_scores', 'U') IS NULL
    BEGIN
      CREATE TABLE pontuacaoJogo (
        id NVARCHAR(36) NOT NULL PRIMARY KEY,
        empresaId NVARCHAR(36) NOT NULL,
        eventoId NVARCHAR(36) NOT NULL,
        timeId NVARCHAR(36) NOT NULL,
        tipoJogo NVARCHAR(50) NOT NULL,
        numeroRonda INT NOT NULL DEFAULT 1,
        pontos INT NOT NULL DEFAULT 0,
        pontosBonus INT NOT NULL DEFAULT 0,
        pontosTotais INT NOT NULL DEFAULT 0,
        criadoEm DATETIME2 NOT NULL DEFAULT GETDATE(),
        atualizadoEm DATETIME2 NOT NULL DEFAULT GETDATE()
      )
    END
  `);

  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_game_scores_evento' AND object_id = OBJECT_ID('dbo.game_scores'))
      CREATE INDEX idx_game_scores_evento ON pontuacaoJogo (empresaId, eventoId)
  `);

  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_game_scores_team' AND object_id = OBJECT_ID('dbo.game_scores'))
      CREATE INDEX idx_game_scores_team ON pontuacaoJogo (eventoId, timeId)
  `);

  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_game_scores_game_type' AND object_id = OBJECT_ID('dbo.game_scores'))
      CREATE INDEX idx_game_scores_game_type ON pontuacaoJogo (eventoId, tipoJogo)
  `);

  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_game_scores_round' AND object_id = OBJECT_ID('dbo.game_scores'))
      CREATE INDEX idx_game_scores_round ON pontuacaoJogo (eventoId, numeroRonda)
  `);

  // Tabela de histórico
  await query(`
    IF OBJECT_ID('dbo.game_scores_history', 'U') IS NULL
    BEGIN
      CREATE TABLE pontuacaoJogoHistorico (
        id NVARCHAR(36) NOT NULL PRIMARY KEY,
        empresaId NVARCHAR(36) NOT NULL,
        eventoId NVARCHAR(36) NOT NULL,
        timeId NVARCHAR(36) NOT NULL,
        tipoJogo NVARCHAR(50) NOT NULL,
        numeroRonda INT NOT NULL,
        acao NVARCHAR(100) NOT NULL,
        pontosGanhos INT NOT NULL DEFAULT 0,
        bonusGanho INT NOT NULL DEFAULT 0,
        totalAntes INT NOT NULL DEFAULT 0,
        totalDepois INT NOT NULL DEFAULT 0,
        detalhes NVARCHAR(MAX),
        criadoEm DATETIME2 NOT NULL DEFAULT GETDATE()
      )
    END
  `);

  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_game_scores_history_evento' AND object_id = OBJECT_ID('dbo.game_scores_history'))
      CREATE INDEX idx_game_scores_history_evento ON pontuacaoJogoHistorico (empresaId, eventoId)
  `);

  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_game_scores_history_team' AND object_id = OBJECT_ID('dbo.game_scores_history'))
      CREATE INDEX idx_game_scores_history_team ON pontuacaoJogoHistorico (eventoId, timeId)
  `);
}

module.exports = { ensureGameScoresSchema };
