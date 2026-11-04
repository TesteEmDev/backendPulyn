const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizarItens, resumoDosItens } = require('../routes/support');

test('junta as quantidades do mesmo tipo e resume', () => {
  const r = normalizarItens([{ tipo: 'nfc', quantidade: 3 }, { tipo: 'UHF', quantidade: '2' }, { tipo: 'NFC', quantidade: 1 }]);
  assert.deepEqual(r.itens, [{ tipo: 'NFC', quantidade: 4 }, { tipo: 'UHF', quantidade: 2 }]);
  assert.equal(resumoDosItens(r.itens), '4 × NFC/RFID, 2 × UHF longa distância');
});

test('recusa lista vazia, tipo desconhecido e quantidade inválida', () => {
  assert.ok(normalizarItens([]).erro);
  assert.ok(normalizarItens(undefined).erro);
  assert.ok(normalizarItens([{ tipo: 'XYZ', quantidade: 1 }]).erro);
  assert.ok(normalizarItens([{ tipo: 'NFC', quantidade: 0 }]).erro);
  assert.ok(normalizarItens([{ tipo: 'NFC', quantidade: 1.5 }]).erro);
  assert.ok(normalizarItens([{ tipo: 'NFC', quantidade: 501 }]).erro);
  assert.ok(normalizarItens([{ tipo: 'NFC', quantidade: 300 }, { tipo: 'NFC', quantidade: 300 }]).erro);
});
