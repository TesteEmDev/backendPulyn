// migrations/braceletHistory.js - Guarda a pulseira que a criança usou
//
// Quando a pulseira é liberada (10 minutos depois do fim do evento ou ao desvincular), criancas.bracelet_code
// volta a ficar vazio para a pulseira poder ser usada por outra criança. criancas.last_bracelet_code guarda
// qual foi a pulseira, para os relatórios continuarem mostrando a que a criança estava vinculada.
const { query, queryOne, DB_DRIVER } = require('../database');

async function ensureBraceletHistorySchema() {
  const isPostgres = DB_DRIVER === 'postgres' || DB_DRIVER === 'postgresql';

  if (isPostgres) {
    await query('ALTER TABLE criancas ADD COLUMN IF NOT EXISTS last_bracelet_code varchar(50)');
  } else {
    const column = await queryOne(`
      SELECT 1 AS found FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'criancas' AND COLUMN_NAME = 'last_bracelet_code'
    `);
    if (!column) await query('ALTER TABLE criancas ADD last_bracelet_code NVARCHAR(50) NULL');
  }

  // Quem já está com pulseira ganha o histórico agora, antes de qualquer liberação.
  await query(`
    UPDATE criancas SET last_bracelet_code = bracelet_code
    WHERE bracelet_code IS NOT NULL AND last_bracelet_code IS NULL
  `);
}

module.exports = { ensureBraceletHistorySchema };
