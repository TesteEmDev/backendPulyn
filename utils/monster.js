const { v4: uuidv4 } = require('uuid');
const { query, queryOne, allQuery, withTransaction } = require('../database');

const MONSTER_GAME_TYPE = 'monster_hunt';
const MONSTER_DEFAULTS = Object.freeze({
  maxHp: 500,
  normalDamage: 10,
  specialCheckpointDamage: 30,
  specialAttackDamage: 50,
});

function sameId(left, right) {
  return left !== null && left !== undefined && right !== null && right !== undefined
    && String(left).trim().toLowerCase() === String(right).trim().toLowerCase();
}

function parseJson(value, fallback = []) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

async function getCheckpointCooldownSeconds(brincadeiraId, checkpointId) {
  if (!brincadeiraId) return 15;

  const game = await queryOne(
    'SELECT checkpoints FROM brincadeiras WHERE LOWER(id) = LOWER(@brincadeiraId)',
    { brincadeiraId }
  );
  const configuredCheckpoint = parseJson(game?.checkpoints, []).find((item) =>
    item && typeof item === 'object' && sameId(item.id, checkpointId)
  );
  const configuredCooldown = Number(configuredCheckpoint?.cooldown);

  if (!Number.isInteger(configuredCooldown) || configuredCooldown < 1) return 15;
  return Math.min(configuredCooldown, 120);
}

function isUniqueError(error) {
  return /unique|duplicate|constraint/i.test(String(error?.message || ''));
}

function monsterConflict() {
  const error = new Error('A partida do monstro foi atualizada por outra leitura');
  error.code = 'MONSTER_VERSION_CONFLICT';
  return error;
}

async function getGameForEvent(eventoId, brincadeiraId) {
  return queryOne(`
    SELECT b.id, b.name, b.type, b.checkpoints, b.evento_id, b.empresa_id, e.empresa_id AS evento_empresa_id
    FROM brincadeiras b
    INNER JOIN eventos e ON LOWER(e.id) = LOWER(@eventoId)
    WHERE LOWER(b.id) = LOWER(@brincadeiraId)
      AND LOWER(COALESCE(b.status, 'active')) <> 'archived'
      AND LOWER(b.empresa_id) = LOWER(e.empresa_id)
      AND (LOWER(b.evento_id) = LOWER(@eventoId) OR EXISTS (
        SELECT 1 FROM evento_brincadeiras eb
        WHERE LOWER(eb.brincadeira_id) = LOWER(b.id) AND LOWER(eb.evento_id) = LOWER(@eventoId)
      ))`, { brincadeiraId, eventoId });
}

async function getActiveMonsterGame(eventoId) {
  return queryOne(`
    SELECT TOP 1 * FROM monster_hunt_partidas
    WHERE LOWER(evento_id) = LOWER(@eventoId) AND status = 'active'
    ORDER BY started_at DESC`, { eventoId });
}

async function getLatestMonsterGame(eventoId) {
  return queryOne(`
    SELECT TOP 1 * FROM monster_hunt_partidas
    WHERE LOWER(evento_id) = LOWER(@eventoId)
    ORDER BY started_at DESC`, { eventoId });
}

async function getMonsterCheckpoints(eventoId) {
  return allQuery(`
    SELECT id, empresa_id, status FROM checkpoints
    WHERE LOWER(evento_id) = LOWER(@eventoId)
      AND LOWER(COALESCE(checkpoint_purpose, 'game')) <> 'reception'`, { eventoId });
}

