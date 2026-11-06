// migrations/sessaoConta.js - controle de sessão da conta
//
// tokenVersao sobe a cada troca de senha e a cada exclusão de conta. O token guarda a versão em que foi emitido
// (claim `tv`); o verifyToken recusa token com versão antiga. Assim, trocar a senha derruba as sessões abertas
// em todos os aparelhos.
const { query, DB_DRIVER } = require('../database');

async function ensureSessaoContaSchema() {
  const isPostgres = DB_DRIVER === 'postgres' || DB_DRIVER === 'postgresql';

  if (isPostgres) {
    await query('ALTER TABLE login ADD COLUMN IF NOT EXISTS tokenVersao integer NOT NULL DEFAULT 0');
    // Senha definida por outra pessoa (o master, ao cadastrar o buffet): a conta precisa trocá-la no primeiro acesso
    await query('ALTER TABLE login ADD COLUMN IF NOT EXISTS senhaTemporaria boolean NOT NULL DEFAULT false');
  } else {
    await query(`
      IF COL_LENGTH('login', 'tokenVersao') IS NULL
        ALTER TABLE login ADD tokenVersao INT NOT NULL CONSTRAINT DF_login_tokenVersao DEFAULT 0
    `);
  }
}

module.exports = { ensureSessaoContaSchema };
