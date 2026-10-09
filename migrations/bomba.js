// migrations/bomba.js - Conquistar e Destruir (PulynBall)
//
// partidaBomba: uma partida do evento (duas equipes, placar, regras de tempo).
// roundBomba:   cada round da partida (qual equipe é TR/CT, quem leva a bomba, onde foi plantada, quem venceu).
// crianca.numeroJogador: número do jogador na equipe, definido pelo recreacionista; o portador da bomba
//   de cada round é sorteado entre os números da equipe TR.
const { query, DB_DRIVER } = require('../database');

async function ensureBombaSchema() {
  const isPostgres = DB_DRIVER === 'postgres' || DB_DRIVER === 'postgresql';
  if (!isPostgres) return;   // só o PostgreSQL/Supabase usa este jogo

  await query(`
    CREATE TABLE IF NOT EXISTS partidaBomba (
      partidaId varchar(36) PRIMARY KEY,
      eventoId varchar(36) NOT NULL REFERENCES evento(eventoId) ON DELETE CASCADE,
      empresaId varchar(36) NOT NULL,
      brincadeiraId varchar(36),
      status varchar(20) NOT NULL DEFAULT 'em_andamento',
      timeAId varchar(36),
      timeBId varchar(36),
      timeTrInicialId varchar(36),
      vitoriasA integer NOT NULL DEFAULT 0,
      vitoriasB integer NOT NULL DEFAULT 0,
      vitoriasParaVencer integer NOT NULL DEFAULT 10,
      roundsPorLado integer NOT NULL DEFAULT 5,
      duracaoRoundSeg integer NOT NULL DEFAULT 360,
      plantarMs integer NOT NULL DEFAULT 6000,
      desarmarMs integer NOT NULL DEFAULT 12500,
      bombaSeg integer NOT NULL DEFAULT 150,
      vencedorTimeId varchar(36),
      iniciadoEm timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      finalizadoEm timestamptz
    )
  `);
  await query('CREATE INDEX IF NOT EXISTS idx_partidabomba_evento ON partidaBomba (eventoId, status)');

  await query(`
    CREATE TABLE IF NOT EXISTS roundBomba (
      roundId varchar(36) PRIMARY KEY,
      partidaId varchar(36) NOT NULL REFERENCES partidaBomba(partidaId) ON DELETE CASCADE,
      numero integer NOT NULL,
      timeTrId varchar(36) NOT NULL,
      timeCtId varchar(36) NOT NULL,
      status varchar(20) NOT NULL DEFAULT 'aguardando',
      portadorCriancaId varchar(36),
      portadorNumero integer,
      iniciadoEm timestamptz,
      plantadaEm timestamptz,
      localCheckpointId varchar(36),
      plantadaPorCriancaId varchar(36),
      desarmadaPorCriancaId varchar(36),
      vencedorTimeId varchar(36),
      motivo varchar(30),
      finalizadoEm timestamptz,
      criadoEm timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await query('CREATE INDEX IF NOT EXISTS idx_roundbomba_partida ON roundBomba (partidaId, numero)');
  await query('CREATE INDEX IF NOT EXISTS idx_roundbomba_status ON roundBomba (status)');

  await query('ALTER TABLE crianca ADD COLUMN IF NOT EXISTS numeroJogador integer');
}

module.exports = { ensureBombaSchema };
