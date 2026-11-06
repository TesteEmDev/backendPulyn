const { v4: uuidv4 } = require('uuid');
const { query, queryOne, allQuery } = require('../database');

// Caça ao Tesouro e Caça ao Monstro não pontuam durante a partida: ao final,
// cada membro da equipe vencedora recebe este bônus.
const WINNER_BONUS_POINTS = 200;
// Equipes que não venceram também ganham, por membro: a melhor colocada entre elas leva este valor e cada
// posição seguinte leva a metade da anterior (100, 50, 25, ...). Chega a zero, não paga.
const LOSER_BONUS_POINTS = 100;

// Pontos por membro da equipe perdedora na colocação `colocacao` (0 = a melhor das que não venceram).
function pontosDoPerdedor(colocacao, base = LOSER_BONUS_POINTS) {
  return Math.floor(base / (2 ** Number(colocacao)));
}

// Posição (0 = melhor) de cada item de uma lista já ordenada. Itens seguidos com a mesma chave (definida) estão
// empatados e dividem a posição; o próximo item não empatado ocupa a posição real (chaves a, a, b -> 0, 0, 2).
function posicoesComEmpate(chaves) {
  const posicoes = [];
  chaves.forEach((chave, indice) => {
    const empatado = indice > 0 && chave !== undefined && chave === chaves[indice - 1];
    posicoes.push(empatado ? posicoes[indice - 1] : indice);
  });
  return posicoes;
}

// Quem lidera quando o jogo é parado à força e ninguém terminou: o maior valor (> 0), sem empate no topo.
// itens: [{ teamId, valor }]. Devolve o teamId do líder ou null (ninguém avançou ou há empate).
function escolherLider(itens) {
  const ordenados = itens.filter((item) => Number(item.valor) > 0).sort((a, b) => Number(b.valor) - Number(a.valor));
  if (ordenados.length === 0) return null;
  if (ordenados.length > 1 && Number(ordenados[1].valor) === Number(ordenados[0].valor)) return null;
  return ordenados[0].teamId;
}

// Soma `points` a cada membro da equipe e recalcula os pontos da equipe (soma dos membros).
async function somarPontosDaEquipe(eventoId, teamId, points) {
  await query(
    `UPDATE crianca SET pontos = COALESCE(pontos, 0) + @points
     WHERE LOWER(eventoId) = LOWER(@eventoId) AND LOWER(timeId) = LOWER(@teamId)`,
    { points, eventoId, teamId }
  );
  await query(
    `UPDATE "time" SET pontos = (SELECT ISNULL(SUM(pontos), 0) FROM "crianca" WHERE timeId = @teamId)
     WHERE timeId = @teamId`,
    { teamId }
  );
}

/**
 * Paga o bônus de vitória a todos os membros da equipe vencedora de uma partida
 * e recalcula os pontos da equipe (soma dos pontos dos membros, como no resto do
 * sistema). É idempotente por (partida, jogo): chamar de novo não paga duas vezes.
 *
 * `perdedores`: as outras equipes, da melhor para a pior colocada, como ids ou { teamId, chave }. Equipes seguidas
 * com a mesma `chave` estão empatadas e recebem a mesma pontuação; a próxima não empatada ocupa a posição real
 * (duas empatadas em 1º entre as perdedoras: 100 e 100, e a seguinte leva 25). Cada uma recebe
 * pontosDoPerdedor(colocacao) por membro. Entram na mesma trava de idempotência da vencedora.
 *
 * Deve rodar na mesma transação que encerrou a partida quando houver uma.
 */
