const { query, queryOne, allQuery, withTransaction } = require('../database');
const { v4: uuidv4 } = require('uuid');

const ZONE_CONQUEST_GAME_TYPE = 'zone';

async function startZoneConquestGame(eventoId, brincadeiraId) {
  console.log('🎬 [ZONE_CONQUEST] Iniciando jogo para evento:', eventoId, 'brincadeira:', brincadeiraId);
  
  const resultado = await withTransaction(async (tx) => {
    // Buscar evento e jogo
    const evento = await tx.queryOne('SELECT * FROM eventos WHERE id = @id', { id: eventoId });
    if (!evento) throw new Error('Evento não encontrado');

    const game = await tx.queryOne(
      'SELECT * FROM brincadeiras WHERE id = @id',
      { id: brincadeiraId }
    );
    if (!game) throw new Error('Jogo não encontrado');

    const now = new Date();
    const partidaId = uuidv4();

    // 1. Finalizar qualquer partida ativa anterior
    await tx.query(`
      UPDATE zonas_equipes_teams_states
      SET status = 'finished', version = version + 1
      WHERE LOWER(evento_id) = LOWER(@eventoId) AND status = 'active'`, { eventoId });
    
    await tx.query(`
      UPDATE zonas_equipes_partidas
      SET status = 'finished', finished_at = GETDATE(), version = version + 1
      WHERE LOWER(evento_id) = LOWER(@eventoId) AND status = 'active'`, { eventoId });

    // 2. Criar nova partida
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

    // 3. Buscar todas as equipes participantes
    const participatingTeams = await tx.allQuery(`
      SELECT DISTINCT t.id, t.name
      FROM times t
      WHERE t.evento_id = @eventoId
      ORDER BY t.name`, { eventoId });

    // 4. Criar state para cada equipe
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

    console.log('🎬 [ZONE_CONQUEST] Jogo iniciado com sucesso! Partida:', partidaId);
    
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

  return resultado;
}

async function stopZoneConquestGame(eventoId) {
  try {
    // 1. Calcular vencedor e salvar resultados
    await calculateAndSaveZoneConquestResults(eventoId);
  } catch (err) {
    console.error('⚠️ Erro ao calcular resultados de Zone Conquest:', err.message, err);
  }

  // 2. Finalizar team states
  await query(`
    UPDATE zonas_equipes_teams_states
    SET status = 'finished', version = version + 1
    WHERE LOWER(evento_id) = LOWER(@eventoId) AND status = 'active'`, { eventoId });

  // 3. Finalizar partida
  await query(`
    UPDATE zonas_equipes_partidas
    SET status = 'finished', finished_at = GETDATE(), version = version + 1
    WHERE LOWER(evento_id) = LOWER(@eventoId) AND status = 'active'`, { eventoId });
}

async function calculateAndSaveZoneConquestResults(eventoId) {
  // 1. Buscar partida ativa
  const partida = await queryOne(`
    SELECT id, empresa_id FROM zonas_equipes_partidas
    WHERE LOWER(evento_id) = LOWER(@eventoId) AND status = 'active'`, { eventoId });

  if (!partida) {
    return;
  }

  // 2. Contar leituras por checkpoint e equipe - versão SIMPLES
  const readings = await allQuery(`
    SELECT checkpoint_id, time_id, COUNT(*) as total_readings
    FROM zonas_equipes_scans
    WHERE partida_id = @partidaId
    GROUP BY checkpoint_id, time_id
    ORDER BY checkpoint_id, total_readings DESC`, { partidaId: partida.id });

  if (readings.length === 0) {
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
    return;
  }

  const now = new Date();

  // 6. Atualizar team states com vitória/derrota
  const allTeams = await allQuery(`
    SELECT DISTINCT time_id FROM zonas_equipes_teams_states
    WHERE partida_id = @partidaId`, { partidaId: partida.id });

  for (const team of allTeams) {
    const isWinner = team.time_id === winningTeamId;
    
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
    
    await query(`
      UPDATE checkpoints
      SET territory_owner_time_id = @timeId, last_conquered_at = @now
      WHERE id = @checkpointId`, {
      checkpointId: checkpoint_id,
      timeId: ownership.time_id,
      now,
    }).catch(err => console.error('❌ Erro ao atualizar checkpoint:', err.message));
  }
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
