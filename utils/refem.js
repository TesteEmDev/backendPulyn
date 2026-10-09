// utils/refem.js - Resgate do Refém (PulynBall): partida, rounds e regras do resgate.
//
// Regras:
//   - Duas equipes: os Agentes (lado "ct") levam o refém e os Rebeldes (lado "tr") tentam recuperá-lo.
//   - Os checkpoints do jogo formam uma SEQUÊNCIA pela ordem do id (10, 11, 12... até o último cadastrado).
//   - No começo de cada round um jogador numerado dos Agentes é sorteado como refém: só a pulseira dele avança.
//   - O refém começa lendo o primeiro checkpoint, depois o segundo e assim por diante, sempre o PRÓXIMO da sequência
//     (ler fora de ordem ou repetir não vale). Chegou ao último: os Agentes vencem o round.
//   - Os Rebeldes recuperam o refém lendo a pulseira no checkpoint onde ele está parado (o último que ele alcançou):
//     o refém volta ao início da sequência e o round continua. Logo depois de o refém chegar a um checkpoint ele fica
//     protegido por `protecaoSeg` segundos (tempo de sair dali), e a recuperação não vale nesse intervalo.
//   - Passou `duracaoRoundSeg` sem o resgate completo: os Rebeldes vencem. O recreacionista também pode encerrar o round à mão.
//   - Vence a partida quem chegar primeiro a `vitoriasParaVencer`. Os lados trocam a cada `roundsPorLado` rounds jogados.
const { v4: uuidv4 } = require('uuid');
const { query, queryOne, allQuery } = require('../database');
const { normalizeUid, uidSqlExpression } = require('./uid');
const bomba = require('./bomba');

const REFEM_GAME_TYPE = 'hostage_rescue';

const PADROES = Object.freeze({
  vitoriasParaVencer: 5,
  roundsPorLado: 3,
  duracaoRoundSeg: 300,   // 5 minutos
  protecaoSeg: 10,        // refém protegido ao chegar a um checkpoint
});

const LIMITES = Object.freeze({
  vitoriasParaVencer: [1, 50],
  roundsPorLado: [1, 25],
  duracaoRoundSeg: [30, 1800],
  protecaoSeg: [0, 120],
});

const { MOSTRAR_RESULTADO_MS, JOGADOR_ATIVO, empresaTemPlanoPulynBall, numerarJogadores, definirNumeroJogador, ladosDoRound, dadosDosTimes } = bomba;

function erroHttp(mensagem, statusCode) {
  const erro = new Error(mensagem);
  erro.statusCode = statusCode;
  return erro;
}

function emitir(eventoId, tipo, payload = {}) {
  if (typeof global.broadcastToEvent === 'function') {
    global.broadcastToEvent(eventoId, { type: tipo, payload: { eventoId, ...payload } });
  }
}

