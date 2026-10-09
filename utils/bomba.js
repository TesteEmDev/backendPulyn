// utils/bomba.js - Conquistar e Destruir (PulynBall): partida, rounds e regras da bomba.
//
// Regras (baseadas no Counter-Strike):
//   - Duas equipes: os Rebeldes (lado "tr": plantam) e os Agentes (lado "ct": desarmam). Os ids internos continuam tr/ct.
//   - O sorteio de cada round escolhe o número de um jogador da equipe dos Rebeldes: só a pulseira dele planta.
//   - Plantar: o portador mantém a pulseira no checkpoint por `plantarMs` sem interrupção (o leitor lê a cada 500 ms).
//     Se a leitura falhar por mais de TOLERANCIA_LEITURA_MS, o tempo recomeça do zero.
//   - A bomba fica ativa por `bombaSeg`. Se explodir, os Rebeldes vencem o round.
//   - Desarmar: qualquer pulseira da equipe dos Agentes mantém a leitura no checkpoint da bomba por `desarmarMs`.
//     Se o jogador parar, o tempo é zerado e recomeça do zero para quem tentar em seguida. Desarmou: os Agentes vencem.
//   - Passou `duracaoRoundSeg` sem a bomba ser plantada: os Agentes vencem. O recreacionista também pode encerrar o round à mão
//     (por eliminação de uma equipe, por exemplo).
//   - Vence a partida quem chegar primeiro a `vitoriasParaVencer`. Os lados trocam a cada `roundsPorLado` rounds jogados.
//   - Só existe uma bomba por round: depois que ela é plantada, o outro local fica bloqueado até o próximo round.
const { v4: uuidv4 } = require('uuid');
const { query, queryOne, allQuery } = require('../database');
const { normalizeUid, uidSqlExpression } = require('./uid');

const BOMBA_GAME_TYPE = 'bomb_defusal';

const PADROES = Object.freeze({
  vitoriasParaVencer: 10,
  roundsPorLado: 5,
  duracaoRoundSeg: 360,   // 6 minutos
  plantarMs: 6000,        // 6 segundos
  desarmarMs: 12500,      // 12,5 segundos
  bombaSeg: 150,          // 2 minutos e 30 segundos
});

// Limites aceitos ao configurar a partida (evita valores sem sentido vindos do painel).
const LIMITES = Object.freeze({
  vitoriasParaVencer: [1, 50],
  roundsPorLado: [1, 25],
  duracaoRoundSeg: [30, 1800],
  plantarMs: [1000, 60000],
  desarmarMs: [1000, 120000],
  bombaSeg: [10, 600],
});

// Sem leitura por mais que isso (contado do fim da resposta anterior até a chegada da próxima) = a pulseira saiu do leitor.
// O leitor lê a cada 500 ms; a folga cobre uma leitura perdida e a latência da rede.
const TOLERANCIA_LEITURA_MS = 2000;
const MOSTRAR_RESULTADO_MS = 10000;   // quanto tempo os checkpoints ainda veem o resultado do round (a vitória toca ~4 s depois do fim)

// Leituras em andamento (plantar/desarmar), por checkpoint. Só ficam em memória: se o servidor reiniciar,
// quem estava segurando a pulseira só precisa recomeçar.
const leiturasEmAndamento = new Map();

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

function chave(checkpointId) {
  return String(checkpointId || '').trim().toLowerCase();
}

function mesmoId(a, b) {
  return Boolean(a) && Boolean(b) && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

function limparEmAndamentoDoEvento(eventoId) {
  for (const [id, leitura] of leiturasEmAndamento) {
    if (mesmoId(leitura.eventoId, eventoId)) leiturasEmAndamento.delete(id);
  }
}

// Mantém só as opções conhecidas e dentro dos limites.
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

// O jogo é exclusivo do plano PulynBall (o master pode usar em qualquer empresa).
const MENSAGEM_PLANO = 'O Conquistar e Destruir é exclusivo do plano PulynBall.';

async function empresaTemPlanoPulynBall(empresaId) {
  const empresa = await queryOne('SELECT plano FROM empresa WHERE LOWER(empresaId) = LOWER(@empresaId)', { empresaId });
  return String(empresa?.plano || '').trim().toLowerCase() === 'pulynball';
}

// ---------- regras salvas em cada jogo (tela PulynBall) ----------

// Regras que o cliente PulynBall editou no jogo; valores inválidos ou desconhecidos são ignorados.
async function configSalvaDoJogo(brincadeiraId) {
  if (!brincadeiraId) return {};
  const jogo = await queryOne(
    'SELECT configuracaoJogo FROM brincadeira WHERE LOWER(brincadeiraId) = LOWER(@brincadeiraId)',
    { brincadeiraId }
  );
  if (!jogo?.configuracaoJogo) return {};
  try {
    return normalizarConfig(JSON.parse(jogo.configuracaoJogo));
  } catch {
    return {};
  }
}

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

async function listarJogos(eventoId, empresaId) {
  const linhas = await allQuery(
    `SELECT brincadeiraId, eventoId, nome, descricao, regras, status, configuracaoJogo FROM brincadeira
     WHERE LOWER(eventoId) = LOWER(@eventoId) AND empresaId = @empresaId AND tipo = @tipo
       AND LOWER(COALESCE(status, 'active')) <> 'archived'
     ORDER BY nome`,
    { eventoId, empresaId, tipo: BOMBA_GAME_TYPE }
  );
  return linhas.map(montarJogo);
}

// Salva nome, texto das regras e os tempos/vitórias do jogo. Vale para as próximas partidas.
async function salvarJogo(brincadeiraId, empresaId, dados = {}) {
  const jogo = await queryOne(
    'SELECT brincadeiraId, empresaId, tipo FROM brincadeira WHERE LOWER(brincadeiraId) = LOWER(@brincadeiraId)',
    { brincadeiraId }
  );
  if (!jogo || jogo.tipo !== BOMBA_GAME_TYPE) throw erroHttp('Jogo PulynBall não encontrado', 404);
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
      brincadeiraId: jogo.brincadeiraId,
      nome,
      descricao: String(dados.descricao ?? '').slice(0, 2000),
      regras: String(dados.regras ?? '').slice(0, 4000),
      configuracao: JSON.stringify(config),
    }
  );
  const atualizado = await queryOne(
    'SELECT brincadeiraId, eventoId, nome, descricao, regras, status, configuracaoJogo FROM brincadeira WHERE brincadeiraId = @brincadeiraId',
    { brincadeiraId: jogo.brincadeiraId }
  );
  return montarJogo(atualizado);
}

