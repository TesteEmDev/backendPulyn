const { query, queryOne } = require('../database');

async function getGameState(eventoId) {
  if (!eventoId) return null;
  return queryOne(
    `SELECT evento_id, empresa_id, mode, game_type, game_id, game_name,
            started_at, stopped_at, updated_at
     FROM event_game_state
     WHERE LOWER(evento_id) = LOWER(@eventoId)`,
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
      `UPDATE event_game_state SET
         empresa_id = @empresaId,
         mode = @mode,
         game_type = @gameType,
         game_id = @gameId,
         game_name = @gameName,
         started_at = @startedAt,
         stopped_at = @stoppedAt,
         updated_at = GETDATE()
       WHERE LOWER(evento_id) = LOWER(@eventoId)`,
      params
    );
  } else {
    await query(
      `INSERT INTO event_game_state
        (evento_id, empresa_id, mode, game_type, game_id, game_name,
         started_at, stopped_at, updated_at)
       VALUES (@eventoId, @empresaId, @mode, @gameType, @gameId, @gameName,
               @startedAt, @stoppedAt, GETDATE())`,
      params
    );
  }

  return getGameState(eventoId);
}

module.exports = { getGameState, saveGameState };