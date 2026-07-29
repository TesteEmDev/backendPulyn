// routes/leituras.js - Leituras (ESP32)
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { query, queryOne, allQuery, withTransaction } = require('../database');
const { normalizeUid, uidSqlExpression } = require('../utils/uid');
const {
  getActiveSession,
  processTreasureScan,
} = require('../utils/treasure');

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
    `SELECT l.id, l.checkpoint_id, l.authorized, l.points_awarded,
            l.uid, l.crianca_id, l.brincadeira_id, c.name AS crianca_name,
            c.time_id, t.color AS team_color
     FROM leituras l
     LEFT JOIN criancas c ON c.id = l.crianca_id
     LEFT JOIN times t ON t.id = c.time_id
     WHERE l.id = @readingId`,
    { readingId }
  );

  if (!existing) return null;
  if (String(existing.checkpoint_id).trim().toLowerCase() !== String(checkpoint.id).trim().toLowerCase()) {
    const error = new Error('readingId já foi usado em outro checkpoint');
    error.statusCode = 409;
    throw error;
  }
  return existing;
}

async function sendProcessedReading(res, reading) {
  const game = reading.brincadeira_id
    ? await queryOne('SELECT type FROM brincadeiras WHERE id = @id', { id: reading.brincadeira_id })
    : null;
  const isTreasure = game?.type === 'treasure_hunt';

  return res.json({
    ok: true,
    registered: true,
    authorized: Boolean(reading.authorized),
    idempotent: true,
    readingId: reading.id,
    braceletCode: reading.uid,
    criancaName: reading.crianca_name || undefined,
    teamColor: reading.team_color || '',
    points: Number(reading.points_awarded || 0),
    treasure: isTreasure,
    treasureAccepted: isTreasure && Boolean(reading.authorized),
    treasureTeamComplete: false,
    message: 'Leitura já processada anteriormente',
  });
}

function broadcast(data) {
  if (global.broadcastToEvent && data.payload?.eventoId) {
    // Usar broadcast por evento se disponível
    global.broadcastToEvent(data.payload.eventoId, data);
  } else if (global.wsServer) {
    // Fallback: broadcast global
    global.wsServer.clients.forEach((client) => {
      if (client.readyState === 1) {
        client.send(JSON.stringify(data));
      }
    });
  }
}

