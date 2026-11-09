const test = require('node:test');
const assert = require('node:assert/strict');
const { validarNumeroPorFinalidade, numeroDeRecepcao } = require('../utils/checkpointTransferencia');

test('recepção só aceita R1, R2, R3... e guarda em maiúscula', () => {
  assert.deepEqual(validarNumeroPorFinalidade('reception', 'r2'), { ok: true, valor: 'R2' });
  assert.deepEqual(validarNumeroPorFinalidade('reception', ' R10 '), { ok: true, valor: 'R10' });
  for (const ruim of ['1', 'R', 'RX', 'R1A', 'A1', 'R1234', '']) {
    assert.equal(validarNumeroPorFinalidade('reception', ruim).ok, false, ruim);
  }
});

test('jogo e pontuação não usam o formato R1, R2...', () => {
  assert.equal(validarNumeroPorFinalidade('game', 'R1').ok, false);
  assert.equal(validarNumeroPorFinalidade('score', 'r3').ok, false);
  assert.deepEqual(validarNumeroPorFinalidade('game', '15'), { ok: true, valor: '15' });
  assert.deepEqual(validarNumeroPorFinalidade(null, 'A7'), { ok: true, valor: 'A7' });
  // R1B e RX não são números de recepção, então valem para jogo
  assert.equal(validarNumeroPorFinalidade('game', 'R1B').ok, true);
});

test('numeroDeRecepcao reconhece só o formato R + 1 a 3 dígitos', () => {
  assert.equal(numeroDeRecepcao('R1'), true);
  assert.equal(numeroDeRecepcao('r99'), true);
  assert.equal(numeroDeRecepcao('R'), false);
  assert.equal(numeroDeRecepcao('15'), false);
});
