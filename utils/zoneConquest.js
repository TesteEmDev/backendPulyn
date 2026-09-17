const { query, queryOne, transaction } = require('../database');
const { v4: uuidv4 } = require('uuid');

const ZONE_CONQUEST_GAME_TYPE = 'zone';

async function startZoneConquestGame(eventoId, brincadeiraId) {
  console.log('🎬 [ZONE_CONQUEST] Iniciando jogo para evento:', eventoId, 'brincadeira:', brincadeiraId);
  
  const resultado = await transaction(async (tx) => {
    console.log('📍 [ZONE_CONQUEST] Inside transaction');
    
    // Buscar evento e jogo
    const evento = await tx.queryOne('SELECT * FROM eventos WHERE id = @id', { id: eventoId });
    console.log('📋 [ZONE_CONQUEST] Evento encontrado:', !!evento);
    if (!evento) throw new Error('Evento não encontrado');

    const game = await tx.queryOne(
      'SELECT * FROM brincadeiras WHERE id = @id',
      { id: brincadeiraId }
    );
    console.log('📋 [ZONE_CONQUEST] Game encontrado:', !!game);
    if (!game) throw new Error('Jogo não encontrado');

    const now = new Date();
    const partidaId = uuidv4();
    console.log('🆔 [ZONE_CONQUEST] Nova partida ID:', partidaId);

    // 1. Finalizar qualquer partida ativa anterior
    console.log('🔄 [ZONE_CONQUEST] Finalizando partidas antigas...');
    await tx.query(`
      UPDATE zonas_equipes_teams_states
      SET status = 'finished', version = version + 1
      WHERE LOWER(evento_id) = LOWER(@eventoId) AND status = 'active'`, { eventoId });
    
    await tx.query(`
      UPDATE zonas_equipes_partidas
      SET status = 'finished', finished_at = GETDATE(), version = version + 1
      WHERE LOWER(evento_id) = LOWER(@eventoId) AND status = 'active'`, { eventoId });

    // 2. Criar nova partida
    console.log('📝 [ZONE_CONQUEST] Criando nova partida...');
    await tx.query(`
      INSERT INTO zonas_equipes_partidas
        (id, empresa_id, evento_id, brincadeira_id, status, version, started_at)
      VALUES (@id, @empresaId, @eventoId, @brincadeiraId, 'active', 0, @startedAt)`, {
      id: partidaId,
      empresaId: evento.empresa_id,
      eventoId,
      brincadeiraId,
      startedAt: now,
    });
    console.log('✅ [ZONE_CONQUEST] Partida criada com sucesso');

    // 3. Buscar todas as equipes participantes
    console.log('👥 [ZONE_CONQUEST] Buscando equipes...');
    const participatingTeams = await tx.query(`
      SELECT DISTINCT t.id, t.name
      FROM times t
      WHERE t.evento_id = @eventoId
      ORDER BY t.name`, { eventoId });

    // 4. Criar state para cada equipe
    console.log('👥 [ZONE_CONQUEST] Criando team states para', participatingTeams.length, 'equipes...');
    for (const team of participatingTeams) {
      await tx.query(`
        INSERT INTO zonas_equipes_teams_states
          (id, partida_id, empresa_id, evento_id, time_id, status, version)
        VALUES (@id, @partidaId, @empresaId, @eventoId, @timeId, 'active', 0)`, {
        id: uuidv4(),
        partidaId,
        empresaId: evento.empresa_id,
        eventoId,
        timeId: team.id,
      });
    }
    console.log('✅ [ZONE_CONQUEST] Team states criados');

    console.log('🎉 [ZONE_CONQUEST] Jogo iniciado com sucesso! Partida:', partidaId);
    
    return {
      id: partidaId,
      eventoId,
      brincadeiraId,
      gameType: ZONE_CONQUEST_GAME_TYPE,
      startedAt: now.toISOString(),
      status: 'active',
      teams: participatingTeams.map(t => ({
        id: t.id,
        name: t.name,
        status: 'active',
      })),
    };
  });

  console.log('🎬 [ZONE_CONQUEST] Resultado retornado:', resultado.id);
  return resultado;
}

async function stopZoneConquestGame(eventoId) {
  console.log('🛑 Parando Zone Conquest Game para evento:', eventoId);
  
  try {
    // 1. Calcular vencedor e salvar resultados
    await calculateAndSaveZoneConquestResults(eventoId);
  } catch (err) {
    console.warn('⚠️ Erro ao calcular resultados de Zone Conquest:', err.message, err);
  }

  // 2. Finalizar team states
  console.log('📝 Finalizando team states...');
  await query(`
    UPDATE zonas_equipes_teams_states
    SET status = 'finished', version = version + 1
    WHERE LOWER(evento_id) = LOWER(@eventoId) AND status = 'active'`, { eventoId });

  // 3. Finalizar partida
  console.log('📝 Finalizando partida...');
  await query(`
    UPDATE zonas_equipes_partidas
    SET status = 'finished', finished_at = GETDATE(), version = version + 1
    WHERE LOWER(evento_id) = LOWER(@eventoId) AND status = 'active'`, { eventoId });
  
  console.log('✅ Zone Conquest Game parado com sucesso');
}

