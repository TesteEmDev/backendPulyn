// migrations/parallelGames.js - Brincadeira paralela (corrida do checkpoint)
//
// O recreacionista inicia, durante a brincadeira principal, uma disputa paralela: os 3 primeiros
// participantes a ler o checkpoint escolhido ganham pontos extras (50, 40 e 30).
const { query, DB_DRIVER } = require('../database');

async function ensureParallelGamesSchema() {
  const isPostgres = DB_DRIVER === 'postgres' || DB_DRIVER === 'postgresql';
  if (!isPostgres) {
    console.warn('⚠️ Migração parallelGames: só implementada para PostgreSQL; crie as tabelas parallel_games e parallel_game_winners manualmente.');
    return;
  }

  await query(`
    CREATE TABLE IF NOT EXISTS parallel_games (
      id varchar(36) PRIMARY KEY,
      empresa_id varchar(36) NOT NULL,
      evento_id varchar(36) NOT NULL,
      checkpoint_id varchar(36) NOT NULL,
      status varchar(20) NOT NULL DEFAULT 'active',
      prizes varchar(100) NOT NULL DEFAULT '50,40,30',
      started_by varchar(36),
      started_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      finished_at timestamptz,
      finish_reason varchar(30)
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS parallel_game_winners (
      id varchar(36) PRIMARY KEY,
      parallel_id varchar(36) NOT NULL,
      empresa_id varchar(36) NOT NULL,
      evento_id varchar(36) NOT NULL,
      crianca_id varchar(36) NOT NULL,
      time_id varchar(36),
      position integer NOT NULL,
      points integer NOT NULL,
      leitura_id varchar(36),
      won_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  // Uma disputa ativa por evento; cada criança ganha uma vez e cada posição tem um dono só.
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_parallel_active_event ON parallel_games (evento_id) WHERE status = 'active'`);
  await query('CREATE UNIQUE INDEX IF NOT EXISTS uq_parallel_winner_child ON parallel_game_winners (parallel_id, crianca_id)');
  await query('CREATE UNIQUE INDEX IF NOT EXISTS uq_parallel_winner_position ON parallel_game_winners (parallel_id, position)');
  await query('CREATE INDEX IF NOT EXISTS idx_parallel_games_evento ON parallel_games (evento_id, started_at)');
}

module.exports = { ensureParallelGamesSchema };
