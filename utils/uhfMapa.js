// utils/uhfMapa.js - Monta o mapa de calor de uma empresa a partir das amostras UHF
//
// `calcularBalde` é puro (testável): recebe antenas e amostras e devolve as posições e a grade de calor.
// `montarMapa` busca no banco e junta os baldes: "agora" suaviza os 3 últimos baldes de 20 s; "5min" faz a média dos
// últimos 15. Não existe relógio varrendo o banco: o mapa é calculado quando alguém pede, com cache em memória.
// Assim várias instâncias do backend ligadas ao mesmo banco não repetem trabalho nem disputam nada.
const { queryOne, allQuery } = require('../database');
const { codigoDoEpc, JANELA_MS } = require('./uhfLote');
const { estimarPosicao, sigmaDoMetodo, gradeDeCalor, suavizar, mediaDeGrades, regioesAnonimas, RAIO_PADRAO } = require('./uhfPosicao');

const LARGURA_MAPA = 450;          // mesmo espaço da planta dos checkpoints (components/display/posicaoNoMapa.ts)
const ALTURA_MAPA = 320;
const ESCALA_PADRAO = 0.05;        // sem escala configurada: 450 unidades = 22,5 m
const TOLERANCIA_MS = 3000;        // espera lotes atrasados antes de considerar a janela fechada
const LEITOR_ONLINE_MS = 60000;    // sem lote há mais de 60 s = offline
const CELULAS_MAX = 150000;
const VALOR_MINIMO = 0.02;         // pulseiras/m² abaixo disso não vão para a resposta

const emMs = (data) => new Date(data).getTime();
const chaveCiclos = (leitorId, balde) => `${String(leitorId).toLowerCase()}|${emMs(balde)}`;

function escalaValida(escala) {
  const valor = Number(escala);
  return Number.isFinite(valor) && valor > 0 ? valor : null;
}

// Célula de 0,25 m, maior se a planta for muito grande.
function tamanhoDaCelula(larguraM, alturaM) {
  return Math.max(0.25, Math.sqrt((larguraM * alturaM) / CELULAS_MAX));
}

// Janela fechada mais recente: a que terminou há pelo menos TOLERANCIA_MS.
function ultimoBaldeFechado(agora = new Date()) {
  const t = emMs(agora) - TOLERANCIA_MS;
  return new Date(Math.floor(t / JANELA_MS) * JANELA_MS - JANELA_MS);
}

/**
 * Posições e grade de um balde. As amostras de cada leitor vêm do balde pedido ou, se o leitor não mandou lote nele
 * (os leitores não são sincronizados), do balde anterior.
 *   antenas:  [{ antenaId, leitorId, mapaX, mapaY, direcaoGraus, raioMetros, rssi1m, expoente, ativa }]
 *   amostras: [{ balde, antenaId, codigo, n, ciclos, rssiMed }]
 *   ciclos:   Map chaveCiclos(leitorId, balde) -> total de ciclos do leitor no balde (buscarCiclos). A amostra só soma
 *             os lotes em que a pulseira apareceu; sem este total, uma pulseira lida em 1 de 40 lotes teria presença 1.
 *   incluir(codigo) -> boolean: filtro opcional (evento, time)
 */