function mesmoId(a, b) {
  return Boolean(a) && Boolean(b) && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

function normalizarConfig(config = {}) {
  const resultado = {};
  for (const [campo, [min, max]] of Object.entries(LIMITES)) {
    if (config[campo] === undefined || config[campo] === null || config[campo] === '') continue;
    const valor = Number(config[campo]);
    if (!Number.isFinite(valor) || valor < min || valor > max) {
      throw erroHttp(`${campo} deve estar entre ${min} e ${max}`, 400);
    }
    resultado[campo] = Math.round(valor);
  }
  return resultado;
}

// ---------- regras salvas em cada jogo (tela PulynBall) ----------

function montarJogo(linha) {
  let salva = {};
  try { salva = normalizarConfig(JSON.parse(linha.configuracaoJogo || '{}')); } catch { /* usa os padrões */ }
  return {
    brincadeiraId: linha.brincadeiraId,
    eventoId: linha.eventoId,
    nome: linha.nome,
    descricao: linha.descricao || '',
    regras: linha.regras || '',
    status: linha.status || 'active',
    config: { ...PADROES, ...salva },
  };
}

async function configSalvaDoJogo(brincadeiraId) {
  if (!brincadeiraId) return {};
  const jogo = await queryOne(
    'SELECT configuracaoJogo FROM brincadeira WHERE LOWER(brincadeiraId) = LOWER(@brincadeiraId)',
    { brincadeiraId }
  );
  try {
    return normalizarConfig(JSON.parse(jogo?.configuracaoJogo || '{}'));
  } catch {
    return {};
  }
}

async function listarJogos(eventoId, empresaId) {
  const linhas = await allQuery(
    `SELECT brincadeiraId, eventoId, nome, descricao, regras, status, configuracaoJogo FROM brincadeira
     WHERE LOWER(eventoId) = LOWER(@eventoId) AND empresaId = @empresaId AND tipo = @tipo
       AND LOWER(COALESCE(status, 'active')) <> 'archived'
     ORDER BY nome`,
    { eventoId, empresaId, tipo: REFEM_GAME_TYPE }
  );
  return linhas.map(montarJogo);
}

async function salvarJogo(brincadeiraId, empresaId, dados = {}) {
  const jogo = await queryOne(
    'SELECT brincadeiraId, empresaId, tipo FROM brincadeira WHERE LOWER(brincadeiraId) = LOWER(@brincadeiraId)',
    { brincadeiraId }
  );
  if (!jogo || jogo.tipo !== REFEM_GAME_TYPE) throw erroHttp('Jogo PulynBall não encontrado', 404);
  if (empresaId && String(jogo.empresaId).toLowerCase() !== String(empresaId).toLowerCase()) {
    throw erroHttp('Acesso negado: o jogo não pertence à sua empresa', 403);
  }
  const nome = String(dados.nome ?? '').trim();
  if (!nome) throw erroHttp('O nome do jogo é obrigatório', 400);
  if (nome.length > 100) throw erroHttp('O nome do jogo deve ter no máximo 100 caracteres', 400);
  const config = normalizarConfig(dados.config || {});

  await query(
    `UPDATE brincadeira SET nome = @nome, descricao = @descricao, regras = @regras, configuracaoJogo = @configuracao
     WHERE brincadeiraId = @brincadeiraId`,
    {
      brincadeiraId: jogo.brincadeiraId, nome,
      descricao: String(dados.descricao ?? '').slice(0, 2000),
      regras: String(dados.regras ?? '').slice(0, 4000),
      configuracao: JSON.stringify(config),
    }
  );
  return montarJogo(await queryOne(
    'SELECT brincadeiraId, eventoId, nome, descricao, regras, status, configuracaoJogo FROM brincadeira WHERE brincadeiraId = @brincadeiraId',
    { brincadeiraId: jogo.brincadeiraId }
  ));
}

// ---------- consultas ----------

const buscarPartidaAtiva = (eventoId) => queryOne(
  `SELECT TOP 1 * FROM partidaRefem WHERE LOWER(eventoId) = LOWER(@eventoId) AND status = 'em_andamento' ORDER BY iniciadoEm DESC`,
  { eventoId }
);
const buscarPartida = (partidaId) => queryOne('SELECT * FROM partidaRefem WHERE partidaId = @partidaId', { partidaId });
const buscarRoundAtual = (partidaId) => queryOne('SELECT TOP 1 * FROM roundRefem WHERE partidaId = @partidaId ORDER BY numero DESC', { partidaId });
const buscarUltimoRoundFinalizado = (partidaId) => queryOne(
  `SELECT TOP 1 * FROM roundRefem WHERE partidaId = @partidaId AND status = 'finalizado' ORDER BY numero DESC`,
  { partidaId }
);

// ---------- sequência de checkpoints ----------

// Ordem pelo id: números em ordem numérica (10, 11, 12...), ids com texto em ordem natural.
const porIdNatural = (a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true, sensitivity: 'base' });

// Checkpoints do jogo (os marcados no jogo; sem lista, todos os de jogo do evento) na ordem do id.
async function sequenciaDoJogo(eventoId, brincadeiraId) {
  const ids = await bomba.locaisDoJogo(eventoId, brincadeiraId);
  return [...ids].sort(porIdNatural);
}

function idsDaSequencia(partida) {
  try {
    const lista = JSON.parse(partida?.sequenciaIds || 'null');
    return Array.isArray(lista) ? lista : null;
  } catch {
    return null;
  }
}

const indiceNaSequencia = (partida, checkpointId) => {
  const ids = idsDaSequencia(partida) || [];
  return ids.findIndex((id) => mesmoId(id, checkpointId));
};

// ---------- partida ----------

async function criarRound(partida, numero) {
  const { timeTrId, timeCtId } = ladosDoRound(partida, numero);
  await query(
    `INSERT INTO roundRefem (roundId, partidaId, numero, timeTrId, timeCtId, status)
     VALUES (@roundId, @partidaId, @numero, @timeTrId, @timeCtId, 'aguardando')`,
    { roundId: uuidv4(), partidaId: partida.partidaId, numero, timeTrId, timeCtId }
  );
  return buscarRoundAtual(partida.partidaId);
}

async function pararPartidasDoEvento(eventoId, status = 'cancelada') {
  const partidas = await allQuery(
    `SELECT partidaId FROM partidaRefem WHERE LOWER(eventoId) = LOWER(@eventoId) AND status = 'em_andamento'`,
    { eventoId }
  );
  for (const { partidaId } of partidas) {
    await query(
      `UPDATE roundRefem SET status = 'finalizado', motivo = 'jogo_parado', finalizadoEm = @agora
       WHERE partidaId = @partidaId AND status IN ('aguardando', 'em_andamento')`,
      { partidaId, agora: new Date() }
    );
    await query(
      `UPDATE partidaRefem SET status = @status, finalizadoEm = @agora WHERE partidaId = @partidaId`,
      { partidaId, status, agora: new Date() }
    );
  }
  return partidas.length;
}

