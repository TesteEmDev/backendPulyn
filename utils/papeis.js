// utils/papeis.js - Papéis de uma conta (um login pode atuar em mais de uma área da equipe)
//
// O token continua levando UM papel (claim role): é a área em que a pessoa está agora. Assim, as
// verificações de requireRole e de role do backend não mudam. Para trocar de área, a conta pede um
// novo token com outro papel (POST /api/auth/papel), e o servidor confere se ele está na lista da conta.

const PAPEIS_VALIDOS = new Set(['admin', 'reception', 'game_master', 'display', 'family', 'master', 'kiosk', 'score_kiosk']);

// Só a equipe pode acumular papéis. Telão, autoatendimento, família e master são contas próprias.
const PAPEIS_ACUMULAVEIS = new Set(['admin', 'reception', 'game_master']);

// O admin do buffet tem acesso a todas as áreas do buffet (recepção, recreacionista, telão e totens), sem precisar
// que cada uma seja liberada na conta. Família e master não entram: são de fora da equipe do buffet.
const PAPEIS_DO_ADMIN = ['admin', 'reception', 'game_master', 'display', 'kiosk', 'score_kiosk'];

// Lista de papéis que a conta pode usar: o principal e os adicionais válidos, sem repetição.
function papeisDaConta(login) {
  if (login.perfil === 'admin') return [...PAPEIS_DO_ADMIN];
  const extras = String(login.perfisExtras || '')
    .split(',')
    .map((p) => p.trim())
    .filter((p) => PAPEIS_ACUMULAVEIS.has(p));
  return [...new Set([login.perfil, ...extras])].filter((p) => PAPEIS_VALIDOS.has(p));
}

// Valor que vai para a coluna perfisExtras (papéis acumuláveis, exceto o principal).
function perfisExtrasParaSalvar(perfil, papeis) {
  const extras = (Array.isArray(papeis) ? papeis : [])
    .map((p) => String(p).trim())
    .filter((p) => PAPEIS_ACUMULAVEIS.has(p) && p !== perfil);
  return [...new Set(extras)].join(',') || null;
}

module.exports = { PAPEIS_VALIDOS, PAPEIS_ACUMULAVEIS, PAPEIS_DO_ADMIN, papeisDaConta, perfisExtrasParaSalvar };
