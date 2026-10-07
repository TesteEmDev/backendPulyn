const { v4: uuidv4 } = require('uuid');
const { query, queryOne, allQuery, withTransaction } = require('../database');

// ==================== HELPERS ====================

/**
 * Gera uma cor HSL determinística baseada em um ID
 * Mesma cor sempre para o mesmo ID
 */
function generateColorFromId(id) {
  // Usar hash simples do ID para gerar um hue determinístico
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash) + id.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 60%)`;
}

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
      `SELECT brincadeiraId, nome, tipo, empresaId FROM "brincadeira" WHERE brincadeiraId = @id AND LOWER(COALESCE(status, 'active')) <> 'archived'`,
      { id: brincadeiraId }
    );

    if (!brincadeira) {
      throw new Error(`Brincadeira ${brincadeiraId} não encontrada`);
    }

    // 2. Buscar evento
    const evento = await queryOne(
      `SELECT eventoId, empresaId FROM "evento" WHERE eventoId = @id`,
      { id: eventoId }
    );

    if (!evento) {
      throw new Error('Evento não encontrado');
    }

    // 3. Fechar qualquer partida individual anterior que tenha ficado presa
    // como 'active' (ex.: servidor reiniciado sem passar por stopGame). Sem
    // isso, cada novo início empilha mais uma linha 'active' e nenhuma delas
    // é finalizada de verdade. Em try/catch: uma falha aqui não pode abortar
    // a criação da partida nova abaixo (isso já quebrou o modo TEAM quando
    // um UPDATE referenciava uma coluna que não existia).
    try {
      await stopZoneConquestIndividual(eventoId);
    } catch (err) {
      console.warn(`   ⚠️ Erro ao fechar partida individual anterior: ${err.message}`);
    }

    // 4. Criar partida (sem exigir participantes)
    const partidaId = uuidv4();
    const agora = new Date();

    await query(
      `INSERT INTO zonaConquistaPartidaIndividual
       (id, empresaId, eventoId, brincadeiraId, status, iniciadoEm, criadoEm, atualizadoEm)
       VALUES (@id, @empresaId, @eventoId, @brincadeiraId, 'active', @startedAt, @startedAt, @startedAt)`,
      {
        id: partidaId,
        empresaId: evento.empresaId,
        eventoId,
        brincadeiraId,
        startedAt: agora,
      }
    );

    console.log(`   ✅ Partida INDIVIDUAL criada: ${partidaId}`);
    console.log(`   📝 Participantes serão criados sob demanda na primeira leitura`);

    return {
      partidaId: partidaId,
      iniciadoEm: agora,
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
    console.log(`\n📖 [ZONE-INDIVIDUAL-DB] Processando scan: ${crianca.nome} em checkpoint ${checkpointId}`);

    // 1. Obter partida ativa
    const partida = await queryOne(
      `SELECT * FROM zonaConquistaPartidaIndividual
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

    console.log(`   📋 Partida: ${partida.id}, Version: ${partida.versao}`);

    // 2. Obter participant state com VERSIONNING (para optimistic locking)
    // Se não existir, criar sob demanda
    let participantState = await queryOne(
      `SELECT * FROM zonaConquistaEstadoParticipanteIndividual
       WHERE partidaId = @partidaId
         AND criancaId = @criancaId`,
      {
        partidaId: partida.id,
        criancaId: crianca.criancaId,
      }
    );

    if (!participantState) {
      console.log(`   📝 Participant state não encontrado - criando sob demanda...`);
      // Criar participant state sob demanda
      const participantId = uuidv4();
      const participantColor = generateColorFromId(crianca.criancaId);
      await query(
        `INSERT INTO zonaConquistaEstadoParticipanteIndividual
         (id, partidaId, empresaId, eventoId, criancaId, status, checkpointsLidos, pontosTotais, ranking, cor, versao, iniciadoEm, criadoEm, atualizadoEm)
         VALUES (@id, @partidaId, @empresaId, @eventoId, @criancaId, 'active', 0, 0, NULL, @color, 0, @agora, @agora, @agora)`,
        {
          id: participantId,
          partidaId: partida.id,
          empresaId: crianca.empresaId,
          eventoId,
          criancaId: crianca.criancaId,
          color: participantColor,
          agora: now,
        }
      );
      console.log(`   ✅ Participant state criado: ${participantId} (cor: ${participantColor})`);
      
      // Recarregar o state
      participantState = await queryOne(
        `SELECT * FROM zonaConquistaEstadoParticipanteIndividual
         WHERE id = @id`,
        { id: participantId }
      );
    }

    // 3. Validar se leitura já foi processada (CONSTRAINT UNIQUE em leitura_id)
    const existingLeitura = await queryOne(
      `SELECT id FROM zonaConquistaLeituraIndividual
       WHERE leituraId = @leituraId`,
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

    // 3b. Regra de releitura: só pode ler de novo o MESMO checkpoint depois
    // de ler outros 3 checkpoints. Olhamos as últimas 3 leituras aceitas
    // deste participante nesta partida — se este checkpoint aparecer entre
    // elas, ainda não passou tempo/leituras suficientes.
    const recentScans = await allQuery(
      `SELECT checkpointId FROM zonaConquistaLeituraIndividual
       WHERE partidaId = @partidaId AND criancaId = @criancaId
       ORDER BY lidoEm DESC
       LIMIT 3`,
      { partidaId: partida.id, criancaId: crianca.criancaId }
    );
    const repeatedTooSoon = recentScans.some((scan) => String(scan.checkpointId) === String(checkpointId));
    if (repeatedTooSoon) {
      const otherCheckpointsSince = recentScans.findIndex((scan) => String(scan.checkpointId) === String(checkpointId));
      const remainingReads = 3 - otherCheckpointsSince;
      console.log(`   ⚠️ Releitura bloqueada: faltam ${remainingReads} checkpoint(s) diferente(s) antes de reler este`);
      return {
        accepted: false,
        error: `Leia outros ${remainingReads} checkpoint(s) antes de reler este`,
        repeatRestriction: true,
        remainingReads,
      };
    }

    // 4. Calcular pontos com multiplicador
    const checkpointsReadCount = participantState.checkpointsLidos;
    const basePoints = 10;
    const multiplier = 1 + checkpointsReadCount * 0.01;
    const pontosDecimal = Math.round(basePoints * multiplier * 100) / 100;
    const pontos = Math.floor(pontosDecimal); // ✅ Arredondar para inteiro para INSERT

    console.log(`   💰 Pontos: ${basePoints} × ${multiplier.toFixed(2)} = ${pontosDecimal} (arredondado: ${pontos})`);

    // 5. TRANSAÇÃO: INSERT scan + UPDATE participant state com VERSIONNING
    const resultado = await withTransaction(async (tx) => {
      const nextVersion = participantState.versao + 1;
      const novosPontos = participantState.pontosTotais + pontos; // pontos já é inteiro
      const novosCheckpoints = participantState.checkpointsLidos + 1;

      // INSERT scan
      await tx.query(
        `INSERT INTO zonaConquistaLeituraIndividual
         (id, partidaId, empresaId, eventoId, brincadeiraId, checkpointId,
          criancaId, uid, leituraId, pontosAtribuidos, versao, lidoEm)
         VALUES (@id, @partidaId, @empresaId, @eventoId, @brincadeiraId, @checkpointId,
                 @criancaId, @uid, @leituraId, @pontos, @version, @agora)`,
        {
          id: uuidv4(),
          partidaId: partida.id,
          empresaId: crianca.empresaId,
          eventoId,
          brincadeiraId,
          checkpointId,
          criancaId: crianca.criancaId,
          uid,
          leituraId,
          pontos,
          version: nextVersion,
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
          brincadeiraId,
          points: pontos,
          signal: -45,
          empresaId: crianca.empresaId,
          sessionId: sessionId || null,
        }
      );

      // UPDATE participant state com OPTIMISTIC LOCKING
      // Só atualiza se version combina (previne race condition)
      const updateResult = await tx.query(
        `UPDATE zonaConquistaEstadoParticipanteIndividual SET
           checkpointsLidos = @novosCheckpoints,
           pontosTotais = @novosPontos,
           versao = @nextVersion,
           atualizadoEm = @agora
         WHERE id = @id
           AND versao = @currentVersion`,
        {
          id: participantState.id,
          novosCheckpoints,
          novosPontos,
          nextVersion,
          currentVersion: participantState.versao,
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

      // Esse ponto só era gravado em zone_conquest_individual_participant_states,
      // nunca em criancas.scores — que é o que o ranking geral do telão
      // ("Top Participantes"), o card de Pontuação e o app da família leem.
      await tx.query(
        'UPDATE crianca SET pontos = pontos + @points WHERE criancaId = @criancaId',
        { points: pontos, criancaId: crianca.criancaId }
      );

      // UPDATE checkpoint: marcar como dominado pelo participante
      // Em modo INDIVIDUAL, usamos territorioDonosCriancaId (novo campo)
      await tx.query(
        `UPDATE pontoVerificacao SET
           territorioDonosCriancaId = @criancaId,
           ultimoConquistadoEm = @agora
         WHERE checkpointId = @checkpointId`,
        {
          checkpointId,
          criancaId: crianca.criancaId,
          agora: now,
        }
      );
      console.log(`   🎨 [ZONE-INDIVIDUAL] Checkpoint ${checkpointId} conquistado por participante ${crianca.criancaId}`);

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
      `SELECT id FROM zonaConquistaEstadoParticipanteIndividual
       WHERE partidaId = @partidaId
       ORDER BY pontosTotais DESC`,
      { partidaId }
    );

    // Atualizar ranking
    for (let i = 0; i < participantes.length; i++) {
      await queryFn(
        `UPDATE zonaConquistaEstadoParticipanteIndividual SET
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
      `SELECT * FROM zonaConquistaPartidaIndividual
       WHERE LOWER(eventoId) = LOWER(@eventoId)
         AND status = 'active'
       ORDER BY iniciadoEm DESC`,
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
         ps.criancaId,
         c.nome,
         ps.pontosTotais,
         ps.checkpointsLidos,
         ps.ranking,
         ps.status
       FROM zonaConquistaEstadoParticipanteIndividual ps
       INNER JOIN crianca c ON c.criancaId = ps.criancaId
       WHERE ps.partidaId = @partidaId
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
    const allCheckpoints = await allQuery(
      `SELECT c.checkpointId, c.nome, c.territorioDonosCriancaId AS owner_crianca_id, cr.nome AS owner_name, ps.cor AS owner_color
       FROM "pontoVerificacao" c
       LEFT JOIN crianca cr ON cr.criancaId = c.territorioDonosCriancaId
       LEFT JOIN zonaConquistaEstadoParticipanteIndividual ps ON ps.criancaId = c.territorioDonosCriancaId
       WHERE c.eventoId = @eventoId`,
      { eventoId }
    );

    return {
      gameRunning: true,
      mode: 'individual',
      partidaId: partida.id,
      status: partida.status,
      version: partida.versao,
      participants: participantes.map(p => ({
        criancaId: p.criancaId,
        name: p.name,
        totalPoints: p.pontosTotais,
        checkpointsRead: p.checkpointsLidos,
        ranking: p.ranking,
        color: p.color || generateColorFromId(p.criancaId), // Use stored color or generate if missing
        status: p.status,
      })),
      checkpoints: allCheckpoints.map(c => ({
        id: c.checkpointId,
        participantId: c.owner_crianca_id || null,
        participantName: c.owner_name || null,
        participantColor: c.owner_crianca_id
          ? (c.owner_color || generateColorFromId(c.owner_crianca_id))
          : null,
        protectedUntil: null,
        isProtected: false,
        lastReadAt: null,
      })),
      dominated_checkpoins: allCheckpoints.filter(c => c.owner_crianca_id).map( c => ({
        checkpointId: c.checkpointId,
        checkpointName: c.nome,
        ownerCriancaId: c.owner_crianca_id,
        ownerName: c.owner_name,
        ownerColor: c.owner_color || generateColorFromId(c.owner_crianca_id),
      })),
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
async function stopZoneConquestIndividual(eventoId) {
  try {
    console.log(`⏹️ [ZONE-INDIVIDUAL-DB] Parando jogo do evento: ${eventoId}`);

    const agora = new Date();

    const resultado = await withTransaction(async (tx) => {
      // UPDATE partida
      await tx.query(
        `UPDATE zonaConquistaPartidaIndividual SET
           status = 'finished',
           finalizadoEm = @agora
         WHERE LOWER(eventoId) = LOWER(@eventoId)
           AND status = 'active'`,
        {
          eventoId,
          agora,
        }
      );

      // UPDATE participant states
      await tx.query(
        `UPDATE zonaConquistaEstadoParticipanteIndividual SET
           status = 'finished',
           finalizadoEm = @agora
         WHERE partidaId IN (
           SELECT id FROM zonaConquistaPartidaIndividual
           WHERE LOWER(eventoId) = LOWER(@eventoId)
         )
         AND status <> 'finished'`,
        {
          eventoId,
          agora,
        }
      );

      // LIMPAR territorioDonosCriancaId dos checkpoints
      await tx.query(
        `UPDATE pontoVerificacao SET
           territorioDonosCriancaId = NULL,
           territorioTravadoAte = NULL,
           territorioCooldownAte = NULL
         WHERE eventoId = @eventoId`,
        { eventoId }
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
