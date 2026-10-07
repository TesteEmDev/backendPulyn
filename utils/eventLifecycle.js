// utils/eventLifecycle.js - Ciclo de vida do evento: agendado -> ativo -> encerrado
//
// eventos.status representa SOMENTE o ciclo de vida do evento. Iniciar/parar um
// jogo dentro do evento não muda mais esse status (antes, "iniciar jogo" virava
// o evento para 'active' e "parar jogo" voltava para 'scheduled').
const { query, queryOne, allQuery } = require('../database');

// Data e hora do evento são digitadas pelo buffet no relógio local dele, sem fuso.
// O servidor (Render) roda em UTC, então o "agora" é convertido para esse fuso.
const EVENT_TIMEZONE = process.env.EVENT_TIMEZONE || 'America/Sao_Paulo';
const DEFAULT_DURATION_MINUTES = 60;

const CLOSED_STATUSES = new Set(['finished', 'completed', 'cancelled', 'canceled']);

const normalizeStatus = (status) => String(status || 'scheduled').trim().toLowerCase();
const isClosedStatus = (status) => CLOSED_STATUSES.has(normalizeStatus(status));

// Relógio de parede do fuso do evento, em ms (mesma escala que wallClockOf).
function wallClockNow(now = new Date(), timeZone = EVENT_TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(now);
  const part = (type) => Number(parts.find((p) => p.type === type).value);
  return Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'));
}

// 'YYYY-MM-DD' + 'HH:MM' (ou 'HH:MM:SS') -> ms no relógio de parede; null se inválido.
function wallClockOf(dateStr, timeStr) {
  const date = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr || ''));
  const time = /^(\d{1,2}):(\d{2})/.exec(String(timeStr || ''));
  if (!date || !time) return null;
  return Date.UTC(Number(date[1]), Number(date[2]) - 1, Number(date[3]), Number(time[1]), Number(time[2]), 0);
}

function durationMsOf(row) {
  const minutes = Number(row.duration);
  return (Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_DURATION_MINUTES) * 60000;
}

// Decide o que fazer com um evento agora: 'start', 'finish' ou null.
//  - 'start': agendado, com início automático, dentro da janela [início, início + duração).
//    Se a janela inteira já passou sem o evento começar, ele NÃO inicia sozinho.
//  - 'finish': ativo, com encerramento automático, e já passou (início real + duração).
//    O início real (iniciadoEm) vale mesmo quando o admin iniciou manualmente,
//    então a duração conta a partir de quando o evento realmente começou.
function evaluateLifecycle(row, now = new Date(), timeZone = EVENT_TIMEZONE) {
  const status = normalizeStatus(row.status);
  const nowWall = wallClockNow(now, timeZone);
  const durationMs = durationMsOf(row);
  const scheduledStart = wallClockOf(row.date_str, row.time_str);

  if (status === 'scheduled' && Number(row.autoInicio) === 1) {
    if (scheduledStart === null) return null;
    return nowWall >= scheduledStart && nowWall < scheduledStart + durationMs ? 'start' : null;
  }

  if (status === 'active' && Number(row.autoFim) === 1) {
    const base = row.iniciadoEm ? wallClockNow(new Date(row.iniciadoEm), timeZone) : scheduledStart;
    if (base === null || Number.isNaN(base)) return null;
    return nowWall >= base + durationMs ? 'finish' : null;
  }

  return null;
}

function broadcastCompany(empresaId, message) {
  if (empresaId && typeof global.broadcastToCompany === 'function') {
    global.broadcastToCompany(empresaId, message);
  }
}

// agendado -> ativo. Retorna true se realmente mudou (false se já não estava agendado).
async function startEvent(eventoId, { source = 'manual' } = {}) {
  const result = await query(
    `UPDATE "evento"
     SET status = 'active',
         iniciadoEm = COALESCE(iniciadoEm, CURRENT_TIMESTAMP),
         finalizadoEm = NULL
     WHERE LOWER("eventoId") = LOWER(@eventoId)
       AND LOWER(COALESCE(status, 'scheduled')) = 'scheduled'`,
    { eventoId }
  );
  const changed = Number(result?.rowsAffected?.[0] || 0) > 0;
  if (!changed) return false;

  const evento = await queryOne('SELECT "eventoId", empresaId, iniciadoEm FROM "evento" WHERE LOWER("eventoId") = LOWER(@eventoId)', { eventoId });
  console.log(`▶️ [EVENTO] ${eventoId} iniciado (${source})`);
  broadcastCompany(evento?.empresaId, {
    type: 'EVENT_STATUS_CHANGED',
    payload: { eventoId, status: 'active', startedAt: evento?.iniciadoEm || null, source },
  });
  return true;
}

// Usado quando um jogo começa dentro do evento: o evento passa a estar ativo,
// mas parar o jogo depois nunca o desativa.
async function ensureEventActive(eventoId) {
  return startEvent(eventoId, { source: 'game' });
}

