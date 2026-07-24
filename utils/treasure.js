const { v4: uuidv4 } = require('uuid');
const { query, queryOne, allQuery } = require('../database');

const TREASURE_GAME_TYPE = 'treasure_hunt';
const TREASURE_TURN_DELAY_MS = 10 * 1000;

function parseJson(value, fallback = []) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

async function getGameForEvent(eventoId, brincadeiraId) {
  return queryOne(
    `SELECT b.id, b.name, b.type, b.checkpoints, b.evento_id, e.empresa_id
     FROM brincadeiras b
     INNER JOIN eventos e ON e.id = CONVERT(NVARCHAR(36), b.evento_id)
     WHERE b.id = @brincadeiraId
       AND CONVERT(NVARCHAR(36), b.evento_id) = @eventoId`,
    { brincadeiraId, eventoId }
  );
}

async function getActiveSession(eventoId) {
  return queryOne(
    `SELECT TOP 1 * FROM caca_tesouro_partidas
     WHERE evento_id = @eventoId AND status = 'active'
     ORDER BY started_at DESC`,
    { eventoId }
  );
}

async function getLatestSession(eventoId) {
  return queryOne(
    `SELECT TOP 1 * FROM caca_tesouro_partidas
     WHERE evento_id = @eventoId
     ORDER BY started_at DESC`,
    { eventoId }
  );
}

async function getEventCheckpoints(eventoId) {
  return allQuery(
    `SELECT id, territory_owner_time_id
     FROM checkpoints
     WHERE evento_id = @eventoId`,
    { eventoId }
  );
}

async function getTeamRaceTimes(eventoId, session) {
  const rows = await allQuery(
    `SELECT t.id AS team_id, t.name AS team_name, t.color AS team_color,
            r.started_at, r.completed_at, r.elapsed_ms
     FROM times t
     LEFT JOIN caca_tesouro_tempos r
       ON r.time_id = t.id AND r.partida_id = @partidaId
     WHERE t.evento_id = @eventoId
       AND EXISTS (
         SELECT 1 FROM criancas c
         WHERE c.evento_id = @eventoId AND c.time_id = t.id
       )
     ORDER BY t.name`,
    { eventoId, partidaId: session.id }
  );

  const now = Date.now();
  return rows.map(row => {
    const storedElapsedMs = row.elapsed_ms === null || row.elapsed_ms === undefined
      ? null
      : Number(row.elapsed_ms);
    const runningElapsedMs = row.started_at && storedElapsedMs === null
      ? Math.max(0, now - new Date(row.started_at).getTime())
      : storedElapsedMs;
    return {
      teamId: row.team_id,
      teamName: row.team_name,
      teamColor: row.team_color,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      completed: storedElapsedMs !== null,
      elapsedMs: runningElapsedMs,
      elapsedSeconds: runningElapsedMs === null ? null : Math.round(runningElapsedMs / 1000),
      elapsedMinutes: runningElapsedMs === null ? null : Number((runningElapsedMs / 60000).toFixed(2)),
    };
  });
}

async function startTeamRaceTimer(partidaId, teamId, startedAt) {
  await query(
    `UPDATE caca_tesouro_tempos
     SET started_at = COALESCE(started_at, @startedAt)
     WHERE partida_id = @partidaId AND time_id = @teamId`,
    { partidaId, teamId, startedAt }
  );
}

async function completeTeamRace(partidaId, teamId, completedAt) {
  await query(
    `UPDATE caca_tesouro_tempos
     SET started_at = COALESCE(started_at, @completedAt),
         completed_at = @completedAt,
         elapsed_ms = DATEDIFF_BIG(MILLISECOND, COALESCE(started_at, @completedAt), @completedAt)
     WHERE partida_id = @partidaId AND time_id = @teamId AND completed_at IS NULL`,
    { partidaId, teamId, completedAt }
  );
}

function getFastestCompletedTeam(raceTimes) {
  return raceTimes
    .filter(team => team.completed && team.elapsedMs !== null)
    .sort((a, b) => a.elapsedMs - b.elapsedMs)[0] || null;
}

async function getParticipatingTeams(eventoId) {
  return allQuery(
    `SELECT t.id, t.name, t.color
     FROM times t
     WHERE t.evento_id = @eventoId
       AND EXISTS (
         SELECT 1 FROM criancas c
         WHERE c.evento_id = @eventoId AND c.time_id = t.id
       )
     ORDER BY t.name`,
    { eventoId }
  );
}

