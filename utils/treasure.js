const { v4: uuidv4 } = require('uuid');
const { query, queryOne, allQuery } = require('../database');
const { awardWinnerBonus } = require('./winnerBonus');

const TREASURE_GAME_TYPE = 'treasure_hunt';
const TREASURE_TURN_DELAY_MS = 10 * 1000;

function sameId(left, right) {
  return left !== null && left !== undefined
    && right !== null && right !== undefined
    && String(left).trim().toLowerCase() === String(right).trim().toLowerCase();
}

function parseJson(value, fallback = []) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

async function getGameForEvent(eventoId, brincadeiraId) {
  return queryOne(
    `SELECT b.brincadeiraId, b.nome, b.tipo, b.checkpoints, b.eventoId, e.empresaId
     FROM "brincadeira" b
     INNER JOIN evento e ON LOWER(e.eventoId) = LOWER(@eventoId)
     WHERE LOWER(b.brincadeiraId) = LOWER(@brincadeiraId)
       AND LOWER(COALESCE(b.status, 'active')) <> 'archived'
       AND LOWER(b.empresaId) = LOWER(e.empresaId)
       AND (
         LOWER(b.eventoId) = LOWER(@eventoId)
         OR EXISTS (
           SELECT 1
           FROM "eventoBrincadeira" eb
           WHERE LOWER(eb.brincadeiraId) = LOWER(b.brincadeiraId)
             AND LOWER(eb.eventoId) = LOWER(@eventoId)
         )
       )`,
    { brincadeiraId, eventoId }
  );
}

async function getActiveSession(eventoId) {
  return queryOne(
    `SELECT TOP 1 * FROM cacaTesourPartida
     WHERE LOWER(eventoId) = LOWER(@eventoId) AND status = 'active'
     ORDER BY iniciadoEm DESC`,
    { eventoId }
  );
}

async function getLatestSession(eventoId) {
  return queryOne(
    `SELECT TOP 1 * FROM cacaTesourPartida
     WHERE LOWER(eventoId) = LOWER(@eventoId)
     ORDER BY iniciadoEm DESC`,
    { eventoId }
  );
}

async function getEventCheckpoints(eventoId) {
  return allQuery(
    `SELECT checkpointId, territorioDonoTimeId
     FROM "pontoVerificacao"
     WHERE LOWER(eventoId) = LOWER(@eventoId)
       AND LOWER(status) = 'online'
       AND LOWER(COALESCE(proposito, 'game')) <> 'reception'`,
    { eventoId }
  );
}

async function getTeamRaceTimes(eventoId, session) {
  const rows = await allQuery(
    `SELECT t.timeId AS team_id, t.nome AS team_name, t.cor AS team_color,
            r.iniciadoEm, r.concluidoEm, r.duracaoMs
     FROM "time" t
     LEFT JOIN cacaTesourTempo r
       ON LOWER(r.timeId) = LOWER(t.timeId) AND LOWER(r.partidaId) = LOWER(@partidaId)
     WHERE LOWER(t.eventoId) = LOWER(@eventoId)
       AND EXISTS (
         SELECT 1 FROM "crianca" c
         WHERE LOWER(c.eventoId) = LOWER(@eventoId)
           AND LOWER(c.timeId) = LOWER(t.timeId)
       )
     ORDER BY t.nome`,
    { eventoId, partidaId: session.id }
  );

  const now = Date.now();
  return rows.map(row => {
    const storedElapsedMs = row.duracaoMs === null || row.duracaoMs === undefined
      ? null
      : Number(row.duracaoMs);
    const runningElapsedMs = row.iniciadoEm && storedElapsedMs === null
      ? Math.max(0, now - new Date(row.iniciadoEm).getTime())
      : storedElapsedMs;
    return {
      teamId: row.team_id,
      teamName: row.team_name,
      teamColor: row.team_color,
      startedAt: row.iniciadoEm,
      completedAt: row.concluidoEm,
      completed: storedElapsedMs !== null,
      elapsedMs: runningElapsedMs,
      elapsedSeconds: runningElapsedMs === null ? null : Math.round(runningElapsedMs / 1000),
      elapsedMinutes: runningElapsedMs === null ? null : Number((runningElapsedMs / 60000).toFixed(2)),
    };
  });
}

