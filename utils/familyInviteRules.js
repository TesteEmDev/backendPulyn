/**
 * Regras do cadastro pelo convite familiar, isoladas da rota para poderem ser
 * testadas sem banco de dados.
 *
 * Antes o responsável era obrigado a cadastrar de 1 a 10 crianças quando o convite não
 * vinha vinculado a uma criança. Agora ele pode se cadastrar SEM crianças: depois de
 * entrar no app, vincula o filho lendo o QR Code que a recepção entrega.
 */

const MAX_CHILDREN = 10;

/**
 * @param {{ linkedChildId?: string|null, children?: Array<{name?: string}> }} input
 * @returns {{ error: string } | { loginStatus: 'active'|'pending', childless: boolean }}
 */
function planInviteRegistration({ linkedChildId, children }) {
  const list = Array.isArray(children) ? children : [];

  if (!linkedChildId) {
    if (list.length > MAX_CHILDREN) {
      return { error: `Informe no máximo ${MAX_CHILDREN} crianças` };
    }
    if (list.some((item) => !item?.name || !String(item.name).trim())) {
      return { error: 'Informe o nome de todas as crianças' };
    }
  }

  // A recepção não aprova mais vínculos: a conta nasce ativa, com ou sem crianças.
  const childless = !linkedChildId && list.length === 0;
  return { loginStatus: 'active', childless };
}

/**
 * Status/mensagem que a rota devolve. Se o e-mail já tinha conta pendente (fluxo antigo),
 * ela continua valendo como pendente.
 */
function describeRegistrationResult({ childless, plannedLoginStatus, existingLoginStatus }) {
  const accountStatus = existingLoginStatus || plannedLoginStatus;
  if (accountStatus !== 'active') {
    return {
      status: 'pending',
      message: 'Cadastro realizado. Aguarde a liberação da recepção.',
    };
  }
  return {
    status: 'active',
    message: childless
      ? 'Conta criada! Entre no app e vincule seu filho pelo QR Code entregue pela recepção.'
      : 'Conta criada! Entre no app para acompanhar seu filho.',
  };
}

module.exports = { MAX_CHILDREN, planInviteRegistration, describeRegistrationResult };
