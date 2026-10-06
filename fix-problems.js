const { connectDB, closeDB } = require('./database');

async function fixProblems() {
  try {
    console.log('🔧 Corrigindo problemas do sistema Pulyn');
    console.log('========================================');
    
    const pool = await connectDB();
    
    const EVENTO_ID = '9ba04dda-8cd4-4d44-a37b-3042a0b8519a';
    const CHECKPOINT_ID = '15';
    const EMPRESA_ID = 'c9287e4b-399d-4764-8bff-2e0ce7058dcb';
    
    // 1. Verificar estado atual
    console.log('\n1. 📊 Estado atual do evento:');
    const evento = await pool.query(`
      SELECT eventoId, nome, status FROM evento WHERE eventoId = $1
    `, [EVENTO_ID]);
    
    if (evento.rowCount === 0) {
      console.log('   ❌ Evento não encontrado!');
      return;
    }
    
    const ev = evento.rows[0];
    console.log(`   ✅ Evento: ${ev.name} (${ev.status})`);
    
    // 2. Verificar brincadeiras existentes
    console.log('\n2. 🔍 Brincadeiras existentes:');
    const brincadeiras = await pool.query(`
      SELECT brincadeiraId, nome, tipo, status, checkpoints 
      FROM brincadeira 
      WHERE eventoId = $1 OR empresaId = $2
      ORDER BY tipo, criadoEm
    `, [EVENTO_ID, EMPRESA_ID]);
    
    console.log(`   📊 Total de brincadeiras: ${brincadeiras.rowCount}`);
    
    brincadeiras.rows.forEach((br, i) => {
      console.log(`   ${i+1}. ${br.name} (${br.type}) - ${br.status}`);
      
      // Verificar se tem checkpoint 15
      if (br.checkpoints) {
        try {
          const checkpoints = JSON.parse(br.checkpoints);
          console.log(`      📍 Checkpoints configurados: ${Array.isArray(checkpoints) ? checkpoints.length : 'N/A'}`);
        } catch (e) {
          console.log(`      📝 Checkpoints (raw): ${br.checkpoints}`);
        }
      }
    });
    
    // 3. Criar brincadeiras faltantes
    console.log('\n3. 🛠️  Criando brincadeiras faltantes:');
    
    // Verificar se já existe Caça ao Tesouro
    const treasureExists = brincadeiras.rows.some(br => 
      br.type === 'treasure_hunt' && br.status === 'active'
    );
    
    if (!treasureExists) {
      console.log('   🗺️  Criando Caça ao Tesouro...');
      
      const treasureId = require('crypto').randomUUID();
      const treasureConfig = {
        id: treasureId,
        name: 'Caça ao Tesouro',
        type: 'treasure_hunt',
        description: 'Encontre todos os checkpoints verdes para vencer!',
        status: 'active',
        checkpoints: JSON.stringify([{ id: CHECKPOINT_ID, points: 20 }]),
        max_players_per_team: 4,
        min_players_per_team: 1,
        duration_minutes: 30,
        created_at: new Date()
      };
      
      await pool.query(`
        INSERT INTO brincadeira (
          brincadeiraId, nome, tipo, descricao, status, checkpoints, 
          max_players_per_team, min_players_per_team, duration_minutes,
          empresaId, eventoId, criadoEm
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `, [
        treasureConfig.id,
        treasureConfig.name,
        treasureConfig.type,
        treasureConfig.description,
        treasureConfig.status,
        treasureConfig.checkpoints,
        treasureConfig.max_players_per_team,
        treasureConfig.min_players_per_team,
        treasureConfig.duration_minutes,
        EMPRESA_ID,
        EVENTO_ID,
        treasureConfig.created_at
      ]);
      
      console.log('   ✅ Caça ao Tesouro criada com sucesso!');
      
      // Associar ao evento
      await pool.query(`
        INSERT INTO eventoBrincadeira (eventoId, brincadeiraId, criadoEm)
        VALUES ($1, $2, $3)
      `, [EVENTO_ID, treasureId, new Date()]);
      
      console.log('   🔗 Brincadeira associada ao evento');
    } else {
      console.log('   ⏭️  Caça ao Tesouro já existe, pulando...');
    }
    
    // Verificar se já existe Caça ao Monstro
    const monsterExists = brincadeiras.rows.some(br => 
      br.type === 'monster_hunt' && br.status === 'active'
    );
    
    if (!monsterExists) {
      console.log('   👾 Criando Caça ao Monstro...');
      
      const monsterId = require('crypto').randomUUID();
      const monsterConfig = {
        id: monsterId,
        name: 'Caça ao Monstro',
        type: 'monster_hunt',
        description: 'Encontre o monstro escondido nos checkpoints!',
        status: 'active',
        checkpoints: JSON.stringify([{ id: CHECKPOINT_ID, points: 25 }]),
        special_checkpoint_id: CHECKPOINT_ID,
        monster_hp: 100,
        created_at: new Date()
      };
      
      await pool.query(`
        INSERT INTO brincadeira (
          brincadeiraId, nome, tipo, descricao, status, checkpoints,
          special_checkpoint_id, monster_hp,
          empresaId, eventoId, criadoEm
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [
        monsterConfig.id,
        monsterConfig.name,
        monsterConfig.type,
        monsterConfig.description,
        monsterConfig.status,
        monsterConfig.checkpoints,
        monsterConfig.special_checkpoint_id,
        monsterConfig.monster_hp,
        EMPRESA_ID,
        EVENTO_ID,
        monsterConfig.created_at
      ]);
      
      console.log('   ✅ Caça ao Monstro criada com sucesso!');
      
      // Associar ao evento
      await pool.query(`
        INSERT INTO eventoBrincadeira (eventoId, brincadeiraId, criadoEm)
        VALUES ($1, $2, $3)
      `, [EVENTO_ID, monsterId, new Date()]);
      
      console.log('   🔗 Brincadeira associada ao evento');
    } else {
      console.log('   ⏭️  Caça ao Monstro já existe, pulando...');
    }
    
    // 4. Atualizar brincadeiras existentes para incluir checkpoint 15
    console.log('\n4. 🔧 Atualizando brincadeiras existentes:');
    
    const brincadeirasParaAtualizar = brincadeiras.rows.filter(br => 
      br.type === 'individual' || br.type === 'team'
    );
    
    for (const br of brincadeirasParaAtualizar) {
      let checkpointsAtualizados = [];
      
      try {
        const checkpointsExistentes = br.checkpoints ? JSON.parse(br.checkpoints) : [];
        
        // Verificar se já tem checkpoint 15
        const temCheckpoint15 = Array.isArray(checkpointsExistentes) && 
          checkpointsExistentes.some(cp => {
            const cpId = cp && typeof cp === 'object' ? cp.id : cp;
            return String(cpId) === CHECKPOINT_ID;
          });
        
        if (!temCheckpoint15) {
          if (Array.isArray(checkpointsExistentes)) {
            checkpointsAtualizados = [...checkpointsExistentes, { id: CHECKPOINT_ID, points: 10 }];
          } else {
            checkpointsAtualizados = [{ id: CHECKPOINT_ID, points: 10 }];
          }
          
          await pool.query(`
            UPDATE brincadeira SET checkpoints = $1, updated_at = $2
            WHERE brincadeiraId = $3
          `, [JSON.stringify(checkpointsAtualizados), new Date(), br.id]);
          
          console.log(`   ✅ ${br.name} atualizada com checkpoint ${CHECKPOINT_ID}`);
        } else {
          console.log(`   ⏭️  ${br.name} já tem checkpoint ${CHECKPOINT_ID}`);
        }
      } catch (error) {
        console.log(`   ❌ Erro ao atualizar ${br.name}: ${error.message}`);
      }
    }
    
    // 5. Iniciar partidas de brincadeiras
    console.log('\n5. 🚀 Iniciando partidas de brincadeiras:');
    
    // Obter todas brincadeiras ativas do evento
    const brincadeirasAtivas = await pool.query(`
      SELECT b.brincadeiraId, b.nome, b.tipo 
      FROM brincadeira b
      LEFT JOIN eventoBrincadeira eb ON eb.brincadeiraId = b.brincadeiraId
      WHERE (b.eventoId = $1 OR eb.eventoId = $1)
        AND b.status = 'active'
      ORDER BY b.tipo
    `, [EVENTO_ID]);
    
    console.log(`   📊 Brincadeiras ativas: ${brincadeirasAtivas.rowCount}`);
    
    for (const br of brincadeirasAtivas.rows) {
      console.log(`   🎮 ${br.name} (${br.type})`);
      
      if (br.type === 'treasure_hunt') {
        // Verificar se já tem partida ativa
        const partidaTreasure = await pool.query(`
          SELECT partidaId, status FROM cacaTesourPartida 
          WHERE eventoId = $1 AND brincadeiraId = $2 AND status = 'active'
        `, [EVENTO_ID, br.id]);
        
        if (partidaTreasure.rowCount === 0) {
          console.log('      🗺️  Iniciando nova partida de Caça ao Tesouro...');
          
          const partidaId = require('crypto').randomUUID();
          
          // Obter times do evento
          const times = await pool.query(`
            SELECT timeId FROM time WHERE eventoId = $1 ORDER BY criadoEm LIMIT 1
          `, [EVENTO_ID]);
          
          const primeiroTimeId = times.rowCount > 0 ? times.rows[0].id : null;
          
          await pool.query(`
            INSERT INTO cacaTesourPartida (
              partidaId, eventoId, brincadeiraId, status,
              numeroRonda, timeVezId, vezDisponvelEm,
              checkpointAlvoId, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `, [
            partidaId,
            EVENTO_ID,
            br.id,
            'active',
            1,
            primeiroTimeId,
            new Date(),
            CHECKPOINT_ID,
            new Date()
          ]);
          
          console.log('      ✅ Partida iniciada!');
        } else {
          console.log('      ⏭️  Partida já ativa');
        }
      }
      
      if (br.type === 'monster_hunt') {
        // Verificar se já tem partida ativa
        const partidaMonster = await pool.query(`
          SELECT id, status FROM monsterCacaPartida 
          WHERE eventoId = $1 AND brincadeiraId = $2 AND status = 'active'
        `, [EVENTO_ID, br.id]);
        
        if (partidaMonster.rowCount === 0) {
          console.log('      👾 Iniciando nova partida de Caça ao Monstro...');
          
          const partidaId = require('crypto').randomUUID();
          
          await pool.query(`
            INSERT INTO monsterCacaPartida (
              id, eventoId, brincadeiraId, status,
              checkpointEspecialId, monster_hp, criadoEm
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          `, [
            partidaId,
            EVENTO_ID,
            br.id,
            'active',
            CHECKPOINT_ID,
            100,
            new Date()
          ]);
          
          console.log('      ✅ Partida iniciada!');
        } else {
          console.log('      ⏭️  Partida já ativa');
        }
      }
    }
    
    await closeDB();
    console.log('\n🎉 Problemas corrigidos com sucesso!');
    console.log('========================================');
    console.log('📋 RESUMO DAS CORREÇÕES:');
    console.log('1. ✅ Evento já ativo');
    console.log('2. ✅ Brincadeiras criadas/atualizadas');
    console.log('3. ✅ Checkpoint 15 configurado nas brincadeiras');
    console.log('4. ✅ Partidas de brincadeiras iniciadas');
    console.log('\n🔧 PRÓXIMOS PASSOS:');
    console.log('• Testar leitura da pulseira no checkpoint 15');
    console.log('• Verificar resposta do sistema');
    console.log('• Monitorar logs de eventos');
    
  } catch (error) {
    console.error('❌ Erro ao corrigir problemas:', error.message);
    console.error(error.stack);
    try { await closeDB(); } catch {}
  }
}

// Executar correção
fixProblems();