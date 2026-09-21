const { query, DB_DRIVER } = require('../database');

async function ensureEventZonesSchema() {
  try {
    console.log('📝 Verificando coluna zones_data na tabela eventos...');
    
    if (DB_DRIVER === 'mssql') {
      // SQL Server
      await query(`
        IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_NAME = 'eventos' AND COLUMN_NAME = 'zones_data')
        BEGIN
          ALTER TABLE eventos ADD zones_data NVARCHAR(MAX) NULL;
          PRINT 'Coluna zones_data adicionada ao SQL Server';
        END
      `);
      console.log('✅ Coluna zones_data verificada (SQL Server)');
    } else if (DB_DRIVER === 'postgres') {
      // PostgreSQL
      await query(`
        ALTER TABLE eventos 
        ADD COLUMN IF NOT EXISTS zones_data TEXT
      `);
      console.log('✅ Coluna zones_data verificada (PostgreSQL)');
    }
  } catch (err) {
    console.error('❌ Erro ao garantir schema de zonas:', err);
    throw err;
  }
}

module.exports = { ensureEventZonesSchema };
