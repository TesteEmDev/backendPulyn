const test = require('node:test');
const assert = require('node:assert/strict');
const { criarLimitador, ipDoCliente } = require('../utils/limiteTentativas');

test('barra só depois de passar do máximo de falhas', () => {
  const limite = criarLimitador({ max: 3, janelaMs: 1000 });
  for (let i = 0; i < 2; i++) limite.registrarFalha('a', 0);
  assert.equal(limite.bloqueado('a', 0), false);
  limite.registrarFalha('a', 0);
  assert.equal(limite.bloqueado('a', 0), true);
});

test('cada cliente tem a sua conta', () => {
  const limite = criarLimitador({ max: 1, janelaMs: 1000 });
  limite.registrarFalha('a', 0);
  assert.equal(limite.bloqueado('a', 0), true);
  assert.equal(limite.bloqueado('b', 0), false);
});

test('passada a janela, o cliente volta a poder tentar', () => {
  const limite = criarLimitador({ max: 2, janelaMs: 1000 });
  limite.registrarFalha('a', 0);
  limite.registrarFalha('a', 100);
  assert.equal(limite.bloqueado('a', 500), true);
  assert.equal(limite.bloqueado('a', 1050), false, 'a primeira falha saiu da janela');
  limite.registrarFalha('a', 1050);
  assert.equal(limite.bloqueado('a', 1050), true, 'a falha de 100 ms ainda conta, mais a nova');
  assert.equal(limite.bloqueado('a', 5000), false);
});

test('limpar desbloqueia', () => {
  const limite = criarLimitador({ max: 1, janelaMs: 1000 });
  limite.registrarFalha('a', 0);
  limite.limpar('a');
  assert.equal(limite.bloqueado('a', 0), false);
});

test('a memória não cresce sem limite: chaves antigas são varridas', () => {
  const limite = criarLimitador({ max: 5, janelaMs: 1000, maxChaves: 10 });
  for (let i = 0; i < 10; i++) limite.registrarFalha(`ip-${i}`, 0);
  limite.registrarFalha('novo', 5000); // tudo acima já venceu
  for (let i = 0; i < 10; i++) assert.equal(limite.bloqueado(`ip-${i}`, 5000), false);
});

test('ipDoCliente: sem proxy usa o ip do pedido', () => {
  assert.equal(ipDoCliente({ headers: {}, ip: '10.0.0.5' }), '10.0.0.5');
  assert.equal(ipDoCliente({ headers: {} }), 'desconhecido');
});

test('ipDoCliente: atrás de proxy vale o último endereço (o que o proxy anotou), não o que o cliente mandou', () => {
  assert.equal(ipDoCliente({ headers: { 'x-forwarded-for': '1.2.3.4, 200.10.0.9' }, ip: '10.0.0.1' }), '200.10.0.9');
  assert.equal(ipDoCliente({ headers: { 'x-forwarded-for': ' 200.10.0.9 ' }, ip: '10.0.0.1' }), '200.10.0.9');
});
