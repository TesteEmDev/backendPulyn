const { v4: uuidv4 } = require('uuid');
const { query, queryOne, allQuery } = require('../database');

const MONSTER_GAME_TYPE = 'monster_hunt';
const MONSTER_DEFAULTS = Object.freeze({
  maxHp: 100,
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
      (SELECT COUNT(*) FROM criancas c
       WHERE LOWER(c.evento_id) = LOWER(@eventoId) AND LOWER(c.time_id) = LOWER(t.id)) AS total,
      (SELECT COUNT(*) FROM monster_hunt_scans s
       WHERE LOWER(s.partida_id) = LOWER(@partidaId) AND LOWER(s.time_id) = LOWER(t.id)) AS scanned
    FROM times t
    WHERE LOWER(t.evento_id) = LOWER(@eventoId)
      AND EXISTS (SELECT 1 FROM criancas c
                  WHERE LOWER(c.evento_id) = LOWER(@eventoId)
                    AND LOWER(c.time_id) = LOWER(t.id))
    ORDER BY t.name`, { eventoId, partidaId });

  return teams.map(team => ({
    teamId: team.id,
    teamName: team.name,
    teamColor: team.color,
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
  await stopMonsterGame(eventoId);

  const now = new Date();
  const partidaId = uuidv4();
  await query(`
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

  return {
    id: partidaId,
    eventoId,
    brincadeiraId,
    gameType: MONSTER_GAME_TYPE,
    monsterHp: MONSTER_DEFAULTS.maxHp,
    monsterMaxHp: MONSTER_DEFAULTS.maxHp,
    monsterSpecialCheckpoint: String(specialCheckpoint.id),
    startedAt: now.toISOString(),
    status: 'active',
  };
}

async function stopMonsterGame(eventoId) {
  await query(`
    UPDATE monster_hunt_partidas
    SET status = 'finished', finished_at = GETDATE(), version = version + 1
    WHERE LOWER(evento_id) = LOWER(@eventoId) AND status = 'active'`, { eventoId });
}
async function getCheckpointMonsterStatus(checkpointId) {
  const checkpoint = await queryOne(`
    SELECT id, evento_id, checkpoint_purpose FROM checkpoints WHERE LOWER(id) = LOWER(@checkpointId)`, { checkpointId });
  if (!checkpoint || String(checkpoint.checkpoint_purpose || 'game').toLowerCase() === 'reception') {
    return { monsterActive: false, monsterSpecialCheckpoint: false };
  }
  const session = await getActiveMonsterGame(checkpoint.evento_id);
  if (!session) return { monsterActive: false, monsterSpecialCheckpoint: false };
  return {
    gameType: MONSTER_GAME_TYPE,
    monsterActive: true,
    monsterSpecialCheckpoint: sameId(session.special_checkpoint_id, checkpointId),
    monsterSpecialCheckpointId: session.special_checkpoint_id,
    monsterHp: Number(session.hp),
    monsterMaxHp: Number(session.max_hp),
    monsterDefeated: false,
  };
}

async function getMonsterEventStatus(eventoId) {
  let session = await getActiveMonsterGame(eventoId);
  let active = true;
  if (!session) {
    session = await getLatestMonsterGame(eventoId);
    active = false;
  }
  if (!session) return { active: false, gameType: 'none', monsterActive: false };

  const progress = await getMonsterProgress(eventoId, session.id);
  const winner = session.winner_time_id
    ? await queryOne('SELECT id, name, color FROM times WHERE id = @timeId', { timeId: session.winner_time_id })
    : null;
  return {
    active,
    monsterActive: active,
    gameType: MONSTER_GAME_TYPE,
    partidaId: session.id,
    monsterHp: Number(session.hp),
    monsterMaxHp: Number(session.max_hp),
    monsterDefeated: session.status === 'completed',
    monsterSpecialCheckpoint: session.special_checkpoint_id || null,
    monsterSpecialCheckpointId: session.special_checkpoint_id || null,
    winnerTeamId: winner?.id || null,
    winnerTeamName: winner?.name || null,
    winnerTeamColor: winner?.color || null,
    progress,
    teamsProgress: progress,
    version: Number(session.version || 0),
    startedAt: session.started_at,
    finishedAt: session.finished_at,
  };
}

async function getMonsterScanResult(session, scan, progress, currentTeam) {
  return {
    handled: true,
    accepted: false,
    alreadyScanned: true,
    monsterAccepted: false,
    attackType: scan?.attack_type || null,
    damage: Number(scan?.damage || 0),
    monsterHp: Number(session.hp),
    monsterMaxHp: Number(session.max_hp),
    monsterDefeated: session.status === 'completed',
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

  const team = await queryOne('SELECT id, name, color FROM times WHERE id = @timeId AND evento_id = @eventoId', {
    timeId: crianca.time_id, eventoId,
  });
  if (!team) return { handled: true, accepted: false, error: 'Equipe não pertence ao evento' };

  const existing = await queryOne(`
    SELECT id, attack_type, damage, monster_hp_after, monster_defeated
    FROM monster_hunt_scans
    WHERE LOWER(partida_id) = LOWER(@partidaId) AND LOWER(crianca_id) = LOWER(@criancaId)`, {
    partidaId: session.id, criancaId: crianca.id,
  });
  const progressBefore = await getMonsterProgress(eventoId, session.id);
  const currentBefore = progressBefore.find(item => sameId(item.teamId, crianca.time_id));
  if (existing) return getMonsterScanResult(session, existing, progressBefore, currentBefore);

  const members = await allQuery(`
    SELECT id FROM criancas
    WHERE LOWER(evento_id) = LOWER(@eventoId) AND LOWER(time_id) = LOWER(@timeId)`, {
    eventoId, timeId: crianca.time_id,
  });
  const teamScannedBefore = Number(currentBefore?.scanned || 0);
  const isSpecialAttack = teamScannedBefore + 1 >= members.length && members.length > 0;
  const isSpecialCheckpoint = sameId(session.special_checkpoint_id, checkpointId);
  const attackType = isSpecialAttack ? 'special_attack' : isSpecialCheckpoint ? 'special_checkpoint' : 'normal';
  const damage = isSpecialAttack
    ? Number(session.special_attack_damage)
    : isSpecialCheckpoint ? Number(session.special_checkpoint_damage) : Number(session.normal_damage);
  const monsterHp = Math.max(0, Number(session.hp) - damage);
  const monsterDefeated = monsterHp <= 0;
  const nextVersion = Number(session.version || 0) + 1;

  try {
    await query(`
      INSERT INTO monster_hunt_scans
        (id, partida_id, empresa_id, evento_id, brincadeira_id, checkpoint_id,
         crianca_id, time_id, uid, leitura_id, attack_type, damage,
         monster_hp_after, monster_defeated, version, scanned_at)
      VALUES (@id, @partidaId, @empresaId, @eventoId, @brincadeiraId, @checkpointId,
         @criancaId, @timeId, @uid, @leituraId, @attackType, @damage,
         @monsterHp, @monsterDefeated, @version, @scannedAt)`, {
      id: uuidv4(), partidaId: session.id, empresaId: session.empresa_id, eventoId,
      brincadeiraId, checkpointId, criancaId: crianca.id, timeId: crianca.time_id,
      uid, leituraId, attackType, damage, monsterHp, monsterDefeated,
      version: nextVersion, scannedAt: now,
    });

    const update = await query(`
      UPDATE monster_hunt_partidas SET
        hp = @monsterHp,
        status = @status,
        winner_time_id = @winnerTimeId,
        finished_at = CASE WHEN @monsterDefeated THEN @finishedAt ELSE finished_at END,
        version = @nextVersion
      WHERE id = @partidaId AND status = 'active' AND version = @version`, {
      monsterHp, status: monsterDefeated ? 'completed' : 'active',
      winnerTimeId: monsterDefeated ? crianca.time_id : null,
      finishedAt: monsterDefeated ? now : null,
      monsterDefeated,
      nextVersion, partidaId: session.id, version: Number(session.version || 0),
    });
    if (!(update.rowsAffected?.[0] || 0)) throw monsterConflict();
    if (monsterDefeated) {
      await query(`
        UPDATE eventos SET status = 'scheduled'
        WHERE LOWER(id) = LOWER(@eventoId)
          AND LOWER(empresa_id) = LOWER(@empresaId)
          AND status = 'active'`, {
        eventoId,
        empresaId: session.empresa_id,
      });
    }
  } catch (error) {
    if (isUniqueError(error)) throw monsterConflict();
    throw error;
  }

  const progress = await getMonsterProgress(eventoId, session.id);
  return {
    handled: true,
    accepted: true,
    monsterAccepted: true,
    alreadyScanned: false,
    attackType,
    damage,
    monsterHp,
    monsterMaxHp: Number(session.max_hp),
    monsterDefeated,
    progress,
    teamsProgress: progress,
    teamId: team.id,
    teamName: team.name,
    teamColor: team.color || '',
    message: monsterDefeated ? `O monstro foi derrotado pelo ${team.name}!` : `Ataque confirmado: -${damage} HP`,
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
