// utils/zoneConquestIndividualDB.js - Zone Conquest INDIVIDUAL com persistência em BD
// Baseado em Monster Hunt: partidas com versionning, participant states, scans com versioning

const { v4: uuidv4 } = require('uuid');
const { query, queryOne, allQuery, withTransaction } = require('../database');

// ==================== FUNÇÕES DE INICIALIZAÇÃO ====================

/**
 * Inicia um novo jogo de Zone Conquest INDIVIDUAL
 * Baseado em startMonsterGame() com TRANSAÇÃO e versionning
 */
async function startZoneConquestIndividual(eventoId, brincadeiraId) {
  if (!eventoId || !brincadeiraId) {
    throw new Error('eventoId e brincadeiraId são obrigatórios');
  }

  try {
    console.log(`🎮 [ZONE-INDIVIDUAL-DB] Iniciando Zone Conquest INDIVIDUAL para evento: ${eventoId}`);

    // 1. Validar brincadeira
    const brincadeira = await queryOne(
      `SELECT id, name, type, empresa_id FROM brincadeiras WHERE id = @id AND LOWER(COALESCE(status, 'active')) <> 'archived'`,
      { id: brincadeiraId }
    );

    if (!brincadeira) {
      throw new Error(`Brincadeira ${brincadeiraId} não encontrada`);
    }

    // 2. Buscar evento
    const evento = await queryOne(
      `SELECT id, empresa_id FROM eventos WHERE id = @id`,
      { id: eventoId }
    );

    if (!evento) {
      throw new Error('Evento não encontrado');
    }

    // 3. Buscar participantes (crianças ativas)
    const participantes = await allQuery(
      `SELECT c.id, c.name, c.evento_id, t.color
       FROM criancas c
       LEFT JOIN times t ON t.id = c.time_id
       WHERE c.evento_id = @eventoId AND c.status = 'ativo'
       ORDER BY c.name`,
      { eventoId }
    );

    if (participantes.length === 0) {
      throw new Error('Nenhum participante cadastrado');
    }

    console.log(`   👥 Participantes encontrados: ${participantes.length}`);

    // 4. Buscar checkpoints
    const checkpoints = await allQuery(
      `SELECT id, name FROM checkpoints
       WHERE LOWER(evento_id) = LOWER(@eventoId)
         AND (checkpoint_purpose IS NULL OR checkpoint_purpose = 'game')`,
      { eventoId }
    );

    console.log(`   📍 Checkpoints encontrados: ${checkpoints.length}`);

    // 5. TRANSAÇÃO: criar partida + participant states
    const partida = await withTransaction(async (tx) => {
      const partidaId = uuidv4();
      const agora = new Date();

      // INSERT partida com version = 0
      await tx.query(
        `INSERT INTO zone_conquest_individual_partidas
         (id, empresa_id, evento_id, brincadeira_id, status, version, started_at)
         VALUES (@id, @empresaId, @eventoId, @brincadeiraId, 'active', 0, @startedAt)`,
        {
          id: partidaId,
          empresaId: evento.empresa_id,
          eventoId,
          brincadeiraId,
          startedAt: agora,
        }
      );

      // INSERT participant state para cada participante com version = 0
      for (const participante of participantes) {
        await tx.query(
          `INSERT INTO zone_conquest_individual_participant_states
           (id, partida_id, empresa_id, evento_id, crianca_id, status, checkpoints_read, total_points, ranking, version, started_at)
           VALUES (@id, @partidaId, @empresaId, @eventoId, @criancaId, 'active', 0, 0, NULL, 0, @startedAt)`,
          {
            id: uuidv4(),
            partidaId,
            empresaId: evento.empresa_id,
            eventoId,
            criancaId: participante.id,
            startedAt: agora,
          }
        );
      }

      return { id: partidaId, started_at: agora };
    });

    console.log(`   ✅ Partida criada: ${partida.id}`);
    return {
      partida_id: partida.id,
      started_at: partida.started_at,
      participants: participantes.length,
      checkpoints: checkpoints.length,
    };
  } catch (err) {
    console.error('❌ [ZONE-INDIVIDUAL-DB] Erro ao iniciar jogo:', err);
    throw err;
  }
}

