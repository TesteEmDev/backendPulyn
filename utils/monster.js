const { v4: uuidv4 } = require('uuid');
const { query, queryOne, allQuery, withTransaction } = require('../database');
const { awardWinnerBonus } = require('./winnerBonus');

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
    'SELECT checkpoints FROM "brincadeira" WHERE LOWER(brincadeiraId) = LOWER(@brincadeiraId)',
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
    SELECT b.brincadeiraId, b.nome, b.tipo, b.checkpoints, b.eventoId, b.empresaId, e.empresaId AS evento_empresa_id
    FROM "brincadeira" b
    INNER JOIN evento e ON LOWER(e.eventoId) = LOWER(@eventoId)
    WHERE LOWER(b.brincadeiraId) = LOWER(@brincadeiraId)
      AND LOWER(COALESCE(b.status, 'active')) <> 'archived'
      AND LOWER(b.empresaId) = LOWER(e.empresaId)
      AND (LOWER(b.eventoId) = LOWER(@eventoId) OR EXISTS (
        SELECT 1 FROM "eventoBrincadeira" eb
        WHERE LOWER(eb.brincadeiraId) = LOWER(b.brincadeiraId) AND LOWER(eb.eventoId) = LOWER(@eventoId)
      ))`, { brincadeiraId, eventoId });
}

async function getActiveMonsterGame(eventoId) {
  return queryOne(`
    SELECT TOP 1 * FROM monsterCacaPartida
    WHERE LOWER(eventoId) = LOWER(@eventoId) AND status = 'active'
    ORDER BY iniciadoEm DESC`, { eventoId });
}

async function getLatestMonsterGame(eventoId) {
  return queryOne(`
    SELECT TOP 1 * FROM monsterCacaPartida
    WHERE LOWER(eventoId) = LOWER(@eventoId)
    ORDER BY iniciadoEm DESC`, { eventoId });
}

async function getMonsterCheckpoints(eventoId) {
  return allQuery(`
    SELECT checkpointId, empresaId, status FROM "pontoVerificacao"
    WHERE LOWER(eventoId) = LOWER(@eventoId)
      AND LOWER(COALESCE(proposito, 'game')) <> 'reception'`, { eventoId });
}

async function getMonsterProgress(eventoId, partidaId) {
  const teams = await allQuery(`
    SELECT t.timeId, t.nome, t.cor,
      COALESCE(ms.id, '') AS monster_state_id,
      COALESCE(ms.vida, p.vida) AS monster_hp,
      COALESCE(ms.vidaMaxima, p.vidaMaxima) AS monster_max_hp,
      COALESCE(ms.status, CASE WHEN p.status = 'completed' THEN 'defeated' ELSE p.status END) AS monster_status,
      COALESCE(ms.versao, p.versao) AS monster_version,
      (SELECT COUNT(*) FROM "crianca" c
       WHERE LOWER(c.eventoId) = LOWER(@eventoId) AND LOWER(c.timeId) = LOWER(t.timeId)) AS total,
      (SELECT COUNT(DISTINCT s.criancaId) FROM monsterCacaLeitura s
       WHERE LOWER(s.partidaId) = LOWER(@partidaId) AND LOWER(s.timeId) = LOWER(t.timeId)) AS scanned
    FROM "time" t
    INNER JOIN monsterCacaPartida p
      ON p.id = @partidaId AND LOWER(p.eventoId) = LOWER(@eventoId)
    LEFT JOIN monsterCacaEstadoTime ms
      ON LOWER(ms.partidaId) = LOWER(p.id) AND LOWER(ms.timeId) = LOWER(t.timeId)
    WHERE LOWER(t.eventoId) = LOWER(@eventoId)
      AND EXISTS (SELECT 1 FROM "crianca" c
                  WHERE LOWER(c.eventoId) = LOWER(@eventoId)
                    AND LOWER(c.timeId) = LOWER(t.timeId))
    ORDER BY t.nome`, { eventoId, partidaId });

  return teams.map(team => ({
    teamId: team.timeId,
    teamName: team.nome,
    teamColor: team.cor,
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
  if (!game || game.tipo !== MONSTER_GAME_TYPE) {
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
    ? checkpoints.filter(checkpoint => configuredSet.has(String(checkpoint.checkpointId).toLowerCase()))
    : checkpoints;
  const explicitlySpecial = configuredItems.find(item => item && typeof item === 'object' && item.special);
  const explicitlySpecialId = explicitlySpecial?.id ? String(explicitlySpecial.id).trim().toLowerCase() : '';
  const specialCheckpoint = explicitlySpecialId
    ? candidates.find(checkpoint => String(checkpoint.checkpointId).trim().toLowerCase() === explicitlySpecialId) || candidates[0]
    : candidates[Math.floor(Math.random() * candidates.length)] || checkpoints[0];
  const participatingTeams = await allQuery(`
    SELECT t.timeId, t.nome, t.cor
    FROM "time" t
    WHERE LOWER(t.eventoId) = LOWER(@eventoId)
      AND EXISTS (
        SELECT 1 FROM "crianca" c
        WHERE LOWER(c.eventoId) = LOWER(@eventoId)
          AND LOWER(c.timeId) = LOWER(t.timeId)
      )
    ORDER BY t.nome`, { eventoId });
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
      `UPDATE "evento" SET status = status
       WHERE LOWER(eventoId) = LOWER(@eventoId)
         AND LOWER(empresaId) = LOWER(@empresaId)`,
      { eventoId, empresaId: game.empresaId }
    );

    await tx.query(`
      UPDATE monsterCacaEstadoTime
      SET status = 'finished', versao = versao + 1
      WHERE LOWER(eventoId) = LOWER(@eventoId) AND status = 'active'`, { eventoId });
    await tx.query(`
      UPDATE monsterCacaPartida
      SET status = 'finished', finalizadoEm = GETDATE(), versao = versao + 1
      WHERE LOWER(eventoId) = LOWER(@eventoId) AND status = 'active'`, { eventoId });

    await tx.query(`
      INSERT INTO monsterCacaPartida
        (id, empresaId, eventoId, brincadeiraId, status, vida, vidaMaxima,
         danoNormal, danoCheckpointEspecial, danoAtaqueEspecial,
         checkpointEspecialId, versao, iniciadoEm)
      VALUES (@id, @empresaId, @eventoId, @brincadeiraId, 'active', @maxHp, @maxHp,
         @normalDamage, @specialCheckpointDamage, @specialAttackDamage,
         @specialCheckpointId, 0, @startedAt)`, {
      id: partidaId,
      empresaId: game.empresaId,
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
        INSERT INTO monsterCacaEstadoTime
          (id, partidaId, empresaId, eventoId, timeId, vida, vidaMaxima, status, versao)
        VALUES (@id, @partidaId, @empresaId, @eventoId, @timeId, @maxHp, @maxHp, 'active', 0)`, {
        id: uuidv4(),
        partidaId,
        empresaId: game.empresaId,
        eventoId,
        timeId: team.timeId,
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

// Equipe vencedora = a primeira a derrotar o monstro (menor defeated_at).
// Partidas antigas (sem estado por equipe) guardam o vencedor na própria partida.
async function getMonsterWinnerTeamId(session) {
  const first = await queryOne(`
    SELECT TOP 1 timeId FROM monsterCacaEstadoTime
    WHERE LOWER(partidaId) = LOWER(@partidaId) AND derrotadoEm IS NOT NULL
    ORDER BY derrotadoEm ASC, vitoriaEm ASC`, { partidaId: session.id });
  return first?.timeId || session.timeVencedorId || null;
}

async function awardMonsterWinnerBonus(session) {
  const teamId = await getMonsterWinnerTeamId(session);
  if (!teamId) return null;
  return awardWinnerBonus({
    eventoId: session.eventoId,
    partidaId: session.id,
    gameType: MONSTER_GAME_TYPE,
    teamId,
  });
}

// Parada manual (ou por tempo) com a partida em andamento: se alguma equipe já
// derrotou o monstro, a primeira a conseguir vence e recebe o bônus.
async function awardMonsterBonusOnStop(eventoId) {
  const session = await getActiveMonsterGame(eventoId);
  if (!session) return null;
  return awardMonsterWinnerBonus(session);
}

async function stopMonsterGame(eventoId) {
  await query(`
    UPDATE monsterCacaEstadoTime
    SET status = 'finished', versao = versao + 1
    WHERE LOWER(eventoId) = LOWER(@eventoId) AND status = 'active'`, { eventoId });
  await query(`
    UPDATE monsterCacaPartida
    SET status = 'finished', finalizadoEm = GETDATE(), versao = versao + 1
    WHERE LOWER(eventoId) = LOWER(@eventoId) AND status = 'active'`, { eventoId });
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
    SELECT checkpointId, eventoId, proposito FROM "pontoVerificacao" WHERE LOWER(checkpointId) = LOWER(@checkpointId)`, { checkpointId });
  if (!checkpoint || String(checkpoint.proposito || 'game').toLowerCase() === 'reception') {
    return { monsterActive: false };
  }
  const status = await getMonsterEventStatus(checkpoint.eventoId);
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
  const legacyWinner = session.timeVencedorId
    ? await queryOne('SELECT timeId, nome, cor FROM "time" WHERE timeId = @timeId', { timeId: session.timeVencedorId })
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
    monsterSpecialCheckpoint: session.checkpointEspecialId || null,
    monsterSpecialCheckpointId: session.checkpointEspecialId || null,
    version: Number(session.versao || 0),
    startedAt: session.iniciadoEm,
    finishedAt: session.finalizadoEm,
  };
}

async function getMonsterScanResult(session, scan, progress, currentTeam) {
  const teamMonsterHp = Number(currentTeam?.monsterHp ?? scan?.vidaMonstroApos ?? session.hp);
  const teamMonsterMaxHp = Number(currentTeam?.monsterMaxHp ?? session.vidaMaxima);
  const teamMonsterDefeated = Boolean(currentTeam?.monsterDefeated ?? scan?.monstroDerrotado);
  return {
    handled: true,
    accepted: false,
    alreadyScanned: true,
    monsterAccepted: false,
    attackType: scan?.tipoAtaque || null,
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
  if (String(session.empresaId).toLowerCase() !== String(crianca.empresaId).toLowerCase()) {
    return { handled: true, accepted: false, error: 'Partida do monstro não pertence à empresa da criança' };
  }
  if (!crianca.timeId) return { handled: true, accepted: false, error: 'Criança não pertence a uma equipe' };

  const team = await queryOne(
    'SELECT timeId, nome, cor FROM "time" WHERE timeId = @timeId AND eventoId = @eventoId',
    { timeId: crianca.timeId, eventoId }
  );
  if (!team) return { handled: true, accepted: false, error: 'Equipe não pertence ao evento' };

  const progressBefore = await getMonsterProgress(eventoId, session.id);
  const currentBefore = progressBefore.find(item => sameId(item.teamId, crianca.timeId));
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
      teamId: team.timeId,
      teamName: team.nome,
      teamColor: team.cor || '',
      message: `O monstro da equipe ${team.nome} já foi derrotado`,
    };
  }

  const lastCheckpointScan = await queryOne(`
    SELECT TOP 1 lidoEm
    FROM monsterCacaLeitura
    WHERE LOWER(partidaId) = LOWER(@partidaId)
      AND LOWER(checkpointId) = LOWER(@checkpointId)
      AND LOWER(timeId) = LOWER(@timeId)
    ORDER BY lidoEm DESC`, {
    partidaId: session.id,
    checkpointId,
    timeId: crianca.timeId,
  });
  const checkpointCooldownSeconds = await getCheckpointCooldownSeconds(
    session.brincadeiraId || brincadeiraId,
    checkpointId
  );
  const lastScanAt = lastCheckpointScan?.lidoEm ? new Date(lastCheckpointScan.lidoEm).getTime() : 0;
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
      teamId: team.timeId,
      teamName: team.nome,
      teamColor: team.cor || '',
      message: `Checkpoint bloqueado. Aguarde ${remainingSeconds}s`,
    };
  }

  const childTeamScan = await queryOne(`
    SELECT TOP 1 id
    FROM monsterCacaLeitura
    WHERE LOWER(partidaId) = LOWER(@partidaId)
      AND LOWER(criancaId) = LOWER(@criancaId)`, {
    partidaId: session.id,
    criancaId: crianca.criancaId,
  });
  const childAlreadyAttacked = Boolean(childTeamScan);
  const members = await allQuery(`
    SELECT criancaId FROM "crianca"
    WHERE LOWER(eventoId) = LOWER(@eventoId) AND LOWER(timeId) = LOWER(@timeId)`, {
    eventoId,
    timeId: crianca.timeId,
  });
  const teamScannedBefore = Number(currentBefore.scanned || 0);
  const isSpecialAttack = !childAlreadyAttacked
    && teamScannedBefore + 1 >= members.length
    && members.length > 0;
  const isSpecialCheckpoint = sameId(session.checkpointEspecialId, checkpointId);
  const attackType = isSpecialAttack ? 'special_attack' : isSpecialCheckpoint ? 'special_checkpoint' : 'normal';
  const damage = isSpecialAttack
    ? Number(session.danoAtaqueEspecial)
    : isSpecialCheckpoint ? Number(session.danoCheckpointEspecial) : Number(session.danoNormal);
  const monsterHp = Math.max(0, Number(currentBefore.monsterHp) - damage);
  const monsterDefeated = monsterHp <= 0;
  const nextVersion = Number(currentBefore.version || 0) + 1;

  try {
    await query(`
      INSERT INTO monsterCacaLeitura
        (id, partidaId, empresaId, eventoId, brincadeiraId, checkpointId,
         criancaId, timeId, uid, leituraId, tipoAtaque, dano,
         vidaMonstroApos, monstroDerrotado, versao, lidoEm)
      VALUES (@id, @partidaId, @empresaId, @eventoId, @brincadeiraId, @checkpointId,
         @criancaId, @timeId, @uid, @leituraId, @attackType, @damage,
         @monsterHp, @monsterDefeated, @version, @scannedAt)`, {
      id: uuidv4(),
      partidaId: session.id,
      empresaId: session.empresaId,
      eventoId,
      brincadeiraId,
      checkpointId,
      criancaId: crianca.criancaId,
      timeId: crianca.timeId,
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
        UPDATE monsterCacaEstadoTime SET
          vida = @monsterHp,
          status = @status,
          derrotadoEm = CASE WHEN @monsterDefeated THEN @finishedAt ELSE derrotadoEm END,
          vitoriaEm = CASE WHEN @monsterDefeated THEN @finishedAt ELSE vitoriaEm END,
          versao = @nextVersion
        WHERE id = @teamStateId
          AND status = 'active'
          AND versao = @version`, {
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
        UPDATE monsterCacaPartida SET
          vida = @monsterHp,
          status = @status,
          timeVencedorId = @winnerTimeId,
          finalizadoEm = CASE WHEN @monsterDefeated THEN @finishedAt ELSE finalizadoEm END,
          versao = @nextVersion
        WHERE id = @partidaId AND status = 'active' AND versao = @version`, {
        monsterHp,
        status: monsterDefeated ? 'completed' : 'active',
        winnerTimeId: monsterDefeated ? crianca.timeId : null,
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
      UPDATE monsterCacaPartida SET
        status = 'completed', finalizadoEm = @finishedAt, versao = versao + 1
      WHERE id = @partidaId
        AND status = 'active'
        AND EXISTS (
          SELECT 1 FROM monsterCacaEstadoTime
          WHERE partidaId = @partidaId
        )
        AND NOT EXISTS (
          SELECT 1 FROM monsterCacaEstadoTime
          WHERE partidaId = @partidaId AND status <> 'defeated'
        )`, {
      partidaId: session.id,
      finishedAt: now,
    });
    gameCompleted = gameCompleted || Boolean(completionUpdate.rowsAffected?.[0]);
  }

  // Caça ao Monstro não pontua durante a partida: quando todos os monstros caem,
  // a equipe que derrotou o seu primeiro leva o bônus de vitória (cada membro).
  let winnerBonus = null;
  if (gameCompleted) {
    winnerBonus = await awardMonsterWinnerBonus(session);
  }

  // Quando o jogo termina, o evento continua ativo (o status é só o ciclo de
  // vida do evento); o estado do jogo é encerrado por global.finishMonsterGameState.

  const teamMonster = progress.find(item => sameId(item.teamId, team.timeId)) || currentBefore;
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
    winnerBonus,
    monsters: progress,
    progress,
    teamsProgress: progress,
    teamId: team.timeId,
    teamName: team.nome,
    teamColor: team.cor || '',
    checkpointLocked: false,
    remainingSeconds: 0,
    checkpointCooldownSeconds,
    message: gameCompleted
      ? 'Todos os monstros foram derrotados!'
      : monsterDefeated
        ? `O monstro da equipe ${team.nome} foi derrotado!`
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
  awardMonsterBonusOnStop,
  processMonsterScan,
};