// ---------- consultas ----------

async function buscarPartidaAtiva(eventoId) {
  return queryOne(
    `SELECT TOP 1 * FROM partidaBomba
     WHERE LOWER(eventoId) = LOWER(@eventoId) AND status = 'em_andamento'
     ORDER BY iniciadoEm DESC`,
    { eventoId }
  );
}

async function buscarPartida(partidaId) {
  return queryOne('SELECT * FROM partidaBomba WHERE partidaId = @partidaId', { partidaId });
}

async function buscarRoundAtual(partidaId) {
  return queryOne(
    'SELECT TOP 1 * FROM roundBomba WHERE partidaId = @partidaId ORDER BY numero DESC',
    { partidaId }
  );
}

async function buscarUltimoRoundFinalizado(partidaId) {
  return queryOne(
    `SELECT TOP 1 * FROM roundBomba WHERE partidaId = @partidaId AND status = 'finalizado'
     ORDER BY numero DESC`,
    { partidaId }
  );
}

// ---------- locais da bomba (A, B...) ----------

// Checkpoints-bomba do jogo, na ordem em que foram marcados no jogo (o primeiro é o local A).
// Sem lista no jogo (jogo antigo), vale qualquer checkpoint de jogo do evento.
async function locaisDoJogo(eventoId, brincadeiraId) {
  const doEvento = await allQuery(
    `SELECT checkpointId FROM pontoVerificacao
     WHERE LOWER(eventoId) = LOWER(@eventoId) AND LOWER(COALESCE(proposito, 'game')) <> 'reception'
     ORDER BY criadoEm ASC, nome ASC`,
    { eventoId }
  );
  const existentes = new Map(doEvento.map((c) => [String(c.checkpointId).toLowerCase(), c.checkpointId]));

  let configurados = [];
  if (brincadeiraId) {
    const jogo = await queryOne('SELECT checkpoints FROM brincadeira WHERE LOWER(brincadeiraId) = LOWER(@brincadeiraId)', { brincadeiraId });
    try {
      const itens = JSON.parse(jogo?.checkpoints || '[]');
      configurados = (Array.isArray(itens) ? itens : [])
        .map((item) => String((item && typeof item === 'object' ? (item.id ?? item.checkpointId) : item) ?? '').trim().toLowerCase())
        .filter((id) => existentes.has(id))
        .map((id) => existentes.get(id));
    } catch { /* sem lista: usa todos */ }
  }
  return configurados.length ? configurados : doEvento.map((c) => c.checkpointId);
}

function idsDosLocais(partida) {
  try {
    const lista = JSON.parse(partida?.locaisIds || 'null');
    return Array.isArray(lista) ? lista : null;
  } catch {
    return null;
  }
}

// Partida antiga (sem lista guardada): qualquer checkpoint serve.
function ehLocalDoJogo(partida, checkpointId) {
  const ids = idsDosLocais(partida);
  return !ids || ids.some((id) => mesmoId(id, checkpointId));
}

const letraDoLocal = (indice) => String.fromCharCode(65 + indice);

// ---------- lados ----------

// Quem joga de Rebeldes (tr) e de Agentes (ct) no round `numero` (trocam a cada `roundsPorLado` rounds).
function ladosDoRound(partida, numero) {
  const bloco = Math.floor((numero - 1) / partida.roundsPorLado);
  const trInicial = partida.timeTrInicialId;
  const outro = mesmoId(trInicial, partida.timeAId) ? partida.timeBId : partida.timeAId;
  return bloco % 2 === 0
    ? { timeTrId: trInicial, timeCtId: outro }
    : { timeTrId: outro, timeCtId: trInicial };
}

async function criarRound(partida, numero) {
  const { timeTrId, timeCtId } = ladosDoRound(partida, numero);
  const roundId = uuidv4();
  await query(
    `INSERT INTO roundBomba (roundId, partidaId, numero, timeTrId, timeCtId, status)
     VALUES (@roundId, @partidaId, @numero, @timeTrId, @timeCtId, 'aguardando')`,
    { roundId, partidaId: partida.partidaId, numero, timeTrId, timeCtId }
  );
  return buscarRoundAtual(partida.partidaId);
}

// ---------- jogadores ----------

const JOGADOR_ATIVO = "COALESCE(c.status, 'active') = 'active'";

