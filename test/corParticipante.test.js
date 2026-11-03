const test = require('node:test');
const assert = require('node:assert/strict');
const { CORES_PARTICIPANTE, normalizarCor, escolherCor } = require('../utils/corParticipante');

test('paleta: 12 cores hexadecimais diferentes', () => {
  assert.equal(CORES_PARTICIPANTE.length, 12);
  assert.equal(new Set(CORES_PARTICIPANTE).size, 12);
  for (const cor of CORES_PARTICIPANTE) assert.match(cor, /^#[0-9A-F]{6}$/);
});

test('normalizar: aceita só cores da paleta (sem diferenciar maiúsculas)', () => {
  assert.equal(normalizarCor('#ef4444'), '#EF4444');
  assert.equal(normalizarCor(' #3B82F6 '), '#3B82F6');
  for (const ruim of ['#000000', 'vermelho', '', null, undefined, '#EF444', 123]) assert.equal(normalizarCor(ruim), null);
});

test('escolher cor: sem pedido vem uma livre; pedido em uso é conflito; todas em uso repete', () => {
  for (let i = 0; i < 30; i += 1) {
    const { cor } = escolherCor({ emUso: CORES_PARTICIPANTE.slice(0, 11) });
    assert.equal(cor, CORES_PARTICIPANTE[11]);
  }
  const conflito = escolherCor({ pedido: CORES_PARTICIPANTE[0], emUso: [CORES_PARTICIPANTE[0]] });
  assert.equal(conflito.conflito, true);
  assert.ok(!conflito.livres.includes(CORES_PARTICIPANTE[0]));
  assert.deepEqual(escolherCor({ pedido: CORES_PARTICIPANTE[2], emUso: [] }), { cor: CORES_PARTICIPANTE[2] });
  assert.deepEqual(escolherCor({ pedido: CORES_PARTICIPANTE[2], emUso: [...CORES_PARTICIPANTE] }), { cor: CORES_PARTICIPANTE[2] });
});
