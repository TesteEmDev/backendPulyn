const test = require('node:test');
const assert = require('node:assert/strict');
const { planDefaultTeams } = require('../utils/defaultTeams');

const templates = [
  { name: 'Vermelho', color: '#FF0000' },
  { name: 'Azul', color: '#0000FF' },
  { name: 'Verde', color: '#00AA00' },
];

test('evento sem times recebe todos os modelos', () => {
  const result = planDefaultTeams({ templates, existingTeams: [] });
  assert.deepEqual(result.map(t => t.name), ['Vermelho', 'Azul', 'Verde']);
  assert.equal(result[0].color, '#FF0000');
});

test('não duplica modelos que o evento já tem, ignorando maiúsculas e espaços', () => {
  const result = planDefaultTeams({ templates, existingTeams: [{ name: '  azul ' }, { name: 'VERDE' }] });
  assert.deepEqual(result.map(t => t.name), ['Vermelho']);
});

test('aplicar de novo não cria nada', () => {
  assert.deepEqual(planDefaultTeams({ templates, existingTeams: templates }), []);
});

test('modelos repetidos ou sem nome são ignorados', () => {
  const result = planDefaultTeams({
    templates: [{ name: 'Azul', color: '#00F' }, { name: 'azul', color: '#11F' }, { name: '  ', color: '#000' }],
    existingTeams: [],
  });
  assert.equal(result.length, 1);
});
