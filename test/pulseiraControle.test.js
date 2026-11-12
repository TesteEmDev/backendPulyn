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
