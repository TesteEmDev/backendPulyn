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

router.use(verifyToken, (req, res, next) => {
  if (req.user?.role === 'family') {
    return res.status(403).json({ error: 'Famílias devem usar os endpoints de vínculo familiar' });
  }
  next();
});

// Listar eventos
router.get('/', verifyToken, async (req, res) => {
  try {
    const empresaId = req.user.empresaId;
    const role = req.user.role;
    
    // Se for master, retorna eventos de TODAS as empresas (exceto Master Admin)
    let eventos;
    if (isMaster(req)) {
      eventos = await allQuery(
        `SELECT * FROM eventos 
         WHERE empresaId IS NOT NULL
           AND empresaId NOT IN (SELECT id FROM empresas WHERE nome = 'Master Admin')
         ORDER BY date DESC`
      );
    } else {
      eventos = await allQuery(
        'SELECT * FROM eventos WHERE empresaId = @empresaId ORDER BY date DESC',
        { empresaId }
      );
    }
    
    res.json(eventos);
  } catch (err) {
    console.error('❌ Erro ao listar eventos:', err);
    res.status(500).json({ error: err.message });
  }
});

const MAX_RESPONSIBLE_NAME = 150;

// Jogos do evento: um jogo pertence a um evento pelo vínculo direto (brincadeiras.eventoId, do
// evento em que foi criado) ou por um vínculo extra em eventoBrincadeiras. Deixa o evento com
// exatamente os jogos informados: vincula os novos, tira os desmarcados e, se um jogo criado
// neste evento for desmarcado, solta o vínculo direto dele. Deve rodar dentro de uma transação.
async function syncEventGames(eventoId, empresaId, gameIds) {
  const wanted = Array.from(new Set((Array.isArray(gameIds) ? gameIds : []).map((id) => String(id).trim()).filter(Boolean)));
  const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

  for (const gameId of wanted) {
    const game = await queryOne(
      "SELECT id, empresaId FROM brincadeiras WHERE LOWER(id) = LOWER(@id) AND LOWER(COALESCE(status, 'active')) <> 'archived'",
      { id: gameId }
    );
    if (!game) {
      const error = new Error('Um dos jogos selecionados não foi encontrado');
      error.statusCode = 400;
      throw error;
    }
    if (!same(game.empresaId, empresaId)) {
      const error = new Error('Um dos jogos selecionados pertence a outra empresa');
      error.statusCode = 403;
      throw error;
    }
  }

  const owned = await allQuery(
    "SELECT id FROM brincadeiras WHERE LOWER(eventoId) = LOWER(@eventoId) AND LOWER(COALESCE(status, 'active')) <> 'archived'",
    { eventoId }
  );
  const links = await allQuery(
    'SELECT brincadeiraId FROM eventoBrincadeiras WHERE LOWER(eventoId) = LOWER(@eventoId)',
    { eventoId }
  );
  const isWanted = (id) => wanted.some((w) => same(w, id));
  const isOwned = (id) => owned.some((o) => same(o.id, id));
  const isLinked = (id) => links.some((l) => same(l.brincadeiraId, id));

  for (const [order, gameId] of wanted.entries()) {
    if (!isOwned(gameId) && !isLinked(gameId)) {
      await query(
        'INSERT INTO eventoBrincadeiras (eventoId, brincadeiraId, ordem) VALUES (@eventoId, @gameId, @order)',
        { eventoId, gameId, order }
      );
    }
  }
  for (const link of links) {
    if (!isWanted(link.brincadeiraId)) {
      await query(
        'DELETE FROM eventoBrincadeiras WHERE LOWER(eventoId) = LOWER(@eventoId) AND LOWER(brincadeiraId) = LOWER(@gameId)',
        { eventoId, gameId: link.brincadeiraId }
      );
    }
  }
  for (const game of owned) {
    if (!isWanted(game.id)) {
      await query('UPDATE brincadeiras SET eventoId = NULL WHERE LOWER(id) = LOWER(@gameId)', { gameId: game.id });
    }
  }
}