// ==================== FUNÇÕES DE PROCESSAMENTO ====================

/**
 * Processa uma leitura de checkpoint com VERSIONNING
 * Baseado em processMonsterScan() com optimistic locking
 */
async function processZoneConquestIndividualScan({
  eventoId,
  checkpointId,
  crianca,
  brincadeiraId,
  uid,
  leituraId,
  now = new Date(),
}) {
  if (!eventoId || !checkpointId || !crianca || !leituraId) {
    return {
      accepted: false,
      error: 'Parâmetros inválidos',
    };
  }

  try {
    console.log(`\n📖 [ZONE-INDIVIDUAL-DB] Processando scan: ${crianca.name} em checkpoint ${checkpointId}`);

    // 1. Obter partida ativa
    const partida = await queryOne(
      `SELECT * FROM zone_conquest_individual_partidas
       WHERE LOWER(evento_id) = LOWER(@eventoId)
         AND status = 'active'
       ORDER BY started_at DESC`,
      { eventoId }
    );

    if (!partida) {
      console.log(`   ❌ Nenhuma partida ativa encontrada`);
      return {
        accepted: false,
        error: 'Jogo não iniciado',
      };
    }

    console.log(`   📋 Partida: ${partida.id}, Version: ${partida.version}`);

    // 2. Obter participant state com VERSIONNING (para optimistic locking)
    const participantState = await queryOne(
      `SELECT * FROM zone_conquest_individual_participant_states
       WHERE partida_id = @partidaId
         AND crianca_id = @criancaId`,
      {
        partidaId: partida.id,
        criancaId: crianca.id,
      }
    );

    if (!participantState) {
      console.log(`   ❌ Estado do participante não encontrado`);
      return {
        accepted: false,
        error: 'Participante não registrado neste jogo',
      };
    }

    // 3. Validar se leitura já foi processada (CONSTRAINT UNIQUE em leitura_id)
    const existingLeitura = await queryOne(
      `SELECT id FROM zone_conquest_individual_scans
       WHERE leitura_id = @leituraId`,
      { leituraId }
    );

    if (existingLeitura) {
      console.log(`   ⚠️ Leitura já foi processada anteriormente`);
      return {
        accepted: false,
        error: 'Leitura já foi processada',
        duplicate: true,
      };
    }

    // 4. Calcular pontos com multiplicador
    const checkpointsReadCount = participantState.checkpoints_read;
    const basePoints = 10;
    const multiplier = 1 + checkpointsReadCount * 0.01;
    const pontos = Math.round(basePoints * multiplier * 100) / 100;

    console.log(`   💰 Pontos: ${basePoints} × ${multiplier.toFixed(2)} = ${pontos}`);

    // 5. TRANSAÇÃO: INSERT scan + UPDATE participant state com VERSIONNING
    const resultado = await withTransaction(async (tx) => {
      const nextVersion = participantState.version + 1;
      const novosPontos = participantState.total_points + pontos;
      const novosCheckpoints = participantState.checkpoints_read + 1;

      // INSERT scan
      await tx.query(
        `INSERT INTO zone_conquest_individual_scans
         (id, partida_id, empresa_id, evento_id, brincadeira_id, checkpoint_id,
          crianca_id, uid, leitura_id, points_awarded, version, scanned_at)
         VALUES (@id, @partidaId, @empresaId, @eventoId, @brincadeiraId, @checkpointId,
                 @criancaId, @uid, @leituraId, @pontos, @version, @agora)`,
        {
          id: uuidv4(),
          partidaId: partida.id,
          empresaId: crianca.empresa_id,
          eventoId,
          brincadeiraId,
          checkpointId,
          criancaId: crianca.id,
          uid,
          leituraId,
          pontos,
          version: nextVersion,
          agora: now,
        }
      );

      // 🆕 INSERT também em leituras para que scoreLog funcione
      await tx.query(
        `INSERT INTO leituras
          (id, checkpoint_id, crianca_id, uid, brincadeira_id, authorized,
           points_awarded, signal_strength, empresa_id, session_id)
         VALUES (@id, @checkpointId, @criancaId, @uid, @brincadeiraId, 1,
                 @points, @signal, @empresaId, @sessionId)`,
        {
          id: leituraId,
          checkpointId,
          criancaId: crianca.id,
          uid,
          brincadeiraId,
          points: pontos,
          signal: -45,
          empresaId: crianca.empresa_id,
          sessionId: global.currentSessionId || null,
        }
      );

      // UPDATE participant state com OPTIMISTIC LOCKING
      // Só atualiza se version combina (previne race condition)
      const updateResult = await tx.query(
        `UPDATE zone_conquest_individual_participant_states SET
           checkpoints_read = @novosCheckpoints,
           total_points = @novosPontos,
           version = @nextVersion,
           updated_at = @agora
         WHERE id = @id
           AND version = @currentVersion`,
        {
          id: participantState.id,
          novosCheckpoints,
          novosPontos,
          nextVersion,
          currentVersion: participantState.version,
          agora: now,
        }
      );

      // Verificar se update foi bem-sucedido (optimistic lock)
      if ((updateResult.rowsAffected?.[0] || 0) === 0) {
        console.log(`   ⚠️ Versão não combina - possível race condition`);
        return {
          accepted: false,
          error: 'Conflito de versão - tente novamente',
          versionConflict: true,
        };
      }

      // UPDATE checkpoint: marcar como dominado
      await tx.query(
        `UPDATE checkpoints SET
           territory_owner_time_id = @criancaId,
           last_conquered_at = @agora
         WHERE id = @checkpointId`,
        {
          checkpointId,
          criancaId: crianca.id,
          agora: now,
        }
      );
      console.log(`   🎨 [ZONE-INDIVIDUAL] Checkpoint ${checkpointId} marcado para participante ${crianca.id}`);

      // Recalcular ranking para a partida
      await recalculateRanking(tx, partida.id);

      return {
        accepted: true,
        points: pontos,
        totalPoints: novosPontos,
        checkpointsRead: novosCheckpoints,
        version: nextVersion,
      };
    });

    if (resultado.accepted) {
      console.log(`   ✅ Scan processado: +${resultado.points} pontos (Total: ${resultado.totalPoints})`);
    }

    return resultado;
  } catch (err) {
    console.error('❌ [ZONE-INDIVIDUAL-DB] Erro ao processar scan:', err);
    if (err.code === 'MONSTERCONFLICT' || err.message.includes('version')) {
      return {
        accepted: false,
        error: 'Conflito ao processar - tente novamente',
        versionConflict: true,
      };
    }
    return {
      accepted: false,
      error: err.message,
    };
  }
}

