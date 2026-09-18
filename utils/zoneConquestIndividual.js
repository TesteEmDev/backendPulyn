// utils/zoneConquestIndividual.js - Zone Conquest INDIVIDUAL mode
// Estado em memória: participantes competem individualmente por checkpoints
// Cada checkpoint fica protegido por 5 segundos após ser lido
// Participante pode reler um checkpoint após ler 3 outros diferentes

const { query, queryOne, allQuery } = require('../database');

// Estado global em memória
let zoneConquestIndividualState = new Map();
let zoneDominationIntervals = new Map(); // Intervals para ganho de pontos por zona

/**
 * Inicia um novo jogo de Zone Conquest em modo INDIVIDUAL
 */
async function startZoneConquestIndividual(eventoId, brincadeiraId) {
  if (!eventoId) return null;

  console.log(`🎮 [ZONE-INDIVIDUAL] Iniciando jogo INDIVIDUAL para evento: ${eventoId}`);

  // Limpar estado anterior
  if (zoneConquestIndividualState.has(eventoId)) {
    console.log(`   ⚠️ [ZONE-INDIVIDUAL] Estado anterior apagado`);
    zoneConquestIndividualState.delete(eventoId);
  }

  // Buscar todos os participantes do evento
  const participantes = await allQuery(
    `SELECT c.id AS crianca_id, c.name, c.uid, c.bracelet_code, t.color AS team_color, 
            CASE 
              WHEN t.color IS NOT NULL THEN t.color
              ELSE '#' || SUBSTRING(CONVERT(VARCHAR(MAX), HASHBYTES('MD5', c.id), 2), 1, 6)
            END AS color
     FROM criancas c
     LEFT JOIN times t ON t.id = c.time_id
     WHERE LOWER(c.evento_id) = LOWER(@eventoId)
       AND c.status = 'ativo'`,
    { eventoId }
  );

  console.log(`   👥 Participantes encontrados: ${participantes.length}`);

  // Buscar todos os checkpoints do evento
  const checkpoints = await allQuery(
    `SELECT id, name, x, y, radius, evento_id
     FROM checkpoints
     WHERE LOWER(evento_id) = LOWER(@eventoId)
       AND checkpoint_purpose IS NULL
       OR checkpoint_purpose = 'game'`,
    { eventoId }
  );

  console.log(`   📍 Checkpoints encontrados: ${checkpoints.length}`);

  // Buscar todas as zonas do evento
  const zonas = await allQuery(
    `SELECT id, name, x, y, width, height, color, evento_id
     FROM zonas
     WHERE LOWER(evento_id) = LOWER(@eventoId)`,
    { eventoId }
  );

  console.log(`   🗺️ Zonas encontradas: ${zonas.length}`);

  // Inicializar estado
  const gameState = {
    eventoId,
    brincadeiraId,
    mode: 'individual',
    status: 'active',
    createdAt: new Date(),
    participants: new Map(),
    checkpointStates: new Map(),
    checkpoints: checkpoints,
    zonas: zonas,
  };

  // Inicializar dados de cada participante
  participantes.forEach((p) => {
    gameState.participants.set(p.crianca_id, {
      criancaId: p.crianca_id,
      participantName: p.name,
      participantColor: p.color,
      checkpointsRead: [],
      checkpointsReadSinceLastRepeat: [],
      lastCheckpointId: null,
      lastCheckpointTime: null,
      checkpointsReadCount: 0,
      totalPoints: 0,
      ranking: 0,
    });
  });

  // Inicializar dados de cada checkpoint
  checkpoints.forEach((cp) => {
    gameState.checkpointStates.set(cp.id, {
      checkpointId: cp.id,
      currentOwner: null,
      ownerName: null,
      ownerColor: null,
      protectedUntil: null,
      lastReadAt: null,
    });
  });

  zoneConquestIndividualState.set(eventoId, gameState);

  // Iniciar intervals para ganho de pontos por dominação de zona
  startZoneDominationRewards(eventoId);

  console.log(`✅ [ZONE-INDIVIDUAL] Jogo iniciado com sucesso`);
  return gameState;
}

/**
 * Inicia o sistema de recompensas de dominação de zona (a cada 3 segundos)
 */
function startZoneDominationRewards(eventoId) {
  if (!eventoId) return;

  // Limpar interval anterior se existir
  if (zoneDominationIntervals.has(eventoId)) {
    clearInterval(zoneDominationIntervals.get(eventoId));
  }

  const interval = setInterval(() => {
    const gameState = zoneConquestIndividualState.get(eventoId);
    if (!gameState || gameState.status !== 'active') {
      clearInterval(interval);
      zoneDominationIntervals.delete(eventoId);
      return;
    }

    processDominationRewards(gameState);
  }, 3000); // A cada 3 segundos

  zoneDominationIntervals.set(eventoId, interval);
  console.log(`⏱️ [ZONE-INDIVIDUAL] Interval de recompensas iniciado para evento: ${eventoId}`);
}