async function calculateAndSaveZoneConquestResults(eventoId) {
  console.log('🔍 Iniciando cálculo de resultados Zone Conquest para evento:', eventoId);
  
  // 1. Buscar partida ativa
  const partida = await queryOne(`
    SELECT id, empresa_id FROM zonas_equipes_partidas
    WHERE LOWER(evento_id) = LOWER(@eventoId) AND status = 'active'`, { eventoId });

  if (!partida) {
    console.log('ℹ️ Nenhuma partida ativa encontrada');
    return;
  }

  console.log('✅ Partida encontrada:', partida.id);

  // 2. Contar leituras por checkpoint e equipe - versão SIMPLES
  const readings = await query(`
    SELECT checkpoint_id, time_id, COUNT(*) as total_readings
    FROM zonas_equipes_scans
    WHERE partida_id = @partidaId
    GROUP BY checkpoint_id, time_id
    ORDER BY checkpoint_id, total_readings DESC`, { partidaId: partida.id });

  console.log('📊 Leituras encontradas:', readings.length);

  if (readings.length === 0) {
    console.log('ℹ️ Nenhuma leitura registrada nesta partida');
    return;
  }

  // 3. Determinar dominância por checkpoint (equipe com mais leituras)
  const checkpointDominance = {};
  for (const reading of readings) {
    if (!checkpointDominance[reading.checkpoint_id]) {
      checkpointDominance[reading.checkpoint_id] = reading;
    }
  }

  // 4. Contar checkpoints por equipe
  const teamCheckpoints = {};
  for (const checkpoint_id in checkpointDominance) {
    const ownership = checkpointDominance[checkpoint_id];
    if (!teamCheckpoints[ownership.time_id]) {
      teamCheckpoints[ownership.time_id] = 0;
    }
    teamCheckpoints[ownership.time_id]++;
  }

  console.log('🏆 Contagem de checkpoints por equipe:', teamCheckpoints);

  // 5. Determinar vencedor
  let winningTeamId = null;
  let maxCheckpoints = -1;
  for (const teamId in teamCheckpoints) {
    if (teamCheckpoints[teamId] > maxCheckpoints) {
      maxCheckpoints = teamCheckpoints[teamId];
      winningTeamId = teamId;
    }
  }

  if (!winningTeamId) {
    console.log('ℹ️ Nenhum vencedor determinado');
    return;
  }

  const now = new Date();
  console.log(`✅ Vencedor: ${winningTeamId} com ${maxCheckpoints} checkpoints`);

  // 6. Atualizar team states com vitória/derrota
  const allTeams = await query(`
    SELECT DISTINCT time_id FROM zonas_equipes_teams_states
    WHERE partida_id = @partidaId`, { partidaId: partida.id });

  for (const team of allTeams) {
    const isWinner = team.time_id === winningTeamId;
    console.log(`📝 Atualizando equipe ${team.time_id} - Vencedor: ${isWinner}`);
    
    await query(`
      UPDATE zonas_equipes_teams_states
      SET ${isWinner ? 'victory_at' : 'defeated_at'} = @now, version = version + 1
      WHERE partida_id = @partidaId AND time_id = @timeId`, {
      partidaId: partida.id,
      timeId: team.time_id,
      now,
    });
  }

  // 7. Atualizar checkpoints com owner
  for (const checkpoint_id in checkpointDominance) {
    const ownership = checkpointDominance[checkpoint_id];
    console.log(`🗺️ Atualizando checkpoint ${checkpoint_id} - Owner: ${ownership.time_id}`);
    
    await query(`
      UPDATE checkpoints
      SET territory_owner_time_id = @timeId, last_conquered_at = @now
      WHERE id = @checkpointId`, {
      checkpointId: checkpoint_id,
      timeId: ownership.time_id,
      now,
    }).catch(err => console.warn('⚠️ Erro ao atualizar checkpoint:', err.message));
  }

  console.log(`✅ Resultados salvos para Zone Conquest - Vencedor: ${winningTeamId}`);
}

async function recordZoneConquestScan(eventoId, checkpointId, criancaId, timeId, leituraId, uid) {
  // 1. Buscar partida ativa
  const partida = await queryOne(`
    SELECT id, empresa_id FROM zonas_equipes_partidas
    WHERE LOWER(evento_id) = LOWER(@eventoId) AND status = 'active'`, { eventoId });

  if (!partida) {
    throw new Error('Nenhuma partida de zona conquest ativa para este evento');
  }

  // 2. Buscar jogo ativo
  const brincadeira = await queryOne(`
    SELECT id FROM brincadeiras
    WHERE evento_id = @eventoId AND status = 'active'`, { eventoId });

  // 3. Registrar scan
  const scanId = uuidv4();
  const now = new Date();

  await query(`
    INSERT INTO zonas_equipes_scans
      (id, partida_id, empresa_id, evento_id, brincadeira_id, checkpoint_id,
       crianca_id, time_id, uid, leitura_id, version, scanned_at)
    VALUES (@id, @partidaId, @empresaId, @eventoId, @brincadeiraId, @checkpointId,
            @criancaId, @timeId, @uid, @leituraId, 0, @scannedAt)`, {
    id: scanId,
    partidaId: partida.id,
    empresaId: partida.empresa_id,
    eventoId,
    brincadeiraId: brincadeira ? brincadeira.id : null,
    checkpointId,
    criancaId,
    timeId,
    uid,
    leituraId,
    scannedAt: now,
  });

  return scanId;
}

async function getZoneConquestPartidaAtiva(eventoId) {
  return queryOne(`
    SELECT id, status, started_at
    FROM zonas_equipes_partidas
    WHERE LOWER(evento_id) = LOWER(@eventoId) AND status = 'active'`, { eventoId });
}

async function getZoneConquestScans(partidaId, checkpointId) {
  return query(`
    SELECT *
    FROM zonas_equipes_scans
    WHERE partida_id = @partidaId AND checkpoint_id = @checkpointId
    ORDER BY scanned_at ASC`, { partidaId, checkpointId });
}

module.exports = {
  startZoneConquestGame,
  stopZoneConquestGame,
  recordZoneConquestScan,
  getZoneConquestPartidaAtiva,
  getZoneConquestScans,
  ZONE_CONQUEST_GAME_TYPE,
};