async function pararJogo(eventoId) {
  const total = await pararPartidasDoEvento(eventoId);
  if (total > 0) emitir(eventoId, 'REFEM_PARTIDA_ENCERRADA', { cancelada: true });
}

async function iniciarJogo(eventoId, brincadeiraId, opcoes = {}) {
  const evento = await queryOne('SELECT eventoId, empresaId FROM evento WHERE LOWER(eventoId) = LOWER(@eventoId)', { eventoId });
  if (!evento) throw erroHttp('Evento não encontrado', 404);

  await pararPartidasDoEvento(eventoId);

  const times = await dadosDosTimes(eventoId);
  const timeAId = opcoes.timeAId || times[0]?.timeId;
  const timeBId = opcoes.timeBId || times.find((t) => !mesmoId(t.timeId, timeAId))?.timeId;
  if (!timeAId || !timeBId || mesmoId(timeAId, timeBId)) {
    throw erroHttp('O Resgate do Refém precisa de 2 equipes no evento.', 409);
  }
  const idsValidos = new Set(times.map((t) => String(t.timeId).toLowerCase()));
  if (!idsValidos.has(String(timeAId).toLowerCase()) || !idsValidos.has(String(timeBId).toLowerCase())) {
    throw erroHttp('As equipes escolhidas não pertencem ao evento', 400);
  }
  // timeTrInicialId = quem começa de Rebeldes (a outra equipe começa de Agentes e leva o refém)
  const timeTrInicialId = [timeAId, timeBId].find((id) => mesmoId(id, opcoes.timeTrInicialId)) || timeAId;
  const config = { ...PADROES, ...(await configSalvaDoJogo(brincadeiraId)), ...normalizarConfig(opcoes.config) };

  const sequencia = await sequenciaDoJogo(evento.eventoId, brincadeiraId);
  if (sequencia.length < 2) throw erroHttp('O Resgate do Refém precisa de pelo menos 2 checkpoints (início e fim da sequência).', 409);

  const partidaId = uuidv4();
  await query(
    `INSERT INTO partidaRefem
       (partidaId, eventoId, empresaId, brincadeiraId, timeAId, timeBId, timeTrInicialId,
        vitoriasParaVencer, roundsPorLado, duracaoRoundSeg, protecaoSeg, sequenciaIds)
     VALUES (@partidaId, @eventoId, @empresaId, @brincadeiraId, @timeAId, @timeBId, @timeTrInicialId,
             @vitoriasParaVencer, @roundsPorLado, @duracaoRoundSeg, @protecaoSeg, @sequenciaIds)`,
    {
      partidaId, eventoId: evento.eventoId, empresaId: evento.empresaId, brincadeiraId: brincadeiraId || null,
      timeAId, timeBId, timeTrInicialId, sequenciaIds: JSON.stringify(sequencia), ...config,
    }
  );

  await numerarJogadores(evento.eventoId, [timeAId, timeBId]);
  await criarRound(await buscarPartida(partidaId), 1);
  const estado = await obterEstado(evento.eventoId);
  emitir(evento.eventoId, 'REFEM_ESTADO', { estado });
  return estado;
}

