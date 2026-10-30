// Ensaio da edição do nome do time: roda no banco de dev DENTRO de uma transação e a DESFAZ (ROLLBACK).
// Antes, a rota lia só `nome` e o painel do recreacionista mandava `name`: o nome nunca era salvo.
// Uso: node debug/ensaio-editar-time.js
require('dotenv').config();
const assert = require('node:assert/strict');
const database = require('../database');
const { queryOne, closeDB } = database;
const withTransaction = database.withTransaction;
database.withTransaction = (trabalho) => trabalho(database);
const router = require('../routes/times');

class Desfazer extends Error {}

function chamar(usuario, id, body) {
  const camada = router.stack.find((l) => l.route && l.route.path === '/:id' && l.route.methods.put);
  assert.ok(camada, 'rota PUT /:id existe');
  const handler = camada.route.stack[camada.route.stack.length - 1].handle;
  return new Promise((resolve, reject) => {
    const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(corpo) { resolve({ status: this.statusCode, corpo }); return this; } };
    Promise.resolve(handler({ user: usuario, params: { id }, body, query: {}, headers: {} }, res)).catch(reject);
  });
}

function passaNaBarreira(role) {
  const camada = router.stack.find((l) => l.route && l.route.path === '/:id' && l.route.methods.put);
  const barreira = camada.route.stack[1].handle;   // requireRole
  return new Promise((resolve) => {
    let liberou = false;
    barreira({ user: { role } }, { status() { return { json() { resolve(false); } }; } }, () => { liberou = true; resolve(true); });
    if (!liberou) setTimeout(() => resolve(false), 0);
  });
}

async function main() {
  const time = await queryOne('SELECT timeId, nome, cor, empresaId FROM "time" WHERE empresaId IS NOT NULL LIMIT 1');
  assert.ok(time, 'há um time no banco de dev');
  const dono = { id: 'x', role: 'game_master', empresaId: time.empresaId };
  const ler = () => queryOne('SELECT nome, cor FROM "time" WHERE timeId = @id', { id: time.timeId });

  try {
    await withTransaction(async () => {
      // 1) o painel do recreacionista manda `name`
      const a = await chamar(dono, time.timeId, { name: '  Time Renomeado  ', color: '#112233' });
      assert.equal(a.status, 200, JSON.stringify(a.corpo));
      assert.deepEqual(await ler(), { nome: 'Time Renomeado', cor: '#112233' });
      console.log('  ✔ recreacionista (campo "name"): nome e cor gravados, espaços das pontas tirados');

      // 2) o painel do admin manda `nome`
      const b = await chamar({ ...dono, role: 'admin' }, time.timeId, { nome: 'Outro Nome', color: '#AABBCC' });
      assert.equal(b.status, 200);
      assert.deepEqual(await ler(), { nome: 'Outro Nome', cor: '#AABBCC' });
      console.log('  ✔ admin (campo "nome"): continua funcionando');

      // 3) sem cor no pedido, a cor atual fica
      await chamar(dono, time.timeId, { name: 'So o Nome' });
      assert.deepEqual(await ler(), { nome: 'So o Nome', cor: '#AABBCC' });
      console.log('  ✔ sem cor no pedido: só o nome muda');

      // 4) recusas
      for (const [corpo, texto] of [[{}, /nome/i], [{ name: '   ' }, /nome/i], [{ name: 'x'.repeat(101) }, /100/], [{ name: 'Ok', color: 'azul' }, /Cor/]]) {
        const r = await chamar(dono, time.timeId, corpo);
        assert.equal(r.status, 400, JSON.stringify(corpo));
        assert.match(r.corpo.error, texto);
      }
      assert.deepEqual(await ler(), { nome: 'So o Nome', cor: '#AABBCC' }, 'recusas não mudam nada');
      assert.equal((await chamar({ ...dono, empresaId: '00000000-0000-0000-0000-000000000000' }, time.timeId, { name: 'Invasor' })).status, 403);
      assert.equal((await chamar(dono, '11111111-1111-1111-1111-111111111111', { name: 'Fantasma' })).status, 404);
      console.log('  ✔ nome vazio/grande, cor inválida, time de outro buffet (403) e inexistente (404) são recusados sem alterar nada');

      // 5) só quem gerencia times (família, telão e kiosk não)
      for (const role of ['admin', 'reception', 'game_master', 'master']) assert.equal(await passaNaBarreira(role), true, role);
      for (const role of ['family', 'display', 'kiosk', 'score_kiosk']) assert.equal(await passaNaBarreira(role), false, role);
      console.log('  ✔ admin, recepção, recreação e master editam; família, telão e autoatendimento são barrados');

      throw new Desfazer();
    });
  } catch (e) {
    if (!(e instanceof Desfazer)) throw e;
  }
  const igual = await ler();
  assert.equal(igual.nome, time.nome);
  console.log('ROLLBACK ok (o time voltou como estava)');
}

main().then(() => closeDB()).catch((e) => { console.error('❌ ENSAIO FALHOU:', e); process.exit(1); });
