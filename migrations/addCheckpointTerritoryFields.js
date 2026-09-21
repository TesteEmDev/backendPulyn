const { query, DB_DRIVER } = require('../database');

async function addCheckpointTerritoryFields() {
  const isPostgres = DB_DRIVER === 'postgres' || DB_DRIVER === 'postgresql';

  if (isPostgres) {
    // Adicionar colunas se não existirem
    try {
      await query(`
        ALTER TABLE checkpoints
        ADD COLUMN IF NOT EXISTS territory_owner_time_id varchar(36)
      `);
    } catch (err) {
      if (!err.message.includes('already exists')) {
        console.warn('⚠️ Erro ao adicionar territory_owner_time_id:', err.message);
      }
    }

    try {
      await query(`
        ALTER TABLE checkpoints
        ADD COLUMN IF NOT EXISTS last_conquered_at timestamptz
      `);
    } catch (err) {
      if (!err.message.includes('already exists')) {
        console.warn('⚠️ Erro ao adicionar last_conquered_at:', err.message);
      }
    }

    // Criar índice
    try {
      await query(`
        CREATE INDEX IF NOT EXISTS idx_checkpoints_territory_owner ON checkpoints (territorio_owner_time_id, last_conquered_at)
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
          ALTER TABLE checkpoints ADD territory_owner_time_id NVARCHAR(36)
        END
      `);
    } catch (err) {
      console.warn('⚠️ Erro ao adicionar territory_owner_time_id (SQL Server):', err.message);
    }

    try {
      await query(`
        IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='checkpoints' AND COLUMN_NAME='last_conquered_at')
        BEGIN
          ALTER TABLE checkpoints ADD last_conquered_at DATETIME2
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
          CREATE INDEX idx_checkpoints_territory_owner ON checkpoints (territory_owner_time_id, last_conquered_at)
        END
      `);
    } catch (err) {
      console.warn('⚠️ Erro ao criar índice (SQL Server):', err.message);
    }
  }
}

module.exports = { addCheckpointTerritoryFields };
