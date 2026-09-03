const { connectDB, closeDB } = require('./database');

async function simpleActivation() {
  try {
    console.log('🎯 Configuração simples do sistema Pulyn');
    console.log('=========================================');
    
    const pool = await connectDB();
    
    const EVENTO_ID = '9ba04dda-8cd4-4d44-a37b-3042a0b8519a';
    const CHECKPOINT_ID = '15';
    const EMPRESA_ID = 'c9287e4b-399d-4764-8bff-2e0ce7058dcb';
    
    // 1. Verificar estado atual
    console.log('\n1. 📊 Estado atual:');
    
    // Checkpoint
    const checkpoint = await pool.query(`
      SELECT id, name, status FROM checkpoints WHERE id = $1
    `, [CHECKPOINT_ID]);
    
    console.log(`   Checkpoint ${CHECKPOINT_ID}: ${checkpoint.rowCount > 0 ? checkpoint.rows[0].name + ' (' + checkpoint.rows[0].status + ')' : 'não encontrado'}`);
    
    // Evento
    const evento = await pool.query(`
      SELECT id, name, status FROM eventos WHERE id = $1
    `, [EVENTO_ID]);
    
    console.log(`   Evento: ${evento.rowCount > 0 ? evento.rows[0].name + ' (' + evento.rows[0].status + ')' : 'não encontrado'}`);
    
    // Brincadeiras
    const brincadeiras = await pool.query(`
      SELECT id, name, type, status FROM brincadeiras 
      WHERE (evento_id = $1 OR empresa_id = $2) 
        AND type IN ('treasure_hunt', 'monster_hunt')
    `, [EVENTO_ID, EMPRESA_ID]);
    
    console.log(`   Brincadeiras (treasure/monster): ${brincadeiras.rowCount}`);
    
    // 2. Ativar brincadeiras
    console.log('\n2. 🔧 Ativando brincadeiras:');
    
    for (const br of brincadeiras.rows) {
      if (br.status !== 'active') {
        await pool.query(`
          UPDATE brincadeiras SET status = 'active' WHERE id = $1
        `, [br.id]);
        console.log(`   ✅ ${br.name} (${br.type}) → ativada`);
      } else {
        console.log(`   ⏭️  ${br.name} (${br.type}) → já ativa`);
      }
    }
    
    // 3. Verificar e criar partidas com estrutura correta
    console.log('\n3. 🚀 Configurando partidas:');
    
    // Verificar estrutura das tabelas primeiro
    const estruturaTreasure = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'caca_tesouro_partidas'
      ORDER BY ordinal_position
    `);
    
    console.log(`   Colunas caca_tesouro_partidas: ${estruturaTreasure.rows.map(c => c.column_name).join(', ')}`);
    
    const estruturaMonster = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'monster_hunt_partidas'
      ORDER BY ordinal_position
    `);
    
    console.log(`   Colunas monster_hunt_partidas: ${estruturaMonster.rows.map(c => c.column_name).join(', ')}`);
    
    // Verificar partidas existentes
    const partidasTreasure = await pool.query(`
      SELECT id, status FROM caca_tesouro_partidas 
      WHERE evento_id = $1 AND status = 'active'
    `, [EVENTO_ID]);
    
    console.log(`   Partidas Caça ao Tesouro ativas: ${partidasTreasure.rowCount}`);
    
    const partidasMonster = await pool.query(`
      SELECT id, status FROM monster_hunt_partidas 
      WHERE evento_id = $1 AND status = 'active'
    `, [EVENTO_ID]);
    
    console.log(`   Partidas Caça ao Monstro ativas: ${partidasMonster.rowCount}`);
    
    // Criar partida de Caça ao Tesouro se não existir
    if (partidasTreasure.rowCount === 0) {
      const treasureBrincadeira = brincadeiras.rows.find(br => br.type === 'treasure_hunt');
      
      if (treasureBrincadeira) {
        const partidaId = require('crypto').randomUUID();
        
        // Verificar colunas disponíveis
        const hasCreatedAt = estruturaTreasure.rows.some(c => c.column_name === 'created_at');
        
        let insertSql = `INSERT INTO caca_tesouro_partidas (id, evento_id, brincadeira_id, status, round_number, turn_team_id, turn_available_at, target_checkpoint_id`;
        let valuesSql = `VALUES ($1, $2, $3, $4, $5, $6, $7, $8`;
        let params = [partidaId, EVENTO_ID, treasureBrincadeira.id, 'active', 1, null, new Date(), CHECKPOINT_ID];
        let paramCount = 8;
        
        if (hasCreatedAt) {
          insertSql += ', created_at';
          valuesSql += ', $' + (++paramCount);
          params.push(new Date());
        }
        
        insertSql += ') ' + valuesSql + ')';
        
        await pool.query(insertSql, params);
        console.log(`   ✅ Partida Caça ao Tesouro criada (ID: ${partidaId})`);
      }
    }
    
    // Criar partida de Caça ao Monstro se não existir
    if (partidasMonster.rowCount === 0) {
      const monsterBrincadeira = brincadeiras.rows.find(br => br.type === 'monster_hunt');
      
      if (monsterBrincadeira) {
        const partidaId = require('crypto').randomUUID();
        
        // Verificar colunas disponíveis
        const hasCreatedAt = estruturaMonster.rows.some(c => c.column_name === 'created_at');
        
        let insertSql = `INSERT INTO monster_hunt_partidas (id, evento_id, brincadeira_id, status, special_checkpoint_id, monster_hp`;
        let valuesSql = `VALUES ($1, $2, $3, $4, $5, $6`;
        let params = [partidaId, EVENTO_ID, monsterBrincadeira.id, 'active', CHECKPOINT_ID, 100];
        let paramCount = 6;
        
        if (hasCreatedAt) {
          insertSql += ', created_at';
          valuesSql += ', $' + (++paramCount);
          params.push(new Date());
        }
        
        insertSql += ') ' + valuesSql + ')';
        
        await pool.query(insertSql, params);
        console.log(`   ✅ Partida Caça ao Monstro criada (ID: ${partidaId})`);
      }
    }
    
    // 4. Verificar configuração final
    console.log('\n4. ✅ Configuração final:');
    
    const brincadeirasAtivas = await pool.query(`
      SELECT name, type, status FROM brincadeiras 
      WHERE status = 'active' 
        AND type IN ('treasure_hunt', 'monster_hunt')
        AND (evento_id = $1 OR empresa_id = $2)
    `, [EVENTO_ID, EMPRESA_ID]);
    
    console.log(`   Brincadeiras ativas: ${brincadeirasAtivas.rowCount}`);
    brincadeirasAtivas.rows.forEach(br => {
      console.log(`      • ${br.name} (${br.type})`);
    });
    
    await closeDB();
    
    console.log('\n🎉 CONFIGURAÇÃO COMPLETA!');
    console.log('=========================================');
    console.log('✅ Todas as brincadeiras estão ativas');
    console.log('✅ Partidas foram criadas');
    console.log('✅ Sistema pronto para receber leituras');
    console.log('\n🔧 AGORA TESTE:');
    console.log('1. Use a pulseira 60FBAA16 no checkpoint 15');
    console.log('2. Verifique se o sistema processa a leitura');
    console.log('3. Observe LEDs e feedback no hardware');
    console.log('4. Monitore logs para ver o processamento');
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
    console.error(error.stack);
    try { await closeDB(); } catch {}
  }
}

simpleActivation();