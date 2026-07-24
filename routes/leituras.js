// routes/leituras.js - Leituras (ESP32)
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { query, queryOne, allQuery } = require('../database');
const { normalizeUid, uidSqlExpression } = require('../utils/uid');
const {
  getActiveSession,
  processTreasureScan,
} = require('../utils/treasure');

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

router.post('/', async (req, res) => {
  try {
    const { checkpointId, uid, brincadeiraId, signal } = req.body;
    const normalizedUid = normalizeUid(uid);
    const now = new Date();

    if (!checkpointId || !normalizedUid) {
      return res.status(400).json({ error: 'checkpointId e uid são obrigatórios' });
    }
    
    // O checkpoint define a empresa e o evento da leitura.
    const checkpoint = await queryOne('SELECT id, empresa_id, evento_id FROM checkpoints WHERE id = @id', { id: checkpointId });
    if (!checkpoint) {
      console.log(`❌ [LEITURA] Checkpoint não encontrado: ${checkpointId}`);
      return res.status(404).json({ error: 'Checkpoint não encontrado' });
    }
    
    // ✨ NOVO: Atualizar status do checkpoint para 'online' quando receber leitura
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
    
    // UID canônico: aceita tanto 7C3A1672 quanto 7C:3A:16:72.
    const broadcastData = {
      type: 'NFC_READING_DETECTED',
      payload: {
        braceletCode: normalizedUid,
        timestamp: now.toISOString(),
        checkpointId,
        eventoId: checkpoint.evento_id
      }
    };
    
    console.log(`\n📱 [LEITURA] Pulseira lida: ${normalizedUid} (original: ${uid})`);
    broadcast(broadcastData);
    
    // Aceita registros antigos com dois-pontos, hífen ou espaços.
    const crianca = await queryOne(
      `SELECT c.* FROM criancas c
       WHERE ${uidSqlExpression('c.bracelet_code')} = @uid`,
      { uid: normalizedUid }
    );
    
    if (!crianca) {
      const pulseira = await queryOne(
        `SELECT code, empresa_id, status, crianca_id FROM pulseiras
         WHERE ${uidSqlExpression('code')} = @uid`,
        { uid: normalizedUid }
      );

      if (pulseira && pulseira.empresa_id !== checkpoint.empresa_id) {
        console.log(`❌ [LEITURA] Pulseira de outra empresa no checkpoint ${checkpointId}`);
        return res.status(403).json({ ok: false, error: 'Pulseira não pertence a esta empresa' });
      }

      console.log(pulseira
        ? '   ⚠️ [LEITURA] Pulseira existe, mas ainda não está vinculada a uma criança'
        : '   ⚠️ [LEITURA] Pulseira não cadastrada ainda');

      return res.json({ 
        ok: true, 
        registered: false,
        braceletExists: Boolean(pulseira),
        braceletCode: normalizedUid,
        message: pulseira
          ? 'Pulseira cadastrada, mas ainda não está vinculada a uma criança'
          : 'Pulseira ainda não está cadastrada'
      });
    }
    
    // ✅ VALIDAÇÃO CROSS-TENANT/EVENTO: a criança deve pertencer ao mesmo
    // tenant e ao mesmo evento do checkpoint que recebeu a leitura.
    if (crianca.empresa_id !== checkpoint.empresa_id) {
      console.log(`❌ [LEITURA] Violação de segurança: criança da empresa ${crianca.empresa_id} tentou usar checkpoint da empresa ${checkpoint.empresa_id}`);
      return res.status(403).json({ 
        ok: false,
        error: 'Segurança: empresa_id não corresponde' 
      });
    }

    if (crianca.evento_id !== checkpoint.evento_id) {
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
    const evento = await queryOne('SELECT id, status FROM eventos WHERE id = @id', { id: crianca.evento_id });
    
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
    const treasureSession = await getActiveSession(checkpoint.evento_id);
    if (treasureSession) {
      const treasureResult = await processTreasureScan({
        eventoId: checkpoint.evento_id,
        checkpointId,
        crianca,
        brincadeiraId: treasureSession.brincadeira_id,
        uid: normalizedUid,
        now,
      });

      if (treasureResult) {
        if (treasureResult.accepted && !treasureResult.duplicate) {
          await query(
            `INSERT INTO leituras
              (id, checkpoint_id, crianca_id, uid, brincadeira_id, authorized,
               points_awarded, signal_strength, empresa_id)
             VALUES (@id, @checkpointId, @criancaId, @uid, @brincadeiraId, 1,
                     0, @signal, @empresaId)`,
            {
              id: uuidv4(),
              checkpointId,
              criancaId: crianca.id,
              uid: normalizedUid,
              brincadeiraId: treasureSession.brincadeira_id,
              signal: signal || -45,
              empresaId: crianca.empresa_id,
            }
          );
        }

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
          nextTargetCheckpointId: treasureResult.nextTargetCheckpointId ?? null,
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
    
    // Depois que o lock inicial termina, o mesmo time não pode pontuar
    // novamente enquanto continuar sendo o dono. Apenas outro time troca o domínio.
    if (crianca.time_id && checkpointData.territory_owner_time_id === crianca.time_id) {
      console.log(`   🏳️ [LEITURA] O time ${crianca.time_id} já domina este território`);
      return res.json({ 
        ok: true, registered: true, authorized: false,
        braceletCode: normalizedUid,
        teamAlreadyOwns: true,
        error: 'Seu time já domina este território',
        message: 'Seu time já domina este território'
      });
    }
    
    const leituraId = uuidv4();
    const pointsAwarded = checkpointData.points || 10;
    const lockDuration = 15000;  // 15 segundos de lock (ninguém consegue)
    const cooldownDuration = 0;  // Sem cooldown adicional - após lock, libera pra todos
    
    const lockedUntil = new Date(now.getTime() + lockDuration);
    const cooldownUntil = new Date(now.getTime() + lockDuration);  // Mesmo que lockedUntil
    
    console.log(`🎨 [LEITURA] Buscando cor do time para criança: ${crianca.name} (time_id: ${crianca.time_id})`);
    
    await query(`
      UPDATE checkpoints SET 
        territory_owner_time_id = @timeId,
        territory_locked_until = @lockedUntil,
        territory_cooldown_until = @cooldownUntil,
        last_conquered_at = @now
      WHERE id = @checkpointId
    `, { timeId: crianca.time_id, lockedUntil, cooldownUntil, now, checkpointId });
    
    // ✅ Atualizar pontos (isso acontece quando evento está ativo)
    console.log(`💯 [LEITURA] Atualizando scores da criança e do time...`);
    await query('UPDATE criancas SET scores = scores + @points WHERE id = @criancaId', 
      { points: pointsAwarded, criancaId: crianca.id });
    
    if (crianca.time_id) {
      await query(
        `UPDATE times SET points = (SELECT ISNULL(SUM(scores), 0) FROM criancas WHERE time_id = @timeId) 
         WHERE id = @timeId`,
        { timeId: crianca.time_id }
      );
    }
    
    await query(
      `INSERT INTO leituras (id, checkpoint_id, crianca_id, uid, brincadeira_id, authorized, points_awarded, signal_strength, empresa_id) 
       VALUES (@id, @checkpointId, @criancaId, @uid, @brincadeiraId, 1, @points, @signal, @empresaId)`,
      { id: leituraId, checkpointId, criancaId: crianca.id, uid: normalizedUid, brincadeiraId: brincadeiraId || null, points: pointsAwarded, signal: signal || -45, empresaId: crianca.empresa_id }
    );
    
    await query(
      `INSERT INTO pontuacoes (id, evento_id, crianca_id, brincadeira_id, checkpoint_id, points, leitura_id, empresa_id) 
       VALUES (@id, @eventoId, @criancaId, @brincadeiraId, @checkpointId, @points, @leituraId, @empresaId)`,
      { id: uuidv4(), eventoId: crianca.evento_id, criancaId: crianca.id, brincadeiraId: brincadeiraId || null, checkpointId, points: pointsAwarded, leituraId, empresaId: crianca.empresa_id }
    );
    
    // 🔴 CORRIGIDO: Sempre buscar a cor do time, com fallback
    let teamColor = '#00AA00';  // Verde como fallback
    if (crianca.time_id) {
      const time = await queryOne('SELECT color FROM times WHERE id = @id', { id: crianca.time_id });
      if (time && time.color) {
        teamColor = time.color;
        console.log(`✅ [LEITURA] Cor do time encontrada: ${teamColor}`);
      } else {
        console.log(`⚠️ [LEITURA] Time não encontrado (ID: ${crianca.time_id}), usando cor padrão`);
      }
    } else {
      console.log(`⚠️ [LEITURA] Criança sem time associado, usando cor padrão`);
    }
    
    console.log(`🎨 [LEITURA] Cor final retornada: ${teamColor}`);
    
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
      lockDurationSeconds: 15,
      message: `${crianca.name} conquistou o território! +${pointsAwarded}pt`
    });
    
  } catch (err) {
    console.error('❌ [LEITURA] Erro ao processar leitura:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
