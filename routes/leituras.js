// routes/leituras.js - Leituras (ESP32)
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { query, queryOne, allQuery, withTransaction } = require('../database');
const { verifyToken, isMaster } = require('../utils/middleware');
const { normalizeUid, uidSqlExpression } = require('../utils/uid');
const {
  getActiveSession,
  processTreasureScan,
} = require('../utils/treasure');
const {
  getActiveMonsterGame,
  getMonsterEventStatus,
  processMonsterScan,
} = require('../utils/monster');
const {
  getActiveZoneConquestTeamGame,
  getZoneConquestTeamStatus,
  processZoneConquestTeamScan,
} = require('../utils/zoneConquestTeam');
const {
  getActiveZoneConquestIndividualGame,
  getZoneConquestIndividualStatus,
  processZoneConquestIndividualScan,
} = require('../utils/zoneConquestIndividualDB');

function getReadingId(req, bodyReadingId) {
  const candidate = bodyReadingId || req.get('Idempotency-Key');
  if (!candidate) return null;

  const readingId = String(candidate).trim();
  if (!/^[A-Za-z0-9_-]{1,36}$/.test(readingId)) {
    const error = new Error('readingId deve conter somente letras, números, hífen ou sublinhado e ter até 36 caracteres');
    error.statusCode = 400;
    throw error;
  }
  return readingId;
}

async function findProcessedReading(readingId, checkpoint) {
  if (!readingId) return null;

  const existing = await queryOne(
    `SELECT l.id, l.checkpointId, l.autorizado, l.pontosAtribuidos,
            l.uid, l.criancaId, l.brincadeiraId, c.eventoId,
            c.name AS crianca_name, c.timeId, t.name AS team_name, t.color AS team_color,
            ms.attack_type AS monster_attack_type, ms.damage AS monster_damage,
            ms.monster_hp_after, ms.monster_defeated, mp.max_hp AS monster_max_hp
     FROM leituras l
     LEFT JOIN criancas c ON c.id = l.criancaId
     LEFT JOIN times t ON t.id = c.timeId
     LEFT JOIN monsterHuntScans ms ON ms.leituraId = l.id
     LEFT JOIN monsterHuntPartidas mp ON mp.id = ms.partidaId
     WHERE l.id = @readingId`,
    { readingId }
  );

  if (!existing) return null;
  if (String(existing.checkpointId).trim().toLowerCase() !== String(checkpoint.id).trim().toLowerCase()) {
    const error = new Error('readingId já foi usado em outro checkpoint');
    error.statusCode = 409;
    throw error;
  }
  return existing;
}

async function sendProcessedReading(res, reading) {
  const game = reading.brincadeiraId
    ? await queryOne('SELECT type FROM brincadeiras WHERE id = @id', { id: reading.brincadeiraId })
    : null;
  const isTreasure = game?.type === 'treasure_hunt';
  const isMonster = game?.type === 'monster_hunt' || Boolean(reading.monster_attack_type);
  const monsterStatus = isMonster && reading.eventoId
    ? await getMonsterEventStatus(reading.eventoId)
    : null;
  const teamMonster = monsterStatus?.monsters?.find(monster => String(monster.teamId).toLowerCase() === String(reading.timeId || '').toLowerCase());

  return res.json({
    ok: true,
    registered: true,
    autorizado: Boolean(reading.autorizado),
    idempotent: true,
    readingId: reading.id,
    braceletCode: reading.uid,
    criancaName: reading.crianca_name || undefined,
    teamName: reading.team_name || undefined,
    teamColor: reading.team_color || '',
    points: Number(reading.pontosAtribuidos || 0),
    treasure: isTreasure,
    treasureAccepted: isTreasure && Boolean(reading.autorizado),
    treasureTeamComplete: false,
    monster: isMonster,
    monsterAccepted: false,
    attackType: isMonster ? reading.monster_attack_type : undefined,
    damage: isMonster ? Number(reading.monster_damage || 0) : undefined,
    monsterHp: isMonster ? Number(reading.monster_hp_after || 0) : undefined,
    monsterMaxHp: isMonster ? Number(reading.monster_max_hp || 500) : undefined,
    monsterDefeated: isMonster && Boolean(reading.monster_defeated),
    teamMonsterHp: isMonster ? Number(reading.monster_hp_after || teamMonster?.monsterHp || 0) : undefined,
    teamMonsterMaxHp: isMonster ? Number(teamMonster?.monsterMaxHp || reading.monster_max_hp || 500) : undefined,
    teamMonsterDefeated: isMonster && Boolean(reading.monster_defeated),
    teamVictory: isMonster && Boolean(reading.monster_defeated),
    gameCompleted: isMonster && Boolean(monsterStatus?.gameCompleted),
    monsters: isMonster ? (monsterStatus?.monsters || []) : undefined,
    alreadyScanned: isMonster,
    progress: isMonster ? (monsterStatus?.progress || []) : undefined,
    teamsProgress: isMonster ? (monsterStatus?.teamsProgress || monsterStatus?.progress || []) : undefined,
    message: isMonster ? 'Leitura do monstro já processada anteriormente' : 'Leitura já processada anteriormente',
  });
}

function broadcast(data) {
  if (global.broadcastToEvent && data.payload?.eventoId) {
    // Usar broadcast por evento se disponível
    global.broadcastToEvent(data.payload.eventoId, data);
  } else if (global.wsServer) {
    // Fallback: broadcast global
    global.wsServer.clients.forEach((cliente) => {
      if (cliente.readyState === 1) {
        cliente.send(JSON.stringify(data));
      }
    });
  }
}

function broadcastEvent(data) {
  if (global.broadcastToEvent && data.payload?.eventoId) {
    global.broadcastToEvent(data.payload.eventoId, data);
  }
}

/**
 * Avisa o app dos pais que uma criança passou por um checkpoint, para o avatar
 * se mover até ele. Vale para TODOS os jogos (zona, tesouro, monstro e zone
 * conquest por equipe/individual). É um evento separado de TERRITORY_CONQUERED
 * de propósito: o web usa aquele para marcar o dono do território, o que seria
 * errado no modo individual. Nunca lança erro — o rastreio não pode derrubar
 * uma leitura já confirmada.
 */
async function broadcastChildCheckpointPassed({ checkpointId, crianca, eventoId, gameType, teamColor, leituraId, uid, now }) {
  try {
    const coords = await queryOne(
      'SELECT mapaX, mapaY FROM pontoVerificacao WHERE id = @id',
      { id: checkpointId }
    );
    if (coords?.mapaX == null || coords?.mapaY == null) {
      console.warn(`⚠️ [RASTREIO] Checkpoint ${checkpointId} sem mapaX/mapaY — avatar não poderá se mover (${gameType})`);
    }

    let color = teamColor || crianca.teamColor || null;
    if (!color && crianca.timeId) {
      const team = await queryOne('SELECT color FROM times WHERE id = @id', { id: crianca.timeId });
      color = team?.color || null;
    }

    broadcastEvent({
      type: 'CHILD_CHECKPOINT_PASSED',
      payload: {
        id: leituraId,
        checkpointId,
        uid,
        criancaId: crianca.id,
        criancaName: crianca.name,
        timeId: crianca.timeId || null,
        teamColor: color || '#1E9BD7',
        timestamp: now.toISOString(),
        eventoId,
        gameType,
        mapX: coords?.mapaX ?? null,
        mapY: coords?.mapaY ?? null,
      },
    });
  } catch (err) {
    console.error(`❌ [RASTREIO] Falha ao enviar CHILD_CHECKPOINT_PASSED (${gameType}):`, err.message);
  }
}

