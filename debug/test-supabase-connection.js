/**
 * Script para testar conexão com Supabase Local
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { Pool } = require('pg');

async function testConnection() {
  console.log('\n🧪 Testando Conexão com PostgreSQL/Supabase\n');
  console.log('📋 Configurações:');
  console.log(`   Host: ${process.env.PGHOST || 'localhost'}`);
  console.log(`   Port: ${process.env.PGPORT || 5432}`);
  console.log(`   Database: ${process.env.PGDATABASE || 'postgres'}`);
  console.log(`   User: ${process.env.PGUSER || 'postgres'}\n`);

  const config = {
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE || 'postgres',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres',
    ssl: process.env.DB_SSL !== 'false' ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 5000,
  };

  const pool = new Pool(config);

  try {
    console.log('1️⃣  Tentando conectar ao banco de dados...');
    const client = await pool.connect();
    console.log('   ✅ Conexão bem-sucedida!\n');

    console.log('2️⃣  Verificando versão do PostgreSQL...');
    const versionResult = await client.query('SELECT version();');
    console.log(`   ✅ ${versionResult.rows[0].version.split(',')[0]}\n`);

    console.log('3️⃣  Listando bancos de dados...');
    const dbResult = await client.query(
      `SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname;`
    );
    const databases = dbResult.rows.map(row => row.datname);
    console.log(`   ✅ Bancos: ${databases.join(', ')}\n`);

    console.log('4️⃣  Verificando tabelas do esquema public...');
    const tableResult = await client.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';`
    );
    const tables = tableResult.rows.map(row => row.table_name);
    
    if (tables.length === 0) {
      console.log('   ℹ️  Nenhuma tabela encontrada (banco vazio)\n');
    } else {
      console.log(`   ✅ Tabelas encontradas (${tables.length}):\n`);
    }

    console.log('5️⃣  Verificando colunas para QR Code...');
    const criancasResult = await client.query(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'criancas' AND column_name = 'qrcode'
      ) as has_qrcode;`
    );
    
    if (criancasResult.rows[0].has_qrcode) {
      console.log('   ✅ Coluna "qrcode" existe em "criancas"\n');
    } else {
      console.log('   ⚠️  Coluna "qrcode" NÃO existe em "criancas"\n');
      console.log('   💡 Execute: node check-qrcode-columns.js\n');
    }

    client.release();

    console.log('═══════════════════════════════════════════════════════');
    console.log('✅ CONEXÃO FUNCIONANDO!\n');
    console.log('🚀 Próximos passos:');
    console.log('   1. Execute: npm start');
    console.log('   2. Teste os endpoints de QR Code');
    console.log('═══════════════════════════════════════════════════════\n');

  } catch (err) {
    console.error('\n❌ ERRO DE CONEXÃO:\n');
    console.error(`   ${err.message}\n`);
    console.error('💡 Dicas:');
    console.error('   • Banco de dados está rodando?');
    console.error('   • Verifique credenciais no .env');
    console.error('   • Aguarde alguns segundos para o banco iniciar\n');
  } finally {
    await pool.end();
  }
}

testConnection();
