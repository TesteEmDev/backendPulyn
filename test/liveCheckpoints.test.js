const test = require('node:test');
const assert = require('node:assert/strict');
const { parseConfigItems, buildCheckpointConfigs } = require('../utils/liveCheckpoints');

test('lê a lista como texto JSON ou array e ignora lixo', () => {
  assert.deepEqual(parseConfigItems('["a","b"]'), ['a', 'b']);
  assert.deepEqual(parseConfigItems([{ id: 'a' }, '', null]), [{ id: 'a' }]);
  assert.deepEqual(parseConfigItems('não é json'), []);
  assert.deepEqual(parseConfigItems(null), []);
});

test('Tesouro com lista de ids continua com ids; mantém a ordem pedida e tira duplicados', () => {
  const result = buildCheckpointConfigs({ type: 'treasure_hunt', requestedIds: ['c', 'a', 'A', 'b'], existingItems: ['a', 'b'] });
  assert.deepEqual(result, ['c', 'a', 'b']);
});

test('Tesouro com objetos mantém objetos e cria { id } para quem entra', () => {
  const result = buildCheckpointConfigs({ type: 'treasure_hunt', requestedIds: ['a', 'x'], existingItems: [{ id: 'a', nota: 1 }] });
  assert.deepEqual(result, [{ id: 'a', nota: 1 }, { id: 'x' }]);
});

test('Monstro preserva o bloqueio de quem fica e usa 15 s para quem entra', () => {
  const existing = [{ id: 'a', cooldown: 30, special: true }, { id: 'b', cooldown: 20 }];
  const result = buildCheckpointConfigs({ type: 'monster_hunt', requestedIds: ['b', 'c'], existingItems: existing });
  assert.deepEqual(result, [{ id: 'b', cooldown: 20 }, { id: 'c', cooldown: 15 }]);
});

test('Monstro: o checkpoint especial escolhido é o único marcado', () => {
  const existing = [{ id: 'a', cooldown: 30, special: true }, { id: 'b', cooldown: 20 }];
  const result = buildCheckpointConfigs({ type: 'monster_hunt', requestedIds: ['a', 'b'], existingItems: existing, specialId: 'B' });
  assert.deepEqual(result, [{ id: 'a', cooldown: 30 }, { id: 'b', cooldown: 20, special: true }]);
});

test('Monstro com lista antiga em texto vira objetos com bloqueio padrão', () => {
  const result = buildCheckpointConfigs({ type: 'monster_hunt', requestedIds: ['a'], existingItems: ['a'] });
  assert.deepEqual(result, [{ id: 'a', cooldown: 15 }]);
});
