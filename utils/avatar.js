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

// Avatar montado pela criança no cadastro (FrontEnd/src/avatar/builder/code.ts): "pulyn1-" + 15 letras/dígitos (posição de
// cada peça, cor e opções). O desenho é refeito a partir do código; aqui só se confere o formato (a coluna guarda 64 caracteres).
const CODIGO_AVATAR_MONTADO = /^pulyn1-[A-Za-z0-9]{15}$/;

function isAvatarMontado(value) {
  return typeof value === 'string' && CODIGO_AVATAR_MONTADO.test(value);
}

// Vale para o cadastro: um dos avatares prontos ou um avatar montado
function isAvatarValido(value) {
  return isAdventurerAvatarId(value) || isAvatarMontado(value);
}

function getAvatarForCreate(value) {
  if (value === undefined || value === null || value === '') return DEFAULT_AVATAR_ID;
  return isAvatarValido(value) ? value : null;
}

module.exports = {
  ADVENTURER_AVATAR_IDS,
  DEFAULT_AVATAR_ID,
  isAdventurerAvatarId,
  isAvatarMontado,
  isAvatarValido,
  getAvatarForCreate,
};
