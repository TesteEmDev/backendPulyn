// utils/acessoEventoFamilia.js - A que eventos uma conta de família tem acesso
//
// A conta de família guarda a empresa em que foi criada (o convite antigo, ou uma empresa própria "Fulano's Family"),
// mas o evento que ela acompanha pode ser de OUTRO buffet. As rotas que comparavam a empresa do evento com a da conta
// barravam esses pais (histórico de leituras, lista de jogos e WebSocket do mapa, por exemplo).
//
// Uma família tem acesso a um evento quando:
//  - ele é do buffet da própria conta; ou
//  - ela entrou nele pelo código (familiaEvento); ou
//  - ela já tem criança vinculada nele.
// Qualquer outro caso é tratado como se o evento não existisse, para não revelar eventos de outros buffets.
const { queryOne } = require('../database');

const mesmoId = (a, b) => a != null && b != null && String(a).toLowerCase() === String(b).toLowerCase();

// O evento { eventoId, empresaId } se a conta tem acesso; senão null.
async function eventoDaFamilia(user, eventoId) {
  if (!user || !eventoId) return null;
  const evento = await queryOne(
    'SELECT eventoId, empresaId FROM evento WHERE LOWER(eventoId) = LOWER(@eventoId)',
    { eventoId: String(eventoId) }
  );
  if (!evento) return null;
  if (mesmoId(evento.empresaId, user.empresaId)) return evento;

  const porConvite = await queryOne(
    'SELECT 1 AS x FROM familiaEvento WHERE loginId = @loginId AND LOWER(eventoId) = LOWER(@eventoId)',
    { loginId: user.id, eventoId: evento.eventoId }
  );
  if (porConvite) return evento;

  const comCrianca = await queryOne(
    `SELECT 1 AS x FROM vinculoFamiliar v JOIN crianca c ON c.criancaId = v.criancaId
     WHERE v.loginId = @loginId AND v.status IN ('approved', 'pending') AND LOWER(c.eventoId) = LOWER(@eventoId)`,
    { loginId: user.id, eventoId: evento.eventoId }
  );
  return comCrianca ? evento : null;
}

// Empresa a usar nas consultas de um evento. Para a família é a do evento (se ela tem acesso a ele); para os demais
// perfis, e para a família sem acesso, continua a empresa da conta, e a checagem de "evento é da sua empresa" barra.
async function empresaParaEvento(user, eventoId) {
  if (user?.role !== 'family' || !eventoId) return user?.empresaId;
  const evento = await eventoDaFamilia(user, eventoId);
  return evento ? evento.empresaId : user.empresaId;
}

module.exports = { eventoDaFamilia, empresaParaEvento };
