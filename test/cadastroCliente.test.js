const test = require('node:test');
const assert = require('node:assert/strict');
const { validarCadastroCliente } = require('../utils/cadastroCliente');

const completo = {
  nome: 'Buffet Feliz', cnpj: '11.222.333/0001-81', endereco: 'Rua A, 10', cidade: 'São Paulo', estado: 'sp',
  email: 'contato@buffet.com.br', telefone: '(11) 98765-4321', senha: 'segredo1',
};

test('cadastro completo é aceito e normalizado', () => {
  const r = validarCadastroCliente(completo);
  assert.equal(r.erro, undefined);
  assert.equal(r.valores.cnpj, '11222333000181');
  assert.equal(r.valores.estado, 'SP');
});

test('cada dado é obrigatório', () => {
  for (const campo of Object.keys(completo)) {
    const r = validarCadastroCliente({ ...completo, [campo]: '' });
    assert.ok(r.erro, `faltando ${campo} deveria dar erro`);
  }
});

test('valida CNPJ, UF, e-mail, telefone e senha', () => {
  assert.match(validarCadastroCliente({ ...completo, cnpj: '11.222.333/0001-82' }).erro, /CNPJ/);
  assert.match(validarCadastroCliente({ ...completo, estado: 'XX' }).erro, /Estado/);
  assert.match(validarCadastroCliente({ ...completo, email: 'sem-arroba' }).erro, /E-mail/);
  assert.ok(validarCadastroCliente({ ...completo, telefone: '123' }).erro);
  assert.match(validarCadastroCliente({ ...completo, senha: '123' }).erro, /Senha/);
});