async function getMonsterProgress(eventoId, partidaId) {
  const teams = await allQuery(`
    SELECT t.id, t.name, t.color,
      COALESCE(ms.id, '') AS monster_state_id,
      COALESCE(ms.hp, p.hp) AS monster_hp,
      COALESCE(ms.max_hp, p.max_hp) AS monster_max_hp,
      COALESCE(ms.status, CASE WHEN p.status = 'completed' THEN 'defeated' ELSE p.status END) AS monster_status,
      COALESCE(ms.version, p.version) AS monster_version,
      (SELECT COUNT(*) FROM criancas c
       WHERE LOWER(c.evento_id) = LOWER(@eventoId) AND LOWER(c.time_id) = LOWER(t.id)) AS total,
      (SELECT COUNT(DISTINCT s.crianca_id) FROM monster_hunt_scans s
       WHERE LOWER(s.partida_id) = LOWER(@partidaId) AND LOWER(s.time_id) = LOWER(t.id)) AS scanned
    FROM times t
    INNER JOIN monster_hunt_partidas p
      ON p.id = @partidaId AND LOWER(p.evento_id) = LOWER(@eventoId)
    LEFT JOIN monster_hunt_team_states ms
      ON LOWER(ms.partida_id) = LOWER(p.id) AND LOWER(ms.time_id) = LOWER(t.id)
    WHERE LOWER(t.evento_id) = LOWER(@eventoId)
      AND EXISTS (SELECT 1 FROM criancas c
                  WHERE LOWER(c.evento_id) = LOWER(@eventoId)
                    AND LOWER(c.time_id) = LOWER(t.id))
    ORDER BY t.name`, { eventoId, partidaId });

  return teams.map(team => ({
    teamId: team.id,
    teamName: team.name,
    teamColor: team.color,
    teamStateId: team.monster_state_id || null,
    monsterHp: Number(team.monster_hp || 0),
    monsterMaxHp: Number(team.monster_max_hp || MONSTER_DEFAULTS.maxHp),
    monsterDefeated: String(team.monster_status || '').toLowerCase() === 'defeated',
    victory: String(team.monster_status || '').toLowerCase() === 'defeated',
    monsterStatus: team.monster_status || 'active',
    version: Number(team.monster_version || 0),
    scanned: Number(team.scanned || 0),
    total: Number(team.total || 0),
    complete: Number(team.total || 0) > 0 && Number(team.scanned || 0) >= Number(team.total || 0),
  }));
}

async function startMonsterGame(eventoId, brincadeiraId) {
  const game = await getGameForEvent(eventoId, brincadeiraId);
  if (!game || game.type !== MONSTER_GAME_TYPE) {
    throw new Error('Jogo Caça ao Monstro não encontrado para este evento');
  }
  const checkpoints = await getMonsterCheckpoints(eventoId);
  if (!checkpoints.length) throw new Error('O Caça ao Monstro precisa de pelo menos um checkpoint');

  const configuredItems = parseJson(game.checkpoints, []);
  const configured = configuredItems
    .map(item => String(item?.id || item || ''))
    .filter(Boolean);
  const configuredSet = new Set(configured.map(id => id.toLowerCase()));
  const candidates = configured.length
    ? checkpoints.filter(checkpoint => configuredSet.has(String(checkpoint.id).toLowerCase()))
    : checkpoints;
  const explicitlySpecial = configuredItems.find(item => item && typeof item === 'object' && item.special);
  const explicitlySpecialId = explicitlySpecial?.id ? String(explicitlySpecial.id).trim().toLowerCase() : '';
  const specialCheckpoint = explicitlySpecialId
    ? candidates.find(checkpoint => String(checkpoint.id).trim().toLowerCase() === explicitlySpecialId) || candidates[0]
    : candidates[Math.floor(Math.random() * candidates.length)] || checkpoints[0];
  const participatingTeams = await allQuery(`
    SELECT t.id, t.name, t.color
    FROM times t
    WHERE LOWER(t.evento_id) = LOWER(@eventoId)
      AND EXISTS (
        SELECT 1 FROM criancas c
        WHERE LOWER(c.evento_id) = LOWER(@eventoId)
          AND LOWER(c.time_id) = LOWER(t.id)
      )
    ORDER BY t.name`, { eventoId });
  if (!participatingTeams.length) {
    throw new Error('O Caça ao Monstro precisa de pelo menos uma equipe com participantes');
  }
  const now = new Date();
  const partidaId = uuidv4();

  // O update do evento funciona como lock de linha nos dois bancos. Assim,
  // dois Game Masters não conseguem criar partidas ativas simultaneamente e
  // a partida só fica visível depois que todos os monstros foram criados.
  await withTransaction(async (tx) => {
    await tx.query(
      `UPDATE eventos SET status = status
       WHERE LOWER(id) = LOWER(@eventoId)
         AND LOWER(empresa_id) = LOWER(@empresaId)`,
      { eventoId, empresaId: game.empresa_id }
    );

    await tx.query(`
      UPDATE monster_hunt_team_states
      SET status = 'finished', version = version + 1
      WHERE LOWER(evento_id) = LOWER(@eventoId) AND status = 'active'`, { eventoId });
    await tx.query(`
      UPDATE monster_hunt_partidas
      SET status = 'finished', finished_at = GETDATE(), version = version + 1
      WHERE LOWER(evento_id) = LOWER(@eventoId) AND status = 'active'`, { eventoId });

    await tx.query(`
      INSERT INTO monster_hunt_partidas
        (id, empresa_id, evento_id, brincadeira_id, status, hp, max_hp,
         normal_damage, special_checkpoint_damage, special_attack_damage,
         special_checkpoint_id, version, started_at)
      VALUES (@id, @empresaId, @eventoId, @brincadeiraId, 'active', @maxHp, @maxHp,
         @normalDamage, @specialCheckpointDamage, @specialAttackDamage,
         @specialCheckpointId, 0, @startedAt)`, {
      id: partidaId,
      empresaId: game.empresa_id,
      eventoId,
      brincadeiraId,
      maxHp: MONSTER_DEFAULTS.maxHp,
      normalDamage: MONSTER_DEFAULTS.normalDamage,
      specialCheckpointDamage: MONSTER_DEFAULTS.specialCheckpointDamage,
      specialAttackDamage: MONSTER_DEFAULTS.specialAttackDamage,
      specialCheckpointId: specialCheckpoint.id,
      startedAt: now,
    });

    for (const team of participatingTeams) {
      await tx.query(`
        INSERT INTO monster_hunt_team_states
          (id, partida_id, empresa_id, evento_id, time_id, hp, max_hp, status, version)
        VALUES (@id, @partidaId, @empresaId, @eventoId, @timeId, @maxHp, @maxHp, 'active', 0)`, {
        id: uuidv4(),
        partidaId,
        empresaId: game.empresa_id,
        eventoId,
        timeId: team.id,
        maxHp: MONSTER_DEFAULTS.maxHp,
      });
    }
  });

  const monsters = await getMonsterProgress(eventoId, partidaId);
  const totalHp = monsters.reduce((sum, monster) => sum + monster.monsterHp, 0);
  const totalMaxHp = monsters.reduce((sum, monster) => sum + monster.monsterMaxHp, 0);
  return {
    id: partidaId,
    eventoId,
    brincadeiraId,
    gameType: MONSTER_GAME_TYPE,
    monsterHp: totalHp,
    monsterMaxHp: totalMaxHp,
    monsterSpecialCheckpoint: String(specialCheckpoint.id),
    monsters,
    progress: monsters,
    startedAt: now.toISOString(),
    status: 'active',
  };
}