// Dá o próximo número livre da equipe a quem ainda não tem (recreacionista pode trocar depois).
async function numerarJogadores(eventoId, timeIds) {
  for (const timeId of timeIds.filter(Boolean)) {
    const jogadores = await allQuery(
      `SELECT c.criancaId, c.numeroJogador FROM crianca c
       WHERE LOWER(c.eventoId) = LOWER(@eventoId) AND c.timeId = @timeId AND ${JOGADOR_ATIVO}
       ORDER BY c.criadoEm ASC, c.nome ASC`,
      { eventoId, timeId }
    );
    let proximo = jogadores.reduce((maior, j) => Math.max(maior, Number(j.numeroJogador) || 0), 0) + 1;
    for (const jogador of jogadores) {
      if (jogador.numeroJogador) continue;
      await query('UPDATE crianca SET numeroJogador = @numero WHERE criancaId = @criancaId', {
        numero: proximo, criancaId: jogador.criancaId,
      });
      proximo += 1;
    }
  }
}

async function definirNumeroJogador(eventoId, criancaId, numero) {
  const crianca = await queryOne(
    'SELECT criancaId, timeId, eventoId FROM crianca WHERE criancaId = @criancaId',
    { criancaId }
  );
  if (!crianca || !mesmoId(crianca.eventoId, eventoId)) throw erroHttp('Jogador não encontrado neste evento', 404);

  const valor = numero === null || numero === '' || numero === undefined ? null : Number(numero);
  if (valor !== null && (!Number.isInteger(valor) || valor < 1 || valor > 99)) {
    throw erroHttp('O número do jogador deve ser um inteiro de 1 a 99', 400);
  }
  if (valor !== null && crianca.timeId) {
    const repetido = await queryOne(
      `SELECT criancaId FROM crianca
       WHERE timeId = @timeId AND numeroJogador = @numero AND criancaId <> @criancaId`,
      { timeId: crianca.timeId, numero: valor, criancaId }
    );
    if (repetido) throw erroHttp(`Já existe um jogador número ${valor} nesta equipe`, 409);
  }
  await query('UPDATE crianca SET numeroJogador = @numero WHERE criancaId = @criancaId', { numero: valor, criancaId });
}

async function sortearPortador(round, eventoId) {
  const candidatos = await allQuery(
    `SELECT c.criancaId, c.numeroJogador FROM crianca c
     WHERE LOWER(c.eventoId) = LOWER(@eventoId) AND c.timeId = @timeId
       AND c.numeroJogador IS NOT NULL AND ${JOGADOR_ATIVO}`,
    { eventoId, timeId: round.timeTrId }
  );
  if (candidatos.length === 0) {
    throw erroHttp('A equipe dos Rebeldes não tem jogadores numerados. Numere os jogadores antes de iniciar o round.', 409);
  }
  return candidatos[Math.floor(Math.random() * candidatos.length)];
}

// ---------- partida ----------

async function pararPartidasDoEvento(eventoId, status = 'cancelada') {
  const partidas = await allQuery(
    `SELECT partidaId FROM partidaBomba WHERE LOWER(eventoId) = LOWER(@eventoId) AND status = 'em_andamento'`,
    { eventoId }
  );
  for (const { partidaId } of partidas) {
    await query(
      `UPDATE roundBomba SET status = 'finalizado', motivo = 'jogo_parado', finalizadoEm = @agora
       WHERE partidaId = @partidaId AND status IN ('aguardando', 'em_andamento', 'bomba_plantada')`,
      { partidaId, agora: new Date() }
    );
    await query(
      `UPDATE partidaBomba SET status = @status, finalizadoEm = @agora WHERE partidaId = @partidaId`,
      { partidaId, status, agora: new Date() }
    );
  }
  limparEmAndamentoDoEvento(eventoId);
  return partidas.length;
}

async function pararJogo(eventoId) {
  const total = await pararPartidasDoEvento(eventoId);
  if (total > 0) emitir(eventoId, 'BOMBA_PARTIDA_ENCERRADA', { cancelada: true });
}

async function dadosDosTimes(eventoId) {
  return allQuery(
    `SELECT timeId, nome, cor FROM "time" WHERE LOWER(eventoId) = LOWER(@eventoId)
     ORDER BY criadoEm ASC, nome ASC`,
    { eventoId }
  );
}

