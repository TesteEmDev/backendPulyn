const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calcularBalde, juntarBaldes, pesoDaIdade, celulasDaGrade, ultimoBaldeFechado, chaveCiclos, filtroDePulseiras,
  SEGUNDOS_CORREDOR,
} = require('../utils/uhfMapa');
const { JANELA_MS } = require('../utils/uhfLote');

const balde = new Date('2026-10-16T18:00:00.000Z');
const anterior = new Date(balde.getTime() - JANELA_MS);
const minutosDoBalde = JANELA_MS / 60000;
const antenas = [
  { antenaId: 'a1', leitorId: 'L1', mapaX: 100, mapaY: 100, direcaoGraus: null, raioMetros: 1.2, ativa: true },
  { antenaId: 'a2', leitorId: 'L1', mapaX: 140, mapaY: 100, direcaoGraus: null, raioMetros: 1.2, ativa: true },
  { antenaId: 'b1', leitorId: 'L2', mapaX: 300, mapaY: 200, direcaoGraus: null, raioMetros: 1.2, ativa: true },
  { antenaId: 'sem', leitorId: 'L2', mapaX: null, mapaY: null, raioMetros: 1.2, ativa: true },
];
const amostra = (antenaId, codigo, b = balde, rssiMed = -60) => ({ balde: b, antenaId, codigo, n: 12, ciclos: 16, rssiMed });

