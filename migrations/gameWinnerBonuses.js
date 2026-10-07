const { query, DB_DRIVER } = require('../database');

// Registro do bônus de vitória pago ao fim de cada partida (Caça ao Tesouro e
// Caça ao Monstro). A chave única (partida, jogo) garante que a mesma partida
// nunca pague o bônus duas vezes, mesmo que o fim seja detectado mais de uma vez.
async function ensureGameWinnerBonusesSchema() {
  const isPostgres = DB_DRIVER === 'postgres' || DB_DRIVER === 'postgresql';

  if (isPostgres) {
    await query(`
      CREATE TABLE IF NOT EXISTS bonusVencedorJogo (
        id varchar(36) PRIMARY KEY,
        empresaId varchar(36),
        eventoId varchar(36) NOT NULL,
        partidaId varchar(36) NOT NULL,
        tipoJogo varchar(50) NOT NULL,
        timeId varchar(36) NOT NULL,
        pontosPorMembro integer NOT NULL DEFAULT 0,
        membrosPremiados integer NOT NULL DEFAULT 0,
        criadoEm timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await query('CREATE UNIQUE INDEX IF NOT EXISTS uq_game_winner_bonus_partida ON bonusVencedorJogo (partidaId, tipoJogo)');
    await query('CREATE INDEX IF NOT EXISTS idx_game_winner_bonuses_evento ON bonusVencedorJogo (eventoId)');
    return;
  }

  await query(`
    IF OBJECT_ID('dbo.game_winner_bonuses', 'U') IS NULL
    BEGIN
      CREATE TABLE game_winner_bonuses (
        id NVARCHAR(36) NOT NULL PRIMARY KEY,
        empresaId NVARCHAR(36) NULL,
        eventoId NVARCHAR(36) NOT NULL,
        partidaId NVARCHAR(36) NOT NULL,
        tipoJogo NVARCHAR(50) NOT NULL,
        timeId NVARCHAR(36) NOT NULL,
        points_per_member INT NOT NULL DEFAULT 0,
        members_awarded INT NOT NULL DEFAULT 0,
        created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME()
      )
    END
  `);
  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'uq_game_winner_bonus_partida' AND object_id = OBJECT_ID('dbo.game_winner_bonuses'))
      CREATE UNIQUE INDEX uq_game_winner_bonus_partida ON game_winner_bonuses (partidaId, tipoJogo)
  `);
}

module.exports = { ensureGameWinnerBonusesSchema };