// Cria a partida (com o round 1 aguardando) para o evento. Sem escolha, usa as duas primeiras equipes.
async function iniciarJogo(eventoId, brincadeiraId, opcoes = {}) {
  const evento = await queryOne('SELECT eventoId, empresaId FROM evento WHERE LOWER(eventoId) = LOWER(@eventoId)', { eventoId });
  if (!evento) throw erroHttp('Evento não encontrado', 404);

  await pararPartidasDoEvento(eventoId);

  const times = await dadosDosTimes(eventoId);
  const timeAId = opcoes.timeAId || times[0]?.timeId;
  const timeBId = opcoes.timeBId || times.find((t) => !mesmoId(t.timeId, timeAId))?.timeId;
  if (!timeAId || !timeBId || mesmoId(timeAId, timeBId)) {
    throw erroHttp('O Conquistar e Destruir precisa de 2 equipes no evento.', 409);
  }
  const idsValidos = new Set(times.map((t) => String(t.timeId).toLowerCase()));
  if (!idsValidos.has(String(timeAId).toLowerCase()) || !idsValidos.has(String(timeBId).toLowerCase())) {
    throw erroHttp('As equipes escolhidas não pertencem ao evento', 400);
  }
  const timeTrInicialId = [timeAId, timeBId].find((id) => mesmoId(id, opcoes.timeTrInicialId)) || timeAId;
  const salva = await configSalvaDoJogo(brincadeiraId);
  const config = { ...PADROES, ...salva, ...normalizarConfig(opcoes.config) };

  const locais = await locaisDoJogo(evento.eventoId, brincadeiraId);
  if (locais.length < 2) throw erroHttp('O Conquistar e Destruir precisa de 2 checkpoints de bomba (locais A e B).', 409);

  const partidaId = uuidv4();
  await query(
    `INSERT INTO partidaBomba
       (partidaId, eventoId, empresaId, brincadeiraId, timeAId, timeBId, timeTrInicialId,
        vitoriasParaVencer, roundsPorLado, duracaoRoundSeg, plantarMs, desarmarMs, bombaSeg, locaisIds)
     VALUES (@partidaId, @eventoId, @empresaId, @brincadeiraId, @timeAId, @timeBId, @timeTrInicialId,
             @vitoriasParaVencer, @roundsPorLado, @duracaoRoundSeg, @plantarMs, @desarmarMs, @bombaSeg, @locaisIds)`,
    {
      partidaId, eventoId: evento.eventoId, empresaId: evento.empresaId, brincadeiraId: brincadeiraId || null,
      timeAId, timeBId, timeTrInicialId, locaisIds: JSON.stringify(locais), ...config,
    }
  );

  await numerarJogadores(evento.eventoId, [timeAId, timeBId]);
  const partida = await buscarPartida(partidaId);
  await criarRound(partida, 1);
  const estado = await obterEstado(evento.eventoId);
  emitir(evento.eventoId, 'BOMBA_ESTADO', { estado });
  return estado;
}

// Troca equipes, lado inicial e regras enquanto nenhum round começou.
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
  const config = normalizarConfig(opcoes.config);

  const atual = { ...partida, ...config, timeAId, timeBId, timeTrInicialId };
  await query(
    `UPDATE partidaBomba SET timeAId = @timeAId, timeBId = @timeBId, timeTrInicialId = @timeTrInicialId,
       vitoriasParaVencer = @vitoriasParaVencer, roundsPorLado = @roundsPorLado, duracaoRoundSeg = @duracaoRoundSeg,
       plantarMs = @plantarMs, desarmarMs = @desarmarMs, bombaSeg = @bombaSeg
     WHERE partidaId = @partidaId`,
    {
      partidaId, timeAId, timeBId, timeTrInicialId,
      vitoriasParaVencer: atual.vitoriasParaVencer, roundsPorLado: atual.roundsPorLado,
      duracaoRoundSeg: atual.duracaoRoundSeg, plantarMs: atual.plantarMs,
      desarmarMs: atual.desarmarMs, bombaSeg: atual.bombaSeg,
    }
  );
  const { timeTrId, timeCtId } = ladosDoRound(atual, round.numero);
  await query('UPDATE roundBomba SET timeTrId = @timeTrId, timeCtId = @timeCtId WHERE roundId = @roundId', {
    roundId: round.roundId, timeTrId, timeCtId,
  });
  await numerarJogadores(partida.eventoId, [timeAId, timeBId]);
  const estado = await obterEstado(partida.eventoId);
  emitir(partida.eventoId, 'BOMBA_ESTADO', { estado });
  return estado;
}

async function iniciarRound(partidaId) {
  const partida = await buscarPartida(partidaId);
  if (!partida || partida.status !== 'em_andamento') throw erroHttp('Partida não encontrada ou já encerrada', 404);
  const round = await buscarRoundAtual(partidaId);
  if (!round || round.status !== 'aguardando') throw erroHttp('Não há round aguardando para iniciar', 409);

  const portador = await sortearPortador(round, partida.eventoId);
  const resultado = await query(
    `UPDATE roundBomba SET status = 'em_andamento', iniciadoEm = @agora,
       portadorCriancaId = @portadorCriancaId, portadorNumero = @portadorNumero
     WHERE roundId = @roundId AND status = 'aguardando'`,
    { roundId: round.roundId, portadorCriancaId: portador.criancaId, portadorNumero: portador.numeroJogador, agora: new Date() }
  );
  if (!Number(resultado?.rowsAffected?.[0] || 0)) throw erroHttp('O round já foi iniciado', 409);
  console.log(`🎮 [BOMBA] Round ${round.numero} iniciado | portador: jogador nº ${portador.numeroJogador} | duração ${partida.duracaoRoundSeg}s, bomba ${partida.bombaSeg}s`);

  limparEmAndamentoDoEvento(partida.eventoId);
  const estado = await obterEstado(partida.eventoId);
  emitir(partida.eventoId, 'BOMBA_ROUND_INICIADO', { numero: round.numero, estado });
  return estado;
}