async function configurarPartida(partidaId, opcoes = {}) {
  const partida = await buscarPartida(partidaId);
  if (!partida || partida.status !== 'em_andamento') throw erroHttp('Partida não encontrada ou já encerrada', 404);
  const round = await buscarRoundAtual(partidaId);
  if (!round || round.numero > 1 || round.status !== 'aguardando') {
    throw erroHttp('A partida só pode ser configurada antes do primeiro round começar', 409);
  }

  const timeAId = opcoes.timeAId || partida.timeAId;
  const timeBId = opcoes.timeBId || partida.timeBId;
  if (mesmoId(timeAId, timeBId)) throw erroHttp('Escolha duas equipes diferentes', 400);
  const times = await dadosDosTimes(partida.eventoId);
  const idsValidos = new Set(times.map((t) => String(t.timeId).toLowerCase()));
  if (!idsValidos.has(String(timeAId).toLowerCase()) || !idsValidos.has(String(timeBId).toLowerCase())) {
    throw erroHttp('As equipes escolhidas não pertencem ao evento', 400);
  }
  const timeTrInicialId = [timeAId, timeBId].find((id) => mesmoId(id, opcoes.timeTrInicialId))
    || (mesmoId(partida.timeTrInicialId, timeAId) || mesmoId(partida.timeTrInicialId, timeBId) ? partida.timeTrInicialId : timeAId);
  const atual = { ...partida, ...normalizarConfig(opcoes.config), timeAId, timeBId, timeTrInicialId };

  await query(
    `UPDATE partidaRefem SET timeAId = @timeAId, timeBId = @timeBId, timeTrInicialId = @timeTrInicialId,
       vitoriasParaVencer = @vitoriasParaVencer, roundsPorLado = @roundsPorLado, duracaoRoundSeg = @duracaoRoundSeg,
       protecaoSeg = @protecaoSeg
     WHERE partidaId = @partidaId`,
    {
      partidaId, timeAId, timeBId, timeTrInicialId,
      vitoriasParaVencer: atual.vitoriasParaVencer, roundsPorLado: atual.roundsPorLado,
      duracaoRoundSeg: atual.duracaoRoundSeg, protecaoSeg: atual.protecaoSeg,
    }
  );
  const { timeTrId, timeCtId } = ladosDoRound(atual, round.numero);
  await query('UPDATE roundRefem SET timeTrId = @timeTrId, timeCtId = @timeCtId WHERE roundId = @roundId', {
    roundId: round.roundId, timeTrId, timeCtId,
  });
  await numerarJogadores(partida.eventoId, [timeAId, timeBId]);
  const estado = await obterEstado(partida.eventoId);
  emitir(partida.eventoId, 'REFEM_ESTADO', { estado });
  return estado;
}

// O refém é sorteado entre os jogadores numerados da equipe dos Agentes.
async function sortearRefem(round, eventoId) {
  const candidatos = await allQuery(
    `SELECT c.criancaId, c.numeroJogador FROM crianca c
     WHERE LOWER(c.eventoId) = LOWER(@eventoId) AND c.timeId = @timeId
       AND c.numeroJogador IS NOT NULL AND ${JOGADOR_ATIVO}`,
    { eventoId, timeId: round.timeCtId }
  );
  if (candidatos.length === 0) {
    throw erroHttp('A equipe dos Agentes não tem jogadores numerados. Numere os jogadores antes de iniciar o round.', 409);
  }
  return candidatos[Math.floor(Math.random() * candidatos.length)];
}

async function iniciarRound(partidaId) {
  const partida = await buscarPartida(partidaId);
  if (!partida || partida.status !== 'em_andamento') throw erroHttp('Partida não encontrada ou já encerrada', 404);
  const round = await buscarRoundAtual(partidaId);
  if (!round || round.status !== 'aguardando') throw erroHttp('Não há round aguardando para iniciar', 409);

  const refem = await sortearRefem(round, partida.eventoId);
  const agora = new Date();
  const resultado = await query(
    `UPDATE roundRefem SET status = 'em_andamento', iniciadoEm = @agora, ultimoAvancoEm = @agora,
       refemCriancaId = @refemCriancaId, refemNumero = @refemNumero, posicao = 0, recuperacoes = 0
     WHERE roundId = @roundId AND status = 'aguardando'`,
    { roundId: round.roundId, refemCriancaId: refem.criancaId, refemNumero: refem.numeroJogador, agora }
  );
  if (!Number(resultado?.rowsAffected?.[0] || 0)) throw erroHttp('O round já foi iniciado', 409);
  console.log(`🎮 [REFEM] Round ${round.numero} iniciado | refém: jogador nº ${refem.numeroJogador} | duração ${partida.duracaoRoundSeg}s`);

  const estado = await obterEstado(partida.eventoId);
  emitir(partida.eventoId, 'REFEM_ROUND_INICIADO', { numero: round.numero, estado });
  return estado;
}

// Fecha o round, soma o ponto e prepara o próximo (ou encerra a partida). Devolve null se outro processo já fechou.
async function finalizarRound(round, partida, vencedorLado, motivo, finalizadoEm = new Date()) {
  const vencedorTimeId = vencedorLado === 'tr' ? round.timeTrId : round.timeCtId;
  const resultado = await query(
    `UPDATE roundRefem SET status = 'finalizado', vencedorTimeId = @vencedorTimeId, motivo = @motivo, finalizadoEm = @agora
     WHERE roundId = @roundId AND status = 'em_andamento'`,
    { roundId: round.roundId, vencedorTimeId, motivo, agora: finalizadoEm }
  );
  if (!Number(resultado?.rowsAffected?.[0] || 0)) return null;
  console.log(`🏁 [REFEM] Round ${round.numero} encerrado | vencedor: ${vencedorLado === 'tr' ? 'Rebeldes' : 'Agentes'} | motivo: ${motivo}`);

  const coluna = mesmoId(vencedorTimeId, partida.timeAId) ? 'vitoriasA' : 'vitoriasB';
  await query(`UPDATE partidaRefem SET ${coluna} = ${coluna} + 1 WHERE partidaId = @partidaId`, { partidaId: partida.partidaId });
  const atualizada = await buscarPartida(partida.partidaId);

  const partidaVencida = Math.max(atualizada.vitoriasA, atualizada.vitoriasB) >= atualizada.vitoriasParaVencer;
  if (partidaVencida) {
    const campeao = atualizada.vitoriasA >= atualizada.vitoriasB ? atualizada.timeAId : atualizada.timeBId;
    await query(
      `UPDATE partidaRefem SET status = 'finalizada', vencedorTimeId = @campeao, finalizadoEm = @agora WHERE partidaId = @partidaId`,
      { partidaId: partida.partidaId, campeao, agora: new Date() }
    );
  } else {
    await criarRound(atualizada, round.numero + 1);
  }

  const estado = await obterEstado(partida.eventoId);
  emitir(partida.eventoId, 'REFEM_ROUND_ENCERRADO', {
    numero: round.numero, vencedorLado, vencedorTimeId, motivo, partidaEncerrada: partidaVencida, estado,
  });
  if (partidaVencida) emitir(partida.eventoId, 'REFEM_PARTIDA_ENCERRADA', { vencedorTimeId, estado });
  return estado;
}

