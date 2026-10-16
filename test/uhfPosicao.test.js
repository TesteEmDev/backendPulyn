const test = require('node:test');
const assert = require('node:assert/strict');
const {
  presenca, distancia, centroDaCobertura, estimarPosicao, gradeDeCalor, suavizar, mediaDeGrades, regioesAnonimas,
} = require('../utils/uhfPosicao');

const limites = { largura: 20, altura: 10 };
const perto = (a, b, tolerancia = 0.05) => Math.abs(a - b) <= tolerancia;

// RSSI que a curva calibrada (rssi1m = -50, expoente 4) dá para a distância d.
const rssiNa = (d) => -50 - 40 * Math.log10(d);
const calibrada = (x, y, d) => ({ x, y, direcaoGraus: null, raioMetros: 6, rssi1m: -50, expoente: 4, n: 16, ciclos: 16, rssiMed: rssiNa(d) });

test('presença é a fração dos ciclos em que a pulseira apareceu', () => {
  assert.equal(presenca({ n: 8, ciclos: 16 }), 0.5);
  assert.equal(presenca({ n: 30, ciclos: 16 }), 1);
});

test('distância usa a calibração quando existe e nunca passa do raio', () => {
  assert.ok(perto(distancia(calibrada(0, 0, 2)), 2, 1e-9));
  assert.equal(distancia({ ...calibrada(0, 0, 10), raioMetros: 1.2 }), 1.2);
  // sem calibração: sinal no mínimo = raio; sinal de referência = 0
  assert.equal(distancia({ raioMetros: 1.2, rssiMed: -75 }), 1.2);
  assert.equal(distancia({ raioMetros: 1.2, rssiMed: -45 }), 0);
});

test('antena no teto: a pulseira fica embaixo dela; na parede: à frente, na direção apontada', () => {
  assert.deepEqual(centroDaCobertura({ x: 3, y: 4, direcaoGraus: null, rssiMed: -60 }), { x: 3, y: 4 });
  const direita = centroDaCobertura({ x: 3, y: 4, direcaoGraus: 90, raioMetros: 1.2, rssiMed: -75 });
  assert.ok(perto(direita.x, 4.2) && perto(direita.y, 4));
  const cima = centroDaCobertura({ x: 3, y: 4, direcaoGraus: 0, raioMetros: 1.2, rssiMed: -75 });
  assert.ok(perto(cima.x, 3) && perto(cima.y, 2.8));
});

test('sem observações não há posição', () => {
  assert.equal(estimarPosicao([], limites), null);
  assert.equal(estimarPosicao([{ x: 1, y: 1, n: 0, ciclos: 16, rssiMed: -60 }], limites), null);
});

test('uma antena: posição da cobertura, confiança baixa', () => {
  const p = estimarPosicao([{ x: 2, y: 3, direcaoGraus: null, n: 16, ciclos: 16, rssiMed: -60 }], limites);
  assert.equal(p.metodo, 'antena');
  assert.deepEqual([p.x, p.y], [2, 3]);
  assert.ok(p.confianca < 0.5);
});

test('duas antenas com o mesmo sinal: centróide no meio', () => {
  const obs = (x) => ({ x, y: 5, direcaoGraus: null, n: 10, ciclos: 16, rssiMed: -60 });
  const p = estimarPosicao([obs(2), obs(4)], limites);
  assert.equal(p.metodo, 'centroide');
  assert.ok(perto(p.x, 3) && perto(p.y, 5));
});

test('três antenas com distâncias exatas: a trilateração acha o ponto', () => {
  const alvo = { x: 1, y: 1 };
  const antenas = [[0, 0], [4, 0], [0, 4]];
  const obs = antenas.map(([x, y]) => calibrada(x, y, Math.hypot(alvo.x - x, alvo.y - y)));
  const p = estimarPosicao(obs, limites);
  assert.equal(p.metodo, 'trilateracao');
  assert.ok(perto(p.x, alvo.x) && perto(p.y, alvo.y), `obteve ${p.x}, ${p.y}`);
});

test('três antenas com distâncias impossíveis: volta para o centróide', () => {
  const obs = [calibrada(0, 0, 0.2), calibrada(10, 0, 0.2), calibrada(0, 8, 0.2)];
  assert.equal(estimarPosicao(obs, limites).metodo, 'centroide');
});

test('a posição nunca sai da planta', () => {
  const p = estimarPosicao([{ x: 19.9, y: 0.1, direcaoGraus: 45, raioMetros: 1.2, n: 16, ciclos: 16, rssiMed: -75 }], limites);
  assert.ok(p.x <= 20 && p.y >= 0);
});

test('grade de calor: a soma da densidade x área da célula é o número de pulseiras', () => {
  const grade = gradeDeCalor([{ x: 5, y: 5, sigma: 0.5, peso: 1 }, { x: 10, y: 5, sigma: 0.5, peso: 1 }], { ...limites, celula: 0.25 });
  const total = grade.valores.reduce((s, v) => s + v, 0) * 0.25 * 0.25;
  assert.equal(grade.colunas, 80);
  assert.equal(grade.linhas, 40);
  assert.ok(perto(total, 2, 0.02), `total ${total}`);
});

test('suavização e média de grades', () => {
  const a = { colunas: 2, linhas: 1, celula: 1, valores: [1, 0] };
  const b = { colunas: 2, linhas: 1, celula: 1, valores: [0, 1] };
  assert.deepEqual(suavizar(a, b, 0.6).valores, [0.6, 0.4]);
  assert.equal(suavizar(a, null), a);
  assert.deepEqual(mediaDeGrades([a, b, null]).valores, [0.5, 0.5]);
  assert.equal(mediaDeGrades([]), null);
});

test('regiões anônimas escondem regiões com menos pulseiras que o mínimo', () => {
  const posicoes = [{ x: 0.5, y: 0.5 }, { x: 1, y: 1 }, { x: 1.5, y: 0.2 }, { x: 9, y: 9 }];
  const regioes = regioesAnonimas(posicoes, { ...limites, tamanho: 2, minimo: 3 });
  assert.deepEqual(regioes, [{ x: 0, y: 0, largura: 2, altura: 2, total: 3 }]);
});

test('calibração acha rssi1m e expoente a partir de medições a distâncias conhecidas', () => {
  const { ajustarCalibracao } = require('../utils/uhfPosicao');
  const medicoes = [0.5, 1, 1.5, 2].map((d) => ({ distancia: d, rssi: rssiNa(d) }));
  assert.deepEqual(ajustarCalibracao(medicoes), { rssi1m: -50, expoente: 4 });
  assert.equal(ajustarCalibracao([{ distancia: 1, rssi: -50 }, { distancia: 1, rssi: -52 }]), null);
  assert.equal(ajustarCalibracao([{ distancia: 0.5, rssi: -60 }, { distancia: 2, rssi: -50 }]), null);
});
