// migrations/eventLifecycle.js - Ciclo de vida do evento (início/fim) e contratante
const { query, DB_DRIVER } = require('../database');

async function ensureEventLifecycleSchema() {
  const isPostgres = DB_DRIVER === 'postgres' || DB_DRIVER === 'postgresql';

  if (isPostgres) {
    await query(`
      ALTER TABLE evento
        ADD COLUMN IF NOT EXISTS responsible_name varchar(150),
        ADD COLUMN IF NOT EXISTS started_at timestamptz,
        ADD COLUMN IF NOT EXISTS ended_at timestamptz,
        ADD COLUMN IF NOT EXISTS auto_start integer DEFAULT 0,
        ADD COLUMN IF NOT EXISTS auto_end integer DEFAULT 0
    `);
  } else {
    await query(`
      IF COL_LENGTH('dbo.evento', 'responsible_name') IS NULL ALTER TABLE evento ADD responsible_name varchar(150) NULL;
      IF COL_LENGTH('dbo.evento', 'started_at') IS NULL ALTER TABLE evento ADD started_at datetime2 NULL;
      IF COL_LENGTH('dbo.evento', 'ended_at') IS NULL ALTER TABLE evento ADD ended_at datetime2 NULL;
      IF COL_LENGTH('dbo.evento', 'auto_start') IS NULL ALTER TABLE evento ADD auto_start int NULL DEFAULT 0;
      IF COL_LENGTH('dbo.evento', 'auto_end') IS NULL ALTER TABLE evento ADD auto_end int NULL DEFAULT 0;
    `);
  }
  // Eventos que já existiam ficam com auto_start/auto_end = 0 de propósito: o
  // início/fim automático só vale para eventos criados (ou editados) depois
  // deste recurso, para não encerrar de surpresa eventos antigos parados em
  // "agendado".
}

module.exports = { ensureEventLifecycleSchema };