async function stopMonsterGame(eventoId) {
  await query(`
    UPDATE monster_hunt_team_states
    SET status = 'finished', version = version + 1
    WHERE LOWER(evento_id) = LOWER(@eventoId) AND status = 'active'`, { eventoId });
  await query(`
    UPDATE monster_hunt_partidas
    SET status = 'finished', finished_at = GETDATE(), version = version + 1
    WHERE LOWER(evento_id) = LOWER(@eventoId) AND status = 'active'`, { eventoId });
}
function getMonsterTotals(progress) {
  return {
    monsterHp: progress.reduce((sum, monster) => sum + Number(monster.monsterHp || 0), 0),
    monsterMaxHp: progress.reduce((sum, monster) => sum + Number(monster.monsterMaxHp || 0), 0),
    monsterDefeated: progress.length > 0 && progress.every(monster => monster.monsterDefeated),
  };
}

async function getCheckpointMonsterStatus(checkpointId) {
  const checkpoint = await queryOne(`
    SELECT id, evento_id, checkpoint_purpose FROM checkpoints WHERE LOWER(id) = LOWER(@checkpointId)`, { checkpointId });
  if (!checkpoint || String(checkpoint.checkpoint_purpose || 'game').toLowerCase() === 'reception') {
    return { monsterActive: false };
  }
  const status = await getMonsterEventStatus(checkpoint.evento_id);
  return {
    // Só anuncia o tipo de jogo quando o Caça ao Monstro está realmente ativo.
    // Caso contrário este campo sobrescreve o gameType de outras brincadeiras
    // (por exemplo o Caça ao Tesouro) na resposta consumida pelo ESP32.
    gameType: status.active ? MONSTER_GAME_TYPE : 'none',
    monsterActive: Boolean(status.active),
    monsterHp: status.monsterHp,
    monsterMaxHp: status.monsterMaxHp,
    monsterDefeated: status.monsterDefeated,
    monsters: status.monsters,
  };
}

