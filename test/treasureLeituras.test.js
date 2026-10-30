const test = require('node:test');
const assert = require('node:assert/strict');
const { leiturasNecessarias } = require('../utils/treasure');

test('leituras para liberar o próximo ponto: metade dos participantes, arredondando para baixo', () => {
  assert.deepEqual([2, 3, 4, 5, 6, 7, 8, 10, 11].map(leiturasNecessarias), [1, 1, 2, 2, 3, 3, 4, 5, 5]);
});

test('equipe de 1 participante precisa de 1 leitura (metade de 1 seria zero)', () => {
  assert.equal(leiturasNecessarias(1), 1);
});

test('número inválido ou zero não dá zero leituras', () => {
  for (const ruim of [0, -3, NaN, undefined, null, 'abc']) assert.equal(leiturasNecessarias(ruim), 1);
  assert.equal(leiturasNecessarias('8'), 4);
});
