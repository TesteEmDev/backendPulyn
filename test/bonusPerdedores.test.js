const test = require('node:test');
const assert = require('node:assert/strict');
const { pontosDoPerdedor, LOSER_BONUS_POINTS, WINNER_BONUS_POINTS } = require('../utils/winnerBonus');

test('a melhor das que não venceram leva 100 e cada posição seguinte leva a metade', () => {
  assert.equal(WINNER_BONUS_POINTS, 200);
  assert.equal(LOSER_BONUS_POINTS, 100);
  assert.deepEqual([0, 1, 2, 3].map((p) => pontosDoPerdedor(p)), [100, 50, 25, 12]);
});

test('depois de muitas posições o prêmio chega a zero (não paga)', () => {
  assert.equal(pontosDoPerdedor(7), 0);
});

test('equipes empatadas dividem a posição e a pontuação; a próxima ocupa a posição real', () => {
  const { posicoesComEmpate } = require('../utils/winnerBonus');
  assert.deepEqual(posicoesComEmpate(['a', 'a', 'b']), [0, 0, 2]);
  assert.deepEqual(posicoesComEmpate(['a', 'a', 'a']), [0, 0, 0]);
  assert.deepEqual(posicoesComEmpate(['a', 'b', 'c']), [0, 1, 2]);
  assert.deepEqual(posicoesComEmpate([undefined, undefined]), [0, 1]);
  assert.deepEqual(posicoesComEmpate(['a', 'a', 'b'].map((c, i) => c)).map((p) => pontosDoPerdedor(p)), [100, 100, 25]);
});
