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

const { sortearCheckpoints, normalizarQuantidadeCheckpoints } = require('../utils/treasure');

test('sortear checkpoints: a quantidade pedida, sem repetir e só entre os do jogo', () => {
  const ids = ['1', '2', '3', '4', '5'];
  for (let i = 0; i < 30; i += 1) {
    const sorteados = sortearCheckpoints(ids, 3);
    assert.equal(sorteados.length, 3);
    assert.equal(new Set(sorteados).size, 3);
    assert.ok(sorteados.every((id) => ids.includes(id)));
  }
  assert.deepEqual(sortearCheckpoints(ids, 5).sort(), ids);
  assert.deepEqual(ids, ['1', '2', '3', '4', '5'], 'não altera a lista original');
});

test('quantidade de checkpoints: vazio = todos; senão inteiro de 2 até os disponíveis', () => {
  for (const vazio of [undefined, null, '', '  ']) assert.equal(normalizarQuantidadeCheckpoints(vazio, 5), null);
  assert.equal(normalizarQuantidadeCheckpoints(2, 5), 2);
  assert.equal(normalizarQuantidadeCheckpoints('4', 5), 4);
  assert.equal(normalizarQuantidadeCheckpoints(5, 5), 5);
  for (const ruim of [1, 0, -2, 6, 2.5, 'abc', NaN]) {
    assert.throws(() => normalizarQuantidadeCheckpoints(ruim, 5), (e) => e.statusCode === 400 && /2 a 5/.test(e.message), String(ruim));
  }
  assert.throws(() => normalizarQuantidadeCheckpoints(2, 1), (e) => e.statusCode === 400 && /pelo menos 2/.test(e.message));
});
