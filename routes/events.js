const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { query, queryOne, allQuery, withTransaction } = require('../database');
const { verifyToken, requireRole, isMaster } = require('../utils/middleware');
const { getAvatarForCreate } = require('../utils/avatar');
const { checkGameStartRequirements } = require('../utils/gameRequirements');
const { saveGameState, getGameState } = require('../utils/gameState');
const {
  isClosedStatus,
  startEvent,
  ensureEventActive,
  finishEvent,
  reopenEvent,
  wallClockNow,
  wallClockOf,
} = require('../utils/eventLifecycle');
const {
  MONSTER_GAME_TYPE,
  startMonsterGame,
  stopMonsterGame,
} = require('../utils/monster');
const {
  TREASURE_GAME_TYPE,
  startTreasureGame,
  stopTreasureGame,
} = require('../utils/treasure');
const {
  startZoneConquestTeam,
  stopZoneConquestTeam,
} = require('../utils/zoneConquestTeam');
const {
  startZoneConquestIndividual,
  stopZoneConquestIndividual,
} = require('../utils/zoneConquestIndividualDB');

function sameId(left, right) {
  return left !== null && left !== undefined
    && right !== null && right !== undefined
    && String(left).trim().toLowerCase() === String(right).trim().toLowerCase();
}

function broadcastGameEvent(eventoId, type, payload = {}) {
  if (global.broadcastToEvent) {
    global.broadcastToEvent(eventoId, {
      type,
      payload: { ...payload, eventoId },
    });
  }
}

// ✅ Exceção: leitura de zonas e planta baixa do mapa — o app da família
// precisa desses dois endpoints para exibir o mapa/rastreio do evento (eles
// já têm sua própria checagem de acesso liberando o role 'family' logo
// abaixo). Sem essa exceção, esse portão bloqueava a requisição antes
// mesmo de chegar nessa checagem, tornando-a inalcançável.
const FAMILY_ALLOWED_READ_PATH = /\/[^/]+\/(zones|floor-plan)$/;

router.use(verifyToken, (req, res, next) => {
  const isFamilyAllowedRead = req.method === 'GET' && FAMILY_ALLOWED_READ_PATH.test(req.path);
  if (req.user?.role === 'family' && !isFamilyAllowedRead) {
    return res.status(403).json({ error: 'Famílias devem usar os endpoints de vínculo familiar' });
  }
  next();
});

// Listar eventos
router.get('/', verifyToken, async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const role = req.user.role;
    
    // Se for master, retorna eventos de TODAS as empresas (exceto Master Admin)
    let eventos;
    if (isMaster(req)) {
      eventos = await allQuery(
        `SELECT * FROM evento 
         WHERE empresaId IS NOT NULL
           AND empresaId NOT IN (SELECT empresaId FROM empresa WHERE nome = 'Master Admin')
         ORDER BY data DESC`
      );
    } else {
      eventos = await allQuery(
        'SELECT * FROM evento WHERE empresaId = @empresa_id ORDER BY data DESC',
        { empresa_id }
      );
    }
    
    res.json(eventos);
  } catch (err) {
    console.error('❌ Erro ao listar eventos:', err);
    res.status(500).json({ error: err.message });
  }
});

const MAX_RESPONSIBLE_NAME = 150;

// Jogos do evento: um jogo pertence a um evento pelo vínculo direto (brincadeiras.evento_id, do
// evento em que foi criado) ou por um vínculo extra em evento_brincadeiras. Deixa o evento com
// exatamente os jogos informados: vincula os novos, tira os desmarcados e, se um jogo criado
// neste evento for desmarcado, solta o vínculo direto dele. Deve rodar dentro de uma transação.
async function syncEventGames(eventoId, empresaId, gameIds) {
  const wanted = Array.from(new Set((Array.isArray(gameIds) ? gameIds : []).map((id) => String(id).trim()).filter(Boolean)));
  const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

  for (const gameId of wanted) {
    const game = await queryOne(
      "SELECT brincadeiraId, empresaId FROM brincadeira WHERE LOWER(brincadeiraId) = LOWER(@id) AND LOWER(COALESCE(status, 'active')) <> 'archived'",
      { id: gameId }
    );
    if (!game) {
      const error = new Error('Um dos jogos selecionados não foi encontrado');
      error.statusCode = 400;
      throw error;
    }
    if (!same(game.empresa_id, empresaId)) {
      const error = new Error('Um dos jogos selecionados pertence a outra empresa');
      error.statusCode = 403;
      throw error;
    }
  }

  const owned = await allQuery(
    "SELECT brincadeiraId FROM brincadeira WHERE LOWER(eventoId) = LOWER(@eventoId) AND LOWER(COALESCE(status, 'active')) <> 'archived'",
    { eventoId }
  );
  const links = await allQuery(
    'SELECT brincadeiraId FROM eventoBrincadeira WHERE LOWER(eventoId) = LOWER(@eventoId)',
    { eventoId }
  );
  const isWanted = (id) => wanted.some((w) => same(w, id));
  const isOwned = (id) => owned.some((o) => same(o.id, id));
  const isLinked = (id) => links.some((l) => same(l.brincadeira_id, id));

  for (const [order, gameId] of wanted.entries()) {
    if (!isOwned(gameId) && !isLinked(gameId)) {
      await query(
        'INSERT INTO eventoBrincadeira (eventoId, brincadeiraId, ordem) VALUES (@eventoId, @gameId, @order)',
        { eventoId, gameId, order }
      );
    }
  }
  for (const link of links) {
    if (!isWanted(link.brincadeira_id)) {
      await query(
        'DELETE FROM eventoBrincadeira WHERE LOWER(eventoId) = LOWER(@eventoId) AND LOWER(brincadeiraId) = LOWER(@gameId)',
        { eventoId, gameId: link.brincadeira_id }
      );
    }
  }
  for (const game of owned) {
    if (!isWanted(game.id)) {
      await query('UPDATE brincadeira SET eventoId = NULL WHERE LOWER(brincadeiraId) = LOWER(@gameId)', { gameId: game.id });
    }
  }
}

