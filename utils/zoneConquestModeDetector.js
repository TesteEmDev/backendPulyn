// utils/zoneConquestModeDetector.js - Detector de modo TEAM vs INDIVIDUAL
// Fornece funções para determinar qual modo de Zone Conquest está ativo

const { queryOne } = require('../database');

/**
 * Determina qual modo de Zone Conquest está ativo para um evento
 * Retorna: 'team' | 'individual' | null
 */
async function getActiveZoneConquestMode(eventoId) {
  try {
    if (!eventoId) return null;

    // Buscar partida TEAM ativa
    const teamGame = await queryOne(
      `SELECT id, game_type FROM zone_conquest_team_partidas
       WHERE LOWER(evento_id) = LOWER(@eventoId)
         AND status = 'active'
       LIMIT 1`,
      { eventoId }
    );

    if (teamGame) {
      return 'team';
    }

    // Buscar partida INDIVIDUAL ativa
    const individualGame = await queryOne(
      `SELECT id, game_type FROM zone_conquest_individual_partidas
       WHERE LOWER(evento_id) = LOWER(@eventoId)
         AND status = 'active'
       LIMIT 1`,
      { eventoId }
    );

    if (individualGame) {
      return 'individual';
    }

    return null;
  } catch (err) {
    console.error('❌ Erro ao detectar modo Zone Conquest:', err.message);
    return null;
  }
}

/**
 * Retorna a partida ativa e seu modo
 * Retorna: { mode: 'team'|'individual', partida: {...} } ou { mode: null, partida: null }
 */
async function getActiveZoneConquestGameWithMode(eventoId) {
  try {
    if (!eventoId) return { mode: null, partida: null };

    // Buscar TEAM
    const teamGame = await queryOne(
      `SELECT * FROM zone_conquest_team_partidas
       WHERE LOWER(evento_id) = LOWER(@eventoId)
         AND status = 'active'
       ORDER BY started_at DESC LIMIT 1`,
      { eventoId }
    );

    if (teamGame) {
      return {
        mode: 'team',
        partida: teamGame,
      };
    }

    // Buscar INDIVIDUAL
    const individualGame = await queryOne(
      `SELECT * FROM zone_conquest_individual_partidas
       WHERE LOWER(evento_id) = LOWER(@eventoId)
         AND status = 'active'
       ORDER BY started_at DESC LIMIT 1`,
      { eventoId }
    );

    if (individualGame) {
      return {
        mode: 'individual',
        partida: individualGame,
      };
    }

    return { mode: null, partida: null };
  } catch (err) {
    console.error('❌ Erro ao buscar jogo Zone Conquest com modo:', err.message);
    return { mode: null, partida: null };
  }
}

/**
 * Valida se um modo específico está ativo
 */
async function isZoneConquestModeActive(eventoId, expectedMode) {
  try {
    const mode = await getActiveZoneConquestMode(eventoId);
    return mode === expectedMode;
  } catch (err) {
    console.error('❌ Erro ao validar modo Zone Conquest:', err.message);
    return false;
  }
}

module.exports = {
  getActiveZoneConquestMode,
  getActiveZoneConquestGameWithMode,
  isZoneConquestModeActive,
};
