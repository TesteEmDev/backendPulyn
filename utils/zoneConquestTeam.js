const { v4: uuidv4 } = require('uuid');
const { query, queryOne, allQuery, withTransaction } = require('../database');

// Tempo sem nenhuma leitura para um checkpoint voltar a ficar livre (sem
// equipe dominando). Usado tanto para liberar a mesma criança pra
// reconquistar quanto pela varredura periódica que zera o domínio sozinho
// (checkStaleTeamCheckpoints, em index.js).
const TEAM_CHECKPOINT_RESET_MS = 90 * 1000;

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

    // Sem turno/fila: qualquer equipe pode ler qualquer checkpoint disponível
    // a qualquer momento — checkpoints são disputados em tempo real, não em
    // rodízio como o Treasure Hunt.

    // 2. Uma criança não pode reconquistar um checkpoint que ela mesma já
    // domina (evita farm de pontos batendo a pulseira repetidamente). Isso
    // só vale enquanto o checkpoint estiver "ativo": se ninguém o ler por
    // TEAM_CHECKPOINT_RESET_MS, ele volta a ficar livre para todo mundo,
    // inclusive para quem já dominou antes (ver checkExpiredGames/
    // checkStaleTeamCheckpoints no index.js, que zera o domínio sozinho
    // depois desse tempo de inatividade).
    const checkpointState = await queryOne(
      `SELECT territory_owner_crianca_id, last_conquered_at FROM checkpoints WHERE id = @checkpointId`,
      { checkpointId }
    );
    const lastConqueredAt = checkpointState?.last_conquered_at
      ? new Date(checkpointState.last_conquered_at).getTime()
      : null;
    const stillActive = lastConqueredAt !== null && (now.getTime() - lastConqueredAt) < TEAM_CHECKPOINT_RESET_MS;
    const dominatedBySameChild = stillActive
      && checkpointState.territory_owner_crianca_id
      && String(checkpointState.territory_owner_crianca_id).toLowerCase() === String(crianca.id).toLowerCase();

    if (dominatedBySameChild) {
      console.log(`   ⚠️ ${crianca.name} já domina este checkpoint — aguarde outra equipe conquistar ou 1m30s sem leituras`);
      return {
        accepted: false,
        error: 'Você já dominou este checkpoint. Aguarde outra equipe conquistar ou 1m30s sem leituras para liberar.',
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
          sessionId: sessionId || null,
        }
      );
      console.log(`   📝 [LEITURA] Inserida em leituras com session_id=${sessionId || 'NULL'}`);

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

      // Esse ponto só era gravado em zone_conquest_team_tempos, nunca em
      // criancas.scores/times.points — que é o que o ranking geral do telão,
      // o card de Pontuação e o app da família leem.
      await tx.query(
        'UPDATE criancas SET scores = scores + @points WHERE id = @criancaId',
        { points: pontos, criancaId: crianca.id }
      );
      await tx.query(
        `UPDATE times SET points = (SELECT ISNULL(SUM(scores), 0) FROM criancas WHERE time_id = @timeId)
         WHERE id = @timeId`,
        { timeId: crianca.time_id }
      );

      // UPDATE checkpoint: marcar como dominado por esta equipe. Também
      // grava qual criança fez a leitura (territory_owner_crianca_id) —
      // usado só para a regra de "não pode reconquistar o que já domina",
      // sem relação com o modo individual (que usa a mesma coluna, mas
      // nunca roda ao mesmo tempo que o modo equipe).
      await tx.query(
        `UPDATE checkpoints SET
           territory_owner_time_id = @timeId,
           territory_owner_crianca_id = @criancaId,
           last_conquered_at = @agora
         WHERE id = @checkpointId`,
        {
          checkpointId,
          timeId: crianca.time_id,
          criancaId: crianca.id,
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

      // UPDATE tempos — a coluna nesta tabela se chama completed_at, não
      // finished_at (diferente de zone_conquest_team_partidas). Usar o nome
      // errado aqui derrubava toda a transação com "column does not exist",
      // e como esse método é chamado ANTES de criar a partida nova no
      // start-game, a criação da partida TEAM nunca chegava a rodar.
      await tx.query(
        `UPDATE zone_conquest_team_tempos SET
           status = 'finished',
           completed_at = @agora
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
  TEAM_CHECKPOINT_RESET_MS,
};
