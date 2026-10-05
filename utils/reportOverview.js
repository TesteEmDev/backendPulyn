// Relatório geral (todos os eventos do buffet): totais e evolução mensal a partir das
// linhas por evento. As consultas ficam em routes/reports.js; aqui só a aritmética.
const toNumber = (value) => Number(value) || 0;

const FINISHED = new Set(['finished', 'completed']);
const RUNNING = new Set(['active', 'ongoing']);

// eventRows: [{ id, name, date: 'YYYY-MM-DD', status, participants, teams, total_points, scorings }]
function summarizeEvents(eventRows) {
  const events = eventRows.map((row) => {
    const participants = toNumber(row.participants);
    const totalPoints = toNumber(row.total_points);
    return {
      id: row.id,
      name: row.name,
      date: String(row.date || '').slice(0, 10),
      status: String(row.status || '').toLowerCase(),
      participants,
      teams: toNumber(row.teams),
      totalPoints,
      avgPoints: participants > 0 ? Math.round(totalPoints / participants) : 0,
      scorings: toNumber(row.scorings),
    };
  });

  const participants = events.reduce((sum, e) => sum + e.participants, 0);
  const totalPoints = events.reduce((sum, e) => sum + e.totalPoints, 0);
  const totals = {
    events: events.length,
    finishedEvents: events.filter((e) => FINISHED.has(e.status)).length,
    runningEvents: events.filter((e) => RUNNING.has(e.status)).length,
    participants,
    teams: events.reduce((sum, e) => sum + e.teams, 0),
    totalPoints,
    avgPoints: participants > 0 ? Math.round(totalPoints / participants) : 0,
    scorings: events.reduce((sum, e) => sum + e.scorings, 0),
  };

  // Eventos e participantes por mês ("2026-10"), em ordem cronológica; eventos sem data ficam de fora.
  const months = new Map();
  for (const event of events) {
    const month = event.date.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) continue;
    const entry = months.get(month) || { month, events: 0, participants: 0 };
    entry.events += 1;
    entry.participants += event.participants;
    months.set(month, entry);
  }
  const byMonth = [...months.values()].sort((a, b) => a.month.localeCompare(b.month));

  return { totals, events, byMonth };
}

module.exports = { summarizeEvents };
