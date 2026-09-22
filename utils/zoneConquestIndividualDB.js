// utils/zoneConquestIndividualDB.js - Zone Conquest INDIVIDUAL com persistência em BD
// Baseado em Monster Hunt: partidas com versionning, participant states, scans com versioning

const { v4: uuidv4 } = require('uuid');
const { query, queryOne, allQuery, withTransaction } = require('../database');

// ==================== FUNÇÕES DE INICIALIZAÇÃO ====================

/**
 * Inicia um novo jogo de Zone Conquest INDIVIDUAL
 * Sem exigir participantes pré-cadastrados - eles são criados sob demanda
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

    // 3. Criar partida (sem exigir participantes)
    const partidaId = uuidv4();
    const agora = new Date();

    await query(
      `INSERT INTO zone_conquest_individual_partidas
       (id, empresa_id, evento_id, brincadeira_id, status, started_at, created_at, updated_at)
       VALUES (@id, @empresaId, @eventoId, @brincadeiraId, 'active', @startedAt, @startedAt, @startedAt)`,
      {
        id: partidaId,
        empresaId: evento.empresa_id,
        eventoId,
        brincadeiraId,
        startedAt: agora,
      }
    );

    console.log(`   ✅ Partida INDIVIDUAL criada: ${partidaId}`);
    console.log(`   📝 Participantes serão criados sob demanda na primeira leitura`);

    return {
      partida_id: partidaId,
      started_at: agora,
      message: 'Partida criada - participantes sob demanda',
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
  sessionId = null,
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
    // Se não existir, criar sob demanda
    let participantState = await queryOne(
      `SELECT * FROM zone_conquest_individual_participant_states
       WHERE partida_id = @partidaId
         AND crianca_id = @criancaId`,
      {
        partidaId: partida.id,
        criancaId: crianca.id,
      }
    );

    if (!participantState) {
      console.log(`   📝 Participant state não encontrado - criando sob demanda...`);
      // Criar participant state sob demanda
      const participantId = uuidv4();
      await query(
        `INSERT INTO zone_conquest_individual_participant_states
         (id, partida_id, empresa_id, evento_id, crianca_id, status, checkpoints_read, total_points, ranking, version, started_at, created_at, updated_at)
         VALUES (@id, @partidaId, @empresaId, @eventoId, @criancaId, 'active', 0, 0, NULL, 0, @agora, @agora, @agora)`,
        {
          id: participantId,
          partidaId: partida.id,
          empresaId: crianca.empresa_id,
          eventoId,
          criancaId: crianca.id,
          agora: now,
        }
      );
      console.log(`   ✅ Participant state criado: ${participantId}`);
      
      // Recarregar o state
      participantState = await queryOne(
        `SELECT * FROM zone_conquest_individual_participant_states
         WHERE id = @id`,
        { id: participantId }
      );
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
    const pontosDecimal = Math.round(basePoints * multiplier * 100) / 100;
    const pontos = Math.floor(pontosDecimal); // ✅ Arredondar para inteiro para INSERT

    console.log(`   💰 Pontos: ${basePoints} × ${multiplier.toFixed(2)} = ${pontosDecimal} (arredondado: ${pontos})`);

    // 5. TRANSAÇÃO: INSERT scan + UPDATE participant state com VERSIONNING
    const resultado = await withTransaction(async (tx) => {
      const nextVersion = participantState.version + 1;
      const novosPontos = participantState.total_points + pontos; // pontos já é inteiro
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
          sessionId: sessionId || null,
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
      // Em modo INDIVIDUAL, não vinculamos a um time, então pulamos a atualização
      // de territory_owner_time_id para evitar constraint violation
      // await tx.query(
      //   `UPDATE checkpoints SET
      //      territory_owner_time_id = @criancaId,
      //      last_conquered_at = @agora
      //    WHERE id = @checkpointId`,
      //   {
      //     checkpointId,
      //     criancaId: crianca.id,
      //     agora: now,
      //   }
      // );
      console.log(`   🎨 [ZONE-INDIVIDUAL] Checkpoint ${checkpointId} conquistado por participante ${crianca.id}`);

      // TODO: Recalcular ranking para a partida (precisa ser feito corretamente com transação)
      // await recalculateRanking(tx, partida.id);

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
    // Dentro de transação, usar tx.allQuery, fora usar allQuery direta
    let queryFn, allQueryFn;
    
    if (txOrDb.allQuery) {
      // Dentro de transação
      queryFn = txOrDb.query;
      allQueryFn = txOrDb.allQuery;
    } else {
      // Fora de transação (fallback - não deveria acontecer)
      queryFn = query;
      allQueryFn = allQuery;
    }

    // Buscar todos os participantes ordenados por pontos
    const participantes = await allQueryFn(
      `SELECT id FROM zone_conquest_individual_participant_states
       WHERE partida_id = @partidaId
       ORDER BY total_points DESC`,
      { partidaId }
    );

    // Atualizar ranking
    for (let i = 0; i < participantes.length; i++) {
      await queryFn(
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
    console.log(`   🔍 [ZONE-INDIVIDUAL] Buscando partida ativa para evento: ${eventoId}`);
    const partida = await queryOne(
      `SELECT * FROM zone_conquest_individual_partidas
       WHERE LOWER(evento_id) = LOWER(@eventoId)
         AND status = 'active'
       ORDER BY started_at DESC`,
      { eventoId }
    );

    if (partida) {
      console.log(`   ✅ [ZONE-INDIVIDUAL] Partida encontrada: ${partida.id}`);
    } else {
      console.log(`   ❌ [ZONE-INDIVIDUAL] Nenhuma partida INDIVIDUAL ativa encontrada`);
    }
    return partida || null;
  } catch (err) {
    console.error('❌ [ZONE-INDIVIDUAL] Erro ao buscar partida ativa:', err);
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
        criancaId: p.crianca_id,
        name: p.name,
        totalPoints: p.total_points,
        checkpointsRead: p.checkpoints_read,
        ranking: p.ranking,
        color: `hsl(${Math.random() * 360}, 70%, 60%)`, // Generate random color for each participant
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
