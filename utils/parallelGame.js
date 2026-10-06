// utils/parallelGame.js - Brincadeira paralela (corrida do checkpoint)
//
// Durante a brincadeira principal, o recreacionista escolhe um checkpoint e inicia a disputa: os 3
// primeiros participantes a lê-lo ganham 50, 40 e 30 pontos. Enquanto a disputa está ativa, a leitura
// desse checkpoint vale só para ela (não conta para o jogo principal); quando o 3º lugar é preenchido
// (ou o recreacionista encerra) o checkpoint volta ao jogo principal.
const { v4: uuidv4 } = require('uuid');
const { query, queryOne, allQuery, withTransaction } = require('../database');
const { PARALLEL_PRIZES, planParallelAward, positionLabel } = require('./parallelRules');

function httpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

const CLOSED_EVENT_STATUSES = new Set(['finished', 'completed', 'cancelled', 'canceled']);

function broadcastEvent(eventoId, message) {
  if (typeof global.broadcastToEvent === 'function') global.broadcastToEvent(eventoId, message);
}

// Mostra no telão (que já exibe as mensagens do recreacionista por cima do jogo).
async function announceOnDisplay(eventoId, text) {
  try {
    const id = uuidv4();
    await query(
      `INSERT INTO mensagens_display (id, evento_id, text, type, sender, sent_at)
       VALUES (@id, @eventoId, @text, 'custom', 'brincadeira-paralela', CURRENT_TIMESTAMP)`,
      { id, eventoId, text }
    );
    const sentAt = new Date().toISOString();
    broadcastEvent(eventoId, {
      type: 'DISPLAY_MESSAGE',
      payload: { id, evento_id: eventoId, text, type: 'custom', sender: 'brincadeira-paralela', timestamp: sentAt, sent_at: sentAt },
      timestamp: sentAt,
    });
  } catch (err) {
    // O aviso no telão nunca pode derrubar a leitura já confirmada.
    console.error('⚠️ [PARALELA] Não foi possível avisar o telão:', err.message);
  }
}

async function loadWinners(parallelId) {
  return allQuery(
    `SELECT w.position, w.points, w.won_at, w.crianca_id, w.time_id,
            c.name AS crianca_name, c.nickname, c.avatar,
            t.name AS time_name, t.color AS time_color
     FROM parallel_game_winners w
     JOIN criancas c ON c.id = w.crianca_id
     LEFT JOIN times t ON t.id = w.time_id
     WHERE w.parallel_id = @parallelId
     ORDER BY w.position ASC`,
    { parallelId }
  );
}

const serializeWinner = (row) => ({
  position: Number(row.position),
  points: Number(row.points),
  wonAt: row.won_at,
  criancaId: row.crianca_id,
  criancaName: row.nickname || row.crianca_name,
  avatar: row.avatar || null,
  teamName: row.time_name || '',
  teamColor: row.time_color || '',
});

async function serializeGame(row) {
  const winners = await loadWinners(row.id);
  return {
    id: row.id,
    eventoId: row.evento_id,
    checkpointId: row.checkpoint_id,
    checkpointName: row.checkpoint_name || '',
    status: row.status,
    prizes: String(row.prizes || '').split(',').map(Number),
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    finishReason: row.finish_reason || null,
    winners: winners.map(serializeWinner),
  };
}

async function getActiveParallelGame(eventoId) {
  return queryOne(
    `SELECT g.*, cp.name AS checkpoint_name
     FROM parallel_games g
     LEFT JOIN checkpoints cp ON cp.id = g.checkpoint_id
     WHERE LOWER(g.evento_id) = LOWER(@eventoId) AND g.status = 'active'`,
    { eventoId }
  );
}

// Disputa ativa + as últimas encerradas, para a tela do recreacionista.
async function getParallelGameOverview(eventoId, historyLimit = 5) {
  const active = await getActiveParallelGame(eventoId);
  const finished = await allQuery(
    `SELECT g.*, cp.name AS checkpoint_name
     FROM parallel_games g
     LEFT JOIN checkpoints cp ON cp.id = g.checkpoint_id
     WHERE LOWER(g.evento_id) = LOWER(@eventoId) AND g.status = 'finished'
     ORDER BY g.started_at DESC
     LIMIT ${Math.max(1, Math.min(20, Number(historyLimit) || 5))}`,
    { eventoId }
  );
  return {
    active: active ? await serializeGame(active) : null,
    history: await Promise.all(finished.map(serializeGame)),
  };
}

