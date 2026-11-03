const test = require('node:test');
const assert = require('node:assert/strict');
const { hashSenha, verificarSenha, precisaAtualizar, validarSenhaNova } = require('../utils/senhas');

test('o hash novo confere com a senha certa e recusa a errada', () => {
  const guardada = hashSenha('segredo-123');
  assert.ok(guardada.startsWith('scrypt$'));
  assert.equal(verificarSenha('segredo-123', guardada), true);
  assert.equal(verificarSenha('segredo-124', guardada), false);
  assert.equal(verificarSenha('', guardada), false);
});

test('dois hashes da mesma senha são diferentes (sal aleatório)', () => {
  assert.notEqual(hashSenha('mesma-senha'), hashSenha('mesma-senha'));
});

test('contas antigas em base64 continuam entrando e pedem atualização', () => {
  const antiga = Buffer.from('senha-antiga').toString('base64');
  assert.equal(verificarSenha('senha-antiga', antiga), true);
  assert.equal(verificarSenha('outra', antiga), false);
  assert.equal(precisaAtualizar(antiga), true);
  assert.equal(precisaAtualizar(hashSenha('x')), false);
});

test('valores vazios ou malformados nunca conferem', () => {
  assert.equal(verificarSenha('x', null), false);
  assert.equal(verificarSenha(undefined, hashSenha('x')), false);
  assert.equal(verificarSenha('x', 'scrypt$'), false);
  assert.equal(verificarSenha('x', 'scrypt$zz$zz'), false);
});

test('a senha nova tem mínimo de 6 caracteres (o mesmo do cadastro) e máximo de 128', () => {
  assert.notEqual(validarSenhaNova('12345'), null);
  assert.equal(validarSenhaNova('123456'), null);
  assert.notEqual(validarSenhaNova('x'.repeat(129)), null);
  assert.notEqual(validarSenhaNova(undefined), null);
});
