const { connectDB, closeDB } = require('./database');

async function debugLeitura(checkpointId = "15", uid = "60FBAA16") {
  try {
    console.log('🔍 Debug de leitura NFC');
    console.log(`📟 Checkpoint ID: ${checkpointId}`);
    console.log(`🏷️  UID Pulseira: ${uid}`);
    
    const pool = await connectDB();
    
    // 1. Verificar checkpoint
    console.log('\n1. 🎯 Verificando checkpoint:');
    const checkpoint = await pool.query(`
      SELECT checkpointId, nome, status, proposito, eventoId, empresaId
      FROM pontoVerificacao WHERE checkpointId = $1
    `, [checkpointId]);
    
    if (checkpoint.rowCount === 0) {
      console.log('   ❌ Checkpoint não encontrado!');
      return;
    }
    
    const cp = checkpoint.rows[0];
    console.log(`   ✅ Encontrado: ${cp.name} (${cp.status})`);
    console.log(`   📍 Evento: ${cp.evento_id}`);
    console.log(`   🏢 Empresa: ${cp.empresa_id}`);
    console.log(`   🎯 Propósito: ${cp.checkpoint_purpose || 'game'}`);
    
    if (cp.status !== 'online') {
      console.log(`   ⚠️  ATENÇÃO: Checkpoint não está online (status: ${cp.status})`);
    }
    
    // 2. Verificar pulseira/criança
    console.log('\n2. 👶 Verificando pulseira/criança:');
    const crianca = await pool.query(`
      SELECT c.criancaId, c.nome, c.timeId, c.eventoId, c.empresaId,
             t.nome as team_name, t.cor as team_color,
             e.status as evento_status
      FROM crianca c
      LEFT JOIN time t ON t.timeId = c.timeId
      LEFT JOIN evento e ON e.eventoId = c.eventoId
      WHERE c.codigoPulseira = $1 OR c.codigoPulseira = $2
    `, [uid, uid.toUpperCase()]);
    
    if (crianca.rowCount === 0) {
      console.log(`   ❌ Pulseira ${uid} não vinculada a nenhuma criança!`);
      console.log(`   💡 Dica: A pulseira precisa estar cadastrada no sistema.`);
    } else {
      const cr = crianca.rows[0];
      console.log(`   ✅ Criança: ${cr.name}`);
      console.log(`   🏃 Evento: ${cr.evento_id} (status: ${cr.evento_status})`);
      console.log(`   🎨 Time: ${cr.team_name} (${cr.team_color})`);
      
      if (cr.evento_status !== 'active') {
        console.log(`   ⚠️  ATENÇÃO: Evento não está ativo (status: ${cr.evento_status})`);
        console.log(`   💡 Dica: O evento precisa estar com status "active" para jogar.`);
      }
    }
    
    // 3. Verificar evento do checkpoint
    console.log('\n3. 📅 Verificando evento do checkpoint:');
    const evento = await pool.query(`
      SELECT eventoId, nome, status, empresaId
      FROM evento WHERE eventoId = $1
    `, [cp.evento_id]);
    
    if (evento.rowCount > 0) {
      const ev = evento.rows[0];
      console.log(`   📋 Evento: ${ev.name} (${ev.status})`);
      
      // 4. Verificar brincadeiras no evento
      console.log('\n4. 🎮 Verificando brincadeiras no evento:');
      const brincadeiras = await pool.query(`
        SELECT b.brincadeiraId, b.nome, b.tipo, b.status, b.checkpoints
        FROM brincadeira b
        WHERE b.eventoId = $1 AND b.status = 'active'
           OR EXISTS (
             SELECT 1 FROM eventoBrincadeira eb
             WHERE eb.brincadeiraId = b.brincadeiraId AND eb.eventoId = $1
           )
        ORDER BY b.tipo
      `, [cp.evento_id]);
      
      console.log(`   📊 Brincadeiras ativas: ${brincadeiras.rowCount}`);
      
      if (brincadeiras.rowCount === 0) {
        console.log(`   ❌ Nenhuma brincadeira ativa no evento!`);
        console.log(`   💡 Dica: Crie uma brincadeira e associe ao evento.`);
      } else {
        brincadeiras.rows.forEach((br, i) => {
          console.log(`   ${i+1}. ${br.name} (${br.type})`);
          
          // Verificar se checkpoint está na brincadeira
          if (br.checkpoints) {
            try {
              const checkpoints = JSON.parse(br.checkpoints);
              const cpInGame = Array.isArray(checkpoints) 
                ? checkpoints.some(cpConfig => {
                    const cpId = cpConfig && typeof cpConfig === 'object' ? cpConfig.id : cpConfig;
                    return String(cpId) === checkpointId;
                  })
                : false;
              
              console.log(`      🎯 Checkpoint ${checkpointId} na brincadeira: ${cpInGame ? '✅ SIM' : '❌ NÃO'}`);
            } catch (e) {
              console.log(`      📝 Checkpoints config: ${br.checkpoints}`);
            }
          }
        });
      }
    }
    
    // 5. Verificar partidas ativas
    console.log('\n5. 🏆 Verificando partidas ativas:');
    
    // Tesouro
    const treasureActive = await pool.query(`
      SELECT partidaId, numeroRonda, checkpointAlvoId, timeVezId
      FROM cacaTesourPartida 
      WHERE eventoId = $1 AND status = 'active'
    `, [cp.evento_id]);
    
    console.log(`   🗺️  Caça ao Tesouro ativo: ${treasureActive.rowCount}`);
    if (treasureActive.rowCount > 0) {
      const partida = treasureActive.rows[0];
      console.log(`      🔢 Round: ${partida.round_number}`);
      console.log(`      🎯 Checkpoint alvo: ${partida.target_checkpoint_id}`);
      console.log(`      🏃 Time da vez: ${partida.turn_team_id}`);
    }
    
    // Monstro
    const monsterActive = await pool.query(`
      SELECT id, checkpointEspecialId
      FROM monsterCacaPartida 
      WHERE eventoId = $1 AND status = 'active'
    `, [cp.evento_id]);
    
    console.log(`   👾 Caça ao Monstro ativo: ${monsterActive.rowCount}`);
    if (monsterActive.rowCount > 0) {
      const partida = monsterActive.rows[0];
      console.log(`      ⚡ Checkpoint especial: ${partida.special_checkpoint_id}`);
    }
    
    await closeDB();
    console.log('\n✅ Debug concluído!');
    
  } catch (error) {
    console.error('❌ Erro no debug:', error.message);
    console.error(error.stack);
    try { await closeDB(); } catch {}
  }
}

// Executar debug
debugLeitura();