// Criar evento
router.post('/', verifyToken, async (req, res) => {
  try {
    const { name, description, date, time, duration, enableDisplay, enableLocation, responsibleName, autoStart, autoEnd, games } = req.body;
    const empresa_id = req.user.empresa_id;
    const id = uuidv4();

    // Validar campos obrigatórios
    if (!name || !date) {
      return res.status(400).json({ error: 'Nome e data são obrigatórios' });
    }
    const responsible = String(responsibleName || '').trim();
    if (!responsible) {
      return res.status(400).json({ error: 'Informe o nome do contratante/responsável pelo evento' });
    }
    if (responsible.length > MAX_RESPONSIBLE_NAME) {
      return res.status(400).json({ error: `O nome do contratante deve ter no máximo ${MAX_RESPONSIBLE_NAME} caracteres` });
    }

    // Início/encerramento automáticos ficam ligados por padrão; o início
    // automático precisa de horário para saber quando começar.
    const wantsAutoStart = autoStart === undefined ? true : Boolean(autoStart);
    const wantsAutoEnd = autoEnd === undefined ? true : Boolean(autoEnd);
    if (wantsAutoStart && !time) {
      return res.status(400).json({ error: 'Informe o horário para o evento iniciar automaticamente' });
    }

    // O evento e os jogos dele são gravados juntos: jogo inválido cancela a criação do evento.
    await withTransaction(async () => {
      await query(
        `INSERT INTO evento (eventoId, empresaId, nome, descricao, data, hora, duracao, exibirDisplay, exibirLocalizacao, status,
                              nomeResponsavel, autoInicio, autoFim)
         VALUES (@id, @empresa_id, @name, @description, @date, @time, @duration, @enableDisplay, @enableLocation, 'scheduled',
                 @responsibleName, @autoStart, @autoEnd)`,
        {
          id,
          empresa_id,
          name,
          description,
          date,
          time: time || null,
          duration: parseInt(duration) || 60,
          enableDisplay: enableDisplay ? 1 : 0,
          enableLocation: enableLocation ? 1 : 0,
          responsibleName: responsible,
          autoStart: wantsAutoStart ? 1 : 0,
          autoEnd: wantsAutoEnd ? 1 : 0,
        }
      );
      if (Array.isArray(games)) await syncEventGames(id, empresa_id, games);
    });

    res.json({
      id, empresa_id, name, description, date, time, duration, enableDisplay, enableLocation,
      status: 'scheduled',
      responsible_name: responsible,
      auto_start: wantsAutoStart ? 1 : 0,
      auto_end: wantsAutoEnd ? 1 : 0,
    });
  } catch (err) {
    console.error('❌ Erro ao criar evento:', err);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ==================== ROTAS ANINHADAS (devem estar ANTES de /:id) ====================

// Listar crianças de um evento
router.get('/:evento_id/criancas', verifyToken, async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const evento_id = req.params.evento_id;
    
    // ✅ Validar que o evento pertence à empresa do usuário
    const evento = await queryOne(
      'SELECT eventoId, empresaId FROM evento WHERE eventoId = @id',
      { id: evento_id }
    );
    
    if (!evento) {
      return res.status(404).json({ error: 'Evento não encontrado' });
    }
    
    if (!isMaster(req) && evento.empresa_id !== empresa_id) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence a esta empresa' });
    }
    
    const criancas = await allQuery(`
      SELECT c.*, t.nome as time_name, t.cor as time_color 
      FROM crianca c
      LEFT JOIN time t ON c.timeId = t.timeId
      WHERE c.eventoId = @evento_id
      AND c.empresaId = @empresa_id
      ORDER BY c.pontos DESC
    `, { evento_id, empresa_id });
    res.json(criancas);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Criar criança em um evento
router.post('/:evento_id/criancas', verifyToken, async (req, res) => {
  try {
    const { name, nickname, age, avatar, braceletCode, timeId } = req.body;
    const avatarValue = getAvatarForCreate(avatar);
    const evento_id = req.params.evento_id;
    const empresa_id = req.user.empresa_id;
    const id = uuidv4();

    if (!avatarValue) {
      return res.status(400).json({ error: 'Avatar inválido' });
    }
    
    // 1. Validar evento e verificar permissão
    const evento = await queryOne('SELECT empresaId FROM evento WHERE eventoId = @id', { id: evento_id });
    if (!evento || !evento.empresa_id) {
      return res.status(404).json({ error: 'Evento não encontrado ou sem empresa definida' });
    }
    
    // ✅ Verificar permissão (apenas master ou de mesma empresa)
    if (!isMaster(req) && evento.empresa_id !== empresa_id) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence a esta empresa' });
    }
    
    // 2. Validar se pulseira já está vinculada
    if (braceletCode) {
      const existing = await queryOne('SELECT criancaId FROM crianca WHERE codigoPulseira = @code', { code: braceletCode });
      if (existing) {
        return res.status(400).json({ error: 'Pulseira já está vinculada a outra criança' });
      }
    }
    
    // 3. Inserir criança
    await query(
      `INSERT INTO crianca (criancaId, eventoId, empresaId, timeId, nome, apelido, idade, avatar, codigoPulseira, pontos) 
       VALUES (@id, @evento_id, @empresa_id, @time_id, @name, @nickname, @age, @avatar, @bracelet_code, 0)`,
      { 
        id, 
        evento_id,
        empresa_id: evento.empresa_id,
        time_id: timeId || null, 
        name, 
        nickname, 
        age: parseInt(age) || 0, 
        avatar: avatarValue,
        bracelet_code: braceletCode || null
      }
    );
    
    // 4. Atualizar status da pulseira se foi fornecida
    if (braceletCode) {
      await query(
        'UPDATE pulseira SET status = @status, criancaId = @crianca_id WHERE codigo = @code', 
        { status: 'em_uso', crianca_id: id, code: braceletCode }
      );
    }
    
    // 5. Atualizar pontos do time
    if (timeId) {
      await query(
        `UPDATE time SET pontos = (SELECT ISNULL(SUM(pontos), 0) FROM crianca WHERE timeId = @time_id) 
         WHERE timeId = @time_id`,
        { time_id: timeId }
      );
    }
    
    res.json({ id, name, nickname, age, avatar: avatarValue, braceletCode, timeId, scores: 0, empresa_id: evento.empresa_id });
  } catch (err) {
    console.error('❌ Erro ao criar criança:', err);
    res.status(500).json({ error: err.message });
  }
});

// Listar times de um evento
router.get('/:evento_id/times', verifyToken, async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const evento_id = req.params.evento_id;
    
    // ✅ Validar que o evento pertence à empresa do usuário
    const evento = await queryOne(
      'SELECT eventoId, empresaId FROM evento WHERE eventoId = @id',
      { id: evento_id }
    );
    
    if (!evento) {
      return res.status(404).json({ error: 'Evento não encontrado' });
    }
    
    if (!isMaster(req) && evento.empresa_id !== empresa_id) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence a esta empresa' });
    }
    
    const times = await allQuery(`
      SELECT * FROM time 
      WHERE eventoId = @evento_id
      AND empresaId = @empresa_id
      ORDER BY pontos DESC
    `, { evento_id, empresa_id });
    res.json(times);
  } catch (err) {
    console.error('❌ Erro ao listar times:', err);
    res.status(500).json({ error: err.message });
  }
});

