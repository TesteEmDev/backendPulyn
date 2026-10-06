const { query, queryOne } = require('../database');

async function getGameState(eventoId) {
  if (!eventoId) return null;
  return queryOne(
    `SELECT eventoId, empresaId, modo, tipoJogo, brincadeiraId, nomeBrincadeira,
            iniciadoEm, paradoEm, atualizadoEm
     FROM estadoJogoEvento
     WHERE LOWER(eventoId) = LOWER(@eventoId)`,
    { eventoId }
  );
}

async function saveGameState({
  eventoId,
  empresaId,
  mode,
  gameType = 'none',
  gameId = null,
  gameName = null,
  startedAt = null,
  stoppedAt = null,
}) {
  if (!eventoId || !empresaId) return null;

  const params = {
    eventoId,
    empresaId,
    mode,
    gameType,
    gameId,
    gameName,
    startedAt,
    stoppedAt,
  };
  const existing = await getGameState(eventoId);

  if (existing) {
    await query(
      `UPDATE estadoJogoEvento SET
         empresaId = @empresaId,
         modo = @mode,
         tipoJogo = @gameType,
         brincadeiraId = @gameId,
         nomeBrincadeira = @gameName,
         iniciadoEm = @startedAt,
         paradoEm = @stoppedAt,
         atualizadoEm = GETDATE()
       WHERE LOWER(eventoId) = LOWER(@eventoId)`,
      params
    );
  } else {
    await query(
      `INSERT INTO estadoJogoEvento
        (eventoId, empresaId, modo, tipoJogo, brincadeiraId, nomeBrincadeira,
         iniciadoEm, paradoEm, atualizadoEm)
       VALUES (@eventoId, @empresaId, @mode, @gameType, @gameId, @gameName,
               @startedAt, @stoppedAt, GETDATE())`,
      params
    );
  }

  return getGameState(eventoId);
}

module.exports = { getGameState, saveGameState };