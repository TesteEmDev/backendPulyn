const { v4: uuidv4 } = require('uuid');
const { query, queryOne, allQuery } = require('../database');

// Caça ao Tesouro e Caça ao Monstro não pontuam durante a partida: ao final,
// cada membro da equipe vencedora recebe este bônus.
const WINNER_BONUS_POINTS = 200;

/**
 * Paga o bônus de vitória a todos os membros da equipe vencedora de uma partida
 * e recalcula os pontos da equipe (soma dos pontos dos membros, como no resto do
 * sistema). É idempotente por (partida, jogo): chamar de novo não paga duas vezes.
 *
 * Deve rodar na mesma transação que encerrou a partida quando houver uma.
 */
async function awardWinnerBonus({ eventoId, partidaId, gameType, teamId, points = WINNER_BONUS_POINTS }) {
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

  if (members.length > 0) {
    await query(
      `UPDATE crianca SET pontos = COALESCE(pontos, 0) + @points
       WHERE LOWER(eventoId) = LOWER(@eventoId) AND LOWER(timeId) = LOWER(@teamId)`,
      { points, eventoId, teamId: team.timeId }
    );
    await query(
      `UPDATE "time" SET pontos = (SELECT ISNULL(SUM(pontos), 0) FROM "crianca" WHERE timeId = @teamId)
       WHERE timeId = @teamId`,
      { teamId: team.timeId }
    );
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
      },
    });
  }

  return {
    awarded: true,
    teamId: team.timeId,
    teamName: team.nome,
    pointsPerMember: points,
    membersAwarded: members.length,
  };
}

module.exports = { WINNER_BONUS_POINTS, awardWinnerBonus };
