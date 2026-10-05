const test = require('node:test');
const assert = require('node:assert/strict');
const { parseUnitProfile } = require('../utils/unitProfile');

test('aceita um perfil completo e normaliza espaços', () => {
  const { values, error } = parseUnitProfile({
    name: '  Buffet Alegria ',
    email: ' contato@alegria.com.br ',
    phone: '(11) 91234-5678',
    address: ' Rua das Flores, 10 ',
    backupFrequency: 'weekly',
  });
  assert.equal(error, undefined);
  assert.deepEqual(values, {
    name: 'Buffet Alegria',
    email: 'contato@alegria.com.br',
    phone: '(11) 91234-5678',
    address: 'Rua das Flores, 10',
    backupFrequency: 'weekly',
  });
});

test('só valida os campos enviados (atualização parcial)', () => {
  assert.deepEqual(parseUnitProfile({ address: 'Rua A' }).values, { address: 'Rua A' });
  assert.deepEqual(parseUnitProfile({}).values, {});
});

test('nome e e-mail não podem ficar vazios (colunas obrigatórias em clientes)', () => {
  assert.ok(parseUnitProfile({ name: '   ' }).error);
  assert.ok(parseUnitProfile({ email: '' }).error);
});

test('rejeita e-mail inválido, nome longo e frequência desconhecida', () => {
  assert.ok(parseUnitProfile({ email: 'sem-arroba' }).error);
  assert.ok(parseUnitProfile({ email: 'a@b' }).error);
  assert.ok(parseUnitProfile({ name: 'x'.repeat(101) }).error);
  assert.ok(parseUnitProfile({ backupFrequency: 'a cada minuto' }).error);
});

test('telefone: vazio é permitido; quantidade de dígitos errada é recusada', () => {
  assert.equal(parseUnitProfile({ phone: '' }).error, undefined);
  assert.equal(parseUnitProfile({ phone: '1134567890' }).error, undefined);
  assert.ok(parseUnitProfile({ phone: '119948756' }).error);
  assert.ok(parseUnitProfile({ phone: '(11) 81234-5678' }).error);
});

test('rejeita corpo que não é objeto', () => {
  assert.ok(parseUnitProfile(null).error);
  assert.ok(parseUnitProfile([]).error);
});
