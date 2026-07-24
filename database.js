// database.js
const sql = require('mssql');

// Configuração com prioridade: localhost primeiro (mais comum)
const config = {
  server: process.env.DB_SERVER || 'localhost',  // ← Tente localhost primeiro
  database: process.env.DB_NAME || 'PulynDB',
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || '123456',
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true
  },
  connectionTimeout: process.env.DB_TIMEOUT || 30000,
  requestTimeout: process.env.DB_TIMEOUT || 30000
};

let pool = null;

async function connectDB() {
  try {
    console.log('📡 Conectando ao SQL Server...');
    console.log(`🎯 Servidor: ${config.server}`);
    console.log(`💾 Banco: ${config.database}`);
    console.log(`👤 Usuário: ${config.user}`);
    console.log(`⏱️  Timeout: ${config.connectionTimeout}ms`);
    
    pool = await sql.connect(config);
    console.log('✅ Conectado ao SQL Server com sucesso!');
    console.log(`\n💡 Dica: Para testar a conexão, execute: npm run test-connection\n`);
    
    return pool;
  } catch (err) {
    console.error('❌ Erro detalhado:', err.message);
    console.error('\n🔧 SOLUÇÕES POSSÍVEIS:');
    console.error('   1. Verifique se SQL Server está rodando (services.msc)');
    console.error('   2. Tente usar um servidor diferente: DB_SERVER=localhost npm start');
    console.error('   3. Verifique TCP/IP habilitado em SQL Server Configuration Manager');
    console.error('   4. Consulte: DIAGNOSTICO_CONEXAO.md\n');
    throw err;
  }
}

async function query(sqlQuery, params = {}) {
  if (!pool) await connectDB();
  const request = pool.request();
  Object.keys(params).forEach(key => {
    request.input(key, params[key]);
  });
  const result = await request.query(sqlQuery);
  return result;
}

async function queryOne(sqlQuery, params = {}) {
  const result = await query(sqlQuery, params);
  return result.recordset[0];
}

async function allQuery(sqlQuery, params = {}) {
  const result = await query(sqlQuery, params);
  return result.recordset;
}

module.exports = { connectDB, query, queryOne, allQuery, sql };