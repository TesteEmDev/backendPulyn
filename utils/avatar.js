const ADVENTURER_AVATAR_IDS = Object.freeze([
  'adventurer-1787066874693', 'adventurer-1787066893641',
  'adventurer-1787066897643', 'adventurer-1787066901609',
  'adventurer-1787066904754', 'adventurer-1787066907832',
  'adventurer-1787066911577', 'adventurer-1787066914937',
  'adventurer-1787066918306', 'adventurer-1787066922497',
  'adventurer-1787066926169', 'adventurer-1787066929218',
  'adventurer-1787066934106', 'adventurer-1787066937610',
  'adventurer-1787066942696', 'adventurer-1787066946714',
  'adventurer-1787066949874', 'adventurer-1787066955258',
  'adventurer-1787066958801', 'adventurer-1787066964514',
]);

const ADVENTURER_AVATAR_SET = new Set(ADVENTURER_AVATAR_IDS);
const DEFAULT_AVATAR_ID = ADVENTURER_AVATAR_IDS[0];

function isAdventurerAvatarId(value) {
  return typeof value === 'string' && ADVENTURER_AVATAR_SET.has(value);
}

// Avatar montado pela criança no Kiosk/recepção (gerador: pacote @pulyn/avatar): "pulyn1-" + 15 letras/dígitos (posição de cada
// peça, cor e detalhes). Códigos novos levam mais 4 (óculos, colar, brinco e cor dos acessórios) e quem escolheu uma cor de fundo
// fora da paleta leva mais 6 dígitos hexadecimais no fim: 22, 26, 28 ou 32 caracteres. Os antigos, sem os acessórios, continuam valendo.
// O desenho é refeito a partir do código; aqui só se confere o formato (a coluna guarda 64 caracteres).
const AVATAR_MONTADO_REGEX = /^pulyn1-[A-Za-z0-9]{15}(?:[A-Za-z0-9]{4})?(?:[0-9a-f]{6})?$/;

function isAvatarMontado(value) {
  return typeof value === 'string' && AVATAR_MONTADO_REGEX.test(value);
}

// Quantas opções cada campo do código tem hoje (na ordem do código: ver src/avatar/builder/code.ts do front).
// As listas do front só crescem no fim, então um código gerado aqui continua válido mesmo quando surgirem peças novas.
const TAMANHOS_AVATAR_MONTADO = Object.freeze([4, 6, 17, 10, 7, 6, 7, 2, 12, 8, 13, 8, 11]);
const FLAGS_AVATAR_MONTADO = 64; // 6 flags (bits)

// Personagem montado sorteado: o avatar de quem ainda não escolheu o seu.
function gerarAvatarMontado(aleatorio = Math.random) {
  const pos = TAMANHOS_AVATAR_MONTADO.map((tamanho) => Math.floor(aleatorio() * tamanho).toString(36));
  // cloth ≠ "sem roupa" (posição 0) e acessório quase sempre vazio, para o sorteio não sair estranho
  if (pos[8] === '0') pos[8] = '1';
  if (aleatorio() < 0.7) pos[10] = '0';
  const flags = (Math.floor(aleatorio() * FLAGS_AVATAR_MONTADO) | 0b000100 | 0b100000) & ~0b000001; // bochechas e cabeça grande ligadas, sem óculos
  return `pulyn1-${pos.join('')}${flags.toString(36).padStart(2, '0')}`;
}

// Avatar aceito na API: um dos 20 prontos ou um avatar montado.
function isAvatarValido(value) {
  return isAdventurerAvatarId(value) || isAvatarMontado(value);
}

function getAvatarForCreate(value) {
  if (value === undefined || value === null || value === '') return gerarAvatarMontado();
  return isAvatarValido(value) ? value : null;
}

module.exports = {
  ADVENTURER_AVATAR_IDS,
  DEFAULT_AVATAR_ID,
  isAdventurerAvatarId,
  isAvatarMontado,
  isAvatarValido,
  gerarAvatarMontado,
  getAvatarForCreate,
};
