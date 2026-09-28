// migrations/leiturasSessionId.js - Adicionar session_id à tabela leituras
const { query } = require('../database');

async function addSessionIdToLeituras() {
  try {
    // PostgreSQL
    await query(`
      ALTER TABLE leituras 
      ADD COLUMN IF NOT EXISTS session_id VARCHAR(36);
      
      CREATE INDEX IF NOT EXISTS idx_leituras_session_id ON leituras(session_id);
    `);
    
    console.log('✅ Coluna session_id adicionada à tabela leituras (PostgreSQL)');
  } catch (err) {
    // SQL Server fallback
    try {
      await query(`
        IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='leituras' AND COLUMN_NAME='session_id')
        ALTER TABLE leituras ADD session_id VARCHAR(36);
        
        IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='idx_leituras_session_id')
        CREATE INDEX idx_leituras_session_id ON leituras(session_id);
      `);
      
      console.log('✅ Coluna session_id adicionada à tabela leituras (SQL Server)');
    } catch (sqlErr) {
      console.error('❌ Erro ao adicionar session_id:', sqlErr.message);
      throw sqlErr;
    }
  }
}

module.exports = { addSessionIdToLeituras };
