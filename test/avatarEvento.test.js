const test = require('node:test');
const assert = require('node:assert/strict');
const { escolherAvatar } = require('../utils/avatarEvento');

const IDS = ['a', 'b', 'c', 'd'];

test('sem pedido: sorteia um avatar livre, nunca um em uso', () => {
  for (let i = 0; i < 40; i += 1) {
    const { avatar } = escolherAvatar({ emUso: ['a', 'c'], ids: IDS });
    assert.ok(['b', 'd'].includes(avatar));
  }
  assert.equal(escolherAvatar({ emUso: ['a', 'b', 'c'], ids: IDS }).avatar, 'd');
});

test('pedido livre vale; pedido em uso é conflito e devolve os livres', () => {
  assert.deepEqual(escolherAvatar({ pedido: 'b', emUso: ['a'], ids: IDS }), { avatar: 'b' });
  const r = escolherAvatar({ pedido: 'a', emUso: ['a', 'b'], ids: IDS });
  assert.equal(r.conflito, true);
  assert.deepEqual(r.livres, ['c', 'd']);
});

test('preferido (o que a criança já tinha): fica se estiver livre, senão entra outro livre sem erro', () => {
  assert.deepEqual(escolherAvatar({ preferido: 'c', emUso: ['a'], ids: IDS }), { avatar: 'c' });
  const r = escolherAvatar({ preferido: 'a', emUso: ['a'], ids: IDS });
  assert.equal(r.conflito, undefined);
  assert.ok(['b', 'c', 'd'].includes(r.avatar));
});

test('todos em uso: a repetição é permitida e entra o menos usado', () => {
  assert.deepEqual(escolherAvatar({ pedido: 'b', emUso: ['a', 'b', 'c', 'd'], ids: IDS }), { avatar: 'b' });
  assert.equal(escolherAvatar({ emUso: ['a', 'a', 'b', 'c', 'd', 'd'], ids: IDS }).avatar, 'b');
  assert.equal(escolherAvatar({ emUso: ['a', 'a', 'b', 'b', 'c', 'c', 'd'], ids: IDS }).avatar, 'd');
});

test('preferido fora da lista de avatares (emoji antigo) é ignorado', () => {
  const r = escolherAvatar({ preferido: '👤', emUso: [], ids: IDS });
  assert.ok(IDS.includes(r.avatar));
});
