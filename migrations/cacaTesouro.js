// migrations/cacaTesouro.js - tabelas do Caça ao Tesouro no PostgreSQL.
//
// Num banco novo elas vinham do postgres-schema.sql; aqui ficam garantidas (já com a nomenclatura em
// português/camelCase) para que um banco renomeado à mão não perca o cronômetro das equipes.
const { query, DB_DRIVER } = require('../database');

async function ensureCacaTesouroSchema() {
  const isPostgres = DB_DRIVER === 'postgres' || DB_DRIVER === 'postgresql';
  if (!isPostgres) return;

  await query(`
    CREATE TABLE IF NOT EXISTS cacaTesourPartida (
      partidaId varchar(36) PRIMARY KEY,
      eventoId varchar(36) NOT NULL,
      brincadeiraId varchar(36) NOT NULL,
      status varchar(20) NOT NULL,
      numeroRonda integer NOT NULL,
      checkpointAlvoId varchar(36),
      checkpointsCompletadosIds text,
      iniciadoEm timestamptz NOT NULL,
      rondaIniciadaEm timestamptz NOT NULL,
      finalizadoEm timestamptz,
      timeInicialId varchar(36),
      timeVezId varchar(36),
      vezDisponvelEm timestamptz
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS cacaTesourScan (
      scanId varchar(36) PRIMARY KEY,
      partidaId varchar(36) NOT NULL,
      eventoId varchar(36) NOT NULL,
      brincadeiraId varchar(36) NOT NULL,
      numeroRonda integer NOT NULL,
      checkpointId varchar(36) NOT NULL,
      criancaId varchar(36) NOT NULL,
      timeId varchar(36) NOT NULL,
      uid varchar(100) NOT NULL,
      leroEm timestamptz NOT NULL
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS cacaTesourTempo (
      tempoId varchar(36) PRIMARY KEY,
      partidaId varchar(36) NOT NULL,
      eventoId varchar(36) NOT NULL,
      timeId varchar(36) NOT NULL,
      iniciadoEm timestamptz,
      concluidoEm timestamptz,
      duracaoMs bigint
    )
  `);
  await query('CREATE UNIQUE INDEX IF NOT EXISTS uq_caca_tesouro_tempo_equipe ON cacaTesourTempo (partidaId, timeId)');
}

module.exports = { ensureCacaTesouroSchema };
