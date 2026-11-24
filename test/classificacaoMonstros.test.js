// Caça ao Monstro: quem derrotou primeiro vence; as outras equipes pela vida que sobrou no monstro (menos = melhor).
const test = require('node:test');
const assert = require('node:assert/strict');
const { classificacaoDosMonstros } = require('../utils/classificacaoMonstros');

test('quem derrotou o monstro vem primeiro; as outras pela vida restante, da menor para a maior', () => {
  const ordem = classificacaoDosMonstros([
    { timeId: 'azul', vida: 320, derrotadoEm: null },
    { timeId: 'verde', vida: 0, derrotadoEm: '2026-11-24T10:00:05Z' },
    { timeId: 'roxa', vida: 40, derrotadoEm: null },
    { timeId: 'rosa', vida: 500, derrotadoEm: null },
  ]);
  assert.deepEqual(ordem.map((o) => o.teamId), ['verde', 'roxa', 'azul', 'rosa']);
});

test('monstros com a mesma vida restante ficam empatados (mesma chave)', () => {
  const ordem = classificacaoDosMonstros([
    { timeId: 'a', vida: 100, derrotadoEm: null },
    { timeId: 'b', vida: 100, derrotadoEm: null },
    { timeId: 'c', vida: 250, derrotadoEm: null },
  ]);
  assert.equal(ordem[0].chave, ordem[1].chave);
  assert.notEqual(ordem[1].chave, ordem[2].chave);
  assert.equal(ordem[2].teamId, 'c');
});

test('duas derrotas: a mais rápida na frente', () => {
  const ordem = classificacaoDosMonstros([
    { timeId: 'lenta', vida: 0, derrotadoEm: '2026-11-24T10:00:09Z' },
    { timeId: 'rapida', vida: 0, derrotadoEm: '2026-11-24T10:00:02Z' },
  ]);
  assert.deepEqual(ordem.map((o) => o.teamId), ['rapida', 'lenta']);
});