// Fecha o round, soma o ponto e prepara o próximo (ou encerra a partida). Devolve null se outro processo já fechou.
async function finalizarRound(round, partida, vencedorLado, motivo, detalhes = {}) {
  const vencedorTimeId = vencedorLado === 'tr' ? round.timeTrId : round.timeCtId;
  const resultado = await query(
    `UPDATE roundBomba SET status = 'finalizado', vencedorTimeId = @vencedorTimeId, motivo = @motivo,
       finalizadoEm = @agora, desarmadaPorCriancaId = COALESCE(@desarmadaPor, desarmadaPorCriancaId)
     WHERE roundId = @roundId AND status IN ('em_andamento', 'bomba_plantada')`,
    { roundId: round.roundId, vencedorTimeId, motivo, desarmadaPor: detalhes.desarmadaPorCriancaId || null, agora: detalhes.finalizadoEm || new Date() }
  );
  if (!Number(resultado?.rowsAffected?.[0] || 0)) return null;
  console.log(`🏁 [BOMBA] Round ${round.numero} encerrado | vencedor: ${vencedorLado === 'tr' ? 'Rebeldes' : 'Agentes'} | motivo: ${motivo}`);

  if (mesmoId(vencedorTimeId, partida.timeAId)) {
    await query('UPDATE partidaBomba SET vitoriasA = vitoriasA + 1 WHERE partidaId = @partidaId', { partidaId: partida.partidaId });
  } else {
    await query('UPDATE partidaBomba SET vitoriasB = vitoriasB + 1 WHERE partidaId = @partidaId', { partidaId: partida.partidaId });
  }
  const atualizada = await buscarPartida(partida.partidaId);
  limparEmAndamentoDoEvento(partida.eventoId);

  const partidaVencida = Math.max(atualizada.vitoriasA, atualizada.vitoriasB) >= atualizada.vitoriasParaVencer;
  if (partidaVencida) {
    const campeao = atualizada.vitoriasA >= atualizada.vitoriasB ? atualizada.timeAId : atualizada.timeBId;
    await query(
      `UPDATE partidaBomba SET status = 'finalizada', vencedorTimeId = @campeao, finalizadoEm = @agora
       WHERE partidaId = @partidaId`,
      { partidaId: partida.partidaId, campeao, agora: new Date() }
    );
  } else {
    await criarRound(atualizada, round.numero + 1);
  }

  const estado = await obterEstado(partida.eventoId);
  emitir(partida.eventoId, 'BOMBA_ROUND_ENCERRADO', {
    numero: round.numero, vencedorLado, vencedorTimeId, motivo, partidaEncerrada: partidaVencida, estado,
  });
  if (partidaVencida) emitir(partida.eventoId, 'BOMBA_PARTIDA_ENCERRADA', { vencedorTimeId, estado });
  return estado;
}

// O recreacionista encerra o round à mão (por exemplo, quando uma equipe inteira foi eliminada).
async function encerrarRoundManual(partidaId, vencedorLado) {
  if (vencedorLado !== 'tr' && vencedorLado !== 'ct') throw erroHttp("vencedor deve ser 'tr' ou 'ct'", 400);
  const partida = await buscarPartida(partidaId);
  if (!partida || partida.status !== 'em_andamento') throw erroHttp('Partida não encontrada ou já encerrada', 404);
  const round = await buscarRoundAtual(partidaId);
  if (!round || !['em_andamento', 'bomba_plantada'].includes(round.status)) {
    throw erroHttp('Não há round em andamento para encerrar', 409);
  }
  const estado = await finalizarRound(round, partida, vencedorLado, vencedorLado === 'tr' ? 'eliminacao_ct' : 'eliminacao_tr');
  if (!estado) throw erroHttp('O round já foi encerrado', 409);
  return estado;
}

// Explosão da bomba e fim do tempo do round. Chamada pelo relógio do servidor e a cada consulta de estado.
async function avaliarRound(partida, round, agora = new Date()) {
  if (!round || !partida || partida.status !== 'em_andamento') return round;

  if (round.status === 'bomba_plantada' && round.plantadaEm) {
    if (agora.getTime() >= new Date(round.plantadaEm).getTime() + partida.bombaSeg * 1000) {
      // O fim vale o instante da explosão (não o da checagem, que pode atrasar até 1 s): todos os checkpoints
      // contam a vitória a partir dele e tocam juntos.
      await finalizarRound(round, partida, 'tr', 'explodiu', {
        finalizadoEm: new Date(new Date(round.plantadaEm).getTime() + partida.bombaSeg * 1000),
      });
      return buscarRoundAtual(partida.partidaId);
    }
  } else if (round.status === 'em_andamento' && round.iniciadoEm) {
    if (agora.getTime() >= new Date(round.iniciadoEm).getTime() + partida.duracaoRoundSeg * 1000) {
      await finalizarRound(round, partida, 'ct', 'tempo', {
        finalizadoEm: new Date(new Date(round.iniciadoEm).getTime() + partida.duracaoRoundSeg * 1000),
      });
      return buscarRoundAtual(partida.partidaId);
    }
  }
  return round;
}