test('último balde fechado (janelas de 5 s) espera a tolerância de 3 s', () => {
  assert.equal(JANELA_MS, 5000);
  assert.equal(ultimoBaldeFechado(new Date('2026-10-16T18:00:07.000Z')).toISOString(), '2026-10-16T17:59:55.000Z');
  assert.equal(ultimoBaldeFechado(new Date('2026-10-16T18:00:08.500Z')).toISOString(), '2026-10-16T18:00:00.000Z');
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
  const velho = new Date(balde.getTime() - 2 * JANELA_MS);
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

test('filtro por criança: só a pulseira dela entra (o calor dos pais é só do próprio filho)', () => {
  const pulseiras = new Map([
    ['AAA', { criancaId: 'C1', eventoId: 'E1', timeId: 'T1' }],
    ['BBB', { criancaId: 'C2', eventoId: 'E1', timeId: 'T1' }],
    ['CCC', { criancaId: null }],
  ]);
  const daC1 = filtroDePulseiras(pulseiras, { eventoId: 'e1', criancaId: 'c1' });
  assert.deepEqual(['AAA', 'BBB', 'CCC', 'ZZZ'].map(daC1), [true, false, false, false]);
  assert.deepEqual(['AAA', 'BBB'].map(filtroDePulseiras(pulseiras, { eventoId: 'E2', criancaId: 'C1' })), [false, false]);
  assert.equal(filtroDePulseiras(pulseiras)('ZZZ'), true);
});

// Pulseira 4 baldes na antena a1 e depois 1 balde na a2 (mesmo leitor) (os baldes terminando em `balde`).
const rastro = [0, 1, 2, 3].map((i) => amostra('a1', 'AB1', new Date(balde.getTime() - (4 - i) * JANELA_MS))).concat(amostra('a2', 'AB1'));
const somaPerto = (grade, x, y) => {
  const c = Math.floor(x / grade.celula);
  const l = Math.floor(y / grade.celula);
  return grade.valores[l * grade.colunas + c];
};

const total = (grade) => grade.valores.reduce((soma, v) => soma + v, 0) * grade.celula ** 2;
const iso = (ms) => new Date(ms).toISOString();

test('peso do rastro: metade a cada 20 min, nunca abaixo de 10%', () => {
  assert.equal(pesoDaIdade(0), 1);
  assert.ok(Math.abs(pesoDaIdade(20 * 60000) - 0.5) < 1e-9);
  assert.ok(Math.abs(pesoDaIdade(60 * 60000) - 0.125) < 1e-9);
  assert.equal(pesoDaIdade(3 * 3600000), 0.1);
});

test('modos de período somam o tempo: o lugar por onde a pulseira passou continua no mapa (rastro)', () => {
  const r = juntarBaldes({ antenas, amostras: rastro, escala: 0.05, alvo: balde, modo: '5min' });
  assert.equal(r.acumulado, true);
  const naA1 = somaPerto(r.grade, 5, 5);     // a1 em (100,100) x 0,05 m
  const naA2 = somaPerto(r.grade, 7, 5);     // a2 em (140,100)
  assert.ok(naA2 > 0, 'onde está agora');
  assert.ok(naA1 > naA2, 'ficou mais tempo na a1');
  // Tempo em minutos: 5 baldes, cada um com o peso da idade, mais o corredor da a1 até a a2 (2 m, 4 manchas de
  // SEGUNDOS_CORREDOR cada).
  const pesosA1 = [4, 3, 2, 1].reduce((soma, i) => soma + pesoDaIdade(i * JANELA_MS), 0);
  const esperado = (pesosA1 + 1) * minutosDoBalde + (4 * SEGUNDOS_CORREDOR) / 60;
  assert.ok(Math.abs(total(r.grade) - esperado) < 0.02, `total ${total(r.grade)} (esperado ${esperado})`);
  // Baldes seguidos no mesmo lugar viram um ponto só.
  assert.deepEqual(r.trajeto, [
    { balde: iso(balde.getTime() - 4 * JANELA_MS), ate: iso(balde.getTime() - JANELA_MS), x: 100, y: 100 },
    { balde: balde.toISOString(), ate: balde.toISOString(), x: 140, y: 100 },
  ]);
  assert.deepEqual(r.atual.posicoes.map((p) => p.codigo), ['AB1']);
});

test('o vão entre duas antenas esquenta quando a pulseira vai de uma para a outra (sem teletransporte)', () => {
  // a1 em (5,5) m e b1 em (15,10) m; o meio do caminho fica em (10; 7,5) m, longe das duas.
  const meio = (r) => somaPerto(r.grade, 10, 7.5);
  const seguidas = [amostra('a1', 'AB4', anterior), amostra('b1', 'AB4')];
  for (const modo of ['agora', '5min', 'evento']) {
    const r = juntarBaldes({ antenas, amostras: seguidas, escala: 0.05, alvo: balde, modo, desde: new Date(balde.getTime() - 3600000) });
    assert.ok(meio(r) > 0.01, `${modo}: corredor ${meio(r)}`);
  }
  // Vista de novo só 5 min depois: não dá para saber por onde foi, sem corredor.
  const longe = [amostra('a1', 'AB4', new Date(balde.getTime() - 300000)), amostra('b1', 'AB4')];
  const r = juntarBaldes({ antenas, amostras: longe, escala: 0.05, alvo: balde, modo: '30min' });
  assert.ok(meio(r) < 1e-6, `sem corredor: ${meio(r)}`);
  // Pulseiras diferentes não se ligam.
  const outras = [amostra('a1', 'AB5', anterior), amostra('b1', 'AB6')];
  assert.ok(meio(juntarBaldes({ antenas, amostras: outras, escala: 0.05, alvo: balde, modo: '5min' })) < 1e-6);
});

test('no período, balde sem lote não repete as leituras do anterior', () => {
  const r = juntarBaldes({ antenas, amostras: [amostra('a1', 'AB2', anterior)], escala: 0.05, alvo: balde, modo: '5min' });
  assert.ok(Math.abs(total(r.grade) - pesoDaIdade(JANELA_MS) * minutosDoBalde) < 0.005, `total ${total(r.grade)}`);
  assert.equal(r.trajeto.length, 1);
});

test('"evento": a passagem de 3 h atrás continua no mapa, com 10% do peso', () => {
  const tresHoras = new Date(balde.getTime() - 3 * 3600000);
  const amostras = [amostra('b1', 'AB3', tresHoras), amostra('a1', 'AB3')];   // antenas longe uma da outra
  const r = juntarBaldes({ antenas, amostras, escala: 0.05, alvo: balde, modo: 'evento', desde: new Date(balde.getTime() - 4 * 3600000) });
  assert.ok(Math.abs(somaPerto(r.grade, 15, 10) / somaPerto(r.grade, 5, 5) - 0.1) < 0.001);
  assert.deepEqual(r.trajeto.map((p) => [p.x, p.y]), [[300, 200], [100, 100]]);
  // Antes do início do evento não entra.
  const depois = juntarBaldes({ antenas, amostras, escala: 0.05, alvo: balde, modo: 'evento', desde: new Date(balde.getTime() - 3600000) });
  assert.equal(somaPerto(depois.grade, 15, 10), 0);
  assert.equal(depois.trajeto.length, 1);
});

test('"agora" mostra onde a pulseira está: só o último minuto, com mais peso no balde atual', () => {
  const r = juntarBaldes({ antenas, amostras: rastro, escala: 0.05, alvo: balde, modo: 'agora' });
  assert.equal(r.acumulado, false);
  assert.deepEqual(r.trajeto.map((p) => [p.x, p.y]), [[100, 100], [140, 100]]);
  assert.ok(somaPerto(r.grade, 7, 5) > somaPerto(r.grade, 5, 5));
});
