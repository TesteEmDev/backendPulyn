// Ensaio de reabrir e reagendar evento: roda no banco de dev DENTRO de uma transação e a DESFAZ (ROLLBACK).
// Antes, 'A nova data e horário precisam estar no futuro' aparecia mesmo com data futura, porque as rotas liam
// schedule.data/hora (que não existem) em vez de schedule.date/time.
// Uso: node debug/ensaio-reabrir-evento.js
require('dotenv').config();
const assert = require('node:assert/strict');
const database = require('../database');
const { query, queryOne, closeDB } = database;
const withTransaction = database.withTransaction;
database.withTransaction = (trabalho) => trabalho(database);
const router = require('../routes/events');

class Desfazer extends Error {}

function chamar(caminho, { usuario, params, body }) {
  const camada = router.stack.find((l) => l.route && l.route.path === caminho && l.route.methods.post);
  assert.ok(camada, `rota POST ${caminho} existe`);
  const handler = camada.route.stack[camada.route.stack.length - 1].handle;
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      status(c) { this.statusCode = c; return this; },
      json(corpo) { resolve({ status: this.statusCode, corpo }); return this; },
    };
    Promise.resolve(handler({ user: usuario, params, body, query: {}, headers: {} }, res)).catch(reject);
  });
}

const dia = (deslocamentoDias) => new Date(Date.now() + deslocamentoDias * 86400000).toISOString().slice(0, 10);

async function main() {
  const evento = await queryOne('SELECT eventoId, empresaId, nome, status, data, hora, duracao FROM evento WHERE empresaId IS NOT NULL LIMIT 1');
  assert.ok(evento, 'há um evento no banco de dev');
  const admin = { id: 'x', role: 'admin', empresaId: evento.empresaId };
  const params = { id: evento.eventoId };

  try {
    await withTransaction(async () => {
      // Reabrir: o evento encerrado volta a agendado na data nova
      await query("UPDATE evento SET status = 'finished' WHERE eventoId = @id", { id: evento.eventoId });

      const passado = await chamar('/:id/reopen', { usuario: admin, params, body: { date: dia(-3), time: '10:00' } });
      assert.equal(passado.status, 400);
      assert.match(passado.corpo.error, /no futuro/);
      console.log('  ✔ reabrir com data passada: 400 "precisam estar no futuro"');

      const invalida = await chamar('/:id/reopen', { usuario: admin, params, body: { date: 'ontem', time: '10:00' } });
      assert.equal(invalida.status, 400);

      const futuro = await chamar('/:id/reopen', { usuario: admin, params, body: { date: dia(5), time: '15:30', duration: 90 } });
      assert.equal(futuro.status, 200, JSON.stringify(futuro.corpo));
      const reaberto = await queryOne('SELECT status, CAST(data AS text) AS data, CAST(hora AS text) AS hora, duracao FROM evento WHERE eventoId = @id', { id: evento.eventoId });
      assert.equal(String(reaberto.status).toLowerCase(), 'scheduled');
      assert.equal(String(reaberto.data).slice(0, 10), dia(5));
      assert.match(String(reaberto.hora), /^15:30/);
      assert.equal(Number(reaberto.duracao), 90);
      console.log(`  ✔ reabrir com data futura (${dia(5)} 15:30, 90 min): evento volta a agendado na data nova`);

      // Reagendar (o evento agora está agendado)
      const reagPassado = await chamar('/:id/reschedule', { usuario: admin, params, body: { date: dia(-1), time: '10:00' } });
      assert.equal(reagPassado.status, 400);
      const reag = await chamar('/:id/reschedule', { usuario: admin, params, body: { date: dia(9), time: '09:15' } });
      assert.equal(reag.status, 200, JSON.stringify(reag.corpo));
      const depois = await queryOne('SELECT CAST(data AS text) AS data, CAST(hora AS text) AS hora, duracao FROM evento WHERE eventoId = @id', { id: evento.eventoId });
      assert.equal(String(depois.data).slice(0, 10), dia(9));
      assert.match(String(depois.hora), /^09:15/);
      assert.equal(Number(depois.duracao), 90, 'sem duração nova, mantém a que tinha');
      console.log(`  ✔ reagendar: passado recusado; futuro (${dia(9)} 09:15) grava e mantém a duração`);

      throw new Desfazer();
    });
  } catch (e) {
    if (!(e instanceof Desfazer)) throw e;
  }
  const igual = await queryOne('SELECT status, data, hora FROM evento WHERE eventoId = @id', { id: evento.eventoId });
  assert.equal(String(igual.status), String(evento.status));
  console.log('ROLLBACK ok (o evento voltou como estava)');
}

main()
  .then(() => (closeDB ? closeDB() : undefined))
  .catch((e) => { console.error('❌ ENSAIO FALHOU:', e); process.exit(1); });