function calcularBalde({ antenas, amostras, balde, escala, ciclos = new Map(), incluir = () => true }) {
  const escalaM = escalaValida(escala) || ESCALA_PADRAO;
  const larguraM = LARGURA_MAPA * escalaM;
  const alturaM = ALTURA_MAPA * escalaM;
  const alvo = emMs(balde);

  const antenaPorId = new Map();
  for (const a of antenas) {
    if (a.ativa === false || a.mapaX === null || a.mapaY === null || a.mapaX === undefined || a.mapaY === undefined) continue;
    antenaPorId.set(String(a.antenaId), a);
  }

  // Balde usado por leitor: o pedido, senão o anterior.
  const baldesPorLeitor = new Map();
  for (const s of amostras) {
    const antena = antenaPorId.get(String(s.antenaId));
    const b = emMs(s.balde);
    if (!antena || b > alvo || b < alvo - JANELA_MS) continue;
    baldesPorLeitor.set(antena.leitorId, Math.max(baldesPorLeitor.get(antena.leitorId) ?? -Infinity, b));
  }

  const observacoesPorCodigo = new Map();
  for (const s of amostras) {
    const antena = antenaPorId.get(String(s.antenaId));
    if (!antena || emMs(s.balde) !== baldesPorLeitor.get(antena.leitorId)) continue;
    const codigo = codigoDoEpc(s.codigo);
    if (!codigo || !incluir(codigo)) continue;
    if (!observacoesPorCodigo.has(codigo)) observacoesPorCodigo.set(codigo, []);
    observacoesPorCodigo.get(codigo).push({
      x: Number(antena.mapaX) * escalaM,
      y: Number(antena.mapaY) * escalaM,
      direcaoGraus: antena.direcaoGraus === null || antena.direcaoGraus === undefined ? null : Number(antena.direcaoGraus),
      raioMetros: Number(antena.raioMetros) || RAIO_PADRAO,
      rssi1m: antena.rssi1m === null || antena.rssi1m === undefined ? null : Number(antena.rssi1m),
      expoente: Number(antena.expoente) || undefined,
      n: Number(s.n),
      ciclos: Math.max(Number(s.ciclos), ciclos.get(chaveCiclos(antena.leitorId, s.balde)) || 0),
      rssiMed: Number(s.rssiMed),
    });
  }

  const posicoes = [];
  const manchas = [];
  for (const [codigo, observacoes] of observacoesPorCodigo) {
    const posicao = estimarPosicao(observacoes, { largura: larguraM, altura: alturaM });
    if (!posicao) continue;
    const raio = observacoes.reduce((soma, o) => soma + o.raioMetros, 0) / observacoes.length;
    manchas.push({ x: posicao.x, y: posicao.y, sigma: sigmaDoMetodo(posicao.metodo, raio), peso: 1 });
    posicoes.push({ codigo, xM: posicao.x, yM: posicao.y, x: posicao.x / escalaM, y: posicao.y / escalaM,
      metodo: posicao.metodo, confianca: posicao.confianca, antenas: posicao.antenas });
  }

  const grade = gradeDeCalor(manchas, { largura: larguraM, altura: alturaM, celula: tamanhoDaCelula(larguraM, alturaM) });
  return { posicoes, grade, escalaM, larguraM, alturaM };
}

// Grade (em metros) -> lista de células na unidade da planta, só as que têm valor.
function celulasDaGrade(grade, escalaM) {
  const celulas = [];
  let valorMax = 0;
  grade.valores.forEach((valor, i) => {
    if (valor < VALOR_MINIMO) return;
    const coluna = i % grade.colunas;
    const linha = Math.floor(i / grade.colunas);
    celulas.push({
      x: Math.round(((coluna + 0.5) * grade.celula) / escalaM * 10) / 10,
      y: Math.round(((linha + 0.5) * grade.celula) / escalaM * 10) / 10,
      valor: Math.round(valor * 1000) / 1000,
    });
    valorMax = Math.max(valorMax, valor);
  });
  return { celulas, valorMax: Math.round(valorMax * 1000) / 1000, celulaUnidades: Math.round((grade.celula / escalaM) * 100) / 100 };
}

// ---------- banco ----------

async function buscarAntenas(empresaId) {
  return allQuery(
    `SELECT a.antenaId, a.leitorId, a.porta, a.nome, a.mapaX, a.mapaY, a.direcaoGraus, a.raioMetros, a.rssi1m, a.expoente,
            a.ativa AND l.ativo AS ativa, l.nome AS leitorNome, l.moduleId, l.ultimoLoteEm
       FROM antenaUhf a JOIN leitorUhf l ON l.leitorId = a.leitorId
      WHERE l.empresaId = @empresaId
      ORDER BY l.nome, a.porta`,
    { empresaId }
  );
}

async function buscarEscala(empresaId) {
  const empresa = await queryOne('SELECT mapaMetrosPorUnidade FROM empresa WHERE empresaId = @empresaId', { empresaId });
  return escalaValida(empresa?.mapaMetrosPorUnidade);
}

