const test = require('node:test');
const assert = require('node:assert/strict');
const { eventoAberto, validarPreCadastro } = require('../utils/preCadastroFamilia');

const valido = { nome: '  Ana  ', apelido: 'Aninha', idade: '6' };

test('dados válidos saem limpos (nome sem espaços, idade como número)', () => {
  assert.deepEqual(validarPreCadastro(valido), {
    ok: true,
    value: { nome: 'Ana', apelido: 'Aninha', idade: 6, dataNascimento: null },
  });
});

test('apelido vazio vira null', () => {
  const r = validarPreCadastro({ ...valido, apelido: '   ' });
  assert.equal(r.ok, true);
  assert.equal(r.value.apelido, null);
});

test('não exige evento: a criança se vincula a ele depois, pelo autoatendimento', () => {
  assert.equal(validarPreCadastro({ ...valido, eventoId: '' }).ok, true);
});

test('nome obrigatório e limitado a 100 caracteres', () => {
  assert.equal(validarPreCadastro({ ...valido, nome: '  ' }).ok, false);
  assert.equal(validarPreCadastro({ ...valido, nome: 'a'.repeat(101) }).ok, false);
});

test('idade obrigatória e válida', () => {
  assert.deepEqual(validarPreCadastro({ ...valido, idade: undefined, age: undefined }), {
    ok: false,
    error: 'Informe a data de nascimento da criança',
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

test('com data de nascimento, a idade sai dela', () => {
  const r = validarPreCadastro({ ...valido, idade: undefined, dataNascimento: '2016-01-01' });
  assert.equal(r.ok, true);
  assert.equal(r.value.dataNascimento, '2016-01-01');
  assert.ok(r.value.idade >= 9 && r.value.idade <= 11);
});

test('data de nascimento inválida ou futura é recusada; não há limite de idade', () => {
  assert.equal(validarPreCadastro({ ...valido, dataNascimento: '2018-02-30' }).ok, false);
  assert.equal(validarPreCadastro({ ...valido, dataNascimento: '2999-01-01' }).ok, false);
  assert.equal(validarPreCadastro({ ...valido, dataNascimento: '1990-01-01' }).ok, true);
});

test('responsáveis parecidos: ignora acento, maiúscula e sobrenome a mais', () => {
  const { responsaveisParecidos } = require('../utils/preCadastroFamilia');
  assert.equal(responsaveisParecidos('Carlos Almeida', 'carlos  ALMEIDA'), true);
  assert.equal(responsaveisParecidos('José Silva', 'Jose da Silva Santos'), true);
  assert.equal(responsaveisParecidos('Carlos Almeida', 'Carla Almeida'), false);
  assert.equal(responsaveisParecidos('', 'Carlos'), false);
});

test('nome abreviado: primeiro nome inteiro e inicial nas demais palavras', () => {
  const { nomeAbreviado } = require('../utils/perfilCrianca');
  assert.equal(nomeAbreviado('Guilherme Gomes Cavalcanti'), 'Guilherme G. C.');
  assert.equal(nomeAbreviado('  José da Silva  '), 'José S.');
  assert.equal(nomeAbreviado('Ana'), 'Ana');
  assert.equal(nomeAbreviado(''), '');
});