// Status do jogo (se está em andamento ou não)
router.get('/:evento_id/game-status', verifyToken, async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const evento_id = req.params.evento_id;
    
    // ✅ Validar que o evento pertence à empresa do usuário
    const evento = await queryOne(
      'SELECT eventoId, status, empresaId FROM evento WHERE eventoId = @id',
      { id: evento_id }
    );
    
    if (!evento) {
      return res.status(404).json({ gameRunning: false });
    }
    
    if (!isMaster(req) && evento.empresa_id !== empresa_id) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence a esta empresa' });
    }
    
    // "Jogo em andamento" vem do estado do jogo. eventos.status agora é só o
    // ciclo de vida do evento (agendado/ativo/encerrado).
    const gameState = await getGameState(evento.id);
    res.json({
      gameRunning: gameState?.mode === 'game' && !isClosedStatus(evento.status),
      status: evento.status
    });
  } catch (err) {
    console.error('❌ Erro ao buscar status do jogo:', err);
    res.status(500).json({ gameRunning: false });
  }
});

// Jogo ativo (tipo de jogo em execução: color_detection, zone_conquest, etc)
router.get('/:evento_id/active-game', verifyToken, async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const evento_id = req.params.evento_id;
    
    // ✅ Validar que o evento pertence à empresa do usuário
    const evento = await queryOne(
      'SELECT e.eventoId, e.empresaId, e.tipoJogoAtivo, b.nome as game_name, b.tipo as game_type FROM evento e LEFT JOIN brincadeira b ON e.brincadeiraAtivaId = b.brincadeiraId WHERE e.eventoId = @id',
      { id: evento_id }
    );
    
    if (!evento) {
      return res.status(404).json({ gameType: 'none' });
    }
    
    if (!isMaster(req) && evento.empresa_id !== empresa_id) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence a esta empresa' });
    }
    
    const gameType = evento.active_game_type || evento.game_type || 'none';
    
    res.json({ 
      gameType,
      gameName: evento.game_name,
      eventoId: evento.id
    });
  } catch (err) {
    console.error('❌ Erro ao buscar jogo ativo:', err);
    // Fallback: retornar tipo padrão
    res.status(500).json({ gameType: 'color_detection', error: 'Erro ao buscar tipo de jogo, usando padrão' });
  }
});

