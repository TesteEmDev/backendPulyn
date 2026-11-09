const test = require('node:test');
const assert = require('node:assert/strict');
const { sortearMonstros, TIPOS, MONSTROS } = require('../utils/sorteioMonstros');

const equipes = (n, cor = '#2196F3') => Array.from({ length: n }, (_, i) => ({ timeId: `t${i}`, cor }));

test('até 6 equipes: nenhum monstro se repete', () => {
  for (let n = 1; n <= 6; n += 1) {
    for (let rodada = 0; rodada < 50; rodada += 1) {
      const r = sortearMonstros(equipes(n));
      assert.equal(new Set([...r.values()].map((m) => m.tipo)).size, n);
    }
  }
});

test('cada equipe recebe um tipo e uma cor que existem', () => {
  for (const { tipo, cor } of sortearMonstros(equipes(6)).values()) {
    assert.ok(TIPOS.includes(tipo));
    assert.ok(Object.keys(MONSTROS[tipo]).includes(cor));
  }
});

test('com mais de 6 equipes os tipos voltam, mas nunca a mesma combinação de tipo e cor', () => {
  for (let n = 7; n <= 18; n += 1) {
    const r = sortearMonstros(equipes(n));
    assert.equal(new Set([...r.values()].map((m) => `${m.tipo}|${m.cor}`)).size, n, `${n} equipes`);
  }
});

test('a cor do monstro acompanha a cor da equipe quando dá', () => {
  const vermelho = sortearMonstros([{ timeId: 'a', cor: '#FF0000' }], () => 0).get('a');
  assert.ok(['vermelho', 'fogo'].includes(vermelho.cor), vermelho.cor);
  const azul = sortearMonstros([{ timeId: 'a', cor: '#0000FF' }], () => 0.5).get('a');
  assert.ok(['azul', 'gelo', 'roxo', 'ametista'].includes(azul.cor), azul.cor);
});

test('o sorteio muda de um jogo para outro', () => {
  const vistos = new Set();
  for (let i = 0; i < 40; i += 1) vistos.add(sortearMonstros(equipes(3)).get('t0').tipo);
  assert.ok(vistos.size > 1);
});

test('equipe sem cor válida ainda recebe um monstro', () => {
  const r = sortearMonstros([{ timeId: 'a', cor: null }, { timeId: 'b', cor: 'xyz' }]);
  assert.equal(r.size, 2);
});
