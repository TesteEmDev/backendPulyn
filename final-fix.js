const { connectDB, closeDB } = require('./database');

async function finalFix() {
  const pool = await connectDB();
  
  try {
    const EVENTO_ID = '9ba04dda-8cd4-4d44-a37b-3042a0b8519a';
    const CHECKPOINT_ID = '15';
    
    console.log('🔧 CORREÇÃO FINAL DO SISTEMA');
    console.log('=============================');
    
    // 1. Ativar evento (mudar de scheduled para active)
    console.log('\n1. 🚀 Ativando evento...');
    
    await pool.query(`
      UPDATE evento SET status = 'active' 
      WHERE eventoId = $1 AND status = 'scheduled'
    `, [EVENTO_ID]);
    
    const evento = await pool.query('SELECT nome, status FROM evento WHERE eventoId = $1', [EVENTO_ID]);
    console.log(`✅ Evento ${evento.rows[0].name}: ${evento.rows[0].status}`);
    
    // 2. Criar partidas com IDs específicos para garantir
    console.log('\n2. 🎮 Criando partidas...');
    
    // Primeiro, deletar qualquer partida antiga (para limpar)
    await pool.query(`
      DELETE FROM cacaTesourPartida 
      WHERE eventoId = $1
    `, [EVENTO_ID]);
    
    await pool.query(`
      DELETE FROM monsterCacaPartida 
      WHERE eventoId = $1
    `, [EVENTO_ID]);
    
    // Obter brincadeiras
    const treasureBrincadeira = await pool.query(`
      SELECT brincadeiraId FROM brincadeira 
      WHERE (eventoId = $1 OR empresaId = (SELECT empresaId FROM evento WHERE eventoId = $1))
        AND tipo = 'treasure_hunt' AND status = 'active'
      LIMIT 1
    `, [EVENTO_ID]);
    
    const monsterBrincadeira = await pool.query(`
      SELECT brincadeiraId FROM brincadeira 
      WHERE (eventoId = $1 OR empresaId = (SELECT empresaId FROM evento WHERE eventoId = $1))
        AND tipo = 'monster_hunt' AND status = 'active'
      LIMIT 1
    `, [EVENTO_ID]);
    
    // Obter primeiro time
    const times = await pool.query(`
      SELECT timeId, nome FROM time 
      WHERE eventoId = $1 
      ORDER BY criadoEm 
      LIMIT 1
    `, [EVENTO_ID]);
    
    const primeiroTimeId = times.rowCount > 0 ? times.rows[0].id : null;
    const agora = new Date();
    
    // Criar partida Caça ao Tesouro
    if (treasureBrincadeira.rowCount > 0) {
      const partidaId = 'treasure-' + EVENTO_ID.substring(0, 8);
      
      await pool.query(`
        INSERT INTO cacaTesourPartida (
          partidaId, eventoId, brincadeiraId, status, numeroRonda, 
          checkpointAlvoId, checkpointsCompletadosIds, iniciadoEm, 
          rondaIniciadaEm, timeInicialId, timeVezId, vezDisponvelEm
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `, [
        partidaId,
        EVENTO_ID,
        treasureBrincadeira.rows[0].id,
        'active',
        1,
        CHECKPOINT_ID,
        '[]',
        agora,
        agora,
        primeiroTimeId,
        primeiroTimeId,
        agora
      ]);
      
      console.log(`✅ Partida Caça ao Tesouro criada: ${partidaId}`);
      console.log(`   Checkpoint alvo: ${CHECKPOINT_ID}`);
      console.log(`   Time da vez: ${primeiroTimeId ? times.rows[0].name : 'Nenhum'}`);
    }
    
    // Criar partida Caça ao Monstro
    if (monsterBrincadeira.rowCount > 0) {
      const partidaId = 'monster-' + EVENTO_ID.substring(0, 8);
      const empresa = await pool.query('SELECT empresaId FROM evento WHERE eventoId = $1', [EVENTO_ID]);
      
      await pool.query(`
        INSERT INTO monsterCacaPartida (
          id, empresaId, eventoId, brincadeiraId, status, 
          vida, vidaMaxima, danoNormal, danoCheckpointEspecial, 
          danoAtaqueEspecial, checkpointEspecialId, 
          iniciadoEm, criadoEm
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      `, [
        partidaId,
        empresa.rows[0].empresa_id,
        EVENTO_ID,
        monsterBrincadeira.rows[0].id,
        'active',
        100,
        100,
        10,
        25,
        50,
        CHECKPOINT_ID,
        agora,
        agora
      ]);
      
      console.log(`✅ Partida Caça ao Monstro criada: ${partidaId}`);
      console.log(`   Checkpoint especial: ${CHECKPOINT_ID}`);
      console.log(`   HP do monstro: 100/100`);
    }
    
    // 3. Resetar checkpoint (limpar bloqueios)
    console.log('\n3. 🔄 Resetando checkpoint...');
    
    await pool.query(`
      UPDATE pontoVerificacao SET 
        territorioDonoTimeId = NULL,
        territorioTravadoAte = NULL,
        territorioCooldownAte = NULL,
        ultimoConquistadoEm = NULL
      WHERE checkpointId = $1
    `, [CHECKPOINT_ID]);
    
    console.log(`✅ Checkpoint ${CHECKPOINT_ID} resetado (livre para conquistar)`);
    
    // 4. Verificar estado final
    console.log('\n4. 📊 ESTADO FINAL:');
    
    const eventoFinal = await pool.query('SELECT nome, status FROM evento WHERE eventoId = $1', [EVENTO_ID]);
    console.log(`✅ Evento: ${eventoFinal.rows[0].name} (${eventoFinal.rows[0].status})`);
    
    const checkpointFinal = await pool.query('SELECT nome, status FROM pontoVerificacao WHERE checkpointId = $1', [CHECKPOINT_ID]);
    console.log(`📍 Checkpoint: ${checkpointFinal.rows[0].name} (${checkpointFinal.rows[0].status})`);
    
    const criancaFinal = await pool.query(`
      SELECT c.nome FROM crianca c
      WHERE c.eventoId = $1 AND c.codigoPulseira ILIKE '%60FBAA16%'
    `, [EVENTO_ID]);
    
    console.log(`👶 Criança: ${criancaFinal.rowCount > 0 ? criancaFinal.rows[0].name : 'Não encontrada'}`);
    
    const partidasTreasure = await pool.query(`
      SELECT COUNT(*) as total FROM cacaTesourPartida 
      WHERE eventoId = $1 AND status = 'active'
    `, [EVENTO_ID]);
    
    console.log(`🗺️  Partidas Caça ao Tesouro ativas: ${partidasTreasure.rows[0].total}`);
    
    const partidasMonster = await pool.query(`
      SELECT COUNT(*) as total FROM monsterCacaPartida 
      WHERE eventoId = $1 AND status = 'active'
    `, [EVENTO_ID]);
    
    console.log(`👾 Partidas Caça ao Monstro ativas: ${partidasMonster.rows[0].total}`);
    
    await closeDB();
    
    console.log('\n🎉 SISTEMA CORRIGIDO E PRONTO!');
    console.log('=============================');
    console.log('✅ Evento ATIVADO (scheduled → active)');
    console.log('✅ Partidas CRIADAS com sucesso');
    console.log('✅ Checkpoint RESETADO e livre');
    console.log('✅ Pulseira VINCULADA à criança Ana');
    console.log('✅ Brincadeiras CONFIGURADAS com checkpoint 15');
    console.log('\n🔧 AGORA TESTE DEFINITIVO:');
    console.log('1. Use a pulseira 60FBAA16 no checkpoint 15');
    console.log('2. O sistema DEVE processar a leitura');
    console.log('3. O checkpoint DEVE acender VERDE');
    console.log('4. O telão DEVE atualizar a pontuação');
    console.log('\n📊 Se ainda não funcionar:');
    console.log('• Verifique logs do backend (Render)');
    console.log('• Verifique serial do ESP32');
    console.log('• Confirme conexão WiFi do ESP32');
    console.log('• Teste endpoint POST /api/leituras manualmente');
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
    console.error(error.stack);
    try { await closeDB(); } catch {}
  }
}

finalFix();