// Iniciar jogo (define o tipo de jogo e ativa o evento)
router.post('/:evento_id/start-game', verifyToken, requireRole('admin', 'game_master', 'master'), async (req, res) => {
  try {
    const { brincadeiraId } = req.body;
    const evento_id = req.params.evento_id;
    
    const evento = await queryOne(
      'SELECT eventoId, empresaId, status FROM evento WHERE eventoId = @id',
      { id: evento_id }
    );
    if (!evento) return res.status(404).json({ error: 'Evento não encontrado' });
    if (!isMaster(req) && evento.empresa_id !== req.user.empresa_id) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence a esta empresa' });
    }
    if (isClosedStatus(evento.status)) {
      return res.status(409).json({ error: 'Este evento já foi encerrado. Não é possível iniciar um jogo nele.' });
    }

    // Buscar a brincadeira para pegar o tipo
    const brincadeira = await queryOne(
      `SELECT brincadeiraId, nome, tipo, tipoJogo, empresaId FROM brincadeira
       WHERE brincadeiraId = @id
         AND LOWER(COALESCE(status, 'active')) <> 'archived'`,
      { id: brincadeiraId }
    );
    
    if (!brincadeira) {
      return res.status(404).json({ error: 'Jogo não encontrado' });
    }
    if (!isMaster(req) && brincadeira.empresa_id && brincadeira.empresa_id !== req.user.empresa_id) {
      return res.status(403).json({ error: 'Acesso negado: jogo não pertence a esta empresa' });
    }

    // O jogo só começa se o evento tiver o mínimo de checkpoints online para ele (antes de apagar/resetar qualquer dado)
    const requirement = await checkGameStartRequirements(evento_id, brincadeira);
    if (!requirement.ok) {
      return res.status(409).json({ error: requirement.message, requirement });
    }

    const rawGameType = brincadeira.type || brincadeira.game_type || 'standard';
    const gameType = [MONSTER_GAME_TYPE, TREASURE_GAME_TYPE, 'zone_conquest_team', 'zone_conquest_individual'].includes(rawGameType)
      ? rawGameType
      : rawGameType || 'standard';
    
    // 🆕 Resetar dados de leituras anteriores (reset dos dados de jogo)
    await query(
      `DELETE FROM leitura 
       WHERE criancaId IN (
         SELECT criancaId FROM crianca WHERE eventoId = @eventoId
       )
       AND brincadeiraId NOT IN (
         SELECT brincadeiraId FROM brincadeira 
         WHERE LOWER(COALESCE(status, 'active')) = 'archived'
       )`,
      { eventoId: evento_id }
    );
    
    // 🆕 Resetar dados de Zone Conquest INDIVIDUAL (na ordem correta das foreign keys)
    await query(
      `DELETE FROM zonaConquistaLeituraIndividual
       WHERE eventoId = @eventoId`,
      { eventoId: evento_id }
    );
    await query(
      `DELETE FROM zonaConquistaProtecaoCheckpointIndividual
       WHERE partidaId IN (
         SELECT id FROM zonaConquistaPartidaIndividual WHERE eventoId = @eventoId
       )`,
      { eventoId: evento_id }
    );
    await query(
      `DELETE FROM zonaConquistaEstadoParticipanteIndividual
       WHERE eventoId = @eventoId`,
      { eventoId: evento_id }
    );
    await query(
      `DELETE FROM zonaConquistaPartidaIndividual
       WHERE eventoId = @eventoId`,
      { eventoId: evento_id }
    );
    
    // 🆕 Resetar dados de Zone Conquest TEAM (na ordem correta das foreign keys)
    await query(
      `DELETE FROM zonaConquistaLeituraTime
       WHERE eventoId = @eventoId`,
      { eventoId: evento_id }
    );
    await query(
      `DELETE FROM zonaConquistaTempoTime
       WHERE partidaId IN (
         SELECT id FROM zonaConquistaPartidaTime WHERE eventoId = @eventoId
       )`,
      { eventoId: evento_id }
    );
    await query(
      `DELETE FROM zonaConquistaPartidaTime
       WHERE eventoId = @eventoId`,
      { eventoId: evento_id }
    );
    
    // 🆕 Resetar scores dos participantes
    await query(
      `UPDATE crianca SET pontos = 0 
       WHERE eventoId = @eventoId`,
      { eventoId: evento_id }
    );
    
    // 🆕 Resetar pontos dos times
    await query(
      `UPDATE time SET pontos = 0 
       WHERE eventoId = @eventoId`,
      { eventoId: evento_id }
    );
    
    // 🆕 Resetar domínio dos checkpoints (zona-equipe)
    await query(
      `UPDATE pontoVerificacao 
       SET territorioDonoTimeId = NULL,
           territorioTravadoAte = NULL,
           territorioCooldownAte = NULL,
           ultimoConquistadoEm = NULL
       WHERE eventoId = @eventoId`,
      { eventoId: evento_id }
    );
    
    // Iniciar o jogo conforme seu tipo
    if (gameType === MONSTER_GAME_TYPE) {
      console.log('📍 [routes/events.js] Iniciando Monster Game');
      await startMonsterGame(evento_id, brincadeira.id);
      await stopTreasureGame(evento_id);
      await stopZoneConquestTeam(evento_id);
      await stopZoneConquestIndividual(evento_id);
    } else if (gameType === TREASURE_GAME_TYPE) {
      console.log('📍 [routes/events.js] Iniciando Treasure Game');
      await startTreasureGame(evento_id, brincadeira.id);
      await stopMonsterGame(evento_id);
      await stopZoneConquestTeam(evento_id);
      await stopZoneConquestIndividual(evento_id);
    } else if (gameType === 'zone_conquest_team') {
      console.log(`🎮 [EVENTS] Iniciando Zone Conquest TEAM para evento: ${evento_id}`);
      await startZoneConquestTeam(evento_id, brincadeira.id);
      await stopMonsterGame(evento_id);
      await stopTreasureGame(evento_id);
      await stopZoneConquestIndividual(evento_id);
    } else if (gameType === 'zone_conquest_individual') {
      console.log(`🎮 [EVENTS] Iniciando Zone Conquest INDIVIDUAL para evento: ${evento_id}`);
      await startZoneConquestIndividual(evento_id, brincadeira.id);
      await stopMonsterGame(evento_id);
      await stopTreasureGame(evento_id);
      await stopZoneConquestTeam(evento_id);
    } else {
      console.log('📍 [routes/events.js] Parando todos os jogos (tipo:', gameType, ')');
      await stopMonsterGame(evento_id);
      await stopTreasureGame(evento_id);
      await stopZoneConquestTeam(evento_id);
      await stopZoneConquestIndividual(evento_id);
    }
    
    // Registrar o jogo ativo. O status do evento não é mexido aqui: iniciar um
    // jogo só garante que o evento (se ainda agendado) passe a ativo.
    await query(
      `UPDATE evento
       SET brincadeiraAtivaId = @brincadeiraId,
           tipoJogoAtivo = @gameType
       WHERE eventoId = @id`,
      {
        brincadeiraId,
        gameType,
        id: evento_id
      }
    );
    await ensureEventActive(evento_id);

    const startedAt = new Date();
    await saveGameState({
      eventoId: evento_id,
      empresaId: evento.empresa_id,
      mode: 'game',
      gameType,
      gameId: brincadeira.id,
      gameName: brincadeira.name || null,
      startedAt,
    });

    broadcastGameEvent(evento_id, 'GAME_STARTED', {
      gameId: brincadeira.id,
      gameName: brincadeira.name || null,
      gameType,
      startedAt: startedAt.toISOString(),
    });
    broadcastGameEvent(evento_id, 'CHECKPOINT_MODE_CHANGED', {
      mode: 'game',
      gameType,
      timestamp: startedAt.toISOString(),
    });

    res.json({ 
      success: true, 
      message: 'Jogo iniciado!',
      gameType,
      brincadeiraId
    });
  } catch (err) {
    console.error('❌ Erro ao iniciar jogo:', err);
    res.status(500).json({ error: err.message });
  }
});

