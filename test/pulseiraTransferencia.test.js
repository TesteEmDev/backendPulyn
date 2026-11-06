const test = require('node:test');
const assert = require('node:assert/strict');
const { lerCodigos, listaDeParametros, LIMITE_POR_PEDIDO } = require('../utils/pulseiraTransferencia');

test('lê códigos separados por espaço, vírgula ou linha e tira repetidos', () => {
  const r = lerCodigos('aa:11:bb:22\ncc-33-dd-44, AA11BB22  ;  ');
  assert.deepEqual(r.codigos, ['AA11BB22', 'CC33DD44']);
  assert.deepEqual(r.invalidos, []);
});

test('separa os códigos que não parecem de pulseira', () => {
  const r = lerCodigos(['AA11BB22', 'xyz', 'A1', '']);
  assert.deepEqual(r.codigos, ['AA11BB22']);
  assert.equal(r.invalidos.length, 2);
});

test('recusa pedidos grandes demais', () => {
  const muitos = Array.from({ length: LIMITE_POR_PEDIDO + 1 }, (_, i) => `AA${String(i).padStart(6, '0')}`);
  assert.ok(lerCodigos(muitos).erro);
});

test('monta a lista de parâmetros do IN', () => {
  const { marcadores, params } = listaDeParametros(['AA11BB22', 'CC33DD44']);
  assert.equal(marcadores, '@c0, @c1');
  assert.deepEqual(params, { c0: 'AA11BB22', c1: 'CC33DD44' });
});
