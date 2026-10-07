const { query, queryOne } = require('../database');
const { v4: uuidv4 } = require('uuid');
const { startZoneConquestTeam, stopZoneConquestTeam } = require('./zoneConquestTeam');

const ZONE_CONQUEST_GAME_TYPE = 'zone';

// O modo equipe é mantido em zoneConquestTeam.js; estas funções existem só para
// os chamadores antigos (index.js) e delegam para ele.
async function startZoneConquestGame(eventoId, brincadeiraId) {
  return startZoneConquestTeam(eventoId, brincadeiraId);
}

async function stopZoneConquestGame(eventoId) {
  return stopZoneConquestTeam(eventoId);
}

async function recordZoneConquestScan(eventoId, checkpointId, criancaId, timeId, leituraId, uid) {
  // 1. Buscar partida ativa
  const partida = await queryOne(`
    SELECT id, empresaId FROM zonaConquistaPartidaTime
    WHERE LOWER(eventoId) = LOWER(@eventoId) AND status = 'active'`, { eventoId });

  if (!partida) {
    throw new Error('Nenhuma partida de zona conquest ativa para este evento');
  }

  // 2. Buscar jogo ativo
  const brincadeira = await queryOne(`
    SELECT brincadeiraId FROM "brincadeira"
    WHERE eventoId = @eventoId AND status = 'active'`, { eventoId });

  // 3. Registrar scan
  const scanId = uuidv4();
  const now = new Date();

  await query(`
    INSERT INTO zonaConquistaLeituraTime
      (id, partidaId, empresaId, eventoId, brincadeiraId, checkpointId,
       criancaId, timeId, uid, leituraId, lidoEm)
    VALUES (@id, @partidaId, @empresaId, @eventoId, @brincadeiraId, @checkpointId,
            @criancaId, @timeId, @uid, @leituraId, @scannedAt)`, {
    id: scanId,
    partidaId: partida.id,
    empresaId: partida.empresaId,
    eventoId,
    brincadeiraId: brincadeira ? brincadeira.brincadeiraId : null,
    checkpointId,
    criancaId,
    timeId,
    uid,
    leituraId,
    scannedAt: now,
  });

  return scanId;
}

async function getZoneConquestPartidaAtiva(eventoId) {
  return queryOne(`
    SELECT id, status, iniciadoEm
    FROM zonaConquistaPartidaTime
    WHERE LOWER(eventoId) = LOWER(@eventoId) AND status = 'active'`, { eventoId });
}

async function getZoneConquestScans(partidaId, checkpointId) {
  return query(`
    SELECT *
    FROM zonaConquistaLeituraTime
    WHERE partidaId = @partidaId AND checkpointId = @checkpointId
    ORDER BY lidoEm ASC`, { partidaId, checkpointId });
}

module.exports = {
  startZoneConquestGame,
  stopZoneConquestGame,
  recordZoneConquestScan,
  getZoneConquestPartidaAtiva,
  getZoneConquestScans,
  ZONE_CONQUEST_GAME_TYPE,
};
