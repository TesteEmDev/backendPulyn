// migrations/braceletHistory.js - Guarda a pulseira que a criança usou
//
// Quando a pulseira é liberada (10 minutos depois do fim do evento ou ao desvincular), crianca.codigoPulseira
// volta a ficar vazio para a pulseira poder ser usada por outra criança. crianca.ultimaPulseira guarda
// qual foi a pulseira, para os relatórios continuarem mostrando a que a criança estava vinculada.
const { query, queryOne, DB_DRIVER } = require('../database');

async function ensureBraceletHistorySchema() {
  const isPostgres = DB_DRIVER === 'postgres' || DB_DRIVER === 'postgresql';

  if (isPostgres) {
    await query('ALTER TABLE crianca ADD COLUMN IF NOT EXISTS ultimaPulseira varchar(50)');
  } else {
    const column = await queryOne(`
      SELECT 1 AS found FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'crianca' AND COLUMN_NAME = 'ultimaPulseira'
    `);
    if (!column) await query('ALTER TABLE crianca ADD ultimaPulseira NVARCHAR(50) NULL');
  }

  // Quem já está com pulseira ganha o histórico agora, antes de qualquer liberação.
  await query(`
    UPDATE crianca SET ultimaPulseira = codigoPulseira
    WHERE codigoPulseira IS NOT NULL AND ultimaPulseira IS NULL
  `);
}

module.exports = { ensureBraceletHistorySchema };