async function awardWinnerBonus({ eventoId, partidaId, gameType, teamId, points = WINNER_BONUS_POINTS, perdedores = [] }) {
  if (!eventoId || !partidaId || !gameType || !teamId) return { awarded: false, reason: 'missing-data' };

  const already = await queryOne(
    'SELECT id FROM bonusVencedorJogo WHERE LOWER(partidaId) = LOWER(@partidaId) AND tipoJogo = @gameType',
    { partidaId, gameType }
  );
  if (already) return { awarded: false, reason: 'already-awarded' };

  const team = await queryOne(
    'SELECT timeId, nome, cor, empresaId FROM "time" WHERE LOWER(timeId) = LOWER(@teamId) AND LOWER(eventoId) = LOWER(@eventoId)',
    { teamId, eventoId }
  );
  if (!team) return { awarded: false, reason: 'team-not-found' };

  const members = await allQuery(
    'SELECT criancaId FROM "crianca" WHERE LOWER(eventoId) = LOWER(@eventoId) AND LOWER(timeId) = LOWER(@teamId)',
    { eventoId, teamId: team.timeId }
  );

  await query(
    `INSERT INTO bonusVencedorJogo
       (id, empresaId, eventoId, partidaId, tipoJogo, timeId, pontosPorMembro, membrosPremiados)
     VALUES (@id, @empresaId, @eventoId, @partidaId, @gameType, @teamId, @points, @members)`,
    {
      id: uuidv4(),
      empresaId: team.empresaId || null,
      eventoId,
      partidaId,
      gameType,
      teamId: team.timeId,
      points,
      members: members.length,
    }
  );

  if (members.length > 0) await somarPontosDaEquipe(eventoId, team.timeId, points);

  const consolacao = [];
  const vistos = new Set([String(team.timeId).toLowerCase()]);
  const posicoes = posicoesComEmpate(perdedores.map((item) => (typeof item === 'object' && item !== null ? item.chave : undefined)));
  for (const [indice, item] of perdedores.entries()) {
    const perdedorId = typeof item === 'object' && item !== null ? item.teamId : item;
    const idMinusculo = String(perdedorId || '').toLowerCase();
    if (!idMinusculo || vistos.has(idMinusculo)) continue;
    vistos.add(idMinusculo);
    const perdedora = await queryOne(
      'SELECT timeId, nome, cor FROM "time" WHERE LOWER(timeId) = LOWER(@teamId) AND LOWER(eventoId) = LOWER(@eventoId)',
      { teamId: perdedorId, eventoId }
    );
    if (!perdedora) continue;
    const colocacao = posicoes[indice];
    const pontosPorMembro = pontosDoPerdedor(colocacao);
    if (pontosPorMembro <= 0) continue;
    const membrosDaPerdedora = await allQuery(
      'SELECT criancaId FROM "crianca" WHERE LOWER(eventoId) = LOWER(@eventoId) AND LOWER(timeId) = LOWER(@teamId)',
      { eventoId, teamId: perdedora.timeId }
    );
    if (membrosDaPerdedora.length > 0) await somarPontosDaEquipe(eventoId, perdedora.timeId, pontosPorMembro);
    consolacao.push({
      teamId: perdedora.timeId,
      teamName: perdedora.nome,
      teamColor: perdedora.cor || '',
      pointsPerMember: pontosPorMembro,
      membersAwarded: membrosDaPerdedora.length,
    });
  }

  if (typeof global.broadcastToEvent === 'function') {
    global.broadcastToEvent(eventoId, {
      type: 'GAME_WINNER_BONUS',
      payload: {
        eventoId,
        gameType,
        partidaId,
        teamId: team.timeId,
        teamName: team.nome,
        teamColor: team.cor || '',
        pointsPerMember: points,
        membersAwarded: members.length,
        losers: consolacao,
      },
    });
  }

  return {
    awarded: true,
    teamId: team.timeId,
    teamName: team.nome,
    pointsPerMember: points,
    membersAwarded: members.length,
    losers: consolacao,
  };
}

module.exports = { WINNER_BONUS_POINTS, LOSER_BONUS_POINTS, pontosDoPerdedor, posicoesComEmpate, awardWinnerBonus, escolherLider };
