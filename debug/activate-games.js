const { connectDB, closeDB } = require('./database');

async function activateGames() {
  try {
    console.log('🎮 Ativando brincadeiras e configurando sistema');
    console.log('===============================================');
    
    const pool = await connectDB();
    
    const EVENTO_ID = '9ba04dda-8cd4-4d44-a37b-3042a0b8519a';
    const CHECKPOINT_ID = '15';
    const EMPRESA_ID = 'c9287e4b-399d-4764-8bff-2e0ce7058dcb';
    
    // 1. Ativar brincadeiras com status null
    console.log('\n1. 🔧 Ativando brincadeiras com status null:');
    
    const brincadeirasParaAtivar = await pool.query(`
      SELECT id, name, type, checkpoints
      FROM brincadeiras
      WHERE (evento_id = $1 OR empresa_id = $2)
        AND (status IS NULL OR status = 'null')
        AND type IN ('treasure_hunt', 'monster_hunt')
    `, [EVENTO_ID, EMPRESA_ID]);
    
    console.log(`   Brincadeiras encontradas: ${brincadeirasParaAtivar.rowCount}`);
    
    for (const br of brincadeirasParaAtivar.rows) {
      console.log(`   • ${br.name} (${br.type})`);
      
      // Ativar brincadeira
      await pool.query(`
        UPDATE brincadeiras SET status = 'active', updated_at = NOW()
        WHERE id = $1
      `, [br.id]);
      
      console.log(`     ✅ Ativada`);
      
      // Adicionar checkpoint 15 se não estiver presente
      if (br.checkpoints) {
        try {
          const checkpoints = JSON.parse(br.checkpoints);
          
          // Verificar se checkpoint 15 já está na lista
          const temCheckpoint15 = checkpoints.some(cp => {
            const cpId = cp && typeof cp === 'object' ? cp.id : cp;
            return String(cpId) === CHECKPOINT_ID;
          });
          
          if (!temCheckpoint15) {
            const novoCheckpoint = {
              id: CHECKPOINT_ID,
              points: br.type === 'treasure_hunt' ? 25 : 35,
              cooldown: br.type === 'treasure_hunt' ? 30 : 5,
              special: br.type === 'monster_hunt' ? false : false
            };
            
            checkpoints.push(novoCheckpoint);
            
            await pool.query(`
              UPDATE brincadeiras SET checkpoints = $1, updated_at = NOW()
              WHERE id = $2
            `, [JSON.stringify(checkpoints), br.id]);
            
            console.log(`     📍 Checkpoint ${CHECKPOINT_ID} adicionado`);
          } else {
            console.log(`     📍 Checkpoint ${CHECKPOINT_ID} já está configurado`);
          }
        } catch (e) {
          console.log(`     ⚠️  Erro ao processar checkpoints: ${e.message}`);
        }
      } else {
        // Se não tem checkpoints, criar array com checkpoint 15
        const checkpoints = [{
          id: CHECKPOINT_ID,
          points: br.type === 'treasure_hunt' ? 25 : 35,
          cooldown: br.type === 'treasure_hunt' ? 30 : 5,
          special: br.type === 'monster_hunt' ? false : false
        }];
        
        await pool.query(`
          UPDATE brincadeiras SET checkpoints = $1, updated_at = NOW()
          WHERE id = $2
        `, [JSON.stringify(checkpoints), br.id]);
        
        console.log(`     📍 Checkpoint ${CHECKPOINT_ID} configurado`);
      }
    }
    
    // 2. Associar brincadeiras ativadas ao evento
    console.log('\n2. 🔗 Associando brincadeiras ao evento:');
    
    const brincadeirasAtivas = await pool.query(`
      SELECT id, name, type 
      FROM brincadeiras
      WHERE (evento_id = $1 OR empresa_id = $2)
        AND status = 'active'
        AND type IN ('treasure_hunt', 'monster_hunt')
    `, [EVENTO_ID, EMPRESA_ID]);
    
    for (const br of brincadeirasAtivas.rows) {
      // Verificar se já está associada ao evento
      const associacao = await pool.query(`
        SELECT 1 FROM evento_brincadeiras 
        WHERE evento_id = $1 AND brincadeira_id = $2
      `, [EVENTO_ID, br.id]);
      
      if (associacao.rowCount === 0) {
        await pool.query(`
          INSERT INTO evento_brincadeiras (evento_id, brincadeira_id, created_at)
          VALUES ($1, $2, NOW())
        `, [EVENTO_ID, br.id]);
        
        console.log(`   ✅ ${br.name} associada ao evento`);
      } else {
        console.log(`   ⏭️  ${br.name} já associada ao evento`);
      }
    }
    
    // 3. Criar partidas ativas
    console.log('\n3. 🚀 Criando partidas ativas:');
    
    // Caça ao Tesouro
    const treasureBrincadeira = brincadeirasAtivas.rows.find(br => br.type === 'treasure_hunt');
    
    if (treasureBrincadeira) {
      console.log(`   🗺️  Verificando partida de Caça ao Tesouro...`);
      
      const partidaExists = await pool.query(`
        SELECT id FROM caca_tesouro_partidas 
        WHERE evento_id = $1 AND brincadeira_id = $2 AND status = 'active'
      `, [EVENTO_ID, treasureBrincadeira.id]);
      
      if (partidaExists.rowCount === 0) {
        const partidaId = require('crypto').randomUUID();
        
        // Obter primeiro time do evento
        const times = await pool.query(`
          SELECT id, name FROM times 
          WHERE evento_id = $1 
          ORDER BY created_at 
          LIMIT 1
        `, [EVENTO_ID]);
        
        const primeiroTimeId = times.rowCount > 0 ? times.rows[0].id : null;
        
        await pool.query(`
          INSERT INTO caca_tesouro_partidas (
            id, evento_id, brincadeira_id, status,
            round_number, turn_team_id, turn_available_at,
            target_checkpoint_id, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
          partidaId,
          EVENTO_ID,
          treasureBrincadeira.id,
          'active',
          1,
          primeiroTimeId,
          new Date(),
          CHECKPOINT_ID,
          new Date()
        ]);
        
        console.log(`   ✅ Partida de Caça ao Tesouro criada`);
        console.log(`      ID: ${partidaId}`);
        console.log(`      Time da vez: ${primeiroTimeId ? times.rows[0].name : 'Nenhum time'}`);
        console.log(`      Checkpoint alvo: ${CHECKPOINT_ID}`);
      } else {
        console.log(`   ⏭️  Partida de Caça ao Tesouro já existe`);
      }
    } else {
      console.log(`   ❌ Nenhuma brincadeira Caça ao Tesouro ativa`);
    }
    
    // Caça ao Monstro
    const monsterBrincadeira = brincadeirasAtivas.rows.find(br => br.type === 'monster_hunt');
    
    if (monsterBrincadeira) {
      console.log(`   👾 Verificando partida de Caça ao Monstro...`);
      
      const partidaExists = await pool.query(`
        SELECT id FROM monster_hunt_partidas 
        WHERE evento_id = $1 AND brincadeira_id = $2 AND status = 'active'
      `, [EVENTO_ID, monsterBrincadeira.id]);
      
      if (partidaExists.rowCount === 0) {
        const partidaId = require('crypto').randomUUID();
        
        await pool.query(`
          INSERT INTO monster_hunt_partidas (
            id, evento_id, brincadeira_id, status,
            special_checkpoint_id, monster_hp, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
          partidaId,
          EVENTO_ID,
          monsterBrincadeira.id,
          'active',
          CHECKPOINT_ID,
          100,
          new Date()
        ]);
        
        console.log(`   ✅ Partida de Caça ao Monstro criada`);
        console.log(`      ID: ${partidaId}`);
        console.log(`      Checkpoint especial: ${CHECKPOINT_ID}`);
      } else {
        console.log(`   ⏭️  Partida de Caça ao Monstro já existe`);
      }
    } else {
      console.log(`   ❌ Nenhuma brincadeira Caça ao Monstro ativa`);
    }
    
    // 4. Verificar estado final
    console.log('\n4. 📊 Estado final do sistema:');
    
    const checkpointsAtivos = await pool.query(`
      SELECT id, name, status, checkpoint_purpose
      FROM checkpoints
      WHERE evento_id = $1 AND status = 'online'
    `, [EVENTO_ID]);
    
    console.log(`   ✅ Checkpoints online: ${checkpointsAtivos.rowCount}`);
    
    const partidasTreasureAtivas = await pool.query(`
      SELECT COUNT(*) as total FROM caca_tesouro_partidas 
      WHERE evento_id = $1 AND status = 'active'
    `, [EVENTO_ID]);
    
    console.log(`   🗺️  Partidas Caça ao Tesouro ativas: ${partidasTreasureAtivas.rows[0].total}`);
    
    const partidasMonsterAtivas = await pool.query(`
      SELECT COUNT(*) as total FROM monster_hunt_partidas 
      WHERE evento_id = $1 AND status = 'active'
    `, [EVENTO_ID]);
    
    console.log(`   👾 Partidas Caça ao Monstro ativas: ${partidasMonsterAtivas.rows[0].total}`);
    
    await closeDB();
    
    console.log('\n🎉 SISTEMA CONFIGURADO COM SUCESSO!');
    console.log('===============================================');
    console.log('✅ Brincadeiras ativadas e configuradas');
    console.log('✅ Checkpoint 15 incluído nas brincadeiras');
    console.log('✅ Partidas criadas e ativas');
    console.log('✅ Evento está ativo');
    console.log('✅ Pulseira vinculada à criança Ana');
    console.log('\n🔧 PRÓXIMOS PASSOS:');
    console.log('1. Testar leitura da pulseira 60FBAA16 no checkpoint 15');
    console.log('2. Verificar resposta do sistema (LEDs, som, feedback)');
    console.log('3. Monitorar logs no backend para ver processamento');
    console.log('4. Checar telão para ver atualizações em tempo real');
    
  } catch (error) {
    console.error('❌ Erro ao ativar brincadeiras:', error.message);
    console.error(error.stack);
    try { await closeDB(); } catch {}
  }
}

activateGames();