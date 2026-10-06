// Brincadeira paralela "Ache o objeto": regras da lista de objetos e da roleta (sem banco, testáveis).

// Lista inicial: coisas fáceis de achar numa festa/buffet, seguras para uma criança carregar.
const DEFAULT_OBJECTS = Object.freeze([
  'Um balão',
  'Um guardanapo',
  'Um copo de plástico',
  'Um prato de papel',
  'Um canudo',
  'Uma colher de plástico',
  'Um chapéu de festa',
  'Uma almofada',
  'Um brinquedo',
  'Uma lembrancinha',
]);

const MIN_NAME = 2;
const MAX_NAME = 60;
const WHEEL_SIZE = 12;

// Retorna { name } normalizado (espaços colapsados, primeira letra maiúscula) ou { error }.
function normalizeObjectName(input) {
  const name = String(input ?? '').replace(/\s+/g, ' ').trim();
  if (name.length < MIN_NAME) return { error: `Escreva o nome do objeto (mínimo ${MIN_NAME} letras)` };
  if (name.length > MAX_NAME) return { error: `O nome do objeto pode ter no máximo ${MAX_NAME} caracteres` };
  return { name: name.charAt(0).toUpperCase() + name.slice(1) };
}

const sameName = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

function shuffle(items, random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Monta os gomos da roleta: o objeto sorteado mais até (size - 1) outros, embaralhados.
// Retorna { segments: [nomes], winnerIndex }.
function buildWheel(objects, winnerId, size = WHEEL_SIZE, random = Math.random) {
  const winner = objects.find((item) => String(item.id) === String(winnerId));
  if (!winner) throw new Error('Objeto sorteado não está na lista');
  const others = shuffle(objects.filter((item) => item !== winner), random).slice(0, Math.max(0, size - 1));
  const segments = shuffle([winner, ...others], random);
  return { segments: segments.map((item) => item.name), winnerIndex: segments.indexOf(winner) };
}

module.exports = { DEFAULT_OBJECTS, MIN_NAME, MAX_NAME, WHEEL_SIZE, normalizeObjectName, sameName, buildWheel };