// Pulseiras da empresa com a criança vinculada, indexadas pela tag como ela vem do lote (EPC sem zeros à esquerda):
// pelo EPC vinculado em /admin/uhf e também pelo código NFC (padrão antigo: EPC = código com zeros à esquerda).
async function buscarPulseiras(empresaId) {
  const linhas = await allQuery(
    `SELECT p.codigo, p.epc, c.criancaId, c.nome, c.apelido, c.avatar, c.timeId, c.eventoId
       FROM pulseira p LEFT JOIN crianca c ON c.criancaId = p.criancaId
      WHERE p.empresaId = @empresaId`,
    { empresaId }
  );
  const mapa = new Map();
  for (const linha of linhas) {
    const pelaTag = codigoDoEpc(linha.codigo);
    if (pelaTag && !mapa.has(pelaTag)) mapa.set(pelaTag, linha);
  }
  for (const linha of linhas) {
    const pelaTag = linha.epc ? codigoDoEpc(linha.epc) : '';
    if (pelaTag) mapa.set(pelaTag, linha);   // o vínculo explícito ganha do padrão antigo
  }
  return mapa;
}

async function buscarAmostras(empresaId, desde, ate) {
  return allQuery(
    `SELECT balde, antenaId, codigo, n, ciclos, rssiMed
       FROM amostraUhf
      WHERE empresaId = @empresaId AND balde >= @desde AND balde <= @ate`,
    { empresaId, desde, ate }
  );
}

// Total de ciclos de cada leitor em cada balde (soma dos lotes), indexado por chaveCiclos.
async function buscarCiclos(empresaId, desde, ate) {
  const linhas = await allQuery(
    `SELECT l.leitorId, l.balde, SUM(l.ciclos) AS ciclos
       FROM loteUhf l JOIN leitorUhf r ON r.leitorId = l.leitorId
      WHERE r.empresaId = @empresaId AND l.balde >= @desde AND l.balde <= @ate AND l.ciclos IS NOT NULL
      GROUP BY l.leitorId, l.balde`,
    { empresaId, desde, ate }
  );
  return new Map(linhas.map((l) => [chaveCiclos(l.leitorId, l.balde), Number(l.ciclos)]));
}

const mesmoId = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();

// Filtro das tags pelo vínculo pulseira -> criança (evento, time ou uma criança só). Sem filtro, entra tudo.
function filtroDePulseiras(pulseiras, { eventoId, timeId, criancaId } = {}) {
  return (codigo) => {
    if (!eventoId && !timeId && !criancaId) return true;
    const p = pulseiras.get(codigo);
    if (!p || !p.criancaId) return false;
    return (!eventoId || mesmoId(p.eventoId, eventoId)) && (!timeId || mesmoId(p.timeId, timeId))
      && (!criancaId || mesmoId(p.criancaId, criancaId));
  };
}

// Cache: chave -> { expiraEm, valor }. Um lote novo da empresa apaga o cache dela (invalidarMapa).
const cache = new Map();
const CACHE_MS = 5000;

function invalidarMapa(empresaId) {
  const prefixo = `${String(empresaId).toLowerCase()}|`;
  for (const chave of cache.keys()) if (chave.startsWith(prefixo)) cache.delete(chave);
}

/**
 * Mapa da empresa.
 *   modo: 'agora' (último balde fechado, suavizado com os 2 anteriores) | '5min' (média dos últimos 15 baldes)
 *   balde: ISO opcional, para rever um momento passado (replay)
 *   eventoId / timeId / criancaId: mostra só as pulseiras dessas crianças (criancaId = o calor de uma criança só)
 */
