const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_OBJECTS, normalizeObjectName, sameName, buildWheel } = require('../utils/parallelObjectsRules');

test('a lista inicial tem objetos fáceis e sem repetição', () => {
  assert.ok(DEFAULT_OBJECTS.length >= 8);
  assert.equal(new Set(DEFAULT_OBJECTS.map(n => n.toLowerCase())).size, DEFAULT_OBJECTS.length);
});

test('normaliza o nome: espaços, primeira letra maiúscula', () => {
  assert.deepEqual(normalizeObjectName('  um   balão azul '), { name: 'Um balão azul' });
});

test('recusa nome vazio, curto ou longo demais', () => {
  assert.ok(normalizeObjectName('').error);
  assert.ok(normalizeObjectName(' a ').error);
  assert.ok(normalizeObjectName('x'.repeat(61)).error);
  assert.equal(normalizeObjectName('x'.repeat(60)).error, undefined);
});

test('compara nomes sem diferenciar maiúsculas e espaços nas pontas', () => {
  assert.equal(sameName(' Um Balão', 'um balão '), true);
  assert.equal(sameName('Um balão', 'Um copo'), false);
});

const objetos = Array.from({ length: 20 }, (_, i) => ({ id: `o${i}`, name: `Objeto ${i}` }));

test('a roleta tem o sorteado e no máximo 12 gomos, sem repetir', () => {
  const { segments, winnerIndex } = buildWheel(objetos, 'o7');
  assert.equal(segments.length, 12);
  assert.equal(segments[winnerIndex], 'Objeto 7');
  assert.equal(new Set(segments).size, 12);
});

test('com poucos objetos a roleta usa todos', () => {
  const poucos = objetos.slice(0, 3);
  const { segments, winnerIndex } = buildWheel(poucos, 'o1');
  assert.equal(segments.length, 3);
  assert.equal(segments[winnerIndex], 'Objeto 1');
});

test('com um só objeto a roleta tem um gomo', () => {
  const { segments, winnerIndex } = buildWheel(objetos.slice(0, 1), 'o0');
  assert.deepEqual(segments, ['Objeto 0']);
  assert.equal(winnerIndex, 0);
});

test('a posição do sorteado varia e o índice sempre aponta para ele', () => {
  const posicoes = new Set();
  for (let i = 0; i < 60; i += 1) {
    const { segments, winnerIndex } = buildWheel(objetos, 'o3');
    assert.equal(segments[winnerIndex], 'Objeto 3');
    posicoes.add(winnerIndex);
  }
  assert.ok(posicoes.size > 1);
});

test('objeto fora da lista dá erro', () => {
  assert.throws(() => buildWheel(objetos, 'naoexiste'));
});
