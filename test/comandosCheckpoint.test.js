const test = require('node:test');
const assert = require('node:assert/strict');
const { agendar, retirar, VALIDADE_MS } = require('../utils/comandosCheckpoint');

test('o comando é entregue uma única vez', () => {
  agendar('7', 'led', 1000);
  assert.equal(retirar('7', 2000), 'led');
  assert.equal(retirar('7', 2000), null);
});

test('o comando vence depois da validade', () => {
  agendar('8', 'som', 1000);
  assert.equal(retirar('8', 1000 + VALIDADE_MS + 1), null);
  assert.equal(retirar('8', 1000 + VALIDADE_MS + 1), null);
});

test('um pedido novo substitui o anterior e a chave ignora maiúsculas', () => {
  agendar('A1', 'led', 1000);
  agendar('a1', 'som', 1500);
  assert.equal(retirar('A1', 2000), 'som');
});

test('só aceita led e som; checkpoint sem pedido recebe null', () => {
  assert.throws(() => agendar('9', 'fogo'));
  assert.equal(retirar('9'), null);
});
