// migrations/telao.js - Link do telão: um código por buffet para abrir o telão sem login
//
// empresa.codigoTelao: código longo e aleatório (ver utils/codigoTelao.js). Quem abre /telao/<código> recebe um
// token do perfil display só daquele buffet. O admin gera o código na primeira consulta e pode trocá-lo
// (o link antigo para de entrar). Fica vazio até o admin pedir.
const { query, DB_DRIVER } = require('../database');

async function ensureTelaoSchema() {
  const isPostgres = DB_DRIVER === 'postgres' || DB_DRIVER === 'postgresql';

  if (isPostgres) {
    await query('ALTER TABLE empresa ADD COLUMN IF NOT EXISTS codigoTelao varchar(40)');
    await query('CREATE UNIQUE INDEX IF NOT EXISTS ux_empresa_codigotelao ON empresa (codigoTelao) WHERE codigoTelao IS NOT NULL');
  } else {
    await query(`
      IF COL_LENGTH('empresa', 'codigoTelao') IS NULL
        ALTER TABLE empresa ADD codigoTelao NVARCHAR(40) NULL
    `);
  }
}

module.exports = { ensureTelaoSchema };
