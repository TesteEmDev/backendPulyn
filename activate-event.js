const { connectDB, closeDB } = require('./database');

async function activateEvent(eventoId = '9ba04dda-8cd4-4d44-a37b-3042a0b8519a') {
  try {
    console.log('🚀 Ativando evento...');
    console.log(`📋 Evento ID: ${eventoId}`);
    
    const pool = await connectDB();
    
    // Verificar evento atual
    const evento = await pool.query(`
      SELECT eventoId, nome, status 
      FROM evento WHERE eventoId = $1
    `, [eventoId]);
    
    if (evento.rowCount === 0) {
      console.log('❌ Evento não encontrado!');
      return;
    }
    
    const ev = evento.rows[0];
    console.log(`📅 Evento atual: ${ev.name} (status: ${ev.status})`);
    
    // Ativar evento
    const result = await pool.query(`
      UPDATE evento SET status = 'active' 
      WHERE eventoId = $1 RETURNING eventoId, nome, status
    `, [eventoId]);
    
    console.log(`✅ Evento ativado: ${result.rows[0].name} (novo status: ${result.rows[0].status})`);
    
    // Verificar brincadeiras no evento
    console.log('\n🎮 Verificando brincadeiras no evento:');
    const brincadeiras = await pool.query(`
      SELECT b.brincadeiraId, b.nome, b.tipo, b.checkpoints
      FROM brincadeira b
      WHERE b.eventoId = $1 OR EXISTS (
        SELECT 1 FROM eventoBrincadeira eb
        WHERE eb.brincadeiraId = b.brincadeiraId AND eb.eventoId = $1
      )
    `, [eventoId]);
    
    console.log(`📊 Brincadeiras no evento: ${brincadeiras.rowCount}`);
    
    if (brincadeiras.rowCount === 0) {
      console.log('⚠️  Nenhuma brincadeira associada ao evento!');
      console.log('💡 Crie brincadeiras e associe ao evento no frontend Admin > Jogos.');
    } else {
      brincadeiras.rows.forEach(br => {
        console.log(`   - ${br.name} (${br.type})`);
      });
    }
    
    await closeDB();
    console.log('\n✅ Evento ativado com sucesso!');
    console.log('🎯 Agora você pode:');
    console.log('   1. Criar brincadeiras "treasure_hunt" ou "monster_hunt"');
    console.log('   2. Associar checkpoint 15 às brincadeiras');
    console.log('   3. Iniciar a brincadeira no Game Master');
    
  } catch (error) {
    console.error('❌ Erro ao ativar evento:', error.message);
    console.error(error.stack);
    try { await closeDB(); } catch {}
  }
}

// Executar
activateEvent();