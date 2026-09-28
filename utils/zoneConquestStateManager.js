const { v4: uuidv4 } = require('uuid');
const { query, queryOne, allQuery, withTransaction } = require('../database');

// ==================== CHECKPOINT STATE ====================

/**
 * Cria estados iniciais para todos os checkpoints de uma partida
 * Chamado quando um novo jogo é iniciado
 */
async function initializeCheckpointStates(partidaId, empresaId, eventoId, gameType = 'team') {
  try {
    const checkpoints = await allQuery(
      `SELECT id, name FROM checkpoints 
       WHERE LOWER(evento_id) = LOWER(@eventoId)
       AND (checkpoint_purpose IS NULL OR checkpoint_purpose = 'game')`,
      { eventoId }
    );

    await withTransaction(async (tx) => {
      for (const cp of checkpoints) {
        const stateId = uuidv4();
        await tx.query(
          `INSERT INTO zone_conquest_checkpoint_states 
           (id, partida_id, empresa_id, evento_id, checkpoint_id, current_owner_id, owner_type, protected_until, last_conquered_at, conquest_count)
           VALUES (@id, @partidaId, @empresaId, @eventoId, @checkpointId, NULL, @ownerType, NULL, NULL, 0)`,
          {
            id: stateId,
            partidaId,
            empresaId,
            eventoId,
            checkpointId: cp.id,
            ownerType: gameType, // 'team' ou 'individual'
          }
        );
      }
    });

    console.log(`✅ [StateManager] ${checkpoints.length} checkpoint states inicializados para partida ${partidaId}`);
    return checkpoints.length;
  } catch (err) {
    console.error('❌ [StateManager] Erro ao inicializar checkpoint states:', err.message);
    throw err;
  }
}

/**
 * Recupera todos os estados de checkpoint para uma partida
 */
async function getCheckpointStates(partidaId, eventoId) {
  try {
    const states = await allQuery(
      `SELECT 
        id, partida_id, checkpoint_id, current_owner_id, owner_type,
        protected_until, last_conquered_at, conquest_count, created_at, updated_at
       FROM zone_conquest_checkpoint_states
       WHERE partida_id = @partidaId AND evento_id = @eventoId
       ORDER BY created_at ASC`,
      { partidaId, eventoId }
    );

    return states;
  } catch (err) {
    console.error('❌ [StateManager] Erro ao recuperar checkpoint states:', err.message);
    throw err;
  }
}

/**
 * Atualiza o estado de um checkpoint (conquista, proteção, etc.)
 */
async function updateCheckpointState(checkpointStateId, updates) {
  try {
    const allowedFields = ['current_owner_id', 'protected_until', 'last_conquered_at', 'conquest_count'];
    const setClauses = [];
    const params = { id: checkpointStateId };

    Object.entries(updates).forEach(([key, value]) => {
      if (allowedFields.includes(key)) {
        setClauses.push(`${key} = @${key}`);
        params[key] = value;
      }
    });

    if (setClauses.length === 0) return null;

    setClauses.push('updated_at = CURRENT_TIMESTAMP');

    const result = await queryOne(
      `UPDATE zone_conquest_checkpoint_states
       SET ${setClauses.join(', ')}
       WHERE id = @id`,
      params
    );

    return result;
  } catch (err) {
    console.error('❌ [StateManager] Erro ao atualizar checkpoint state:', err.message);
    throw err;
  }
}

/**
 * Recupera estado de um checkpoint específico
 */
async function getCheckpointState(checkpointId, partidaId) {
  try {
    const state = await queryOne(
      `SELECT 
        id, partida_id, checkpoint_id, current_owner_id, owner_type,
        protected_until, last_conquered_at, conquest_count, created_at, updated_at
       FROM zone_conquest_checkpoint_states
       WHERE checkpoint_id = @checkpointId AND partida_id = @partidaId`,
      { checkpointId, partidaId }
    );

    return state;
  } catch (err) {
    console.error('❌ [StateManager] Erro ao recuperar checkpoint state:', err.message);
    throw err;
  }
}

// ==================== ZONE STATE ====================

/**
 * Cria estados iniciais para todas as zonas de um evento
 * Chamado quando um novo jogo é iniciado
 */