async function avaliarTodos() {
  const ativos = await allQuery(
    `SELECT r.roundId, r.partidaId FROM roundBomba r WHERE r.status IN ('em_andamento', 'bomba_plantada')`
  );
  for (const { partidaId } of ativos) {
    try {
      const partida = await buscarPartida(partidaId);
      const round = await buscarRoundAtual(partidaId);
      await avaliarRound(partida, round);
    } catch (erro) {
      console.error('❌ [BOMBA] Erro ao avaliar round:', erro.message);
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

function restanteMs(inicio, duracaoMs, agora) {
  if (!inicio) return null;
  return Math.max(0, new Date(inicio).getTime() + duracaoMs - agora.getTime());
}

function negado(motivo, mensagem, extra = {}) {
  console.log(`⛔ [BOMBA] Leitura negada: ${motivo} (${mensagem})`);
  return { ok: true, registered: true, autorizado: false, tipo: 'bomba', acao: 'negado', motivo, mensagem, ...extra };
}

/**
 * Processa uma leitura (a cada 500 ms enquanto a pulseira está no leitor).
 * Devolve sempre um objeto com `acao`: plantando | plantada | desarmando | desarmada | negado | sem_partida.
 */
async function processarLeitura({ checkpointId, uid }) {
  const normalizado = normalizeUid(uid);
  if (!checkpointId || !normalizado) throw erroHttp('checkpointId e uid são obrigatórios', 400);

  const checkpoint = await queryOne(
    `SELECT checkpointId, eventoId, empresaId, status, proposito FROM pontoVerificacao
     WHERE LOWER(checkpointId) = LOWER(@checkpointId)`,
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
    `SELECT c.criancaId, c.nome, c.apelido, c.timeId, c.eventoId, c.empresaId, c.numeroJogador
     FROM crianca c WHERE ${uidSqlExpression('c.codigoPulseira')} = @uid AND LOWER(c.eventoId) = LOWER(@eventoId)`,
    { uid: normalizado, eventoId: checkpoint.eventoId }
  );
  if (!crianca) {
    return { ok: true, registered: false, autorizado: false, tipo: 'bomba', acao: 'negado', motivo: 'pulseira_sem_cadastro', mensagem: 'Pulseira não cadastrada neste evento' };
  }

  const agora = new Date();
  const partida = await buscarPartidaAtiva(checkpoint.eventoId);
  if (!partida) return { ok: true, registered: true, autorizado: false, tipo: 'bomba', acao: 'sem_partida', mensagem: 'Nenhuma partida em andamento' };

  if (!ehLocalDoJogo(partida, checkpoint.checkpointId)) {
    return negado('fora_do_jogo', 'Este checkpoint não é um local de bomba deste jogo');
  }

  let round = await buscarRoundAtual(partida.partidaId);
  round = await avaliarRound(partida, round, agora);
  const partidaAtual = await buscarPartida(partida.partidaId);
  if (partidaAtual.status !== 'em_andamento') {
    return { ok: true, registered: true, autorizado: false, tipo: 'bomba', acao: 'sem_partida', mensagem: 'A partida terminou' };
  }
  if (!round || !['em_andamento', 'bomba_plantada'].includes(round.status)) {
    return negado('aguardando_round', 'Aguarde o recreacionista iniciar o round');
  }

  const lado = mesmoId(crianca.timeId, round.timeTrId) ? 'tr' : mesmoId(crianca.timeId, round.timeCtId) ? 'ct' : null;
  if (!lado) return negado('fora_da_partida', 'Sua equipe não está jogando esta partida');

  const base = { round: round.numero, lado, totalBombaSeg: partidaAtual.bombaSeg };

  // ----- bomba ainda não plantada: só o portador sorteado planta -----
  if (round.status === 'em_andamento') {
    if (lado === 'ct') return negado('ct_sem_bomba', 'A bomba ainda não foi plantada', base);
    if (!mesmoId(crianca.criancaId, round.portadorCriancaId)) {
      return negado('nao_e_portador', `Só o jogador nº ${round.portadorNumero} pode plantar a bomba`, base);
    }
    const progresso = avancarLeitura(checkpoint, crianca, round, 'plantar', agora);
    if (progresso < partidaAtual.plantarMs) {
      registrarFimDaLeitura(checkpoint.checkpointId);
      return { ok: true, registered: true, autorizado: true, tipo: 'bomba', acao: 'plantando', progressoMs: progresso, totalMs: partidaAtual.plantarMs, ...base };
    }

    const plantou = await query(
      `UPDATE roundBomba SET status = 'bomba_plantada', plantadaEm = @agora,
         localCheckpointId = @checkpointId, plantadaPorCriancaId = @criancaId
       WHERE roundId = @roundId AND status = 'em_andamento'`,
      { roundId: round.roundId, checkpointId: checkpoint.checkpointId, criancaId: crianca.criancaId, agora: new Date() }
    );
    console.log(`💣 [BOMBA] Plantada no checkpoint ${checkpoint.checkpointId} por ${crianca.apelido || crianca.nome} | explode em ${partidaAtual.bombaSeg}s`);
    leiturasEmAndamento.delete(chave(checkpoint.checkpointId));
    if (!Number(plantou?.rowsAffected?.[0] || 0)) return negado('bomba_em_outro_local', 'A bomba já foi plantada em outro local', base);

    const estado = await obterEstado(checkpoint.eventoId);
    emitir(checkpoint.eventoId, 'BOMBA_PLANTADA', { numero: round.numero, localCheckpointId: checkpoint.checkpointId, estado });
    return {
      ok: true, registered: true, autorizado: true, tipo: 'bomba', acao: 'plantada',
      progressoMs: partidaAtual.plantarMs, totalMs: partidaAtual.plantarMs,
      restanteBombaMs: partidaAtual.bombaSeg * 1000, ...base,
    };
  }

  // ----- bomba plantada: só os Agentes desarmam, e só no local da bomba -----
  if (!mesmoId(checkpoint.checkpointId, round.localCheckpointId)) {
    return negado('bomba_em_outro_local', 'A bomba foi plantada em outro local', base);
  }
  const restante = restanteMs(round.plantadaEm, partidaAtual.bombaSeg * 1000, agora);
  if (lado === 'tr') return negado('tr_no_local', 'Defenda a bomba: sua equipe não pode desarmá-la', { ...base, restanteBombaMs: restante });

  const progresso = avancarLeitura(checkpoint, crianca, round, 'desarmar', agora);
  if (progresso < partidaAtual.desarmarMs) {
    registrarFimDaLeitura(checkpoint.checkpointId);
    return {
      ok: true, registered: true, autorizado: true, tipo: 'bomba', acao: 'desarmando',
      progressoMs: progresso, totalMs: partidaAtual.desarmarMs, restanteBombaMs: restante, ...base,
    };
  }
  // O tempo da bomba pode ter acabado durante a leitura: a explosão vale mais do que um desarme tardio.
  if (restante !== null && restante <= 0) return negado('tempo_esgotado', 'A bomba explodiu', base);

  leiturasEmAndamento.delete(chave(checkpoint.checkpointId));
  const fechado = await finalizarRound(round, partidaAtual, 'ct', 'desarmada', { desarmadaPorCriancaId: crianca.criancaId });
  if (!fechado) return negado('round_encerrado', 'O round já terminou', base);
  return {
    ok: true, registered: true, autorizado: true, tipo: 'bomba', acao: 'desarmada',
    progressoMs: partidaAtual.desarmarMs, totalMs: partidaAtual.desarmarMs, ...base,
  };
}

// A pausa entre leituras conta a partir do FIM do processamento anterior: com o banco remoto uma leitura leva mais de 1 s
// e, contada do início, derrubaria o tempo de quem está segurando a pulseira direito.
function registrarFimDaLeitura(checkpointId) {
  const atual = leiturasEmAndamento.get(chave(checkpointId));
  if (atual) atual.ultimaLeitura = Date.now();
}

// Continua (ou recomeça) a contagem de quem está com a pulseira no leitor. Devolve o tempo já cumprido em ms.
function avancarLeitura(checkpoint, crianca, round, tipo, agora) {
  const id = chave(checkpoint.checkpointId);
  const atual = leiturasEmAndamento.get(id);
  const continua = atual
    && atual.tipo === tipo
    && mesmoId(atual.criancaId, crianca.criancaId)
    && atual.roundId === round.roundId
    && agora.getTime() - atual.ultimaLeitura <= TOLERANCIA_LEITURA_MS;

  if (continua) {
    atual.ultimaLeitura = agora.getTime();
    return agora.getTime() - atual.inicio;
  }
  leiturasEmAndamento.set(id, {
    eventoId: checkpoint.eventoId, checkpointId: checkpoint.checkpointId, tipo,
    criancaId: crianca.criancaId, roundId: round.roundId,
    inicio: agora.getTime(), ultimaLeitura: agora.getTime(),
  });
  return 0;
}

// ---------- estado (painéis e checkpoints) ----------

async function obterEstado(eventoId) {
  const agora = new Date();
  const partida = await buscarPartidaAtiva(eventoId);
  if (!partida) {
    const ultima = await queryOne(
      `SELECT TOP 1 * FROM partidaBomba WHERE LOWER(eventoId) = LOWER(@eventoId) ORDER BY iniciadoEm DESC`,
      { eventoId }
    );
    const timesDaUltima = ultima ? await dadosDosTimes(eventoId) : [];
    return { agora: agora.toISOString(), ativa: false, partida: ultima ? montarPartida(ultima, timesDaUltima) : null, round: null, locais: [], jogadores: [], emAndamento: [] };
  }

  const round = await buscarRoundAtual(partida.partidaId);
  const times = await dadosDosTimes(eventoId);
  const nomeDoTime = (id) => times.find((t) => mesmoId(t.timeId, id)) || null;
  const jogadores = await allQuery(
    `SELECT c.criancaId, c.nome, c.apelido, c.avatar, c.timeId, c.numeroJogador FROM crianca c
     WHERE LOWER(c.eventoId) = LOWER(@eventoId) AND c.timeId IN (@timeAId, @timeBId) AND ${JOGADOR_ATIVO}
     ORDER BY c.timeId, c.numeroJogador, c.nome`,
    { eventoId, timeAId: partida.timeAId, timeBId: partida.timeBId }
  );
  const ultimo = round && round.status !== 'finalizado' && round.numero > 1
    ? await buscarUltimoRoundFinalizado(partida.partidaId)
    : (round && round.status === 'finalizado' ? round : null);

  // Locais da bomba (A, B...) com o nome do checkpoint cadastrado.
  const checkpointsDoEvento = await allQuery(
    `SELECT checkpointId, nome, status FROM pontoVerificacao
     WHERE LOWER(eventoId) = LOWER(@eventoId) AND LOWER(COALESCE(proposito, 'game')) <> 'reception'
     ORDER BY criadoEm ASC, nome ASC`,
    { eventoId }
  );
  const idsConfigurados = idsDosLocais(partida) || checkpointsDoEvento.map((c) => c.checkpointId);
  const locais = idsConfigurados.map((id, indice) => {
    const linha = checkpointsDoEvento.find((c) => mesmoId(c.checkpointId, id));
    return {
      checkpointId: id,
      letra: letraDoLocal(indice),
      nome: linha?.nome || id,
      online: String(linha?.status || '').toLowerCase() === 'online',
    };
  });
  const localPor = (checkpointId) => locais.find((l) => mesmoId(l.checkpointId, checkpointId)) || null;

  const emAndamento = [...leiturasEmAndamento.values()]
    .filter((l) => mesmoId(l.eventoId, eventoId) && agora.getTime() - l.ultimaLeitura <= TOLERANCIA_LEITURA_MS)
    .map((l) => ({
      checkpointId: l.checkpointId, tipo: l.tipo, criancaId: l.criancaId,
      progressoMs: l.ultimaLeitura - l.inicio,
      totalMs: l.tipo === 'plantar' ? partida.plantarMs : partida.desarmarMs,
    }));

  return {
    agora: agora.toISOString(),
    ativa: true,
    partida: montarPartida(partida, times),
    round: round ? {
      roundId: round.roundId,
      numero: round.numero,
      status: round.status,
      timeTr: nomeDoTime(round.timeTrId),
      timeCt: nomeDoTime(round.timeCtId),
      portadorCriancaId: round.portadorCriancaId,
      portadorNumero: round.portadorNumero,
      localCheckpointId: round.localCheckpointId,
      local: localPor(round.localCheckpointId),
      restanteRoundMs: round.status === 'em_andamento' ? restanteMs(round.iniciadoEm, partida.duracaoRoundSeg * 1000, agora) : null,
      restanteBombaMs: round.status === 'bomba_plantada' ? restanteMs(round.plantadaEm, partida.bombaSeg * 1000, agora) : null,
      vencedorTimeId: round.vencedorTimeId,
      motivo: round.motivo,
    } : null,
    ultimoResultado: ultimo && ultimo.status === 'finalizado' ? {
      numero: ultimo.numero,
      vencedorTimeId: ultimo.vencedorTimeId,
      vencedorLado: mesmoId(ultimo.vencedorTimeId, ultimo.timeTrId) ? 'tr' : 'ct',
      motivo: ultimo.motivo,
      finalizadoEm: ultimo.finalizadoEm,
      local: localPor(ultimo.localCheckpointId),
    } : null,
    locais,
    jogadores,
    emAndamento,
  };
}

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
      plantarMs: partida.plantarMs,
      desarmarMs: partida.desarmarMs,
      bombaSeg: partida.bombaSeg,
    },
  };
}

