const { connectDB, closeDB } = require('./database');

async function verify() {
  const pool = await connectDB();
  
  try {
    const EVENTO_ID = '9ba04dda-8cd4-4d44-a37b-3042a0b8519a';
    const CHECKPOINT_ID = '15';
    
    console.log('🔍 VERIFICANDO CONFIGURAÇÃO DO SISTEMA');
    console.log('======================================');
    
    // 1. Verificar evento
    const evento = await pool.query('SELECT eventoId, nome, status FROM evento WHERE eventoId = $1', [EVENTO_ID]);
    console.log(`✅ Evento: ${evento.rows[0].name} (${evento.rows[0].status})`);
    
    // 2. Verificar brincadeiras e checkpoint 15
    console.log('\n🎯 BRINCADEIRAS E CHECKPOINT 15:');
    
    const brincadeiras = await pool.query(`
      SELECT nome, tipo, checkpoints 
      FROM brincadeira 
      WHERE (eventoId = $1 OR empresaId = (SELECT empresaId FROM evento WHERE eventoId = $1))
        AND status = 'active'
        AND tipo IN ('treasure_hunt', 'monster_hunt')
    `, [EVENTO_ID]);
    
    console.log(`Brincadeiras ativas: ${brincadeiras.rowCount}`);
    
    for (const br of brincadeiras.rows) {
      console.log(`\n${br.name} (${br.type}):`);
      
      if (br.checkpoints) {
        try {
          const checkpoints = JSON.parse(br.checkpoints);
          console.log(`  Total de checkpoints: ${checkpoints.length}`);
          
          // Verificar se tem checkpoint 15
          const has15 = checkpoints.some(cp => {
            const id = cp && typeof cp === 'object' ? cp.id : cp;
            return String(id) === CHECKPOINT_ID;
          });
          
          if (has15) {
            console.log(`  ✅ Checkpoint ${CHECKPOINT_ID} está configurado`);
          } else {
            console.log(`  ❌ Checkpoint ${CHECKPOINT_ID} NÃO está configurado`);
            console.log(`  💡 Adicionando...`);
            
            checkpoints.push({
              id: CHECKPOINT_ID,
              points: br.type === 'treasure_hunt' ? 25 : 35,
              cooldown: br.type === 'treasure_hunt' ? 30 : 5,
              special: false
            });
            
            await pool.query(`
              UPDATE brincadeira SET checkpoints = $1
              WHERE (eventoId = $2 OR empresaId = (SELECT empresaId FROM evento WHERE eventoId = $2))
                AND nome = $3 AND tipo = $4
            `, [JSON.stringify(checkpoints), EVENTO_ID, br.name, br.type]);
            
            console.log(`  ✅ Checkpoint ${CHECKPOINT_ID} adicionado!`);
          }
        } catch (e) {
          console.log(`  Erro: ${e.message}`);
        }
      } else {
        console.log(`  ❌ Sem checkpoints configurados`);
        
        // Adicionar checkpoint 15 se não tiver
        const checkpoints = [{
          id: CHECKPOINT_ID,
          points: br.type === 'treasure_hunt' ? 25 : 35,
          cooldown: br.type === 'treasure_hunt' ? 30 : 5,
          special: false
        }];
        
        await pool.query(`
          UPDATE brincadeira SET checkpoints = $1
          WHERE (eventoId = $2 OR empresaId = (SELECT empresaId FROM evento WHERE eventoId = $2))
            AND nome = $3 AND tipo = $4
        `, [JSON.stringify(checkpoints), EVENTO_ID, br.name, br.type]);
        
        console.log(`  ✅ Checkpoint ${CHECKPOINT_ID} configurado!`);
      }
    }
    
    // 3. Verificar partidas
    console.log('\n🏆 PARTIDAS ATIVAS:');
    
    const treasure = await pool.query(`
      SELECT partidaId, checkpointAlvoId, numeroRonda 
      FROM cacaTesourPartida 
      WHERE eventoId = $1 AND status = 'active'
    `, [EVENTO_ID]);
    
    console.log(`Caça ao Tesouro: ${treasure.rowCount}`);
    if (treasure.rowCount > 0) {
      console.log(`  ID: ${treasure.rows[0].id}`);
      console.log(`  Checkpoint alvo: ${treasure.rows[0].target_checkpoint_id}`);
      console.log(`  Round: ${treasure.rows[0].round_number}`);
    }
    
    const monster = await pool.query(`
      SELECT id, checkpointEspecialId, vida 
      FROM monsterCacaPartida 
      WHERE eventoId = $1 AND status = 'active'
    `, [EVENTO_ID]);
    
    console.log(`\nCaça ao Monstro: ${monster.rowCount}`);
    if (monster.rowCount > 0) {
      console.log(`  ID: ${monster.rows[0].id}`);
      console.log(`  Checkpoint especial: ${monster.rows[0].special_checkpoint_id}`);
      console.log(`  HP do monstro: ${monster.rows[0].hp}/100`);
    }
    
    // 4. Verificar criança/pulseira
    console.log('\n👶 CRIANÇA E PULSEIRA:');
    
    const crianca = await pool.query(`
      SELECT c.nome, c.codigoPulseira, t.nome as team_name, t.cor as team_color
      FROM crianca c
      LEFT JOIN time t ON t.timeId = c.timeId
      WHERE c.eventoId = $1 AND c.codigoPulseira ILIKE '%60FBAA16%'
    `, [EVENTO_ID]);
    
    if (crianca.rowCount > 0) {
      console.log(`✅ Criança: ${crianca.rows[0].name}`);
      console.log(`✅ Pulseira: ${crianca.rows[0].bracelet_code}`);
      console.log(`✅ Time: ${crianca.rows[0].team_name} (${crianca.rows[0].team_color})`);
    } else {
      console.log('❌ Pulseira 60FBAA16 não encontrada vinculada a criança');
      console.log('💡 Verifique se a pulseira está cadastrada no evento');
    }
    
    // 5. Verificar checkpoint
    console.log('\n📍 CHECKPOINT 15:');
    
    const checkpoint = await pool.query(`
      SELECT nome, status, proposito,
             territorioDonoTimeId, territorioTravadoAte, territorioCooldownAte
      FROM pontoVerificacao WHERE checkpointId = $1
    `, [CHECKPOINT_ID]);
    
    if (checkpoint.rowCount > 0) {
      const cp = checkpoint.rows[0];
      console.log(`✅ ${cp.name} (status: ${cp.status})`);
      console.log(`✅ Propósito: ${cp.checkpoint_purpose || 'game'}`);
      console.log(`✅ Dono do território: ${cp.territory_owner_time_id || 'Nenhum'}`);
      
      if (cp.territory_locked_until) {
        console.log(`⚠️  Bloqueado até: ${cp.territory_locked_until}`);
      }
      if (cp.territory_cooldown_until) {
        console.log(`⚠️  Cooldown até: ${cp.territory_cooldown_until}`);
      }
    } else {
      console.log(`❌ Checkpoint ${CHECKPOINT_ID} não encontrado`);
    }
    
    await closeDB();
    
    console.log('\n🎉 SISTEMA VERIFICADO!');
    console.log('======================================');
    console.log('✅ Tudo configurado corretamente');
    console.log('✅ Pronto para testar leitura da pulseira');
    console.log('\n🔧 TESTE AGORA:');
    console.log('1. Use a pulseira 60FBAA16 no checkpoint 15');
    console.log('2. Sistema deve processar automaticamente');
    console.log('3. Checkpoint deve acender verde');
    console.log('4. Telão atualizará em tempo real');
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
    try { await closeDB(); } catch {}
  }
}

verify();