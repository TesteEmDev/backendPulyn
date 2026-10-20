// utils/uhfMapa.js - Monta o mapa de calor de uma empresa a partir das amostras UHF
//
// `calcularBalde` é puro (testável): recebe antenas e amostras e devolve as posições e a grade de calor.
// `montarMapa` busca no banco e junta os baldes (`juntarBaldes`): "agora" suaviza os 3 últimos baldes de 20 s (onde as
// pulseiras estão); "5min", "30min" e "evento" SOMAM o tempo de cada balde, então um lugar por onde a pulseira só passou
// continua no mapa (o rastro). Cada balde pesa menos quanto mais antigo ele é (pesoDaIdade), mas nunca some: o rastro
// de horas atrás fica com a cor fraca. Não existe relógio varrendo o banco: o mapa é calculado quando alguém pede, com
// cache em memória.
// Assim várias instâncias do backend ligadas ao mesmo banco não repetem trabalho nem disputam nada.
const { queryOne, allQuery } = require('../database');
const { codigoDoEpc, JANELA_MS } = require('./uhfLote');
const { estimarPosicao, sigmaDoMetodo, gradeDeCalor, suavizar, regioesAnonimas, RAIO_PADRAO } = require('./uhfPosicao');

const LARGURA_MAPA = 450;          // mesmo espaço da planta dos checkpoints (components/display/posicaoNoMapa.ts)
const ALTURA_MAPA = 320;
const ESCALA_PADRAO = 0.05;        // sem escala configurada: 450 unidades = 22,5 m
const TOLERANCIA_MS = 3000;        // espera lotes atrasados antes de considerar a janela fechada
const LEITOR_ONLINE_MS = 60000;    // sem lote há mais de 60 s = offline
const CELULAS_MAX = 150000;
const VALOR_MINIMO = 0.02;         // pulseiras/m² abaixo disso não vão para a resposta
const VALOR_MINIMO_RASTRO = 0.002; // minutos/m² nos modos de período: baixo para uma passagem antiga não sumir
// Baldes de 20 s de cada modo. "agora" = onde estão; os outros = tempo somado no período (minutos de pulseira por m²).
// "evento" vai do início do evento (ou RASTRO_MAX_HORAS sem evento iniciado) até agora.
const BALDES_DO_MODO = { agora: 3, '5min': 15, '30min': 90, evento: null };
const MODOS_MAPA = Object.keys(BALDES_DO_MODO);
// Peso de um balde do rastro pela idade: cai pela metade a cada RASTRO_MEIA_VIDA_MIN, mas nunca abaixo de RASTRO_PISO.
const RASTRO_MEIA_VIDA_MIN = 20;
const RASTRO_PISO = 0.1;
const RASTRO_MAX_HORAS = 12;
// Corredor entre antenas: cada mancha do caminho vale meio balde. Duas posições com mais de 3 min entre elas não ligam.
const PESO_CORREDOR = 0.5;
const CORREDOR_MAX_MS = 3 * 60000;

const emMs = (data) => new Date(data).getTime();
const chaveCiclos = (leitorId, balde) => `${String(leitorId).toLowerCase()}|${emMs(balde)}`;

function pesoDaIdade(idadeMs) {
  return Math.max(RASTRO_PISO, 0.5 ** (Math.max(0, idadeMs) / (RASTRO_MEIA_VIDA_MIN * 60000)));
}

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
function calcularBalde({
  antenas, amostras, balde, escala, ciclos = new Map(), incluir = () => true, aceitarAnterior = true, comGrade = true,
}) {
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
    if (!antena || b > alvo || b < alvo - (aceitarAnterior ? JANELA_MS : 0)) continue;
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

  const grade = comGrade ? gradeDeCalor(manchas, { largura: larguraM, altura: alturaM, celula: tamanhoDaCelula(larguraM, alturaM) }) : null;
  return { posicoes, manchas, grade, escalaM, larguraM, alturaM };
}