async function getMonsterEventStatus(eventoId) {
  let session = await getActiveMonsterGame(eventoId);
  const active = Boolean(session);
  if (!session) session = await getLatestMonsterGame(eventoId);
  if (!session) return { active: false, gameType: 'none', monsterActive: false };

  const monsters = await getMonsterProgress(eventoId, session.id);
  const totals = getMonsterTotals(monsters);
  const legacyWinner = session.winner_time_id
    ? await queryOne('SELECT id, name, color FROM times WHERE id = @timeId', { timeId: session.winner_time_id })
    : null;
  const completed = session.status === 'completed' || (!active && totals.monsterDefeated);
  return {
    active,
    completed,
    gameCompleted: completed,
    monsterActive: active,
    gameType: MONSTER_GAME_TYPE,
    partidaId: session.id,
    ...totals,
    monsters,
    progress: monsters,
    teamsProgress: monsters,
    winnerTeamId: legacyWinner?.id || null,
    winnerTeamName: legacyWinner?.name || null,
    winnerTeamColor: legacyWinner?.color || null,
    monsterSpecialCheckpoint: session.special_checkpoint_id || null,
    monsterSpecialCheckpointId: session.special_checkpoint_id || null,
    version: Number(session.version || 0),
    startedAt: session.started_at,
    finishedAt: session.finished_at,
  };
}

async function getMonsterScanResult(session, scan, progress, currentTeam) {
  const teamMonsterHp = Number(currentTeam?.monsterHp ?? scan?.monster_hp_after ?? session.hp);
  const teamMonsterMaxHp = Number(currentTeam?.monsterMaxHp ?? session.max_hp);
  const teamMonsterDefeated = Boolean(currentTeam?.monsterDefeated ?? scan?.monster_defeated);
  return {
    handled: true,
    accepted: false,
    alreadyScanned: true,
    monsterAccepted: false,
    attackType: scan?.attack_type || null,
    damage: Number(scan?.damage || 0),
    monsterHp: teamMonsterHp,
    monsterMaxHp: teamMonsterMaxHp,
    monsterDefeated: teamMonsterDefeated,
    teamMonsterHp,
    teamMonsterMaxHp,
    teamMonsterDefeated,
    teamVictory: teamMonsterDefeated,
    gameCompleted: progress.length > 0 && progress.every(monster => monster.monsterDefeated),
    monsters: progress,
    progress,
    teamsProgress: progress,
    teamId: currentTeam?.teamId || null,
    teamName: currentTeam?.teamName || null,
    teamColor: currentTeam?.teamColor || '',
    message: 'Esta criança já atacou o monstro nesta partida',
  };
}

