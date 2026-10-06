const { connectDB, closeDB } = require('./database');

async function checkStructure() {
  try {
    const pool = await connectDB();
    
    console.log('🔍 Verificando estrutura da tabela brincadeiras...');
    
    const columns = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'brincadeiras'
      ORDER BY ordinal_position
    `);
    
    console.log('\n📋 Colunas da tabela brincadeiras:');
    columns.rows.forEach(col => {
      console.log(`   ${col.column_name} (${col.data_type}) - ${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
    });
    
    // Verificar dados existentes
    console.log('\n📊 Brincadeiras do evento:');
    const EVENTO_ID = '9ba04dda-8cd4-4d44-a37b-3042a0b8519a';
    const EMPRESA_ID = 'c9287e4b-399d-4764-8bff-2e0ce7058dcb';
    
    const brincadeiras = await pool.query(`
      SELECT brincadeiraId, nome, tipo, status, checkpoints, criadoEm
      FROM brincadeira
      WHERE eventoId = $1 OR empresaId = $2
      ORDER BY tipo, criadoEm
    `, [EVENTO_ID, EMPRESA_ID]);
    
    console.log(`Total: ${brincadeiras.rowCount}`);
    
    brincadeiras.rows.forEach((br, i) => {
      console.log(`${i+1}. ${br.name} (${br.type}) - status: ${br.status || 'null'}`);
      if (br.checkpoints) {
        console.log(`   Checkpoints: ${br.checkpoints.substring(0, 100)}...`);
      }
    });
    
    // Verificar se tem brincadeiras com status active dos tipos corretos
    console.log('\n🎯 Verificando brincadeiras ativas dos tipos corretos:');
    
    const brincadeirasAtivas = await pool.query(`
      SELECT b.brincadeiraId, b.nome, b.tipo, b.status, b.checkpoints
      FROM brincadeira b
      LEFT JOIN eventoBrincadeira eb ON eb.brincadeiraId = b.brincadeiraId
      WHERE (b.eventoId = $1 OR eb.eventoId = $1)
        AND b.status = 'active'
        AND b.tipo IN ('treasure_hunt', 'monster_hunt')
      ORDER BY b.tipo
    `, [EVENTO_ID]);
    
    console.log(`Brincadeiras ativas (treasure/monster): ${brincadeirasAtivas.rowCount}`);
    
    if (brincadeirasAtivas.rowCount === 0) {
      console.log('❌ Nenhuma brincadeira ativa dos tipos necessários!');
      
      // Verificar brincadeiras existentes com status null
      const brincadeirasComStatusNull = brincadeiras.rows.filter(br => 
        (br.type === 'treasure_hunt' || br.type === 'monster_hunt') && 
        (!br.status || br.status === 'null')
      );
      
      console.log('\n🔄 Brincadeiras com status null que podem ser ativadas:');
      brincadeirasComStatusNull.forEach((br, i) => {
        console.log(`${i+1}. ${br.name} (${br.type})`);
      });
    }
    
    // Verificar partidas ativas
    console.log('\n🏆 Partidas ativas:');
    
    const treasurePartidas = await pool.query(`
      SELECT partidaId, status, numeroRonda, checkpointAlvoId
      FROM cacaTesourPartida 
      WHERE eventoId = $1 AND status = 'active'
    `, [EVENTO_ID]);
    
    console.log(`Caça ao Tesouro ativas: ${treasurePartidas.rowCount}`);
    
    const monsterPartidas = await pool.query(`
      SELECT id, status, checkpointEspecialId
      FROM monsterCacaPartida 
      WHERE eventoId = $1 AND status = 'active'
    `, [EVENTO_ID]);
    
    console.log(`Caça ao Monstro ativas: ${monsterPartidas.rowCount}`);
    
    await closeDB();
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
    console.error(error.stack);
    try { await closeDB(); } catch {}
  }
}

checkStructure();