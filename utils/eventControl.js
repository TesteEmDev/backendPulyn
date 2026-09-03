const { query, queryOne } = require('../database');

const CLOSED_EVENT_STATUSES = new Set(['completed', 'cancelled', 'canceled', 'finished']);

function isOpenEvent(event) {
  return event && !CLOSED_EVENT_STATUSES.has(String(event.status || '').trim().toLowerCase());
}

async function getActiveEvent(empresaId) {
  const selected = await queryOne(
    `SELECT c.empresa_id, c.evento_id, e.name AS evento_name, e.status AS evento_status
     FROM empresa_event_control c
     LEFT JOIN eventos e ON e.id = c.evento_id AND e.empresa_id = c.empresa_id
     WHERE c.empresa_id = @empresaId`,
    { empresaId }
  );

  if (!selected?.evento_id || !selected.evento_name || !isOpenEvent({ status: selected.evento_status })) {
    return null;
  }

  return {
    id: selected.evento_id,
    name: selected.evento_name,
    status: selected.evento_status,
  };
}

async function setActiveEvent(empresaId, eventoId) {
  let event = null;
  if (eventoId) {
    event = await queryOne(
      `SELECT id, name, status
       FROM eventos
       WHERE id = @eventoId AND empresa_id = @empresaId`,
      { eventoId, empresaId }
    );
    if (!event) return { error: 'Evento não encontrado', status: 404 };
    if (!isOpenEvent(event)) return { error: 'Este evento não está aberto', status: 409 };
  }

  const existing = await queryOne(
    'SELECT empresa_id FROM empresa_event_control WHERE empresa_id = @empresaId',
    { empresaId }
  );

  if (existing) {
    await query(
      `UPDATE empresa_event_control
       SET evento_id = @eventoId, updated_at = GETDATE()
       WHERE empresa_id = @empresaId`,
      { empresaId, eventoId: event?.id || null }
    );
  } else {
    await query(
      `INSERT INTO empresa_event_control (empresa_id, evento_id, updated_at)
       VALUES (@empresaId, @eventoId, GETDATE())`,
      { empresaId, eventoId: event?.id || null }
    );
  }

  return { event };
}

module.exports = { getActiveEvent, setActiveEvent, isOpenEvent };
