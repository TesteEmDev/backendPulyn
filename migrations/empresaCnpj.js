// migrations/empresaCnpj.js - CNPJ do buffet (empresa)
const { query, DB_DRIVER } = require('../database');

async function ensureEmpresaCnpjSchema() {
  const isPostgres = DB_DRIVER === 'postgres' || DB_DRIVER === 'postgresql';

  if (isPostgres) {
    await query('ALTER TABLE empresas ADD COLUMN IF NOT EXISTS cnpj varchar(14)');
  } else {
    await query(`
      IF COL_LENGTH('dbo.empresas', 'cnpj') IS NULL
      BEGIN
        ALTER TABLE empresas ADD cnpj varchar(14) NULL
      END
    `);
  }
}

module.exports = { ensureEmpresaCnpjSchema };