/**
 * Processa recompensas de dominação (chamado a cada 3 segundos)
 */
function processDominationRewards(gameState) {
  if (!gameState || gameState.zonas.length === 0) return;

  gameState.zonas.forEach((zona) => {
    // Calcular cor/dominação atual da zona
    const zoneColor = calculateZoneColorIndividual(
      zona,
      gameState.checkpoints,
      gameState.checkpointStates,
      gameState.participants
    );

    // Se zona está dominada, dar pontos ao dominador (participante)
    if (zoneColor.status === 'dominada' && zoneColor.participantId) {
      const owner = gameState.participants.get(zoneColor.participantId);
      if (owner) {
        // Pontos fixos por dominação de zona a cada 3 segundos
        const dominationPoints = 1; // 1 ponto a cada 3 segundos por zona dominada
        owner.totalPoints += dominationPoints;

        // Atualizar ranking
        const sortedParticipants = Array.from(gameState.participants.values())
          .sort((a, b) => b.totalPoints - a.totalPoints);

        sortedParticipants.forEach((p, index) => {
          p.ranking = index + 1;
        });

        console.log(
          `🏆 [ZONE-INDIVIDUAL] ${owner.participantName} ganhou +${dominationPoints} ponto por dominar "${zoneColor.zoneName}" (total: ${owner.totalPoints})`
        );
      }
    }
  });
}

/**
 * Valida se um checkpoint pode ser lido por um participante
 * Retorna { valid: boolean, reason?: string }
 */
function validateCheckpointRead(participant, checkpoint, checkpointState, now = new Date()) {
  if (!participant || !checkpointState) {
    return { valid: false, reason: 'Participante ou checkpoint inválido' };
  }

  // 1. Verificar proteção (5 segundos)
  if (checkpointState.protectedUntil && checkpointState.protectedUntil > now) {
    const remainingSeconds = Math.ceil((checkpointState.protectedUntil - now) / 1000);
    return {
      valid: false,
      reason: `Checkpoint protegido. Aguarde ${remainingSeconds} segundos`,
      protected: true,
      remainingSeconds,
    };
  }

  // 2. Verificar restrição de releitura (3 checkpoints diferentes)
  if (participant.lastCheckpointId === checkpoint.checkpointId) {
    const remainingReads = 3 - participant.checkpointsReadSinceLastRepeat.length;
    if (remainingReads > 0) {
      return {
        valid: false,
        reason: `Você já leu este checkpoint. Leia ${remainingReads} outros checkpoints para reler`,
        repeatRestriction: true,
        remainingReads,
      };
    }
  }

  return { valid: true };
}

/**
 * Calcula pontos com multiplicador crescente
 * pontos = 10 * (1 + checkpointsReadCount * 0.01)
 */
function calculatePointsIndividual(checkpointsReadCount) {
  const basePoints = 10;
  const multiplier = 1 + checkpointsReadCount * 0.01;
  const points = basePoints * multiplier;
  return Math.round(points * 100) / 100; // Arredondar para 2 casas decimais
}

/**
 * Calcula a cor de uma zona baseada na dominação de checkpoints
 * No modo INDIVIDUAL: zona é dominada quando UM participante leu o ÚLTIMO checkpoint de TODOS os CPs da zona
 */