async function startTeamRaceTimer(partidaId, teamId, startedAt) {
  await query(
    `UPDATE cacaTesourTempo
     SET iniciadoEm = COALESCE(iniciadoEm, @startedAt)
     WHERE LOWER(partidaId) = LOWER(@partidaId) AND LOWER(timeId) = LOWER(@teamId)`,
    { partidaId, teamId, startedAt }
  );
}

async function completeTeamRace(partidaId, teamId, completedAt) {
  await query(
    `UPDATE cacaTesourTempo
     SET iniciadoEm = COALESCE(iniciadoEm, @completedAt),
         concluidoEm = @completedAt,
         duracaoMs = CASE
           WHEN iniciadoEm IS NULL THEN 0
           ELSE DATEDIFF_BIG(MILLISECOND, iniciadoEm, @completedAt)
         END
     WHERE LOWER(partidaId) = LOWER(@partidaId)
       AND LOWER(timeId) = LOWER(@teamId)
       AND concluidoEm IS NULL`,
    { partidaId, teamId, completedAt }
  );
}

function getFastestCompletedTeam(raceTimes) {
  return raceTimes
    .filter(team => team.completed && team.elapsedMs !== null)
    .sort((a, b) => a.elapsedMs - b.elapsedMs)[0] || null;
}

function getNextUnfinishedTeam(raceTimes, currentTeamId) {
  const unfinishedTeams = raceTimes.filter(teamRace => !teamRace.completed);
  if (!unfinishedTeams.length) return null;

  const currentIndex = raceTimes.findIndex(teamRace => sameId(teamRace.teamId, currentTeamId));
  if (currentIndex < 0) return unfinishedTeams[0];

  for (let offset = 1; offset <= raceTimes.length; offset += 1) {
    const candidate = raceTimes[(currentIndex + offset) % raceTimes.length];
    if (!candidate.completed) return candidate;
  }

  return unfinishedTeams[0];
}

async function getParticipatingTeams(eventoId) {
  return allQuery(
    `SELECT t.timeId, t.nome, t.cor
     FROM "time" t
     WHERE LOWER(t.eventoId) = LOWER(@eventoId)
       AND EXISTS (
         SELECT 1 FROM "crianca" c
         WHERE LOWER(c.eventoId) = LOWER(@eventoId)
           AND LOWER(c.timeId) = LOWER(t.timeId)
       )
     ORDER BY t.nome`,
    { eventoId }
  );
}

function chooseRandom(values) {
  if (!values.length) return null;
  return values[Math.floor(Math.random() * values.length)];
}

// Parada manual (ou por tempo) com a partida em andamento: se alguma equipe já
// concluiu a corrida, a mais rápida é a vencedora e recebe o bônus. Sem nenhuma
// equipe concluída, ninguém ganha.
async function awardTreasureBonusOnStop(eventoId) {
  const session = await getActiveSession(eventoId);
  if (!session) return null;
  const winner = getFastestCompletedTeam(await getTeamRaceTimes(eventoId, session));
  if (!winner) return null;
  return awardWinnerBonus({
    eventoId,
    partidaId: session.id,
    gameType: TREASURE_GAME_TYPE,
    teamId: winner.teamId,
  });
}

async function stopTreasureGame(eventoId) {
  await query(
    `UPDATE cacaTesourPartida SET status = 'finished', finalizadoEm = GETDATE()
     WHERE LOWER(eventoId) = LOWER(@eventoId) AND status = 'active'`,
    { eventoId }
  );
}

async function getTreasureCheckpointIds(eventoId, brincadeiraId) {
  const checkpoints = await getEventCheckpoints(eventoId);
  if (!brincadeiraId) return checkpoints.map(checkpoint => String(checkpoint.checkpointId));

  const game = await queryOne(
    'SELECT checkpoints FROM "brincadeira" WHERE LOWER(brincadeiraId) = LOWER(@brincadeiraId)',
    { brincadeiraId }
  );
  const configuredItems = parseJson(game?.checkpoints, []);
  const configuredIds = configuredItems
    .map(item => String(item?.id || item || '').trim())
    .filter(Boolean);

  if (!configuredIds.length) return checkpoints.map(checkpoint => String(checkpoint.checkpointId));

  const configuredSet = new Set(configuredIds.map(id => id.toLowerCase()));
  return checkpoints
    .filter(checkpoint => configuredSet.has(String(checkpoint.checkpointId).trim().toLowerCase()))
    .map(checkpoint => String(checkpoint.checkpointId));
}

