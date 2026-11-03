const test = require('node:test');
const assert = require('node:assert/strict');
const { escolherLider } = require('../utils/winnerBonus');

test('líder da parada forçada: o maior valor, sem empate no topo', () => {
  assert.equal(escolherLider([{ teamId: 'A', valor: 2 }, { teamId: 'B', valor: 5 }, { teamId: 'C', valor: 1 }]), 'B');
  assert.equal(escolherLider([{ teamId: 'A', valor: 1 }]), 'A');
});

test('ninguém avançou ou empate no topo: sem líder', () => {
  assert.equal(escolherLider([]), null);
  assert.equal(escolherLider([{ teamId: 'A', valor: 0 }, { teamId: 'B', valor: 0 }]), null);
  assert.equal(escolherLider([{ teamId: 'A', valor: 3 }, { teamId: 'B', valor: 3 }, { teamId: 'C', valor: 1 }]), null);
});

test('empate fora do topo não atrapalha', () => {
  assert.equal(escolherLider([{ teamId: 'A', valor: 4 }, { teamId: 'B', valor: 2 }, { teamId: 'C', valor: 2 }]), 'A');
});
