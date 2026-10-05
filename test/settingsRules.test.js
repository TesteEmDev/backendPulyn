const test = require('node:test');
const assert = require('node:assert/strict');
const { parseSettingsPayload } = require('../utils/settingsRules');

test('normaliza valores para texto', () => {
  const { entries, error } = parseSettingsPayload({ unit_name: 'Buffet X', update_interval: 5, flag: true, empty: null });
  assert.equal(error, undefined);
  assert.deepEqual(entries, [['unit_name', 'Buffet X'], ['update_interval', '5'], ['flag', 'true'], ['empty', '']]);
});

test('rejeita corpo que não é objeto ou está vazio', () => {
  assert.ok(parseSettingsPayload(null).error);
  assert.ok(parseSettingsPayload([]).error);
  assert.ok(parseSettingsPayload('x').error);
  assert.ok(parseSettingsPayload({}).error);
});

test('rejeita nomes de chave inválidos e valores que não são simples', () => {
  assert.ok(parseSettingsPayload({ 'DROP TABLE': 'x' }).error);
  assert.ok(parseSettingsPayload({ '1abc': 'x' }).error);
  assert.ok(parseSettingsPayload({ a: { b: 1 } }).error);
  assert.ok(parseSettingsPayload({ a: ['x'] }).error);
});

test('rejeita valor longo demais', () => {
  assert.ok(parseSettingsPayload({ unit_address: 'x'.repeat(1001) }).error);
  assert.equal(parseSettingsPayload({ unit_address: 'x'.repeat(1000) }).error, undefined);
});