function chooseRandom(values) {
  if (!values.length) return null;
  return values[Math.floor(Math.random() * values.length)];
}

async function stopTreasureGame(eventoId) {
  await query(
    `UPDATE caca_tesouro_partidas SET status = 'finished', finished_at = GETDATE()
     WHERE evento_id = @eventoId AND status = 'active'`,
    { eventoId }
  );
}

async function getEventCheckpointIds(eventoId) {
  const checkpoints = await getEventCheckpoints(eventoId);
  return checkpoints.map(checkpoint => String(checkpoint.id));
}

async function getNextTargetCheckpointId(eventoId, teamId, excludedCheckpointId = null) {
  const checkpoints = await getEventCheckpoints(eventoId);
  const candidates = checkpoints
    // Nunca repetir imediatamente o checkpoint que acabou de ser concluído.
    .filter(checkpoint => String(checkpoint.id) !== String(excludedCheckpointId))
    // O próximo alvo precisa ser um checkpoint que ainda não tenha a cor
    // da equipe que receberá a vez.
    .filter(checkpoint => (
      !checkpoint.territory_owner_time_id
      || String(checkpoint.territory_owner_time_id) !== String(teamId)
    ))
    .map(checkpoint => String(checkpoint.id));

  return chooseRandom(candidates);
}

async function getTeamOwnershipProgress(eventoId, teamId) {
  const result = await queryOne(
    `SELECT COUNT(*) AS total,
       SUM(CASE WHEN territory_owner_time_id = @teamId THEN 1 ELSE 0 END) AS owned
     FROM checkpoints
     WHERE evento_id = @eventoId`,
    { eventoId, teamId }
  );

  const total = Number(result?.total || 0);
  const owned = Number(result?.owned || 0);
  return {
    total,
    owned,
    won: total > 0 && owned === total,
  };
}

async function startTreasureGame(eventoId, brincadeiraId) {
  const game = await getGameForEvent(eventoId, brincadeiraId);
  if (!game || game.type !== TREASURE_GAME_TYPE) {
    throw new Error('Jogo Caça ao Tesouro não encontrado para este evento');
  }

  // O primeiro alvo pode ser qualquer checkpoint do evento.
  const ids = await getEventCheckpointIds(eventoId);
  if (!ids.length) {
    throw new Error('O Caça ao Tesouro precisa de pelo menos um checkpoint válido');
  }

  const participatingTeams = await getParticipatingTeams(eventoId);
  if (participatingTeams.length !== 2) {
    throw new Error('O Caça ao Tesouro precisa de exatamente duas equipes cadastradas no evento');
  }

  // Sorteio persistente: somente esta equipe começa a primeira etapa.
  const startingTeam = chooseRandom(participatingTeams);

  await stopTreasureGame(eventoId);
  const now = new Date();
  const targetCheckpointId = chooseRandom(ids);
  const partidaId = uuidv4();

  await query(
    `INSERT INTO caca_tesouro_partidas
      (id, evento_id, brincadeira_id, status, round_number, starting_team_id,
       turn_team_id, turn_available_at, target_checkpoint_id, completed_checkpoint_ids,
       started_at, round_started_at)
     VALUES (@id, @eventoId, @brincadeiraId, 'active', 1, @startingTeamId,
       @turnTeamId, @turnAvailableAt, @targetCheckpointId, @completedCheckpointIds,
       @startedAt, @roundStartedAt)`,
    {
      id: partidaId,
      eventoId,
      brincadeiraId,
      startingTeamId: startingTeam.id,
      turnTeamId: startingTeam.id,
      turnAvailableAt: now,
      targetCheckpointId,
      completedCheckpointIds: JSON.stringify([]),
      startedAt: now,
      roundStartedAt: now,
    }
  );

  for (const team of participatingTeams) {
    await query(
      `INSERT INTO caca_tesouro_tempos
        (id, partida_id, evento_id, time_id, started_at, completed_at, elapsed_ms)
       VALUES (@id, @partidaId, @eventoId, @timeId, @startedAt, NULL, NULL)`,
      {
        id: uuidv4(),
        partidaId,
        eventoId,
        timeId: team.id,
        // O cronômetro da equipe sorteada começa no início da partida.
        // O da outra equipe começa quando sua primeira vez for liberada.
        startedAt: String(team.id) === String(startingTeam.id) ? now : null,
      }
    );
  }

  return {
    id: partidaId,
    eventoId,
    brincadeiraId,
    roundNumber: 1,
    startingTeamId: startingTeam.id,
    startingTeamName: startingTeam.name,
    turnTeamId: startingTeam.id,
    turnTeamName: startingTeam.name,
    turnAvailableAt: now,
    targetCheckpointId,
    completedCheckpointIds: [],
    status: 'active',
  };
}