function calculateZoneColorIndividual(zona, checkpoints, checkpointStates, participants) {
  if (!zona || !checkpoints || checkpointStates.size === 0) {
    return {
      zoneId: zona?.id,
      zoneName: zona?.name,
      color: '#FFFFFF',
      participantId: null,
      participantName: null,
      participantColor: null,
      status: 'livre',
      dominators: [],
    };
  }

  // Encontrar checkpoints dentro da zona (colisão 2D)
  const cptsInZone = checkpoints.filter((cp) => {
    const inX = cp.x >= zona.x && cp.x <= zona.x + zona.width;
    const inY = cp.y >= zona.y && cp.y <= zona.y + zona.height;
    return inX && inY;
  });

  console.log(
    `   🗺️ Zona "${zona.name}": ${cptsInZone.length} checkpoints dentro dela`
  );

  if (cptsInZone.length === 0) {
    return {
      zoneId: zona.id,
      zoneName: zona.name,
      color: '#FFFFFF',
      participantId: null,
      participantName: null,
      participantColor: null,
      status: 'livre',
      dominators: [],
    };
  }

  // Verificar donos dos checkpoints (quem leu por último)
  const cpStates = cptsInZone
    .map((cp) => checkpointStates.get(cp.id))
    .filter(Boolean);

  const owners = cpStates
    .map((state) => state.currentOwner)
    .filter(Boolean);

  console.log(`      Donos dos checkpoints: ${owners.join(', ') || 'nenhum'}`);

  // Se nenhum checkpoint foi lido
  if (owners.length === 0) {
    return {
      zoneId: zona.id,
      zoneName: zona.name,
      color: '#FFFFFF',
      participantId: null,
      participantName: null,
      participantColor: null,
      status: 'livre',
      dominators: [],
    };
  }

  // Se todos os checkpoints têm o mesmo dono (participante)
  const uniqueOwners = new Set(owners);
  if (uniqueOwners.size === 1 && owners.length === cptsInZone.length) {
    const participantId = owners[0];
    const participantData = participants.get(participantId);
    console.log(`      ✅ Zona DOMINADA por: ${participantData?.participantName}`);
    return {
      zoneId: zona.id,
      zoneName: zona.name,
      color: participantData?.participantColor || '#FFFFFF',
      participantId,
      participantName: participantData?.participantName,
      participantColor: participantData?.participantColor,
      status: 'dominada',
      dominators: [participantId],
    };
  }

  // Em disputa (múltiplos participantes ou alguns checkpoints livres)
  const dominators = Array.from(uniqueOwners).map((participantId) => {
    const data = participants.get(participantId);
    return {
      participantId,
      participantName: data?.participantName,
      participantColor: data?.participantColor,
    };
  });

  console.log(`      ⚖️ Zona EM DISPUTA por: ${dominators.map((d) => d.participantName).join(', ')}`);
  return {
    zoneId: zona.id,
    zoneName: zona.name,
    color: '#FFFFFF',
    participantId: null,
    participantName: null,
    participantColor: null,
    status: 'disputa',
    dominators: dominators,
  };
}

/**
 * Processa a leitura de um checkpoint por um participante
 */
async function recordZoneConquestIndividualScan(
  eventoId,
  criancaId,
  checkpointId,
  now = new Date()
) {
  if (!eventoId || !criancaId || !checkpointId) {
    return {
      accepted: false,
      error: 'Parâmetros inválidos',
    };
  }

  const gameState = zoneConquestIndividualState.get(eventoId);
  if (!gameState) {
    return {
      accepted: false,
      error: 'Jogo não iniciado',
    };
  }

  const participant = gameState.participants.get(criancaId);
  if (!participant) {
    return {
      accepted: false,
      error: 'Participante não encontrado no jogo',
    };
  }

  const checkpoint = gameState.checkpoints.find((cp) => cp.id === checkpointId);
  if (!checkpoint) {
    return {
      accepted: false,
      error: 'Checkpoint não encontrado',
    };
  }

  const checkpointState = gameState.checkpointStates.get(checkpointId);
  if (!checkpointState) {
    return {
      accepted: false,
      error: 'Estado do checkpoint não inicializado',
    };
  }

  // Validar leitura
  const validation = validateCheckpointRead(participant, checkpoint, checkpointState, now);
  if (!validation.valid) {
    return {
      accepted: false,
      error: validation.reason,
      protected: validation.protected,
      remainingSeconds: validation.remainingSeconds,
      repeatRestriction: validation.repeatRestriction,
      remainingReads: validation.remainingReads,
    };
  }

  // ✅ Leitura aceita
  const pointsGained = calculatePointsIndividual(participant.checkpointsReadCount);

  // Atualizar estado do participante
  participant.checkpointsRead.push(checkpointId);
  participant.checkpointsReadCount++;
  participant.totalPoints += pointsGained;
  participant.lastCheckpointId = checkpointId;
  participant.lastCheckpointTime = now;

  // Se está relendo um checkpoint diferente, adicionar à lista
  if (participant.lastCheckpointId !== checkpointId) {
    participant.checkpointsReadSinceLastRepeat.push(checkpointId);
    // Se já leu 3 diferentes, resetar para permitir releitura do anterior
    if (participant.checkpointsReadSinceLastRepeat.length >= 3) {
      participant.checkpointsReadSinceLastRepeat = [];
    }
  } else {
    // Relendo o mesmo checkpoint, resetar contador de diferentes
    participant.checkpointsReadSinceLastRepeat = [];
  }

  // Atualizar estado do checkpoint
  checkpointState.currentOwner = criancaId;
  checkpointState.ownerName = participant.participantName;
  checkpointState.ownerColor = participant.participantColor;
  checkpointState.protectedUntil = new Date(now.getTime() + 5000); // 5 segundos
  checkpointState.lastReadAt = now;

  // Recalcular ranking
  const sortedParticipants = Array.from(gameState.participants.values())
    .sort((a, b) => b.totalPoints - a.totalPoints);

  sortedParticipants.forEach((p, index) => {
    p.ranking = index + 1;
  });

  // Recalcular cores de zonas
  const zoneColors = gameState.zonas.map((zona) => {
    const zoneData = calculateZoneColorIndividual(
      zona,
      gameState.checkpoints,
      gameState.checkpointStates,
      gameState.participants
    );
    
    return {
      id: zoneData.zoneId,
      name: zoneData.zoneName,
      color: zoneData.color,
      participantId: zoneData.participantId,
      participantName: zoneData.participantName,
      participantColor: zoneData.participantColor,
      status: zoneData.status,
      dominators: zoneData.dominators,
    };
  });

  console.log(
    `✅ [ZONE-INDIVIDUAL] ${participant.participantName} leu checkpoint ${checkpointId}: +${pointsGained} pontos (total: ${participant.totalPoints})`
  );

  return {
    accepted: true,
    pointsGained,
    totalPoints: participant.totalPoints,
    checkpointsRead: participant.checkpointsReadCount,
    ranking: participant.ranking,
    zoneColors,
  };
}

