// Ensaio do Caça ao Tesouro: roda no banco de dev DENTRO de uma transação e a DESFAZ (ROLLBACK).
// Confere o sorteio da equipe que começa (antes a vez ficava vazia e o telão ficava em "Preparando..."), a vez de uma
// equipe por vez e as leituras necessárias para liberar o próximo ponto (metade da equipe, arredondando para baixo).
// Uso: node debug/ensaio-caca-tesouro.js
require('dotenv').config();
const assert = require('node:assert/strict');
const crypto = require('crypto');
const database = require('../database');
const { query, queryOne, allQuery, closeDB } = database;
const withTransaction = database.withTransaction;
database.withTransaction = (trabalho) => trabalho(database);
const treasure = require('../utils/treasure');

class Desfazer extends Error {}

async function main() {
  const evento = await queryOne("SELECT eventoId, empresaId, nome FROM evento WHERE nome = 'Festa do João'");
  assert.ok(evento, 'a Festa do João existe');
  const times = await allQuery('SELECT timeId, nome FROM "time" WHERE eventoId = @e ORDER BY nome', { e: evento.eventoId });
  let criancas = [];
  assert.ok(times.length >= 2, 'precisa de 2+ times');

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
      // Montagem: 4 participantes numa equipe e 2 na outra (leituras necessárias 2 e 1), checkpoints ligados e um jogo de tesouro
      const [t1, t2] = times;
      for (const [i, c] of criancas.entries()) {
        await query('UPDATE crianca SET timeId = @t WHERE criancaId = @c', { t: i < 4 ? t1.timeId : i < 6 ? t2.timeId : null, c: c.criancaId });
      }
      await query("UPDATE pontoVerificacao SET status = 'online', ultimoVisto = CURRENT_TIMESTAMP WHERE eventoId = @e", { e: evento.eventoId });
      const cps = await allQuery("SELECT checkpointId FROM pontoVerificacao WHERE eventoId = @e AND LOWER(COALESCE(proposito,'game')) <> 'reception'", { e: evento.eventoId });
      assert.ok(cps.length >= 2, 'precisa de 2+ checkpoints');
      const brincadeiraId = crypto.randomUUID();
      await query(
        `INSERT INTO brincadeira (brincadeiraId, nome, tipo, empresaId, status, eventoId, checkpoints)
         VALUES (@id, 'Ensaio Tesouro', 'treasure_hunt', @emp, 'active', @e, @cps)`,
        { id: brincadeiraId, emp: evento.empresaId, e: evento.eventoId, cps: JSON.stringify(cps.map((c) => String(c.checkpointId))) }
      );

      // 1) iniciar: a equipe que começa é sorteada e aparece (nada de "Preparando...")
      const inicio = await treasure.startTreasureGame(evento.eventoId, brincadeiraId);
      assert.ok(inicio.turnTeamId, 'a partida começa com uma equipe da vez');
      assert.ok([t1.timeId, t2.timeId].some((id) => String(id).toLowerCase() === String(inicio.turnTeamId).toLowerCase()));
      assert.ok(inicio.turnTeamName && inicio.startingTeamName, 'o nome da equipe sorteada vem junto');
      const status = await treasure.getTreasureEventStatus(evento.eventoId);
      assert.equal(String(status.turnTeamId).toLowerCase(), String(inicio.turnTeamId).toLowerCase());
      assert.equal(status.turnTeamName, inicio.turnTeamName);
      assert.equal(status.startingTeamName, inicio.startingTeamName);
      assert.ok(status.initialWait && status.turnRemainingSeconds > 0, 'os 10 s de preparação contam');
      console.log(`  ✔ iniciar: equipe sorteada "${inicio.turnTeamName}" aparece no status (antes ficava sem nome, "Preparando...")`);

      // 2) uma equipe de cada vez: a outra equipe não lê
      const daVez = String(inicio.turnTeamId).toLowerCase() === String(t1.timeId).toLowerCase() ? t1 : t2;
      const outra = daVez === t1 ? t2 : t1;
      const membros = async (t) => allQuery('SELECT criancaId, timeId FROM crianca WHERE eventoId = @e AND timeId = @t ORDER BY criancaId', { e: evento.eventoId, t: t.timeId });
      const equipeDaVez = await membros(daVez);
      const equipeOutra = await membros(outra);
      const depois = new Date(Date.now() + 15000);   // passados os 10 s de preparação
      const ler = (crianca, quando) => treasure.processTreasureScan({
        eventoId: evento.eventoId, checkpointId: status.targetCheckpointId, crianca, brincadeiraId,
        uid: `UID${crianca.criancaId}`.slice(0, 20), now: quando,
      });

      const barrada = await ler(equipeOutra[0], depois);
      assert.equal(barrada.accepted, false);
      assert.match(barrada.error, /vez da equipe/);
      assert.match(barrada.error, new RegExp(daVez.nome));
      console.log(`  ✔ uma de cada vez: a equipe "${outra.nome}" é barrada ("${barrada.error}")`);

      const cedo = await ler(equipeDaVez[0], new Date());
      assert.equal(cedo.accepted, false);
      assert.match(cedo.error, /Aguarde/);
      console.log('  ✔ a equipe da vez também espera os 10 s de preparação');

      // 3) leituras necessárias = metade da equipe, para baixo
      const necessarias = treasure.leiturasNecessarias(equipeDaVez.length);
      let ultimo;
      for (let i = 0; i < necessarias; i += 1) {
        ultimo = await ler(equipeDaVez[i], depois);
        assert.equal(ultimo.accepted, true, JSON.stringify(ultimo));
        assert.equal(ultimo.total, necessarias, 'o total mostrado é o de leituras necessárias');
        if (i < necessarias - 1) {
          assert.equal(ultimo.teamComplete, false);
          assert.equal(ultimo.scanned, i + 1);
          assert.match(ultimo.message, new RegExp(`${i + 1}/${necessarias}`));
        }
      }
      assert.equal(ultimo.teamComplete, true, 'com as leituras necessárias o próximo ponto é liberado');
      assert.equal(ultimo.roundComplete, true);
      assert.equal(ultimo.scanned, necessarias);
      console.log(`  ✔ equipe de ${equipeDaVez.length}: precisa de ${necessarias} leitura(s) (metade, para baixo); na última o próximo ponto é liberado`);

      const progresso = (await treasure.getTreasureEventStatus(evento.eventoId)).teamsProgress;
      assert.ok(progresso.every((p) => p.total === treasure.leiturasNecessarias(p.members)), 'o progresso mostra o total de leituras necessárias');
      console.log(`  ✔ progresso por equipe: ${progresso.map((p) => `${p.teamName} ${p.scanned}/${p.total} (de ${p.members})`).join(' | ')}`);

      // 4) o recreacionista escolhe quantos checkpoints usar: a partida usa só esse tanto, sorteados entre os do jogo
      await assert.rejects(() => treasure.validarQuantidadeCheckpoints(evento.eventoId, brincadeiraId, 1), (e) => e.statusCode === 400);
      await assert.rejects(() => treasure.validarQuantidadeCheckpoints(evento.eventoId, brincadeiraId, 99), (e) => e.statusCode === 400);
      assert.equal(await treasure.validarQuantidadeCheckpoints(evento.eventoId, brincadeiraId, ''), null);
      assert.equal(await treasure.validarQuantidadeCheckpoints(evento.eventoId, brincadeiraId, '3'), 3);
      const disponiveis = await treasure.contarCheckpointsDisponiveis(evento.eventoId, brincadeiraId);
      assert.equal(disponiveis, cps.length);

      const parcial = await treasure.startTreasureGame(evento.eventoId, brincadeiraId, { quantidade: 2 });
      assert.equal(parcial.usedCheckpointIds.length, 2);
      assert.ok(parcial.usedCheckpointIds.includes(String(parcial.targetCheckpointId)), 'o alvo sai dos checkpoints usados');
      const statusParcial = await treasure.getTreasureEventStatus(evento.eventoId);
      assert.equal(statusParcial.totalCheckpoints, 2);
      assert.deepEqual(statusParcial.checkpointOwnership.map((c) => c.checkpointId).sort(), [...parcial.usedCheckpointIds].sort());
      const fora = cps.map((c) => String(c.checkpointId)).find((id) => !parcial.usedCheckpointIds.includes(id));
      const membrosVez = await allQuery('SELECT criancaId, timeId FROM crianca WHERE eventoId = @e AND timeId = @t ORDER BY criancaId', { e: evento.eventoId, t: statusParcial.turnTeamId });
      const lerFora = await treasure.processTreasureScan({
        eventoId: evento.eventoId, checkpointId: fora, crianca: membrosVez[0], brincadeiraId, uid: 'UIDFORA', now: new Date(Date.now() + 15000),
      });
      assert.equal(lerFora.accepted, false);
      assert.match(lerFora.error, /não é o alvo/);
      console.log(`  ✔ quantidade escolhida: de ${disponiveis} checkpoints a partida usa 2 (${parcial.usedCheckpointIds.join(', ')}); o telão/painel contam 2 e um checkpoint de fora não vale`);

      // sem quantidade: todos, como antes
      const todos = await treasure.startTreasureGame(evento.eventoId, brincadeiraId);
      assert.equal((await treasure.getTreasureEventStatus(evento.eventoId)).totalCheckpoints, disponiveis);
      assert.equal(todos.usedCheckpointIds.length, disponiveis);
      console.log('  ✔ sem escolher a quantidade: usa todos, como antes');

      throw new Desfazer();
    });
  } catch (e) {
    if (!(e instanceof Desfazer)) throw e;
  }
  console.log('ROLLBACK ok (nada foi gravado)');
}

main().then(() => closeDB()).catch((e) => { console.error('❌ ENSAIO FALHOU:', e); process.exit(1); });
