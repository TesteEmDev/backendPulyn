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

test('telefone aceita 10 ou 11 dígitos com ou sem máscara e permite vazio', () => {
  for (const phone of ['(11) 91234-5678', '11912345678', '(11) 3456-7890', '1134567890', '']) {
    assert.equal(parseSettingsPayload({ unit_phone: phone }).error, undefined, phone);
  }
});

test('telefone rejeita quantidade de dígitos errada e números inválidos', () => {
  for (const phone of ['(11) 9123-567', '119123456789', '123', '(00) 91234-5678', '(11) 11111-1111', '(11) 81234-5678']) {
    assert.ok(parseSettingsPayload({ unit_phone: phone }).error, phone);
  }
});

test('rejeita valor longo demais', () => {
  assert.ok(parseSettingsPayload({ unit_address: 'x'.repeat(1001) }).error);
  assert.equal(parseSettingsPayload({ unit_address: 'x'.repeat(1000) }).error, undefined);
});
