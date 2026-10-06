// migrations/eventLifecycle.js - Ciclo de vida do evento (início/fim) e contratante
const { query, DB_DRIVER } = require('../database');

async function ensureEventLifecycleSchema() {
  const isPostgres = DB_DRIVER === 'postgres' || DB_DRIVER === 'postgresql';

  if (isPostgres) {
    await query(`
      ALTER TABLE evento
        ADD COLUMN IF NOT EXISTS nomeResponsavel varchar(150),
        ADD COLUMN IF NOT EXISTS iniciadoEm timestamptz,
        ADD COLUMN IF NOT EXISTS finalizadoEm timestamptz,
        ADD COLUMN IF NOT EXISTS autoInicio integer DEFAULT 0,
        ADD COLUMN IF NOT EXISTS autoFim integer DEFAULT 0
    `);
  } else {
    await query(`
      IF COL_LENGTH('dbo.eventos', 'responsible_name') IS NULL ALTER TABLE evento ADD nomeResponsavel varchar(150) NULL;
      IF COL_LENGTH('dbo.eventos', 'started_at') IS NULL ALTER TABLE evento ADD iniciadoEm datetime2 NULL;
      IF COL_LENGTH('dbo.eventos', 'ended_at') IS NULL ALTER TABLE evento ADD finalizadoEm datetime2 NULL;
      IF COL_LENGTH('dbo.eventos', 'auto_start') IS NULL ALTER TABLE evento ADD autoInicio int NULL DEFAULT 0;
      IF COL_LENGTH('dbo.eventos', 'auto_end') IS NULL ALTER TABLE evento ADD autoFim int NULL DEFAULT 0;
    `);
  }
  // Eventos que já existiam ficam com auto_start/auto_end = 0 de propósito: o
  // início/fim automático só vale para eventos criados (ou editados) depois
  // deste recurso, para não encerrar de surpresa eventos antigos parados em
  // "agendado".
}

module.exports = { ensureEventLifecycleSchema };
