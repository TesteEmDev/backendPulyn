// Aplica o schema gerado no Supabase somente com confirmação explícita.
const fs = require('fs');
const path = require('path');
const { connectDB, closeDB, DB_DRIVER } = require('./database');

async function main() {
  if (DB_DRIVER !== 'postgres' && DB_DRIVER !== 'postgresql') {
    throw new Error('Defina DB_DRIVER=postgres no .env antes de aplicar o schema.');
  }
  if (process.env.APPLY_POSTGRES_SCHEMA !== 'YES') {
    throw new Error('Para confirmar, defina APPLY_POSTGRES_SCHEMA=YES no mesmo CMD.');
  }

  const schemaPath = process.env.SCHEMA_SQL_INPUT || path.join(__dirname, 'postgres-schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  const pool = await connectDB();
  await pool.query(schemaSql);
  console.log(`✅ Schema PostgreSQL aplicado com sucesso: ${schemaPath}`);
  await closeDB();
}

main().catch(async error => {
  console.error('❌ Falha ao aplicar o schema PostgreSQL:', error.message);
  try { await closeDB(); } catch {}
  process.exitCode = 1;
});