async function getNextTargetCheckpointId(eventoId, teamId, excludedCheckpointId = null, allowedCheckpointIds = null) {
  const checkpoints = await getEventCheckpoints(eventoId);
  const allowedSet = Array.isArray(allowedCheckpointIds) && allowedCheckpointIds.length
    ? new Set(allowedCheckpointIds.map(id => String(id).trim().toLowerCase()))
    : null;
  const scopedCheckpoints = allowedSet
    ? checkpoints.filter(checkpoint => allowedSet.has(String(checkpoint.checkpointId).trim().toLowerCase()))
    : checkpoints;
  const candidates = scopedCheckpoints
    // Nunca repetir imediatamente o checkpoint que acabou de ser concluído.
    .filter(checkpoint => !sameId(checkpoint.checkpointId, excludedCheckpointId))
    // O próximo alvo precisa ser um checkpoint que ainda não tenha a cor
    // da equipe que receberá a vez.
    .filter(checkpoint => (
      !checkpoint.territorioDonoTimeId
      || !sameId(checkpoint.territorioDonoTimeId, teamId)
    ))
    .map(checkpoint => String(checkpoint.checkpointId));

  if (candidates.length) {
    return chooseRandom(candidates);
  }

  // Não deixar uma partida ativa sem alvo. Isso pode ocorrer quando os dados
  // de domínio já estão parcialmente preenchidos ou quando há poucos
  // checkpoints. Neste caso, permite repetir qualquer checkpoint diferente
  // do último; se houver apenas um, repete o próprio checkpoint.
  const fallbackCandidates = scopedCheckpoints
    .filter(checkpoint => !sameId(checkpoint.checkpointId, excludedCheckpointId))
    .map(checkpoint => String(checkpoint.checkpointId));

  if (fallbackCandidates.length) {
    return chooseRandom(fallbackCandidates);
  }

  return excludedCheckpointId ? String(excludedCheckpointId) : null;
}

async function getTeamOwnershipProgress(eventoId, teamId, allowedCheckpointIds = null) {
  const checkpoints = await getEventCheckpoints(eventoId);
  const allowedSet = Array.isArray(allowedCheckpointIds) && allowedCheckpointIds.length
    ? new Set(allowedCheckpointIds.map(id => String(id).trim().toLowerCase()))
    : null;
  const scopedCheckpoints = allowedSet
    ? checkpoints.filter(checkpoint => allowedSet.has(String(checkpoint.checkpointId).trim().toLowerCase()))
    : checkpoints;
  const owned = scopedCheckpoints.filter(checkpoint => sameId(checkpoint.territorioDonoTimeId, teamId)).length;

  return {
    total: scopedCheckpoints.length,
    owned,
    won: scopedCheckpoints.length > 0 && owned === scopedCheckpoints.length,
  };
}