function rememberReceptionReading(reading) {
  if (!global.receptionReadingQueues) global.receptionReadingQueues = new Map();

  const eventKey = String(reading.eventoId || '').trim().toLowerCase();
  if (!eventKey) return;

  const queue = global.receptionReadingQueues.get(eventKey) || [];
  queue.push(reading);
  // Mantém somente leituras recentes para permitir recuperação sem acumular dados.
  global.receptionReadingQueues.set(eventKey, queue.slice(-50));
}

router.post('/reception', async (req, res) => {
  try {
    const { checkpointId, uid } = req.body;
    const normalizedUid = normalizeUid(uid);
    const now = new Date();

    if (!checkpointId || !normalizedUid) {
      return res.status(400).json({ error: 'checkpointId e uid são obrigatórios' });
    }

    // O checkpoint de recepção é um equipamento físico da empresa (o leitor do
    // balcão), não de um evento específico: a leitura vai para a recepção/kiosk
    // de qualquer evento ABERTO da mesma empresa. Nenhuma regra de jogo é
    // executada nesta rota.
    // Checkpoint e pulseira vêm em UMA consulta (antes eram duas, em sequência):
    // cada ida ao banco remoto soma na demora entre passar a pulseira e a luz acender.
    const checkpoint = await queryOne(
      `SELECT c.id, c.empresaId, c.eventoId, c.propositoCheckpoint,
              p.codigo AS pulseira_code, p.status AS pulseira_status
       FROM pontoVerificacao c
       LEFT JOIN pulseiras p
         ON LOWER(p.empresaId) = LOWER(c.empresaId)
        AND ${uidSqlExpression('p.codigo')} = @uid
       WHERE c.id = @id
         AND LOWER(COALESCE(c.propositoCheckpoint, 'game')) = 'reception'`,
      { id: checkpointId, uid: normalizedUid }
    );

    if (!checkpoint) {
      return res.status(404).json({ error: 'Checkpoint de recepção não encontrado' });
    }

    const pulseira = checkpoint.pulseira_code
      ? { codigo: checkpoint.pulseira_code, status: checkpoint.pulseira_status }
      : null;

    const registered = Boolean(pulseira);
    // Eventos que podem estar cadastrando pulseiras agora. O evento do próprio
    // checkpoint só entra se ainda estiver aberto; se não houver nenhum aberto,
    // mantém o comportamento antigo (evento do checkpoint).
    const openEvents = await allQuery(
      `SELECT id FROM eventos
       WHERE LOWER(empresaId) = LOWER(@empresaId)
         AND LOWER(COALESCE(status, 'scheduled')) NOT IN ('completed', 'cancelled', 'canceled', 'finished')`,
      { empresaId: checkpoint.empresaId }
    );
    const targetEventIds = openEvents.length
      ? openEvents.map(event => event.id)
      : [checkpoint.eventoId].filter(Boolean);

    const readingId = uuidv4();
    for (const targetEventId of targetEventIds) {
      const receptionReading = {
        readingId,
        braceletCode: normalizedUid,
        timestamp: now.toISOString(),
        receivedAt: now.getTime(),
        checkpointId: checkpoint.id,
        eventoId: targetEventId,
        source: 'reception',
      };

      // Guarda a leitura por alguns segundos para kiosks que perderem o broadcast.
      rememberReceptionReading(receptionReading);
      broadcast({
        type: 'NFC_READING_DETECTED',
        payload: receptionReading,
      });
    }

    return res.json({
      ok: true,
      registered,
      braceletCode: normalizedUid,
      braceletStatus: pulseira?.status || null,
      message: registered ? 'Pulseira detectada' : 'Pulseira ainda não cadastrada',
    });
  } catch (err) {
    console.error('❌ Erro na leitura de recepção:', err);
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    console.log(`\n🔵 [LEITURA-DEBUG] POST /api/leituras recebido!`);
    const { checkpointId, uid, brincadeiraId, signal, readingId: requestedReadingId } = req.body;
    
    const normalizedUid = normalizeUid(uid);
    const readingId = getReadingId(req, requestedReadingId);
    const now = new Date();

    console.log(`\n📡 [LEITURA] Recebida: checkpoint=${checkpointId}, uid=${normalizedUid}`);

    if (!checkpointId || !normalizedUid) {
      return res.status(400).json({ error: 'checkpointId e uid são obrigatórios' });
    }
    
    // O checkpoint define a empresa e o evento da leitura.
    const checkpoint = await queryOne('SELECT id, empresaId, eventoId, status, propositoCheckpoint FROM pontoVerificacao WHERE id = @id', { id: checkpointId });
    if (!checkpoint) {
      return res.status(404).json({ error: 'Checkpoint não encontrado' });
    }
    if (String(checkpoint.propositoCheckpoint || 'game').trim().toLowerCase() === 'reception') {
      return res.status(409).json({ ok: false, error: 'Use a rota de recepção para este checkpoint' });
    }

    const processedReading = await findProcessedReading(readingId, checkpoint);
    if (processedReading) {
      return await sendProcessedReading(res, processedReading);
    }

    const leituraId = readingId || uuidv4();
    
    const broadcastData = {
      type: 'NFC_READING_DETECTED',
      payload: {
        braceletCode: normalizedUid,
        timestamp: now.toISOString(),
        checkpointId,
        eventoId: checkpoint.eventoId
      }
    };

    // A leitura é enviada também quando a pulseira ainda não existe no banco,
    // pois as telas de recepção precisam poder cadastrá-la pelo NFC.
    broadcast(broadcastData);

    const treasureSession = await getActiveSession(checkpoint.eventoId);
    const monsterSession = await getActiveMonsterGame(checkpoint.eventoId);
    const checkpointIsOnline = String(checkpoint.status || '').trim().toLowerCase() === 'online';

    // Durante o Caça ao Tesouro, um checkpoint offline não deve voltar a ser
    // considerado online apenas porque recebeu uma tentativa de leitura.
    if (!treasureSession || checkpointIsOnline) {
      try {
        await query(
          `UPDATE pontoVerificacao SET status = 'online', ultimoVisto = @now WHERE id = @checkpointId`,
          { checkpointId, now }
        );
      } catch (err) {
      // Se coluna ultimoVisto não existe ainda, só atualiza o status
      if (err.message.includes('ultimoVisto')) {
        await query(
          `UPDATE pontoVerificacao SET status = 'online' WHERE id = @checkpointId`,
          { checkpointId }
        );
      } else {
        throw err;
      }
      }
    }
    
    // A pulseira precisa existir, pertencer à mesma empresa e estar ativa.
    // Isso evita processar uma criança cujo vínculo foi removido ou bloqueado.
    const pulseira = await queryOne(
      `SELECT codigo, empresaId, status, criancaId
       FROM pulseiras
       WHERE ${uidSqlExpression('codigo')} = @uid`,
      { uid: normalizedUid }
    );

    if (pulseira && String(pulseira.empresaId).trim().toLowerCase() !== String(checkpoint.empresaId).trim().toLowerCase()) {
      return res.status(403).json({ ok: false, error: 'Pulseira não pertence a esta empresa' });
    }

    if (!pulseira) {
      return res.json({
        ok: true,
        registered: false,
        braceletExists: false,
        braceletCode: normalizedUid,
        message: 'Pulseira ainda não está cadastrada'
      });
    }

    const braceletStatus = String(pulseira.status || '').trim().toLowerCase();
    if (braceletStatus !== 'em_uso' || !pulseira.criancaId) {
      return res.json({
        ok: true,
        registered: false,
        braceletExists: true,
        braceletStatus: pulseira.status,
        braceletCode: normalizedUid,
        message: 'Pulseira cadastrada, mas ainda não está vinculada a uma criança'
      });
    }

    const crianca = await queryOne(
      `SELECT c.* FROM criancas c
       WHERE c.id = @criancaId
         AND ${uidSqlExpression('c.codigoPulseira')} = @uid`,
      { criancaId: pulseira.criancaId, uid: normalizedUid }
    );

    if (!crianca) {
      return res.json({
        ok: true,
        registered: false,
        braceletExists: true,
        braceletStatus: pulseira.status,
        braceletCode: normalizedUid,
        message: 'Pulseira cadastrada, mas o vínculo precisa ser revisado'
      });
    }
    
    // ✅ VALIDAÇÃO CROSS-TENANT/EVENTO: a criança deve pertencer ao mesmo
    // tenant e ao mesmo evento do checkpoint que recebeu a leitura.
    if (String(crianca.empresaId).trim().toLowerCase() !== String(checkpoint.empresaId).trim().toLowerCase()) {
      return res.status(403).json({ 
        ok: false,
        error: 'Segurança: empresaId não corresponde' 
      });
    }

    if (String(crianca.eventoId).trim().toLowerCase() !== String(checkpoint.eventoId).trim().toLowerCase()) {
      return res.json({
        ok: true,
        registered: true,
        braceletCode: normalizedUid,
        autorizado: false,
        message: 'Pulseira cadastrada em outro evento'
      });
    }
    
    // ✅ Pulseira já cadastrada - processar como leitura de jogo
    
    // ✨ NOVO: Validar se o evento está ACTIVE antes de processar pontos
    const evento = await queryOne('SELECT id, status FROM eventos WHERE LOWER(id) = LOWER(@id)', { id: crianca.eventoId });
    
    // Caça ao Monstro tem prioridade sobre o fluxo de território e confirma
    // scan, HP, vencedor e leitura na mesma transação.
    if (monsterSession) {
      let monsterResult = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          monsterResult = await withTransaction(async (tx) => {
            const result = await processMonsterScan({
              eventoId: checkpoint.eventoId,
              checkpointId,
              crianca,
              brincadeiraId: monsterSession.brincadeiraId,
              uid: normalizedUid,
              leituraId,
              now,
            });
            if (result?.accepted && !result.alreadyScanned) {
              await tx.query(
                `INSERT INTO leituras
                  (id, checkpointId, criancaId, uid, brincadeiraId, autorizado,
                   pontosAtribuidos, forcaSinal, empresaId, session_id)
                 VALUES (@id, @checkpointId, @criancaId, @uid, @brincadeiraId, 1,
                         0, @signal, @empresaId, @sessionId)`,
                {
                  id: leituraId,
                  checkpointId,
                  criancaId: crianca.id,
                  uid: normalizedUid,
                  brincadeiraId: monsterSession.brincadeiraId,
                  signal: signal || -45,
                  empresaId: crianca.empresaId,
                  sessionId: global.currentSessionId || null,
                }
              );
            }
            return result;
          });
          break;
        } catch (error) {
          if (error.codigo === 'MONSTER_VERSION_CONFLICT') {
            // Outra tentativa pode ter confirmado a mesma leitura enquanto
            // esta transação aguardava o lock/índice único.
            const processedAfterConflict = await findProcessedReading(leituraId, checkpoint);
            if (processedAfterConflict) return await sendProcessedReading(res, processedAfterConflict);
            if (attempt < 2) continue;
          }
          throw error;
        }
      }

      // A partida pode ter sido concluída por outra leitura enquanto esta
      // requisição aguardava. Não deixar a leitura cair no fluxo de território.
      if (!monsterResult) {
        return res.json({
          ok: true,
          registered: true,
          autorizado: false,
          braceletCode: normalizedUid,
          readingId: leituraId,
          monster: true,
          monsterAccepted: false,
          gameCompleted: true,
          message: 'A partida do monstro foi concluída por outra leitura',
        });
      }

      if (monsterResult) {
        if (monsterResult.accepted && !monsterResult.alreadyScanned) {
          const eventType = monsterResult.gameCompleted
            ? 'MONSTER_DEFEATED'
            : monsterResult.monsterDefeated
              ? 'MONSTER_TEAM_DEFEATED'
              : monsterResult.attackType === 'special_attack'
                ? 'MONSTER_SPECIAL_ATTACK'
                : 'MONSTER_PROGRESS';
          broadcastEvent({
            type: eventType,
            payload: {
              ...monsterResult,
              checkpointId,
              criancaId: crianca.id,
              criancaName: crianca.name,
              timeId: crianca.timeId,
              eventoId: checkpoint.eventoId,
            },
          });

          // ✨ NOVO: Enviar TERRITORY_CONQUERED para rastreio do avatar no mobile
          const checkpointData = await queryOne(
            'SELECT mapaX, mapaY FROM pontoVerificacao WHERE id = @id',
            { id: checkpointId }
          );
          
          console.log(`🎬 [RASTREIO] Monster Hunt - Checkpoint: ${checkpointId}`);
          console.log(`🎬 [RASTREIO]   - checkpointData: ${JSON.stringify(checkpointData)}`);
          console.log(`🎬 [RASTREIO]   - mapaX: ${checkpointData?.mapaX} (type: ${typeof checkpointData?.mapaX})`);
          console.log(`🎬 [RASTREIO]   - mapaY: ${checkpointData?.mapaY} (type: ${typeof checkpointData?.mapaY})`);
          
          // ⚠️ CRITICAL DEBUG: Se coordinates são NULL, esse é o problema!
          if (checkpointData?.mapaX == null || checkpointData?.mapaY == null) {
            console.error(`❌ [RASTREIO] CRÍTICO: Checkpoint ${checkpointId} não tem coordenadas! mapaX=${checkpointData?.mapaX}, mapaY=${checkpointData?.mapaY}`);
            console.error(`   Verifique se a coluna 'mapaX' e 'mapaY' existem e têm valores para este checkpoint`);
          }
          
          const territoryPayload = {
            type: 'TERRITORY_CONQUERED',
            payload: {
              id: leituraId,
              checkpointId,
              uid: normalizedUid,
              criancaId: crianca.id,
              criancaName: crianca.name,
              timeId: crianca.timeId,
              teamColor: monsterResult.teamColor || '#FF0000',
              points: 0,
              lockDurationSeconds: 0,
              timestamp: now.toISOString(),
              eventoId: crianca.eventoId,
              gameType: 'monster_hunt',
              mapX: checkpointData?.mapaX || null,
              mapY: checkpointData?.mapaY || null,
            }
          };
          
          console.log(`📡 [RASTREIO] Enviando TERRITORY_CONQUERED para Monster Hunt:`);
          console.log(`   - Destinatário: evento ${crianca.eventoId}`);
          console.log(`   - Criança: ${crianca.name}`);
          console.log(`   - Checkpoint: ${checkpointId}`);
          console.log(`   - Coordenadas: mapX=${territoryPayload.payload.mapX}, mapY=${territoryPayload.payload.mapY}`);
          console.log(`   - Estrutura completa: ${JSON.stringify(territoryPayload, null, 2)}`);
          broadcast(territoryPayload);
          await broadcastChildCheckpointPassed({
            checkpointId, crianca, eventoId: checkpoint.eventoId, gameType: 'monster_hunt',
            teamColor: monsterResult.teamColor, leituraId, uid: normalizedUid, now,
          });
        }

        if (monsterResult.gameCompleted && typeof global.finishMonsterGameState === 'function') {
          global.finishMonsterGameState(checkpoint.eventoId, now.toISOString());
        }

        return res.json({
          ok: true,
          registered: true,
          autorizado: Boolean(monsterResult.accepted),
          braceletCode: normalizedUid,
          readingId: leituraId,
          monster: true,
          monsterAccepted: Boolean(monsterResult.accepted),
          attackType: monsterResult.attackType || null,
          damage: Number(monsterResult.damage || 0),
          monsterHp: Number(monsterResult.monsterHp || 0),
          monsterMaxHp: Number(monsterResult.monsterMaxHp || monsterSession.max_hp || 500),
          monsterDefeated: Boolean(monsterResult.monsterDefeated),
          teamMonsterHp: Number(monsterResult.teamMonsterHp ?? monsterResult.monsterHp ?? 0),
          teamMonsterMaxHp: Number(monsterResult.teamMonsterMaxHp ?? monsterResult.monsterMaxHp ?? monsterSession.max_hp ?? 500),
          teamMonsterDefeated: Boolean(monsterResult.teamMonsterDefeated ?? monsterResult.monsterDefeated),
          teamVictory: Boolean(monsterResult.teamVictory ?? monsterResult.monsterDefeated),
          gameCompleted: Boolean(monsterResult.gameCompleted),
          monsters: monsterResult.monsters || monsterResult.progress || [],
          alreadyScanned: Boolean(monsterResult.alreadyScanned),
          progress: monsterResult.progress || [],
          teamsProgress: monsterResult.teamsProgress || monsterResult.progress || [],
          teamName: monsterResult.teamName || null,
          teamColor: monsterResult.teamColor || '',
          checkpointLocked: Boolean(monsterResult.checkpointLocked),
          remainingSeconds: Number(monsterResult.remainingSeconds || 0),
          checkpointCooldownSeconds: Number(monsterResult.checkpointCooldownSeconds || 15),
          error: monsterResult.error,
          message: monsterResult.message || 'Leitura do monstro processada',
        });
      }
    }

    // Caça ao Tesouro usa uma regra própria e não pontua como Zona.
    if (treasureSession) {
      if (!checkpointIsOnline) {
        const offlineMessage = 'Este checkpoint está offline e não pode ser usado no Caça ao Tesouro';
        return res.json({
          ok: true,
          registered: true,
          autorizado: false,
          treasure: true,
          treasureAccepted: false,
          error: offlineMessage,
          message: offlineMessage,
        });
      }

      const treasureResult = await withTransaction(async (tx) => {
        const result = await processTreasureScan({
          eventoId: checkpoint.eventoId,
          checkpointId,
          crianca,
          brincadeiraId: treasureSession.brincadeiraId,
          uid: normalizedUid,
          now,
        });

        if (result?.accepted && !result.duplicate) {
          await tx.query(
            `INSERT INTO leituras
              (id, checkpointId, criancaId, uid, brincadeiraId, autorizado,
               pontosAtribuidos, forcaSinal, empresaId, session_id)
             VALUES (@id, @checkpointId, @criancaId, @uid, @brincadeiraId, 1,
                     0, @signal, @empresaId, @sessionId)`,
            {
              id: leituraId,
              checkpointId,
              criancaId: crianca.id,
              uid: normalizedUid,
              brincadeiraId: treasureSession.brincadeiraId,
              signal: signal || -45,
              empresaId: crianca.empresaId,
              sessionId: global.currentSessionId || null,
            }
          );
        }

        return result;
      });

      if (treasureResult) {

        const eventType = treasureResult.roundComplete
          ? 'TREASURE_ROUND_COMPLETED'
          : 'TREASURE_PROGRESS';
        broadcast({
          type: eventType,
          payload: {
            ...treasureResult,
            checkpointId,
            criancaId: crianca.id,
            criancaName: crianca.name,
            timeId: crianca.timeId,
            eventoId: checkpoint.eventoId,
          },
        });

        // ✨ NOVO: Enviar TERRITORY_CONQUERED para rastreio do avatar no mobile (replicado de Zone)
        if (treasureResult.accepted) {
          const checkpointCoords = await queryOne(
            'SELECT mapaX, mapaY FROM pontoVerificacao WHERE id = @id',
            { id: checkpointId }
          );
          
          console.log(`🎬 [RASTREIO] Treasure Hunt - Checkpoint: ${checkpointId}`);
          console.log(`🎬 [RASTREIO]   - checkpointCoords: ${JSON.stringify(checkpointCoords)}`);
          console.log(`🎬 [RASTREIO]   - mapaX: ${checkpointCoords?.mapaX} (type: ${typeof checkpointCoords?.mapaX})`);
          console.log(`🎬 [RASTREIO]   - mapaY: ${checkpointCoords?.mapaY} (type: ${typeof checkpointCoords?.mapaY})`);
          
          // ⚠️ CRITICAL DEBUG: Se coordinates são NULL, esse é o problema!
          if (checkpointCoords?.mapaX == null || checkpointCoords?.mapaY == null) {
            console.error(`❌ [RASTREIO] CRÍTICO: Checkpoint ${checkpointId} não tem coordenadas! mapaX=${checkpointCoords?.mapaX}, mapaY=${checkpointCoords?.mapaY}`);
            console.error(`   Verifique se a coluna 'mapaX' e 'mapaY' existem e têm valores para este checkpoint`);
          }
          
          const territoryPayload = {
            type: 'TERRITORY_CONQUERED',
            payload: {
              id: leituraId,
              checkpointId,
              uid: normalizedUid,
              criancaId: crianca.id,
              criancaName: crianca.name,
              timeId: crianca.timeId,
              teamColor: treasureResult.teamColor || '#00AA00',
              points: 0,
              lockDurationSeconds: 0,
              timestamp: now.toISOString(),
              eventoId: checkpoint.eventoId,
              gameType: 'treasure_hunt',
              mapX: checkpointCoords?.mapaX,
              mapY: checkpointCoords?.mapaY,
            }
          };
          
          console.log(`📡 [RASTREIO] Enviando TERRITORY_CONQUERED para Treasure Hunt:`);
          console.log(`   - Destinatário: evento ${checkpoint.eventoId}`);
          console.log(`   - Criança: ${crianca.name}`);
          console.log(`   - Checkpoint: ${checkpointId}`);
          console.log(`   - Coordenadas: mapX=${territoryPayload.payload.mapX}, mapY=${territoryPayload.payload.mapY}`);
          console.log(`   - Estrutura completa: ${JSON.stringify(territoryPayload, null, 2)}`);
          broadcast(territoryPayload);
          await broadcastChildCheckpointPassed({
            checkpointId, crianca, eventoId: checkpoint.eventoId, gameType: 'treasure_hunt',
            teamColor: treasureResult.teamColor, leituraId, uid: normalizedUid, now,
          });
        }

        if (treasureResult.finished && typeof global.finishTreasureGameState === 'function') {
          global.finishTreasureGameState(checkpoint.eventoId, now.toISOString());
        }

        return res.json({
          ok: true,
          registered: true,
          autorizado: Boolean(treasureResult.teamComplete),
          treasure: true,
          treasureAccepted: Boolean(treasureResult.accepted),
          treasureTeamComplete: Boolean(treasureResult.teamComplete),
          treasureFinished: Boolean(treasureResult.finished),
          treasureRound: treasureResult.roundNumber || treasureSession.numeroRonda,
          treasureProgress: {
            scanned: treasureResult.scanned || 0,
            total: treasureResult.total || 0,
          },
          teamColor: treasureResult.teamColor || '',
          teamCompletedAllCheckpoints: Boolean(treasureResult.teamCompletedAllCheckpoints),
          winningTeamId: treasureResult.winningTeamId || null,
          winningTeamName: treasureResult.winningTeamName || null,
          teamRaceTimes: treasureResult.teamRaceTimes || [],
          turnTeamId: treasureResult.turnTeamId || null,
          turnTeamName: treasureResult.turnTeamName || null,
          turnRemainingSeconds: treasureResult.remainingSeconds || treasureResult.turnWaitSeconds || 0,
          remainingSeconds: treasureResult.remainingSeconds || 0,
          readingId: leituraId,
          error: treasureResult.error,
          message: treasureResult.message || treasureResult.error || 'Leitura processada',
        });
      }
    }

    // ✅ ZONE CONQUEST: Novo jogo de domínio de zonas por equipe
    const { getZoneConquestPartidaAtiva } = require('../utils/zoneConquest');
    const zonePartidaAtiva = await getZoneConquestPartidaAtiva(checkpoint.eventoId);
    
    if (zonePartidaAtiva) {
      const zoneResult = await withTransaction(async (tx) => {
        const result = await processZoneConquestScan({
          eventoId: checkpoint.eventoId,
          checkpointId,
          crianca,
          brincadeiraId: zonePartidaAtiva.brincadeiraId,
          uid: normalizedUid,
          leituraId,
          now,
        });

        if (result?.accepted) {
          await tx.query(
            `INSERT INTO leituras
              (id, checkpointId, criancaId, uid, brincadeiraId, autorizado,
               pontosAtribuidos, forcaSinal, empresaId)
             VALUES (@id, @checkpointId, @criancaId, @uid, @brincadeiraId, 1,
                     0, @signal, @empresaId)`,
            {
              id: leituraId,
              checkpointId,
              criancaId: crianca.id,
              uid: normalizedUid,
              brincadeiraId: zonePartidaAtiva.brincadeiraId || null,
              signal: signal || -45,
              empresaId: crianca.empresaId,
            }
          );
        }

        return result;
      });

      if (zoneResult) {
        broadcast({
          type: 'ZONE_CHECKPOINT_SCANNED',
          payload: {
            ...zoneResult,
            checkpointId,
            criancaId: crianca.id,
            criancaName: crianca.name,
            timeId: crianca.timeId,
            eventoId: checkpoint.eventoId,
          },
        });

        if (zoneResult.accepted) {
          await broadcastChildCheckpointPassed({
            checkpointId, crianca, eventoId: checkpoint.eventoId, gameType: 'zone_conquest',
            teamColor: zoneResult.teamColor, leituraId, uid: normalizedUid, now,
          });
        }

        return res.json({
          ok: true,
          registered: true,
          autorizado: Boolean(zoneResult.accepted),
          zone: true,
          zoneAccepted: Boolean(zoneResult.accepted),
          readingId: leituraId,
          braceletCode: normalizedUid,
          message: zoneResult.message || 'Leitura processada',
        });
      }
    }

    const checkpointData = await queryOne('SELECT * FROM pontoVerificacao WHERE id = @id', { id: checkpointId });
    
    if (!checkpointData) {
      return res.json({ ok: true, registered: true, braceletCode: normalizedUid, message: 'Pulseira cadastrada' });
    }
    
    // 🆕 ZONE CONQUEST - Processar TEAM ou INDIVIDUAL antes de modo territorial
    const zoneConquestTeamGame = await getActiveZoneConquestTeamGame(checkpoint.eventoId);
    const zoneConquestIndividualGame = await getActiveZoneConquestIndividualGame(checkpoint.eventoId);

    // 🔍 Recuperar sessionId ativo do banco (em vez de usar global que não persiste no Render)
    let activeSessionId = null;
    if (zoneConquestTeamGame || zoneConquestIndividualGame) {
      try {
        const activeSession = await queryOne(
          `SELECT id FROM gameSessions 
           WHERE LOWER(eventoId) = LOWER(@eventoId) 
             AND status = 'active'
           ORDER BY iniciadoEm DESC
           LIMIT 1`,
          { eventoId: checkpoint.eventoId }
        );
        if (activeSession) {
          activeSessionId = activeSession.id;
          console.log(`   🔍 [SESSÃO] sessionId recuperada do banco: ${activeSessionId}`);
        } else {
          console.log(`   ❌ [SESSÃO] Nenhuma sessão ativa encontrada para evento ${checkpoint.eventoId}`);
        }
      } catch (err) {
        console.error(`   ❌ [SESSÃO] Erro ao recuperar sessionId:`, err.message);
      }
    }

    if (zoneConquestTeamGame) {
      console.log(`\n🎮 [ZONE-TEAM] Processando leitura de checkpoint...`);
      
      const scanResult = await processZoneConquestTeamScan({
        eventoId: checkpoint.eventoId,
        checkpointId,
        crianca,
        brincadeiraId: zoneConquestTeamGame.brincadeiraId,
        uid: normalizedUid,
        leituraId,
        sessionId: activeSessionId || null,
        now,
      });

      if (!scanResult.accepted) {
        console.log(`   ❌ [ZONE-TEAM] Leitura rejeitada: ${scanResult.error}`);
        return res.json({
          ok: true,
          registered: true,
          autorizado: false,
          braceletCode: normalizedUid,
          gameMode: 'zone_conquest_team',
          error: scanResult.error,
          message: scanResult.error,
        });
      }

      console.log(`   ✅ [ZONE-TEAM] Leitura aceita!`);
      
      broadcastEvent({
        type: 'ZONE_CONQUEST_TEAM_SCAN',
        payload: {
          checkpointId,
          criancaId: crianca.id,
          criancaName: crianca.name,
          timeId: crianca.timeId,
          teamColor: crianca.teamColor,
          pointsGained: scanResult.points,
          eventoId: checkpoint.eventoId,
          timestamp: now.toISOString(),
        },
      });
      await broadcastChildCheckpointPassed({
        checkpointId, crianca, eventoId: checkpoint.eventoId, gameType: 'zone_conquest_team',
        teamColor: crianca.teamColor, leituraId, uid: normalizedUid, now,
      });

      return res.json({
        ok: true,
        registered: true,
        autorizado: true,
        braceletCode: normalizedUid,
        readingId: leituraId,
        gameMode: 'zone_conquest_team',
        pointsGained: scanResult.points,
        criancaName: crianca.name,
        message: `${crianca.name} conquistou o checkpoint! +${scanResult.points}pt`,
      });
    }

    if (zoneConquestIndividualGame) {
      console.log(`\n🎮 [ZONE-INDIVIDUAL] Processando leitura de checkpoint...`);
      
      const scanResult = await processZoneConquestIndividualScan({
        eventoId: checkpoint.eventoId,
        checkpointId,
        crianca,
        brincadeiraId: zoneConquestIndividualGame.brincadeiraId,
        uid: normalizedUid,
        leituraId,
        sessionId: activeSessionId || null,
        now,
      });

      if (!scanResult.accepted) {
        console.log(`   ❌ [ZONE-INDIVIDUAL] Leitura rejeitada: ${scanResult.error}`);
        return res.json({
          ok: true,
          registered: true,
          autorizado: false,
          braceletCode: normalizedUid,
          gameMode: 'zone_conquest_individual',
          error: scanResult.error,
          versionConflict: scanResult.versionConflict || false,
          message: scanResult.error,
        });
      }

      console.log(`   ✅ [ZONE-INDIVIDUAL] Leitura aceita!`);
      
      // 🆕 INSERT em leituras já é feito dentro de processZoneConquestIndividualScan
      // Não fazer INSERT duplicado aqui!
      // await query(...);
      console.log(`   📝 [LEITURA] Já inserida em leituras dentro do scan com session_id=${activeSessionId || 'NULL'}`);
      
      // Obter status atualizado
      const statusAtualizado = await getZoneConquestIndividualStatus(checkpoint.eventoId);
      
      broadcastEvent({
        type: 'ZONE_CONQUEST_INDIVIDUAL_SCAN',
        payload: {
          checkpointId,
          criancaId: crianca.id,
          criancaName: crianca.name,
          pointsGained: scanResult.points,
          totalPoints: scanResult.totalPoints,
          checkpointsRead: scanResult.checkpointsRead,
          version: scanResult.version,
          ranking: statusAtualizado?.participants || [],
          eventoId: checkpoint.eventoId,
          timestamp: now.toISOString(),
        },
      });
      await broadcastChildCheckpointPassed({
        checkpointId, crianca, eventoId: checkpoint.eventoId, gameType: 'zone_conquest_individual',
        leituraId, uid: normalizedUid, now,
      });

      return res.json({
        ok: true,
        registered: true,
        autorizado: true,
        braceletCode: normalizedUid,
        readingId: leituraId,
        gameMode: 'zone_conquest_individual',
        pointsGained: scanResult.points,
        totalPoints: scanResult.totalPoints,
        checkpointsRead: scanResult.checkpointsRead,
        version: scanResult.version,
        criancaName: crianca.name,
        message: `${crianca.name} conquistou o checkpoint! +${scanResult.points}pt (Total: ${scanResult.totalPoints}pt)`,
      });
    }
    
    // Processar conquista de território (TEAM mode)
    const isLocked = checkpointData.territorioTravadoAte && new Date(checkpointData.territorioTravadoAte) > now;
    const isCooldown = checkpointData.territorioCooldownAte && new Date(checkpointData.territorioCooldownAte) > now;
    
    if (isLocked) {
      const remainingSeconds = Math.ceil((new Date(checkpointData.territorioTravadoAte) - now) / 1000);
      return res.json({ 
        ok: true, registered: true, braceletCode: normalizedUid,
        territoryLocked: true, remainingSeconds,
        error: `Território ocupado! Aguarde ${remainingSeconds}s`,
        message: `Território ocupado! Aguarde ${remainingSeconds}s`
      });
    }
    
    if (!crianca.timeId) {
      return res.json({
        ok: true,
        registered: true,
        autorizado: false,
        braceletCode: normalizedUid,
        error: 'Criança sem time associado',
        message: 'Atribua a criança a um time antes de iniciar o jogo'
      });
    }

    const ownerIsSameTeam = String(checkpointData.territorioDonoTimeId || '').trim().toLowerCase()
      === String(crianca.timeId).trim().toLowerCase();

    // Depois que o lock termina, o mesmo time respeita o cooldown de 60s.
    if (ownerIsSameTeam && isCooldown) {
      const remainingSeconds = Math.ceil((new Date(checkpointData.territorioCooldownAte) - now) / 1000);
      return res.json({
        ok: true, registered: true, autorizado: false,
        braceletCode: normalizedUid,
        teamAlreadyOwns: true,
        remainingSeconds,
        error: `Seu time já conquistou! Aguarde ${remainingSeconds}s`,
        message: `Seu time já conquistou! Aguarde ${remainingSeconds}s`
      });
    }
    
    const pointsAwarded = checkpointData.points || 10;
    const lockDuration = 15000;  // 15 segundos de lock (ninguém consegue)
    const cooldownDuration = 60000;  // 60 segundos para o mesmo time
    
    const lockedUntil = new Date(now.getTime() + lockDuration);
    const cooldownUntil = new Date(now.getTime() + cooldownDuration);
    
    // A conquista, a pontuação e os dois históricos precisam ser confirmados
    // juntos. Se qualquer escrita falhar, toda a operação é desfeita.
    const transactionResult = await withTransaction(async (tx) => {
      const territoryUpdate = await tx.query(`
        UPDATE pontoVerificacao SET
          territorioDonoTimeId = @timeId,
          territorioTravadoAte = @lockedUntil,
          territorioCooldownAte = @cooldownUntil,
          ultimoConquistadoEm = @now
        WHERE id = @checkpointId
          AND eventoId = @eventoId
          AND empresaId = @empresaId
          AND (territorioTravadoAte IS NULL OR territorioTravadoAte <= @now)
          AND (
            territorioDonoTimeId IS NULL
            OR LOWER(CAST(territorioDonoTimeId AS VARCHAR(36))) <> LOWER(CAST(@timeId AS VARCHAR(36)))
            OR territorioCooldownAte IS NULL
            OR territorioCooldownAte <= @now
          )
      `, {
        timeId: crianca.timeId,
        lockedUntil,
        cooldownUntil,
        now,
        checkpointId,
        eventoId: crianca.eventoId,
        empresaId: crianca.empresaId,
      });

      if ((territoryUpdate.rowsAffected?.[0] || 0) === 0) {
        return { conflict: true };
      }

      await tx.query(
        'UPDATE criancas SET scores = scores + @points WHERE id = @criancaId',
        { points: pointsAwarded, criancaId: crianca.id }
      );

      await tx.query(
        `UPDATE times SET points = (SELECT ISNULL(SUM(scores), 0) FROM criancas WHERE timeId = @timeId)
         WHERE id = @timeId`,
        { timeId: crianca.timeId }
      );

      await tx.query(
        `INSERT INTO leituras
          (id, checkpointId, criancaId, uid, brincadeiraId, autorizado,
           pontosAtribuidos, forcaSinal, empresaId, session_id)
         VALUES (@id, @checkpointId, @criancaId, @uid, @brincadeiraId, 1,
                 @points, @signal, @empresaId, @sessionId)`,
        {
          id: leituraId,
          checkpointId,
          criancaId: crianca.id,
          uid: normalizedUid,
          brincadeiraId: brincadeiraId || null,
          points: pointsAwarded,
          signal: signal || -45,
          empresaId: crianca.empresaId,
          sessionId: global.currentSessionId || null,
        }
      );
      console.log(`   📝 [LEITURA] Inserida com session_id=${global.currentSessionId || 'NULL'}`);

      await tx.query(
        `INSERT INTO pontuacoes
          (id, eventoId, criancaId, brincadeiraId, checkpointId, points, leituraId, empresaId)
         VALUES (@id, @eventoId, @criancaId, @brincadeiraId, @checkpointId, @points, @leituraId, @empresaId)`,
        {
          id: uuidv4(),
          eventoId: crianca.eventoId,
          criancaId: crianca.id,
          brincadeiraId: brincadeiraId || null,
          checkpointId,
          points: pointsAwarded,
          leituraId,
          empresaId: crianca.empresaId,
        }
      );

      const time = await tx.queryOne('SELECT color FROM times WHERE id = @id', { id: crianca.timeId });
      return {
        conflict: false,
        teamColor: time?.color || '#00AA00',
      };
    });

    if (transactionResult.conflict) {
      const current = await queryOne(
        'SELECT territorioTravadoAte, territorioCooldownAte, territorioDonoTimeId FROM pontoVerificacao WHERE id = @id',
        { id: checkpointId }
      );
      const currentLocked = current?.territorioTravadoAte && new Date(current.territorioTravadoAte) > now;
      const currentOwnerIsSame = String(current?.territorioDonoTimeId || '').trim().toLowerCase()
        === String(crianca.timeId).trim().toLowerCase();
      const currentCooldown = current?.territorioCooldownAte && new Date(current.territorioCooldownAte) > now;
      const remainingSeconds = currentLocked
        ? Math.ceil((new Date(current.territorioTravadoAte) - now) / 1000)
        : currentCooldown && currentOwnerIsSame
          ? Math.ceil((new Date(current.territorioCooldownAte) - now) / 1000)
          : 0;

      return res.json({
        ok: true,
        registered: true,
        autorizado: false,
        braceletCode: normalizedUid,
        territoryLocked: Boolean(currentLocked),
        teamAlreadyOwns: Boolean(currentOwnerIsSame && currentCooldown),
        remainingSeconds,
        error: currentLocked
          ? `Território ocupado! Aguarde ${remainingSeconds}s`
          : currentOwnerIsSame && currentCooldown
            ? `Seu time já conquistou! Aguarde ${remainingSeconds}s`
            : 'Território foi conquistado por outra leitura',
        message: currentLocked
          ? `Território ocupado! Aguarde ${remainingSeconds}s`
          : currentOwnerIsSame && currentCooldown
            ? `Seu time já conquistou! Aguarde ${remainingSeconds}s`
            : 'Território foi conquistado por outra leitura'
      });
    }

    const teamColor = transactionResult.teamColor;
    console.log(`✅ [LEITURA] Transação confirmada para ${leituraId}`);
    
    // ✅ Broadcast APENAS quando evento está ativo (já passou na validação acima)
    console.log(`📡 [LEITURA] Enviando TERRITORY_CONQUERED broadcast...`);
    
    // 📍 Buscar coordenadas do checkpoint para rastreio no mobile
    const checkpointCoords = await queryOne(
      'SELECT mapaX, mapaY FROM pontoVerificacao WHERE id = @id',
      { id: checkpointId }
    );
    
    console.log(`🎬 [RASTREIO] Zone Conquest - Checkpoint: ${checkpointId}`);
    console.log(`🎬 [RASTREIO]   - checkpointCoords: ${JSON.stringify(checkpointCoords)}`);
    console.log(`🎬 [RASTREIO]   - mapaX: ${checkpointCoords?.mapaX} (type: ${typeof checkpointCoords?.mapaX})`);
    console.log(`🎬 [RASTREIO]   - mapaY: ${checkpointCoords?.mapaY} (type: ${typeof checkpointCoords?.mapaY})`);
    
    // ⚠️ CRITICAL DEBUG: Se coordinates são NULL, esse é o problema!
    if (checkpointCoords?.mapaX == null || checkpointCoords?.mapaY == null) {
      console.error(`❌ [RASTREIO] CRÍTICO: Checkpoint ${checkpointId} não tem coordenadas! mapaX=${checkpointCoords?.mapaX}, mapaY=${checkpointCoords?.mapaY}`);
      console.error(`   Verifique se a coluna 'mapaX' e 'mapaY' existem e têm valores para este checkpoint`);
    }
    
    const zonePayload = {
      type: 'TERRITORY_CONQUERED',
      payload: {
        id: leituraId,
        checkpointId,
        uid: normalizedUid,
        criancaId: crianca.id,
        criancaName: crianca.name,
        timeId: crianca.timeId,
        teamColor,
        points: pointsAwarded,
        lockDurationSeconds: 15,
        timestamp: now.toISOString(),
        eventoId: crianca.eventoId,
        gameType: 'zone_conquest',
        mapX: checkpointCoords?.mapaX,
        mapY: checkpointCoords?.mapaY,
      }
    };
    
    console.log(`📡 [RASTREIO] Enviando TERRITORY_CONQUERED para Zone Conquest:`);
    console.log(`   - Destinatário: evento ${crianca.eventoId}`);
    console.log(`   - Criança: ${crianca.name}`);
    console.log(`   - Checkpoint: ${checkpointId}`);
    console.log(`   - Coordenadas: mapX=${zonePayload.payload.mapX}, mapY=${zonePayload.payload.mapY}`);
    console.log(`   - Estrutura completa: ${JSON.stringify(zonePayload, null, 2)}`);
    
    broadcast(zonePayload);
    await broadcastChildCheckpointPassed({
      checkpointId, crianca, eventoId: crianca.eventoId, gameType: 'zone_conquest',
      teamColor, leituraId, uid: normalizedUid, now,
    });

    console.log(`✅ [LEITURA] Pontos processados com sucesso!\n`);
    
    res.json({ 
      ok: true, 
      registered: true,
      autorizado: true,
      teamColor, 
      points: pointsAwarded,
      criancaName: crianca.name, 
      readingId: leituraId,
      message: `${crianca.name} conquistou o território! +${pointsAwarded}pt`
    });
    
  } catch (err) {
    console.error('❌ [LEITURA] Erro ao processar leitura:', err);
    console.error('   Stack:', err.stack);
    console.error('   Message:', err.message);
    console.error('   Code:', err.codigo);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// 🆕 Status do Zone Conquest (TEAM ou INDIVIDUAL)
router.get('/:eventoId/zone-conquest/status', verifyToken, async (req, res) => {
  try {
    const eventoId = req.params.eventoId;
    
    // Validar acesso ao evento
    const evento = await queryOne(
      'SELECT id, empresaId FROM eventos WHERE id = @id',
      { id: eventoId }
    );
    
    if (!evento) {
      return res.status(404).json({ error: 'Evento não encontrado' });
    }
    
    if (!isMaster(req) && evento.empresaId !== req.user.empresaId) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence a esta empresa' });
    }

    // Verificar qual tipo de jogo está rodando
    const teamGame = await getActiveZoneConquestTeamGame(eventoId);
    const individualGame = await getActiveZoneConquestIndividualGame(eventoId);

    let status = null;

    if (teamGame) {
      status = await getZoneConquestTeamStatus(eventoId);
    } else if (individualGame) {
      status = await getZoneConquestIndividualStatus(eventoId);
    }
    
    if (!status) {
      return res.json({
        gameRunning: false,
        mode: 'none',
        message: 'Nenhum jogo de Zone Conquest ativo',
      });
    }

    res.json(status);
  } catch (err) {
    console.error('❌ Erro ao buscar status do Zone Conquest:', err);
    res.status(500).json({ error: err.message });
  }
});

