const { connectDB, closeDB } = require('./database');

async function setup() {
  const pool = await connectDB();
  
  try {
    const EVENTO_ID = '9ba04dda-8cd4-4d44-a37b-3042a0b8519a';
    const CHECKPOINT_ID = '15';
    
    console.log('Configurando sistema...');
    
    // 1. Verificar evento
    const evento = await pool.query('SELECT eventoId, nome, status FROM evento WHERE eventoId = $1', [EVENTO_ID]);
    console.log(`Evento: ${evento.rows[0].name} (${evento.rows[0].status})`);
    
    // 2. Ativar brincadeiras
    await pool.query(`
      UPDATE brincadeira SET status = 'active' 
      WHERE (eventoId = $1 OR empresaId = (SELECT empresaId FROM evento WHERE eventoId = $1))
        AND tipo IN ('treasure_hunt', 'monster_hunt')
        AND (status IS NULL OR status != 'active')
    `, [EVENTO_ID]);
    
    console.log('Brincadeiras ativadas');
    
    // 3. Criar partida Caça ao Tesouro
    const treasureExists = await pool.query(`
      SELECT partidaId FROM cacaTesourPartida 
      WHERE eventoId = $1 AND status = 'active'
    `, [EVENTO_ID]);
    
    if (treasureExists.rowCount === 0) {
      const partidaId = require('crypto').randomUUID();
      
      const brincadeira = await pool.query(`
        SELECT brincadeiraId FROM brincadeira 
        WHERE (eventoId = $1 OR empresaId = (SELECT empresaId FROM evento WHERE eventoId = $1))
          AND tipo = 'treasure_hunt' AND status = 'active'
        LIMIT 1
      `, [EVENTO_ID]);
      
      if (brincadeira.rowCount > 0) {
        await pool.query(`
          INSERT INTO cacaTesourPartida (
            partidaId, eventoId, brincadeiraId, status, numeroRonda, 
            checkpointAlvoId, checkpointsCompletadosIds, iniciadoEm, 
            rondaIniciadaEm, timeInicialId, timeVezId, vezDisponvelEm
          ) VALUES ($1, $2, $3, 'active', 1, $4, '[]', NOW(), NOW(), NULL, NULL, NOW())
        `, [partidaId, EVENTO_ID, brincadeira.rows[0].id, CHECKPOINT_ID]);
        
        console.log(`Partida Caça ao Tesouro criada: ${partidaId}`);
      }
    }
    
    // 4. Criar partida Caça ao Monstro
    const monsterExists = await pool.query(`
      SELECT id FROM monsterCacaPartida 
      WHERE eventoId = $1 AND status = 'active'
    `, [EVENTO_ID]);
    
    if (monsterExists.rowCount === 0) {
      const partidaId = require('crypto').randomUUID();
      
      const brincadeira = await pool.query(`
        SELECT brincadeiraId FROM brincadeira 
        WHERE (eventoId = $1 OR empresaId = (SELECT empresaId FROM evento WHERE eventoId = $1))
          AND tipo = 'monster_hunt' AND status = 'active'
        LIMIT 1
      `, [EVENTO_ID]);
      
      if (brincadeira.rowCount > 0) {
        const empresa = await pool.query(`
          SELECT empresaId FROM evento WHERE eventoId = $1
        `, [EVENTO_ID]);
        
        await pool.query(`
          INSERT INTO monsterCacaPartida (
            id, empresaId, eventoId, brincadeiraId, status, 
            vida, vidaMaxima, danoNormal, danoCheckpointEspecial, 
            danoAtaqueEspecial, checkpointEspecialId, 
            iniciadoEm, criadoEm
          ) VALUES ($1, $2, $3, $4, 'active', 100, 100, 10, 25, 50, $5, NOW(), NOW())
        `, [partidaId, empresa.rows[0].empresa_id, EVENTO_ID, brincadeira.rows[0].id, CHECKPOINT_ID]);
        
        console.log(`Partida Caça ao Monstro criada: ${partidaId}`);
      }
    }
    
    console.log('\n✅ Sistema configurado!');
    console.log('🔧 Teste agora a leitura da pulseira 60FBAA16 no checkpoint 15');
    
  } catch (error) {
    console.error('Erro:', error.message);
  } finally {
    await closeDB();
  }
}

setup();