async function encerrarRoundManual(partidaId, vencedorLado) {
  if (vencedorLado !== 'tr' && vencedorLado !== 'ct') throw erroHttp("vencedor deve ser 'tr' ou 'ct'", 400);
  const partida = await buscarPartida(partidaId);
  if (!partida || partida.status !== 'em_andamento') throw erroHttp('Partida não encontrada ou já encerrada', 404);
  const round = await buscarRoundAtual(partidaId);
  if (!round || round.status !== 'em_andamento') throw erroHttp('Não há round em andamento para encerrar', 409);
  const estado = await finalizarRound(round, partida, vencedorLado, vencedorLado === 'tr' ? 'eliminacao_ct' : 'eliminacao_tr');
  if (!estado) throw erroHttp('O round já foi encerrado', 409);
  return estado;
}

// Fim do tempo do round (Rebeldes vencem). Chamada pelo relógio do servidor e a cada consulta de estado.
async function avaliarRound(partida, round, agora = new Date()) {
  if (!round || !partida || partida.status !== 'em_andamento') return round;
  if (round.status === 'em_andamento' && round.iniciadoEm) {
    const fim = new Date(round.iniciadoEm).getTime() + partida.duracaoRoundSeg * 1000;
    if (agora.getTime() >= fim) {
      await finalizarRound(round, partida, 'tr', 'tempo', new Date(fim));
      return buscarRoundAtual(partida.partidaId);
    }
  }
  return round;
}

async function avaliarTodos() {
  const ativos = await allQuery(`SELECT r.partidaId FROM roundRefem r WHERE r.status = 'em_andamento'`);
  for (const { partidaId } of ativos) {
    try {
      await avaliarRound(await buscarPartida(partidaId), await buscarRoundAtual(partidaId));
    } catch (erro) {
      console.error('❌ [REFEM] Erro ao avaliar round:', erro.message);
    }
  }
}

let relogio = null;
function iniciarRelogio() {
  if (relogio) return relogio;
  relogio = setInterval(() => { avaliarTodos().catch(() => {}); }, 1000);
  if (typeof relogio.unref === 'function') relogio.unref();
  return relogio;
}

// ---------- leitura de pulseira no checkpoint ----------

const restanteMs = (inicio, duracaoMs, agora) => (inicio ? Math.max(0, new Date(inicio).getTime() + duracaoMs - agora.getTime()) : null);

function negado(motivo, mensagem, extra = {}) {
  console.log(`⛔ [REFEM] Leitura negada: ${motivo} (${mensagem})`);
  return { ok: true, registered: true, autorizado: false, tipo: 'refem', acao: 'negado', motivo, mensagem, ...extra };
}

/**
 * Processa a leitura de uma pulseira. `acao`: avancou | resgatado | recuperado | negado | sem_partida.
 */
