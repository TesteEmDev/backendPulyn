// utils/uhfPosicao.js - Da leitura UHF à posição e ao mapa de calor (funções puras, tudo em METROS)
//
// Uma observação é o resumo de uma pulseira numa antena durante uma janela de 20 s:
//   { x, y, direcaoGraus, raioMetros, rssi1m, expoente, n, ciclos, rssiMed }
//   x, y          posição da antena em metros (o mapa converte as unidades da planta com a escala da empresa)
//   direcaoGraus  para onde a antena aponta no mapa (0 = para cima, 90 = direita); null = teto, apontando para baixo
//   n / ciclos    em quantos ciclos de 1,2 s a pulseira apareceu nessa antena (taxa de presença)
// O RSSI de uma pulseira no pulso varia muito com a orientação; por isso a taxa de presença pesa tanto quanto o RSSI.
//
// Níveis de estimativa:
//   1 antena    -> centro da área de cobertura dela ("antena")
//   2 antenas   -> média ponderada pela potência ("centroide")
//   3+ antenas  -> trilateração por mínimos quadrados; se o erro ficar alto, volta para o centróide ("trilateracao")

const RSSI_MIN_PADRAO = -75;   // abaixo disso é ruído
const RSSI_REF_PADRAO = -45;   // pulseira encostada na antena
const EXPOENTE_PADRAO = 4;     // tag passiva: o sinal vai e volta, cai com d^4
const RAIO_PADRAO = 1.2;       // alcance medido com a pulseira alinhada

const limitar = (valor, min, max) => Math.min(max, Math.max(min, valor));

function presenca(obs) {
  const ciclos = Number(obs.ciclos) > 0 ? Number(obs.ciclos) : 1;
  return limitar(Number(obs.n) / ciclos, 0, 1);
}

// 0 (sinal no mínimo) a 1 (sinal de referência, pulseira encostada).
function qualidadeRssi(rssi, { rssiMin = RSSI_MIN_PADRAO, rssiRef = RSSI_REF_PADRAO } = {}) {
  return limitar((Number(rssi) - rssiMin) / (rssiRef - rssiMin), 0, 1);
}

// Peso da observação: presença x qualidade do sinal (nunca zero se a pulseira foi lida).
function forca(obs, opcoes) {
  return presenca(obs) * limitar(qualidadeRssi(obs.rssiMed, opcoes), 0.1, 1);
}

// Distância estimada até a antena. Com calibração (rssi1m) usa a curva de perda; sem ela, uma escala linear do RSSI.
function distancia(obs, opcoes) {
  const raio = Number(obs.raioMetros) > 0 ? Number(obs.raioMetros) : RAIO_PADRAO;
  if (Number.isFinite(Number(obs.rssi1m)) && obs.rssi1m !== null) {
    const expoente = Number(obs.expoente) > 0 ? Number(obs.expoente) : EXPOENTE_PADRAO;
    return limitar(10 ** ((Number(obs.rssi1m) - Number(obs.rssiMed)) / (10 * expoente)), 0, raio);
  }
  return raio * (1 - qualidadeRssi(obs.rssiMed, opcoes));
}

// Onde a pulseira provavelmente está, vista só por esta antena.
// Teto: embaixo da antena. Parede: à frente dela, na distância estimada.
function centroDaCobertura(obs, opcoes) {
  if (obs.direcaoGraus === null || obs.direcaoGraus === undefined || obs.direcaoGraus === '') {
    return { x: Number(obs.x), y: Number(obs.y) };
  }
  const raio = Number(obs.raioMetros) > 0 ? Number(obs.raioMetros) : RAIO_PADRAO;
  // Mesmo com sinal forte a pulseira está à frente da antena, não em cima dela: no mínimo 1/4 do raio.
  const d = Math.max(distancia(obs, opcoes), raio / 4);
  const angulo = (Number(obs.direcaoGraus) * Math.PI) / 180;
  return { x: Number(obs.x) + Math.sin(angulo) * d, y: Number(obs.y) - Math.cos(angulo) * d };
}

