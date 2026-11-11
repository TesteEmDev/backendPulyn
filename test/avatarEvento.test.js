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

const MONTADO = 'pulyn1-abcDEF123456xyz';

test('avatar montado: formato valido e aceito; repetido no evento vira conflito', () => {
  const { isAvatarMontado, isAvatarValido, getAvatarForCreate } = require('../utils/avatar');
  assert.equal(isAvatarMontado(MONTADO), true);
  assert.equal(isAvatarValido(MONTADO), true);
  assert.equal(getAvatarForCreate(MONTADO), MONTADO);
  assert.deepEqual(escolherAvatar({ pedido: MONTADO, emUso: ['a'], ids: IDS }), { avatar: MONTADO });
  // mesmo desenho que outro participante do evento já usa: conflito
  assert.equal(escolherAvatar({ pedido: MONTADO, emUso: [MONTADO, 'a'], ids: IDS }).conflito, true);
  assert.equal(escolherAvatar({ preferido: MONTADO, emUso: ['a'], ids: IDS }).avatar, MONTADO);
});

test('avatar montado: codigos fora do formato sao recusados', () => {
  const { isAvatarValido, getAvatarForCreate } = require('../utils/avatar');
  for (const ruim of ['pulyn1-curto', 'pulyn2-abcDEF123456xyz', 'pulyn1-abcDEF123456xy!', 'pulyn1-abcDEF123456xyzz', '<script>']) {
    assert.equal(isAvatarValido(ruim), false, ruim);
    assert.equal(getAvatarForCreate(ruim), null, ruim);
  }
});
