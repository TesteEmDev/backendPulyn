// Exporta metadados do SQL Server para orientar a migração PostgreSQL.
// Somente leitura: não exporta dados nem altera o banco.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const fs = require('fs');
const sql = require('mssql');

const config = {
  server: process.env.SOURCE_DB_SERVER || process.env.DB_SERVER || 'localhost',
  database: process.env.SOURCE_DB_NAME || process.env.DB_NAME || 'PulynDB',
  user: process.env.SOURCE_DB_USER || process.env.DB_USER || 'sa',
  password: process.env.SOURCE_DB_PASSWORD || process.env.DB_PASSWORD || '123456',
  options: { encrypt: false, trustServerCertificate: true },
  connectionTimeout: Number(process.env.DB_TIMEOUT || 30000),
  requestTimeout: Number(process.env.DB_TIMEOUT || 30000),
};

async function main() {
  let pool;
  try {
    pool = await sql.connect(config);
    const tables = (await pool.request().query(`
      SELECT TABLE_SCHEMA AS table_schema, TABLE_NAME AS table_name
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_SCHEMA, TABLE_NAME
    `)).recordset;
    const columns = (await pool.request().query(`
      SELECT TABLE_SCHEMA AS table_schema, TABLE_NAME AS table_name,
             ORDINAL_POSITION AS ordinal_position, COLUMN_NAME AS column_name,
             DATA_TYPE AS data_type, CHARACTER_MAXIMUM_LENGTH AS max_length,
             IS_NULLABLE AS is_nullable, COLUMN_DEFAULT AS column_default,
             COLUMNPROPERTY(OBJECT_ID(QUOTENAME(TABLE_SCHEMA) + '.' + QUOTENAME(TABLE_NAME)), COLUMN_NAME, 'IsIdentity') AS is_identity
      FROM INFORMATION_SCHEMA.COLUMNS
      ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION
    `)).recordset;
    const keys = (await pool.request().query(`
      SELECT tc.CONSTRAINT_TYPE AS constraint_type,
             tc.TABLE_SCHEMA AS table_schema, tc.TABLE_NAME AS table_name,
             tc.CONSTRAINT_NAME AS constraint_name,
             kcu.ORDINAL_POSITION AS key_ordinal,
             kcu.COLUMN_NAME AS column_name,
             rt.name AS referenced_table,
             rc.name AS referenced_column
      FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
      JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
        ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
       AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
       AND tc.TABLE_NAME = kcu.TABLE_NAME
      LEFT JOIN sys.foreign_keys fk
        ON fk.name = tc.CONSTRAINT_NAME
       AND fk.schema_id = SCHEMA_ID(tc.TABLE_SCHEMA)
      LEFT JOIN sys.foreign_key_columns fkc
        ON fkc.constraint_object_id = fk.object_id
       AND fkc.parent_column_id = COLUMNPROPERTY(
             OBJECT_ID(QUOTENAME(tc.TABLE_SCHEMA) + '.' + QUOTENAME(tc.TABLE_NAME)),
             kcu.COLUMN_NAME, 'ColumnId')
      LEFT JOIN sys.tables rt ON rt.object_id = fkc.referenced_object_id
      LEFT JOIN sys.columns rc
        ON rc.object_id = fkc.referenced_object_id
       AND rc.column_id = fkc.referenced_column_id
      WHERE tc.CONSTRAINT_TYPE IN ('PRIMARY KEY', 'UNIQUE', 'FOREIGN KEY')
      ORDER BY tc.TABLE_SCHEMA, tc.TABLE_NAME, tc.CONSTRAINT_NAME
    `)).recordset;
    const output = process.env.SCHEMA_OUTPUT || path.join(process.cwd(), 'schema-export.json');
    fs.writeFileSync(output, JSON.stringify({ generatedAt: new Date().toISOString(), tables, columns, keys }, null, 2));
    console.log(`✅ Schema exportado para: ${output}`);
  } finally {
    if (pool) await pool.close();
  }
}

main().catch(error => {
  console.error('❌ Não foi possível exportar o schema:', error.message);
  process.exitCode = 1;
});
