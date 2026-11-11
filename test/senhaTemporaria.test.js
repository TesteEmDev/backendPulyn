const test = require('node:test');
const assert = require('node:assert/strict');
const { rotaLiberadaComSenhaTemporaria } = require('../utils/middleware');

test('com senha temporária só dá para trocar a senha ou sair', () => {
  assert.equal(rotaLiberadaComSenhaTemporaria('/api/auth/alterar-senha'), true);
  assert.equal(rotaLiberadaComSenhaTemporaria('/api/auth/logout'), true);
  assert.equal(rotaLiberadaComSenhaTemporaria('/api/auth/alterar-senha?x=1'), true);
});

test('as demais rotas ficam bloqueadas', () => {
  for (const url of ['/api/eventos', '/api/empresa/me', '/api/auth/papel', '/api/clientes', '', undefined]) {
    assert.equal(rotaLiberadaComSenhaTemporaria(url), false, String(url));
  }
});
