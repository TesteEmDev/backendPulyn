// utils/zonaDominio.js - Zona (Domínio total, PulynBall): vence a equipe que dominar TODOS os checkpoints do jogo.
//
// Funciona como a Zona por equipe, com as regras da Zona individual aplicadas à equipe:
//   - cada leitura vale pontos (10 x multiplicador crescente) e o checkpoint passa a ser da equipe;
//   - a equipe só relê o MESMO checkpoint depois de ler outros REPETICAO_MINIMA diferentes;
//   - quando uma equipe é dona de todos os checkpoints do jogo, a partida termina, ela vence e o jogo é encerrado
//     sozinho depois de alguns segundos (tempo de o telão e os checkpoints mostrarem/tocarem a vitória).
// Os checkpoints não "esfriam" sozinhos neste jogo (a varredura de 1m30s da Zona por equipe não vale aqui).
// Os checkpoints do jogo são os marcados no jogo (sem lista, todos os checkpoints de jogo do evento).
const { queryOne, allQuery } = require('../database');
const bomba = require('./bomba');

const TIPO_ZONA_DOMINIO = 'zone_domination';
const REPETICAO_MINIMA = 3;
const ENCERRAR_APOS_MS = 20000;   // vitória na tela e nos checkpoints antes de o jogo parar

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

// Checkpoints que valem neste jogo, com dono atual, na ordem do ID que o recreacionista deu.
async function checkpointsDoJogo(eventoId, brincadeiraId) {
  const ids = await bomba.locaisDoJogo(eventoId, brincadeiraId);
  if (ids.length === 0) return [];
  const linhas = await allQuery(
    `SELECT checkpointId, codigo, nome, territorioDonoTimeId FROM pontoVerificacao
     WHERE LOWER(eventoId) = LOWER(@eventoId) AND LOWER(COALESCE(proposito, 'game')) <> 'reception'`,
    { eventoId }
  );
  const porId = new Map(linhas.map((l) => [String(l.checkpointId).toLowerCase(), l]));
  return ids
    .map((id) => porId.get(String(id).toLowerCase()))
    .filter(Boolean)
    .sort((a, b) => String(a.codigo || a.checkpointId).localeCompare(String(b.codigo || b.checkpointId), 'pt-BR', { numeric: true, sensitivity: 'base' }));
}

async function checkpointEhDoJogo(eventoId, brincadeiraId, checkpointId) {
  const lista = await checkpointsDoJogo(eventoId, brincadeiraId);
  return lista.some((c) => mesmoId(c.checkpointId, checkpointId));
}

/**
 * Situação do jogo: quem é dono de cada checkpoint e se alguma equipe já dominou todos.
 * @returns {Promise<{ checkpoints: object[], vencedorTimeId: string|null }>}
 */
