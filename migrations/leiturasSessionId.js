// migrations/leiturasSessionId.js - Adicionar session_id à tabela leitura
const { query } = require('../database');

async function addSessionIdToLeituras() {
  try {
    // PostgreSQL
    await query(`
      ALTER TABLE leitura
      ADD COLUMN IF NOT EXISTS session_id VARCHAR(36);

      CREATE INDEX IF NOT EXISTS idx_leitura_session_id ON leitura(session_id);
    `);

    console.log('✅ Coluna session_id adicionada à tabela leitura (PostgreSQL)');
  } catch (err) {
    // SQL Server fallback
    try {
      await query(`
        IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='leitura' AND COLUMN_NAME='session_id')
        ALTER TABLE leitura ADD session_id VARCHAR(36);

        IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='idx_leitura_session_id')
        CREATE INDEX idx_leitura_session_id ON leitura(session_id);
      `);

      console.log('✅ Coluna session_id adicionada à tabela leitura (SQL Server)');
    } catch (sqlErr) {
      console.error('❌ Erro ao adicionar session_id:', sqlErr.message);
      throw sqlErr;
    }
  }
}

module.exports = { addSessionIdToLeituras };
