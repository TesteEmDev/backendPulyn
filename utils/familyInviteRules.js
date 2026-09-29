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

  // Sem criança (convite genérico e nenhuma criança informada) não existe vínculo para a
  // recepção aprovar; deixar a conta 'pending' a travaria para sempre, porque o login de
  // conta pendente é bloqueado e o vínculo por QR Code exige estar logado. A conta nasce
  // ativa e não enxerga nenhuma criança até vincular uma.
  const childless = !linkedChildId && list.length === 0;
  return { loginStatus: childless ? 'active' : 'pending', childless };
}

/**
 * Status/mensagem que a rota devolve. Se o e-mail já tinha conta, vale o status dela
 * (uma conta que ainda aguarda aprovação continua aguardando).
 */
function describeRegistrationResult({ childless, plannedLoginStatus, existingLoginStatus }) {
  const accountStatus = existingLoginStatus || plannedLoginStatus;
  if (childless && accountStatus === 'active') {
    return {
      status: 'active',
      message: 'Conta criada! Entre no app e vincule seu filho pelo QR Code entregue pela recepção.',
    };
  }
  return {
    status: 'pending',
    message: 'Cadastro realizado. Aguarde a aprovação da recepção.',
  };
}

module.exports = { MAX_CHILDREN, planInviteRegistration, describeRegistrationResult };
