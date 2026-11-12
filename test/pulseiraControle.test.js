const test = require('node:test');
const assert = require('node:assert/strict');
const { controleAtivo } = require('../utils/pulseiraControle');

test('o controle de pulseiras vem ligado e só desliga com PULSEIRAS_CONTROLE_MASTER=0', () => {
  assert.equal(controleAtivo({}), true);
  assert.equal(controleAtivo({ PULSEIRAS_CONTROLE_MASTER: '1' }), true);
  assert.equal(controleAtivo({ PULSEIRAS_CONTROLE_MASTER: 'qualquer' }), true);
  assert.equal(controleAtivo({ PULSEIRAS_CONTROLE_MASTER: '0' }), false);
  assert.equal(controleAtivo({ PULSEIRAS_CONTROLE_MASTER: ' 0 ' }), false);
});

test('pedido de pulseiras: só a quantidade (1 a 5000), sem tipo', () => {
  const { normalizarPedidoPulseiras } = require('../routes/support');
  assert.equal(normalizarPedidoPulseiras({}).erro !== undefined, true);
  assert.equal(normalizarPedidoPulseiras({ quantidade: 0 }).erro !== undefined, true);
  assert.equal(normalizarPedidoPulseiras({ quantidade: 5001 }).erro !== undefined, true);
  assert.equal(normalizarPedidoPulseiras({ quantidade: 2.5 }).erro !== undefined, true);
  assert.deepEqual(normalizarPedidoPulseiras({ quantidade: '120' }).itens, [{ quantidade: 120 }]);
  assert.equal(normalizarPedidoPulseiras({ itens: [{ quantidade: 10 }, { quantidade: 5 }] }).quantidade, 15);
});
