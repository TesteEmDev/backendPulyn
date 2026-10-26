// migrations/loginPapeis.js - Uma conta com vários papéis (recepção, recreação, gestão)
//
// Cada login tinha um único perfil. A coluna perfisExtras guarda os papéis adicionais da mesma conta,
// separados por vírgula (ex.: "reception,game_master"). O perfil principal continua em perfil.
// Só admin, reception e game_master podem ser adicionais: família, telão e autoatendimento são
// contas próprias, porque são de aparelhos ou de pessoas de fora da equipe.
const { query, DB_DRIVER } = require('../database');

async function ensureLoginPapeisSchema() {
  const isPostgres = DB_DRIVER === 'postgres' || DB_DRIVER === 'postgresql';

  if (isPostgres) {
    await query('ALTER TABLE login ADD COLUMN IF NOT EXISTS perfisExtras text');
  } else {
    await query(`
      IF COL_LENGTH('login', 'perfisExtras') IS NULL
        ALTER TABLE login ADD perfisExtras NVARCHAR(200) NULL
    `);
  }
}

module.exports = { ensureLoginPapeisSchema };
