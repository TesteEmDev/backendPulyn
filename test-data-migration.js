// Compara contagens do SQL Server e PostgreSQL após a migração.
// Somente leitura; não altera nenhum banco.
const sql = require('mssql');
const { connectDB, closeDB, DB_DRIVER } = require('./database');

const TABLES = [
  'empresas', 'clientes', 'eventos', 'logins', 'brincadeiras', 'times',
  'criancas', 'checkpoints', 'checkpoint_tags', 'conquistas',
  'crianca_conquistas', 'evento_brincadeiras', 'pulseiras', 'leituras',
  'pontuacoes', 'logs', 'mensagens_display', 'settings', 'staff', 'zonas',
  'caca_tesouro_partidas', 'caca_tesouro_scans', 'caca_tesouro_tempos'
];

const sourceConfig = {
  server: process.env.SOURCE_DB_SERVER || process.env.DB_SERVER || 'localhost',
  database: process.env.SOURCE_DB_NAME || process.env.DB_NAME || 'PulynDB',
  user: process.env.SOURCE_DB_USER || process.env.DB_USER || 'sa',
  password: process.env.SOURCE_DB_PASSWORD || process.env.DB_PASSWORD || '123456',
  options: { encrypt: false, trustServerCertificate: true },
  connectionTimeout: Number(process.env.DB_TIMEOUT || 30000),
  requestTimeout: Number(process.env.DB_TIMEOUT || 30000),
};

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

async function main() {
  if (DB_DRIVER !== 'postgres' && DB_DRIVER !== 'postgresql') {
    throw new Error('Defina DB_DRIVER=postgres no .env antes de validar.');
  }

  let sourcePool;
  let targetPool;
  try {
    sourcePool = await sql.connect(sourceConfig);
    targetPool = await connectDB();
    const mismatches = [];

    for (const tableName of TABLES) {
      const source = await sourcePool.request().query(
        `SELECT COUNT_BIG(*) AS total FROM [dbo].[${tableName.replace(/]/g, ']]')}]`
      );
      const target = await targetPool.query(
        `SELECT COUNT(*)::bigint AS total FROM ${quoteIdentifier(tableName)}`
      );
      const sourceCount = Number(source.recordset[0].total);
      const targetCount = Number(target.rows[0].total);
      const status = sourceCount === targetCount ? 'OK' : 'DIVERGENTE';
      console.log(`${status.padEnd(11)} ${tableName}: SQL Server=${sourceCount} PostgreSQL=${targetCount}`);
      if (sourceCount !== targetCount) mismatches.push(tableName);
    }

    if (mismatches.length) {
      throw new Error(`Contagens divergentes: ${mismatches.join(', ')}`);
    }
    console.log('✅ Todas as contagens conferem entre os bancos.');
  } finally {
    if (targetPool) await closeDB();
    if (sourcePool) await sourcePool.close();
  }
}

main().catch(error => {
  console.error('❌ Validação da migração falhou:', error.message);
  process.exitCode = 1;
});
