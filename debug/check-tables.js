const { connectDB, closeDB, DB_DRIVER } = require('./database');

async function main() {
  try {
    console.log('🔍 Verificando estado do banco de dados...');
    console.log(`📊 Driver: ${DB_DRIVER}`);
    
    const pool = await connectDB();
    
    // Verificar tabelas essenciais
    const essentialTables = [
      'checkpoints', 'criancas', 'times', 'eventos', 
      'brincadeiras', 'leituras', 'caca_tesouro_partidas',
      'monster_hunt_partidas'
    ];
    
    console.log('\n📋 Verificando tabelas essenciais:');
    
    for (const table of essentialTables) {
      try {
        const result = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
        console.log(`   ${table}: ${result.rows[0].count} registros`);
      } catch (error) {
        console.log(`   ❌ ${table}: Tabela não existe ou erro: ${error.message}`);
      }
    }
    
    // Verificar checkpoints online
    console.log('\n🎯 Verificando checkpoints:');
    const checkpoints = await pool.query(`
      SELECT id, name, status, checkpoint_purpose 
      FROM checkpoints 
      ORDER BY status
    `);
    
    console.log(`   Total checkpoints: ${checkpoints.rowCount}`);
    checkpoints.rows.forEach(cp => {
      console.log(`   - ${cp.id} (${cp.name}): ${cp.status} [${cp.checkpoint_purpose || 'game'}]`);
    });
    
    // Verificar eventos ativos
    console.log('\n📅 Verificando eventos:');
    const eventos = await pool.query(`
      SELECT id, name, status, empresa_id 
      FROM eventos 
      ORDER BY status
    `);
    
    console.log(`   Total eventos: ${eventos.rowCount}`);
    eventos.rows.forEach(ev => {
      console.log(`   - ${ev.id} (${ev.name}): ${ev.status}`);
    });
    
    // Verificar brincadeiras
    console.log('\n🎮 Verificando brincadeiras:');
    const brincadeiras = await pool.query(`
      SELECT id, name, type, status, evento_id 
      FROM brincadeiras 
      WHERE status = 'active'
      ORDER BY type
    `);
    
    console.log(`   Brincadeiras ativas: ${brincadeiras.rowCount}`);
    brincadeiras.rows.forEach(br => {
      console.log(`   - ${br.id} (${br.name}): ${br.type} [evento: ${br.evento_id || 'n/a'}]`);
    });
    
    // Verificar se há partidas ativas
    console.log('\n🏆 Verificando partidas ativas:');
    
    // Tesouro
    const treasureActive = await pool.query(`
      SELECT COUNT(*) as count FROM caca_tesouro_partidas WHERE status = 'active'
    `);
    console.log(`   Caça ao Tesouro ativo: ${treasureActive.rows[0].count}`);
    
    // Monstro
    const monsterActive = await pool.query(`
      SELECT COUNT(*) as count FROM monster_hunt_partidas WHERE status = 'active'
    `);
    console.log(`   Caça ao Monstro ativo: ${monsterActive.rows[0].count}`);
    
    await closeDB();
    console.log('\n✅ Verificação concluída!');
    
  } catch (error) {
    console.error('❌ Erro na verificação:', error.message);
    console.error(error.stack);
    try { await closeDB(); } catch {}
    process.exitCode = 1;
  }
}

main();