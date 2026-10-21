const test = require('node:test');
const assert = require('node:assert/strict');
const { SOM_PLANTADA_MS, explosaoDaBombaEm, restanteDaBomba } = require('../utils/bombaTempo');

const plantadaEm = new Date('2026-10-16T12:00:00.000Z');
const depois = (ms) => new Date(plantadaEm.getTime() + ms);

test('sem bomba plantada não há tempo nem explosão', () => {
  assert.equal(explosaoDaBombaEm(null, 150), null);
  assert.equal(restanteDaBomba(null, 150, plantadaEm), null);
});

test('a explosão acontece depois do som de bomba plantada + a duração da bomba', () => {
  assert.equal(explosaoDaBombaEm(plantadaEm, 150), plantadaEm.getTime() + SOM_PLANTADA_MS + 150000);
});

test('durante o som a contagem fica parada no valor cheio', () => {
  assert.equal(restanteDaBomba(plantadaEm, 150, plantadaEm), 150000);
  assert.equal(restanteDaBomba(plantadaEm, 150, depois(SOM_PLANTADA_MS - 1)), 150000);
});

test('depois do som a contagem começa a descer', () => {
  assert.equal(restanteDaBomba(plantadaEm, 150, depois(SOM_PLANTADA_MS)), 150000);
  assert.equal(restanteDaBomba(plantadaEm, 150, depois(SOM_PLANTADA_MS + 10000)), 140000);
});

test('zera na explosão e nunca fica negativo', () => {
  assert.equal(restanteDaBomba(plantadaEm, 150, depois(SOM_PLANTADA_MS + 150000)), 0);
  assert.equal(restanteDaBomba(plantadaEm, 150, depois(SOM_PLANTADA_MS + 999999)), 0);
});

test('aceita a data plantada como texto ISO', () => {
  assert.equal(restanteDaBomba('2026-10-16T12:00:00.000Z', 60, depois(SOM_PLANTADA_MS + 1000)), 59000);
});
