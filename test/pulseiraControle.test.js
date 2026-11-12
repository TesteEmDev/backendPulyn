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

test('pedido de pulseiras: valida tipo e quantidade e junta linhas do mesmo tipo', () => {
  const { normalizarItensPulseira } = require('../routes/support');
  assert.equal(normalizarItensPulseira([]).erro !== undefined, true);
  assert.equal(normalizarItensPulseira([{ tipo: 'XYZ', quantidade: 5 }]).erro, 'Tipo de pulseira inválido');
  assert.equal(normalizarItensPulseira([{ tipo: 'NFC', quantidade: 0 }]).erro !== undefined, true);
  assert.equal(normalizarItensPulseira([{ tipo: 'NFC', quantidade: 5001 }]).erro !== undefined, true);
  assert.deepEqual(normalizarItensPulseira([{ tipo: 'nfc', quantidade: 10 }, { tipo: 'NFC', quantidade: 5 }, { tipo: 'UHF', quantidade: 2 }]).itens,
    [{ tipo: 'NFC', quantidade: 15 }, { tipo: 'UHF', quantidade: 2 }]);
});
