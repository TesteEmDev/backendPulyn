// Ensaio da parada forçada do Caça ao Tesouro: roda no banco de dev DENTRO de uma transação e a DESFAZ (ROLLBACK).
// Confere que, parando o jogo pelo botão, a equipe vencedora recebe os 200 pontos por participante: a que concluiu a
// corrida mais rápido, ou, se ninguém concluiu, a que está na frente (mais checkpoints acesos).
// Uso: node debug/ensaio-parar-tesouro.js
require('dotenv').config();
const assert = require('node:assert/strict');
const crypto = require('crypto');
const database = require('../database');
const { query, queryOne, allQuery, closeDB } = database;
const withTransaction = database.withTransaction;
database.withTransaction = (trabalho) => trabalho(database);
const treasure = require('../utils/treasure');
const { WINNER_BONUS_POINTS } = require('../utils/winnerBonus');

class Desfazer extends Error {}

async function main() {
  const evento = await queryOne("SELECT eventoId, empresaId, nome FROM evento WHERE nome = 'Festa do João'");
  assert.ok(evento, 'a Festa do João existe');
  const times = await allQuery('SELECT timeId, nome FROM "time" WHERE eventoId = @e ORDER BY nome', { e: evento.eventoId });
  let criancas = [];
  assert.ok(times.length >= 2, 'precisa de 2+ times');

  const pontosDe = async (timeId) => allQuery('SELECT criancaId, pontos FROM crianca WHERE eventoId = @e AND timeId = @t ORDER BY criancaId', { e: evento.eventoId, t: timeId });

  try {
    await withTransaction(async () => {
      criancas = await allQuery('SELECT criancaId FROM crianca WHERE eventoId = @e ORDER BY criancaId', { e: evento.eventoId });
      for (let i = criancas.length; i < 6; i += 1) {
        const criancaId = crypto.randomUUID();
        await query(
          `INSERT INTO crianca (criancaId, eventoId, empresaId, timeId, nome, apelido, idade, avatar, pontos, status)
           VALUES (@id, @e, @emp, NULL, @nome, @nome, 8, NULL, 0, 'active')`,
          { id: criancaId, e: evento.eventoId, emp: evento.empresaId, nome: `Ensaio${i}` }
        );
        criancas.push({ criancaId });
      }
      const [t1, t2] = times;
      for (const [i, c] of criancas.entries()) {
        await query('UPDATE crianca SET timeId = @t, pontos = 0 WHERE criancaId = @c', { t: i < 4 ? t1.timeId : i < 6 ? t2.timeId : null, c: c.criancaId });
      }
      await query('UPDATE "time" SET pontos = 0 WHERE eventoId = @e', { e: evento.eventoId });
      await query("UPDATE pontoVerificacao SET status = 'online', ultimoVisto = CURRENT_TIMESTAMP WHERE eventoId = @e", { e: evento.eventoId });
      const cps = await allQuery("SELECT checkpointId FROM pontoVerificacao WHERE eventoId = @e AND LOWER(COALESCE(proposito,'game')) <> 'reception'", { e: evento.eventoId });
      const brincadeiraId = crypto.randomUUID();
      await query(
        `INSERT INTO brincadeira (brincadeiraId, nome, tipo, empresaId, status, eventoId, checkpoints)
         VALUES (@id, 'Ensaio Tesouro', 'treasure_hunt', @emp, 'active', @e, @cps)`,
        { id: brincadeiraId, emp: evento.empresaId, e: evento.eventoId, cps: JSON.stringify(cps.map((c) => String(c.checkpointId))) }
      );
      // Parar o jogo de verdade limpa o domínio dos checkpoints (stopGameForEvento); o ensaio faz o mesmo entre as partidas
      const limparDominio = () => query(
        "UPDATE pontoVerificacao SET territorioDonoTimeId = NULL, territorioTravadoAte = NULL, territorioCooldownAte = NULL WHERE eventoId = @e",
        { e: evento.eventoId }
      );
      const depois = new Date(Date.now() + 15000);
      let uid = 0;
      const ler = (crianca, checkpointId) => treasure.processTreasureScan({
        eventoId: evento.eventoId, checkpointId, crianca, brincadeiraId, uid: `UID${++uid}`.padEnd(8, '0'), now: depois,
      });
      // a equipe da vez lê os checkpoints da partida: `rodadas` etapas (cada uma com as leituras necessárias)
      const jogarRodadas = async (rodadas) => {
        for (let r = 0; r < rodadas; r += 1) {
          const status = await treasure.getTreasureEventStatus(evento.eventoId);
          const membros = await allQuery('SELECT criancaId, timeId FROM crianca WHERE eventoId = @e AND timeId = @t ORDER BY criancaId', { e: evento.eventoId, t: status.turnTeamId });
          const necessarias = treasure.leiturasNecessarias(membros.length);
          for (let i = 0; i < necessarias; i += 1) {
            const resultado = await ler(membros[i], status.targetCheckpointId);
            assert.equal(resultado.accepted, true, JSON.stringify(resultado));
          }
        }
      };

      // 1) uma equipe CONCLUI a corrida; o jogo é parado pelo botão: ela leva 200 por participante
      await treasure.startTreasureGame(evento.eventoId, brincadeiraId, { quantidade: 2 });
      const vez = (await treasure.getTreasureEventStatus(evento.eventoId)).turnTeamId;
      await jogarRodadas(2);   // 2 checkpoints usados: a equipe acende os dois e conclui
      const apos = await treasure.getTreasureEventStatus(evento.eventoId);
      const concluiu = apos.teamRaceTimes.find((t) => String(t.teamId).toLowerCase() === String(vez).toLowerCase());
      assert.equal(concluiu.completed, true, 'a equipe da vez concluiu a corrida');
      const premio = await treasure.awardTreasureBonusOnStop(evento.eventoId);
      assert.equal(premio.awarded, true, JSON.stringify(premio));
      assert.equal(String(premio.teamId).toLowerCase(), String(vez).toLowerCase());
      assert.equal(premio.pointsPerMember, WINNER_BONUS_POINTS);
      const membrosVencedora = await pontosDe(vez);
      assert.ok(membrosVencedora.every((m) => Number(m.pontos) === WINNER_BONUS_POINTS), 'cada participante da vencedora recebeu 200');
      const outra = times.find((t) => String(t.timeId).toLowerCase() !== String(vez).toLowerCase());
      assert.ok((await pontosDe(outra.timeId)).every((m) => Number(m.pontos) === 0), 'a outra equipe não recebeu');
      const timePontos = await queryOne('SELECT pontos FROM "time" WHERE timeId = @t', { t: vez });
      assert.equal(Number(timePontos.pontos), WINNER_BONUS_POINTS * membrosVencedora.length, 'os pontos da equipe são a soma dos membros');
      assert.equal((await treasure.awardTreasureBonusOnStop(evento.eventoId)).awarded, false, 'não paga duas vezes');
      console.log(`  ✔ equipe concluiu e o jogo foi parado: ${membrosVencedora.length} participantes receberam ${WINNER_BONUS_POINTS} cada (equipe: ${timePontos.pontos}); não paga duas vezes`);

      await limparDominio();

      // 2) NINGUÉM concluiu, mas uma equipe acendeu um checkpoint: parado pelo botão, ela (a que está na frente) leva o bônus
      await query('UPDATE crianca SET pontos = 0 WHERE eventoId = @e', { e: evento.eventoId });
      await query('UPDATE "time" SET pontos = 0 WHERE eventoId = @e', { e: evento.eventoId });
      await treasure.startTreasureGame(evento.eventoId, brincadeiraId, { quantidade: 2 });
      const vez2 = (await treasure.getTreasureEventStatus(evento.eventoId)).turnTeamId;
      await jogarRodadas(1);   // só um dos dois checkpoints
      const parcial = await treasure.getTreasureEventStatus(evento.eventoId);
      assert.ok(parcial.teamRaceTimes.every((t) => !t.completed), 'ninguém concluiu');
      const premio2 = await treasure.awardTreasureBonusOnStop(evento.eventoId);
      assert.equal(premio2.awarded, true, JSON.stringify(premio2));
      assert.equal(String(premio2.teamId).toLowerCase(), String(vez2).toLowerCase());
      assert.ok((await pontosDe(vez2)).every((m) => Number(m.pontos) === WINNER_BONUS_POINTS));
      console.log('  ✔ ninguém concluiu: parado pelo botão, a equipe que está na frente (1 de 2 checkpoints acesos) recebe os 200');

      await limparDominio();

      // 3) NINGUÉM avançou: ninguém recebe
      await query('UPDATE crianca SET pontos = 0 WHERE eventoId = @e', { e: evento.eventoId });
      await query('UPDATE "time" SET pontos = 0 WHERE eventoId = @e', { e: evento.eventoId });
      await treasure.startTreasureGame(evento.eventoId, brincadeiraId, { quantidade: 2 });
      assert.equal(await treasure.awardTreasureBonusOnStop(evento.eventoId), null);
      const todos = await allQuery('SELECT pontos FROM crianca WHERE eventoId = @e', { e: evento.eventoId });
      assert.ok(todos.every((c) => Number(c.pontos) === 0));
      console.log('  ✔ ninguém leu nada: parado pelo botão, ninguém recebe pontos');

      throw new Desfazer();
    });
  } catch (e) {
    if (!(e instanceof Desfazer)) throw e;
  }
  console.log('ROLLBACK ok (nada foi gravado)');
}

main().then(() => closeDB()).catch((e) => { console.error('❌ ENSAIO FALHOU:', e); process.exit(1); });
