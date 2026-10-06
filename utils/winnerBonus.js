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
    'SELECT id FROM game_winner_bonuses WHERE LOWER(partida_id) = LOWER(@partidaId) AND game_type = @gameType',
    { partidaId, gameType }
  );
  if (already) return { awarded: false, reason: 'already-awarded' };

  const team = await queryOne(
    'SELECT id, name, color, empresa_id FROM "time" WHERE LOWER(id) = LOWER(@teamId) AND LOWER(evento_id) = LOWER(@eventoId)',
    { teamId, eventoId }
  );
  if (!team) return { awarded: false, reason: 'team-not-found' };

  const members = await allQuery(
    'SELECT id FROM "crianca" WHERE LOWER(evento_id) = LOWER(@eventoId) AND LOWER(time_id) = LOWER(@teamId)',
    { eventoId, teamId: team.id }
  );

  await query(
    `INSERT INTO game_winner_bonuses
       (id, empresa_id, evento_id, partida_id, game_type, time_id, points_per_member, members_awarded)
     VALUES (@id, @empresaId, @eventoId, @partidaId, @gameType, @teamId, @points, @members)`,
    {
      id: uuidv4(),
      empresaId: team.empresa_id || null,
      eventoId,
      partidaId,
      gameType,
      teamId: team.id,
      points,
      members: members.length,
    }
  );

  if (members.length > 0) {
    await query(
      `UPDATE criancas SET scores = COALESCE(scores, 0) + @points
       WHERE LOWER(evento_id) = LOWER(@eventoId) AND LOWER(time_id) = LOWER(@teamId)`,
      { points, eventoId, teamId: team.id }
    );
    await query(
      `UPDATE times SET points = (SELECT ISNULL(SUM(scores), 0) FROM "crianca" WHERE time_id = @teamId)
       WHERE id = @teamId`,
      { teamId: team.id }
    );
  }

  if (typeof global.broadcastToEvent === 'function') {
    global.broadcastToEvent(eventoId, {
      type: 'GAME_WINNER_BONUS',
      payload: {
        eventoId,
        gameType,
        partidaId,
        teamId: team.id,
        teamName: team.name,
        teamColor: team.color || '',
        pointsPerMember: points,
        membersAwarded: members.length,
      },
    });
  }

  return {
    awarded: true,
    teamId: team.id,
    teamName: team.name,
    pointsPerMember: points,
    membersAwarded: members.length,
  };
}

module.exports = { WINNER_BONUS_POINTS, awardWinnerBonus };
