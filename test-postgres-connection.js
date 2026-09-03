const { connectDB, closeDB, DB_DRIVER } = require('./database');

async function main() {
  if (DB_DRIVER !== 'postgres' && DB_DRIVER !== 'postgresql') {
    throw new Error('Defina DB_DRIVER=postgres no arquivo .env antes do teste.');
  }

  const pool = await connectDB();
  const tables = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
  `);
  console.log(`📋 Tabelas existentes no schema public: ${tables.rowCount}`);
  if (tables.rowCount > 0) {
    console.log(`   ${tables.rows.map(table => table.table_name).join(', ')}`);
  }
  console.log('✅ Conexão com o PostgreSQL/Supabase validada com sucesso.');
  await closeDB();
}

main().catch(async error => {
  console.error('❌ Falha na conexão com o PostgreSQL/Supabase:', error.message);
  try { await closeDB(); } catch {}
  process.exitCode = 1;
});
