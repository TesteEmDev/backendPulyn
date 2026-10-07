const { query, queryOne } = require('../database');

const CLOSED_EVENT_STATUSES = new Set(['completed', 'cancelled', 'canceled', 'finished']);

function isOpenEvent(event) {
  return event && !CLOSED_EVENT_STATUSES.has(String(event.status || '').trim().toLowerCase());
}

async function getActiveEvent(empresaId) {
  const selected = await queryOne(
    `SELECT c.empresaId, c.eventoId, e.nome AS evento_name, e.status AS evento_status
     FROM controleEventoEmpresa c
     LEFT JOIN evento e ON e.eventoId = c.eventoId AND e.empresaId = c.empresaId
     WHERE c.empresaId = @empresaId`,
    { empresaId }
  );

  if (!selected?.eventoId || !selected.evento_name || !isOpenEvent({ status: selected.evento_status })) {
    return null;
  }

  return {
    id: selected.eventoId,
    name: selected.evento_name,
    status: selected.evento_status,
  };
}

async function setActiveEvent(empresaId, eventoId) {
  let event = null;
  if (eventoId) {
    event = await queryOne(
      `SELECT eventoId, nome, status
       FROM "evento"
       WHERE eventoId = @eventoId AND empresaId = @empresaId`,
      { eventoId, empresaId }
    );
    if (!event) return { error: 'Evento não encontrado', status: 404 };
    if (!isOpenEvent(event)) return { error: 'Este evento não está aberto', status: 409 };
  }

  const existing = await queryOne(
    'SELECT empresaId FROM controleEventoEmpresa WHERE empresaId = @empresaId',
    { empresaId }
  );

  if (existing) {
    await query(
      `UPDATE controleEventoEmpresa
       SET eventoId = @eventoId, atualizadoEm = GETDATE()
       WHERE empresaId = @empresaId`,
      { empresaId, eventoId: event?.eventoId || null }
    );
  } else {
    await query(
      `INSERT INTO controleEventoEmpresa (empresaId, eventoId, atualizadoEm)
       VALUES (@empresaId, @eventoId, GETDATE())`,
      { empresaId, eventoId: event?.eventoId || null }
    );
  }

  return { event };
}

module.exports = { getActiveEvent, setActiveEvent, isOpenEvent };
