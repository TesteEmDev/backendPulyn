// utils/parallelGame.js - Brincadeira paralela (corrida do checkpoint)
//
// Durante a brincadeira principal, o recreacionista escolhe um checkpoint e inicia a disputa: os 3
// primeiros participantes a lê-lo ganham 50, 40 e 30 pontos. Enquanto a disputa está ativa, a leitura
// desse checkpoint vale só para ela (não conta para o jogo principal); quando o 3º lugar é preenchido
// (ou o recreacionista encerra) o checkpoint volta ao jogo principal.
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { query, queryOne, allQuery, withTransaction } = require('../database');
const { PARALLEL_PRIZES, planParallelAward, positionLabel } = require('./parallelRules');
const { listObjects } = require('./parallelObjects');
const { buildWheel } = require('./parallelObjectsRules');

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
      `INSERT INTO mensagemDisplay (mensagemId, eventoId, texto, tipo, remetente, enviadoEm)
       VALUES (@id, @eventoId, @text, 'custom', 'brincadeira-paralela', CURRENT_TIMESTAMP)`,
      { id, eventoId, text }
    );
    const sentAt = new Date().toISOString();
    broadcastEvent(eventoId, {
      type: 'DISPLAY_MESSAGE',
      payload: { id, eventoId, texto: text, type: 'custom', remetente: 'brincadeira-paralela', timestamp: sentAt, enviadoEm: sentAt },
      timestamp: sentAt,
    });
  } catch (err) {
    // O aviso no telão nunca pode derrubar a leitura já confirmada.
    console.error('⚠️ [PARALELA] Não foi possível avisar o telão:', err.message);
  }
}

async function loadWinners(parallelId) {
  return allQuery(
    `SELECT w.posicao, w.pontos, w.venceuEm, w.criancaId, w.timeId,
            c.nome AS crianca_name, c.apelido, c.avatar,
            t.nome AS time_name, t.cor AS time_color
     FROM vencedorBrincadeiraParalela w
     JOIN crianca c ON c.criancaId = w.criancaId
     LEFT JOIN time t ON t.timeId = w.timeId
     WHERE w.paralelaId = @parallelId
     ORDER BY w.posicao ASC`,
    { parallelId }
  );
}

const serializeWinner = (row) => ({
  position: Number(row.posicao),
  points: Number(row.pontos),
  wonAt: row.venceuEm,
  criancaId: row.criancaId,
  criancaName: row.apelido || row.crianca_name,
  avatar: row.avatar || null,
  teamName: row.time_name || '',
  teamColor: row.time_color || '',
});

async function serializeGame(row) {
  const winners = await loadWinners(row.id);
  return {
    id: row.id,
    eventoId: row.eventoId,
    checkpointId: row.checkpointId,
    checkpointName: row.checkpoint_name || '',
    objectName: row.nomeObjeto || '',
    status: row.status,
    prizes: String(row.premios || '').split(',').map(Number),
    startedAt: row.iniciadoEm,
    finishedAt: row.finalizadoEm,
    finishReason: row.motivoFim || null,
    winners: winners.map(serializeWinner),
  };
}

async function getActiveParallelGame(eventoId) {
  return queryOne(
    `SELECT g.*, cp.nome AS checkpoint_name
     FROM brincadeiraParalela g
     LEFT JOIN pontoVerificacao cp ON cp.checkpointId = g.checkpointId
     WHERE LOWER(g.eventoId) = LOWER(@eventoId) AND g.status = 'active'`,
    { eventoId }
  );
}

