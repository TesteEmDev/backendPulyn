// Ensaio do sorteio de times com aviso ao telão: roda no banco de dev DENTRO de uma transação e a DESFAZ (ROLLBACK).
// Uso: node debug/ensaio-sorteio-telao.js
require('dotenv').config();
const assert = require('node:assert/strict');
const database = require('../database');
const { queryOne, allQuery, closeDB } = database;
const withTransaction = database.withTransaction;
database.withTransaction = (trabalho) => trabalho(database);
const router = require('../routes/times');

class Desfazer extends Error {}

function chamar(usuario, eventoId, body) {
  const camada = router.stack.find((l) => l.route && l.route.path === '/evento/:eventoId/distribuir-aleatorio' && l.route.methods.post);
  assert.ok(camada, 'rota existe');
  const handler = camada.route.stack[camada.route.stack.length - 1].handle;
  return new Promise((resolve, reject) => {
    const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(corpo) { resolve({ status: this.statusCode, corpo }); return this; } };
    Promise.resolve(handler({ user: usuario, params: { eventoId }, body, query: {}, headers: {} }, res)).catch(reject);
  });
}

async function main() {
  const evento = await queryOne(
    `SELECT e.eventoId, e.empresaId, e.nome FROM evento e
     WHERE (SELECT COUNT(*) FROM "time" t WHERE t.eventoId = e.eventoId) >= 2
       AND (SELECT COUNT(*) FROM crianca c WHERE c.eventoId = e.eventoId) >= 2
     ORDER BY (SELECT COUNT(*) FROM crianca c WHERE c.eventoId = e.eventoId) DESC LIMIT 1`
  );
  assert.ok(evento, 'há um evento com 2+ times e 2+ participantes no banco de dev');
  const admin = { id: 'x', role: 'admin', empresaId: evento.empresaId };
  const avisos = [];
  global.broadcastToEvent = (id, msg) => avisos.push({ id, msg });

  try {
    await withTransaction(async () => {
      const r = await chamar(admin, evento.eventoId, { mode: 'all' });
      assert.equal(r.status, 200, JSON.stringify(r.corpo));
      const sorteio = avisos.filter((a) => a.msg.type === 'TEAMS_DRAWN');
      assert.equal(sorteio.length, 1, 'um aviso ao telão por sorteio');
      const { payload } = sorteio[0].msg;
      assert.equal(String(payload.eventoId).toLowerCase(), String(evento.eventoId).toLowerCase());
      assert.equal(payload.mode, 'all');
      assert.ok(payload.drawnAt);

      const total = await allQuery('SELECT criancaId, timeId FROM crianca WHERE eventoId = @e AND timeId IS NOT NULL', { e: evento.eventoId });
      const membros = payload.teams.flatMap((t) => t.members);
      assert.equal(membros.length, total.length, 'o telão recebe todos os participantes que ficaram com time');
      assert.ok(membros.every((m) => m.nickname && m.nickname.length > 0), 'todo membro tem apelido (ou nome)');
      assert.ok(payload.teams.length >= 2 && payload.teams.every((t) => t.id && t.name));
      assert.equal(membros.filter((m) => m.novo).length, r.corpo.distributed, 'novo = quem foi sorteado agora');
      const tamanhos = payload.teams.map((t) => t.members.length);
      assert.ok(Math.max(...tamanhos) - Math.min(...tamanhos) <= 1, 'times equilibrados');
      console.log(`  ✔ "${evento.nome}": aviso TEAMS_DRAWN com ${payload.teams.length} times (${tamanhos.join(' / ')} membros), ${membros.length} participantes, ${r.corpo.distributed} marcados como sorteados agora`);

      // a resposta da rota não mudou (o telão recebe a formação só pelo aviso)
      assert.ok(Array.isArray(r.corpo.teams) && r.corpo.teams.every((t) => 'members' in t && typeof t.members === 'number'));
      console.log('  ✔ a resposta da rota segue com a contagem por time (o modal do recreacionista não muda)');

      // evento de outro buffet / inválido: nenhum aviso novo
      avisos.length = 0;
      assert.equal((await chamar({ id: 'x', role: 'admin', empresaId: '00000000-0000-0000-0000-000000000000' }, evento.eventoId, { mode: 'all' })).status, 403);
      assert.equal((await chamar(admin, evento.eventoId, { mode: 'qualquer' })).status, 400);
      assert.equal(avisos.length, 0);
      console.log('  ✔ recusas (outro buffet, modo inválido) não avisam o telão');

      throw new Desfazer();
    });
  } catch (e) {
    if (!(e instanceof Desfazer)) throw e;
  }
  console.log('ROLLBACK ok (nada foi gravado)');
}

main().then(() => closeDB()).catch((e) => { console.error('❌ ENSAIO FALHOU:', e); process.exit(1); });