// Grade (em metros) -> lista de células na unidade da planta, só as que têm valor.
function celulasDaGrade(grade, escalaM, minimo = VALOR_MINIMO) {
  const celulas = [];
  let valorMax = 0;
  grade.valores.forEach((valor, i) => {
    if (valor < minimo) return;
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

// Junta ao trajeto a posição de um balde. Baldes seguidos no mesmo lugar viram um ponto só, de `balde` até `ate`.
function adicionarAoTrajeto(trajeto, balde, posicoes) {
  if (posicoes.length === 0) return;
  const x = Math.round(posicoes[0].x * 10) / 10;
  const y = Math.round(posicoes[0].y * 10) / 10;
  const ultimo = trajeto[trajeto.length - 1];
  if (ultimo && Math.hypot(ultimo.x - x, ultimo.y - y) < 0.5) ultimo.ate = balde.toISOString();
  else trajeto.push({ balde: balde.toISOString(), ate: balde.toISOString(), x, y });
}

// Corredor entre duas posições seguidas da mesma pulseira: a criança andou de uma antena até a outra, então o caminho
// entre elas também ganha calor (sem ele, ela parece se teletransportar). Manchas a cada 3/4 de sigma, sem as pontas.
function manchasDoCorredor(de, para, peso) {
  const sigma = Math.min(de.sigma, para.sigma);
  const distancia = Math.hypot(para.x - de.x, para.y - de.y);
  const n = Math.ceil(distancia / (sigma * 0.75));
  const manchas = [];
  for (let k = 1; k < n; k += 1) {
    manchas.push({ x: de.x + ((para.x - de.x) * k) / n, y: de.y + ((para.y - de.y) * k) / n, sigma, peso });
  }
  return manchas;
}

// Manchas de um balde com o `peso` dele, mais os corredores desde a última posição de cada pulseira (`ultimas`, que
// é atualizado). Vista de novo depois de CORREDOR_MAX_MS, não dá para saber por onde ela foi: sem corredor.
function manchasComCorredores(r, balde, ultimas, peso) {
  const manchas = [];
  r.manchas.forEach((m, i) => {
    manchas.push({ ...m, peso: m.peso * peso });
    const codigo = r.posicoes[i].codigo;
    const anterior = ultimas.get(codigo);
    if (anterior && balde - anterior.balde <= CORREDOR_MAX_MS) manchas.push(...manchasDoCorredor(anterior, m, peso * PESO_CORREDOR));
    ultimas.set(codigo, { ...m, balde });
  });
  return manchas;
}

/**
 * Junta os baldes que terminam em `alvo` (Date) conforme o modo:
 *   'agora': média móvel exponencial dos 3 últimos (onde as pulseiras estão, sem piscar a cada 20 s);
 *   período: soma do tempo de cada balde desde `desde` (modo "evento") ou dos últimos N baldes, em minutos, com o peso
 *   da idade (pesoDaIdade). Sem o "balde anterior" de calcularBalde, que contaria a mesma leitura duas vezes.
 * Nos dois, o caminho entre duas posições seguidas da mesma pulseira também esquenta (manchasComCorredores).
 * Devolve a grade, o balde mais recente (posições atuais) e o trajeto: por onde a pulseira passou, do mais antigo para
 * o mais novo (só faz sentido filtrando uma criança).
 */
function juntarBaldes({ antenas, amostras, ciclos, escala, incluir, alvo, modo = 'agora', desde }) {
  const fim = alvo.getTime();
  const porBalde = new Map();
  for (const s of amostras) {
    const b = emMs(s.balde);
    if (!porBalde.has(b)) porBalde.set(b, []);
    porBalde.get(b).push(s);
  }
  const doBalde = (b, comAnterior) => [...(porBalde.get(b) || []), ...(comAnterior ? porBalde.get(b - JANELA_MS) || [] : [])];
  const atual = calcularBalde({ antenas, amostras: doBalde(fim, true), ciclos, balde: alvo, escala, incluir });
  const trajeto = [];
  const ultimas = new Map();
  const dimensoes = { largura: atual.larguraM, altura: atual.alturaM, celula: tamanhoDaCelula(atual.larguraM, atual.alturaM) };

  if (!BALDES_DO_MODO[modo] && modo !== 'evento') modo = 'agora';
  if (modo === 'agora') {
    let grade = null;
    for (let i = BALDES_DO_MODO.agora - 1; i >= 0; i -= 1) {
      const b = fim - i * JANELA_MS;
      const r = i === 0 ? atual : calcularBalde({ antenas, amostras: doBalde(b, true), ciclos, balde: new Date(b), escala, incluir });
      const manchas = manchasComCorredores(r, b, ultimas, 1);
      grade = suavizar(manchas.length > r.manchas.length ? gradeDeCalor(manchas, dimensoes) : r.grade, grade);
      adicionarAoTrajeto(trajeto, new Date(b), r.posicoes);
    }
    return { grade, atual, trajeto, acumulado: false };
  }

  const inicio = modo === 'evento' && desde
    ? Math.floor(emMs(desde) / JANELA_MS) * JANELA_MS
    : fim - ((BALDES_DO_MODO[modo] || BALDES_DO_MODO['30min']) - 1) * JANELA_MS;
  const baldes = [...porBalde.keys()].filter((b) => b >= inicio && b <= fim).sort((a, b) => a - b);
  const manchas = [];
  for (const b of baldes) {
    const r = calcularBalde({ antenas, amostras: doBalde(b, false), ciclos, balde: new Date(b), escala, incluir, aceitarAnterior: false, comGrade: false });
    manchas.push(...manchasComCorredores(r, b, ultimas, (JANELA_MS / 60000) * pesoDaIdade(fim - b)));
    adicionarAoTrajeto(trajeto, new Date(b), r.posicoes);
  }
  const grade = gradeDeCalor(manchas, dimensoes);
  return { grade, atual, trajeto, acumulado: true };
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

// `codigos`: só essas tags (o mapa de uma criança não precisa ler as amostras de todas as pulseiras do buffet).
async function buscarAmostras(empresaId, desde, ate, codigos = null) {
  if (codigos && codigos.length === 0) return [];
  const params = { empresaId, desde, ate };
  let filtro = '';
  if (codigos) {
    codigos.forEach((codigo, i) => { params[`t${i}`] = codigo; });
    filtro = `AND codigo IN (${codigos.map((_, i) => `@t${i}`).join(', ')})`;
  }
  return allQuery(
    `SELECT balde, antenaId, codigo, n, ciclos, rssiMed
       FROM amostraUhf
      WHERE empresaId = @empresaId AND balde >= @desde AND balde <= @ate ${filtro}`,
    params
  );
}

// Início do rastro do modo "evento": quando o evento começou, limitado a RASTRO_MAX_HORAS antes do alvo.
async function inicioDoRastro(eventoId, alvo) {
  const limite = alvo.getTime() - RASTRO_MAX_HORAS * 3600000;
  const evento = eventoId
    ? await queryOne('SELECT iniciadoEm FROM evento WHERE LOWER(eventoId) = LOWER(@eventoId)', { eventoId })
    : null;
  const iniciadoEm = evento?.iniciadoEm ? emMs(evento.iniciadoEm) : NaN;
  return new Date(Number.isFinite(iniciadoEm) && iniciadoEm > limite && iniciadoEm <= alvo.getTime() ? iniciadoEm : limite);
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
 *   modo: 'agora' (último balde fechado, suavizado com os 2 anteriores) | '5min' | '30min' | 'evento' (tempo somado
 *         no período, o mais antigo com menos peso)
 *   balde: ISO opcional, para rever um momento passado (replay)
 *   eventoId / timeId / criancaId: mostra só as pulseiras dessas crianças (criancaId = o calor de uma criança só)
 */
async function montarMapa(empresaId, { modo = 'agora', balde, eventoId, timeId, criancaId, agora = new Date() } = {}) {
  const alvo = balde ? new Date(Math.floor(emMs(balde) / JANELA_MS) * JANELA_MS) : ultimoBaldeFechado(agora);
  if (!Number.isFinite(alvo.getTime())) throw Object.assign(new Error('balde inválido'), { statusCode: 400 });
  if (!MODOS_MAPA.includes(modo)) modo = 'agora';

  const chave = `${String(empresaId).toLowerCase()}|${modo}|${alvo.toISOString()}|${eventoId || ''}|${timeId || ''}|${criancaId || ''}`;
  const emCache = cache.get(chave);
  if (emCache && emCache.expiraEm > Date.now()) return emCache.valor;

  const inicioEvento = modo === 'evento' ? await inicioDoRastro(eventoId, alvo) : null;
  // Um balde a mais para o "anterior" de cada leitor (posição atual).
  const desde = new Date(Math.min(inicioEvento ? inicioEvento.getTime() : Infinity, alvo.getTime() - (BALDES_DO_MODO[modo] || 1) * JANELA_MS));
  const [antenas, escala, pulseiras, ciclos] = await Promise.all([
    buscarAntenas(empresaId), buscarEscala(empresaId), buscarPulseiras(empresaId), buscarCiclos(empresaId, desde, alvo),
  ]);
  const codigosDaCrianca = criancaId
    ? [...pulseiras].filter(([, p]) => mesmoId(p.criancaId, criancaId)).map(([tag]) => tag)
    : null;
  const amostras = await buscarAmostras(empresaId, desde, alvo, codigosDaCrianca);

  const incluir = filtroDePulseiras(pulseiras, { eventoId, timeId, criancaId });

  const { grade, atual, trajeto, acumulado } = juntarBaldes({ antenas, amostras, ciclos, escala, incluir, alvo, modo, desde: inicioEvento });

  const agoraMs = emMs(agora);
  const { celulas, valorMax, celulaUnidades } = celulasDaGrade(grade, atual.escalaM, acumulado ? VALOR_MINIMO_RASTRO : VALOR_MINIMO);
  const contagemMetodos = atual.posicoes.reduce((acc, p) => ({ ...acc, [p.metodo]: (acc[p.metodo] || 0) + 1 }), {});

  const valor = {
    geradoEm: new Date(agoraMs).toISOString(),
    balde: alvo.toISOString(),
    janelaSeg: JANELA_MS / 1000,
    modo,
    acumulado,   // true: o valor das células é tempo (minutos de pulseira por m², o antigo com menos peso), não pulseiras/m²
    ...(inicioEvento ? { desde: inicioEvento.toISOString() } : {}),
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
    // Por onde a criança andou no período (só com criancaId: as outras rotas não expõem trajetos).
    ...(criancaId ? { trajeto } : {}),
  };

  cache.set(chave, { expiraEm: Date.now() + CACHE_MS, valor });
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  return valor;
}

module.exports = {
  LARGURA_MAPA, ALTURA_MAPA, ESCALA_PADRAO, TOLERANCIA_MS, LEITOR_ONLINE_MS, MODOS_MAPA, pesoDaIdade,
  ultimoBaldeFechado, calcularBalde, juntarBaldes, celulasDaGrade, filtroDePulseiras, montarMapa, invalidarMapa, buscarAntenas, buscarPulseiras,
  buscarCiclos, chaveCiclos,
};
