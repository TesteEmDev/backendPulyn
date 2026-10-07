// utils/braceletRelease.js - Libera as pulseiras de um evento depois que ele termina
//
// 10 minutos depois do encerramento do evento (eventos.ended_at), todas as pulseiras ligadas às
// crianças daquele evento voltam a ficar sem dono: pulseiras.status = 'disponivel',
// pulseiras.crianca_id = NULL e criancas.bracelet_code = NULL (o mesmo que "Desvincular pulseira"
// faz para uma criança). A pulseira usada fica em criancas.last_bracelet_code para os relatórios.
// O histórico de pontuação, as leituras e os vínculos de família continuam.
const { query, allQuery, withTransaction } = require('../database');

const BRACELET_RELEASE_DELAY_MS = 10 * 60 * 1000;
const CLOSED_FOR_RELEASE = ['finished', 'completed'];

function broadcastCompany(empresaId, message) {
  if (empresaId && typeof global.broadcastToCompany === 'function') {
    global.broadcastToCompany(empresaId, message);
  }
}

// Já passou o prazo desde o encerramento? Sem data de encerramento nunca está vencido.
function isBraceletReleaseDue(endedAt, now = new Date(), delayMs = BRACELET_RELEASE_DELAY_MS) {
  if (!endedAt) return false;
  const endedMs = new Date(endedAt).getTime();
  if (Number.isNaN(endedMs)) return false;
  return now.getTime() - endedMs >= delayMs;
}

// Executa a liberação usando `db` (a transação ou o próprio módulo database).
// Retorna { braceletsReleased, childrenCleared }.
async function releaseBraceletsWith(db, eventoId) {
  // Pela ligação da pulseira com a criança...
  const byLink = await db.query(
    `UPDATE pulseira SET status = 'disponivel', criancaId = NULL
     WHERE criancaId IN (SELECT criancaId FROM crianca WHERE LOWER(eventoId) = LOWER(@eventoId))`,
    { eventoId }
  );
  // ...e pelo código guardado na criança (cobre vínculo que ficou só de um lado).
  const byCode = await db.query(
    `UPDATE pulseira SET status = 'disponivel', criancaId = NULL
     WHERE status <> 'disponivel'
       AND codigo IN (SELECT codigoPulseira FROM crianca
                    WHERE LOWER(eventoId) = LOWER(@eventoId) AND codigoPulseira IS NOT NULL)`,
    { eventoId }
  );
  // A criança guarda qual pulseira usou (ultimaPulseira) para os relatórios; só o vínculo é desfeito.
  const cleared = await db.query(
    `UPDATE crianca SET ultimaPulseira = codigoPulseira, codigoPulseira = NULL
     WHERE LOWER(eventoId) = LOWER(@eventoId) AND codigoPulseira IS NOT NULL`,
    { eventoId }
  );
  return {
    braceletsReleased: Number(byLink?.rowsAffected?.[0] || 0) + Number(byCode?.rowsAffected?.[0] || 0),
    childrenCleared: Number(cleared?.rowsAffected?.[0] || 0),
  };
}

// Solta todas as pulseiras das crianças do evento, tudo ou nada.
function releaseBraceletsForEvent(eventoId) {
  return withTransaction((tx) => releaseBraceletsWith(tx, eventoId));
}

// Uma varredura: libera as pulseiras dos eventos encerrados há 10 minutos ou mais que ainda as têm.
async function runBraceletReleaseTick({ now = new Date() } = {}) {
  const candidates = await allQuery(
    `SELECT e.eventoId, e.empresaId, e.nome, e.finalizadoEm
     FROM evento e
     WHERE LOWER(COALESCE(e.status, '')) IN ('finished', 'completed')
       AND e.finalizadoEm IS NOT NULL
       AND (
         EXISTS (SELECT 1 FROM crianca c
                 WHERE LOWER(c.eventoId) = LOWER(e.eventoId) AND c.codigoPulseira IS NOT NULL)
         OR EXISTS (SELECT 1 FROM pulseira p JOIN crianca c ON c.criancaId = p.criancaId
                    WHERE LOWER(c.eventoId) = LOWER(e.eventoId))
       )`
  );

  const released = [];
  for (const event of candidates) {
    if (!isBraceletReleaseDue(event.finalizadoEm, now)) continue;
    try {
      const result = await releaseBraceletsForEvent(event.eventoId);
      released.push({ eventoId: event.eventoId, ...result });
      console.log(`🔓 [PULSEIRAS] Evento "${event.nome}": ${result.braceletsReleased} pulseira(s) liberada(s), ${result.childrenCleared} criança(s) sem pulseira`);
      broadcastCompany(event.empresaId, {
        type: 'BRACELETS_RELEASED',
        payload: { eventoId: event.eventoId, braceletsReleased: result.braceletsReleased },
      });
    } catch (err) {
      console.error(`❌ [PULSEIRAS] Falha ao liberar as pulseiras do evento ${event.eventoId}:`, err.message);
    }
  }
  return released;
}

function startBraceletReleaseScheduler({ intervalMs = 60 * 1000 } = {}) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runBraceletReleaseTick();
    } catch (err) {
      console.error('❌ [PULSEIRAS] Erro na varredura de liberação de pulseiras:', err.message);
    } finally {
      running = false;
    }
  };
  setTimeout(tick, 10000);
  return setInterval(tick, intervalMs);
}

module.exports = {
  BRACELET_RELEASE_DELAY_MS,
  CLOSED_FOR_RELEASE,
  isBraceletReleaseDue,
  releaseBraceletsWith,
  releaseBraceletsForEvent,
  runBraceletReleaseTick,
  startBraceletReleaseScheduler,
};