// Histórico de conquistas do evento usado pelos telões. A consulta é sempre
// limitada ao tenant do usuário e ao evento selecionado pela recepção.
router.get('/eventos/:eventoId/historico', verifyToken, async (req, res) => {
  try {
    const eventoId = String(req.params.eventoId || '').trim();
    const brincadeiraId = String(req.query.brincadeiraId || '').trim();
    const empresaId = req.user.empresaId;
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 100, 1), 200);
    const master = isMaster(req) ? 1 : 0;
    const sessionId = String(req.query.sessionId || '').trim(); // 🆕 Adicionar filtro por sessionId

    const evento = await queryOne(
      'SELECT id, empresaId FROM eventos WHERE LOWER(id) = LOWER(@eventoId)',
      { eventoId }
    );
    if (!evento) return res.status(404).json({ error: 'Evento não encontrado' });
    if (!master && String(evento.empresaId).toLowerCase() !== String(empresaId).toLowerCase()) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence a esta empresa' });
    }

    // 🆕 Se sessionId foi fornecido, buscar de leituras com filtro de session_id
    // Caso contrário, buscar de pontuacoes (compatibilidade com dados antigos)
    let history;
    if (sessionId) {
      console.log(`   🔍 [HISTORICO] Filtrando por session_id=${sessionId}`);
      history = await allQuery(`
        SELECT TOP (@limit)
          l.id,
          c.eventoId,
          l.criancaId AS child_id,
          c.name AS child_name,
          c.nickname AS child_nickname,
          l.checkpointId,
          cp.name AS checkpoint_name,
          l.pontosAtribuidos AS points,
          l.criadoEm,
          t.color AS team_color
        FROM leituras l
        LEFT JOIN criancas c ON c.id = l.criancaId
        LEFT JOIN pontoVerificacao cp ON cp.id = l.checkpointId
        LEFT JOIN times t ON t.id = c.timeId
        WHERE LOWER(c.eventoId) = LOWER(@eventoId)
          AND l.session_id = @sessionId
          AND (l.empresaId = @empresaId OR @master = 1)
        ORDER BY l.criadoEm DESC
      `, { limit, eventoId, empresaId, master, sessionId });
    } else {
      history = await allQuery(`
        SELECT TOP (@limit)
          p.id,
          p.eventoId,
          p.criancaId AS child_id,
          c.name AS child_name,
          c.nickname AS child_nickname,
          p.checkpointId,
          cp.name AS checkpoint_name,
          p.points,
          p.criadoEm,
          t.color AS team_color
        FROM pontuacoes p
        LEFT JOIN criancas c ON c.id = p.criancaId
        LEFT JOIN pontoVerificacao cp ON cp.id = p.checkpointId
        LEFT JOIN times t ON t.id = c.timeId
        WHERE LOWER(p.eventoId) = LOWER(@eventoId)
          AND (p.empresaId = @empresaId OR @master = 1)
        ORDER BY p.criadoEm DESC
      `, { limit, eventoId, empresaId, master });

      // O app dos pais usa este histórico para saber por qual checkpoint cada
      // criança passou por último. `pontuacoes` só é gravada pelo fluxo de zona
      // antigo; Tesouro, Monstro e Zone Conquest gravam só em `leituras`.
      // Opt-in (allGames=1) para não mudar os contadores do web, que também
      // chama este endpoint sem sessionId.
      if (req.query.allGames === '1') {
        const extra = await allQuery(`
          SELECT TOP (@limit)
            l.id,
            c.eventoId,
            l.criancaId AS child_id,
            c.name AS child_name,
            c.nickname AS child_nickname,
            l.checkpointId,
            cp.name AS checkpoint_name,
            l.pontosAtribuidos AS points,
            l.criadoEm,
            t.color AS team_color
          FROM leituras l
          LEFT JOIN criancas c ON c.id = l.criancaId
          LEFT JOIN pontoVerificacao cp ON cp.id = l.checkpointId
          LEFT JOIN times t ON t.id = c.timeId
          WHERE LOWER(c.eventoId) = LOWER(@eventoId)
            AND l.autorizado = 1
            AND (l.empresaId = @empresaId OR @master = 1)
            AND NOT EXISTS (SELECT 1 FROM pontuacoes p WHERE p.leituraId = l.id)
          ORDER BY l.criadoEm DESC
        `, { limit, eventoId, empresaId, master });

        history = [...history, ...extra]
          .sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm))
          .slice(0, limit);
      }
    }

    res.json(history);
  } catch (error) {
    console.error('❌ Erro ao carregar histórico do evento para o telão:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