async function getCheckpointTreasureStatus(checkpointId) {
  const checkpoint = await queryOne(
    'SELECT id, evento_id FROM checkpoints WHERE id = @checkpointId',
    { checkpointId }
  );
  if (!checkpoint) return { gameType: 'none', treasureTarget: false };

  const session = await getActiveSession(checkpoint.evento_id);
  if (!session) return { gameType: 'none', treasureTarget: false };

  const completedCheckpointIds = parseJson(session.completed_checkpoint_ids, []);
  return {
    gameType: TREASURE_GAME_TYPE,
    treasureTarget: String(session.target_checkpoint_id) === String(checkpointId),
    treasureRound: session.round_number,
    treasureTargetCheckpointId: session.target_checkpoint_id,
    treasureCompletedCheckpoints: completedCheckpointIds,
  };
}

async function getTreasureEventStatus(eventoId) {
  let session = await getActiveSession(eventoId);
  if (!session) {
    session = await getLatestSession(eventoId);
    if (!session || session.status !== 'completed') {
      return { active: false, gameType: 'none' };
    }

    const teamRaceTimes = await getTeamRaceTimes(eventoId, session);
    const winningTeam = getFastestCompletedTeam(teamRaceTimes);
    return {
      active: false,
      completed: true,
      gameType: TREASURE_GAME_TYPE,
      partidaId: session.id,
      finishedAt: session.finished_at,
      teamRaceTimes,
      winningTeamId: winningTeam?.teamId || null,
      winningTeamName: winningTeam?.teamName || null,
    };
  }

  const checkpoints = await getEventCheckpoints(eventoId);
  const ownershipCounts = checkpoints.reduce((counts, checkpoint) => {
    if (checkpoint.territory_owner_time_id) {
      const ownerId = String(checkpoint.territory_owner_time_id);
      counts[ownerId] = (counts[ownerId] || 0) + 1;
    }
    return counts;
  }, {});
  const ownedCheckpoints = Object.values(ownershipCounts).reduce(
    (max, count) => Math.max(max, count),
    0
  );

  const startingTeam = session.starting_team_id
    ? await queryOne('SELECT name FROM times WHERE id = @timeId', { timeId: session.starting_team_id })
    : null;
  const turnTeam = session.turn_team_id
    ? await queryOne('SELECT name FROM times WHERE id = @timeId', { timeId: session.turn_team_id })
    : null;
  const turnAvailableAt = session.turn_available_at ? new Date(session.turn_available_at) : null;
  const turnRemainingSeconds = turnAvailableAt && turnAvailableAt > new Date()
    ? Math.ceil((turnAvailableAt.getTime() - Date.now()) / 1000)
    : 0;

  return {
    active: true,
    gameType: TREASURE_GAME_TYPE,
    partidaId: session.id,
    roundNumber: session.round_number,
    startingTeamId: session.starting_team_id || null,
    startingTeamName: startingTeam?.name || null,
    turnTeamId: session.turn_team_id || null,
    turnTeamName: turnTeam?.name || null,
    turnAvailableAt: session.turn_available_at || null,
    turnRemainingSeconds,
    targetCheckpointId: session.target_checkpoint_id,
    completedCheckpointIds: parseJson(session.completed_checkpoint_ids, []),
    totalCheckpoints: checkpoints.length,
    ownedCheckpoints,
    checkpointOwnership: checkpoints.map(checkpoint => ({
      checkpointId: String(checkpoint.id),
      teamId: checkpoint.territory_owner_time_id || null,
    })),
    startedAt: session.started_at,
    roundStartedAt: session.round_started_at,
    teamRaceTimes: await getTeamRaceTimes(eventoId, session),
    teamsProgress: await getTeamsProgress(eventoId, session),
  };
}

