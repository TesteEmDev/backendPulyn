const test = require('node:test');
const assert = require('node:assert/strict');
const { gerarCodigo, normalizarCodigo, formatoValido, exibirCodigo } = require('../utils/codigoConvite');

test('o código gerado tem 8 dígitos hexadecimais em minúsculas', () => {
  for (let i = 0; i < 200; i++) assert.match(gerarCodigo(), /^[0-9a-f]{8}$/);
});

test('os códigos gerados variam', () => {
  const codigos = new Set(Array.from({ length: 200 }, gerarCodigo));
  assert.ok(codigos.size > 195, 'quase nenhuma repetição em 200 sorteios');
});

test('normalizar: maiúsculas, espaços e hífen viram a mesma forma guardada', () => {
  for (const digitado of ['A3F09C12', 'a3f09c12', ' A3F09C12 ', 'A3F0 9C12', 'A3F0-9C12', 'a3f0 - 9c12']) {
    assert.equal(normalizarCodigo(digitado), 'a3f09c12', digitado);
  }
});

test('normalizar: token antigo (64 caracteres) fica como veio, sem mudar de caixa', () => {
  const antigo = 'AbCd'.repeat(16);
  assert.equal(normalizarCodigo(`  ${antigo} `), antigo);
});

test('normalizar: entrada vazia ou nula não quebra', () => {
  assert.equal(normalizarCodigo(null), '');
  assert.equal(normalizarCodigo(undefined), '');
  assert.equal(normalizarCodigo('   '), '');
});

test('formato válido: código curto (em qualquer escrita) e token antigo; o resto não vale a consulta', () => {
  assert.equal(formatoValido('A3F09C12'), true);
  assert.equal(formatoValido('a3f0-9c12'), true);
  assert.equal(formatoValido('f'.repeat(64)), true);
  for (const ruim of ['', 'abc', 'A3F09C1', 'A3F09C123', 'G3F09C12', 'a3f09c1z', null, undefined]) {
    assert.equal(formatoValido(ruim), false, String(ruim));
  }
});

test('exibir: maiúsculas', () => {
  assert.equal(exibirCodigo('a3f09c12'), 'A3F09C12');
});

test('código curto: só 8 dígitos hexadecimais já normalizados', () => {
  const { ehCodigoCurto } = require('../utils/codigoConvite');
  assert.equal(ehCodigoCurto('a3f09c12'), true);
  for (const nao of ['A3F09C12', 'a3f0 9c12', 'a3f09c1', 'f'.repeat(64), '', null, undefined]) assert.equal(ehCodigoCurto(nao), false, String(nao));
});