// ativo/agendado -> encerrado. `stopGame(eventoId)` para o jogo em andamento antes.
async function finishEvent(eventoId, { source = 'manual', stopGame } = {}) {
  const evento = await queryOne(
    'SELECT "eventoId", empresaId, status FROM "evento" WHERE LOWER("eventoId") = LOWER(@eventoId)',
    { eventoId }
  );
  if (!evento) return { changed: false, reason: 'not_found' };
  if (isClosedStatus(evento.status)) return { changed: false, reason: 'already_finished' };

  if (typeof stopGame === 'function') {
    try {
      await stopGame(evento.eventoId);
    } catch (err) {
      console.warn(`⚠️ [EVENTO] Não foi possível parar o jogo ao encerrar ${evento.eventoId}: ${err.message}`);
    }
  }

  const result = await query(
    `UPDATE "evento"
     SET status = 'finished',
         finalizadoEm = CURRENT_TIMESTAMP,
         brincadeiraAtivaId = NULL,
         tipoJogoAtivo = 'none'
     WHERE LOWER(eventoId) = LOWER(@eventoId)
       AND LOWER(COALESCE(status, 'scheduled')) NOT IN ('finished', 'completed', 'cancelled', 'canceled')`,
    { eventoId: evento.eventoId }
  );
  if (!(Number(result?.rowsAffected?.[0] || 0) > 0)) return { changed: false, reason: 'already_finished' };

  // Recepção/kiosk deixam de ter este evento selecionado (getActiveEvent já ignora
  // eventos encerrados; aqui os telas abertas são avisadas na hora).
  // Skip - Table não existe no novo schema em português
  // const unselected = await query(
  //   `UPDATE "empresaEventoControle" SET eventoId = NULL, updated_at = CURRENT_TIMESTAMP
  //    WHERE LOWER(eventoId) = LOWER(@eventoId)`,
  //   { eventoId: evento.id }
  // );
  const unselected = { rowsAffected: [0] };
  if (Number(unselected?.rowsAffected?.[0] || 0) > 0) {
    broadcastCompany(evento.empresaId, {
      type: 'EVENT_SELECTED',
      payload: { eventoId: null, eventName: null, eventStatus: null, updatedAt: new Date().toISOString() },
    });
  }

  console.log(`⏹️ [EVENTO] ${evento.eventoId} encerrado (${source})`);
  broadcastCompany(evento.empresaId, {
    type: 'EVENT_STATUS_CHANGED',
    payload: { eventoId: evento.eventoId, status: 'finished', source },
  });
  return { changed: true };
}

// Reabre um evento encerrado: volta para "agendado" na nova data/horário (e duração, se informada),
// sem início nem fim registrados. Participantes, times, checkpoints e jogos continuam como estavam.
// O início/encerramento automáticos seguem as opções que o evento já tinha.
async function reopenEvent(eventoId, { date, time, duration } = {}) {
  const evento = await queryOne(
    'SELECT "eventoId", empresaId, status FROM "evento" WHERE LOWER("eventoId") = LOWER(@eventoId)',
    { eventoId }
  );
  if (!evento) return { changed: false, reason: 'not_found' };
  if (!isClosedStatus(evento.status)) return { changed: false, reason: 'not_finished' };

  const result = await query(
    `UPDATE "evento"
     SET status = 'scheduled',
         data = @date,
         hora = @time,
         duracao = COALESCE(@duration, duracao),
         iniciadoEm = NULL,
         finalizadoEm = NULL,
         brincadeiraAtivaId = NULL,
         tipoJogoAtivo = 'none'
     WHERE LOWER(eventoId) = LOWER(@eventoId)
       AND LOWER(COALESCE(status, 'scheduled')) IN ('finished', 'completed', 'cancelled', 'canceled')`,
    { eventoId: evento.eventoId, date, time, duration: duration ?? null }
  );
  if (!(Number(result?.rowsAffected?.[0] || 0) > 0)) return { changed: false, reason: 'not_finished' };

  console.log(`🔓 [EVENTO] ${evento.eventoId} reaberto para ${date} ${time}`);
  broadcastCompany(evento.empresaId, {
    type: 'EVENT_STATUS_CHANGED',
    payload: { eventoId: evento.eventoId, status: 'scheduled', source: 'reopen' },
  });
  return { changed: true };
}

// Uma varredura: inicia e encerra os eventos que chegaram na hora.
async function runLifecycleTick({ stopGame, now = new Date() } = {}) {
  const rows = await allQuery(`
    SELECT eventoId, empresaId, status, duracao, iniciadoEm, autoInicio, autoFim,
           CAST([data] AS VARCHAR(10)) AS date_str,
           CAST([hora] AS VARCHAR(5)) AS time_str
    FROM "evento"
    WHERE (autoInicio = 1 AND LOWER(COALESCE(status, 'scheduled')) = 'scheduled')
       OR (autoFim = 1 AND LOWER(COALESCE(status, '')) = 'active')
  `);

  const actions = [];
  for (const row of rows) {
    const action = evaluateLifecycle(row, now);
    if (!action) continue;
    try {
      if (action === 'start') await startEvent(row.id, { source: 'auto' });
      else await finishEvent(row.id, { source: 'auto', stopGame });
      actions.push({ eventoId: row.id, action });
    } catch (err) {
      console.error(`❌ [EVENTO] Falha ao aplicar '${action}' automático em ${row.id}:`, err.message);
    }
  }
  return actions;
}

function startLifecycleScheduler({ stopGame, intervalMs = 15000 } = {}) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runLifecycleTick({ stopGame });
    } catch (err) {
      console.error('❌ [EVENTO] Erro na varredura de início/fim automático:', err.message);
    } finally {
      running = false;
    }
  };
  setTimeout(tick, 5000);
  return setInterval(tick, intervalMs);
}

module.exports = {
  EVENT_TIMEZONE,
  isClosedStatus,
  wallClockNow,
  wallClockOf,
  evaluateLifecycle,
  startEvent,
  ensureEventActive,
  finishEvent,
  reopenEvent,
  runLifecycleTick,
  startLifecycleScheduler,
};
