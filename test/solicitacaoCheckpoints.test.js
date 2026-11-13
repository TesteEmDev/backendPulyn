const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizarItens, resumoDosItens } = require('../routes/support');

test('junta as quantidades do mesmo tipo e resume', () => {
  const r = normalizarItens([
    { tipo: 'nfc', finalidade: 'jogo', quantidade: 3 },
    { tipo: 'UHF', finalidade: 'recepcao', quantidade: '2' },
    { tipo: 'NFC', finalidade: 'jogo', quantidade: 1 },
    { tipo: 'NFC', finalidade: 'pontuacao', quantidade: 5 },
  ]);
  assert.deepEqual(r.itens, [
    { tipo: 'NFC', finalidade: 'jogo', quantidade: 4 },
    { tipo: 'UHF', finalidade: 'recepcao', quantidade: 2 },
    { tipo: 'NFC', finalidade: 'pontuacao', quantidade: 5 },
  ]);
  assert.equal(resumoDosItens(r.itens), '4 × NFC/RFID (jogo), 2 × UHF longa distância (recepção), 5 × NFC/RFID (pontuação)');
});

test('recusa lista vazia, tipo desconhecido e quantidade inválida', () => {
  assert.ok(normalizarItens([]).erro);
  assert.ok(normalizarItens(undefined).erro);
  const f = 'jogo';
  assert.ok(normalizarItens([{ tipo: 'XYZ', finalidade: f, quantidade: 1 }]).erro);
  assert.ok(normalizarItens([{ tipo: 'NFC', quantidade: 1 }]).erro, 'sem finalidade');
  assert.ok(normalizarItens([{ tipo: 'NFC', finalidade: 'outra', quantidade: 1 }]).erro);
  assert.ok(normalizarItens([{ tipo: 'NFC', finalidade: f, quantidade: 0 }]).erro);
  assert.ok(normalizarItens([{ tipo: 'NFC', finalidade: f, quantidade: 1.5 }]).erro);
  assert.ok(normalizarItens([{ tipo: 'NFC', finalidade: f, quantidade: 501 }]).erro);
  assert.ok(normalizarItens([{ tipo: 'NFC', finalidade: f, quantidade: 300 }, { tipo: 'NFC', finalidade: f, quantidade: 300 }]).erro);
});
