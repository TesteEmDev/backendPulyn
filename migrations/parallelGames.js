// migrations/parallelGames.js - Brincadeira paralela (corrida do checkpoint)
//
// O recreacionista inicia, durante a brincadeira principal, uma disputa paralela: os 3 primeiros
// participantes a ler o checkpoint escolhido ganham pontos extras (50, 40 e 30).
const { query, DB_DRIVER } = require('../database');

async function ensureParallelGamesSchema() {
  const isPostgres = DB_DRIVER === 'postgres' || DB_DRIVER === 'postgresql';
  if (!isPostgres) {
    console.warn('⚠️ Migração parallelGames: só implementada para PostgreSQL; crie as tabelas brincadeiraParalela e vencedorBrincadeiraParalela manualmente.');
    return;
  }

  await query(`
    CREATE TABLE IF NOT EXISTS brincadeiraParalela (
      id varchar(36) PRIMARY KEY,
      empresaId varchar(36) NOT NULL,
      eventoId varchar(36) NOT NULL,
      checkpointId varchar(36) NOT NULL,
      status varchar(20) NOT NULL DEFAULT 'active',
      premios varchar(100) NOT NULL DEFAULT '50,40,30',
      iniciadoPor varchar(36),
      iniciadoEm timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      finalizadoEm timestamptz,
      motivoFim varchar(30)
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS vencedorBrincadeiraParalela (
      id varchar(36) PRIMARY KEY,
      paralelaId varchar(36) NOT NULL,
      empresaId varchar(36) NOT NULL,
      eventoId varchar(36) NOT NULL,
      criancaId varchar(36) NOT NULL,
      timeId varchar(36),
      posicao integer NOT NULL,
      pontos integer NOT NULL,
      leituraId varchar(36),
      venceuEm timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  // "Ache o objeto": o objeto sorteado pela roleta fica gravado na disputa, e a lista de objetos é por empresa.
  await query('ALTER TABLE brincadeiraParalela ADD COLUMN IF NOT EXISTS nomeObjeto varchar(100)');
  await query(`
    CREATE TABLE IF NOT EXISTS objetoBrincadeiraParalela (
      id varchar(36) PRIMARY KEY,
      empresaId varchar(36) NOT NULL,
      nome varchar(80) NOT NULL,
      status varchar(10) NOT NULL DEFAULT 'active',
      criadoEm timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_objeto_brincadeira_paralela_nome ON objetoBrincadeiraParalela (empresaId, LOWER(nome)) WHERE status = 'active'`);
  // Uma disputa ativa por evento; cada criança ganha uma vez e cada posição tem um dono só.
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_brincadeira_paralela_ativa_evento ON brincadeiraParalela (eventoId) WHERE status = 'active'`);
  await query('CREATE UNIQUE INDEX IF NOT EXISTS uq_vencedor_paralela_crianca ON vencedorBrincadeiraParalela (paralelaId, criancaId)');
  await query('CREATE UNIQUE INDEX IF NOT EXISTS uq_vencedor_paralela_posicao ON vencedorBrincadeiraParalela (paralelaId, posicao)');
  await query('CREATE INDEX IF NOT EXISTS idx_brincadeira_paralela_evento ON brincadeiraParalela (eventoId, iniciadoEm)');
}

module.exports = { ensureParallelGamesSchema };
