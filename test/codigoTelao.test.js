const test = require('node:test');
const assert = require('node:assert/strict');
const { gerarCodigoTelao, normalizarCodigoTelao } = require('../utils/codigoTelao');

test('código do telão: 24 caracteres seguros para URL, diferente a cada vez', () => {
  const codigos = new Set(Array.from({ length: 50 }, gerarCodigoTelao));
  assert.equal(codigos.size, 50);
  for (const codigo of codigos) assert.match(codigo, /^[A-Za-z0-9_-]{24}$/);
});

test('normalizar: tira espaços e recusa o que não tem cara de código', () => {
  const codigo = gerarCodigoTelao();
  assert.equal(normalizarCodigoTelao(`  ${codigo}\n`), codigo);
  for (const ruim of ['', '   ', 'curto', 'a'.repeat(23), 'a'.repeat(41), `${codigo}!`, 'a b'.repeat(10), null, undefined, 123, {}]) {
    assert.equal(normalizarCodigoTelao(ruim), '', `recusa ${JSON.stringify(ruim)}`);
  }
});
