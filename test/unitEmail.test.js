const test = require('node:test');
const assert = require('node:assert/strict');
const { unitEmailSlug, unitEmailDomain, checkUnitEmail } = require('../utils/unitEmail');

test('o domínio vem do nome da unidade, sem espaços, acentos ou símbolos', () => {
  assert.equal(unitEmailDomain('Buffet ADV'), 'buffetadv.com');
  assert.equal(unitEmailDomain('  Buffet  Alegria Kids '), 'buffetalegriakids.com');
  assert.equal(unitEmailDomain('Cantinho da Vovó & Cia.'), 'cantinhodavovocia.com');
  assert.equal(unitEmailDomain('Açaí 2000'), 'acai2000.com');
});

test('nome sem letras nem números não gera domínio', () => {
  assert.equal(unitEmailDomain('***'), null);
  assert.equal(unitEmailDomain(''), null);
  assert.equal(unitEmailDomain(null), null);
});

test('o rótulo do domínio é limitado a 63 caracteres', () => {
  assert.equal(unitEmailSlug('a'.repeat(100)).length, 63);
});

test('aceita e-mail do domínio da unidade e normaliza para minúsculas', () => {
  assert.deepEqual(checkUnitEmail('Maria.Silva@BuffetADV.com', 'Buffet ADV'), { email: 'maria.silva@buffetadv.com' });
  assert.deepEqual(checkUnitEmail('recepcao@buffetadv.com', 'Buffet ADV'), { email: 'recepcao@buffetadv.com' });
});

test('recusa domínio diferente do da unidade', () => {
  const { error } = checkUnitEmail('maria@gmail.com', 'Buffet ADV');
  assert.match(error, /@buffetadv\.com/);
});

test('recusa parte local com espaço, símbolo ou vazia', () => {
  for (const email of ['ma ria@buffetadv.com', '@buffetadv.com', 'maria!@buffetadv.com', '.maria@buffetadv.com', 'maria.@buffetadv.com', 'semarroba']) {
    assert.ok(checkUnitEmail(email, 'Buffet ADV').error, email);
  }
});

test('sem domínio definido pela unidade, aceita qualquer domínio válido', () => {
  assert.deepEqual(checkUnitEmail('a@exemplo.com.br', '***'), { email: 'a@exemplo.com.br' });
  assert.ok(checkUnitEmail('a@sem-ponto', '***').error);
});