// O que um checkpoint precisa saber para acender o LED e tocar o som certo.
async function obterEstadoCheckpoint(checkpointId) {
  const checkpoint = await queryOne(
    `SELECT checkpointId, eventoId, proposito FROM pontoVerificacao WHERE LOWER(checkpointId) = LOWER(@checkpointId)`,
    { checkpointId }
  );
  if (!checkpoint) throw erroHttp('Checkpoint não encontrado', 404);

  const agora = new Date();
  const partida = await buscarPartidaAtiva(checkpoint.eventoId);
  if (!partida) return { ok: true, ativo: false, fase: 'sem_partida' };
  if (!ehLocalDoJogo(partida, checkpoint.checkpointId)) return { ok: true, ativo: false, fase: 'fora_do_jogo' };

  let round = await buscarRoundAtual(partida.partidaId);
  round = await avaliarRound(partida, round, agora);
  const partidaAtual = await buscarPartida(partida.partidaId);
  if (partidaAtual.status !== 'em_andamento') return { ok: true, ativo: false, fase: 'sem_partida' };
  round = await buscarRoundAtual(partidaAtual.partidaId);

  const base = {
    ok: true, ativo: true, round: round?.numero || 0,
    plantarMs: partidaAtual.plantarMs, desarmarMs: partidaAtual.desarmarMs, bombaSeg: partidaAtual.bombaSeg,
  };

  if (round && round.status === 'em_andamento') {
    return { ...base, fase: 'round', restanteRoundMs: restanteMs(round.iniciadoEm, partidaAtual.duracaoRoundSeg * 1000, agora) };
  }
  if (round && round.status === 'bomba_plantada') {
    const ehLocal = mesmoId(checkpoint.checkpointId, round.localCheckpointId);
    return { ...base, fase: ehLocal ? 'plantada' : 'bloqueado', ehLocal, restanteBombaMs: restanteMs(round.plantadaEm, partidaAtual.bombaSeg * 1000, agora) };
  }

  // Round aguardando: mostra por alguns segundos como o round anterior terminou.
  const anterior = round && round.numero > 1 ? await buscarUltimoRoundFinalizado(partidaAtual.partidaId) : null;
  if (anterior && anterior.finalizadoEm && agora.getTime() - new Date(anterior.finalizadoEm).getTime() <= MOSTRAR_RESULTADO_MS) {
    return {
      ...base, fase: 'resultado',
      resultado: {
        vencedorLado: mesmoId(anterior.vencedorTimeId, anterior.timeTrId) ? 'tr' : 'ct',
        motivo: anterior.motivo,
        haMs: agora.getTime() - new Date(anterior.finalizadoEm).getTime(),
        localCheckpointId: anterior.localCheckpointId,
        ehLocal: mesmoId(checkpoint.checkpointId, anterior.localCheckpointId),
      },
    };
  }
  return { ...base, fase: 'aguardando_round' };
}

module.exports = {
  BOMBA_GAME_TYPE,
  LIMITES,
  listarJogos,
  salvarJogo,
  MENSAGEM_PLANO,
  empresaTemPlanoPulynBall,
  PADROES,
  TOLERANCIA_LEITURA_MS,
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
  buscarPartida,
  iniciarRelogio,
  avaliarTodos,
  ladosDoRound,
};
