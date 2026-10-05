// Sorteio de participantes entre os times de um evento.
//
// mode 'unassigned': só quem está sem time entra no sorteio; cada um vai para o
//   time com menos membros no momento, então os times terminam equilibrados
//   mesmo quando já tinham gente.
// mode 'all': todos são sorteados do zero, mantendo os times com tamanhos que
//   diferem em no máximo 1.
const DISTRIBUTION_MODES = new Set(['unassigned', 'all']);

function shuffle(items, random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// children: [{ id, time_id }]  |  teamIds: ids dos times do evento
// Retorna só as mudanças: [{ criancaId, timeId }]
function planRandomDistribution({ children, teamIds, mode = 'unassigned', random = Math.random }) {
  if (!DISTRIBUTION_MODES.has(mode)) throw new Error('Modo de distribuição inválido');
  if (!Array.isArray(teamIds) || teamIds.length === 0) return [];

  const validTeams = new Set(teamIds);
  const counts = new Map(teamIds.map(id => [id, 0]));
  const pool = [];

  for (const child of children) {
    const hasValidTeam = child.time_id && validTeams.has(child.time_id);
    if (mode === 'all' || !hasValidTeam) pool.push(child);
    else counts.set(child.time_id, counts.get(child.time_id) + 1);
  }

  const assignments = [];
  for (const child of shuffle(pool, random)) {
    const smallest = Math.min(...counts.values());
    const candidates = teamIds.filter(id => counts.get(id) === smallest);
    const timeId = candidates[Math.floor(random() * candidates.length)];
    counts.set(timeId, smallest + 1);
    if (child.time_id !== timeId) assignments.push({ criancaId: child.id, timeId });
  }
  return assignments;
}

module.exports = { planRandomDistribution, DISTRIBUTION_MODES };