/**
 * Obtém o status completo do jogo
 */
function getZoneConquestIndividualStatus(eventoId) {
  const gameState = zoneConquestIndividualState.get(eventoId);
  if (!gameState) return null;

  const participants = Array.from(gameState.participants.values())
    .sort((a, b) => a.ranking - b.ranking)
    .map((p) => ({
      criancaId: p.criancaId,
      name: p.participantName,
      color: p.participantColor,
      totalPoints: p.totalPoints,
      checkpointsRead: p.checkpointsReadCount,
      ranking: p.ranking,
    }));

  const checkpoints = Array.from(gameState.checkpointStates.values()).map((state) => ({
    id: state.checkpointId,
    participantId: state.currentOwner,
    participantName: state.ownerName,
    participantColor: state.ownerColor,
    protectedUntil: state.protectedUntil?.toISOString() || null,
    isProtected: state.protectedUntil && state.protectedUntil > new Date(),
    lastReadAt: state.lastReadAt?.toISOString() || null,
  }));

  const zones = gameState.zonas.map((zona) => {
    const zoneData = calculateZoneColorIndividual(
      zona,
      gameState.checkpoints,
      gameState.checkpointStates,
      gameState.participants
    );
    
    return {
      id: zoneData.zoneId,
      name: zoneData.zoneName,
      color: zoneData.color,
      participantId: zoneData.participantId,
      participantName: zoneData.participantName,
      participantColor: zoneData.participantColor,
      status: zoneData.status,
      dominators: zoneData.dominators,
    };
  });

  return {
    gameRunning: gameState.status === 'active',
    mode: 'individual',
    createdAt: gameState.createdAt.toISOString(),
    participants,
    checkpoints,
    zones,
  };
}

/**
 * Para um jogo em andamento
 */
function stopZoneConquestIndividual(eventoId) {
  if (!eventoId) return null;

  const gameState = zoneConquestIndividualState.get(eventoId);
  if (!gameState) return null;

  gameState.status = 'stopped';
  
  // Limpar interval de recompensas
  if (zoneDominationIntervals.has(eventoId)) {
    clearInterval(zoneDominationIntervals.get(eventoId));
    zoneDominationIntervals.delete(eventoId);
  }
  
  console.log(`⏹️ [ZONE-INDIVIDUAL] Jogo parado para evento: ${eventoId}`);

  return gameState;
}

/**
 * Deleta o estado de um jogo (para começar novo)
 */
function deleteZoneConquestIndividual(eventoId) {
  if (!eventoId) return false;

  // Limpar interval de recompensas
  if (zoneDominationIntervals.has(eventoId)) {
    clearInterval(zoneDominationIntervals.get(eventoId));
    zoneDominationIntervals.delete(eventoId);
  }

  const deleted = zoneConquestIndividualState.delete(eventoId);
  if (deleted) {
    console.log(`🗑️ [ZONE-INDIVIDUAL] Estado deletado para evento: ${eventoId}`);
  }
  return deleted;
}

/**
 * Obtém o modo de jogo configurado para um evento
 */
async function getZoneConquestMode(eventoId) {
  if (!eventoId) return null;

  // Buscar configuração do evento
  const gameMode = await queryOne(
    `SELECT id, game_type FROM event_game_state
     WHERE LOWER(evento_id) = LOWER(@eventoId)`,
    { eventoId }
  );

  return gameMode?.game_type || null;
}

module.exports = {
  startZoneConquestIndividual,
  recordZoneConquestIndividualScan,
  validateCheckpointRead,
  calculatePointsIndividual,
  calculateZoneColorIndividual,
  getZoneConquestIndividualStatus,
  stopZoneConquestIndividual,
  deleteZoneConquestIndividual,
  getZoneConquestMode,
  startZoneDominationRewards,
  processDominationRewards,
};