// Parar jogo
router.post('/:evento_id/stop-game', verifyToken, requireRole('admin', 'game_master', 'master'), async (req, res) => {
  try {
    const evento_id = req.params.evento_id;
    const evento = await queryOne('SELECT eventoId, empresaId FROM evento WHERE eventoId = @id', { id: evento_id });
    if (!evento) return res.status(404).json({ error: 'Evento não encontrado' });
    if (!isMaster(req) && evento.empresa_id !== req.user.empresa_id) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence a esta empresa' });
    }
    
    // Atualizar evento para pausar jogo
    await stopMonsterGame(evento_id);
    await stopTreasureGame(evento_id);
    await stopZoneConquestTeam(evento_id);
    await stopZoneConquestIndividual(evento_id);
    
    // Parar o jogo não desativa o evento: só limpa o jogo ativo.
    await query(
      `UPDATE evento
       SET brincadeiraAtivaId = NULL,
           tipoJogoAtivo = 'none'
       WHERE eventoId = @id`,
      { id: evento_id }
    );
    
    const stoppedAt = new Date();
    await saveGameState({
      eventoId: evento_id,
      empresaId: evento.empresa_id,
      mode: 'idle',
      gameType: 'none',
      stoppedAt,
    });

    broadcastGameEvent(evento_id, 'GAME_STOPPED', {
      stoppedAt: stoppedAt.toISOString(),
    });
    broadcastGameEvent(evento_id, 'CHECKPOINT_MODE_CHANGED', {
      mode: 'idle',
      gameType: 'none',
      timestamp: stoppedAt.toISOString(),
    });

    res.json({ success: true, message: 'Jogo parado!' });
  } catch (err) {
    console.error('❌ Erro ao parar jogo:', err);
    res.status(500).json({ error: err.message });
  }
});

// Listar checkpoints de um evento
router.get('/:evento_id/checkpoints', verifyToken, async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const evento_id = req.params.evento_id;
    
    // ✅ Validar que o evento pertence à empresa do usuário
    const evento = await queryOne(
      'SELECT eventoId, empresaId FROM evento WHERE eventoId = @id',
      { id: evento_id }
    );
    
    if (!evento) {
      return res.status(404).json({ error: 'Evento não encontrado' });
    }
    
    if (!isMaster(req) && evento.empresa_id !== empresa_id) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence a esta empresa' });
    }
    
    const checkpoints = await allQuery(`
      SELECT * FROM pontoVerificacao 
      WHERE eventoId = @evento_id
      AND empresaId = @empresa_id
      AND LOWER(COALESCE(proposito, 'game')) <> 'reception'
      ORDER BY nome ASC
    `, { evento_id, empresa_id });
    res.json(checkpoints);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Planta do evento: armazenada no banco para sobreviver a reload/redeploy do frontend.