async function startParallelGame({ eventoId, empresaId, checkpointId, userId }) {
  if (!checkpointId) throw httpError('Escolha o checkpoint da brincadeira paralela', 400);

  const evento = await queryOne(
    `SELECT id, empresa_id, status, COALESCE(active_game_type, 'none') AS active_game_type
     FROM eventos WHERE LOWER(id) = LOWER(@eventoId)`,
    { eventoId }
  );
  if (!evento) throw httpError('Evento não encontrado', 404);
  if (String(evento.empresa_id).toLowerCase() !== String(empresaId).toLowerCase()) {
    throw httpError('Acesso negado: evento não pertence à sua empresa', 403);
  }
  if (CLOSED_EVENT_STATUSES.has(String(evento.status || '').toLowerCase())) {
    throw httpError('Este evento não está aberto', 409);
  }
  if (String(evento.active_game_type).toLowerCase() === 'none') {
    throw httpError('Inicie uma brincadeira principal antes de começar a paralela', 409);
  }

  const checkpoint = await queryOne(
    `SELECT id, name, checkpoint_purpose FROM checkpoints
     WHERE LOWER(id) = LOWER(@checkpointId) AND LOWER(evento_id) = LOWER(@eventoId)`,
    { checkpointId, eventoId }
  );
  if (!checkpoint) throw httpError('Checkpoint não pertence a este evento', 400);
  if (String(checkpoint.checkpoint_purpose || 'game').toLowerCase() === 'reception') {
    throw httpError('O checkpoint da recepção não pode ser usado na brincadeira paralela', 400);
  }

  if (await getActiveParallelGame(evento.id)) {
    throw httpError('Já existe uma brincadeira paralela em andamento neste evento', 409);
  }

  const id = uuidv4();
  try {
    await query(
      `INSERT INTO parallel_games (id, empresa_id, evento_id, checkpoint_id, status, prizes, started_by)
       VALUES (@id, @empresaId, @eventoId, @checkpointId, 'active', @prizes, @userId)`,
      { id, empresaId: evento.empresa_id, eventoId: evento.id, checkpointId: checkpoint.id, prizes: PARALLEL_PRIZES.join(','), userId: userId || null }
    );
  } catch (err) {
    // O índice único (um ativo por evento) protege duas partidas começando ao mesmo tempo.
    if (/unique|duplicate/i.test(String(err.message))) throw httpError('Já existe uma brincadeira paralela em andamento neste evento', 409);
    throw err;
  }

  const [first, second, third] = PARALLEL_PRIZES;
  broadcastEvent(evento.id, { type: 'PARALLEL_GAME_STARTED', payload: { eventoId: evento.id, parallelId: id, checkpointId: checkpoint.id, checkpointName: checkpoint.name } });
  await announceOnDisplay(evento.id, `Brincadeira paralela! Os 3 primeiros a ler "${checkpoint.name}" ganham ${first}, ${second} e ${third} pontos`);

  return serializeGame({ ...(await getActiveParallelGame(evento.id)) });
}

// Encerra a disputa ativa do evento (manual, ao parar a brincadeira principal ou ao fechar o evento).
async function stopParallelGame(eventoId, reason = 'manual') {
  const active = await getActiveParallelGame(eventoId);
  if (!active) return null;
  await query(
    `UPDATE parallel_games SET status = 'finished', finished_at = CURRENT_TIMESTAMP, finish_reason = @reason
     WHERE id = @id AND status = 'active'`,
    { id: active.id, reason }
  );
  broadcastEvent(active.evento_id, { type: 'PARALLEL_GAME_FINISHED', payload: { eventoId: active.evento_id, parallelId: active.id, reason } });
  return active.id;
}