// ==================== FUNÇÕES AUXILIARES ====================

/**
 * Recalcula ranking para todos os participantes
 */
async function recalculateRanking(txOrDb, partidaId) {
  try {
    // Buscar todos os participantes ordenados por pontos
    const participantes = await (txOrDb.allQuery || allQuery)(
      `SELECT id FROM zone_conquest_individual_participant_states
       WHERE partida_id = @partidaId
       ORDER BY total_points DESC`,
      { partidaId }
    );

    // Atualizar ranking
    for (let i = 0; i < participantes.length; i++) {
      await (txOrDb.query || query)(
        `UPDATE zone_conquest_individual_participant_states SET
           ranking = @ranking
         WHERE id = @id`,
        {
          ranking: i + 1,
          id: participantes[i].id,
        }
      );
    }
  } catch (err) {
    console.error('❌ Erro ao recalcular ranking:', err);
    throw err;
  }
}

// ==================== FUNÇÕES DE LEITURA ====================

/**
 * Obtém a partida ativa para um evento
 */
async function getActiveZoneConquestIndividualGame(eventoId) {
  try {
    const partida = await queryOne(
      `SELECT * FROM zone_conquest_individual_partidas
       WHERE LOWER(evento_id) = LOWER(@eventoId)
         AND status = 'active'
       ORDER BY started_at DESC`,
      { eventoId }
    );

    return partida || null;
  } catch (err) {
    console.error('❌ Erro ao buscar partida ativa:', err);
    return null;
  }
}