async function initializeZoneStates(partidaId, empresaId, eventoId, gameType = 'team') {
  try {
    const zones = await allQuery(
      `SELECT id, name FROM zonas 
       WHERE LOWER(evento_id) = LOWER(@eventoId)`,
      { eventoId }
    );

    // Contar checkpoints por zona
    const checkpointsByZone = await allQuery(
      `SELECT zone, COUNT(*) as count FROM checkpoints
       WHERE LOWER(evento_id) = LOWER(@eventoId)
       GROUP BY zone`,
      { eventoId }
    );

    const zoneCheckpointMap = new Map();
    checkpointsByZone.forEach((row) => {
      zoneCheckpointMap.set(row.zone?.toLowerCase(), row.count || 0);
    });

    await withTransaction(async (tx) => {
      for (const zone of zones) {
        const stateId = uuidv4();
        const checkpointCount = zoneCheckpointMap.get(zone.name?.toLowerCase()) || 0;

        await tx.query(
          `INSERT INTO zone_conquest_zone_states
           (id, partida_id, empresa_id, evento_id, zone_id, current_owner_id, owner_type, is_disputed, checkpoints_count, checkpoints_owned, last_updated_at)
           VALUES (@id, @partidaId, @empresaId, @eventoId, @zoneId, NULL, @ownerType, 0, @checkpointsCount, 0, NULL)`,
          {
            id: stateId,
            partidaId,
            empresaId,
            eventoId,
            zoneId: zone.id,
            ownerType: gameType,
            checkpointsCount: checkpointCount,
          }
        );
      }
    });

    console.log(`✅ [StateManager] ${zones.length} zone states inicializados para partida ${partidaId}`);
    return zones.length;
  } catch (err) {
    console.error('❌ [StateManager] Erro ao inicializar zone states:', err.message);
    throw err;
  }
}

/**
 * Recupera todos os estados de zona para uma partida
 */
async function getZoneStates(partidaId, eventoId) {
  try {
    const states = await allQuery(
      `SELECT 
        id, partida_id, zone_id, current_owner_id, owner_type, is_disputed,
        checkpoints_count, checkpoints_owned, last_updated_at, created_at, updated_at
       FROM zone_conquest_zone_states
       WHERE partida_id = @partidaId AND evento_id = @eventoId
       ORDER BY created_at ASC`,
      { partidaId, eventoId }
    );

    return states;
  } catch (err) {
    console.error('❌ [StateManager] Erro ao recuperar zone states:', err.message);
    throw err;
  }
}

/**
 * Atualiza o estado de uma zona
 */
async function updateZoneState(zoneStateId, updates) {
  try {
    const allowedFields = ['current_owner_id', 'is_disputed', 'checkpoints_owned', 'last_updated_at'];
    const setClauses = [];
    const params = { id: zoneStateId };

    Object.entries(updates).forEach(([key, value]) => {
      if (allowedFields.includes(key)) {
        setClauses.push(`${key} = @${key}`);
        params[key] = value;
      }
    });

    if (setClauses.length === 0) return null;

    setClauses.push('updated_at = CURRENT_TIMESTAMP');

    const result = await queryOne(
      `UPDATE zone_conquest_zone_states
       SET ${setClauses.join(', ')}
       WHERE id = @id`,
      params
    );

    return result;
  } catch (err) {
    console.error('❌ [StateManager] Erro ao atualizar zone state:', err.message);
    throw err;
  }
}

/**
 * Recupera estado de uma zona específica
 */
async function getZoneState(zoneId, partidaId) {
  try {
    const state = await queryOne(
      `SELECT 
        id, partida_id, zone_id, current_owner_id, owner_type, is_disputed,
        checkpoints_count, checkpoints_owned, last_updated_at, created_at, updated_at
       FROM zone_conquest_zone_states
       WHERE zone_id = @zoneId AND partida_id = @partidaId`,
      { zoneId, partidaId }
    );

    return state;
  } catch (err) {
    console.error('❌ [StateManager] Erro ao recuperar zone state:', err.message);
    throw err;
  }
}

/**
 * Limpa todos os estados de uma partida (para reset ou conclusão)
 */
async function clearPartidaStates(partidaId, eventoId) {
  try {
    await withTransaction(async (tx) => {
      await tx.query(
        `DELETE FROM zone_conquest_checkpoint_states 
         WHERE partida_id = @partidaId AND evento_id = @eventoId`,
        { partidaId, eventoId }
      );

      await tx.query(
        `DELETE FROM zone_conquest_zone_states 
         WHERE partida_id = @partidaId AND evento_id = @eventoId`,
        { partidaId, eventoId }
      );
    });

    console.log(`✅ [StateManager] Estados da partida ${partidaId} limpos`);
  } catch (err) {
    console.error('❌ [StateManager] Erro ao limpar estados:', err.message);
    throw err;
  }
}

module.exports = {
  // Checkpoint State
  initializeCheckpointStates,
  getCheckpointStates,
  updateCheckpointState,
  getCheckpointState,
  
  // Zone State
  initializeZoneStates,
  getZoneStates,
  updateZoneState,
  getZoneState,
  
  // Cleanup
  clearPartidaStates,
};
