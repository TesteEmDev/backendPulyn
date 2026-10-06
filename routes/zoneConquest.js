// routes/zoneConquest.js - API endpoints para Zone Conquest game estado
// Gerencia persistência e recuperação de estado de pontoVerificacao e zonas

const express = require('express');
const router = express.Router();
const { verifyToken, requireRole } = require('../utils/middleware');
const { allQuery, queryOne } = require('../database');
const {
  initializeCheckpointEstados,
  getCheckpointEstados,
  updateCheckpointEstado,
  getCheckpointEstado,
  initializeZoneEstados,
  getZoneEstados,
  updateZoneEstado,
  getZoneEstado,
  clearPartidaEstados,
} = require('../utils/zoneConquestEstadoManager');

// ==================== CHECKPOINT Estado ====================

/**
 * GET /api/zone-conquest/checkpoint-estados/:eventoId/:partidaId
 * Recupera todos os estados de checkpoint para uma partida
 */
router.get(
  '/checkpoint-estados/:eventoId/:partidaId',
  verifyToken,
  requireRole('admin', 'game_master', 'display', 'master'),
  async (req, res) => {
    try {
      const { eventoId, partidaId } = req.params;

      const estados = await getCheckpointEstados(partidaId, eventoId);

      res.json({
        success: true,
        data: estados,
        count: estados.length,
      });
    } catch (error) {
      console.error('❌ Erro ao recuperar checkpoint estados:', error.message);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

/**
 * GET /api/zone-conquest/checkpoint-estado/:eventoId/:checkpointId/:partidaId
 * Recupera estado de um checkpoint específico
 */
router.get(
  '/checkpoint-estado/:eventoId/:checkpointId/:partidaId',
  verifyToken,
  requireRole('admin', 'game_master', 'display', 'master'),
  async (req, res) => {
    try {
      const { eventoId, checkpointId, partidaId } = req.params;

      const estado = await getCheckpointEstado(checkpointId, partidaId);

      if (!estado) {
        return res.status(404).json({
          success: false,
          error: 'Checkpoint estado não encontrado',
        });
      }

      res.json({
        success: true,
        data: estado,
      });
    } catch (error) {
      console.error('❌ Erro ao recuperar checkpoint estado:', error.message);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

/**
 * PUT /api/zone-conquest/checkpoint-estado/:estadoId
 * Atualiza o estado de um checkpoint
 * Body: { current_owner_id?, protected_until?, ultimoConquistadoEm?, conquest_count? }
 */
router.put(
  '/checkpoint-estado/:estadoId',
  verifyToken,
  requireRole('admin', 'game_master', 'master'),
  async (req, res) => {
    try {
      const { estadoId } = req.params;
      const updates = req.body;

      await updateCheckpointEstado(estadoId, updates);

      res.json({
        success: true,
        message: 'Checkpoint estado atualizado com sucesso',
      });
    } catch (error) {
      console.error('❌ Erro ao atualizar checkpoint estado:', error.message);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

// ==================== ZONE Estado ====================

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
        `SELECT id, status, numeroRonda, current_team_id, iniciadoEm, finalizadoEm
         FROM "zonasConquistaPartidaTime"
         WHERE LOWER(eventoId) = LOWER(@eventoId)
         ORDER BY iniciadoEm DESC`,
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
        `SELECT id, status, version, iniciadoEm, finalizadoEm
         FROM "zonasConquistaPartidaIndividual"
         WHERE LOWER(eventoId) = LOWER(@eventoId)
         ORDER BY iniciadoEm DESC`,
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

// ==================== ZONE Estado ====================
router.get(
  '/zone-estados/:eventoId/:partidaId',
  verifyToken,
  requireRole('admin', 'game_master', 'display', 'master'),
  async (req, res) => {
    try {
      const { eventoId, partidaId } = req.params;

      const estados = await getZoneEstados(partidaId, eventoId);

      res.json({
        success: true,
        data: estados,
        count: estados.length,
      });
    } catch (error) {
      console.error('❌ Erro ao recuperar zone estados:', error.message);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

/**
 * GET /api/zone-conquest/zone-estado/:eventoId/:zoneId/:partidaId
 * Recupera estado de uma zona específica
 */
router.get(
  '/zone-estado/:eventoId/:zoneId/:partidaId',
  verifyToken,
  requireRole('admin', 'game_master', 'display', 'master'),
  async (req, res) => {
    try {
      const { eventoId, zoneId, partidaId } = req.params;

      const estado = await getZoneEstado(zoneId, partidaId);

      if (!estado) {
        return res.status(404).json({
          success: false,
          error: 'Zone estado não encontrado',
        });
      }

      res.json({
        success: true,
        data: estado,
      });
    } catch (error) {
      console.error('❌ Erro ao recuperar zone estado:', error.message);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

/**
 * PUT /api/zone-conquest/zone-estado/:estadoId
 * Atualiza o estado de uma zona
 * Body: { current_owner_id?, is_disputed?, checkpoints_owned?, last_updated_at? }
 */
router.put(
  '/zone-estado/:estadoId',
  verifyToken,
  requireRole('admin', 'game_master', 'master'),
  async (req, res) => {
    try {
      const { estadoId } = req.params;
      const updates = req.body;

      await updateZoneEstado(estadoId, updates);

      res.json({
        success: true,
        message: 'Zone estado atualizado com sucesso',
      });
    } catch (error) {
      console.error('❌ Erro ao atualizar zone estado:', error.message);
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
 * Inicializa todos os checkpoint e zone estados para uma nova partida
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

      // Inicializar pontoVerificacao
      const cpCount = await initializeCheckpointEstados(
        partidaId,
        empresaId,
        eventoId,
        gameType
      );

      // Inicializar zonas
      const zoneCount = await initializeZoneEstados(
        partidaId,
        empresaId,
        eventoId,
        gameType
      );

      res.json({
        success: true,
        message: 'Game estado inicializado com sucesso',
        data: {
          checkpointsInitialized: cpCount,
          zonesInitialized: zoneCount,
          gameTipo,
        },
      });
    } catch (error) {
      console.error('❌ Erro ao inicializar game estado:', error.message);
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

      await clearPartidaEstados(partidaId, eventoId);

      res.json({
        success: true,
        message: 'Game estado limpo com sucesso',
      });
    } catch (error) {
      console.error('❌ Erro ao limpar game estado:', error.message);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

module.exports = router;