async function startTreasureGame(eventoId, brincadeiraId) {
  const game = await getGameForEvent(eventoId, brincadeiraId);
  if (!game || game.tipo !== TREASURE_GAME_TYPE) {
    throw new Error('Jogo Caça ao Tesouro não encontrado para este evento');
  }

  // O primeiro alvo deve pertencer à lista configurada na brincadeira e estar online.
  const ids = await getTreasureCheckpointIds(eventoId, brincadeiraId);
  if (!ids.length) {
    throw new Error('O Caça ao Tesouro precisa de pelo menos um checkpoint configurado e online');
  }

  const participatingTeams = await getParticipatingTeams(eventoId);
  if (participatingTeams.length < 2) {
    throw new Error('O Caça ao Tesouro precisa de pelo menos duas equipes cadastradas no evento');
  }

  // Sorteio persistente: somente esta equipe começa a primeira etapa.
  const startingTeam = chooseRandom(participatingTeams);

  await stopTreasureGame(eventoId);
  const now = new Date();
  const initialTurnAvailableAt = new Date(now.getTime() + TREASURE_TURN_DELAY_MS);
  const targetCheckpointId = chooseRandom(ids);
  const partidaId = uuidv4();

  await query(
    `INSERT INTO cacaTesourPartida
      (partidaId, eventoId, brincadeiraId, status, numeroRonda, timeInicialId,
       timeVezId, vezDisponvelEm, checkpointAlvoId, checkpointsCompletadosIds,
       iniciadoEm, rondaIniciadaEm)
     VALUES (@id, @eventoId, @brincadeiraId, 'active', 1, @startingTeamId,
       @turnTeamId, @turnAvailableAt, @targetCheckpointId, @completedCheckpointIds,
       @startedAt, @roundStartedAt)`,
    {
      id: partidaId,
      eventoId,
      brincadeiraId,
      startingTeamId: startingTeam.id,
      turnTeamId: startingTeam.id,
      turnAvailableAt: initialTurnAvailableAt,
      targetCheckpointId,
      completedCheckpointIds: JSON.stringify([]),
      startedAt: now,
      roundStartedAt: initialTurnAvailableAt,
    }
  );

  for (const team of participatingTeams) {
    await query(
      `INSERT INTO cacaTesourTempo
        (tempoId, partidaId, eventoId, timeId, iniciadoEm, concluidoEm, duracaoMs)
       VALUES (@id, @partidaId, @eventoId, @timeId, @startedAt, NULL, NULL)`,
      {
        id: uuidv4(),
        partidaId,
        eventoId,
        timeId: team.timeId,
        // A equipe sorteada começa a correr depois dos 10 segundos de preparação.
        // O cronômetro de cada equipe começa quando sua primeira vez for liberada.
        startedAt: sameId(team.timeId, startingTeam.id) ? initialTurnAvailableAt : null,
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
    turnAvailableAt: initialTurnAvailableAt.toISOString(),
    turnRemainingSeconds: TREASURE_TURN_DELAY_MS / 1000,
    turnWaitSeconds: TREASURE_TURN_DELAY_MS / 1000,
    initialWait: true,
    targetCheckpointId,
    completedCheckpointIds: [],
    status: 'active',
  };
}

async function getCheckpointTreasureStatus(checkpointId) {
  const checkpoint = await queryOne(
    `SELECT checkpointId, eventoId, status, proposito FROM "pontoVerificacao" WHERE LOWER(checkpointId) = LOWER(@checkpointId)`,
    { checkpointId }
  );
  if (!checkpoint) return { gameType: 'none', treasureTarget: false };
  if (String(checkpoint.proposito || 'game').trim().toLowerCase() === 'reception') {
    return { gameType: 'none', treasureTarget: false };
  }
  if (String(checkpoint.status || '').trim().toLowerCase() !== 'online') {
    return {
      gameType: 'none',
      treasureTarget: false,
      checkpointOffline: true,
    };
  }

  const session = await getActiveSession(checkpoint.eventoId);
  if (!session) return { gameType: 'none', treasureTarget: false };

  const completedCheckpointIds = parseJson(session.checkpointsCompletadosIds, []);
  return {
    gameType: TREASURE_GAME_TYPE,
    treasureTarget: sameId(session.checkpointAlvoId, checkpointId),
    treasureRound: session.numeroRonda,
    treasureTargetCheckpointId: session.checkpointAlvoId,
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
      finishedAt: session.finalizadoEm,
      teamRaceTimes,
      winningTeamId: winningTeam?.teamId || null,
      winningTeamName: winningTeam?.teamName || null,
    };
  }

  const configuredCheckpointIds = await getTreasureCheckpointIds(eventoId, session.brincadeiraId);
  const configuredCheckpointSet = new Set(configuredCheckpointIds.map(id => String(id).trim().toLowerCase()));
  const checkpoints = (await getEventCheckpoints(eventoId)).filter(checkpoint => (
    configuredCheckpointSet.size === 0
      || configuredCheckpointSet.has(String(checkpoint.checkpointId).trim().toLowerCase())
  ));
  const ownershipCounts = checkpoints.reduce((counts, checkpoint) => {
    if (checkpoint.territorioDonoTimeId) {
      const ownerId = String(checkpoint.territorioDonoTimeId);
      counts[ownerId] = (counts[ownerId] || 0) + 1;
    }
    return counts;
  }, {});
  const ownedCheckpoints = Object.values(ownershipCounts).reduce(
    (max, count) => Math.max(max, count),
    0
  );

  const startingTeam = session.timeInicialId
    ? await queryOne('SELECT nome FROM "time" WHERE timeId = @timeId', { timeId: session.timeInicialId })
    : null;
  const turnTeam = session.timeVezId
    ? await queryOne('SELECT nome FROM "time" WHERE timeId = @timeId', { timeId: session.timeVezId })
    : null;
  const turnAvailableAt = session.vezDisponvelEm ? new Date(session.vezDisponvelEm) : null;
  const turnRemainingSeconds = turnAvailableAt && turnAvailableAt > new Date()
    ? Math.ceil((turnAvailableAt.getTime() - Date.now()) / 1000)
    : 0;
  const initialWait = Number(session.numeroRonda) === 1 && turnRemainingSeconds > 0;

  return {
    active: true,
    gameType: TREASURE_GAME_TYPE,
    partidaId: session.id,
    roundNumber: session.numeroRonda,
    startingTeamId: session.timeInicialId || null,
    startingTeamName: startingTeam?.name || null,
    turnTeamId: session.timeVezId || null,
    turnTeamName: turnTeam?.name || null,
    turnAvailableAt: session.vezDisponvelEm || null,
    turnRemainingSeconds,
    initialWait,
    targetCheckpointId: session.checkpointAlvoId,
    completedCheckpointIds: parseJson(session.checkpointsCompletadosIds, []),
    totalCheckpoints: checkpoints.length,
    ownedCheckpoints,
    checkpointOwnership: checkpoints.map(checkpoint => ({
      checkpointId: String(checkpoint.checkpointId),
      teamId: checkpoint.territorioDonoTimeId || null,
    })),
    startedAt: session.iniciadoEm,
    roundStartedAt: session.rondaIniciadaEm,
    teamRaceTimes: await getTeamRaceTimes(eventoId, session),
    teamsProgress: await getTeamsProgress(eventoId, session),
  };
}

async function getTeamsProgress(eventoId, session) {
  const teams = await allQuery(
    `SELECT t.timeId, t.nome, t.cor,
       (SELECT COUNT(*) FROM "crianca" c
        WHERE LOWER(c.eventoId) = LOWER(@eventoId)
          AND LOWER(c.timeId) = LOWER(t.timeId)) AS total,
       (SELECT COUNT(*) FROM cacaTesourScan s
        WHERE LOWER(s.partidaId) = LOWER(@partidaId)
          AND s.numeroRonda = @roundNumber
          AND LOWER(s.timeId) = LOWER(t.timeId)) AS scanned
     FROM "time" t
     WHERE LOWER(t.eventoId) = LOWER(@eventoId)
       AND EXISTS (
         SELECT 1 FROM "crianca" c
         WHERE LOWER(c.eventoId) = LOWER(@eventoId)
           AND LOWER(c.timeId) = LOWER(t.timeId)
       )
     ORDER BY t.nome`,
    { eventoId, partidaId: session.id, roundNumber: session.numeroRonda }
  );

  return teams.map(team => ({
    teamId: team.timeId,
    teamName: team.nome,
    teamColor: team.cor,
    scanned: Number(team.scanned || 0),
    total: Number(team.total || 0),
    complete: Number(team.total || 0) > 0 && Number(team.scanned || 0) >= Number(team.total || 0),
  }));
}

async function processTreasureScan({ eventoId, checkpointId, crianca, brincadeiraId, uid, now }) {
  const session = await getActiveSession(eventoId);
  if (!session) return null;

  const treasureCheckpointIds = await getTreasureCheckpointIds(eventoId, brincadeiraId);
  if (!treasureCheckpointIds.length) {
    return {
      handled: true,
      accepted: false,
      error: 'Nenhum checkpoint configurado para o Caça ao Tesouro está online',
      message: 'Nenhum checkpoint configurado para o Caça ao Tesouro está online',
    };
  }

  const checkpointStatus = await queryOne(
    `SELECT status, proposito FROM "pontoVerificacao"
     WHERE LOWER(checkpointId) = LOWER(@checkpointId)
       AND LOWER(eventoId) = LOWER(@eventoId)`,
    { checkpointId, eventoId }
  );
  if (String(checkpointStatus?.proposito || 'game').trim().toLowerCase() === 'reception'
      || !checkpointStatus
      || String(checkpointStatus.status || '').trim().toLowerCase() !== 'online') {
    return {
      handled: true,
      accepted: false,
      error: 'Este checkpoint está offline e não pode ser usado no Caça ao Tesouro',
      message: 'Este checkpoint está offline e não pode ser usado no Caça ao Tesouro',
    };
  }

  if (!crianca.timeId) {
    return { handled: true, accepted: false, error: 'Criança não pertence a uma equipe' };
  }

  const turnTeamId = session.timeVezId || session.timeInicialId;
  const turnTeam = turnTeamId
    ? await queryOne('SELECT nome FROM "time" WHERE timeId = @timeId', { timeId: turnTeamId })
    : null;

  if (turnTeamId && !sameId(turnTeamId, crianca.timeId)) {
    return {
      handled: true,
      accepted: false,
      error: `Agora é a vez da equipe ${turnTeam?.name || 'da vez'}`,
      turnTeamId,
    };
  }

  const turnAvailableAt = session.vezDisponvelEm ? new Date(session.vezDisponvelEm) : null;
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

  if (!sameId(session.checkpointAlvoId, checkpointId)) {
    return {
      handled: true,
      accepted: false,
      error: 'Este checkpoint não é o alvo atual do Caça ao Tesouro',
      targetCheckpointId: session.checkpointAlvoId,
    };
  }

  if (!crianca.timeId) {
    return { handled: true, accepted: false, error: 'Criança não pertence a uma equipe' };
  }

  const members = await allQuery(
    `SELECT criancaId FROM "crianca"
     WHERE LOWER(eventoId) = LOWER(@eventoId) AND LOWER(timeId) = LOWER(@timeId)`,
    { eventoId, timeId: crianca.timeId }
  );
  if (!members.length) {
    return { handled: true, accepted: false, error: 'Equipe sem participantes cadastrados' };
  }

  const alreadyScanned = await queryOne(
    `SELECT scanId FROM cacaTesourScan
     WHERE LOWER(partidaId) = LOWER(@partidaId)
       AND numeroRonda = @roundNumber
       AND LOWER(criancaId) = LOWER(@criancaId)`,
    { partidaId: session.id, roundNumber: session.numeroRonda, criancaId: crianca.criancaId }
  );
  if (alreadyScanned) {
    const duplicateCount = await queryOne(
      `SELECT COUNT(*) AS total FROM cacaTesourScan
       WHERE LOWER(partidaId) = LOWER(@partidaId)
         AND numeroRonda = @roundNumber
         AND LOWER(timeId) = LOWER(@timeId)`,
      { partidaId: session.id, roundNumber: session.numeroRonda, timeId: crianca.timeId }
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
      `INSERT INTO cacaTesourScan
        (scanId, partidaId, eventoId, brincadeiraId, numeroRonda, checkpointId,
         criancaId, timeId, uid, leroEm)
       VALUES (@id, @partidaId, @eventoId, @brincadeiraId, @roundNumber, @checkpointId,
         @criancaId, @timeId, @uid, @scannedAt)`,
      {
        id: uuidv4(),
        partidaId: session.id,
        eventoId,
        brincadeiraId,
        roundNumber: session.numeroRonda,
        checkpointId,
        criancaId: crianca.criancaId,
        timeId: crianca.timeId,
        uid,
        scannedAt: now,
      }
    );
  } catch (error) {
    // A restrição única também protege duas leituras simultâneas da mesma criança.
    if (String(error.message || '').toLowerCase().includes('unique')) {
      const duplicateCount = await queryOne(
        `SELECT COUNT(*) AS total FROM cacaTesourScan
         WHERE LOWER(partidaId) = LOWER(@partidaId)
           AND numeroRonda = @roundNumber
           AND LOWER(timeId) = LOWER(@timeId)`,
        { partidaId: session.id, roundNumber: session.numeroRonda, timeId: crianca.timeId }
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
    `SELECT COUNT(*) AS total FROM cacaTesourScan
     WHERE LOWER(partidaId) = LOWER(@partidaId)
       AND numeroRonda = @roundNumber
       AND LOWER(timeId) = LOWER(@timeId)`,
    { partidaId: session.id, roundNumber: session.numeroRonda, timeId: crianca.timeId }
  );
  const scanned = Number(countResult?.total || 0);

  if (scanned < members.length) {
    return {
      handled: true,
      accepted: true,
      teamComplete: false,
      roundNumber: session.numeroRonda,
      scanned,
      total: members.length,
      message: `Participante confirmado: ${scanned}/${members.length}`,
    };
  }

  // O alvo foi concluído por todos os participantes da equipe.
  // A lista abaixo é apenas o histórico de etapas; ela não limita mais os
  // checkpoints disponíveis, pois uma equipe pode precisar reconquistar um
  // checkpoint que está com a cor adversária.
  const completedCheckpointIds = parseJson(session.checkpointsCompletadosIds, []);
  const updatedCompleted = [...new Set([...completedCheckpointIds, String(checkpointId)])];
  const team = await queryOne(
    'SELECT timeId, nome, cor FROM "time" WHERE timeId = @timeId',
    { timeId: crianca.timeId }
  );

  // Primeiro registra o novo dono. A vitória é definida pelo estado atual de
  // TODOS os checkpoints do evento, e não pela quantidade de etapas visitadas.
  await query(
    `UPDATE pontoVerificacao SET territorioDonoTimeId = @timeId,
       territorioTravadoAte = NULL, territorioCooldownAte = NULL, ultimoConquistadoEm = @now
     WHERE LOWER(checkpointId) = LOWER(@checkpointId)
       AND LOWER(eventoId) = LOWER(@eventoId)
       AND LOWER(COALESCE(proposito, 'game')) <> 'reception'`,
    { timeId: crianca.timeId, now, checkpointId, eventoId }
  );

  const ownership = await getTeamOwnershipProgress(eventoId, crianca.timeId, treasureCheckpointIds);
  if (ownership.won) {
    await completeTeamRace(session.id, crianca.timeId, now);
  }

  const raceTimes = await getTeamRaceTimes(eventoId, session);
  const raceFinished = raceTimes.length >= 2 && raceTimes.every(teamRace => teamRace.completed);
  const winningTeam = raceFinished ? getFastestCompletedTeam(raceTimes) : null;
  const currentTeamRace = raceTimes.find(
    teamRace => sameId(teamRace.teamId, crianca.timeId)
  ) || null;

  // A equipe atual continua jogando até dominar todos os checkpoints.
  // Quando termina, a vez passa circularmente para a próxima equipe ainda
  // não concluída, sem voltar para equipes que já terminaram.
  const nextTurnTeam = raceFinished
    ? null
    : ownership.won
      ? getNextUnfinishedTeam(raceTimes, turnTeamId)
      : currentTeamRace;
  const switchingTeam = Boolean(ownership.won && nextTurnTeam);
  const visibleCompletedCheckpointIds = switchingTeam ? [] : updatedCompleted;
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
      ? await getNextTargetCheckpointId(eventoId, nextTurnTeam.teamId, checkpointId, treasureCheckpointIds)
      : null;

  // Ao trocar de equipe, o mapa começa uma nova busca: os domínios da
  // equipe anterior deixam de ser exibidos e podem ser conquistados novamente.
  // O histórico em caca_tesouro_scans continua preservado.
  let checkpointOwnership;
  if (switchingTeam) {
    await query(
      `UPDATE pontoVerificacao SET
         territorioDonoTimeId = NULL,
         territorioTravadoAte = NULL,
         territorioCooldownAte = NULL
       WHERE LOWER(eventoId) = LOWER(@eventoId)
         AND LOWER(COALESCE(proposito, 'game')) <> 'reception'`,
      { eventoId }
    );

    checkpointOwnership = (await getEventCheckpoints(eventoId))
      .filter(checkpoint => treasureCheckpointIds.some(id => sameId(id, checkpoint.checkpointId)))
      .map(checkpoint => ({
        checkpointId: String(checkpoint.checkpointId),
        teamId: null,
      }));
  }

  let advanceResult;
  if (raceFinished) {
    advanceResult = await query(
      `UPDATE cacaTesourPartida SET status = 'completed',
         checkpointAlvoId = NULL,
         timeVezId = NULL,
         vezDisponvelEm = NULL,
         checkpointsCompletadosIds = @completedCheckpointIds,
         finalizadoEm = @finishedAt
       WHERE partidaId = @partidaId AND status = 'active' AND numeroRonda = @roundNumber`,
      {
        partidaId: session.id,
        roundNumber: session.numeroRonda,
        completedCheckpointIds: JSON.stringify(visibleCompletedCheckpointIds),
        finishedAt: now,
      }
    );
  } else {
    advanceResult = await query(
      `UPDATE cacaTesourPartida SET numeroRonda = numeroRonda + 1,
         timeVezId = @turnTeamId,
         vezDisponvelEm = @turnAvailableAt,
         checkpointAlvoId = @targetCheckpointId,
         checkpointsCompletadosIds = @completedCheckpointIds,
         rondaIniciadaEm = @roundStartedAt
       WHERE partidaId = @partidaId AND status = 'active' AND numeroRonda = @roundNumber`,
      {
        partidaId: session.id,
        roundNumber: session.numeroRonda,
        turnTeamId: nextTurnTeam.teamId,
        turnAvailableAt: nextTurnAvailableAt,
        targetCheckpointId: nextTargetCheckpointId,
        completedCheckpointIds: JSON.stringify(visibleCompletedCheckpointIds),
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

  // Caça ao Tesouro não pontua durante a partida: a equipe mais rápida leva o
  // bônus de vitória (para cada membro) quando a corrida termina.
  let winnerBonus = null;
  if (raceFinished && winningTeam) {
    winnerBonus = await awardWinnerBonus({
      eventoId,
      partidaId: session.id,
      gameType: TREASURE_GAME_TYPE,
      teamId: winningTeam.teamId,
    });
  }

  // Quando a corrida termina, o evento continua ativo (o status é só o ciclo de
  // vida do evento); o estado do jogo é encerrado por global.finishTreasureGameState.

  return {
    handled: true,
    accepted: true,
    teamComplete: true,
    roundComplete: true,
    roundNumber: raceFinished ? session.numeroRonda : session.numeroRonda + 1,
    finished: raceFinished,
    scanned,
    total: members.length,
    teamId: crianca.timeId,
    teamName: team?.nome || 'Equipe',
    teamColor: team?.cor || '#00AA00',
    teamCompletedAllCheckpoints: ownership.won,
    winningTeamId: winningTeam?.teamId || null,
    winningTeamName: winningTeam?.teamName || null,
    winnerBonus,
    ownedCheckpoints: switchingTeam ? 0 : ownership.owned,
    totalCheckpoints: ownership.total,
    turnTeamId: raceFinished ? null : nextTurnTeam?.teamId || null,
    turnTeamName: raceFinished ? null : nextTurnTeam?.teamName || null,
    turnAvailableAt: nextTurnAvailableAt ? nextTurnAvailableAt.toISOString() : null,
    turnWaitSeconds: switchingTeam ? TREASURE_TURN_DELAY_MS / 1000 : 0,
    teamRaceTimes: raceTimes,
    checkpointOwnership,
    nextTargetCheckpointId,
    completedCheckpointIds: visibleCompletedCheckpointIds,
    message: raceFinished
      ? `🏆 Caça ao Tesouro concluído! A equipe ${winningTeam?.teamName || 'vencedora'} foi mais rápida, com ${winningTeam?.elapsedMinutes ?? 0} minutos.`
      : ownership.won
        ? `✅ A equipe ${team?.nome || ''} acendeu todos os checkpoints. Aguarde 10 segundos para a próxima equipe começar.`
        : `Etapa concluída pela equipe ${team?.nome || ''}. Próximo checkpoint da mesma equipe será liberado.`,
  };
}

// Depois de trocar a lista de checkpoints do jogo com a partida em andamento: se o alvo atual
// deixou de fazer parte da lista, sorteia outro alvo para a equipe da vez.
async function refreshTreasureTargetAfterListChange(eventoId) {
  const session = await getActiveSession(eventoId);
  if (!session) return null;

  const ids = await getTreasureCheckpointIds(eventoId, session.brincadeiraId);
  if (!ids.length) return null;
  if (session.checkpointAlvoId && ids.some(id => sameId(id, session.checkpointAlvoId))) {
    return { changed: false, targetCheckpointId: String(session.checkpointAlvoId) };
  }

  const targetCheckpointId = await getNextTargetCheckpointId(
    eventoId,
    session.timeVezId || session.timeInicialId,
    null,
    ids
  );
  if (!targetCheckpointId) return null;

  await query(
    `UPDATE cacaTesourPartida SET checkpointAlvoId = @targetCheckpointId
     WHERE partidaId = @partidaId AND status = 'active'`,
    { targetCheckpointId, partidaId: session.partidaId }
  );
  return { changed: true, targetCheckpointId };
}

module.exports = {
  refreshTreasureTargetAfterListChange,
  TREASURE_GAME_TYPE,
  getGameForEvent,
  getActiveSession,
  startTreasureGame,
  stopTreasureGame,
  awardTreasureBonusOnStop,
  getCheckpointTreasureStatus,
  getTreasureEventStatus,
  processTreasureScan,
};