async function processarLeitura({ checkpointId, uid }) {
  const normalizado = normalizeUid(uid);
  if (!checkpointId || !normalizado) throw erroHttp('checkpointId e uid são obrigatórios', 400);

  const checkpoint = await queryOne(
    `SELECT checkpointId, nome, eventoId, status, proposito FROM pontoVerificacao WHERE LOWER(checkpointId) = LOWER(@checkpointId)`,
    { checkpointId }
  );
  if (!checkpoint) throw erroHttp('Checkpoint não encontrado', 404);
  if (String(checkpoint.proposito || 'game').toLowerCase() === 'reception') {
    throw erroHttp('Checkpoint de recepção não participa do jogo', 409);
  }
  if (String(checkpoint.status || '').toLowerCase() !== 'online') {
    await query(`UPDATE pontoVerificacao SET status = 'online', ultimoVisto = CURRENT_TIMESTAMP WHERE checkpointId = @checkpointId`, {
      checkpointId: checkpoint.checkpointId,
    });
  }

  const crianca = await queryOne(
    `SELECT c.criancaId, c.nome, c.apelido, c.timeId FROM crianca c
     WHERE ${uidSqlExpression('c.codigoPulseira')} = @uid AND LOWER(c.eventoId) = LOWER(@eventoId)`,
    { uid: normalizado, eventoId: checkpoint.eventoId }
  );
  if (!crianca) {
    return { ok: true, registered: false, autorizado: false, tipo: 'refem', acao: 'negado', motivo: 'pulseira_sem_cadastro', mensagem: 'Pulseira não cadastrada neste evento' };
  }

  const agora = new Date();
  const partida = await buscarPartidaAtiva(checkpoint.eventoId);
  if (!partida) return { ok: true, registered: true, autorizado: false, tipo: 'refem', acao: 'sem_partida', mensagem: 'Nenhuma partida em andamento' };

  const indice = indiceNaSequencia(partida, checkpoint.checkpointId);
  if (indice < 0) return negado('fora_do_jogo', 'Este checkpoint não faz parte da sequência do resgate');

  let round = await avaliarRound(partida, await buscarRoundAtual(partida.partidaId), agora);
  const partidaAtual = await buscarPartida(partida.partidaId);
  if (partidaAtual.status !== 'em_andamento') {
    return { ok: true, registered: true, autorizado: false, tipo: 'refem', acao: 'sem_partida', mensagem: 'A partida terminou' };
  }
  if (!round || round.status !== 'em_andamento') return negado('aguardando_round', 'Aguarde o recreacionista iniciar o round');

  const lado = mesmoId(crianca.timeId, round.timeTrId) ? 'tr' : mesmoId(crianca.timeId, round.timeCtId) ? 'ct' : null;
  if (!lado) return negado('fora_da_partida', 'Sua equipe não está jogando esta partida');

  const sequencia = idsDaSequencia(partidaAtual) || [];
  const total = sequencia.length;
  const posicao = Number(round.posicao) || 0;   // quantos checkpoints o refém já alcançou
  const base = { round: round.numero, lado, posicao, total };

  // ----- Agentes: só o refém avança, sempre para o próximo da sequência -----
  if (lado === 'ct') {
    if (!mesmoId(crianca.criancaId, round.refemCriancaId)) {
      return negado('nao_e_refem', `Só o jogador nº ${round.refemNumero} (o refém) avança na sequência`, base);
    }
    if (indice === posicao - 1) return negado('ja_esta_aqui', 'O refém já está neste checkpoint: siga para o próximo', base);
    if (indice !== posicao) {
      return negado('fora_de_ordem', posicao === 0 ? 'O refém precisa começar pelo primeiro checkpoint da sequência' : 'Este não é o próximo checkpoint da sequência', base);
    }

    const novaPosicao = posicao + 1;
    const avancou = await query(
      `UPDATE roundRefem SET posicao = @novaPosicao, ultimoAvancoEm = @agora
       WHERE roundId = @roundId AND status = 'em_andamento' AND posicao = @posicao`,
      { roundId: round.roundId, novaPosicao, posicao, agora: new Date() }
    );
    if (!Number(avancou?.rowsAffected?.[0] || 0)) return negado('round_encerrado', 'O round mudou, tente de novo', base);
    console.log(`🚶 [REFEM] Refém chegou ao checkpoint ${checkpoint.checkpointId} (${novaPosicao}/${total})`);

    if (novaPosicao >= total) {
      const fechado = await finalizarRound({ ...round, posicao: novaPosicao }, partidaAtual, 'ct', 'resgatado');
      if (!fechado) return negado('round_encerrado', 'O round já terminou', base);
      return { ok: true, registered: true, autorizado: true, tipo: 'refem', acao: 'resgatado', ...base, posicao: novaPosicao };
    }
    emitir(checkpoint.eventoId, 'REFEM_AVANCOU', { numero: round.numero, posicao: novaPosicao, total, checkpointId: checkpoint.checkpointId });
    return {
      ok: true, registered: true, autorizado: true, tipo: 'refem', acao: 'avancou', ...base, posicao: novaPosicao,
      proximoCheckpointId: sequencia[novaPosicao], protecaoSeg: partidaAtual.protecaoSeg,
    };
  }

  // ----- Rebeldes: recuperam o refém lendo no checkpoint onde ele está -----
  if (posicao === 0) return negado('refem_nao_saiu', 'O refém ainda não chegou a nenhum checkpoint', base);
  if (indice !== posicao - 1) return negado('refem_nao_esta_aqui', 'O refém não está neste checkpoint', base);

  const protecaoMs = partidaAtual.protecaoSeg * 1000;
  const protegidoPor = round.ultimoAvancoEm ? Math.max(0, new Date(round.ultimoAvancoEm).getTime() + protecaoMs - agora.getTime()) : 0;
  if (protegidoPor > 0) {
    return negado('refem_protegido', `O refém acabou de chegar: protegido por mais ${Math.ceil(protegidoPor / 1000)} s`, { ...base, protegidoMs: protegidoPor });
  }

  const recuperou = await query(
    `UPDATE roundRefem SET posicao = 0, recuperacoes = recuperacoes + 1, ultimoAvancoEm = @agora
     WHERE roundId = @roundId AND status = 'em_andamento' AND posicao = @posicao`,
    { roundId: round.roundId, posicao, agora: new Date() }
  );
  if (!Number(recuperou?.rowsAffected?.[0] || 0)) return negado('round_encerrado', 'O round mudou, tente de novo', base);
  console.log(`🏴 [REFEM] ${crianca.apelido || crianca.nome} recuperou o refém no checkpoint ${checkpoint.checkpointId}`);
  emitir(checkpoint.eventoId, 'REFEM_RECUPERADO', { numero: round.numero, checkpointId: checkpoint.checkpointId });
  return { ok: true, registered: true, autorizado: true, tipo: 'refem', acao: 'recuperado', ...base, posicao: 0 };
}