router.get('/:id/floor-plan', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`📍 [FLOOR-PLAN] GET /:id/floor-plan chamado`);
    console.log(`   👤 User: ${req.user.email} (role: ${req.user.role})`);
    console.log(`   🎯 evento_id: ${id}`);
    
    let query = 'SELECT eventoId, empresaId, dadosPlanoPiso, nomePlanoPiso, tipoPlanoPiso FROM evento WHERE eventoId = @id';
    let params = { id };
    
    if (isMaster(req)) {
      // Master: acesso total
      query = 'SELECT eventoId, empresaId, dadosPlanoPiso, nomePlanoPiso, tipoPlanoPiso FROM evento WHERE eventoId = @id';
    } else if (req.user.role === 'family') {
      // Family: acesso à qualquer evento (para visualizar o mapa/zonas/checkpoints)
      // Permissão mais granular é feita em outros endpoints (pontuação, etc)
      query = 'SELECT eventoId, empresaId, dadosPlanoPiso, nomePlanoPiso, tipoPlanoPiso FROM evento WHERE eventoId = @id';
    } else {
      // Admin/Reception/Game Master/Display: vê eventos da sua empresa
      query = 'SELECT eventoId, empresaId, dadosPlanoPiso, nomePlanoPiso, tipoPlanoPiso FROM evento WHERE eventoId = @id AND empresaId = @empresa_id';
      params.empresa_id = req.user.empresa_id;
    }
    
    const evento = await queryOne(query, params);

    if (!evento) {
      console.log(`❌ [FLOOR-PLAN] Evento ${id} NÃO ENCONTRADO para usuário ${req.user.email}`);
      return res.status(404).json({ error: 'Evento não encontrado ou você não tem permissão' });
    }
    
    console.log(`✅ [FLOOR-PLAN] Evento ${id} encontrado`);
    res.json({
      eventId: evento.id,
      floorPlan: evento.floor_plan_data
        ? {
            dataUrl: evento.floor_plan_data,
            name: evento.floor_plan_name,
            type: evento.floor_plan_type,
          }
        : null,
    });
  } catch (err) {
    console.error('❌ Erro ao carregar planta do evento:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/floor-plan', verifyToken, requireRole('admin', 'master'), async (req, res) => {
  try {
    const { dataUrl, name, type } = req.body || {};
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
      return res.status(400).json({ error: 'A planta deve ser enviada como uma imagem válida' });
    }
    if (dataUrl.length > 9 * 1024 * 1024) {
      return res.status(413).json({ error: 'A planta é muito grande. Reduza o tamanho da imagem e tente novamente.' });
    }

    const evento = await queryOne(
      'SELECT eventoId, empresaId FROM evento WHERE eventoId = @id',
      { id: req.params.id }
    );
    if (!evento) return res.status(404).json({ error: 'Evento não encontrado' });
    if (!isMaster(req) && !sameId(evento.empresa_id, req.user.empresa_id)) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence à sua empresa' });
    }

    await query(
      `UPDATE evento
       SET dadosPlanoPiso = @dataUrl,
           nomePlanoPiso = @name,
           tipoPlanoPiso = @type
       WHERE eventoId = @id AND empresaId = @empresa_id`,
      {
        dataUrl,
        name: String(name || 'planta-do-evento').slice(0, 255),
        type: String(type || 'image/jpeg').slice(0, 100),
        id: evento.id,
        empresa_id: evento.empresa_id,
      }
    );

    res.json({ success: true, eventId: evento.id });
  } catch (err) {
    console.error('❌ Erro ao salvar planta do evento:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id/floor-plan', verifyToken, requireRole('admin', 'master'), async (req, res) => {
  try {
    const evento = await queryOne(
      'SELECT eventoId, empresaId FROM evento WHERE eventoId = @id',
      { id: req.params.id }
    );
    if (!evento) return res.status(404).json({ error: 'Evento não encontrado' });
    if (!isMaster(req) && !sameId(evento.empresa_id, req.user.empresa_id)) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence à sua empresa' });
    }

    await query(
      `UPDATE evento
       SET dadosPlanoPiso = NULL,
           nomePlanoPiso = NULL,
           tipoPlanoPiso = NULL
       WHERE eventoId = @id AND empresaId = @empresa_id`,
      { id: evento.id, empresa_id: evento.empresa_id }
    );
    res.json({ success: true, eventId: evento.id });
  } catch (err) {
    console.error('❌ Erro ao remover planta do evento:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==================== ROTAS COM ID (devem estar DEPOIS das rotas aninhadas) ====================

// Buscar evento por ID
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    
    let evento;
    if (isMaster(req)) {
      // Master pode ver qualquer evento
      evento = await queryOne(
        'SELECT * FROM evento WHERE eventoId = @id', 
        { id: req.params.id }
      );
    } else {
      // Usuário regular vê apenas eventos da sua empresa
      evento = await queryOne(
        'SELECT * FROM evento WHERE eventoId = @id AND empresaId = @empresa_id', 
        { id: req.params.id, empresa_id }
      );
    }
    
    if (!evento) return res.status(404).json({ error: 'Evento não encontrado' });
    res.json(evento);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Atualizar evento
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { name, description, date, time, duration, enableDisplay, enableLocation, responsibleName, autoStart, autoEnd, games } = req.body;
    const empresa_id = req.user.empresa_id;

    // Verificar que o evento pertence à empresa (ou user é master)
    const evento = await queryOne(
      'SELECT empresaId FROM evento WHERE eventoId = @id',
      { id: req.params.id }
    );

    if (!evento) {
      return res.status(404).json({ error: 'Evento não encontrado' });
    }

    if (!isMaster(req) && evento.empresa_id !== empresa_id) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence a esta empresa' });
    }

    let responsible = null;
    if (responsibleName !== undefined) {
      responsible = String(responsibleName || '').trim();
      if (!responsible) {
        return res.status(400).json({ error: 'Informe o nome do contratante/responsável pelo evento' });
      }
      if (responsible.length > MAX_RESPONSIBLE_NAME) {
        return res.status(400).json({ error: `O nome do contratante deve ter no máximo ${MAX_RESPONSIBLE_NAME} caracteres` });
      }
    }

    // O status NÃO é alterado por aqui: o ciclo de vida do evento só muda pelas
    // ações Iniciar/Encerrar (ou automaticamente pelo horário). Antes, um PUT sem
    // status gravava NULL na coluna. Campos ausentes mantêm o valor atual.
    const flag = (value) => (value === undefined ? null : (value ? 1 : 0));
    await withTransaction(async () => {
      await query(
        `UPDATE evento SET
           nome = COALESCE(@name, nome),
           descricao = COALESCE(@description, descricao),
           data = COALESCE(@date, data),
           hora = COALESCE(@time, hora),
           duracao = COALESCE(@duration, duracao),
           exibirDisplay = COALESCE(@enableDisplay, exibirDisplay),
           exibirLocalizacao = COALESCE(@enableLocation, exibirLocalizacao),
           nomeResponsavel = COALESCE(@responsibleName, nomeResponsavel),
           autoInicio = COALESCE(@autoStart, autoInicio),
           autoFim = COALESCE(@autoEnd, autoFim)
         WHERE eventoId = @id`,
        {
          name: name || null,
          description: description ?? null,
          date: date || null,
          time: time || null,
          duration: duration === undefined ? null : (parseInt(duration) || 60),
          enableDisplay: flag(enableDisplay),
          enableLocation: flag(enableLocation),
          responsibleName: responsible,
          autoStart: flag(autoStart),
          autoEnd: flag(autoEnd),
          id: req.params.id,
        }
      );
      // Sem `games` no corpo, os jogos do evento ficam como estão (quem não conhece o campo não apaga nada).
      if (Array.isArray(games)) await syncEventGames(req.params.id, evento.empresa_id, games);
    });

    res.json({ updated: true });
  } catch (err) {
    console.error('❌ Erro ao atualizar evento:', err);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// Iniciar o evento manualmente (agendado -> ativo)
router.post('/:id/start', verifyToken, requireRole('admin', 'master'), async (req, res) => {
  try {
    const evento = await queryOne(
      'SELECT eventoId, empresaId, status FROM evento WHERE eventoId = @id',
      { id: req.params.id }
    );
    if (!evento) return res.status(404).json({ error: 'Evento não encontrado' });
    if (!isMaster(req) && !sameId(evento.empresa_id, req.user.empresa_id)) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence a esta empresa' });
    }
    if (isClosedStatus(evento.status)) {
      return res.status(409).json({ error: 'Este evento já foi encerrado e não pode ser iniciado novamente.' });
    }

    const changed = await startEvent(evento.id, { source: 'manual' });
    if (!changed) return res.status(409).json({ error: 'Este evento já está ativo.' });

    const updated = await queryOne('SELECT * FROM evento WHERE eventoId = @id', { id: evento.id });
    res.json({ started: true, evento: updated });
  } catch (err) {
    console.error('❌ Erro ao iniciar evento:', err);
    res.status(500).json({ error: err.message });
  }
});

// Encerrar o evento manualmente (ativo -> encerrado). Para o jogo em andamento.
router.post('/:id/finish', verifyToken, requireRole('admin', 'master'), async (req, res) => {
  try {
    const evento = await queryOne(
      'SELECT eventoId, empresaId, status FROM evento WHERE eventoId = @id',
      { id: req.params.id }
    );
    if (!evento) return res.status(404).json({ error: 'Evento não encontrado' });
    if (!isMaster(req) && !sameId(evento.empresa_id, req.user.empresa_id)) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence a esta empresa' });
    }
    if (isClosedStatus(evento.status)) {
      return res.status(409).json({ error: 'Este evento já foi encerrado.' });
    }
    if (String(evento.status || 'scheduled').toLowerCase() !== 'active') {
      return res.status(409).json({ error: 'Só é possível encerrar um evento ativo. Para descartar um evento agendado, exclua-o.' });
    }

    const result = await finishEvent(evento.id, { source: 'manual', stopGame: global.stopGameForEvento });
    if (!result.changed) return res.status(409).json({ error: 'Este evento já foi encerrado.' });

    const updated = await queryOne('SELECT * FROM evento WHERE eventoId = @id', { id: evento.id });
    res.json({ finished: true, evento: updated });
  } catch (err) {
    console.error('❌ Erro ao encerrar evento:', err);
    res.status(500).json({ error: err.message });
  }
});

// Valida data (YYYY-MM-DD), horário (HH:MM) e duração opcional (5 a 1440 min).
function parseSchedule({ date, time, duration }) {
  const dateText = String(date || '').trim();
  const timeText = String(time || '').trim();
  const realDate = /^\d{4}-\d{2}-\d{2}$/.test(dateText)
    && new Date(`${dateText}T00:00:00Z`).toISOString().slice(0, 10) === dateText;
  if (!realDate) return { error: 'Informe uma data válida.' };
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(timeText)) return { error: 'Informe um horário válido (HH:MM).' };

  let minutes = null;
  if (duration !== undefined && duration !== null && String(duration).trim() !== '') {
    minutes = Number(duration);
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 1440) {
      return { error: 'A duração deve ser de 5 a 1440 minutos.' };
    }
  }
  return { date: dateText, time: timeText, duration: minutes };
}