// Média ponderada pela potência linear (10^(dBm/10)) e pela presença.
function centroide(observacoes, opcoes) {
  let somaPeso = 0, x = 0, y = 0;
  for (const obs of observacoes) {
    const centro = centroDaCobertura(obs, opcoes);
    const peso = 10 ** (Number(obs.rssiMed) / 10) * presenca(obs);
    somaPeso += peso; x += centro.x * peso; y += centro.y * peso;
  }
  if (!somaPeso) return null;
  return { x: x / somaPeso, y: y / somaPeso };
}

// Mínimos quadrados Σ wᵢ(|p − aᵢ| − dᵢ)² por Gauss-Newton, a partir de `inicio`. Devolve a posição e o erro médio (m).
function trilaterar(observacoes, inicio, opcoes) {
  const pontos = observacoes.map((obs) => ({
    x: Number(obs.x), y: Number(obs.y), d: distancia(obs, opcoes), w: Math.max(forca(obs, opcoes), 0.05),
  }));
  let px = inicio.x, py = inicio.y;
  for (let iteracao = 0; iteracao < 15; iteracao += 1) {
    let a11 = 0, a12 = 0, a22 = 0, b1 = 0, b2 = 0;
    for (const p of pontos) {
      const dx = px - p.x, dy = py - p.y;
      const r = Math.hypot(dx, dy) || 1e-6;
      const residuo = r - p.d;
      const jx = dx / r, jy = dy / r;
      a11 += p.w * jx * jx; a12 += p.w * jx * jy; a22 += p.w * jy * jy;
      b1 += p.w * jx * residuo; b2 += p.w * jy * residuo;
    }
    const det = a11 * a22 - a12 * a12;
    if (Math.abs(det) < 1e-9) break;
    const passoX = (a22 * b1 - a12 * b2) / det;
    const passoY = (a11 * b2 - a12 * b1) / det;
    px -= passoX; py -= passoY;
    if (Math.hypot(passoX, passoY) < 1e-4) break;
  }
  const erro = Math.sqrt(pontos.reduce((soma, p) => soma + (Math.hypot(px - p.x, py - p.y) - p.d) ** 2, 0) / pontos.length);
  return { x: px, y: py, erro };
}

/**
 * Posição de uma pulseira a partir das observações dela na janela.
 * `limites` = { largura, altura } em metros; a posição nunca sai da planta.
 * Devolve { x, y, metodo, confianca, antenas } ou null sem observações.
 */
function estimarPosicao(observacoes, limites, opcoes = {}) {
  const lista = (observacoes || []).filter((obs) => Number(obs.n) > 0);
  if (lista.length === 0) return null;

  const presencaMax = Math.max(...lista.map(presenca));
  let posicao, metodo, confianca;

  if (lista.length === 1) {
    posicao = centroDaCobertura(lista[0], opcoes);
    metodo = 'antena';
    confianca = 0.35 * presencaMax;
  } else {
    const media = centroide(lista, opcoes);
    posicao = media; metodo = 'centroide'; confianca = 0.6 * presencaMax;
    if (lista.length >= 3) {
      const tri = trilaterar(lista, media, opcoes);
      const raioMedio = lista.reduce((s, obs) => s + (Number(obs.raioMetros) || RAIO_PADRAO), 0) / lista.length;
      const aceitavel = Number.isFinite(tri.x) && Number.isFinite(tri.y) && tri.erro <= Math.max(0.5, raioMedio / 2)
        && Math.hypot(tri.x - media.x, tri.y - media.y) <= raioMedio * 2;
      if (aceitavel) { posicao = tri; metodo = 'trilateracao'; confianca = 0.85 * presencaMax; }
    }
  }

  const largura = Number(limites?.largura) || Infinity;
  const altura = Number(limites?.altura) || Infinity;
  return {
    x: limitar(posicao.x, 0, largura),
    y: limitar(posicao.y, 0, altura),
    metodo,
    confianca: Math.round(confianca * 100) / 100,
    antenas: lista.length,
  };
}

