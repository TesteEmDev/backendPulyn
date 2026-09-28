// utils/poolMonitoring.js - Monitoramento de pool de conexões
const { pool: dbPool, DB_DRIVER } = require('../database');

let poolStats = {
  totalRequests: 0,
  activeConnections: 0,
  maxConnections: 0,
  waits: 0,
  lastWarnAt: null
};

/**
 * Obter estatísticas do pool
 */
function getPoolStats() {
  if (!dbPool || DB_DRIVER !== 'postgres') {
    return {
      available: 'N/A',
      idle: 'N/A',
      waiting: 'N/A',
      driver: DB_DRIVER
    };
  }

  // PostgreSQL pool stats
  const poolSize = dbPool._clients?.length || 0;
  const waitingRequests = dbPool._queue?.length || 0;
  const activeRequests = (dbPool.totalCount || 0) - poolSize;

  return {
    available: poolSize,
    active: activeRequests,
    waiting: waitingRequests,
    total: dbPool.totalCount || 0,
    max: dbPool.options?.max || 10,
    driver: DB_DRIVER
  };
}

/**
 * Middleware para monitorar uso de conexões
 */
function poolMonitoringMiddleware(req, res, next) {
  const stats = getPoolStats();
  
  // Aviso se há muitas conexões ativas
  if (stats.waiting && stats.waiting > 3) {
    const now = Date.now();
    if (!poolStats.lastWarnAt || (now - poolStats.lastWarnAt) > 60000) {
      console.warn(`⚠️ [POOL] ${stats.waiting} requisições aguardando conexão (disponível: ${stats.available}/${stats.max})`);
      poolStats.lastWarnAt = now;
    }
  }

  res.on('finish', () => {
    poolStats.totalRequests++;
  });

  next();
}

/**
 * Endpoint de monitoramento (para admin)
 */
function setupPoolMonitoringEndpoints(app) {
  app.get('/api/internal/pool-stats', (req, res) => {
    // Apenas localhost ou token especial
    if (req.ip !== '127.0.0.1' && req.ip !== '::1' && !req.headers['x-pool-monitor-token']) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    res.json({
      stats: getPoolStats(),
      totalRequests: poolStats.totalRequests,
      uptime: process.uptime(),
      memory: {
        heap: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        external: Math.round(process.memoryUsage().external / 1024 / 1024)
      }
    });
  });
}

module.exports = {
  getPoolStats,
  poolMonitoringMiddleware,
  setupPoolMonitoringEndpoints
};
