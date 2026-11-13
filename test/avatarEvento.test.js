const test = require('node:test');
const assert = require('node:assert/strict');
const { escolherAvatar } = require('../utils/avatarEvento');
const { isAvatarMontado, isAvatarValido, getAvatarForCreate, gerarAvatarMontado, ADVENTURER_AVATAR_IDS } = require('../utils/avatar');

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

const MONTADO = 'pulyn1-02320012000001a';
const MONTADO_B = 'pulyn1-13100230102010b';

test('avatar montado: formato aceito, adulterações recusadas', () => {
  assert.equal(isAvatarMontado(MONTADO), true);
  assert.equal(isAvatarValido(MONTADO), true);
  assert.equal(isAvatarValido(ADVENTURER_AVATAR_IDS[0]), true);
  for (const ruim of ['pulyn1-', 'pulyn1-0232', `${MONTADO}0`, 'pulyn2-02320012000001a', 'pulyn1-0232001200000.a', 'PULYN1-02320012000001A', '<svg/>', '👤', null, undefined, 42]) {
    assert.equal(isAvatarValido(ruim), false, `deveria recusar ${String(ruim)}`);
  }
  assert.equal(getAvatarForCreate(MONTADO), MONTADO);
  assert.equal(getAvatarForCreate('pulyn1-zz'), null);
});

test('avatar montado nunca conflita (só os prontos têm a regra de não repetir)', () => {
  assert.deepEqual(escolherAvatar({ pedido: MONTADO, emUso: [MONTADO, MONTADO_B, 'a'], ids: IDS }), { avatar: MONTADO });
  assert.deepEqual(escolherAvatar({ pedido: MONTADO, emUso: IDS, ids: IDS }), { avatar: MONTADO });
});

test('quem volta mantém o avatar montado do cadastro; avatar montado em uso não ocupa os prontos', () => {
  assert.deepEqual(escolherAvatar({ preferido: MONTADO, emUso: [MONTADO], ids: IDS }), { avatar: MONTADO });
  for (let i = 0; i < 30; i += 1) {
    const { avatar } = escolherAvatar({ emUso: [MONTADO, MONTADO_B], ids: IDS });
    assert.ok(IDS.includes(avatar));
  }
  assert.equal(escolherAvatar({ pedido: 'a', emUso: [MONTADO], ids: IDS }).avatar, 'a');
});

test('avatar sorteado pelo servidor é sempre um avatar montado válido', () => {
  for (let i = 0; i < 300; i += 1) {
    const avatar = gerarAvatarMontado();
    assert.equal(isAvatarMontado(avatar), true, avatar);
    assert.equal(avatar.length, 22);
  }
  assert.equal(isAvatarMontado(gerarAvatarMontado(() => 0.9999)), true);
  assert.equal(isAvatarMontado(gerarAvatarMontado(() => 0)), true);
  assert.equal(isAvatarMontado(getAvatarForCreate(null)), true);
  assert.equal(isAvatarMontado(getAvatarForCreate('')), true);
});

test('sem escolha: o servidor cria um personagem novo (não um dos 20 antigos); o que a criança já tinha continua valendo', () => {
  const novo = escolherAvatar({ emUso: [], ids: IDS, gerarNovo: () => MONTADO }).avatar;
  assert.equal(novo, MONTADO);
  assert.equal(escolherAvatar({ preferido: 'c', emUso: [], ids: IDS, gerarNovo: () => MONTADO }).avatar, 'c');
  // o avatar antigo do cadastro está em uso por outro: entra um personagem novo, sem erro
  assert.equal(escolherAvatar({ preferido: 'a', emUso: ['a'], ids: IDS, gerarNovo: () => MONTADO }).avatar, MONTADO);
  // quem pediu um antigo em uso continua com o conflito de antes
  assert.equal(escolherAvatar({ pedido: 'a', emUso: ['a'], ids: IDS, gerarNovo: () => MONTADO }).conflito, true);
  // as cores (sem gerarNovo) seguem sorteando da lista
  assert.ok(IDS.includes(escolherAvatar({ emUso: ['a'], ids: IDS }).avatar));
});
