const { connectDB, closeDB } = require('./database');

async function finalConfig() {
  try {
    console.log('🎮 CONFIGURAÇÃO FINAL DO SISTEMA PULYN');
    console.log('=========================================');
    
    const pool = await connectDB();
    
    const EVENTO_ID = '9ba04dda-8cd4-4d44-a37b-3042a0b8519a';
    const CHECKPOINT_ID = '15';
    const EMPRESA_ID = 'c9287e4b-399d-4764-8bff-2e0ce7058dcb';
    
    console.log('\n1. 📊 VERIFICANDO ESTADO ATUAL:');
    
    // Evento
    const evento = await pool.query(`
      SELECT eventoId, nome, status FROM evento WHERE eventoId = $1
    `, [EVENTO_ID]);
    
    console.log(`   Evento: ${evento.rows[0].name} (${evento.rows[0].status})`);
    
    // Times do evento
    const times = await pool.query(`
      SELECT timeId, nome, cor FROM time WHERE eventoId = $1 ORDER BY criadoEm
    `, [EVENTO_ID]);
    
    console.log(`   Times no evento: ${times.rowCount}`);
    
    // Brincadeiras
    const brincadeiras = await pool.query(`
      SELECT brincadeiraId, nome, tipo, status FROM brincadeira 
      WHERE (eventoId = $1 OR empresaId = $2) 
        AND tipo IN ('treasure_hunt', 'monster_hunt')
        AND status = 'active'
    `, [EVENTO_ID, EMPRESA_ID]);
    
    console.log(`   Brincadeiras ativas (treasure/monster): ${brincadeiras.rowCount}`);
    
    // Partidas existentes
    const partidasTreasure = await pool.query(`
      SELECT partidaId, status FROM cacaTesourPartida 
      WHERE eventoId = $1 AND status = 'active'
    `, [EVENTO_ID]);
    
    console.log(`   Partidas Caça ao Tesouro ativas: ${partidasTreasure.rowCount}`);
    
    const partidasMonster = await pool.query(`
      SELECT id, status FROM monsterCacaPartida 
      WHERE eventoId = $1 AND status = 'active'
    `, [EVENTO_ID]);
    
    console.log(`   Partidas Caça ao Monstro ativas: ${partidasMonster.rowCount}`);
    
    console.log('\n2. 🛠️  CONFIGURANDO PARTIDAS:');
    
    // Obter IDs das brincadeiras
    const treasureBrincadeira = brincadeiras.rows.find(br => br.type === 'treasure_hunt');
    const monsterBrincadeira = brincadeiras.rows.find(br => br.type === 'monster_hunt');
    
    // Criar partida de Caça ao Tesouro se não existir
    if (partidasTreasure.rowCount === 0 && treasureBrincadeira) {
      console.log('   🗺️  Criando partida de Caça ao Tesouro...');
      
      const partidaId = require('crypto').randomUUID();
      const primeiroTimeId = times.rowCount > 0 ? times.rows[0].id : null;
      const agora = new Date();
      
      await pool.query(`
        INSERT INTO cacaTesourPartida (
          partidaId, eventoId, brincadeiraId, status, numeroRonda, 
          checkpointAlvoId, checkpointsCompletadosIds, iniciadoEm, 
          rondaIniciadaEm, timeInicialId, timeVezId, vezDisponvelEm
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `, [
        partidaId,
        EVENTO_ID,
        treasureBrincadeira.id,
        'active',           // status
        1,                  // round_number
        CHECKPOINT_ID,      // target_checkpoint_id
        '[]',               // completed_checkpoint_ids
        agora,              // started_at
        agora,              // round_started_at
        primeiroTimeId,     // starting_team_id
        primeiroTimeId,     // turn_team_id
        agora               // turn_available_at
      ]);
      
      console.log(`   ✅ Partida Caça ao Tesouro criada`);
      console.log(`      ID: ${partidaId}`);
      console.log(`      Checkpoint alvo: ${CHECKPOINT_ID}`);
      console.log(`      Time da vez: ${primeiroTimeId ? times.rows[0].name : 'Nenhum time'}`);
    } else if (treasureBrincadeira) {
      console.log('   ⏭️  Partida Caça ao Tesouro já existe');
    }
    
    // Criar partida de Caça ao Monstro se não existir
    if (partidasMonster.rowCount === 0 && monsterBrincadeira) {
      console.log('   👾 Criando partida de Caça ao Monstro...');
      
      const partidaId = require('crypto').randomUUID();
      const agora = new Date();
      
      await pool.query(`
        INSERT INTO monsterCacaPartida (
          id, empresaId, eventoId, brincadeiraId, status, 
          vida, vidaMaxima, danoNormal, danoCheckpointEspecial, 
          danoAtaqueEspecial, checkpointEspecialId, 
          iniciadoEm, criadoEm
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      `, [
        partidaId,
        EMPRESA_ID,         // empresa_id
        EVENTO_ID,          // evento_id
        monsterBrincadeira.id, // brincadeira_id
        'active',           // status
        100,                // hp
        100,                // max_hp
        10,                 // normal_damage
        25,                 // special_checkpoint_damage
        50,                 // special_attack_damage
        CHECKPOINT_ID,      // special_checkpoint_id
        agora,              // started_at
        agora               // created_at
      ]);
      
      console.log(`   ✅ Partida Caça ao Monstro criada`);
      console.log(`      ID: ${partidaId}`);
      console.log(`      HP do monstro: 100/100`);
      console.log(`      Checkpoint especial: ${CHECKPOINT_ID}`);
    } else if (monsterBrincadeira) {
      console.log('   ⏭️  Partida Caça ao Monstro já existe');
    }
    
    // 3. VERIFICAR CONFIGURAÇÃO DO CHECKPOINT
    console.log('\n3. 📍 VERIFICANDO CHECKPOINT:');
    
    const checkpoint = await pool.query(`
      SELECT checkpointId, nome, status, proposito, 
             territorioDonoTimeId, territorioTravadoAte, territorioCooldownAte
      FROM pontoVerificacao WHERE checkpointId = $1
    `, [CHECKPOINT_ID]);
    
    if (checkpoint.rowCount > 0) {
      const cp = checkpoint.rows[0];
      console.log(`   Checkpoint ${cp.id}: ${cp.name}`);
      console.log(`   Status: ${cp.status}`);
      console.log(`   Propósito: ${cp.checkpoint_purpose || 'game'}`);
      console.log(`   Dono do território: ${cp.territory_owner_time_id || 'Nenhum'}`);
      console.log(`   Bloqueado até: ${cp.territory_locked_until || 'Não bloqueado'}`);
      console.log(`   Cooldown até: ${cp.territory_cooldown_until || 'Sem cooldown'}`);
    }
    
    // 4. VERIFICAR PULSEIRA E CRIANÇA
    console.log('\n4. 👶 VERIFICANDO PULSEIRA E CRIANÇA:');
    
    const crianca = await pool.query(`
      SELECT c.nome, c.codigoPulseira, t.nome as team_name, t.cor as team_color
      FROM crianca c
      LEFT JOIN time t ON t.timeId = c.timeId
      WHERE c.eventoId = $1 AND (c.codigoPulseira = '60FBAA16' OR c.codigoPulseira = '60fbaa16')
      LIMIT 1
    `, [EVENTO_ID]);
    
    if (crianca.rowCount > 0) {
      const cr = crianca.rows[0];
      console.log(`   Criança: ${cr.name}`);
      console.log(`   Pulseira: ${cr.bracelet_code}`);
      console.log(`   Time: ${cr.team_name} (${cr.team_color})`);
    } else {
      console.log('   ❌ Pulseira 60FBAA16 não encontrada vinculada a uma criança!');
      console.log('   💡 Dica: Verifique se a pulseira está cadastrada no evento.');
    }
    
    await closeDB();
    
    console.log('\n🎉 CONFIGURAÇÃO COMPLETA!');
    console.log('=========================================');
    console.log('✅ Sistema configurado e pronto para uso');
    console.log('✅ Partidas ativas criadas');
    console.log('✅ Brincadeiras ativadas');
    console.log('✅ Evento ativo');
    console.log('✅ Checkpoint online');
    console.log('\n🔧 TESTE FINAL:');
    console.log('1. Use a pulseira 60FBAA16 no checkpoint 15');
    console.log('2. Sistema deve processar a leitura');
    console.log('3. Checkpoint deve acender verde (Caça ao Tesouro)');
    console.log('4. Telão deve atualizar pontuação');
    console.log('\n📊 Para monitorar:');
    console.log('• backendpulyn.onrender.com logs');
    console.log('• Serial do ESP32 para feedback');
    console.log('• Telão para atualizações em tempo real');
    
  } catch (error) {
    console.error('❌ Erro na configuração final:', error.message);
    console.error(error.stack);
    try { await closeDB(); } catch {}
  }
}

finalConfig();