// Espalhamento da mancha de cada pulseira no mapa de calor (m): mais incerteza, mancha maior.
function sigmaDoMetodo(metodo, raio = RAIO_PADRAO) {
  if (metodo === 'trilateracao') return Math.max(0.3, raio / 4);
  if (metodo === 'centroide') return Math.max(0.4, raio / 3);
  return Math.max(0.5, raio / 2);
}

/**
 * Grade de densidade (pulseiras por m²). Cada mancha é uma gaussiana { x, y, sigma, peso } normalizada:
 * a soma da grade × área da célula ≈ número de pulseiras. Só calcula até 3 sigmas de cada mancha.
 */
function gradeDeCalor(manchas, { largura, altura, celula = 0.25 }) {
  const colunas = Math.max(1, Math.ceil(largura / celula));
  const linhas = Math.max(1, Math.ceil(altura / celula));
  const valores = new Array(colunas * linhas).fill(0);
  for (const m of manchas) {
    const sigma = Math.max(Number(m.sigma) || 0.5, celula / 2);
    const fator = (Number(m.peso) || 0) / (2 * Math.PI * sigma * sigma);
    if (!fator) continue;
    const alcance = 3 * sigma;
    const c0 = Math.max(0, Math.floor((m.x - alcance) / celula));
    const c1 = Math.min(colunas - 1, Math.floor((m.x + alcance) / celula));
    const l0 = Math.max(0, Math.floor((m.y - alcance) / celula));
    const l1 = Math.min(linhas - 1, Math.floor((m.y + alcance) / celula));
    for (let l = l0; l <= l1; l += 1) {
      const cy = (l + 0.5) * celula - m.y;
      for (let c = c0; c <= c1; c += 1) {
        const cx = (c + 0.5) * celula - m.x;
        valores[l * colunas + c] += fator * Math.exp(-(cx * cx + cy * cy) / (2 * sigma * sigma));
      }
    }
  }
  return { colunas, linhas, celula, valores };
}

// Média móvel exponencial entre duas grades do mesmo tamanho (evita o mapa "piscar" a cada 20 s).
function suavizar(atual, anterior, alpha = 0.6) {
  if (!anterior || anterior.valores.length !== atual.valores.length) return atual;
  return { ...atual, valores: atual.valores.map((v, i) => alpha * v + (1 - alpha) * anterior.valores[i]) };
}

// Média de várias grades do mesmo tamanho (ex.: últimos 5 minutos).
function mediaDeGrades(grades) {
  const validas = grades.filter(Boolean);
  if (validas.length === 0) return null;
  const base = validas[0];
  const valores = base.valores.map((_, i) => validas.reduce((soma, g) => soma + (g.valores[i] || 0), 0) / validas.length);
  return { ...base, valores };
}

// Contagem anônima por região quadrada de `tamanho` m: regiões com menos de `minimo` pulseiras somem.
function regioesAnonimas(posicoes, { largura, altura, tamanho = 2, minimo = 3 }) {
  const colunas = Math.max(1, Math.ceil(largura / tamanho));
  const contagem = new Map();
  for (const p of posicoes) {
    const c = Math.min(colunas - 1, Math.floor(p.x / tamanho));
    const l = Math.floor(p.y / tamanho);
    const chave = l * colunas + c;
    contagem.set(chave, (contagem.get(chave) || 0) + 1);
  }
  return [...contagem.entries()]
    .filter(([, total]) => total >= minimo)
    .map(([chave, total]) => ({
      x: (chave % colunas) * tamanho, y: Math.floor(chave / colunas) * tamanho,
      largura: tamanho, altura: Math.min(tamanho, altura - Math.floor(chave / colunas) * tamanho), total,
    }));
}

module.exports = {
  RSSI_MIN_PADRAO, RSSI_REF_PADRAO, EXPOENTE_PADRAO, RAIO_PADRAO,
  presenca, qualidadeRssi, forca, distancia, centroDaCobertura, centroide, trilaterar, estimarPosicao,
  sigmaDoMetodo, gradeDeCalor, suavizar, mediaDeGrades, regioesAnonimas,
};