// Processa a leitura de uma criança. Devolve null se não há disputa ativa para ESTE checkpoint
// (a leitura segue o fluxo normal do jogo); senão, o resultado para responder ao leitor.
async function processParallelScan({ eventoId, checkpointId, crianca, uid, leituraId, now = new Date() }) {
  const active = await getActiveParallelGame(eventoId);
  if (!active || String(active.checkpoint_id).toLowerCase() !== String(checkpointId).toLowerCase()) return null;

  const outcome = await withTransaction(async (tx) => {
    // Trava a linha da disputa: duas leituras ao mesmo tempo entram uma por vez e ninguém fura a fila.
    const game = await tx.queryOne(
      `SELECT id, status, prizes FROM parallel_games WHERE id = @id FOR UPDATE`,
      { id: active.id }
    );
    if (!game || game.status !== 'active') return { status: 'closed' };

    const winners = await tx.allQuery(
      'SELECT crianca_id, position FROM parallel_game_winners WHERE parallel_id = @id ORDER BY position',
      { id: game.id }
    );
    const prizes = String(game.prizes || '').split(',').map(Number).filter(Number.isFinite);
    const plan = planParallelAward(winners, crianca.id, prizes.length ? prizes : PARALLEL_PRIZES);
    if (plan.status !== 'won') return plan;

    await tx.query(
      `INSERT INTO parallel_game_winners
         (id, parallel_id, empresa_id, evento_id, crianca_id, time_id, position, points, leitura_id, won_at)
       VALUES (@id, @parallelId, @empresaId, @eventoId, @criancaId, @timeId, @position, @points, @leituraId, @wonAt)`,
      {
        id: uuidv4(), parallelId: game.id, empresaId: crianca.empresa_id, eventoId, criancaId: crianca.id,
        timeId: crianca.time_id || null, position: plan.position, points: plan.points, leituraId, wonAt: now,
      }
    );
    await tx.query('UPDATE criancas SET scores = COALESCE(scores, 0) + @points WHERE id = @criancaId', { points: plan.points, criancaId: crianca.id });
    if (crianca.time_id) {
      await tx.query(
        `UPDATE times SET points = (SELECT COALESCE(SUM(scores), 0) FROM criancas WHERE time_id = @timeId) WHERE id = @timeId`,
        { timeId: crianca.time_id }
      );
    }
    // Histórico de leituras (alimenta o placar e os relatórios, como nos outros jogos).
    await tx.query(
      `INSERT INTO leituras
        (id, checkpoint_id, crianca_id, uid, brincadeira_id, authorized, points_awarded, signal_strength, empresa_id, session_id)
       VALUES (@id, @checkpointId, @criancaId, @uid, NULL, 1, @points, -45, @empresaId, @sessionId)`,
      { id: leituraId, checkpointId, criancaId: crianca.id, uid, points: plan.points, empresaId: crianca.empresa_id, sessionId: global.currentSessionId || null }
    );

    const finished = plan.position >= (prizes.length || PARALLEL_PRIZES.length);
    if (finished) {
      await tx.query(
        `UPDATE parallel_games SET status = 'finished', finished_at = CURRENT_TIMESTAMP, finish_reason = 'completed' WHERE id = @id`,
        { id: game.id }
      );
    }
    return { ...plan, finished };
  });

  const result = { handled: true, status: outcome.status, position: outcome.position || null, points: outcome.points || 0, finished: Boolean(outcome.finished) };

  if (outcome.status === 'won') {
    const team = crianca.time_id ? await queryOne('SELECT name, color FROM times WHERE id = @id', { id: crianca.time_id }) : null;
    const name = crianca.nickname || crianca.name;
    broadcastEvent(eventoId, {
      type: 'PARALLEL_GAME_WINNER',
      payload: {
        eventoId, parallelId: active.id, position: outcome.position, points: outcome.points,
        criancaId: crianca.id, criancaName: name, teamName: team?.name || '', teamColor: team?.color || '',
      },
    });
    if (outcome.finished) {
      broadcastEvent(eventoId, { type: 'PARALLEL_GAME_FINISHED', payload: { eventoId, parallelId: active.id, reason: 'completed' } });
    }
    await announceOnDisplay(eventoId, `${positionLabel(outcome.position)} lugar: ${name}${team?.name ? ` (${team.name})` : ''} +${outcome.points} pontos`);
  }

  return result;
}

module.exports = {
  getActiveParallelGame,
  getParallelGameOverview,
  startParallelGame,
  stopParallelGame,
  processParallelScan,
};