// Reagendar o evento (só enquanto está agendado): nova data, horário e, se quiser, duração.
// Com início automático ligado, o evento passa a iniciar sozinho no novo horário.
router.post('/:id/reschedule', verifyToken, requireRole('admin', 'master'), async (req, res) => {
  try {
    const evento = await queryOne(
      'SELECT eventoId, empresaId, status FROM evento WHERE eventoId = @id',
      { id: req.params.id }
    );
    if (!evento) return res.status(404).json({ error: 'Evento não encontrado' });
    if (!isMaster(req) && !sameId(evento.empresa_id, req.user.empresa_id)) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence a esta empresa' });
    }
    if (isClosedStatus(evento.status)) {
      return res.status(409).json({ error: 'Este evento já foi encerrado e não pode ser reagendado.' });
    }
    if (String(evento.status || 'scheduled').toLowerCase() !== 'scheduled') {
      return res.status(409).json({ error: 'Este evento está em andamento. Encerre-o antes de reagendar.' });
    }

    const schedule = parseSchedule(req.body || {});
    if (schedule.error) return res.status(400).json({ error: schedule.error });

    // A nova data/hora é lida no relógio do buffet (mesmo fuso do início automático).
    const nowMinute = Math.floor(wallClockNow() / 60000) * 60000;
    if (wallClockOf(schedule.date, schedule.time) < nowMinute) {
      return res.status(400).json({ error: 'A nova data e horário precisam estar no futuro.' });
    }

    const result = await query(
      `UPDATE evento
       SET data = @date, hora = @time, duracao = COALESCE(@duration, duracao)
       WHERE eventoId = @id AND LOWER(COALESCE(status, 'scheduled')) = 'scheduled'`,
      { date: schedule.date, time: schedule.time, duration: schedule.duration, id: evento.id }
    );
    if (!Number(result?.rowsAffected?.[0] || 0)) {
      return res.status(409).json({ error: 'O evento mudou de situação e não pode mais ser reagendado.' });
    }

    console.log(`📅 [EVENTO] ${evento.id} reagendado para ${schedule.date} ${schedule.time}`);
    const updated = await queryOne('SELECT * FROM evento WHERE eventoId = @id', { id: evento.id });
    res.json({ rescheduled: true, evento: updated });
  } catch (err) {
    console.error('❌ Erro ao reagendar evento:', err);
    res.status(500).json({ error: err.message });
  }
});

// Reabrir um evento encerrado: ele volta a "agendado" numa nova data e horário (no futuro).
router.post('/:id/reopen', verifyToken, requireRole('admin', 'master'), async (req, res) => {
  try {
    const evento = await queryOne(
      'SELECT eventoId, empresaId, status FROM evento WHERE eventoId = @id',
      { id: req.params.id }
    );
    if (!evento) return res.status(404).json({ error: 'Evento não encontrado' });
    if (!isMaster(req) && !sameId(evento.empresa_id, req.user.empresa_id)) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence a esta empresa' });
    }
    if (!isClosedStatus(evento.status)) {
      return res.status(409).json({ error: 'Só eventos encerrados podem ser reabertos.' });
    }

    const schedule = parseSchedule(req.body || {});
    if (schedule.error) return res.status(400).json({ error: schedule.error });

    const nowMinute = Math.floor(wallClockNow() / 60000) * 60000;
    if (wallClockOf(schedule.date, schedule.time) < nowMinute) {
      return res.status(400).json({ error: 'A nova data e horário precisam estar no futuro.' });
    }

    const result = await reopenEvent(evento.id, schedule);
    if (!result.changed) {
      return res.status(409).json({ error: 'O evento mudou de situação e não pode ser reaberto agora.' });
    }

    const updated = await queryOne('SELECT * FROM evento WHERE eventoId = @id', { id: evento.id });
    res.json({ reopened: true, evento: updated });
  } catch (err) {
    console.error('❌ Erro ao reabrir evento:', err);
    res.status(500).json({ error: err.message });
  }
});