// ---------- estado (painéis e checkpoints) ----------

function montarPartida(partida, times) {
  const achar = (id) => times.find((t) => mesmoId(t.timeId, id)) || { timeId: id };
  return {
    partidaId: partida.partidaId,
    status: partida.status,
    timeA: { ...achar(partida.timeAId), vitorias: partida.vitoriasA },
    timeB: { ...achar(partida.timeBId), vitorias: partida.vitoriasB },
    timeTrInicialId: partida.timeTrInicialId,
    vencedorTimeId: partida.vencedorTimeId,
    config: {
      vitoriasParaVencer: partida.vitoriasParaVencer,
      roundsPorLado: partida.roundsPorLado,
      duracaoRoundSeg: partida.duracaoRoundSeg,
      protecaoSeg: partida.protecaoSeg,
    },
  };
}

async function obterEstado(eventoId) {
  const agora = new Date();
  const partida = await buscarPartidaAtiva(eventoId);
  if (!partida) {
    const ultima = await queryOne(
      `SELECT TOP 1 * FROM partidaRefem WHERE LOWER(eventoId) = LOWER(@eventoId) ORDER BY iniciadoEm DESC`,
      { eventoId }
    );
    const times = ultima ? await dadosDosTimes(eventoId) : [];
    return { agora: agora.toISOString(), ativa: false, partida: ultima ? montarPartida(ultima, times) : null, round: null, sequencia: [], jogadores: [] };
  }

  const round = await buscarRoundAtual(partida.partidaId);
  const times = await dadosDosTimes(eventoId);
  const timeDe = (id) => times.find((t) => mesmoId(t.timeId, id)) || null;
  const jogadores = await allQuery(
    `SELECT c.criancaId, c.nome, c.apelido, c.avatar, c.timeId, c.numeroJogador FROM crianca c
     WHERE LOWER(c.eventoId) = LOWER(@eventoId) AND c.timeId IN (@timeAId, @timeBId) AND ${JOGADOR_ATIVO}
     ORDER BY c.timeId, c.numeroJogador, c.nome`,
    { eventoId, timeAId: partida.timeAId, timeBId: partida.timeBId }
  );
  const ultimo = round && round.status === 'finalizado' ? round
    : (round && round.numero > 1 ? await buscarUltimoRoundFinalizado(partida.partidaId) : null);

  const checkpointsDoEvento = await allQuery(
    `SELECT checkpointId, nome, status FROM pontoVerificacao
     WHERE LOWER(eventoId) = LOWER(@eventoId) AND LOWER(COALESCE(proposito, 'game')) <> 'reception'`,
    { eventoId }
  );
  const ids = idsDaSequencia(partida) || [];
  const sequencia = ids.map((id, i) => {
    const linha = checkpointsDoEvento.find((c) => mesmoId(c.checkpointId, id));
    return { checkpointId: id, ordem: i + 1, nome: linha?.nome || id, online: String(linha?.status || '').toLowerCase() === 'online' };
  });

  const emAndamento = round && round.status === 'em_andamento';
  const posicao = emAndamento ? Number(round.posicao) || 0 : 0;
  const refemLinha = round?.refemCriancaId ? jogadores.find((j) => mesmoId(j.criancaId, round.refemCriancaId)) : null;
  const protecaoMs = partida.protecaoSeg * 1000;

  return {
    agora: agora.toISOString(),
    ativa: true,
    partida: montarPartida(partida, times),
    round: round ? {
      roundId: round.roundId,
      numero: round.numero,
      status: round.status,
      timeTr: timeDe(round.timeTrId),
      timeCt: timeDe(round.timeCtId),
      refem: round.refemCriancaId ? {
        criancaId: round.refemCriancaId, numero: round.refemNumero,
        nome: refemLinha?.apelido || refemLinha?.nome || null, avatar: refemLinha?.avatar || null,
      } : null,
      posicao,
      total: sequencia.length,
      atualCheckpointId: emAndamento && posicao > 0 ? ids[posicao - 1] : null,
      proximoCheckpointId: emAndamento ? (ids[posicao] || null) : null,
      recuperacoes: Number(round.recuperacoes) || 0,
      protegidoMs: emAndamento && posicao > 0 && round.ultimoAvancoEm
        ? Math.max(0, new Date(round.ultimoAvancoEm).getTime() + protecaoMs - agora.getTime()) : 0,
      restanteRoundMs: emAndamento ? restanteMs(round.iniciadoEm, partida.duracaoRoundSeg * 1000, agora) : null,
      vencedorTimeId: round.vencedorTimeId,
      motivo: round.motivo,
    } : null,
    ultimoResultado: ultimo && ultimo.status === 'finalizado' ? {
      numero: ultimo.numero,
      vencedorTimeId: ultimo.vencedorTimeId,
      vencedorLado: mesmoId(ultimo.vencedorTimeId, ultimo.timeTrId) ? 'tr' : 'ct',
      motivo: ultimo.motivo,
      finalizadoEm: ultimo.finalizadoEm,
    } : null,
    sequencia,
    jogadores,
  };
}

