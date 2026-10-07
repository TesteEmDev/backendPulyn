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
      `SELECT brincadeiraId, nome, tipo, empresaId FROM "brincadeira" WHERE brincadeiraId = @id AND LOWER(COALESCE(status, 'active')) <> 'archived'`,
      { id: brincadeiraId }
    );

    if (!brincadeira) {
      throw new Error(`Brincadeira ${brincadeiraId} não encontrada`);
    }

    // 2. Buscar checkpoints do evento
    const checkpoints = await allQuery(
      `SELECT checkpointId, nome, eventoId FROM "pontoVerificacao" 
       WHERE LOWER(eventoId) = LOWER(@eventoId)
         AND (proposito IS NULL OR proposito = 'game')
         AND status = 'online'`,
      { eventoId }
    );

    if (checkpoints.length === 0) {
      throw new Error('Nenhum checkpoint online encontrado');
    }

    console.log(`   📍 Checkpoints encontrados: ${checkpoints.length}`);

    // 3. Buscar equipes participantes
    const times = await allQuery(
      `SELECT DISTINCT t.timeId, t.nome, t.cor 
       FROM "time" t
       INNER JOIN crianca c ON c.timeId = t.timeId
       WHERE c.eventoId = @eventoId AND c.status = 'ativo'
       GROUP BY t.timeId, t.nome, t.cor`,
      { eventoId }
    );

    if (times.length === 0) {
      throw new Error('Nenhuma equipe com crianças encontrada');
    }

    console.log(`   👥 Equipes encontradas: ${times.length}`);

    // 4. Buscar evento para validação
    const evento = await queryOne(
      `SELECT eventoId, empresaId FROM "evento" WHERE eventoId = @id`,
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
        `INSERT INTO zonaConquistaPartidaTime 
         (id, empresaId, eventoId, brincadeiraId, status, numeroRonda, timeAtualId, iniciadoEm)
         VALUES (@id, @empresaId, @eventoId, @brincadeiraId, 'active', 1, @currentTeamId, @startedAt)`,
        {
          id: partidaId,
          empresaId: evento.empresaId,
          eventoId,
          brincadeiraId,
          currentTeamId: times[0].timeId, // Primeira equipe começa
          startedAt: agora,
        }
      );

      // INSERT tempos para cada equipe
      for (const time of times) {
        await tx.query(
          `INSERT INTO zonaConquistaTempoTime
           (id, partidaId, empresaId, eventoId, timeId, status, zonasDominadas, checkpointsLidos, pontosTotais, iniciadoEm)
           VALUES (@id, @partidaId, @empresaId, @eventoId, @timeId, 'active', 0, 0, 0, @startedAt)`,
          {
            id: uuidv4(),
            partidaId,
            empresaId: evento.empresaId,
            eventoId,
            timeId: time.timeId,
            startedAt: agora,
          }
        );
      }

      return { id: partidaId, iniciadoEm: agora };
    });

    console.log(`   ✅ Partida criada: ${partida.id}`);
    return {
      partidaId: partida.id,
      iniciadoEm: partida.iniciadoEm,
      checkpoints: checkpoints.length,
      teams: times.length,
      timeAtualId: times[0].timeId,
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
    console.log(`\n📖 [ZONE-TEAM] Processando scan: ${crianca.nome} em checkpoint ${checkpointId}`);

    // 1. Obter partida ativa
    const partida = await queryOne(
      `SELECT * FROM zonaConquistaPartidaTime
       WHERE LOWER(eventoId) = LOWER(@eventoId)
         AND status = 'active'
       ORDER BY iniciadoEm DESC`,
      { eventoId }
    );

    if (!partida) {
      console.log(`   ❌ Nenhuma partida ativa encontrada`);
      return {
        accepted: false,
        error: 'Jogo não iniciado',
      };
    }

    console.log(`   📋 Partida: ${partida.id}, Round: ${partida.numeroRonda}`);

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
      `SELECT territorioDonosCriancaId, ultimoConquistadoEm FROM "pontoVerificacao" WHERE checkpointId = @checkpointId`,
      { checkpointId }
    );
    const lastConqueredAt = checkpointState?.ultimoConquistadoEm
      ? new Date(checkpointState.ultimoConquistadoEm).getTime()
      : null;
    const stillActive = lastConqueredAt !== null && (now.getTime() - lastConqueredAt) < TEAM_CHECKPOINT_RESET_MS;
    const dominatedBySameChild = stillActive
      && checkpointState.territorioDonosCriancaId
      && String(checkpointState.territorioDonosCriancaId).toLowerCase() === String(crianca.criancaId).toLowerCase();

    if (dominatedBySameChild) {
      console.log(`   ⚠️ ${crianca.nome} já domina este checkpoint — aguarde outra equipe conquistar ou 1m30s sem leituras`);
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
        `INSERT INTO zonaConquistaLeituraTime
         (id, partidaId, empresaId, eventoId, brincadeiraId, numeroRonda, 
          checkpointId, criancaId, timeId, uid, leituraId, pontosAtribuidos, lidoEm)
         VALUES (@id, @partidaId, @empresaId, @eventoId, @brincadeiraId, @roundNumber,
                 @checkpointId, @criancaId, @timeId, @uid, @leituraId, @pontos, @agora)`,
        {
          id: uuidv4(),
          partidaId: partida.id,
          empresaId: crianca.empresaId,
          eventoId,
          brincadeiraId,
          roundNumber: partida.numeroRonda,
          checkpointId,
          criancaId: crianca.criancaId,
          timeId: crianca.timeId,
          uid,
          leituraId,
          pontos,
          agora: now,
        }
      );

      // 🆕 INSERT também em leituras para que scoreLog funcione
      await tx.query(
        `INSERT INTO leitura
          (leituraId, checkpointId, criancaId, uid, brincadeiraId, autorizado,
           pontosAtribuidos, forcaSinal, empresaId, sessaoId)
         VALUES (@id, @checkpointId, @criancaId, @uid, @brincadeiraId, 1,
                 @points, @signal, @empresaId, @sessionId)`,
        {
          id: leituraId,
          checkpointId,
          criancaId: crianca.criancaId,
          uid,
          brincadeiraId: brincadeiraId || null,
          points: pontos,
          signal: -45,
          empresaId: crianca.empresaId,
          sessionId: sessionId || null,
        }
      );
      console.log(`   📝 [LEITURA] Inserida em leituras com session_id=${sessionId || 'NULL'}`);

      // UPDATE tempo: incrementar checkpointsLidos e pontos
      await tx.query(
        `UPDATE zonaConquistaTempoTime SET
           checkpointsLidos = checkpointsLidos + 1,
           pontosTotais = pontosTotais + @pontos,
           atualizadoEm = @agora
         WHERE partidaId = @partidaId AND timeId = @timeId`,
        {
          partidaId: partida.id,
          timeId: crianca.timeId,
          pontos,
          agora: now,
        }
      );

      // Esse ponto só era gravado em zone_conquest_team_tempos, nunca em
      // criancas.scores/times.points — que é o que o ranking geral do telão,
      // o card de Pontuação e o app da família leem.
      await tx.query(
        'UPDATE crianca SET pontos = pontos + @points WHERE criancaId = @criancaId',
        { points: pontos, criancaId: crianca.criancaId }
      );
      await tx.query(
        `UPDATE "time" SET pontos = (SELECT ISNULL(SUM(pontos), 0) FROM "crianca" WHERE timeId = @timeId)
         WHERE timeId = @timeId`,
        { timeId: crianca.timeId }
      );

      // UPDATE checkpoint: marcar como dominado por esta equipe. Também
      // grava qual criança fez a leitura (territorioDonosCriancaId) —
      // usado só para a regra de "não pode reconquistar o que já domina",
      // sem relação com o modo individual (que usa a mesma coluna, mas
      // nunca roda ao mesmo tempo que o modo equipe).
      await tx.query(
        `UPDATE pontoVerificacao SET
           territorioDonoTimeId = @timeId,
           territorioDonosCriancaId = @criancaId,
           ultimoConquistadoEm = @agora
         WHERE checkpointId = @checkpointId`,
        {
          checkpointId,
          timeId: crianca.timeId,
          criancaId: crianca.criancaId,
          agora: now,
        }
      );
      console.log(`   🎨 [ZONE-TEAM] Checkpoint ${checkpointId} marcado para equipe ${crianca.timeId}`);

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
      `SELECT * FROM zonaConquistaPartidaTime
       WHERE LOWER(eventoId) = LOWER(@eventoId)
         AND status = 'active'
       ORDER BY iniciadoEm DESC`,
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
      `SELECT t.*, tm.nome, tm.cor
       FROM zonaConquistaTempoTime t
       INNER JOIN "time" tm ON tm.timeId = t.timeId
       WHERE t.partidaId = @partidaId
       ORDER BY t.pontosTotais DESC`,
      { partidaId: partida.id }
    );

    // 3. Obter checkpoints dominados
    const dominatedCheckpoints = await allQuery(
      `SELECT c.*, t.nome AS team_name, t.cor AS team_color
       FROM "pontoVerificacao" c
       INNER JOIN "time" t ON t.timeId = c.territorioDonoTimeId
       WHERE c.eventoId = @eventoId
         AND c.territorioDonoTimeId IS NOT NULL`,
      { eventoId }
    );

    return {
      gameRunning: true,
      mode: 'team',
      partidaId: partida.id,
      numeroRonda: partida.numeroRonda,
      timeAtualId: partida.timeAtualId,
      status: partida.status,
      teams: tempos.map(t => ({
        team_id: t.timeId,
        team_name: t.nome,
        team_color: t.cor,
        checkpointsLidos: t.checkpointsLidos,
        pontosTotais: t.pontosTotais,
        zonasDominadas: t.zonasDominadas,
        status: t.status,
      })),
      dominated_checkpoints: dominatedCheckpoints.length,
      created_at: partida.iniciadoEm,
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
        `UPDATE zonaConquistaPartidaTime SET
           status = 'finished',
           finalizadoEm = @agora
         WHERE LOWER(eventoId) = LOWER(@eventoId)
           AND status = 'active'`,
        {
          eventoId,
          agora,
        }
      );

      // UPDATE tempos — a coluna nesta tabela se chama concluidoEm, não
      // finalizadoEm (diferente de zone_conquest_team_partidas). Usar o nome
      // errado aqui derrubava toda a transação com "column does not exist",
      // e como esse método é chamado ANTES de criar a partida nova no
      // start-game, a criação da partida TEAM nunca chegava a rodar.
      await tx.query(
        `UPDATE zonaConquistaTempoTime SET
           status = 'finished',
           concluidoEm = @agora
         WHERE partidaId IN (
           SELECT id FROM zonaConquistaPartidaTime
           WHERE LOWER(eventoId) = LOWER(@eventoId)
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
