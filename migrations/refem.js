// migrations/refem.js - Resgate do Refém (PulynBall)
//
// partidaRefem: uma partida do evento (duas equipes, placar, regras de tempo e a sequência de checkpoints).
// roundRefem:   cada round (lados Rebeldes/Agentes, quem é o refém, até que checkpoint da sequência ele chegou).
// Usa crianca.numeroJogador e brincadeira.configuracaoJogo, criados por migrations/bomba.js.
const { query, DB_DRIVER } = require('../database');

async function ensureRefemSchema() {
  const isPostgres = DB_DRIVER === 'postgres' || DB_DRIVER === 'postgresql';
  if (!isPostgres) return;   // só o PostgreSQL/Supabase usa este jogo

  await query(`
    CREATE TABLE IF NOT EXISTS partidaRefem (
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
      vitoriasParaVencer integer NOT NULL DEFAULT 5,
      roundsPorLado integer NOT NULL DEFAULT 3,
      duracaoRoundSeg integer NOT NULL DEFAULT 300,
      protecaoSeg integer NOT NULL DEFAULT 10,
      sequenciaIds text,
      vencedorTimeId varchar(36),
      iniciadoEm timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      finalizadoEm timestamptz
    )
  `);
  await query('CREATE INDEX IF NOT EXISTS idx_partidarefem_evento ON partidaRefem (eventoId, status)');

  await query(`
    CREATE TABLE IF NOT EXISTS roundRefem (
      roundId varchar(36) PRIMARY KEY,
      partidaId varchar(36) NOT NULL REFERENCES partidaRefem(partidaId) ON DELETE CASCADE,
      numero integer NOT NULL,
      timeTrId varchar(36) NOT NULL,
      timeCtId varchar(36) NOT NULL,
      status varchar(20) NOT NULL DEFAULT 'aguardando',
      refemCriancaId varchar(36),
      refemNumero integer,
      posicao integer NOT NULL DEFAULT 0,
      recuperacoes integer NOT NULL DEFAULT 0,
      ultimoAvancoEm timestamptz,
      iniciadoEm timestamptz,
      vencedorTimeId varchar(36),
      motivo varchar(30),
      finalizadoEm timestamptz,
      criadoEm timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await query('CREATE INDEX IF NOT EXISTS idx_roundrefem_partida ON roundRefem (partidaId, numero)');
  await query('CREATE INDEX IF NOT EXISTS idx_roundrefem_status ON roundRefem (status)');
}

module.exports = { ensureRefemSchema };
