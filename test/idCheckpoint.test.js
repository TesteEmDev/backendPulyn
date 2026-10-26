const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validarCodigoCheckpoint,
  chaveComCodigoDoBuffet,
  cabeNoEsp32,
  tamanhoMaximoComCodigoDoBuffet,
} = require('../utils/idCheckpoint');

test('aceita o que o ESP32 aceita: letras, números, - e _ até 16 caracteres', () => {
  assert.equal(validarCodigoCheckpoint('CP-01'), null);
  assert.equal(validarCodigoCheckpoint('entrada_princi'), null);
  assert.equal(validarCodigoCheckpoint('ABCDEFGHIJKLMNOP'), null);
});

test('recusa ID vazio ou com mais de 16 caracteres', () => {
  assert.notEqual(validarCodigoCheckpoint(''), null);
  assert.notEqual(validarCodigoCheckpoint('ABCDEFGHIJKLMNOPQ'), null);
});

test('recusa caracteres que o ESP32 não aceita (espaço, ponto, acento, barra)', () => {
  for (const ruim of ['CP 01', 'CP.01', 'Área1', 'CP/01', 'CP#1']) {
    assert.notEqual(validarCodigoCheckpoint(ruim), null, ruim);
  }
});

test('monta a chave com o código do buffet na frente', () => {
  assert.equal(chaveComCodigoDoBuffet('12', 'K7H2QM'), 'K7H2QM-12');
});

test('chave com prefixo cabe em 16 caracteres só quando o ID tem até o tamanho máximo', () => {
  assert.equal(tamanhoMaximoComCodigoDoBuffet('K7H2QM'), 9);
  assert.equal(cabeNoEsp32(chaveComCodigoDoBuffet('ABCDEFGHI', 'K7H2QM')), true);
  assert.equal(cabeNoEsp32(chaveComCodigoDoBuffet('ABCDEFGHIJ', 'K7H2QM')), false);
});
