// migrations/codigoEmail.js - códigos enviados por e-mail (recuperação de senha e confirmação do e-mail)
//
// Um código por conta e por tipo. O código é guardado com hash (nunca em texto), vale por pouco tempo e aceita
// poucas tentativas. A coluna emailConfirmadoEm marca quando a conta confirmou o próprio e-mail.
const { query, DB_DRIVER } = require('../database');

async function ensureCodigoEmailSchema() {
  const isPostgres = DB_DRIVER === 'postgres' || DB_DRIVER === 'postgresql';
  if (!isPostgres) return; // só o PostgreSQL recebe estas tabelas novas

  await query(`
    CREATE TABLE IF NOT EXISTS "codigoEmail" (
      "loginId" varchar(36) NOT NULL,
      "tipo" varchar(20) NOT NULL,
      "codigoHash" varchar(255) NOT NULL,
      "expiraEm" timestamptz NOT NULL,
      "tentativas" integer NOT NULL DEFAULT 0,
      "criadoEm" timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY ("loginId", "tipo")
    )
  `);
  await query('ALTER TABLE login ADD COLUMN IF NOT EXISTS emailConfirmadoEm timestamptz');
}

module.exports = { ensureCodigoEmailSchema };
