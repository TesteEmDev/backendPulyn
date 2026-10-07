const test = require('node:test');
const assert = require('node:assert/strict');
const { PARALLEL_PRIZES, planParallelAward, positionLabel } = require('../utils/parallelRules');

test('os prêmios são 50, 40 e 30', () => {
  assert.deepEqual([...PARALLEL_PRIZES], [50, 40, 30]);
});

test('o primeiro, o segundo e o terceiro a ler ganham 50, 40 e 30', () => {
  assert.deepEqual(planParallelAward([], 'a'), { status: 'won', position: 1, points: 50 });
  assert.deepEqual(planParallelAward([{ crianca_id: 'a', position: 1 }], 'b'), { status: 'won', position: 2, points: 40 });
  assert.deepEqual(
    planParallelAward([{ crianca_id: 'a', position: 1 }, { crianca_id: 'b', position: 2 }], 'c'),
    { status: 'won', position: 3, points: 30 }
  );
});

test('quem já está no pódio não ganha de novo e mantém a posição', () => {
  const winners = [{ crianca_id: 'a', position: 1 }, { crianca_id: 'b', position: 2 }];
  assert.deepEqual(planParallelAward(winners, 'a'), { status: 'already', position: 1 });
  assert.deepEqual(planParallelAward(winners, 'B'), { status: 'already', position: 2 });
});

test('com os 3 lugares preenchidos, o próximo não ganha', () => {
  const winners = [
    { crianca_id: 'a', position: 1 }, { crianca_id: 'b', position: 2 }, { crianca_id: 'c', position: 3 },
  ];
  assert.deepEqual(planParallelAward(winners, 'd'), { status: 'closed' });
  assert.deepEqual(planParallelAward(winners, 'c'), { status: 'already', position: 3 });
});

test('rótulos de posição', () => {
  assert.equal(positionLabel(1), '1º');
  assert.equal(positionLabel(3), '3º');
});
