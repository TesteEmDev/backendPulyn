const test = require('node:test');
const assert = require('node:assert/strict');
const { calcularBalde, celulasDaGrade, ultimoBaldeFechado, chaveCiclos } = require('../utils/uhfMapa');

const balde = new Date('2026-10-16T18:00:00.000Z');
const anterior = new Date('2026-10-16T17:59:40.000Z');
const antenas = [
  { antenaId: 'a1', leitorId: 'L1', mapaX: 100, mapaY: 100, direcaoGraus: null, raioMetros: 1.2, ativa: true },
  { antenaId: 'a2', leitorId: 'L1', mapaX: 140, mapaY: 100, direcaoGraus: null, raioMetros: 1.2, ativa: true },
  { antenaId: 'b1', leitorId: 'L2', mapaX: 300, mapaY: 200, direcaoGraus: null, raioMetros: 1.2, ativa: true },
  { antenaId: 'sem', leitorId: 'L2', mapaX: null, mapaY: null, raioMetros: 1.2, ativa: true },
];
const amostra = (antenaId, codigo, b = balde, rssiMed = -60) => ({ balde: b, antenaId, codigo, n: 12, ciclos: 16, rssiMed });

test('último balde fechado espera a tolerância de 3 s', () => {
  assert.equal(ultimoBaldeFechado(new Date('2026-10-16T18:00:22.000Z')).toISOString(), '2026-10-16T17:59:40.000Z');
  assert.equal(ultimoBaldeFechado(new Date('2026-10-16T18:00:23.500Z')).toISOString(), '2026-10-16T18:00:00.000Z');
});

test('pulseira vista por duas antenas fica entre elas; leitor sem lote no balde usa o anterior', () => {
  const r = calcularBalde({
    antenas, balde, escala: 0.05,
    amostras: [amostra('a1', '40FE75ABB2191'), amostra('a2', '0000000000040FE75ABB2191'), amostra('b1', 'ABC', anterior)],
  });
  const porCodigo = Object.fromEntries(r.posicoes.map((p) => [p.codigo, p]));
  assert.equal(porCodigo['40FE75ABB2191'].metodo, 'centroide');
  assert.ok(Math.abs(porCodigo['40FE75ABB2191'].x - 120) < 0.01);
  assert.equal(porCodigo.ABC.metodo, 'antena');
  assert.deepEqual([porCodigo.ABC.x, porCodigo.ABC.y], [300, 200]);
});

test('lotes de 0,5 s: a presença usa o total de ciclos do leitor no balde, não só os lotes em que a pulseira apareceu', () => {
  const amostras = [
    { balde, antenaId: 'a1', codigo: 'F1', n: 2, ciclos: 2, rssiMed: -60 },     // lida em 2 dos 40 lotes
    { balde, antenaId: 'a2', codigo: 'F1', n: 40, ciclos: 40, rssiMed: -60 },   // lida em todos
  ];
  const semTotal = calcularBalde({ antenas, balde, escala: 0.05, amostras });
  assert.ok(Math.abs(semTotal.posicoes[0].x - 120) < 0.01, 'sem o total as duas parecem 100% presentes');
  const ciclos = new Map([[chaveCiclos('L1', balde), 40]]);
  const comTotal = calcularBalde({ antenas, balde, escala: 0.05, amostras, ciclos });
  assert.ok(comTotal.posicoes[0].x > 135, `x ${comTotal.posicoes[0].x}`);
});

test('ignora antenas sem posição, amostras velhas e o que o filtro exclui', () => {
  const velho = new Date(balde.getTime() - 40000);
  const r = calcularBalde({
    antenas, balde, escala: 0.05,
    amostras: [amostra('sem', 'AAA'), amostra('a1', 'BBB', velho), amostra('a1', 'CCC'), amostra('a1', 'DDD')],
    incluir: (codigo) => codigo !== 'DDD',
  });
  assert.deepEqual(r.posicoes.map((p) => p.codigo), ['CCC']);
});

test('a grade soma o número de pulseiras e as células vêm na unidade da planta', () => {
  const r = calcularBalde({ antenas, balde, escala: 0.05, amostras: [amostra('a1', 'A'), amostra('b1', 'B')] });
  const total = r.grade.valores.reduce((s, v) => s + v, 0) * r.grade.celula ** 2;
  assert.ok(Math.abs(total - 2) < 0.05, `total ${total}`);
  const { celulas, celulaUnidades } = celulasDaGrade(r.grade, r.escalaM);
  assert.equal(celulaUnidades, 5);
  const maisQuente = celulas.reduce((a, b) => (b.valor > a.valor ? b : a));
  assert.ok(Math.abs(maisQuente.x - 100) <= 5 || Math.abs(maisQuente.x - 300) <= 5);
});
