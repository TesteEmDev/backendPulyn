// Copia dados do SQL Server para o PostgreSQL em uma transação protegida.
// Não apaga dados do destino e exige MIGRATE_DATA=YES.
const sql = require('mssql');
const { connectDB, closeDB, DB_DRIVER } = require('./database');

const TABLE_ORDER = [
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

function pad(value, size = 2) {
  return String(value).padStart(size, '0');
}

function targetValue(value, targetType) {
  if (value === null || value === undefined) return null;
  const normalizedType = String(targetType || '').toLowerCase();
  if (typeof value === 'boolean' && ['integer', 'smallint', 'bigint', 'numeric'].includes(normalizedType)) {
    return value ? 1 : 0;
  }
  if (normalizedType === 'time' || normalizedType.startsWith('time ')) {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
    }
    const match = String(value).match(/(?:T|\s)(\d{2}:\d{2}:\d{2}(?:\.\d+)?)/);
    return match ? match[1] : value;
  }
  if (normalizedType === 'date' && value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  return value;
}

async function getTargetColumns(client, tableName) {
  const result = await client.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
    ORDER BY ordinal_position
  `, [tableName]);
  return result.rows;
}

async function ensureTargetIsEmpty(client) {
  const result = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  const nonEmpty = [];
  for (const table of result.rows) {
    const count = await client.query(`SELECT COUNT(*)::bigint AS total FROM ${quoteIdentifier(table.table_name)}`);
    if (Number(count.rows[0].total) > 0) nonEmpty.push(table.table_name);
  }
  if (nonEmpty.length && process.env.MIGRATE_ALLOW_NONEMPTY !== 'YES') {
    throw new Error(`Destino não está vazio: ${nonEmpty.join(', ')}. Use MIGRATE_ALLOW_NONEMPTY=YES somente após revisar.`);
  }
}

async function insertRows(client, tableName, rows, targetColumns) {
  const sourceColumns = targetColumns.filter(column => (
    rows.length > 0 && Object.prototype.hasOwnProperty.call(rows[0], column.column_name)
  ));
  if (!sourceColumns.length || !rows.length) return 0;

  const batchSize = 100;
  let inserted = 0;
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const batch = rows.slice(offset, offset + batchSize);
    const values = [];
    const valueGroups = batch.map(row => {
      const placeholders = sourceColumns.map(column => {
        values.push(targetValue(row[column.column_name], column.data_type));
        return `$${values.length}`;
      });
      return `(${placeholders.join(', ')})`;
    });
    const columnsSql = sourceColumns.map(column => quoteIdentifier(column.column_name)).join(', ');
    await client.query(
      `INSERT INTO ${quoteIdentifier(tableName)} (${columnsSql}) VALUES ${valueGroups.join(', ')}`,
      values
    );
    inserted += batch.length;
  }
  return inserted;
}

async function resetIdentity(client, tableName, columnName) {
  const sequence = await client.query('SELECT pg_get_serial_sequence($1, $2) AS sequence', [tableName, columnName]);
  const sequenceName = sequence.rows[0]?.sequence;
  if (!sequenceName) return;
  const table = quoteIdentifier(tableName);
  const column = quoteIdentifier(columnName);
  await client.query(
    `SELECT setval($1, COALESCE(MAX(${column}), 1), MAX(${column}) IS NOT NULL) FROM ${table}`,
    [sequenceName]
  );
}

async function main() {
  if (DB_DRIVER !== 'postgres' && DB_DRIVER !== 'postgresql') {
    throw new Error('Defina DB_DRIVER=postgres no .env antes de migrar os dados.');
  }
  if (process.env.MIGRATE_DATA !== 'YES') {
    throw new Error('Para confirmar a migração, defina MIGRATE_DATA=YES no mesmo CMD.');
  }

  let sourcePool;
  let targetPool;
  let targetClient;
  try {
    sourcePool = await sql.connect(sourceConfig);
    targetPool = await connectDB();
    targetClient = await targetPool.connect();
    await ensureTargetIsEmpty(targetClient);
    await targetClient.query('BEGIN');

    for (const tableName of TABLE_ORDER) {
      const sourceResult = await sourcePool.request().query(
        `SELECT * FROM [dbo].[${tableName.replace(/]/g, ']]')}]`
      );
      const targetColumns = await getTargetColumns(targetClient, tableName);
      const inserted = await insertRows(targetClient, tableName, sourceResult.recordset, targetColumns);
      console.log(`✅ ${tableName}: ${inserted} registro(s)`);
      for (const column of targetColumns) {
        if (column.data_type === 'integer' && column.column_name === 'id') {
          await resetIdentity(targetClient, tableName, column.column_name);
        }
      }
    }

    await targetClient.query('COMMIT');
    console.log('✅ Migração de dados concluída e confirmada no PostgreSQL.');
  } catch (error) {
    if (targetClient) {
      try { await targetClient.query('ROLLBACK'); } catch {}
    }
    console.error('❌ Migração revertida:', error.message);
    process.exitCode = 1;
  } finally {
    if (targetClient) targetClient.release();
    if (targetPool) await closeDB();
    if (sourcePool) await sourcePool.close();
  }
}

main().catch(error => {
  console.error('❌ Falha ao iniciar a migração:', error.message);
  process.exitCode = 1;
});
