const test = require('node:test');
const assert = require('node:assert/strict');
const { vinculosParaNovaParticipacao } = require('../utils/perfilCrianca');

test('responsável com vínculo em duas participações antigas ganha um só na nova', () => {
  const vinculos = [
    { loginId: 'pai', relacionamento: 'responsável' },
    { loginId: 'pai', relacionamento: 'responsável' },
  ];
  assert.deepEqual(vinculosParaNovaParticipacao(vinculos), [
    { loginId: 'pai', relacionamento: 'responsável' },
  ]);
});

test('responsáveis diferentes ganham um vínculo cada, com o relacionamento de cada um', () => {
  const vinculos = [
    { loginId: 'pai', relacionamento: 'pai' },
    { loginId: 'avo', relacionamento: 'avó' },
  ];
  assert.deepEqual(vinculosParaNovaParticipacao(vinculos), [
    { loginId: 'pai', relacionamento: 'pai' },
    { loginId: 'avo', relacionamento: 'avó' },
  ]);
});

test('perfil sem vínculos não gera nada', () => {
  assert.deepEqual(vinculosParaNovaParticipacao([]), []);
});