async function processMonsterScan({ eventoId, checkpointId, crianca, brincadeiraId, uid, leituraId, now }) {
  const session = await getActiveMonsterGame(eventoId);
  if (!session) return null;
  if (String(session.empresa_id).toLowerCase() !== String(crianca.empresa_id).toLowerCase()) {
    return { handled: true, accepted: false, error: 'Partida do monstro não pertence à empresa da criança' };
  }
  if (!crianca.time_id) return { handled: true, accepted: false, error: 'Criança não pertence a uma equipe' };

  const team = await queryOne(
    'SELECT id, name, color FROM times WHERE id = @timeId AND evento_id = @eventoId',
    { timeId: crianca.time_id, eventoId }
  );
  if (!team) return { handled: true, accepted: false, error: 'Equipe não pertence ao evento' };

  const progressBefore = await getMonsterProgress(eventoId, session.id);
  const currentBefore = progressBefore.find(item => sameId(item.teamId, crianca.time_id));
  if (!currentBefore) {
    return { handled: true, accepted: false, error: 'Equipe sem monstro nesta partida' };
  }
  if (currentBefore.monsterDefeated) {
    return {
      handled: true,
      accepted: false,
      monsterAccepted: false,
      monsterHp: currentBefore.monsterHp,
      monsterMaxHp: currentBefore.monsterMaxHp,
      monsterDefeated: true,
      teamMonsterHp: currentBefore.monsterHp,
      teamMonsterMaxHp: currentBefore.monsterMaxHp,
      teamMonsterDefeated: true,
      teamVictory: true,
      monsters: progressBefore,
      progress: progressBefore,
      teamsProgress: progressBefore,
      teamId: team.id,
      teamName: team.name,
      teamColor: team.color || '',
      message: `O monstro da equipe ${team.name} já foi derrotado`,
    };
  }

  const lastCheckpointScan = await queryOne(`
    SELECT TOP 1 scanned_at
    FROM monster_hunt_scans
    WHERE LOWER(partida_id) = LOWER(@partidaId)
      AND LOWER(checkpoint_id) = LOWER(@checkpointId)
      AND LOWER(time_id) = LOWER(@timeId)
    ORDER BY scanned_at DESC`, {
    partidaId: session.id,
    checkpointId,
    timeId: crianca.time_id,
  });
  const checkpointCooldownSeconds = await getCheckpointCooldownSeconds(
    session.brincadeira_id || brincadeiraId,
    checkpointId
  );
  const lastScanAt = lastCheckpointScan?.scanned_at ? new Date(lastCheckpointScan.scanned_at).getTime() : 0;
  const remainingSeconds = lastScanAt
    ? Math.max(0, checkpointCooldownSeconds - Math.floor((Date.now() - lastScanAt) / 1000))
    : 0;

  if (remainingSeconds > 0) {
    return {
      handled: true,
      accepted: false,
      alreadyScanned: false,
      checkpointLocked: true,
      remainingSeconds,
      checkpointCooldownSeconds,
      monsterAccepted: false,
      damage: 0,
      monsterHp: currentBefore.monsterHp,
      monsterMaxHp: currentBefore.monsterMaxHp,
      monsterDefeated: currentBefore.monsterDefeated,
      teamMonsterHp: currentBefore.monsterHp,
      teamMonsterMaxHp: currentBefore.monsterMaxHp,
      teamMonsterDefeated: currentBefore.monsterDefeated,
      progress: progressBefore,
      monsters: progressBefore,
      teamsProgress: progressBefore,
      teamId: team.id,
      teamName: team.name,
      teamColor: team.color || '',
      message: `Checkpoint bloqueado. Aguarde ${remainingSeconds}s`,
    };
  }

  const childTeamScan = await queryOne(`
    SELECT TOP 1 id
    FROM monster_hunt_scans
    WHERE LOWER(partida_id) = LOWER(@partidaId)
      AND LOWER(crianca_id) = LOWER(@criancaId)`, {
    partidaId: session.id,
    criancaId: crianca.id,
  });
  const childAlreadyAttacked = Boolean(childTeamScan);
  const members = await allQuery(`
    SELECT id FROM criancas
    WHERE LOWER(evento_id) = LOWER(@eventoId) AND LOWER(time_id) = LOWER(@timeId)`, {
    eventoId,
    timeId: crianca.time_id,
  });
  const teamScannedBefore = Number(currentBefore.scanned || 0);
  const isSpecialAttack = !childAlreadyAttacked
    && teamScannedBefore + 1 >= members.length
    && members.length > 0;
  const isSpecialCheckpoint = sameId(session.special_checkpoint_id, checkpointId);
  const attackType = isSpecialAttack ? 'special_attack' : isSpecialCheckpoint ? 'special_checkpoint' : 'normal';
  const damage = isSpecialAttack
    ? Number(session.special_attack_damage)
    : isSpecialCheckpoint ? Number(session.special_checkpoint_damage) : Number(session.normal_damage);
  const monsterHp = Math.max(0, Number(currentBefore.monsterHp) - damage);
  const monsterDefeated = monsterHp <= 0;
  const nextVersion = Number(currentBefore.version || 0) + 1;

  try {
    await query(`
      INSERT INTO monster_hunt_scans
        (id, partida_id, empresa_id, evento_id, brincadeira_id, checkpoint_id,
         crianca_id, time_id, uid, leitura_id, attack_type, damage,
         monster_hp_after, monster_defeated, version, scanned_at)
      VALUES (@id, @partidaId, @empresaId, @eventoId, @brincadeiraId, @checkpointId,
         @criancaId, @timeId, @uid, @leituraId, @attackType, @damage,
         @monsterHp, @monsterDefeated, @version, @scannedAt)`, {
      id: uuidv4(),
      partidaId: session.id,
      empresaId: session.empresa_id,
      eventoId,
      brincadeiraId,
      checkpointId,
      criancaId: crianca.id,
      timeId: crianca.time_id,
      uid,
      leituraId,
      attackType,
      damage,
      monsterHp,
      monsterDefeated,
      version: nextVersion,
      scannedAt: now,
    });

    let update;
    if (currentBefore.teamStateId) {
      update = await query(`
        UPDATE monster_hunt_team_states SET
          hp = @monsterHp,
          status = @status,
          defeated_at = CASE WHEN @monsterDefeated THEN @finishedAt ELSE defeated_at END,
          victory_at = CASE WHEN @monsterDefeated THEN @finishedAt ELSE victory_at END,
          version = @nextVersion
        WHERE id = @teamStateId
          AND status = 'active'
          AND version = @version`, {
        monsterHp,
        status: monsterDefeated ? 'defeated' : 'active',
        finishedAt: monsterDefeated ? now : null,
        monsterDefeated,
        nextVersion,
        teamStateId: currentBefore.teamStateId,
        version: Number(currentBefore.version || 0),
      });
    } else {
      // Compatibilidade com partidas antigas iniciadas antes da migração por equipe.
      update = await query(`
        UPDATE monster_hunt_partidas SET
          hp = @monsterHp,
          status = @status,
          winner_time_id = @winnerTimeId,
          finished_at = CASE WHEN @monsterDefeated THEN @finishedAt ELSE finished_at END,
          version = @nextVersion
        WHERE id = @partidaId AND status = 'active' AND version = @version`, {
        monsterHp,
        status: monsterDefeated ? 'completed' : 'active',
        winnerTimeId: monsterDefeated ? crianca.time_id : null,
        finishedAt: monsterDefeated ? now : null,
        monsterDefeated,
        nextVersion,
        partidaId: session.id,
        version: Number(session.version || 0),
      });
    }
    if (!(update.rowsAffected?.[0] || 0)) throw monsterConflict();
  } catch (error) {
    if (isUniqueError(error)) throw monsterConflict();
    throw error;
  }

  const progress = await getMonsterProgress(eventoId, session.id);
  let gameCompleted = currentBefore.teamStateId
    ? progress.length > 0 && progress.every(monster => monster.monsterDefeated)
    : monsterDefeated;

  if (currentBefore.teamStateId) {
    // A atualização da partida é serializada pela própria linha da partida.
    // Se duas equipes derrotarem seus monstros ao mesmo tempo, a segunda
    // transação reavalia os estados depois que a primeira confirmar.
    const completionUpdate = await query(`
      UPDATE monster_hunt_partidas SET
        status = 'completed', finished_at = @finishedAt, version = version + 1
      WHERE id = @partidaId
        AND status = 'active'
        AND EXISTS (
          SELECT 1 FROM monster_hunt_team_states
          WHERE partida_id = @partidaId
        )
        AND NOT EXISTS (
          SELECT 1 FROM monster_hunt_team_states
          WHERE partida_id = @partidaId AND status <> 'defeated'
        )`, {
      partidaId: session.id,
      finishedAt: now,
    });
    gameCompleted = gameCompleted || Boolean(completionUpdate.rowsAffected?.[0]);
  }

  if (gameCompleted) {
    await query(`
      UPDATE eventos SET status = 'scheduled'
      WHERE LOWER(id) = LOWER(@eventoId)
        AND LOWER(empresa_id) = LOWER(@empresaId)
        AND status = 'active'`, {
      eventoId,
      empresaId: session.empresa_id,
    });
  }

  const teamMonster = progress.find(item => sameId(item.teamId, team.id)) || currentBefore;
  return {
    handled: true,
    accepted: true,
    monsterAccepted: true,
    alreadyScanned: false,
    attackType,
    damage,
    monsterHp: teamMonster.monsterHp,
    monsterMaxHp: teamMonster.monsterMaxHp,
    monsterDefeated: teamMonster.monsterDefeated,
    teamMonsterHp: teamMonster.monsterHp,
    teamMonsterMaxHp: teamMonster.monsterMaxHp,
    teamMonsterDefeated: teamMonster.monsterDefeated,
    teamVictory: teamMonster.victory,
    gameCompleted,
    monsters: progress,
    progress,
    teamsProgress: progress,
    teamId: team.id,
    teamName: team.name,
    teamColor: team.color || '',
    checkpointLocked: false,
    remainingSeconds: 0,
    checkpointCooldownSeconds,
    message: gameCompleted
      ? 'Todos os monstros foram derrotados!'
      : monsterDefeated
        ? `O monstro da equipe ${team.name} foi derrotado!`
        : `Ataque confirmado: -${damage} HP`,
  };
}

module.exports = {
  MONSTER_GAME_TYPE,
  MONSTER_DEFAULTS,
  getActiveMonsterGame,
  getLatestMonsterGame,
  getCheckpointMonsterStatus,
  getMonsterEventStatus,
  startMonsterGame,
  stopMonsterGame,
  processMonsterScan,
};