router.post('/reception', async (req, res) => {
  try {
    const { checkpointId, uid } = req.body;
    const normalizedUid = normalizeUid(uid);
    const now = new Date();

    if (!checkpointId || !normalizedUid) {
      return res.status(400).json({ error: 'checkpointId e uid são obrigatórios' });
    }

    // O checkpoint fornece o evento para que somente a recepção daquele evento
    // receba o broadcast. Nenhuma regra de jogo é executada nesta rota.
    const checkpoint = await queryOne(
      'SELECT id, empresa_id, evento_id FROM checkpoints WHERE id = @id',
      { id: checkpointId }
    );

    if (!checkpoint) {
      return res.status(404).json({ error: 'Checkpoint de recepção não encontrado' });
    }

    const pulseira = await queryOne(
      `SELECT code, status, crianca_id
       FROM pulseiras
       WHERE ${uidSqlExpression('code')} = @uid
         AND LOWER(empresa_id) = LOWER(@empresaId)`,
      { uid: normalizedUid, empresaId: checkpoint.empresa_id }
    );

    const registered = Boolean(pulseira);

    broadcast({
      type: 'NFC_READING_DETECTED',
      payload: {
        braceletCode: normalizedUid,
        timestamp: now.toISOString(),
        checkpointId,
        eventoId: checkpoint.evento_id,
        source: 'reception',
      },
    });

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
    const { checkpointId, uid, brincadeiraId, signal, readingId: requestedReadingId } = req.body;
    const normalizedUid = normalizeUid(uid);
    const readingId = getReadingId(req, requestedReadingId);
    const now = new Date();

    if (!checkpointId || !normalizedUid) {
      return res.status(400).json({ error: 'checkpointId e uid são obrigatórios' });
    }
    
    // O checkpoint define a empresa e o evento da leitura.
    const checkpoint = await queryOne('SELECT id, empresa_id, evento_id, status FROM checkpoints WHERE id = @id', { id: checkpointId });
    if (!checkpoint) {
      console.log(`❌ [LEITURA] Checkpoint não encontrado: ${checkpointId}`);
      return res.status(404).json({ error: 'Checkpoint não encontrado' });
    }

    const processedReading = await findProcessedReading(readingId, checkpoint);
    if (processedReading) {
      console.log(`↩️ [LEITURA] Leitura ${readingId} já processada; sem nova pontuação ou broadcast`);
      return await sendProcessedReading(res, processedReading);
    }

    const leituraId = readingId || uuidv4();
    
    const broadcastData = {
      type: 'NFC_READING_DETECTED',
      payload: {
        braceletCode: normalizedUid,
        timestamp: now.toISOString(),
        checkpointId,
        eventoId: checkpoint.evento_id
      }
    };

    // A leitura é enviada também quando a pulseira ainda não existe no banco,
    // pois as telas de recepção precisam poder cadastrá-la pelo NFC.
    console.log(`\n📱 [LEITURA] Pulseira lida: ${normalizedUid} (original: ${uid})`);
    broadcast(broadcastData);

    const treasureSession = await getActiveSession(checkpoint.evento_id);
    const checkpointIsOnline = String(checkpoint.status || '').trim().toLowerCase() === 'online';

    // Durante o Caça ao Tesouro, um checkpoint offline não deve voltar a ser
    // considerado online apenas porque recebeu uma tentativa de leitura.
    if (!treasureSession || checkpointIsOnline) {
      try {
        await query(
          `UPDATE checkpoints SET status = 'online', last_seen = @now WHERE id = @checkpointId`,
          { checkpointId, now }
        );
      } catch (err) {
      // Se coluna last_seen não existe ainda, só atualiza o status
      if (err.message.includes('last_seen')) {
        console.log('⚠️ Coluna last_seen ainda não existe, atualizando apenas status...');
        await query(
          `UPDATE checkpoints SET status = 'online' WHERE id = @checkpointId`,
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
      `SELECT code, empresa_id, status, crianca_id
       FROM pulseiras
       WHERE ${uidSqlExpression('code')} = @uid`,
      { uid: normalizedUid }
    );

    if (pulseira && String(pulseira.empresa_id).trim().toLowerCase() !== String(checkpoint.empresa_id).trim().toLowerCase()) {
      console.log(`❌ [LEITURA] Pulseira de outra empresa no checkpoint ${checkpointId}`);
      return res.status(403).json({ ok: false, error: 'Pulseira não pertence a esta empresa' });
    }

    if (!pulseira) {
      console.log('   ⚠️ [LEITURA] Pulseira não cadastrada ainda');
      return res.json({
        ok: true,
        registered: false,
        braceletExists: false,
        braceletCode: normalizedUid,
        message: 'Pulseira ainda não está cadastrada'
      });
    }

    const braceletStatus = String(pulseira.status || '').trim().toLowerCase();
    if (braceletStatus !== 'em_uso' || !pulseira.crianca_id) {
      console.log(`   ⚠️ [LEITURA] Pulseira não está vinculada a uma criança ativa (status: ${pulseira.status})`);
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
         AND ${uidSqlExpression('c.bracelet_code')} = @uid`,
      { criancaId: pulseira.crianca_id, uid: normalizedUid }
    );

    if (!crianca) {
      console.log('   ⚠️ [LEITURA] Vínculo da pulseira inconsistente com a criança');
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
    if (String(crianca.empresa_id).trim().toLowerCase() !== String(checkpoint.empresa_id).trim().toLowerCase()) {
      console.log(`❌ [LEITURA] Violação de segurança: criança da empresa ${crianca.empresa_id} tentou usar checkpoint da empresa ${checkpoint.empresa_id}`);
      return res.status(403).json({ 
        ok: false,
        error: 'Segurança: empresa_id não corresponde' 
      });
    }

    if (String(crianca.evento_id).trim().toLowerCase() !== String(checkpoint.evento_id).trim().toLowerCase()) {
      console.log(`⚠️ [LEITURA] Pulseira cadastrada em outro evento: criança=${crianca.evento_id}, checkpoint=${checkpoint.evento_id}`);
      return res.json({
        ok: true,
        registered: true,
        braceletCode: normalizedUid,
        authorized: false,
        message: 'Pulseira cadastrada em outro evento'
      });
    }
    
    // ✅ Pulseira já cadastrada - processar como leitura de jogo
    console.log(`   ✅ [LEITURA] Pulseira cadastrada: ${crianca.name} (evento_id: ${crianca.evento_id}, empresa_id: ${crianca.empresa_id})`);
    
    // ✨ NOVO: Validar se o evento está ACTIVE antes de processar pontos
    const evento = await queryOne('SELECT id, status FROM eventos WHERE LOWER(id) = LOWER(@id)', { id: crianca.evento_id });
    
    console.log(`   📋 [LEITURA] Verificando status do evento...`);
    console.log(`      ID do Evento: ${crianca.evento_id}`);
    console.log(`      Status: ${evento?.status || 'NÃO ENCONTRADO'}`);
    
    if (!evento) {
      console.log(`   ❌ [LEITURA] Evento não encontrado! Pulseira não será processada.`);
      return res.json({ 
        ok: true, 
        registered: true, 
        braceletCode: normalizedUid,
        authorized: false,
        message: 'Evento não encontrado. Inicie o evento primeiro.'
      });
    }
    
    if (evento.status !== 'active') {
      console.log(`   ⚠️ [LEITURA] Evento NÃO está ativo (status: ${evento.status}). BLOQUEANDO pontos!`);
      return res.json({ 
        ok: true, 
        registered: true, 
        braceletCode: normalizedUid,
        authorized: false,
        message: 'Jogo não foi iniciado ainda. Inicie o jogo no Game Master para começar a contar pontos.'
      });
    }
    
    // Caça ao Tesouro usa uma regra própria e não pontua como Zona.
    if (treasureSession) {
      if (!checkpointIsOnline) {
        const offlineMessage = 'Este checkpoint está offline e não pode ser usado no Caça ao Tesouro';
        return res.json({
          ok: true,
          registered: true,
          authorized: false,
          treasure: true,
          treasureAccepted: false,
          error: offlineMessage,
          message: offlineMessage,
        });
      }

      const treasureResult = await withTransaction(async () => {
        const result = await processTreasureScan({
          eventoId: checkpoint.evento_id,
          checkpointId,
          crianca,
          brincadeiraId: treasureSession.brincadeira_id,
          uid: normalizedUid,
          now,
        });

        if (result?.accepted && !result.duplicate) {
          await query(
            `INSERT INTO leituras
              (id, checkpoint_id, crianca_id, uid, brincadeira_id, authorized,
               points_awarded, signal_strength, empresa_id)
             VALUES (@id, @checkpointId, @criancaId, @uid, @brincadeiraId, 1,
                     0, @signal, @empresaId)`,
            {
              id: leituraId,
              checkpointId,
              criancaId: crianca.id,
              uid: normalizedUid,
              brincadeiraId: treasureSession.brincadeira_id,
              signal: signal || -45,
              empresaId: crianca.empresa_id,
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
            timeId: crianca.time_id,
            eventoId: checkpoint.evento_id,
          },
        });

        if (treasureResult.finished && typeof global.finishTreasureGameState === 'function') {
          global.finishTreasureGameState(checkpoint.evento_id, now.toISOString());
        }

        return res.json({
          ok: true,
          registered: true,
          authorized: Boolean(treasureResult.teamComplete),
          treasure: true,
          treasureAccepted: Boolean(treasureResult.accepted),
          treasureTeamComplete: Boolean(treasureResult.teamComplete),
          treasureFinished: Boolean(treasureResult.finished),
          treasureRound: treasureResult.roundNumber || treasureSession.round_number,
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

    const checkpointData = await queryOne('SELECT * FROM checkpoints WHERE id = @id', { id: checkpointId });
    
    if (!checkpointData) {
      console.log(`   ⚠️ [LEITURA] Checkpoint não encontrado`);
      return res.json({ ok: true, registered: true, braceletCode: normalizedUid, message: 'Pulseira cadastrada' });
    }
    
    // Processar conquista de território
    const isLocked = checkpointData.territory_locked_until && new Date(checkpointData.territory_locked_until) > now;
    const isCooldown = checkpointData.territory_cooldown_until && new Date(checkpointData.territory_cooldown_until) > now;
    
    if (isLocked) {
      const remainingSeconds = Math.ceil((new Date(checkpointData.territory_locked_until) - now) / 1000);
      console.log(`   🔒 [LEITURA] Território BLOQUEADO por ${remainingSeconds}s`);
      return res.json({ 
        ok: true, registered: true, braceletCode: normalizedUid,
        territoryLocked: true, remainingSeconds,
        error: `Território ocupado! Aguarde ${remainingSeconds}s`,
        message: `Território ocupado! Aguarde ${remainingSeconds}s`
      });
    }
    
    if (!crianca.time_id) {
      return res.json({
        ok: true,
        registered: true,
        authorized: false,
        braceletCode: normalizedUid,
        error: 'Criança sem time associado',
        message: 'Atribua a criança a um time antes de iniciar o jogo'
      });
    }

    const ownerIsSameTeam = String(checkpointData.territory_owner_time_id || '').trim().toLowerCase()
      === String(crianca.time_id).trim().toLowerCase();

    // Depois que o lock termina, o mesmo time respeita o cooldown de 60s.
    if (ownerIsSameTeam && isCooldown) {
      const remainingSeconds = Math.ceil((new Date(checkpointData.territory_cooldown_until) - now) / 1000);
      console.log(`   ⏳ [LEITURA] Time já conquistou este território; cooldown de ${remainingSeconds}s`);
      return res.json({
        ok: true, registered: true, authorized: false,
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
    
    console.log(`🎨 [LEITURA] Buscando cor do time para criança: ${crianca.name} (time_id: ${crianca.time_id})`);
    
    // A conquista, a pontuação e os dois históricos precisam ser confirmados
    // juntos. Se qualquer escrita falhar, toda a operação é desfeita.
    const transactionResult = await withTransaction(async (tx) => {
      const territoryUpdate = await tx.query(`
        UPDATE checkpoints SET
          territory_owner_time_id = @timeId,
          territory_locked_until = @lockedUntil,
          territory_cooldown_until = @cooldownUntil,
          last_conquered_at = @now
        WHERE id = @checkpointId
          AND evento_id = @eventoId
          AND empresa_id = @empresaId
          AND (territory_locked_until IS NULL OR territory_locked_until <= @now)
          AND (
            territory_owner_time_id IS NULL
            OR LOWER(CAST(territory_owner_time_id AS VARCHAR(36))) <> LOWER(CAST(@timeId AS VARCHAR(36)))
            OR territory_cooldown_until IS NULL
            OR territory_cooldown_until <= @now
          )
      `, {
        timeId: crianca.time_id,
        lockedUntil,
        cooldownUntil,
        now,
        checkpointId,
        eventoId: crianca.evento_id,
        empresaId: crianca.empresa_id,
      });

      if ((territoryUpdate.rowsAffected?.[0] || 0) === 0) {
        return { conflict: true };
      }

      await tx.query(
        'UPDATE criancas SET scores = scores + @points WHERE id = @criancaId',
        { points: pointsAwarded, criancaId: crianca.id }
      );

      await tx.query(
        `UPDATE times SET points = (SELECT ISNULL(SUM(scores), 0) FROM criancas WHERE time_id = @timeId)
         WHERE id = @timeId`,
        { timeId: crianca.time_id }
      );

      await tx.query(
        `INSERT INTO leituras
          (id, checkpoint_id, crianca_id, uid, brincadeira_id, authorized,
           points_awarded, signal_strength, empresa_id)
         VALUES (@id, @checkpointId, @criancaId, @uid, @brincadeiraId, 1,
                 @points, @signal, @empresaId)`,
        {
          id: leituraId,
          checkpointId,
          criancaId: crianca.id,
          uid: normalizedUid,
          brincadeiraId: brincadeiraId || null,
          points: pointsAwarded,
          signal: signal || -45,
          empresaId: crianca.empresa_id,
        }
      );

      await tx.query(
        `INSERT INTO pontuacoes
          (id, evento_id, crianca_id, brincadeira_id, checkpoint_id, points, leitura_id, empresa_id)
         VALUES (@id, @eventoId, @criancaId, @brincadeiraId, @checkpointId, @points, @leituraId, @empresaId)`,
        {
          id: uuidv4(),
          eventoId: crianca.evento_id,
          criancaId: crianca.id,
          brincadeiraId: brincadeiraId || null,
          checkpointId,
          points: pointsAwarded,
          leituraId,
          empresaId: crianca.empresa_id,
        }
      );

      const time = await tx.queryOne('SELECT color FROM times WHERE id = @id', { id: crianca.time_id });
      return {
        conflict: false,
        teamColor: time?.color || '#00AA00',
      };
    });

    if (transactionResult.conflict) {
      const current = await queryOne(
        'SELECT territory_locked_until, territory_cooldown_until, territory_owner_time_id FROM checkpoints WHERE id = @id',
        { id: checkpointId }
      );
      const currentLocked = current?.territory_locked_until && new Date(current.territory_locked_until) > now;
      const currentOwnerIsSame = String(current?.territory_owner_time_id || '').trim().toLowerCase()
        === String(crianca.time_id).trim().toLowerCase();
      const currentCooldown = current?.territory_cooldown_until && new Date(current.territory_cooldown_until) > now;
      const remainingSeconds = currentLocked
        ? Math.ceil((new Date(current.territory_locked_until) - now) / 1000)
        : currentCooldown && currentOwnerIsSame
          ? Math.ceil((new Date(current.territory_cooldown_until) - now) / 1000)
          : 0;

      return res.json({
        ok: true,
        registered: true,
        authorized: false,
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
    broadcast({
      type: 'TERRITORY_CONQUERED',
      payload: {
        id: leituraId,
        checkpointId,
        uid: normalizedUid,
        criancaId: crianca.id,
        criancaName: crianca.name,
        timeId: crianca.time_id,
        teamColor,
        points: pointsAwarded,
        lockDurationSeconds: 15,
        timestamp: now.toISOString(),
        eventoId: crianca.evento_id  // ✨ NOVO: Adicionar evento_id para broadcast por sala
      }
    });
    
    console.log(`✅ [LEITURA] Pontos processados com sucesso!\n`);
    
    res.json({ 
      ok: true, 
      registered: true,
      authorized: true,
      teamColor, 
      points: pointsAwarded,
      criancaName: crianca.name, 
      readingId: leituraId,
      message: `${crianca.name} conquistou o território! +${pointsAwarded}pt`
    });
    
  } catch (err) {
    console.error('❌ [LEITURA] Erro ao processar leitura:', err);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

module.exports = router;