async function situacaoDosCheckpoints(eventoId, brincadeiraId) {
  const checkpoints = await checkpointsDoJogo(eventoId, brincadeiraId);
  const donos = checkpoints.map((c) => c.territorioDonoTimeId);
  const primeiro = donos[0];
  const todosDoMesmo = checkpoints.length > 0 && donos.every((d) => d && mesmoId(d, primeiro));
  return { checkpoints, vencedorTimeId: todosDoMesmo ? primeiro : null };
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

async function ultimaPartida(eventoId) {
  return queryOne(
    `SELECT p.id, p.status, p.brincadeiraId, p.vencedorTimeId, p.iniciadoEm, p.finalizadoEm, b.tipo
     FROM zonaConquistaPartidaTime p
     LEFT JOIN brincadeira b ON LOWER(b.brincadeiraId) = LOWER(p.brincadeiraId)
     WHERE LOWER(p.eventoId) = LOWER(@eventoId)
     ORDER BY p.iniciadoEm DESC LIMIT 1`,
    { eventoId }
  );
}

// Resumo para o telão e o painel: placar das equipes, checkpoints e vencedor.
async function estadoDoDominio(eventoId) {
  const partida = await ultimaPartida(eventoId);
  if (!partida || partida.tipo !== TIPO_ZONA_DOMINIO) return { ativo: false };

  const [situacao, equipes] = await Promise.all([
    situacaoDosCheckpoints(eventoId, partida.brincadeiraId),
    allQuery(
      `SELECT t.timeId, tm.nome, tm.cor, t.pontosTotais, t.checkpointsLidos
       FROM zonaConquistaTempoTime t INNER JOIN "time" tm ON tm.timeId = t.timeId
       WHERE t.partidaId = @partidaId ORDER BY t.pontosTotais DESC, tm.nome ASC`,
      { partidaId: partida.id }
    ),
  ]);

  const equipePor = (id) => equipes.find((e) => mesmoId(e.timeId, id)) || null;
  const equipesComContagem = equipes.map((e) => ({
    timeId: e.timeId,
    nome: e.nome,
    cor: e.cor,
    pontos: Number(e.pontosTotais) || 0,
    checkpointsLidos: Number(e.checkpointsLidos) || 0,
    checkpoints: situacao.checkpoints.filter((c) => mesmoId(c.territorioDonoTimeId, e.timeId)).length,
  }));
  const vencedor = partida.vencedorTimeId ? equipePor(partida.vencedorTimeId) : null;

  return {
    ativo: true,
    partidaStatus: partida.status === 'active' ? 'em_andamento' : 'finalizada',
    totalCheckpoints: situacao.checkpoints.length,
    checkpoints: situacao.checkpoints.map((c) => {
      const dono = equipePor(c.territorioDonoTimeId);
      return {
        checkpointId: c.checkpointId,
        codigo: c.codigo || c.checkpointId,
        nome: c.nome,
        dono: dono ? { timeId: dono.timeId, nome: dono.nome, cor: dono.cor } : null,
      };
    }),
    equipes: equipesComContagem,
    vencedor: vencedor ? { timeId: vencedor.timeId, nome: vencedor.nome, cor: vencedor.cor } : null,
  };
}

// Qual dos dois sons de vitória toca para a equipe vencedora: "ct" = vitoriaAgentes, "tr" = vitoriaRebeldes.
// Pelo nome da equipe (Agentes / Rebeldes); com outro nome, a 1ª equipe do evento usa o som dos Agentes e a 2ª, o dos Rebeldes.
async function ladoDoSomDaEquipe(eventoId, timeId) {
  const times = await allQuery(
    `SELECT timeId, nome FROM "time" WHERE LOWER(eventoId) = LOWER(@eventoId) ORDER BY criadoEm ASC, nome ASC`,
    { eventoId }
  );
  const time = times.find((t) => mesmoId(t.timeId, timeId));
  const nome = String(time?.nome || '').toLowerCase();
  if (nome.includes('agente')) return 'ct';
  if (nome.includes('rebelde')) return 'tr';
  const indice = times.findIndex((t) => mesmoId(t.timeId, timeId));
  return indice <= 0 ? 'ct' : 'tr';
}

// O que um checkpoint precisa saber: jogo em andamento ou vencedor (para tocar o som da equipe e mostrar a cor).
// Qualquer outro jogo responde ativo = false.
async function obterEstadoCheckpoint(checkpointId) {
  const checkpoint = await queryOne(
    'SELECT checkpointId, eventoId FROM pontoVerificacao WHERE LOWER(checkpointId) = LOWER(@checkpointId)',
    { checkpointId }
  );
  if (!checkpoint) return { ok: true, ativo: false, fase: 'sem_partida' };

  const partida = await ultimaPartida(checkpoint.eventoId);
  if (!partida || partida.tipo !== TIPO_ZONA_DOMINIO) return { ok: true, ativo: false, fase: 'sem_partida' };
  if (!partida.vencedorTimeId) return { ok: true, ativo: partida.status === 'active', fase: 'jogo' };

  const time = await queryOne('SELECT nome, cor FROM "time" WHERE timeId = @timeId', { timeId: partida.vencedorTimeId });
  const haMs = partida.finalizadoEm ? Math.max(0, Date.now() - new Date(partida.finalizadoEm).getTime()) : 0;
  return {
    ok: true,
    ativo: true,
    fase: 'vencedor',
    resultado: {
      vencedorLado: await ladoDoSomDaEquipe(checkpoint.eventoId, partida.vencedorTimeId),
      motivo: 'dominio',
      haMs,
      cor: time?.cor || '',
      nome: time?.nome || '',
    },
  };
}

// Encerra o jogo sozinho depois que uma equipe venceu (passado ENCERRAR_APOS_MS). Vale também depois de o servidor reiniciar.
async function encerrarJogosDecididos() {
  const decididos = await allQuery(
    `SELECT p.eventoId, p.finalizadoEm
     FROM zonaConquistaPartidaTime p
     INNER JOIN brincadeira b ON LOWER(b.brincadeiraId) = LOWER(p.brincadeiraId) AND b.tipo = @tipo
     INNER JOIN estadoJogoEvento g ON LOWER(g.eventoId) = LOWER(p.eventoId) AND g.modo = 'game'
                                  AND LOWER(g.brincadeiraId) = LOWER(p.brincadeiraId)
     WHERE p.vencedorTimeId IS NOT NULL AND p.finalizadoEm IS NOT NULL
       AND p.finalizadoEm < @limite
       AND NOT EXISTS (SELECT 1 FROM zonaConquistaPartidaTime q
                       WHERE LOWER(q.eventoId) = LOWER(p.eventoId) AND q.iniciadoEm > p.iniciadoEm)`,
    { tipo: TIPO_ZONA_DOMINIO, limite: new Date(Date.now() - ENCERRAR_APOS_MS) }
  );
  for (const { eventoId } of decididos) {
    try {
      if (typeof global.stopGameForEvento === 'function') {
        console.log(`🏁 [ZONA-DOMINIO] Encerrando o jogo do evento ${eventoId} (equipe vencedora definida)`);
        await global.stopGameForEvento(eventoId);
      }
    } catch (erro) {
      console.error('❌ [ZONA-DOMINIO] Erro ao encerrar o jogo:', erro.message);
    }
  }
}

let relogio = null;
function iniciarRelogio() {
  if (relogio) return relogio;
  relogio = setInterval(() => { encerrarJogosDecididos().catch(() => {}); }, 3000);
  if (typeof relogio.unref === 'function') relogio.unref();
  return relogio;
}

module.exports = {
  TIPO_ZONA_DOMINIO,
  REPETICAO_MINIMA,
  ehJogoDeDominio,
  checkpointsDoJogo,
  checkpointEhDoJogo,
  situacaoDosCheckpoints,
  podeLer,
  pontosDaLeitura,
  vencedorDaUltimaPartida,
  estadoDoDominio,
  obterEstadoCheckpoint,
  iniciarRelogio,
};