async function getTeamsProgress(eventoId, session) {
  const teams = await allQuery(
    `SELECT t.id, t.name, t.color,
       (SELECT COUNT(*) FROM criancas c WHERE c.evento_id = @eventoId AND c.time_id = t.id) AS total,
       (SELECT COUNT(*) FROM caca_tesouro_scans s
        WHERE s.partida_id = @partidaId AND s.round_number = @roundNumber AND s.time_id = t.id) AS scanned
     FROM times t
     WHERE t.evento_id = @eventoId
       AND EXISTS (
         SELECT 1 FROM criancas c
         WHERE c.evento_id = @eventoId AND c.time_id = t.id
       )
     ORDER BY t.name`,
    { eventoId, partidaId: session.id, roundNumber: session.round_number }
  );

  return teams.map(team => ({
    teamId: team.id,
    teamName: team.name,
    teamColor: team.color,
    scanned: Number(team.scanned || 0),
    total: Number(team.total || 0),
    complete: Number(team.total || 0) > 0 && Number(team.scanned || 0) >= Number(team.total || 0),
  }));
}

async function processTreasureScan({ eventoId, checkpointId, crianca, brincadeiraId, uid, now }) {
  const session = await getActiveSession(eventoId);
  if (!session) return null;

  if (!crianca.time_id) {
    return { handled: true, accepted: false, error: 'Criança não pertence a uma equipe' };
  }

  const turnTeamId = session.turn_team_id || session.starting_team_id;
  const turnTeam = turnTeamId
    ? await queryOne('SELECT name FROM times WHERE id = @timeId', { timeId: turnTeamId })
    : null;

  if (turnTeamId && String(turnTeamId) !== String(crianca.time_id)) {
    return {
      handled: true,
      accepted: false,
      error: `Agora é a vez da equipe ${turnTeam?.name || 'adversária'}`,
      turnTeamId,
    };
  }

  const turnAvailableAt = session.turn_available_at ? new Date(session.turn_available_at) : null;
  if (turnAvailableAt && turnAvailableAt > now) {
    const remainingSeconds = Math.max(1, Math.ceil((turnAvailableAt.getTime() - now.getTime()) / 1000));
    return {
      handled: true,
      accepted: false,
      error: `Aguarde ${remainingSeconds} segundos para começar a vez da equipe ${turnTeam?.name || ''}`.trim(),
      turnTeamId,
      turnAvailableAt: turnAvailableAt.toISOString(),
      remainingSeconds,
    };
  }

  if (String(session.target_checkpoint_id) !== String(checkpointId)) {
    return {
      handled: true,
      accepted: false,
      error: 'Este checkpoint não é o alvo atual do Caça ao Tesouro',
      targetCheckpointId: session.target_checkpoint_id,
    };
  }

  if (!crianca.time_id) {
    return { handled: true, accepted: false, error: 'Criança não pertence a uma equipe' };
  }

  const members = await allQuery(
    `SELECT id FROM criancas WHERE evento_id = @eventoId AND time_id = @timeId`,
    { eventoId, timeId: crianca.time_id }
  );
  if (!members.length) {
    return { handled: true, accepted: false, error: 'Equipe sem participantes cadastrados' };
  }

  const alreadyScanned = await queryOne(
    `SELECT id FROM caca_tesouro_scans
     WHERE partida_id = @partidaId AND round_number = @roundNumber AND crianca_id = @criancaId`,
    { partidaId: session.id, roundNumber: session.round_number, criancaId: crianca.id }
  );
  if (alreadyScanned) {
    const duplicateCount = await queryOne(
      `SELECT COUNT(*) AS total FROM caca_tesouro_scans
       WHERE partida_id = @partidaId AND round_number = @roundNumber AND time_id = @timeId`,
      { partidaId: session.id, roundNumber: session.round_number, timeId: crianca.time_id }
    );
    return {
      handled: true,
      accepted: false,
      duplicate: true,
      message: 'Esta criança já participou desta etapa',
      scanned: Number(duplicateCount?.total || 0),
      total: members.length,
    };
  }

  try {
    await query(
      `INSERT INTO caca_tesouro_scans
        (id, partida_id, evento_id, brincadeira_id, round_number, checkpoint_id,
         crianca_id, time_id, uid, scanned_at)
       VALUES (@id, @partidaId, @eventoId, @brincadeiraId, @roundNumber, @checkpointId,
         @criancaId, @timeId, @uid, @scannedAt)`,
      {
        id: uuidv4(),
        partidaId: session.id,
        eventoId,
        brincadeiraId,
        roundNumber: session.round_number,
        checkpointId,
        criancaId: crianca.id,
        timeId: crianca.time_id,
        uid,
        scannedAt: now,
      }
    );
  } catch (error) {
    // A restrição única também protege duas leituras simultâneas da mesma criança.
    if (String(error.message || '').toLowerCase().includes('unique')) {
      const duplicateCount = await queryOne(
        `SELECT COUNT(*) AS total FROM caca_tesouro_scans
         WHERE partida_id = @partidaId AND round_number = @roundNumber AND time_id = @timeId`,
        { partidaId: session.id, roundNumber: session.round_number, timeId: crianca.time_id }
      );
      return {
        handled: true,
        accepted: false,
        duplicate: true,
        message: 'Esta criança já participou desta etapa',
        scanned: Number(duplicateCount?.total || 0),
        total: members.length,
      };
    }
    throw error;
  }

  const countResult = await queryOne(
    `SELECT COUNT(*) AS total FROM caca_tesouro_scans
     WHERE partida_id = @partidaId AND round_number = @roundNumber AND time_id = @timeId`,
    { partidaId: session.id, roundNumber: session.round_number, timeId: crianca.time_id }
  );
  const scanned = Number(countResult?.total || 0);

  if (scanned < members.length) {
    return {
      handled: true,
      accepted: true,
      teamComplete: false,
      roundNumber: session.round_number,
      scanned,
      total: members.length,
      message: `Participante confirmado: ${scanned}/${members.length}`,
    };
  }

  // O alvo foi concluído por todos os participantes da equipe.
  // A lista abaixo é apenas o histórico de etapas; ela não limita mais os
  // checkpoints disponíveis, pois uma equipe pode precisar reconquistar um
  // checkpoint que está com a cor adversária.
  const completedCheckpointIds = parseJson(session.completed_checkpoint_ids, []);
  const updatedCompleted = [...new Set([...completedCheckpointIds, String(checkpointId)])];
  const team = await queryOne(
    'SELECT id, name, color FROM times WHERE id = @timeId',
    { timeId: crianca.time_id }
  );

  // Primeiro registra o novo dono. A vitória é definida pelo estado atual de
  // TODOS os checkpoints do evento, e não pela quantidade de etapas visitadas.
  await query(
    `UPDATE checkpoints SET territory_owner_time_id = @timeId,
       territory_locked_until = NULL, territory_cooldown_until = NULL, last_conquered_at = @now
     WHERE id = @checkpointId AND evento_id = @eventoId`,
    { timeId: crianca.time_id, now, checkpointId, eventoId }
  );

  const ownership = await getTeamOwnershipProgress(eventoId, crianca.time_id);
  if (ownership.won) {
    await completeTeamRace(session.id, crianca.time_id, now);
  }

  const raceTimes = await getTeamRaceTimes(eventoId, session);
  const raceFinished = raceTimes.length === 2 && raceTimes.every(teamRace => teamRace.completed);
  const winningTeam = raceFinished ? getFastestCompletedTeam(raceTimes) : null;
  const currentTeamRace = raceTimes.find(
    teamRace => String(teamRace.teamId) === String(crianca.time_id)
  ) || null;
  const unfinishedTeams = raceTimes.filter(teamRace => !teamRace.completed);

  // A equipe atual continua jogando até dominar todos os checkpoints.
  // Só depois disso a vez passa para a outra equipe.
  const nextTurnTeam = raceFinished
    ? null
    : ownership.won
      ? unfinishedTeams.find(teamRace => String(teamRace.teamId) !== String(crianca.time_id))
        || unfinishedTeams[0]
        || null
      : currentTeamRace;
  const switchingTeam = Boolean(ownership.won && nextTurnTeam);
  const nextTurnAvailableAt = raceFinished || !nextTurnTeam
    ? null
    : switchingTeam
      ? new Date(now.getTime() + TREASURE_TURN_DELAY_MS)
      : now;

  if (nextTurnTeam && nextTurnAvailableAt) {
    await startTeamRaceTimer(session.id, nextTurnTeam.teamId, nextTurnAvailableAt);
  }

  const nextTargetCheckpointId = raceFinished
    ? null
    : nextTurnTeam
      ? await getNextTargetCheckpointId(eventoId, nextTurnTeam.teamId, checkpointId)
      : null;

  let advanceResult;
  if (raceFinished) {
    advanceResult = await query(
      `UPDATE caca_tesouro_partidas SET status = 'completed',
         target_checkpoint_id = NULL,
         turn_team_id = NULL,
         turn_available_at = NULL,
         completed_checkpoint_ids = @completedCheckpointIds,
         finished_at = @finishedAt
       WHERE id = @partidaId AND status = 'active' AND round_number = @roundNumber`,
      {
        partidaId: session.id,
        roundNumber: session.round_number,
        completedCheckpointIds: JSON.stringify(updatedCompleted),
        finishedAt: now,
      }
    );
  } else {
    advanceResult = await query(
      `UPDATE caca_tesouro_partidas SET round_number = round_number + 1,
         turn_team_id = @turnTeamId,
         turn_available_at = @turnAvailableAt,
         target_checkpoint_id = @targetCheckpointId,
         completed_checkpoint_ids = @completedCheckpointIds,
         round_started_at = @roundStartedAt
       WHERE id = @partidaId AND status = 'active' AND round_number = @roundNumber`,
      {
        partidaId: session.id,
        roundNumber: session.round_number,
        turnTeamId: nextTurnTeam.teamId,
        turnAvailableAt: nextTurnAvailableAt,
        targetCheckpointId: nextTargetCheckpointId,
        completedCheckpointIds: JSON.stringify(updatedCompleted),
        roundStartedAt: now,
      }
    );
  }

  if (!advanceResult?.rowsAffected?.[0]) {
    return {
      handled: true,
      accepted: false,
      duplicate: true,
      message: 'Esta etapa já foi concluída por outra equipe',
      scanned,
      total: members.length,
    };
  }

  if (raceFinished) {
    await query(
      `UPDATE eventos SET status = 'scheduled' WHERE id = @eventoId AND status = 'active'`,
      { eventoId }
    );
  }

  return {
    handled: true,
    accepted: true,
    teamComplete: true,
    roundComplete: true,
    roundNumber: session.round_number,
    finished: raceFinished,
    scanned,
    total: members.length,
    teamId: crianca.time_id,
    teamName: team?.name || 'Equipe',
    teamColor: team?.color || '#00AA00',
    teamCompletedAllCheckpoints: ownership.won,
    winningTeamId: winningTeam?.teamId || null,
    winningTeamName: winningTeam?.teamName || null,
    ownedCheckpoints: ownership.owned,
    totalCheckpoints: ownership.total,
    turnTeamId: raceFinished ? null : nextTurnTeam?.teamId || null,
    turnTeamName: raceFinished ? null : nextTurnTeam?.teamName || null,
    turnAvailableAt: nextTurnAvailableAt ? nextTurnAvailableAt.toISOString() : null,
    turnWaitSeconds: switchingTeam ? TREASURE_TURN_DELAY_MS / 1000 : 0,
    teamRaceTimes: raceTimes,
    nextTargetCheckpointId,
    completedCheckpointIds: updatedCompleted,
    message: raceFinished
      ? `🏆 Caça ao Tesouro concluído! A equipe ${winningTeam?.teamName || 'vencedora'} foi mais rápida, com ${winningTeam?.elapsedMinutes ?? 0} minutos.`
      : ownership.won
        ? `✅ A equipe ${team?.name || ''} acendeu todos os checkpoints. Aguarde 10 segundos para a outra equipe começar.`
        : `Etapa concluída pela equipe ${team?.name || ''}. Próximo checkpoint da mesma equipe será liberado.`,
  };
}

module.exports = {
  TREASURE_GAME_TYPE,
  getGameForEvent,
  getActiveSession,
  startTreasureGame,
  stopTreasureGame,
  getCheckpointTreasureStatus,
  getTreasureEventStatus,
  processTreasureScan,
};