// Disputa ativa + as últimas encerradas, para a tela do recreacionista.
async function getParallelGameOverview(eventoId, historyLimit = 5) {
  const active = await getActiveParallelGame(eventoId);
  const finished = await allQuery(
    `SELECT g.*, cp.nome AS checkpoint_name
     FROM brincadeiraParalela g
     LEFT JOIN pontoVerificacao cp ON cp.checkpointId = g.checkpointId
     WHERE LOWER(g.eventoId) = LOWER(@eventoId) AND g.status = 'finished'
     ORDER BY g.iniciadoEm DESC
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
    `SELECT eventoId, empresaId, status
     FROM evento WHERE LOWER(eventoId) = LOWER(@eventoId)`,
    { eventoId }
  );
  if (!evento) throw httpError('Evento não encontrado', 404);
  if (String(evento.empresaId).toLowerCase() !== String(empresaId).toLowerCase()) {
    throw httpError('Acesso negado: evento não pertence à sua empresa', 403);
  }
  if (CLOSED_EVENT_STATUSES.has(String(evento.status || '').toLowerCase())) {
    throw httpError('Este evento não está aberto', 409);
  }

  const checkpoint = await queryOne(
    `SELECT checkpointId, nome, proposito FROM pontoVerificacao
     WHERE LOWER(checkpointId) = LOWER(@checkpointId) AND LOWER(eventoId) = LOWER(@eventoId)`,
    { checkpointId, eventoId }
  );
  if (!checkpoint) throw httpError('Checkpoint não pertence a este evento', 400);
  if (String(checkpoint.proposito || 'game').toLowerCase() === 'reception') {
    throw httpError('O checkpoint da recepção não pode ser usado na brincadeira paralela', 400);
  }

  if (await getActiveParallelGame(evento.eventoId)) {
    throw httpError('Já existe uma brincadeira paralela em andamento neste evento', 409);
  }

  // A roleta: o objeto é sorteado aqui no servidor (todas as telas veem o mesmo resultado) e a
  // animação só mostra o sorteio já feito.
  const objects = await listObjects(evento.empresaId);
  if (objects.length === 0) throw httpError('Cadastre pelo menos um objeto na lista antes de iniciar', 409);
  const chosen = objects[crypto.randomInt(objects.length)];
  const wheel = buildWheel(objects, chosen.id);

  const id = uuidv4();
  try {
    await query(
      `INSERT INTO brincadeiraParalela (id, empresaId, eventoId, checkpointId, status, premios, iniciadoPor, nomeObjeto)
       VALUES (@id, @empresaId, @eventoId, @checkpointId, 'active', @prizes, @userId, @objectName)`,
      { id, empresaId: evento.empresaId, eventoId: evento.eventoId, checkpointId: checkpoint.checkpointId, prizes: PARALLEL_PRIZES.join(','), userId: userId || null, objectName: chosen.name }
    );
  } catch (err) {
    // O índice único (um ativo por evento) protege duas partidas começando ao mesmo tempo.
    if (/unique|duplicate/i.test(String(err.message))) throw httpError('Já existe uma brincadeira paralela em andamento neste evento', 409);
    throw err;
  }

  const [first, second, third] = PARALLEL_PRIZES;
  broadcastEvent(evento.eventoId, {
    type: 'PARALLEL_GAME_STARTED',
    payload: {
      eventoId: evento.eventoId,
      parallelId: id,
      checkpointId: checkpoint.checkpointId,
      checkpointName: checkpoint.nome,
      objectName: chosen.name,
      // O telão também gira a roleta e para no mesmo objeto.
      roulette: { segments: wheel.segments, winnerIndex: wheel.winnerIndex },
    },
  });
  await announceOnDisplay(
    evento.eventoId,
    `Brincadeira paralela! Achem: ${chosen.name}. Os 3 primeiros a levar até "${checkpoint.nome}" e ler a pulseira ganham ${first}, ${second} e ${third} pontos`
  );

  const game = await serializeGame({ ...(await getActiveParallelGame(evento.eventoId)) });
  return { ...game, roulette: { segments: wheel.segments, winnerIndex: wheel.winnerIndex, objectName: chosen.name } };
}

// Encerra a disputa ativa do evento (manual, ao parar a brincadeira principal ou ao fechar o evento).
async function stopParallelGame(eventoId, reason = 'manual') {
  const active = await getActiveParallelGame(eventoId);
  if (!active) return null;
  await query(
    `UPDATE brincadeiraParalela SET status = 'finished', finalizadoEm = CURRENT_TIMESTAMP, motivoFim = @reason
     WHERE id = @id AND status = 'active'`,
    { id: active.id, reason }
  );
  broadcastEvent(active.eventoId, { type: 'PARALLEL_GAME_FINISHED', payload: { eventoId: active.eventoId, parallelId: active.id, reason } });
  return active.id;
}

// Processa a leitura de uma criança. Devolve null se não há disputa ativa para ESTE checkpoint
// (a leitura segue o fluxo normal do jogo); senão, o resultado para responder ao leitor.
async function processParallelScan({ eventoId, checkpointId, crianca, uid, leituraId, now = new Date() }) {
  const active = await getActiveParallelGame(eventoId);
  if (!active || String(active.checkpointId).toLowerCase() !== String(checkpointId).toLowerCase()) return null;

  const outcome = await withTransaction(async (tx) => {
    // Trava a linha da disputa: duas leituras ao mesmo tempo entram uma por vez e ninguém fura a fila.
    const game = await tx.queryOne(
      `SELECT id, status, premios FROM brincadeiraParalela WHERE id = @id FOR UPDATE`,
      { id: active.id }
    );
    if (!game || game.status !== 'active') return { status: 'closed' };

    const winners = await tx.allQuery(
      'SELECT criancaId AS crianca_id, posicao AS position FROM vencedorBrincadeiraParalela WHERE paralelaId = @id ORDER BY posicao',
      { id: game.id }
    );
    const prizes = String(game.premios || '').split(',').map(Number).filter(Number.isFinite);
    const plan = planParallelAward(winners, crianca.criancaId, prizes.length ? prizes : PARALLEL_PRIZES);
    if (plan.status !== 'won') return plan;

    await tx.query(
      `INSERT INTO vencedorBrincadeiraParalela
         (id, paralelaId, empresaId, eventoId, criancaId, timeId, posicao, pontos, leituraId, venceuEm)
       VALUES (@id, @parallelId, @empresaId, @eventoId, @criancaId, @timeId, @position, @points, @leituraId, @wonAt)`,
      {
        id: uuidv4(), parallelId: game.id, empresaId: crianca.empresaId, eventoId, criancaId: crianca.criancaId,
        timeId: crianca.timeId || null, position: plan.position, points: plan.points, leituraId, wonAt: now,
      }
    );
    await tx.query('UPDATE crianca SET pontos = COALESCE(pontos, 0) + @points WHERE criancaId = @criancaId', { points: plan.points, criancaId: crianca.criancaId });
    if (crianca.timeId) {
      await tx.query(
        `UPDATE time SET pontos = (SELECT COALESCE(SUM(pontos), 0) FROM crianca WHERE timeId = @timeId) WHERE timeId = @timeId`,
        { timeId: crianca.timeId }
      );
    }
    // Histórico de leituras (alimenta o placar e os relatórios, como nos outros jogos).
    await tx.query(
      `INSERT INTO leitura
        (leituraId, checkpointId, criancaId, uid, brincadeiraId, autorizado, pontosAtribuidos, forcaSinal, empresaId, sessaoId)
       VALUES (@id, @checkpointId, @criancaId, @uid, NULL, 1, @points, -45, @empresaId, @sessionId)`,
      { id: leituraId, checkpointId, criancaId: crianca.criancaId, uid, points: plan.points, empresaId: crianca.empresaId, sessionId: global.currentSessionId || null }
    );

    const finished = plan.position >= (prizes.length || PARALLEL_PRIZES.length);
    if (finished) {
      await tx.query(
        `UPDATE brincadeiraParalela SET status = 'finished', finalizadoEm = CURRENT_TIMESTAMP, motivoFim = 'completed' WHERE id = @id`,
        { id: game.id }
      );
    }
    return { ...plan, finished };
  });

  const result = { handled: true, status: outcome.status, position: outcome.position || null, points: outcome.points || 0, finished: Boolean(outcome.finished) };

  if (outcome.status === 'won') {
    const team = crianca.timeId ? await queryOne('SELECT nome, cor FROM time WHERE timeId = @id', { id: crianca.timeId }) : null;
    const name = crianca.apelido || crianca.nome;
    broadcastEvent(eventoId, {
      type: 'PARALLEL_GAME_WINNER',
      payload: {
        eventoId, parallelId: active.id, position: outcome.position, points: outcome.points,
        criancaId: crianca.criancaId, criancaName: name, teamName: team?.nome || '', teamColor: team?.cor || '',
      },
    });
    if (outcome.finished) {
      broadcastEvent(eventoId, { type: 'PARALLEL_GAME_FINISHED', payload: { eventoId, parallelId: active.id, reason: 'completed' } });
    }
    await announceOnDisplay(eventoId, `${positionLabel(outcome.position)} lugar: ${name}${team?.nome ? ` (${team.nome})` : ''} +${outcome.points} pontos`);
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
