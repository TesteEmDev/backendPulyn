// utils/zonaDominio.js - Zona (Domínio total, PulynBall): vence a equipe que dominar TODAS as zonas.
//
// Funciona como a Zona por equipe, com as regras da Zona individual aplicadas à equipe:
//   - cada leitura vale pontos (10 x multiplicador crescente) e o checkpoint passa a ser da equipe;
//   - a equipe só relê o MESMO checkpoint depois de ler outros REPETICAO_MINIMA diferentes;
//   - a zona é da equipe quando TODOS os checkpoints dentro dela são dela (mesma regra do mapa do telão).
// Quando uma equipe domina todas as zonas que têm checkpoints, a partida termina e ela vence.
// Os checkpoints não "esfriam" sozinhos neste jogo (a varredura de 1m30s da Zona por equipe não vale aqui).
const { queryOne, allQuery } = require('../database');

const TIPO_ZONA_DOMINIO = 'zone_domination';
const REPETICAO_MINIMA = 3;

function mesmoId(a, b) {
  return Boolean(a) && Boolean(b) && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

async function ehJogoDeDominio(brincadeiraId) {
  if (!brincadeiraId) return false;
  const jogo = await queryOne(
    'SELECT tipo FROM brincadeira WHERE LOWER(brincadeiraId) = LOWER(@brincadeiraId)',
    { brincadeiraId }
  );
  return jogo?.tipo === TIPO_ZONA_DOMINIO;
}

// Zonas do buffet (desenhadas no mapa): [{ id, name, color, x, y, width, height }].
async function zonasDoEvento(eventoId) {
  const linha = await queryOne(
    `SELECT e.dadosZonas FROM empresa e
     INNER JOIN evento v ON v.empresaId = e.empresaId
     WHERE LOWER(v.eventoId) = LOWER(@eventoId)`,
    { eventoId }
  );
  try {
    const zonas = JSON.parse(linha?.dadosZonas || '[]');
    return Array.isArray(zonas) ? zonas.filter((z) => z && Number.isFinite(Number(z.x)) && Number.isFinite(Number(z.width))) : [];
  } catch {
    return [];
  }
}

async function checkpointsDoJogo(eventoId) {
  return allQuery(
    `SELECT checkpointId, nome, mapaX, mapaY, territorioDonoTimeId FROM pontoVerificacao
     WHERE LOWER(eventoId) = LOWER(@eventoId) AND LOWER(COALESCE(proposito, 'game')) <> 'reception'
     ORDER BY criadoEm ASC, nome ASC`,
    { eventoId }
  );
}

/**
 * Situação das zonas: quem é dono de cada uma e se alguma equipe já dominou todas.
 * Só contam as zonas que têm pelo menos um checkpoint dentro (zona vazia não dá para dominar).
 * @returns {Promise<{ zonas: object[], vencedorTimeId: string|null, totalZonas: number }>}
 */
async function situacaoDasZonas(eventoId) {
  const [zonas, checkpoints] = await Promise.all([zonasDoEvento(eventoId), checkpointsDoJogo(eventoId)]);

  const situacao = zonas.map((zona) => {
    const x = Number(zona.x), y = Number(zona.y), w = Number(zona.width), h = Number(zona.height);
    const dentro = checkpoints.filter((cp) => {
      const cx = Number(cp.mapaX), cy = Number(cp.mapaY);
      return Number.isFinite(cx) && Number.isFinite(cy) && cx >= x && cx <= x + w && cy >= y && cy <= y + h;
    });
    const donos = dentro.map((cp) => cp.territorioDonoTimeId).filter(Boolean);
    const todosDoMesmo = dentro.length > 0 && donos.length === dentro.length && donos.every((d) => mesmoId(d, donos[0]));
    return {
      zonaId: String(zona.id ?? zona.name),
      nome: zona.name,
      cor: zona.color || null,
      checkpoints: dentro.map((cp) => cp.checkpointId),
      donoTimeId: todosDoMesmo ? donos[0] : null,
    };
  });

  const comCheckpoints = situacao.filter((z) => z.checkpoints.length > 0);
  const primeiro = comCheckpoints[0]?.donoTimeId;
  const vencedorTimeId = comCheckpoints.length > 0 && primeiro && comCheckpoints.every((z) => mesmoId(z.donoTimeId, primeiro))
    ? primeiro
    : null;
  return { zonas: situacao, vencedorTimeId, totalZonas: comCheckpoints.length };
}

// A equipe pode ler este checkpoint agora? Não se ele estiver entre as últimas leituras da equipe nesta partida.
async function podeLer(partidaId, timeId, checkpointId) {
  const recentes = await allQuery(
    `SELECT checkpointId FROM zonaConquistaLeituraTime
     WHERE partidaId = @partidaId AND timeId = @timeId
     ORDER BY lidoEm DESC
     LIMIT ${REPETICAO_MINIMA}`,
    { partidaId, timeId }
  );
  const posicao = recentes.findIndex((l) => mesmoId(l.checkpointId, checkpointId));
  if (posicao === -1) return { ok: true };
  return {
    ok: false,
    faltam: REPETICAO_MINIMA - posicao,
  };
}

// Pontos de uma leitura da equipe: 10 x (1 + 0,01 por checkpoint já lido), em inteiro.
function pontosDaLeitura(checkpointsLidos) {
  return Math.floor(10 * (1 + checkpointsLidos * 0.01));
}

// A última partida do evento é um Domínio total já decidido? Devolve a equipe vencedora (para negar leituras depois do fim).
async function vencedorDaUltimaPartida(eventoId) {
  const partida = await queryOne(
    `SELECT p.status, p.vencedorTimeId, tm.nome, b.tipo
     FROM zonaConquistaPartidaTime p
     LEFT JOIN brincadeira b ON LOWER(b.brincadeiraId) = LOWER(p.brincadeiraId)
     LEFT JOIN "time" tm ON tm.timeId = p.vencedorTimeId
     WHERE LOWER(p.eventoId) = LOWER(@eventoId)
     ORDER BY p.iniciadoEm DESC LIMIT 1`,
    { eventoId }
  );
  if (!partida || partida.tipo !== TIPO_ZONA_DOMINIO || !partida.vencedorTimeId) return null;
  return { timeId: partida.vencedorTimeId, nome: partida.nome || null };
}

// Resumo para o telão e o painel: placar das equipes, zonas e vencedor.
async function estadoDoDominio(eventoId) {
  const partida = await queryOne(
    `SELECT p.id, p.status, p.brincadeiraId, p.vencedorTimeId, p.iniciadoEm, p.finalizadoEm, b.tipo
     FROM zonaConquistaPartidaTime p
     LEFT JOIN brincadeira b ON LOWER(b.brincadeiraId) = LOWER(p.brincadeiraId)
     WHERE LOWER(p.eventoId) = LOWER(@eventoId)
     ORDER BY p.iniciadoEm DESC LIMIT 1`,
    { eventoId }
  );
  if (!partida || partida.tipo !== TIPO_ZONA_DOMINIO) return { ativo: false };

  const [situacao, equipes] = await Promise.all([
    situacaoDasZonas(eventoId),
    allQuery(
      `SELECT t.timeId, tm.nome, tm.cor, t.pontosTotais, t.checkpointsLidos
       FROM zonaConquistaTempoTime t INNER JOIN "time" tm ON tm.timeId = t.timeId
       WHERE t.partidaId = @partidaId ORDER BY t.pontosTotais DESC, tm.nome ASC`,
      { partidaId: partida.id }
    ),
  ]);

  const nomeDoTime = (id) => equipes.find((e) => mesmoId(e.timeId, id)) || null;
  const equipesComZonas = equipes.map((e) => ({
    timeId: e.timeId,
    nome: e.nome,
    cor: e.cor,
    pontos: Number(e.pontosTotais) || 0,
    checkpointsLidos: Number(e.checkpointsLidos) || 0,
    zonas: situacao.zonas.filter((z) => mesmoId(z.donoTimeId, e.timeId)).length,
  }));
  const vencedor = partida.vencedorTimeId ? nomeDoTime(partida.vencedorTimeId) : null;

  return {
    ativo: true,
    partidaStatus: partida.status === 'active' ? 'em_andamento' : 'finalizada',
    totalZonas: situacao.totalZonas,
    zonas: situacao.zonas.map((z) => ({ ...z, dono: nomeDoTime(z.donoTimeId) ? { timeId: z.donoTimeId, nome: nomeDoTime(z.donoTimeId).nome, cor: nomeDoTime(z.donoTimeId).cor } : null })),
    equipes: equipesComZonas,
    vencedor: vencedor ? { timeId: vencedor.timeId, nome: vencedor.nome, cor: vencedor.cor } : null,
  };
}

module.exports = {
  TIPO_ZONA_DOMINIO,
  REPETICAO_MINIMA,
  ehJogoDeDominio,
  situacaoDasZonas,
  podeLer,
  pontosDaLeitura,
  vencedorDaUltimaPartida,
  estadoDoDominio,
};
