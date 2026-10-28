const test = require('node:test');
const assert = require('node:assert/strict');
const { eventoAberto, validarPreCadastro } = require('../utils/preCadastroFamilia');

const valido = { eventoId: 'e1', nome: '  Ana  ', apelido: 'Aninha', idade: '6' };

test('dados válidos saem limpos (nome sem espaços, idade como número)', () => {
  assert.deepEqual(validarPreCadastro(valido), {
    ok: true,
    value: { eventoId: 'e1', nome: 'Ana', apelido: 'Aninha', idade: 6 },
  });
});

test('apelido vazio vira null', () => {
  const r = validarPreCadastro({ ...valido, apelido: '   ' });
  assert.equal(r.ok, true);
  assert.equal(r.value.apelido, null);
});

test('sem evento escolhido não cadastra', () => {
  assert.deepEqual(validarPreCadastro({ ...valido, eventoId: '' }), { ok: false, error: 'Escolha o evento' });
});

test('nome obrigatório e limitado a 100 caracteres', () => {
  assert.equal(validarPreCadastro({ ...valido, nome: '  ' }).ok, false);
  assert.equal(validarPreCadastro({ ...valido, nome: 'a'.repeat(101) }).ok, false);
});

test('idade obrigatória e válida', () => {
  assert.deepEqual(validarPreCadastro({ ...valido, idade: undefined, age: undefined }), {
    ok: false,
    error: 'Idade é obrigatória',
  });
  assert.equal(validarPreCadastro({ ...valido, idade: 'abc' }).ok, false);
});

test('evento fechado não aceita pré-cadastro', () => {
  assert.equal(eventoAberto({ status: 'scheduled' }), true);
  assert.equal(eventoAberto({ status: 'active' }), true);
  assert.equal(eventoAberto({ status: 'Finished' }), false);
  assert.equal(eventoAberto({ status: 'cancelled' }), false);
  assert.equal(eventoAberto(null), false);
});