/**
 * Obtém o ranking completo
 */
async function getZoneConquestIndividualRanking(partidaId) {
  try {
    const ranking = await allQuery(
      `SELECT 
         ps.id,
         ps.crianca_id,
         c.name,
         ps.total_points,
         ps.checkpoints_read,
         ps.ranking,
         ps.status
       FROM zone_conquest_individual_participant_states ps
       INNER JOIN criancas c ON c.id = ps.crianca_id
       WHERE ps.partida_id = @partidaId
       ORDER BY ps.ranking ASC`,
      { partidaId }
    );

    return ranking || [];
  } catch (err) {
    console.error('❌ Erro ao buscar ranking:', err);
    return [];
  }
}

/**
 * Obtém o status completo do jogo (para frontend)
 */
async function getZoneConquestIndividualStatus(eventoId) {
  try {
    // 1. Obter partida ativa
    const partida = await getActiveZoneConquestIndividualGame(eventoId);

    if (!partida) {
      return {
        gameRunning: false,
        mode: 'individual',
        message: 'Jogo não iniciado',
      };
    }

    // 2. Obter ranking/participantes
    const participantes = await getZoneConquestIndividualRanking(partida.id);

    // 3. Obter checkpoints dominados
    const dominatedCheckpoints = await allQuery(
      `SELECT c.id, c.name, c.territory_owner_time_id AS owner_crianca_id, cr.name AS owner_name
       FROM checkpoints c
       LEFT JOIN criancas cr ON cr.id = c.territory_owner_time_id
       WHERE c.evento_id = @eventoId
         AND c.territory_owner_time_id IS NOT NULL`,
      { eventoId }
    );

    return {
      gameRunning: true,
      mode: 'individual',
      partida_id: partida.id,
      status: partida.status,
      version: partida.version,
      participants: participantes.map(p => ({
        participant_id: p.crianca_id,
        name: p.name,
        total_points: p.total_points,
        checkpoints_read: p.checkpoints_read,
        ranking: p.ranking,
        status: p.status,
      })),
      dominated_checkpoints: dominatedCheckpoints.length,
      created_at: partida.started_at,
    };
  } catch (err) {
    console.error('❌ Erro ao obter status:', err);
    return null;
  }
}

// ==================== FUNÇÕES DE PARADA ====================

/**
 * Para um jogo ativo (limpa e finaliza)
 */
async function stopZoneConquestIndividual(eventoId) {
  try {
    console.log(`⏹️ [ZONE-INDIVIDUAL-DB] Parando jogo do evento: ${eventoId}`);

    const agora = new Date();

    const resultado = await withTransaction(async (tx) => {
      // UPDATE partida
      await tx.query(
        `UPDATE zone_conquest_individual_partidas SET
           status = 'finished',
           finished_at = @agora
         WHERE LOWER(evento_id) = LOWER(@eventoId)
           AND status = 'active'`,
        {
          eventoId,
          agora,
        }
      );

      // UPDATE participant states
      await tx.query(
        `UPDATE zone_conquest_individual_participant_states SET
           status = 'finished',
           finished_at = @agora
         WHERE partida_id IN (
           SELECT id FROM zone_conquest_individual_partidas
           WHERE LOWER(evento_id) = LOWER(@eventoId)
         )
         AND status <> 'finished'`,
        {
          eventoId,
          agora,
        }
      );

      return { success: true };
    });

    console.log(`   ✅ Jogo parado com sucesso`);
    return resultado;
  } catch (err) {
    console.error('❌ Erro ao parar jogo:', err);
    throw err;
  }
}

// ==================== EXPORTS ====================

module.exports = {
  startZoneConquestIndividual,
  processZoneConquestIndividualScan,
  getActiveZoneConquestIndividualGame,
  getZoneConquestIndividualRanking,
  getZoneConquestIndividualStatus,
  stopZoneConquestIndividual,
  recalculateRanking,
};