// Criar evento
router.post('/', verifyToken, async (req, res) => {
  try {
    const { name, description, date, time, duration, enableDisplay, enableLocation, responsibleName, autoStart, autoEnd, games } = req.body;
    const empresaId = req.user.empresaId;
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
        `INSERT INTO eventos (id, empresaId, name, description, date, time, duration, exibirDisplay, exibirLocalizacao, status,
                              nomeResponsavel, autoInicio, autoFim)
         VALUES (@id, @empresaId, @name, @description, @date, @time, @duration, @enableDisplay, @enableLocation, 'scheduled',
                 @responsibleName, @autoStart, @autoEnd)`,
        {
          id,
          empresaId,
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
      if (Array.isArray(games)) await syncEventGames(id, empresaId, games);
    });

    res.json({
      id, empresaId, name, description, date, time, duration, enableDisplay, enableLocation,
      status: 'scheduled',
      nomeResponsavel: responsible,
      autoInicio: wantsAutoStart ? 1 : 0,
      autoFim: wantsAutoEnd ? 1 : 0,
    });
  } catch (err) {
    console.error('❌ Erro ao criar evento:', err);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ==================== ROTAS ANINHADAS (devem estar ANTES de /:id) ====================

// Listar crianças de um evento
router.get('/:eventoId/criancas', verifyToken, async (req, res) => {
  try {
    const empresaId = req.user.empresaId;
    const eventoId = req.params.eventoId;
    
    // ✅ Validar que o evento pertence à empresa do usuário
    const evento = await queryOne(
      'SELECT id, empresaId FROM eventos WHERE id = @id',
      { id: eventoId }
    );
    
    if (!evento) {
      return res.status(404).json({ error: 'Evento não encontrado' });
    }
    
    if (!isMaster(req) && evento.empresaId !== empresaId) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence a esta empresa' });
    }
    
    const criancas = await allQuery(`
      SELECT c.*, t.name as time_name, t.color as time_color 
      FROM criancas c
      LEFT JOIN times t ON c.timeId = t.id
      WHERE c.eventoId = @eventoId
      AND c.empresaId = @empresaId
      ORDER BY c.scores DESC
    `, { eventoId, empresaId });
    res.json(criancas);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Criar criança em um evento
router.post('/:eventoId/criancas', verifyToken, async (req, res) => {
  try {
    const { name, nickname, age, avatar, braceletCode, timeId } = req.body;
    const avatarValue = getAvatarForCreate(avatar);
    const eventoId = req.params.eventoId;
    const empresaId = req.user.empresaId;
    const id = uuidv4();

    if (!avatarValue) {
      return res.status(400).json({ error: 'Avatar inválido' });
    }
    
    // 1. Validar evento e verificar permissão
    const evento = await queryOne('SELECT empresaId FROM eventos WHERE id = @id', { id: eventoId });
    if (!evento || !evento.empresaId) {
      return res.status(404).json({ error: 'Evento não encontrado ou sem empresa definida' });
    }
    
    // ✅ Verificar permissão (apenas master ou de mesma empresa)
    if (!isMaster(req) && evento.empresaId !== empresaId) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence a esta empresa' });
    }
    
    // 2. Validar se pulseira já está vinculada
    if (braceletCode) {
      const existing = await queryOne('SELECT id FROM criancas WHERE codigoPulseira = @codigo', { codigo: braceletCode });
      if (existing) {
        return res.status(400).json({ error: 'Pulseira já está vinculada a outra criança' });
      }
    }
    
    // 3. Inserir criança
    await query(
      `INSERT INTO criancas (id, eventoId, empresaId, timeId, name, nickname, age, avatar, codigoPulseira, scores) 
       VALUES (@id, @eventoId, @empresaId, @timeId, @name, @nickname, @age, @avatar, @codigoPulseira, 0)`,
      { 
        id, 
        eventoId,
        empresaId: evento.empresaId,
        timeId: timeId || null, 
        name, 
        nickname, 
        age: parseInt(age) || 0, 
        avatar: avatarValue,
        codigoPulseira: braceletCode || null
      }
    );
    
    // 4. Atualizar status da pulseira se foi fornecida
    if (braceletCode) {
      await query(
        'UPDATE pulseiras SET status = @status, criancaId = @criancaId WHERE codigo = @codigo', 
        { status: 'em_uso', criancaId: id, codigo: braceletCode }
      );
    }
    
    // 5. Atualizar pontos do time
    if (timeId) {
      await query(
        `UPDATE times SET points = (SELECT ISNULL(SUM(scores), 0) FROM criancas WHERE timeId = @timeId) 
         WHERE id = @timeId`,
        { timeId: timeId }
      );
    }
    
    res.json({ id, name, nickname, age, avatar: avatarValue, braceletCode, timeId, scores: 0, empresaId: evento.empresaId });
  } catch (err) {
    console.error('❌ Erro ao criar criança:', err);
    res.status(500).json({ error: err.message });
  }
});

// Listar times de um evento
router.get('/:eventoId/times', verifyToken, async (req, res) => {
  try {
    const empresaId = req.user.empresaId;
    const eventoId = req.params.eventoId;
    
    // ✅ Validar que o evento pertence à empresa do usuário
    const evento = await queryOne(
      'SELECT id, empresaId FROM eventos WHERE id = @id',
      { id: eventoId }
    );
    
    if (!evento) {
      return res.status(404).json({ error: 'Evento não encontrado' });
    }
    
    if (!isMaster(req) && evento.empresaId !== empresaId) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence a esta empresa' });
    }
    
    const times = await allQuery(`
      SELECT * FROM times 
      WHERE eventoId = @eventoId
      AND empresaId = @empresaId
      ORDER BY points DESC
    `, { eventoId, empresaId });
    res.json(times);
  } catch (err) {
    console.error('❌ Erro ao listar times:', err);
    res.status(500).json({ error: err.message });
  }
});

// Status do jogo (se está em andamento ou não)
router.get('/:eventoId/game-status', verifyToken, async (req, res) => {
  try {
    const empresaId = req.user.empresaId;
    const eventoId = req.params.eventoId;
    
    // ✅ Validar que o evento pertence à empresa do usuário
    const evento = await queryOne(
      'SELECT id, status, empresaId FROM eventos WHERE id = @id',
      { id: eventoId }
    );
    
    if (!evento) {
      return res.status(404).json({ gameRunning: false });
    }
    
    if (!isMaster(req) && evento.empresaId !== empresaId) {
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
router.get('/:eventoId/active-game', verifyToken, async (req, res) => {
  try {
    const empresaId = req.user.empresaId;
    const eventoId = req.params.eventoId;
    
    // ✅ Validar que o evento pertence à empresa do usuário
    const evento = await queryOne(
      'SELECT e.id, e.empresaId, e.tipoJogoAtivo, b.name as game_name, b.type as tipoJogo FROM eventos e LEFT JOIN brincadeiras b ON e.brincadeiraAtivaId = b.id WHERE e.id = @id',
      { id: eventoId }
    );
    
    if (!evento) {
      return res.status(404).json({ gameType: 'none' });
    }
    
    if (!isMaster(req) && evento.empresaId !== empresaId) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence a esta empresa' });
    }
    
    const gameType = evento.tipoJogoAtivo || evento.tipoJogo || 'none';
    
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
router.post('/:eventoId/start-game', verifyToken, requireRole('admin', 'game_master', 'master'), async (req, res) => {
  try {
    const { brincadeiraId } = req.body;
    const eventoId = req.params.eventoId;
    
    const evento = await queryOne(
      'SELECT id, empresaId, status FROM eventos WHERE id = @id',
      { id: eventoId }
    );
    if (!evento) return res.status(404).json({ error: 'Evento não encontrado' });
    if (!isMaster(req) && evento.empresaId !== req.user.empresaId) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence a esta empresa' });
    }
    if (isClosedStatus(evento.status)) {
      return res.status(409).json({ error: 'Este evento já foi encerrado. Não é possível iniciar um jogo nele.' });
    }

    // Buscar a brincadeira para pegar o tipo
    const brincadeira = await queryOne(
      `SELECT id, name, type, tipoJogo, empresaId FROM brincadeiras
       WHERE id = @id
         AND LOWER(COALESCE(status, 'active')) <> 'archived'`,
      { id: brincadeiraId }
    );
    
    if (!brincadeira) {
      return res.status(404).json({ error: 'Jogo não encontrado' });
    }
    if (!isMaster(req) && brincadeira.empresaId && brincadeira.empresaId !== req.user.empresaId) {
      return res.status(403).json({ error: 'Acesso negado: jogo não pertence a esta empresa' });
    }

    // O jogo só começa se o evento tiver o mínimo de checkpoints online para ele (antes de apagar/resetar qualquer dado)
    const requirement = await checkGameStartRequirements(eventoId, brincadeira);
    if (!requirement.ok) {
      return res.status(409).json({ error: requirement.message, requirement });
    }

    const rawGameType = brincadeira.type || brincadeira.tipoJogo || 'standard';
    const gameType = [MONSTER_GAME_TYPE, TREASURE_GAME_TYPE, 'zone_conquest_team', 'zone_conquest_individual'].includes(rawGameType)
      ? rawGameType
      : rawGameType || 'standard';
    
    // 🆕 Resetar dados de leituras anteriores (reset dos dados de jogo)
    await query(
      `DELETE FROM leituras 
       WHERE criancaId IN (
         SELECT id FROM criancas WHERE eventoId = @eventoId
       )
       AND brincadeiraId NOT IN (
         SELECT id FROM brincadeiras 
         WHERE LOWER(COALESCE(status, 'active')) = 'archived'
       )`,
      { eventoId: eventoId }
    );
    
    // 🆕 Resetar dados de Zone Conquest INDIVIDUAL (na ordem correta das foreign keys)
    await query(
      `DELETE FROM zone_conquest_individual_scans
       WHERE eventoId = @eventoId`,
      { eventoId: eventoId }
    );
    await query(
      `DELETE FROM zone_conquest_individual_checkpoint_protection
       WHERE partidaId IN (
         SELECT id FROM zone_conquest_individual_partidas WHERE eventoId = @eventoId
       )`,
      { eventoId: eventoId }
    );
    await query(
      `DELETE FROM zone_conquest_individual_participant_states
       WHERE eventoId = @eventoId`,
      { eventoId: eventoId }
    );
    await query(
      `DELETE FROM zone_conquest_individual_partidas
       WHERE eventoId = @eventoId`,
      { eventoId: eventoId }
    );
    
    // 🆕 Resetar dados de Zone Conquest TEAM (na ordem correta das foreign keys)
    await query(
      `DELETE FROM zone_conquest_team_scans
       WHERE eventoId = @eventoId`,
      { eventoId: eventoId }
    );
    await query(
      `DELETE FROM zone_conquest_team_tempos
       WHERE partidaId IN (
         SELECT id FROM zone_conquest_team_partidas WHERE eventoId = @eventoId
       )`,
      { eventoId: eventoId }
    );
    await query(
      `DELETE FROM zone_conquest_team_partidas
       WHERE eventoId = @eventoId`,
      { eventoId: eventoId }
    );
    
    // 🆕 Resetar scores dos participantes
    await query(
      `UPDATE criancas SET scores = 0 
       WHERE eventoId = @eventoId`,
      { eventoId: eventoId }
    );
    
    // 🆕 Resetar pontos dos times
    await query(
      `UPDATE times SET points = 0 
       WHERE eventoId = @eventoId`,
      { eventoId: eventoId }
    );
    
    // 🆕 Resetar domínio dos checkpoints (zona-equipe)
    await query(
      `UPDATE checkpoints 
       SET territorioDonoTimeId = NULL,
           territorioTravadoAte = NULL,
           territorioCooldownAte = NULL,
           ultimoConquistadoEm = NULL
       WHERE eventoId = @eventoId`,
      { eventoId: eventoId }
    );
    
    // Iniciar o jogo conforme seu tipo
    if (gameType === MONSTER_GAME_TYPE) {
      console.log('📍 [routes/events.js] Iniciando Monster Game');
      await startMonsterGame(eventoId, brincadeira.id);
      await stopTreasureGame(eventoId);
      await stopZoneConquestTeam(eventoId);
      await stopZoneConquestIndividual(eventoId);
    } else if (gameType === TREASURE_GAME_TYPE) {
      console.log('📍 [routes/events.js] Iniciando Treasure Game');
      await startTreasureGame(eventoId, brincadeira.id);
      await stopMonsterGame(eventoId);
      await stopZoneConquestTeam(eventoId);
      await stopZoneConquestIndividual(eventoId);
    } else if (gameType === 'zone_conquest_team') {
      console.log(`🎮 [EVENTS] Iniciando Zone Conquest TEAM para evento: ${eventoId}`);
      await startZoneConquestTeam(eventoId, brincadeira.id);
      await stopMonsterGame(eventoId);
      await stopTreasureGame(eventoId);
      await stopZoneConquestIndividual(eventoId);
    } else if (gameType === 'zone_conquest_individual') {
      console.log(`🎮 [EVENTS] Iniciando Zone Conquest INDIVIDUAL para evento: ${eventoId}`);
      await startZoneConquestIndividual(eventoId, brincadeira.id);
      await stopMonsterGame(eventoId);
      await stopTreasureGame(eventoId);
      await stopZoneConquestTeam(eventoId);
    } else {
      console.log('📍 [routes/events.js] Parando todos os jogos (tipo:', gameType, ')');
      await stopMonsterGame(eventoId);
      await stopTreasureGame(eventoId);
      await stopZoneConquestTeam(eventoId);
      await stopZoneConquestIndividual(eventoId);
    }
    
    // Registrar o jogo ativo. O status do evento não é mexido aqui: iniciar um
    // jogo só garante que o evento (se ainda agendado) passe a ativo.
    await query(
      `UPDATE eventos
       SET brincadeiraAtivaId = @brincadeiraId,
           tipoJogoAtivo = @gameType
       WHERE id = @id`,
      {
        brincadeiraId,
        gameType,
        id: eventoId
      }
    );
    await ensureEventActive(eventoId);

    const startedAt = new Date();
    await saveGameState({
      eventoId: eventoId,
      empresaId: evento.empresaId,
      mode: 'game',
      gameType,
      gameId: brincadeira.id,
      gameName: brincadeira.name || null,
      startedAt,
    });

    broadcastGameEvent(eventoId, 'GAME_STARTED', {
      gameId: brincadeira.id,
      gameName: brincadeira.name || null,
      gameType,
      startedAt: startedAt.toISOString(),
    });
    broadcastGameEvent(eventoId, 'CHECKPOINT_MODE_CHANGED', {
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
router.post('/:eventoId/stop-game', verifyToken, requireRole('admin', 'game_master', 'master'), async (req, res) => {
  try {
    const eventoId = req.params.eventoId;
    const evento = await queryOne('SELECT id, empresaId FROM eventos WHERE id = @id', { id: eventoId });
    if (!evento) return res.status(404).json({ error: 'Evento não encontrado' });
    if (!isMaster(req) && evento.empresaId !== req.user.empresaId) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence a esta empresa' });
    }
    
    // Atualizar evento para pausar jogo
    await stopMonsterGame(eventoId);
    await stopTreasureGame(eventoId);
    await stopZoneConquestTeam(eventoId);
    await stopZoneConquestIndividual(eventoId);
    
    // Parar o jogo não desativa o evento: só limpa o jogo ativo.
    await query(
      `UPDATE eventos
       SET brincadeiraAtivaId = NULL,
           tipoJogoAtivo = 'none'
       WHERE id = @id`,
      { id: eventoId }
    );
    
    const stoppedAt = new Date();
    await saveGameState({
      eventoId: eventoId,
      empresaId: evento.empresaId,
      mode: 'idle',
      gameType: 'none',
      stoppedAt,
    });

    broadcastGameEvent(eventoId, 'GAME_STOPPED', {
      stoppedAt: stoppedAt.toISOString(),
    });
    broadcastGameEvent(eventoId, 'CHECKPOINT_MODE_CHANGED', {
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
router.get('/:eventoId/checkpoints', verifyToken, async (req, res) => {
  try {
    const empresaId = req.user.empresaId;
    const eventoId = req.params.eventoId;
    
    // ✅ Validar que o evento pertence à empresa do usuário
    const evento = await queryOne(
      'SELECT id, empresaId FROM eventos WHERE id = @id',
      { id: eventoId }
    );
    
    if (!evento) {
      return res.status(404).json({ error: 'Evento não encontrado' });
    }
    
    if (!isMaster(req) && evento.empresaId !== empresaId) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence a esta empresa' });
    }
    
    const checkpoints = await allQuery(`
      SELECT * FROM checkpoints 
      WHERE eventoId = @eventoId
      AND empresaId = @empresaId
      AND LOWER(COALESCE(propositoCheckpoint, 'game')) <> 'reception'
      ORDER BY name ASC
    `, { eventoId, empresaId });
    res.json(checkpoints);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== ROTAS COM ID (devem estar DEPOIS das rotas aninhadas) ====================

// Buscar evento por ID
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const empresaId = req.user.empresaId;
    
    let evento;
    if (isMaster(req)) {
      // Master pode ver qualquer evento
      evento = await queryOne(
        'SELECT * FROM eventos WHERE id = @id', 
        { id: req.params.id }
      );
    } else {
      // Usuário regular vê apenas eventos da sua empresa
      evento = await queryOne(
        'SELECT * FROM eventos WHERE id = @id AND empresaId = @empresaId', 
        { id: req.params.id, empresaId }
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
    const empresaId = req.user.empresaId;

    // Verificar que o evento pertence à empresa (ou user é master)
    const evento = await queryOne(
      'SELECT empresaId FROM eventos WHERE id = @id',
      { id: req.params.id }
    );

    if (!evento) {
      return res.status(404).json({ error: 'Evento não encontrado' });
    }

    if (!isMaster(req) && evento.empresaId !== empresaId) {
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
        `UPDATE eventos SET
           name = COALESCE(@name, name),
           description = COALESCE(@description, description),
           date = COALESCE(@date, date),
           time = COALESCE(@time, time),
           duration = COALESCE(@duration, duration),
           exibirDisplay = COALESCE(@enableDisplay, exibirDisplay),
           exibirLocalizacao = COALESCE(@enableLocation, exibirLocalizacao),
           nomeResponsavel = COALESCE(@responsibleName, nomeResponsavel),
           autoInicio = COALESCE(@autoStart, autoInicio),
           autoFim = COALESCE(@autoEnd, autoFim)
         WHERE id = @id`,
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
      if (Array.isArray(games)) await syncEventGames(req.params.id, evento.empresaId, games);
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
      'SELECT id, empresaId, status FROM eventos WHERE id = @id',
      { id: req.params.id }
    );
    if (!evento) return res.status(404).json({ error: 'Evento não encontrado' });
    if (!isMaster(req) && !sameId(evento.empresaId, req.user.empresaId)) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence a esta empresa' });
    }
    if (isClosedStatus(evento.status)) {
      return res.status(409).json({ error: 'Este evento já foi encerrado e não pode ser iniciado novamente.' });
    }

    const changed = await startEvent(evento.id, { source: 'manual' });
    if (!changed) return res.status(409).json({ error: 'Este evento já está ativo.' });

    const updated = await queryOne('SELECT * FROM eventos WHERE id = @id', { id: evento.id });
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
      'SELECT id, empresaId, status FROM eventos WHERE id = @id',
      { id: req.params.id }
    );
    if (!evento) return res.status(404).json({ error: 'Evento não encontrado' });
    if (!isMaster(req) && !sameId(evento.empresaId, req.user.empresaId)) {
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

    const updated = await queryOne('SELECT * FROM eventos WHERE id = @id', { id: evento.id });
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
      'SELECT id, empresaId, status FROM eventos WHERE id = @id',
      { id: req.params.id }
    );
    if (!evento) return res.status(404).json({ error: 'Evento não encontrado' });
    if (!isMaster(req) && !sameId(evento.empresaId, req.user.empresaId)) {
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
      `UPDATE eventos
       SET date = @date, time = @time, duration = COALESCE(@duration, duration)
       WHERE id = @id AND LOWER(COALESCE(status, 'scheduled')) = 'scheduled'`,
      { date: schedule.date, time: schedule.time, duration: schedule.duration, id: evento.id }
    );
    if (!Number(result?.rowsAffected?.[0] || 0)) {
      return res.status(409).json({ error: 'O evento mudou de situação e não pode mais ser reagendado.' });
    }

    console.log(`📅 [EVENTO] ${evento.id} reagendado para ${schedule.date} ${schedule.time}`);
    const updated = await queryOne('SELECT * FROM eventos WHERE id = @id', { id: evento.id });
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
      'SELECT id, empresaId, status FROM eventos WHERE id = @id',
      { id: req.params.id }
    );
    if (!evento) return res.status(404).json({ error: 'Evento não encontrado' });
    if (!isMaster(req) && !sameId(evento.empresaId, req.user.empresaId)) {
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

    const updated = await queryOne('SELECT * FROM eventos WHERE id = @id', { id: evento.id });
    res.json({ reopened: true, evento: updated });
  } catch (err) {
    console.error('❌ Erro ao reabrir evento:', err);
    res.status(500).json({ error: err.message });
  }
});

// Deletar evento
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const empresaId = req.user.empresaId;

    // Verificar que o evento pertence à empresa (ou user é master)
    const evento = await queryOne(
      'SELECT id, empresaId FROM eventos WHERE id = @id',
      { id: req.params.id }
    );

    if (!evento) {
      return res.status(404).json({ error: 'Evento não encontrado' });
    }

    if (!isMaster(req) && evento.empresaId !== empresaId) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence a esta empresa' });
    }

    // Deletar evento
    await query('DELETE FROM eventos WHERE id = @id', { id: req.params.id });

    res.json({ deleted: true });
  } catch (err) {
    console.error('❌ Erro ao deletar evento:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * ✅ POST /:eventoId/setup-active-game
 * Configura uma brincadeira como ativa no evento
 * Se brincadeiraId não for fornecido, cria uma nova "Captura de Territórios"
 */
router.post('/:eventoId/setup-active-game', verifyToken, requireRole('admin', 'game_master', 'master'), async (req, res) => {
  try {
    const eventoId = req.params.eventoId;
    const { brincadeiraId } = req.body || {};
    
    console.log(`🎮 [routes/events.js] Configurando jogo ativo para evento: ${eventoId}`);

    // 1️⃣ Validar evento existe e pertence à empresa
    const evento = await queryOne(
      isMaster(req)
        ? 'SELECT id, empresaId, name, status FROM eventos WHERE id = @id'
        : 'SELECT id, empresaId, name, status FROM eventos WHERE id = @id AND empresaId = @empresaId',
      isMaster(req)
        ? { id: eventoId }
        : { id: eventoId, empresaId: req.user.empresaId }
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
        INSERT INTO brincadeiras (id, name, description, type, tipoJogo, status, pontosPadrao, empresaId, duration)
        VALUES (@id, @name, @description, @type, @gameType, @status, @points, @empresaId, @duration)
      `, {
        id: newBrincadeiraId,
        name: 'Captura de Territórios',
        description: 'Jogo de captura de territórios em tempo real - Avatares se movem quando crianças passam pulseiras em checkpoints',
        type: 'team',
        gameType: 'standard',
        status: 'active',
        points: 10,
        empresaId: evento.empresaId,
        duration: 120
      });
      
      finalBrincadeiraId = newBrincadeiraId;
      console.log(`   ✅ Brincadeira criada: ${finalBrincadeiraId}`);
    }

    // 3️⃣ Validar que a brincadeira existe e pertence à empresa
    const brincadeira = await queryOne(
      'SELECT id, name, tipoJogo FROM brincadeiras WHERE id = @id AND empresaId = @empresaId',
      { id: finalBrincadeiraId, empresaId: evento.empresaId }
    );

    if (!brincadeira) {
      return res.status(404).json({ error: 'Brincadeira não encontrada ou não pertence à empresa' });
    }

    // 4️⃣ Atualizar evento
    await query(`
      UPDATE eventos
      SET
        brincadeiraAtivaId = @brincadeiraId,
        tipoJogoAtivo = @gameType
      WHERE id = @id
    `, {
      id: eventoId,
      brincadeiraId: finalBrincadeiraId,
      gameType: brincadeira.tipoJogo || 'standard'
    });
    await ensureEventActive(eventoId);

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
        tipoJogo: brincadeira.tipoJogo,
      }
    });
  } catch (err) {
    console.error('❌ Erro ao configurar jogo ativo:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