// O que um checkpoint precisa saber para acender o LED e tocar o som certo.
async function obterEstadoCheckpoint(checkpointId) {
  const checkpoint = await queryOne(
    `SELECT checkpointId, eventoId FROM pontoVerificacao WHERE LOWER(checkpointId) = LOWER(@checkpointId)`,
    { checkpointId }
  );
  if (!checkpoint) throw erroHttp('Checkpoint não encontrado', 404);

  const agora = new Date();
  const partida = await buscarPartidaAtiva(checkpoint.eventoId);
  if (!partida) return { ok: true, ativo: false, fase: 'sem_partida' };
  const indice = indiceNaSequencia(partida, checkpoint.checkpointId);
  if (indice < 0) return { ok: true, ativo: false, fase: 'fora_do_jogo' };

  let round = await avaliarRound(partida, await buscarRoundAtual(partida.partidaId), agora);
  const partidaAtual = await buscarPartida(partida.partidaId);
  if (partidaAtual.status !== 'em_andamento') return { ok: true, ativo: false, fase: 'sem_partida' };
  round = await buscarRoundAtual(partidaAtual.partidaId);

  const base = { ok: true, ativo: true, round: round?.numero || 0, total: (idsDaSequencia(partidaAtual) || []).length, ordem: indice + 1 };

  if (round && round.status === 'em_andamento') {
    const posicao = Number(round.posicao) || 0;
    // papel: "proximo" = o refém deve ler aqui agora; "atual" = o refém está aqui (os Rebeldes podem recuperá-lo); "outro"
    const papel = indice === posicao ? 'proximo' : indice === posicao - 1 ? 'atual' : 'outro';
    return {
      ...base, fase: 'round', papel, posicao,
      restanteRoundMs: restanteMs(round.iniciadoEm, partidaAtual.duracaoRoundSeg * 1000, agora),
    };
  }

  const anterior = round && round.numero > 1 ? await buscarUltimoRoundFinalizado(partidaAtual.partidaId) : null;
  if (anterior && anterior.finalizadoEm && agora.getTime() - new Date(anterior.finalizadoEm).getTime() <= MOSTRAR_RESULTADO_MS) {
    return {
      ...base, fase: 'resultado',
      resultado: {
        vencedorLado: mesmoId(anterior.vencedorTimeId, anterior.timeTrId) ? 'tr' : 'ct',
        motivo: anterior.motivo,
        haMs: agora.getTime() - new Date(anterior.finalizadoEm).getTime(),
      },
    };
  }
  return { ...base, fase: 'aguardando_round' };
}

module.exports = {
  REFEM_GAME_TYPE,
  LIMITES,
  PADROES,
  listarJogos,
  salvarJogo,
  empresaTemPlanoPulynBall,
  iniciarJogo,
  pararJogo,
  configurarPartida,
  iniciarRound,
  encerrarRoundManual,
  numerarJogadores,
  definirNumeroJogador,
  processarLeitura,
  obterEstado,
  obterEstadoCheckpoint,
  buscarPartidaAtiva,
  iniciarRelogio,
  sequenciaDoJogo,
};
