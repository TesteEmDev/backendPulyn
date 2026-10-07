const test = require('node:test');
const assert = require('node:assert/strict');
const { isBraceletReleaseDue, BRACELET_RELEASE_DELAY_MS } = require('../utils/braceletRelease');

const ENDED = new Date('2026-10-05T20:00:00.000Z');
const at = (minutes) => new Date(ENDED.getTime() + minutes * 60000);

test('o prazo é de 10 minutos', () => {
  assert.equal(BRACELET_RELEASE_DELAY_MS, 10 * 60 * 1000);
});

test('antes dos 10 minutos ainda não libera', () => {
  assert.equal(isBraceletReleaseDue(ENDED, at(0)), false);
  assert.equal(isBraceletReleaseDue(ENDED, at(9.99)), false);
});

test('a partir dos 10 minutos libera', () => {
  assert.equal(isBraceletReleaseDue(ENDED, at(10)), true);
  assert.equal(isBraceletReleaseDue(ENDED, at(60 * 24)), true);
});

test('aceita a data como texto ISO e como Date', () => {
  assert.equal(isBraceletReleaseDue(ENDED.toISOString(), at(11)), true);
});

test('sem data de encerramento (ou inválida) nunca libera', () => {
  assert.equal(isBraceletReleaseDue(null, at(60)), false);
  assert.equal(isBraceletReleaseDue(undefined, at(60)), false);
  assert.equal(isBraceletReleaseDue('não é data', at(60)), false);
});
