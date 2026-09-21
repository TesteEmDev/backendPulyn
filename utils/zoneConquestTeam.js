// utils/zoneConquestTeam.js - Zone Conquest TEAM mode com persistência em BD
// Baseado em Treasure Hunt: partidas, tempos por equipe, histórico de scans

const { v4: uuidv4 } = require('uuid');
const { query, queryOne, allQuery, withTransaction } = require('../database');

// ==================== FUNÇÕES DE INICIALIZAÇÃO ====================

/**
 * Inicia um novo jogo de Zone Conquest TEAM
 * Baseado em startTreasureGame()
 */
async function startZoneConquestTeam(eventoId, brincadeiraId) {
  if (!eventoId || !brincadeiraId) {
    throw new Error('eventoId e brincadeiraId são obrigatórios');
  }

  try {
    console.log(`🎮 [ZONE-TEAM] Iniciando Zone Conquest TEAM para evento: ${eventoId}`);

    // 1. Validar brincadeira
    const brincadeira = await queryOne(
      `SELECT id, name, type, empresa_id FROM brincadeiras WHERE id = @id AND LOWER(COALESCE(status, 'active')) <> 'archived'`,
      { id: brincadeiraId }
    );

    if (!brincadeira) {
      throw new Error(`Brincadeira ${brincadeiraId} não encontrada`);
    }

    // 2. Buscar checkpoints do evento
    const checkpoints = await allQuery(
      `SELECT id, name, evento_id FROM checkpoints 
       WHERE LOWER(evento_id) = LOWER(@eventoId)
         AND (checkpoint_purpose IS NULL OR checkpoint_purpose = 'game')
         AND status = 'online'`,
      { eventoId }
    );

    if (checkpoints.length === 0) {
      throw new Error('Nenhum checkpoint online encontrado');
    }

    console.log(`   📍 Checkpoints encontrados: ${checkpoints.length}`);

    // 3. Buscar equipes participantes
    const times = await allQuery(
      `SELECT DISTINCT t.id, t.name, t.color 
       FROM times t
       INNER JOIN criancas c ON c.time_id = t.id
       WHERE c.evento_id = @eventoId AND c.status = 'ativo'
       GROUP BY t.id, t.name, t.color`,
      { eventoId }
    );

    if (times.length === 0) {
      throw new Error('Nenhuma equipe com crianças encontrada');
    }

    console.log(`   👥 Equipes encontradas: ${times.length}`);

    // 4. Buscar evento para validação
    const evento = await queryOne(
      `SELECT id, empresa_id FROM eventos WHERE id = @id`,
      { id: eventoId }
    );

    if (!evento) {
      throw new Error('Evento não encontrado');
    }

    // 5. Criar partida em TRANSAÇÃO (como em Treasure Hunt)
    const partida = await withTransaction(async (tx) => {
      const partidaId = uuidv4();
      const agora = new Date();

      // INSERT partida
      await tx.query(
        `INSERT INTO zone_conquest_team_partidas 
         (id, empresa_id, evento_id, brincadeira_id, status, round_number, current_team_id, started_at)
         VALUES (@id, @empresaId, @eventoId, @brincadeiraId, 'active', 1, @currentTeamId, @startedAt)`,
        {
          id: partidaId,
          empresaId: evento.empresa_id,
          eventoId,
          brincadeiraId,
          currentTeamId: times[0].id, // Primeira equipe começa
          startedAt: agora,
        }
      );

      // INSERT tempos para cada equipe
      for (const time of times) {
        await tx.query(
          `INSERT INTO zone_conquest_team_tempos
           (id, partida_id, empresa_id, evento_id, time_id, status, zones_dominated, checkpoints_read, total_points, started_at)
           VALUES (@id, @partidaId, @empresaId, @eventoId, @timeId, 'active', 0, 0, 0, @startedAt)`,
          {
            id: uuidv4(),
            partidaId,
            empresaId: evento.empresa_id,
            eventoId,
            timeId: time.id,
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
      checkpoints: checkpoints.length,
      teams: times.length,
      current_team_id: times[0].id,
    };
  } catch (err) {
    console.error('❌ [ZONE-TEAM] Erro ao iniciar jogo:', err);
    throw err;
  }
}

// ==================== FUNÇÕES DE PROCESSAMENTO ====================

/**
 * Processa uma leitura de checkpoint
 * Baseado em processTreasureScan()
 */
async function processZoneConquestTeamScan({
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
    console.log(`\n📖 [ZONE-TEAM] Processando scan: ${crianca.name} em checkpoint ${checkpointId}`);

    // 1. Obter partida ativa
    const partida = await queryOne(
      `SELECT * FROM zone_conquest_team_partidas
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

    console.log(`   📋 Partida: ${partida.id}, Round: ${partida.round_number}`);

    // 2. Validar se é a vez desta equipe (como em Treasure Hunt)
    if (String(crianca.time_id).toLowerCase() !== String(partida.current_team_id).toLowerCase()) {
      console.log(`   ❌ Não é a vez desta equipe. Agora é vez de ${partida.current_team_id}`);
      return {
        accepted: false,
        error: 'Não é a vez de sua equipe',
      };
    }

    // 3. Validar se criança já leu este checkpoint nesta rodada (CONSTRAINT UNIQUE)
    const existingRead = await queryOne(
      `SELECT id FROM zone_conquest_team_scans
       WHERE partida_id = @partidaId
         AND round_number = @roundNumber
         AND crianca_id = @criancaId
         AND checkpoint_id = @checkpointId`,
      {
        partidaId: partida.id,
        roundNumber: partida.round_number,
        criancaId: crianca.id,
        checkpointId,
      }
    );

    if (existingRead) {
      console.log(`   ⚠️ Criança já leu este checkpoint nesta rodada`);
      return {
        accepted: false,
        error: 'Você já leu este checkpoint nesta rodada',
      };
    }

    // 4. Processar scan em TRANSAÇÃO
    const resultado = await withTransaction(async (tx) => {
      const pontos = 10; // Pontos fixos por leitura

      // INSERT scan na tabela zone_conquest_team_scans
      await tx.query(
        `INSERT INTO zone_conquest_team_scans
         (id, partida_id, empresa_id, evento_id, brincadeira_id, round_number, 
          checkpoint_id, crianca_id, time_id, uid, leitura_id, points_awarded, scanned_at)
         VALUES (@id, @partidaId, @empresaId, @eventoId, @brincadeiraId, @roundNumber,
                 @checkpointId, @criancaId, @timeId, @uid, @leituraId, @pontos, @agora)`,
        {
          id: uuidv4(),
          partidaId: partida.id,
          empresaId: crianca.empresa_id,
          eventoId,
          brincadeiraId,
          roundNumber: partida.round_number,
          checkpointId,
          criancaId: crianca.id,
          timeId: crianca.time_id,
          uid,
          leituraId,
          pontos,
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
          brincadeiraId: brincadeiraId || null,
          points: pontos,
          signal: -45,
          empresaId: crianca.empresa_id,
          sessionId: global.currentSessionId || null,
        }
      );
      console.log(`   📝 [LEITURA] Inserida em leituras com session_id=${global.currentSessionId || 'NULL'}`);

      // UPDATE tempo: incrementar checkpoints_read e pontos
      await tx.query(
        `UPDATE zone_conquest_team_tempos SET
           checkpoints_read = checkpoints_read + 1,
           total_points = total_points + @pontos,
           updated_at = @agora
         WHERE partida_id = @partidaId AND time_id = @timeId`,
        {
          partidaId: partida.id,
          timeId: crianca.time_id,
          pontos,
          agora: now,
        }
      );

      // UPDATE checkpoint: marcar como dominado por esta equipe
      await tx.query(
        `UPDATE checkpoints SET
           territory_owner_time_id = @timeId,
           last_conquered_at = @agora
         WHERE id = @checkpointId`,
        {
          checkpointId,
          timeId: crianca.time_id,
          agora: now,
        }
      );
      console.log(`   🎨 [ZONE-TEAM] Checkpoint ${checkpointId} marcado para equipe ${crianca.time_id}`);

      return { points: pontos, accepted: true };
    });

    console.log(`   ✅ Scan processado: +${resultado.points} pontos`);
    return resultado;
  } catch (err) {
    console.error('❌ [ZONE-TEAM] Erro ao processar scan:', err);
    return {
      accepted: false,
      error: err.message,
    };
  }
}

// ==================== FUNÇÕES DE LEITURA ====================

/**
 * Obtém a partida ativa para um evento
 */
async function getActiveZoneConquestTeamGame(eventoId) {
  try {
    const partida = await queryOne(
      `SELECT * FROM zone_conquest_team_partidas
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
 * Obtém o status completo do jogo (para frontend)
 */
async function getZoneConquestTeamStatus(eventoId) {
  try {
    // 1. Obter partida ativa
    const partida = await getActiveZoneConquestTeamGame(eventoId);

    if (!partida) {
      return {
        gameRunning: false,
        mode: 'team',
        message: 'Jogo não iniciado',
      };
    }

    // 2. Obter tempos por equipe
    const tempos = await allQuery(
      `SELECT t.*, tm.name, tm.color
       FROM zone_conquest_team_tempos t
       INNER JOIN times tm ON tm.id = t.time_id
       WHERE t.partida_id = @partidaId
       ORDER BY t.total_points DESC`,
      { partidaId: partida.id }
    );

    // 3. Obter checkpoints dominados
    const dominatedCheckpoints = await allQuery(
      `SELECT c.*, t.name AS team_name, t.color AS team_color
       FROM checkpoints c
       INNER JOIN times t ON t.id = c.territory_owner_time_id
       WHERE c.evento_id = @eventoId
         AND c.territory_owner_time_id IS NOT NULL`,
      { eventoId }
    );

    return {
      gameRunning: true,
      mode: 'team',
      partida_id: partida.id,
      round_number: partida.round_number,
      current_team_id: partida.current_team_id,
      status: partida.status,
      teams: tempos.map(t => ({
        team_id: t.time_id,
        team_name: t.name,
        team_color: t.color,
        checkpoints_read: t.checkpoints_read,
        total_points: t.total_points,
        zones_dominated: t.zones_dominated,
        status: t.status,
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
async function stopZoneConquestTeam(eventoId) {
  try {
    console.log(`⏹️ [ZONE-TEAM] Parando jogo do evento: ${eventoId}`);

    const agora = new Date();

    const resultado = await withTransaction(async (tx) => {
      // UPDATE partida
      await tx.query(
        `UPDATE zone_conquest_team_partidas SET
           status = 'finished',
           finished_at = @agora
         WHERE LOWER(evento_id) = LOWER(@eventoId)
           AND status = 'active'`,
        {
          eventoId,
          agora,
        }
      );

      // UPDATE tempos
      await tx.query(
        `UPDATE zone_conquest_team_tempos SET
           status = 'finished',
           finished_at = @agora
         WHERE partida_id IN (
           SELECT id FROM zone_conquest_team_partidas
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
  startZoneConquestTeam,
  processZoneConquestTeamScan,
  getActiveZoneConquestTeamGame,
  getZoneConquestTeamStatus,
  stopZoneConquestTeam,
};
