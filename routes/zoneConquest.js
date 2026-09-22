// routes/zoneConquest.js - API endpoints para Zone Conquest game state
// Gerencia persistência e recuperação de estado de checkpoints e zonas

const express = require('express');
const router = express.Router();
const { verifyToken, requireRole } = require('../utils/middleware');
const { allQuery, queryOne } = require('../database');
const {
  initializeCheckpointStates,
  getCheckpointStates,
  updateCheckpointState,
  getCheckpointState,
  initializeZoneStates,
  getZoneStates,
  updateZoneState,
  getZoneState,
  clearPartidaStates,
} = require('../utils/zoneConquestStateManager');

// ==================== CHECKPOINT STATE ====================

/**
 * GET /api/zone-conquest/checkpoint-states/:eventoId/:partidaId
 * Recupera todos os estados de checkpoint para uma partida
 */
router.get(
  '/checkpoint-states/:eventoId/:partidaId',
  verifyToken,
  requireRole('admin', 'game_master', 'display', 'master'),
  async (req, res) => {
    try {
      const { eventoId, partidaId } = req.params;

      const states = await getCheckpointStates(partidaId, eventoId);

      res.json({
        success: true,
        data: states,
        count: states.length,
      });
    } catch (error) {
      console.error('❌ Erro ao recuperar checkpoint states:', error.message);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

/**
 * GET /api/zone-conquest/checkpoint-state/:eventoId/:checkpointId/:partidaId
 * Recupera estado de um checkpoint específico
 */
router.get(
  '/checkpoint-state/:eventoId/:checkpointId/:partidaId',
  verifyToken,
  requireRole('admin', 'game_master', 'display', 'master'),
  async (req, res) => {
    try {
      const { eventoId, checkpointId, partidaId } = req.params;

      const state = await getCheckpointState(checkpointId, partidaId);

      if (!state) {
        return res.status(404).json({
          success: false,
          error: 'Checkpoint state não encontrado',
        });
      }

      res.json({
        success: true,
        data: state,
      });
    } catch (error) {
      console.error('❌ Erro ao recuperar checkpoint state:', error.message);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

/**
 * PUT /api/zone-conquest/checkpoint-state/:stateId
 * Atualiza o estado de um checkpoint
 * Body: { current_owner_id?, protected_until?, last_conquered_at?, conquest_count? }
 */
router.put(
  '/checkpoint-state/:stateId',
  verifyToken,
  requireRole('admin', 'game_master', 'master'),
  async (req, res) => {
    try {
      const { stateId } = req.params;
      const updates = req.body;

      await updateCheckpointState(stateId, updates);

      res.json({
        success: true,
        message: 'Checkpoint state atualizado com sucesso',
      });
    } catch (error) {
      console.error('❌ Erro ao atualizar checkpoint state:', error.message);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

// ==================== ZONE STATE ====================

/**
 * GET /api/zone-conquest/team-partidas/:eventoId
 * Recupera todas as partidas TEAM para um evento
 */
router.get(
  '/team-partidas/:eventoId',
  verifyToken,
  requireRole('admin', 'game_master', 'display', 'master'),
  async (req, res) => {
    try {
      const { eventoId } = req.params;

      const partidas = await allQuery(
        `SELECT id, status, round_number, current_team_id, started_at, finished_at
         FROM zone_conquest_team_partidas
         WHERE LOWER(evento_id) = LOWER(@eventoId)
         ORDER BY started_at DESC`,
        { eventoId }
      );

      res.json({
        success: true,
        data: partidas,
        count: partidas.length,
      });
    } catch (error) {
      console.error('❌ Erro ao recuperar team partidas:', error.message);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

/**
 * GET /api/zone-conquest/individual-partidas/:eventoId
 * Recupera todas as partidas INDIVIDUAL para um evento
 */
router.get(
  '/individual-partidas/:eventoId',
  verifyToken,
  requireRole('admin', 'game_master', 'display', 'master'),
  async (req, res) => {
    try {
      const { eventoId } = req.params;

      const partidas = await allQuery(
        `SELECT id, status, version, started_at, finished_at
         FROM zone_conquest_individual_partidas
         WHERE LOWER(evento_id) = LOWER(@eventoId)
         ORDER BY started_at DESC`,
        { eventoId }
      );

      res.json({
        success: true,
        data: partidas,
        count: partidas.length,
      });
    } catch (error) {
      console.error('❌ Erro ao recuperar individual partidas:', error.message);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

// ==================== ZONE STATE ====================
router.get(
  '/zone-states/:eventoId/:partidaId',
  verifyToken,
  requireRole('admin', 'game_master', 'display', 'master'),
  async (req, res) => {
    try {
      const { eventoId, partidaId } = req.params;

      const states = await getZoneStates(partidaId, eventoId);

      res.json({
        success: true,
        data: states,
        count: states.length,
      });
    } catch (error) {
      console.error('❌ Erro ao recuperar zone states:', error.message);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

/**
 * GET /api/zone-conquest/zone-state/:eventoId/:zoneId/:partidaId
 * Recupera estado de uma zona específica
 */
router.get(
  '/zone-state/:eventoId/:zoneId/:partidaId',
  verifyToken,
  requireRole('admin', 'game_master', 'display', 'master'),
  async (req, res) => {
    try {
      const { eventoId, zoneId, partidaId } = req.params;

      const state = await getZoneState(zoneId, partidaId);

      if (!state) {
        return res.status(404).json({
          success: false,
          error: 'Zone state não encontrado',
        });
      }

      res.json({
        success: true,
        data: state,
      });
    } catch (error) {
      console.error('❌ Erro ao recuperar zone state:', error.message);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

/**
 * PUT /api/zone-conquest/zone-state/:stateId
 * Atualiza o estado de uma zona
 * Body: { current_owner_id?, is_disputed?, checkpoints_owned?, last_updated_at? }
 */
router.put(
  '/zone-state/:stateId',
  verifyToken,
  requireRole('admin', 'game_master', 'master'),
  async (req, res) => {
    try {
      const { stateId } = req.params;
      const updates = req.body;

      await updateZoneState(stateId, updates);

      res.json({
        success: true,
        message: 'Zone state atualizado com sucesso',
      });
    } catch (error) {
      console.error('❌ Erro ao atualizar zone state:', error.message);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

// ==================== INITIALIZATION ====================

/**
 * POST /api/zone-conquest/initialize/:eventoId/:partidaId
 * Inicializa todos os checkpoint e zone states para uma nova partida
 * Query: ?gameType=team|individual (padrão: 'team')
 */
router.post(
  '/initialize/:eventoId/:partidaId',
  verifyToken,
  requireRole('admin', 'game_master', 'master'),
  async (req, res) => {
    try {
      const { eventoId, partidaId } = req.params;
      const { empresaId } = req.body;
      const gameType = req.query.gameType || 'team';

      if (!empresaId) {
        return res.status(400).json({
          success: false,
          error: 'empresaId é obrigatório no body',
        });
      }

      // Inicializar checkpoints
      const cpCount = await initializeCheckpointStates(
        partidaId,
        empresaId,
        eventoId,
        gameType
      );

      // Inicializar zonas
      const zoneCount = await initializeZoneStates(
        partidaId,
        empresaId,
        eventoId,
        gameType
      );

      res.json({
        success: true,
        message: 'Game state inicializado com sucesso',
        data: {
          checkpointsInitialized: cpCount,
          zonesInitialized: zoneCount,
          gameType,
        },
      });
    } catch (error) {
      console.error('❌ Erro ao inicializar game state:', error.message);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

/**
 * DELETE /api/zone-conquest/clear/:eventoId/:partidaId
 * Limpa todos os estados de checkpoint e zona de uma partida
 * (usado ao reset ou conclusão do jogo)
 */
router.delete(
  '/clear/:eventoId/:partidaId',
  verifyToken,
  requireRole('admin', 'master'),
  async (req, res) => {
    try {
      const { eventoId, partidaId } = req.params;

      await clearPartidaStates(partidaId, eventoId);

      res.json({
        success: true,
        message: 'Game state limpo com sucesso',
      });
    } catch (error) {
      console.error('❌ Erro ao limpar game state:', error.message);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

module.exports = router;
