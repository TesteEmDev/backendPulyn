// Ensaio do "Sem jogos": roda no banco de dev DENTRO de uma transação e a DESFAZ (ROLLBACK).
// Uso: node debug/ensaio-sem-jogos.js
require('dotenv').config();
const assert = require('node:assert/strict');
const database = require('../database');
const { query, queryOne, closeDB } = database;
const withTransaction = database.withTransaction;
database.withTransaction = (trabalho) => trabalho(database);
const { getGameState, saveGameState } = require('../utils/gameState');
const router = require('../routes/gameSelection');

class Desfazer extends Error {}

function chamar(usuario, body) {
  const camada = router.stack.find((l) => l.route && l.route.path === '/clear-game-selection' && l.route.methods.post);
  assert.ok(camada, 'rota existe');
  const handler = camada.route.stack[camada.route.stack.length - 1].handle;
  return new Promise((resolve, reject) => {
    const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(corpo) { resolve({ status: this.statusCode, corpo }); return this; } };
    Promise.resolve(handler({ user: usuario, body, params: {}, query: {}, headers: {} }, res)).catch(reject);
  });
}

async function main() {
  const evento = await queryOne("SELECT eventoId, empresaId, status FROM evento WHERE nome = 'Festa do João'");
  assert.ok(evento, 'a Festa do João existe');
  const admin = { id: 'x', role: 'admin', empresaId: evento.empresaId };
  const jogo = await queryOne('SELECT brincadeiraId, nome FROM brincadeira WHERE LOWER(empresaId) = LOWER(@e) LIMIT 1', { e: evento.empresaId });
  assert.ok(jogo, 'há um jogo cadastrado');
  const avisos = [];
  global.broadcastToEvent = (id, msg) => avisos.push({ id, msg });

  try {
    await withTransaction(async () => {
      const selecionar = (modo) => saveGameState({
        eventoId: evento.eventoId, empresaId: evento.empresaId, mode: modo, gameType: 'treasure_hunt',
        gameId: jogo.brincadeiraId, gameName: jogo.nome, startedAt: modo === 'game' ? new Date().toISOString() : null,
      });

      // 1) jogo escolhido e não iniciado -> "Sem jogos" limpa a escolha e avisa o telão
      await selecionar('idle');
      assert.equal((await getGameState(evento.eventoId)).tipoJogo, 'treasure_hunt');
      const ok = await chamar(admin, { eventoId: evento.eventoId });
      assert.equal(ok.status, 200, JSON.stringify(ok.corpo));
      const depois = await getGameState(evento.eventoId);
      assert.equal(depois.tipoJogo, 'none');
      assert.equal(depois.brincadeiraId, null);
      assert.equal(depois.nomeBrincadeira, null);
      assert.equal(depois.modo, 'idle');
      assert.equal(avisos.length, 1);
      assert.equal(avisos[0].msg.type, 'GAME_SELECTION_CLEARED');
      assert.equal(String(avisos[0].msg.payload.eventoId).toLowerCase(), String(evento.eventoId).toLowerCase());
      console.log('  ✔ jogo escolhido: "Sem jogos" volta ao estado sem seleção e avisa o telão (GAME_SELECTION_CLEARED)');

      // 2) já sem seleção: continua valendo (idempotente)
      assert.equal((await chamar(admin, { eventoId: evento.eventoId })).status, 200);
      console.log('  ✔ sem nenhuma seleção: repetir não dá erro');

      // 3) jogo rodando: recusa e não mexe no estado
      await selecionar('game');
      const rodando = await chamar(admin, { eventoId: evento.eventoId });
      assert.equal(rodando.status, 409);
      assert.equal((await getGameState(evento.eventoId)).modo, 'game');
      console.log('  ✔ jogo rodando: 409 e o jogo continua');

      // 4) outro buffet, sem evento, sem corpo
      assert.equal((await chamar({ id: 'x', role: 'admin', empresaId: '00000000-0000-0000-0000-000000000000' }, { eventoId: evento.eventoId })).status, 403);
      assert.equal((await chamar(admin, { eventoId: '11111111-1111-1111-1111-111111111111' })).status, 404);
      assert.equal((await chamar(admin, {})).status, 400);
      console.log('  ✔ outro buffet 403, evento inexistente 404, sem eventoId 400');

      // 5) evento encerrado
      await query("UPDATE evento SET status = 'finished' WHERE eventoId = @id", { id: evento.eventoId });
      await selecionar('idle');
      assert.equal((await chamar(admin, { eventoId: evento.eventoId })).status, 409);
      console.log('  ✔ evento encerrado: 409');

      throw new Desfazer();
    });
  } catch (e) {
    if (!(e instanceof Desfazer)) throw e;
  }
  console.log('ROLLBACK ok (nada foi gravado)');
}

main().then(() => closeDB()).catch((e) => { console.error('❌ ENSAIO FALHOU:', e); process.exit(1); });
