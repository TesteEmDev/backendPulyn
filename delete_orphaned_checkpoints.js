/**
 * 🗑️ Script para deletar checkpoints sem empresa_id
 * 
 * Uso: node delete_orphaned_checkpoints.js
 * 
 * O que faz:
 * 1. Conecta ao banco de dados
 * 2. Lista checkpoints sem empresa_id
 * 3. Deleta leituras associadas
 * 4. Deleta pontuações associadas
 * 5. Deleta os checkpoints
 * 6. Mostra relatório
 */

const sql = require('mssql');

const config = {
  server: process.env.DB_SERVER || 'localhost',
  database: process.env.DB_NAME || 'PulynDB',
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || '123456',
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true
  },
  connectionTimeout: 30000,
  requestTimeout: 30000
};

async function main() {
  let pool;
  
  try {
    console.log('\n🔐 Conectando ao banco de dados...\n');
    pool = await sql.connect(config);
    console.log('✅ Conectado com sucesso!\n');
    
    // 1. Listar checkpoints sem empresa_id
    console.log('📋 Listando checkpoints sem empresa_id...');
    const result = await pool.request().query(`
      SELECT id, name, evento_id, empresa_id
      FROM checkpoints
      WHERE empresa_id IS NULL
      ORDER BY name
    `);
    
    const checkpoints = result.recordset;
    const count = checkpoints.length;
    
    if (count === 0) {
      console.log('✅ Nenhum checkpoint sem empresa_id encontrado!\n');
      await pool.close();
      process.exit(0);
    }
    
    console.log(`\n⚠️  Encontrados ${count} checkpoint(s) sem empresa_id:\n`);
    checkpoints.forEach((cp, i) => {
      console.log(`   ${i + 1}. ${cp.name} (id: ${cp.id}, evento_id: ${cp.evento_id})`);
    });
    
    console.log(`\n🗑️  Iniciando deleção...\n`);
    
    // 2. Deletar leituras
    console.log('   • Deletando leituras associadas...');
    const leituras = await pool.request().query(`
      DELETE FROM leituras 
      WHERE checkpoint_id IN (
        SELECT id FROM checkpoints WHERE empresa_id IS NULL
      )
    `);
    console.log(`   ✓ ${leituras.rowsAffected[0]} leitura(s) deletada(s)`);
    
    // 3. Deletar pontuações
    console.log('   • Deletando pontuações associadas...');
    const pontuacoes = await pool.request().query(`
      DELETE FROM pontuacoes 
      WHERE checkpoint_id IN (
        SELECT id FROM checkpoints WHERE empresa_id IS NULL
      )
    `);
    console.log(`   ✓ ${pontuacoes.rowsAffected[0]} pontuação(ões) deletada(s)`);
    
    // 4. Deletar checkpoints
    console.log('   • Deletando checkpoints...');
    const checkpointDelete = await pool.request().query(`
      DELETE FROM checkpoints 
      WHERE empresa_id IS NULL
    `);
    console.log(`   ✓ ${checkpointDelete.rowsAffected[0]} checkpoint(s) deletado(s)`);
    
    // 5. Verificar
    console.log('\n✅ Deleção concluída com sucesso!\n');
    
    const verify = await pool.request().query(`
      SELECT COUNT(*) as count FROM checkpoints WHERE empresa_id IS NULL
    `);
    
    console.log(`📊 Relatório Final:`);
    console.log(`   • Checkpoints deletados: ${count}`);
    console.log(`   • Leituras removidas: ${leituras.rowsAffected[0]}`);
    console.log(`   • Pontuações removidas: ${pontuacoes.rowsAffected[0]}`);
    console.log(`   • Checkpoints sem empresa_id restantes: ${verify.recordset[0].count}`);
    console.log('\n');
    
    await pool.close();
    process.exit(0);
    
  } catch (err) {
    console.error('\n❌ Erro ao deletar checkpoints:');
    console.error(err.message);
    console.error('\n🔧 Verifique:');
    console.error('   1. Se SQL Server está rodando');
    console.error('   2. Se o banco PulynDB existe');
    console.error('   3. Se as credenciais estão corretas\n');
    
    if (pool) await pool.close();
    process.exit(1);
  }
}

main();