// Deletar evento
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;

    // Verificar que o evento pertence à empresa (ou user é master)
    const evento = await queryOne(
      'SELECT eventoId, empresaId FROM evento WHERE eventoId = @id',
      { id: req.params.id }
    );

    if (!evento) {
      return res.status(404).json({ error: 'Evento não encontrado' });
    }

    if (!isMaster(req) && evento.empresa_id !== empresa_id) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence a esta empresa' });
    }

    // Deletar evento
    await query('DELETE FROM evento WHERE eventoId = @id', { id: req.params.id });

    res.json({ deleted: true });
  } catch (err) {
    console.error('❌ Erro ao deletar evento:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * ✅ POST /:evento_id/setup-active-game
 * Configura uma brincadeira como ativa no evento
 * Se brincadeiraId não for fornecido, cria uma nova "Captura de Territórios"
 */
router.post('/:evento_id/setup-active-game', verifyToken, requireRole('admin', 'game_master', 'master'), async (req, res) => {
  try {
    const evento_id = req.params.evento_id;
    const { brincadeiraId } = req.body || {};
    
    console.log(`🎮 [routes/events.js] Configurando jogo ativo para evento: ${evento_id}`);

    // 1️⃣ Validar evento existe e pertence à empresa
    const evento = await queryOne(
      isMaster(req)
        ? 'SELECT eventoId, empresaId, nome, status FROM evento WHERE eventoId = @id'
        : 'SELECT eventoId, empresaId, nome, status FROM evento WHERE eventoId = @id AND empresaId = @empresa_id',
      isMaster(req)
        ? { id: evento_id }
        : { id: evento_id, empresa_id: req.user.empresa_id }
    );

    if (!evento) {
      return res.status(404).json({ error: 'Evento não encontrado ou acesso negado' });
    }
    if (isClosedStatus(evento.status)) {
      return res.status(409).json({ error: 'Este evento já foi encerrado. Não é possível configurar um jogo nele.' });
    }

    let finalBrincadeiraId = brincadeiraId;

    // 2️⃣ Se não forneceu ID, criar nova brincadeira
    if (!finalBrincadeiraId) {
      console.log(`   📝 Criando nova brincadeira para evento ${evento.name}`);
      
      const newBrincadeiraId = require('uuid').v4().toString();
      
      await query(`
        INSERT INTO brincadeira (brincadeiraId, nome, descricao, tipo, tipoJogo, status, pontosPadrao, empresaId, duracao)
        VALUES (@id, @name, @description, @type, @gameType, @status, @points, @empresa_id, @duration)
      `, {
        id: newBrincadeiraId,
        name: 'Captura de Territórios',
        description: 'Jogo de captura de territórios em tempo real - Avatares se movem quando crianças passam pulseiras em checkpoints',
        type: 'team',
        gameType: 'standard',
        status: 'active',
        points: 10,
        empresa_id: evento.empresa_id,
        duration: 120
      });
      
      finalBrincadeiraId = newBrincadeiraId;
      console.log(`   ✅ Brincadeira criada: ${finalBrincadeiraId}`);
    }

    // 3️⃣ Validar que a brincadeira existe e pertence à empresa
    const brincadeira = await queryOne(
      'SELECT brincadeiraId, nome, tipoJogo FROM brincadeira WHERE brincadeiraId = @id AND empresaId = @empresa_id',
      { id: finalBrincadeiraId, empresa_id: evento.empresa_id }
    );

    if (!brincadeira) {
      return res.status(404).json({ error: 'Brincadeira não encontrada ou não pertence à empresa' });
    }

    // 4️⃣ Atualizar evento
    await query(`
      UPDATE evento
      SET
        brincadeiraAtivaId = @brincadeiraId,
        tipoJogoAtivo = @gameType
      WHERE eventoId = @id
    `, {
      id: evento_id,
      brincadeiraId: finalBrincadeiraId,
      gameType: brincadeira.game_type || 'standard'
    });
    await ensureEventActive(evento_id);

    console.log(`   ✅ Evento atualizado com brincadeira: ${brincadeira.name}`);

    // 5️⃣ Retornar resultado
    res.json({
      success: true,
      message: 'Jogo ativo configurado com sucesso',
      evento: {
        id: evento.id,
        name: evento.name,
      },
      brincadeira: {
        id: brincadeira.id,
        name: brincadeira.name,
        game_type: brincadeira.game_type,
      }
    });
  } catch (err) {
    console.error('❌ Erro ao configurar jogo ativo:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

// ==================== ZONAS DO MAPA ====================

// Carregar zonas do evento
router.get('/:id/zones', verifyToken, async (req, res) => {
  try {
    const evento_id = req.params.id;
    
    // Verificar que o evento existe
    const evento = await queryOne(
      'SELECT empresaId FROM evento WHERE eventoId = @id',
      { id: evento_id }
    );
    
    if (!evento) {
      return res.status(404).json({ error: 'Evento não encontrado' });
    }
    
    // Verificar permissão: master acessa tudo, outros precisam pertencer à empresa
    if (!isMaster(req) && req.user.role !== 'family' && evento.empresa_id !== req.user.empresa_id) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence a esta empresa' });
    }
    
    // Carregar zonas do evento
    const zonesData = await queryOne(
      'SELECT dadosZonas FROM evento WHERE eventoId = @id',
      { id: evento_id }
    );
    
    if (!zonesData || !zonesData.zones_data) {
      return res.json([]);
    }
    
    try {
      const zones = JSON.parse(zonesData.zones_data);
      res.json(zones);
    } catch (e) {
      console.error('Erro ao parsear zonas:', e);
      res.json([]);
    }
  } catch (err) {
    console.error('❌ Erro ao carregar zonas:', err);
    res.status(500).json({ error: err.message });
  }
});

// Salvar zonas do evento
router.post('/:id/zones', verifyToken, async (req, res) => {
  try {
    const evento_id = req.params.id;
    const { zones } = req.body;
    const empresa_id = req.user.empresa_id;
    
    // Verificar que o evento pertence à empresa (ou user é master)
    const evento = await queryOne(
      'SELECT empresaId FROM evento WHERE eventoId = @id',
      { id: evento_id }
    );
    
    if (!evento) {
      return res.status(404).json({ error: 'Evento não encontrado' });
    }
    
    if (!isMaster(req) && evento.empresa_id !== empresa_id) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence a esta empresa' });
    }
    
    if (!Array.isArray(zones)) {
      return res.status(400).json({ error: 'Zonas deve ser um array' });
    }
    
    // Salvar zonas em JSON
    const zonesJson = JSON.stringify(zones);
    await query(
      'UPDATE evento SET dadosZonas = @zones_data WHERE eventoId = @id',
      { zones_data: zonesJson, id: evento_id }
    );
    
    res.json({ success: true, message: 'Zonas salvas com sucesso', zones });
  } catch (err) {
    console.error('❌ Erro ao salvar zonas:', err);
    res.status(500).json({ error: err.message });
  }
});
