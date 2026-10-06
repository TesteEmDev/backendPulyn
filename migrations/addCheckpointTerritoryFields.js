const { query, DB_DRIVER } = require('../database');

async function addCheckpointTerritoryFields() {
  const isPostgres = DB_DRIVER === 'postgres' || DB_DRIVER === 'postgresql';

  if (isPostgres) {
    // Adicionar colunas se não existirem
    try {
      await query(`
        ALTER TABLE pontoVerificacao
        ADD COLUMN IF NOT EXISTS territorioDonoTimeId varchar(36)
      `);
    } catch (err) {
      if (!err.message.includes('already exists')) {
        console.warn('⚠️ Erro ao adicionar territory_owner_time_id:', err.message);
      }
    }

    try {
      await query(`
        ALTER TABLE pontoVerificacao
        ADD COLUMN IF NOT EXISTS ultimoConquistadoEm timestamptz
      `);
    } catch (err) {
      if (!err.message.includes('already exists')) {
        console.warn('⚠️ Erro ao adicionar last_conquered_at:', err.message);
      }
    }

    // Criar índice
    try {
      await query(`
        CREATE INDEX IF NOT EXISTS idx_checkpoints_territory_owner ON pontoVerificacao (territorioDonoTimeId, ultimoConquistadoEm)
      `);
    } catch (err) {
      console.warn('⚠️ Erro ao criar índice:', err.message);
    }
  } else {
    // SQL Server
    try {
      await query(`
        IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='checkpoints' AND COLUMN_NAME='territory_owner_time_id')
        BEGIN
          ALTER TABLE pontoVerificacao ADD territorioDonoTimeId NVARCHAR(36)
        END
      `);
    } catch (err) {
      console.warn('⚠️ Erro ao adicionar territory_owner_time_id (SQL Server):', err.message);
    }

    try {
      await query(`
        IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='checkpoints' AND COLUMN_NAME='last_conquered_at')
        BEGIN
          ALTER TABLE pontoVerificacao ADD ultimoConquistadoEm DATETIME2
        END
      `);
    } catch (err) {
      console.warn('⚠️ Erro ao adicionar last_conquered_at (SQL Server):', err.message);
    }

    // SQL Server index
    try {
      await query(`
        IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_checkpoints_territory_owner')
        BEGIN
          CREATE INDEX idx_checkpoints_territory_owner ON pontoVerificacao (territorioDonoTimeId, ultimoConquistadoEm)
        END
      `);
    } catch (err) {
      console.warn('⚠️ Erro ao criar índice (SQL Server):', err.message);
    }
  }
}

module.exports = { addCheckpointTerritoryFields };
