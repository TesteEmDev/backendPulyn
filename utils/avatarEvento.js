// utils/avatarEvento.js - Avatares sem repetição entre os participantes do mesmo evento
//
// Cada participante recebe um avatar diferente dos outros do evento. O padrão (nenhum avatar escolhido) vira um avatar
// livre sorteado, e quem pede um que outro participante já usa recebe um aviso. Os avatares são 20: só quando todos
// estão em uso a repetição é permitida (o menos usado é o que entra).
const { ADVENTURER_AVATAR_IDS, isAvatarMontado } = require('./avatar');

// Avatares montados pela criança (código pulyn1-...) são combinações livres: não entram na regra de "sem repetição",
// que vale só para os 20 avatares prontos.
// pedido: o avatar que a pessoa escolheu (se estiver em uso, é conflito) | preferido: o avatar que ela já tinha (se estiver
// em uso, entra outro, sem erro) | emUso: os avatares dos outros participantes do evento (repetidos contam como usos).
function escolherAvatar({ pedido = null, preferido = null, emUso = [], ids = ADVENTURER_AVATAR_IDS, aleatorio = Math.random, gerarNovo = null }) {
  if (pedido && isAvatarMontado(pedido)) return { avatar: pedido };
  if (!pedido && preferido && isAvatarMontado(preferido)) return { avatar: preferido };

  const usos = new Map();
  for (const avatar of emUso) usos.set(avatar, (usos.get(avatar) || 0) + 1);
  const livres = ids.filter((id) => !usos.has(id));

  // Quem não escolheu nenhum e não tem um antigo que possa manter ganha um personagem novo, não um dos 20 antigos.
  if (!pedido && gerarNovo) {
    const mantem = preferido && ids.includes(preferido) && (livres.length === 0 || livres.includes(preferido));
    if (!mantem) return { avatar: gerarNovo() };
  }

  if (pedido) {
    if (livres.length === 0 || livres.includes(pedido)) return { avatar: pedido };
    return { conflito: true, livres };
  }
  if (preferido && ids.includes(preferido) && (livres.length === 0 || livres.includes(preferido))) return { avatar: preferido };
  if (livres.length) return { avatar: livres[Math.floor(aleatorio() * livres.length)] };

  // Todos em uso: entra o menos usado (o primeiro da lista em caso de empate)
  const menosUsado = ids.reduce((melhor, id) => ((usos.get(id) || 0) < (usos.get(melhor) || 0) ? id : melhor), ids[0]);
  return { avatar: menosUsado };
}

// Avatares dos participantes do evento (menos o de `excetoCriancaId`, para quem está trocando o próprio avatar).
// `db` é o banco ou a transação (qualquer objeto com allQuery).
async function avataresEmUso(db, eventoId, excetoCriancaId = null) {
  // Dois SQLs em vez de "(@exceto IS NULL OR ...)": o PostgreSQL não deduz o tipo de um parâmetro que só aparece num IS NULL
  const linhas = excetoCriancaId
    ? await db.allQuery(
      'SELECT avatar FROM crianca WHERE eventoId = @eventoId AND avatar IS NOT NULL AND criancaId <> @exceto',
      { eventoId, exceto: excetoCriancaId }
    )
    : await db.allQuery(
      'SELECT avatar FROM crianca WHERE eventoId = @eventoId AND avatar IS NOT NULL',
      { eventoId }
    );
  return linhas.map((linha) => linha.avatar);
}

const MENSAGEM_AVATAR_EM_USO = 'Este avatar já foi escolhido por outro participante do evento. Escolha outro.';

module.exports = { escolherAvatar, avataresEmUso, MENSAGEM_AVATAR_EM_USO };
