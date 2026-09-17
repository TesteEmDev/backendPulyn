const { query, queryOne, transaction } = require('../database');
const { v4: uuidv4 } = require('uuid');
const { recordZoneConquestScan, getZoneConquestScans } = require('./zoneConquest');

/**
 * Processar scan de checkpoint para zone conquest
 * Registra a leitura e retorna dados para broadcast
 */
async function processZoneConquestScan({
  eventoId,
  checkpointId,
  crianca,
  brincadeiraId,
  uid,
  leituraId,
  now,
}) {
  try {
    // Registrar scan no banco
    const scanId = await recordZoneConquestScan(
      eventoId,
      checkpointId,
      crianca.id,
      crianca.time_id,
      leituraId,
      uid
    );

    console.log(`✅ [ZONA] Scan registrado: ${scanId} para checkpoint ${checkpointId}`);

    return {
      accepted: true,
      scanId,
      checkpoint_id: checkpointId,
      crianca_name: crianca.name,
      crianca_id: crianca.id,
      time_id: crianca.time_id,
      timestamp: now.toISOString(),
      message: 'Checkpoint lido com sucesso',
    };
  } catch (error) {
    console.error(`❌ [ZONA] Erro ao processar zone conquest scan:`, error);
    return {
      accepted: false,
      error: error.message,
      message: 'Erro ao processar leitura',
    };
  }
}

module.exports = {
  processZoneConquestScan,
};
