// utils/liveCheckpoints.js - Troca dos checkpoints de uma brincadeira durante o jogo
//
// brincadeiras.checkpoints é um JSON com a lista do jogo: ids (texto) ou objetos { id, ... }
// (no Caça ao Monstro cada item guarda o bloqueio em segundos e o marcador de checkpoint especial).
const DEFAULT_MONSTER_COOLDOWN = 15;

const idOf = (item) => String(item && typeof item === 'object' ? item.id : item ?? '').trim();
const sameId = (a, b) => idOf(a).toLowerCase() === idOf(b).toLowerCase();

function parseConfigItems(raw) {
  if (!raw) return [];
  let items = raw;
  if (typeof items === 'string') {
    try { items = JSON.parse(items); } catch { return []; }
  }
  return Array.isArray(items) ? items.filter((item) => idOf(item)) : [];
}

// Monta a nova lista a partir dos ids pedidos, mantendo a configuração de quem já estava (bloqueio,
// especial) e criando a de quem entra. `specialId` (opcional, só Monstro) define o checkpoint especial.
function buildCheckpointConfigs({ type, requestedIds, existingItems = [], specialId = null }) {
  const seen = new Set();
  const ids = [];
  for (const raw of requestedIds) {
    const id = idOf(raw);
    const key = id.toLowerCase();
    if (!id || seen.has(key)) continue;
    seen.add(key);
    ids.push(id);
  }

  const usesObjects = type === 'monster_hunt' || existingItems.some((item) => item && typeof item === 'object');
  const items = ids.map((id) => {
    const existing = existingItems.find((item) => sameId(item, id));
    if (existing !== undefined) {
      return type === 'monster_hunt' && typeof existing !== 'object' ? { id, cooldown: DEFAULT_MONSTER_COOLDOWN } : existing;
    }
    if (type === 'monster_hunt') return { id, cooldown: DEFAULT_MONSTER_COOLDOWN };
    return usesObjects ? { id } : id;
  });

  if (type === 'monster_hunt' && specialId) {
    return items.map((item) => {
      const { special, ...rest } = item;
      return sameId(item, specialId) ? { ...rest, special: true } : rest;
    });
  }
  return items;
}

module.exports = { parseConfigItems, buildCheckpointConfigs, idOf, sameId, DEFAULT_MONSTER_COOLDOWN };
