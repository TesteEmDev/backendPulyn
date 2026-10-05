// Times padrão: modelos da empresa (times sem evento) que podem ser copiados para um evento.
const normalizeTeamName = (name) => String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();

// Retorna só os modelos que ainda não existem no evento (comparando o nome sem
// diferenciar maiúsculas/minúsculas), para poder aplicar mais de uma vez sem duplicar.
function planDefaultTeams({ templates, existingTeams }) {
  const taken = new Set(existingTeams.map(team => normalizeTeamName(team.name)));
  const toCreate = [];
  for (const template of templates) {
    const key = normalizeTeamName(template.name);
    if (!key || taken.has(key)) continue;
    taken.add(key);
    toCreate.push({ name: String(template.name).trim(), color: template.color });
  }
  return toCreate;
}

module.exports = { planDefaultTeams, normalizeTeamName };