async function montarMapa(empresaId, { modo = 'agora', balde, eventoId, timeId, criancaId, agora = new Date() } = {}) {
  const alvo = balde ? new Date(Math.floor(emMs(balde) / JANELA_MS) * JANELA_MS) : ultimoBaldeFechado(agora);
  if (!Number.isFinite(alvo.getTime())) throw Object.assign(new Error('balde inválido'), { statusCode: 400 });
  const quantos = modo === '5min' ? 15 : 3;

  const chave = `${String(empresaId).toLowerCase()}|${modo}|${alvo.toISOString()}|${eventoId || ''}|${timeId || ''}|${criancaId || ''}`;
  const emCache = cache.get(chave);
  if (emCache && emCache.expiraEm > Date.now()) return emCache.valor;

  const desde = new Date(alvo.getTime() - quantos * JANELA_MS);   // um balde a mais para o "anterior" de cada leitor
  const [antenas, escala, pulseiras, amostras, ciclos] = await Promise.all([
    buscarAntenas(empresaId), buscarEscala(empresaId), buscarPulseiras(empresaId), buscarAmostras(empresaId, desde, alvo),
    buscarCiclos(empresaId, desde, alvo),
  ]);

  const incluir = filtroDePulseiras(pulseiras, { eventoId, timeId, criancaId });

  // Do balde mais antigo para o mais novo.
  const resultados = [];
  for (let i = quantos - 1; i >= 0; i -= 1) {
    resultados.push(calcularBalde({ antenas, amostras, ciclos, balde: new Date(alvo.getTime() - i * JANELA_MS), escala, incluir }));
  }
  const atual = resultados[resultados.length - 1];
  const grade = modo === '5min'
    ? mediaDeGrades(resultados.map((r) => r.grade))
    : resultados.reduce((anterior, r) => suavizar(r.grade, anterior), null);

  const agoraMs = emMs(agora);
  const { celulas, valorMax, celulaUnidades } = celulasDaGrade(grade, atual.escalaM);
  const contagemMetodos = atual.posicoes.reduce((acc, p) => ({ ...acc, [p.metodo]: (acc[p.metodo] || 0) + 1 }), {});

  const valor = {
    geradoEm: new Date(agoraMs).toISOString(),
    balde: alvo.toISOString(),
    janelaSeg: JANELA_MS / 1000,
    modo,
    proximaAtualizacaoEm: new Date(alvo.getTime() + 2 * JANELA_MS + TOLERANCIA_MS).toISOString(),
    largura: LARGURA_MAPA,
    altura: ALTURA_MAPA,
    escalaMetrosPorUnidade: atual.escalaM,
    escalaPadrao: !escala,
    celulaUnidades,
    valorMax,
    celulas,
    antenas: antenas.map((a) => ({
      antenaId: a.antenaId, leitorId: a.leitorId, leitorNome: a.leitorNome, moduleId: a.moduleId, porta: Number(a.porta),
      nome: a.nome, mapaX: a.mapaX === null ? null : Number(a.mapaX), mapaY: a.mapaY === null ? null : Number(a.mapaY),
      direcaoGraus: a.direcaoGraus === null ? null : Number(a.direcaoGraus), raioMetros: Number(a.raioMetros),
      ativa: Boolean(a.ativa),
      online: Boolean(a.ultimoLoteEm) && agoraMs - emMs(a.ultimoLoteEm) <= LEITOR_ONLINE_MS,
    })),
    // Posição individual: a rota decide quem pode ver (nunca vai para os pais, a não ser a do próprio filho).
    criancas: atual.posicoes.map((p) => {
      const pulseira = pulseiras.get(p.codigo);
      return {
        codigo: pulseira?.codigo || p.codigo, tag: p.codigo, criancaId: pulseira?.criancaId || null, nome: pulseira?.apelido || pulseira?.nome || null,
        avatar: pulseira?.avatar || null, timeId: pulseira?.timeId || null, eventoId: pulseira?.eventoId || null,
        x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, metodo: p.metodo, confianca: p.confianca, antenas: p.antenas,
      };
    }),
    // Para a visão anônima (pais): regiões de 2 m com pelo menos 3 pulseiras.
    regioes: regioesAnonimas(atual.posicoes.map((p) => ({ x: p.xM, y: p.yM })), { largura: atual.larguraM, altura: atual.alturaM })
      .map((r) => ({ x: r.x / atual.escalaM, y: r.y / atual.escalaM, largura: r.largura / atual.escalaM, altura: r.altura / atual.escalaM, total: r.total })),
    totais: { pulseirasVistas: atual.posicoes.length, porMetodo: contagemMetodos },
  };

  cache.set(chave, { expiraEm: Date.now() + CACHE_MS, valor });
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  return valor;
}

module.exports = {
  LARGURA_MAPA, ALTURA_MAPA, ESCALA_PADRAO, TOLERANCIA_MS, LEITOR_ONLINE_MS,
  ultimoBaldeFechado, calcularBalde, celulasDaGrade, filtroDePulseiras, montarMapa, invalidarMapa, buscarAntenas, buscarPulseiras,
  buscarCiclos, chaveCiclos,
};
