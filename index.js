// index.js - API Server Principal
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const { query, allQuery, queryOne, DB_DRIVER } = require('./database');

// Importar rotas
const authRoutes = require('./routes/auth');
const kioskRoutes = require('./routes/kiosk');
const scoreKioskRoutes = require('./routes/scoreKiosk');
const eventControlRoutes = require('./routes/eventControl');
const clientRoutes = require('./routes/clients');
const eventRoutes = require('./routes/events');
const brincadeirasRoutes = require('./routes/brincadeiras');
const timesRoutes = require('./routes/times');
const criancasRoutes = require('./routes/criancas');
const pulseiraRoutes = require('./routes/pulseiras');
const analyticsRoutes = require('./routes/analytics');
const masterRoutes = require('./routes/master');
const checkpointsRoutes = require('./routes/checkpoints');
const leiturasRoutes = require('./routes/leituras');
const settingsRoutes = require('./routes/settings');
const rankingRoutes = require('./routes/ranking');
const logsRoutes = require('./routes/logs');
const loginsRoutes = require('./routes/logins');
const treasureRoutes = require('./routes/treasure');
const monsterRoutes = require('./routes/monster');
const planosRoutes = require('./routes/planos');
const monitoringRoutes = require('./routes/monitoring');
const supportRoutes = require('./routes/support');
const messagesRoutes = require('./routes/messages');
const familiasRoutes = require('./routes/familias');
const { ensureFamilySchema } = require('./migrations/family');
const { ensureGameStateSchema } = require('./migrations/gameState');
const { ensureEventControlSchema } = require('./migrations/eventControl');
const { ensureCheckpointPurposeSchema } = require('./migrations/checkpointPurpose');
const { ensureCheckpointMapPositionSchema } = require('./migrations/checkpointMapPosition');
const { ensureEventFloorPlanSchema } = require('./migrations/eventFloorPlan');
const { ensureMonsterHuntSchema } = require('./migrations/monster');
const { ensureAvatarSchema } = require('./migrations/avatar');
const { getActiveEvent } = require('./utils/eventControl');
const { getGameState, saveGameState } = require('./utils/gameState');
const { verifyToken, requireRole, isMaster } = require('./utils/middleware');
const WS_JWT_SECRET = process.env.JWT_SECRET || 'sua-chave-secreta-super-segura-2026';
const {
  TREASURE_GAME_TYPE,
  getGameForEvent,
  startTreasureGame,
  stopTreasureGame,
} = require('./utils/treasure');
const {
  MONSTER_GAME_TYPE,
  startMonsterGame,
  stopMonsterGame,
} = require('./utils/monster');

const app = express();
const server = http.createServer(app);
const WS_AUTH_PROTOCOL = 'pulyn-auth';

const wss = new WebSocket.Server({ 
  server,
  perMessageDeflate: false,
  handleProtocols: (protocols) => protocols.has(WS_AUTH_PROTOCOL) ? WS_AUTH_PROTOCOL : undefined,
});

// Heartbeat para manter WebSocket vivo
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

// ✨ NOVO: Verificar checkpoints offline (não enviaram leitura há 5 minutos)
const offlineCheckInterval = setInterval(async () => {
  try {
    // Verificar se coluna last_seen existe
    const checkColumn = await require('./database').queryOne(`
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'checkpoints' AND COLUMN_NAME = 'last_seen'
    `);
    
    if (!checkColumn) {
      // Coluna não existe ainda, pular verificação
      return;
    }
    
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    
    // Marcar como offline se não foram vistos há 5 minutos
    await require('./database').query(
      `UPDATE checkpoints 
       SET status = 'offline' 
       WHERE status = 'online'
       AND LOWER(COALESCE(checkpoint_purpose, 'game')) <> 'reception'
       AND (last_seen IS NULL OR last_seen < @fiveMinutesAgo)`,
      { fiveMinutesAgo }
    );
  } catch (err) {
    console.error('❌ Erro ao verificar checkpoints offline:', err);
  }
}, 60000); // A cada 1 minuto

wss.on('close', () => {
  clearInterval(interval);
  clearInterval(offlineCheckInterval);
});

// Armazenar WebSocket globalmente para broadcast
global.wsServer = wss;

// Função de broadcast para todos os clientes WebSocket
global.broadcast = (message) => {
  const msgStr = typeof message === 'string' ? message : JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) { // 1 = OPEN
      client.send(msgStr);
    }
  });
};

// ✨ NOVO: Função de broadcast para um evento específico
global.broadcastToEvent = (eventoId, message) => {
  const msgStr = typeof message === 'string' ? message : JSON.stringify(message);
  console.log(`📡 Broadcasting para evento ${eventoId}: ${typeof message === 'object' ? message.type : message}`);
  
  wss.clients.forEach((client) => {
    if (client.readyState === 1
      && String(client.eventoId || '').trim().toLowerCase() === String(eventoId || '').trim().toLowerCase()) {
      client.send(msgStr);
    }
  });
};

// Controle operacional do evento, isolado por empresa.
global.broadcastToCompany = (empresaId, message) => {
  const msgStr = typeof message === 'string' ? message : JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState === 1
      && String(client.companyId || '').trim().toLowerCase() === String(empresaId || '').trim().toLowerCase()) {
      client.send(msgStr);
    }
  });
};

// ✨ NOVO: Função de broadcast para todos (manter para compatibilidade)
global.broadcastAll = (message) => {
  global.broadcast(message);
};

async function persistEventMode(eventoId, mode, gameType = currentGameType, details = {}) {
  if (!eventoId || eventoId === 'global') return;
  const evento = await queryOne(
    'SELECT id, empresa_id FROM eventos WHERE LOWER(id) = LOWER(@eventoId)',
    { eventoId }
  );
  if (!evento) return;

  await saveGameState({
    eventoId: evento.id,
    empresaId: evento.empresa_id,
    mode,
    gameType: gameType || 'none',
    gameId: details.gameId || null,
    gameName: details.gameName || null,
    startedAt: details.startedAt || null,
    stoppedAt: details.stoppedAt || null,
  });
}

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(cors());

const KIOSK_ROLES = new Set(['kiosk', 'score_kiosk']);

app.use('/api', (req, res, next) => {
  if (/^\/(auth|kiosk|score-kiosk|event-control)(\/|$)/i.test(req.path) || !req.headers.authorization) {
    return next();
  }

  return verifyToken(req, res, () => {
    if (KIOSK_ROLES.has(req.user?.role)) {
      return res.status(403).json({ error: 'O perfil de autoatendimento só pode usar a API dedicada do kiosk' });
    }
    next();
  });
});

function getWebSocketToken(req, url) {
  const protocols = String(req.headers['sec-websocket-protocol'] || '')
    .split(',')
    .map((protocol) => protocol.trim())
    .filter(Boolean);
  const protocolToken = protocols.includes(WS_AUTH_PROTOCOL)
    ? protocols.find((protocol) => protocol !== WS_AUTH_PROTOCOL)
    : null;

  // Mantém compatibilidade temporária com clientes antigos que ainda usam
  // ?token=...; novos clientes não colocam mais o JWT na URL.
  return protocolToken || url.searchParams.get('token');
}

// WebSocket Connection com Rooms
wss.on('connection', async (ws, req) => {
  // Extrair evento_id da URL query string
  const url = new URL(req.url, `ws://${req.headers.host}`);
  const eventoId = url.searchParams.get('evento_id') || 'global';
  const controlScope = url.searchParams.get('scope') === 'company';
  const wsToken = getWebSocketToken(req, url);

  // Kiosk usa token no handshake e só pode assinar o evento da própria empresa.
  let wsUser = null;
  if (wsToken) {
    try {
      wsUser = jwt.verify(wsToken, WS_JWT_SECRET);
    } catch {
      ws.close(1008, 'Token WebSocket inválido');
      return;
    }
  }

  if (controlScope && !wsUser) {
    ws.close(1008, 'Token obrigatório para controle do evento');
    return;
  }

  if (wsUser && !controlScope && wsUser.role !== 'master') {
    try {
      const authorizedEvent = await queryOne(
        `SELECT id FROM eventos
         WHERE LOWER(id) = LOWER(@eventoId)
           AND LOWER(empresa_id) = LOWER(@empresaId)`,
        { eventoId, empresaId: wsUser.empresa_id }
      );
      if (!authorizedEvent) {
        ws.close(1008, 'Evento não autorizado para esta empresa');
        return;
      }
    } catch (error) {
      console.error('❌ Erro ao autorizar WebSocket do evento:', error.message);
      ws.close(1011, 'Não foi possível autorizar o evento');
      return;
    }
  }

  ws.eventoId = controlScope ? 'company-control' : eventoId;
  ws.companyId = wsUser?.empresa_id;
  ws.controlScope = controlScope;
  ws.user = wsUser;
  // Conexões sem usuário podem receber broadcasts públicos, mas nunca
  // podem enviar comandos ao backend.
  ws.kioskAuthorized = Boolean(wsUser) && !KIOSK_ROLES.has(wsUser.role);
  ws.isAlive = true;

  if (controlScope) {
    try {
      const activeEvent = await getActiveEvent(wsUser.empresa_id);
      ws.send(JSON.stringify({
        type: 'EVENT_SELECTED',
        payload: {
          eventoId: activeEvent?.id || null,
          eventName: activeEvent?.name || null,
          eventStatus: activeEvent?.status || null,
        },
      }));
    } catch (error) {
      console.error('❌ Erro ao carregar evento selecionado no WebSocket:', error.message);
      ws.close(1011, 'Não foi possível carregar o evento selecionado');
      return;
    }
  }

  if (KIOSK_ROLES.has(wsUser?.role) && !controlScope) {
    try {
      const kioskEvent = await queryOne(
        `SELECT id FROM eventos
         WHERE id = @eventoId
           AND empresa_id = @empresaId
           AND LOWER(COALESCE(status, 'scheduled')) NOT IN ('completed', 'cancelled', 'canceled', 'finished')`,
        { eventoId, empresaId: wsUser.empresa_id }
      );
      if (!kioskEvent) {
        ws.close(1008, 'Evento não autorizado para este kiosk');
        return;
      }
      ws.kioskAuthorized = true;
    } catch (error) {
      console.error('❌ Erro ao autorizar WebSocket do kiosk:', error.message);
      ws.close(1011, 'Não foi possível autorizar o kiosk');
      return;
    }
  }
  
  console.log(`✅ Cliente WebSocket conectado ao evento: ${eventoId}. Total: ${wss.clients.size}`);
  
  // Ping/Pong para manter vivo
  ws.on('pong', () => {
    ws.isAlive = true;
  });
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      
      // Ignorar heartbeats
      if (data.type === 'HEARTBEAT' || data.type === 'PONG') {
        return;
      }
      if (ws.controlScope) return;
      if (!ws.kioskAuthorized) return;
      
      console.log(`📨 Mensagem recebida via WebSocket (evento: ${eventoId}):`, data.type);
      
      // Os terminais de autoatendimento apenas recebem leituras; nunca alteram modo/comandos.
      if (KIOSK_ROLES.has(ws.user?.role) && (data.type === 'SET_MODE' || data.type === 'COMMAND')) {
        return;
      }

      // Comandos enviados pelas telas também atualizam o modo que o Arduino consulta via HTTP.
      if (data.type === 'SET_MODE') {
        const validModes = ['idle', 'checkin', 'bracelets', 'participants', 'game'];
        if (validModes.includes(data.mode)) {
          currentMode = data.mode;
          if (data.mode !== 'game') currentGameType = 'none';
          persistEventMode(eventoId, currentMode, currentGameType).catch((error) => {
            console.error('❌ Erro ao persistir modo do evento:', error.message);
          });
          console.log(`🎯 Modo atualizado via WebSocket: ${currentMode} (evento: ${eventoId})`);
        }
      }

      // Se é comando para Arduino, broadcast para o evento
      if (data.type === 'SET_MODE' || data.type === 'COMMAND') {
        console.log(`📡 Enviando comando para Arduino (evento: ${eventoId}): ${data.type}`);
        global.broadcastToEvent(eventoId, data);
      }
    } catch (err) {
      console.error('❌ Erro ao parsear mensagem WebSocket:', err);
    }
  });

  ws.on('close', () => {
    console.log(`❌ Cliente desconectado do evento: ${eventoId}. Total: ${wss.clients.size}`);
  });

  ws.on('error', (err) => {
    console.error('❌ Erro WebSocket:', err.message);
  });
});

// Health Check
app.get('/api/test', async (req, res) => {
  try {
    res.json({
      status: 'ok',
      timestamp: new Date(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Obter modo atual do Arduino
let currentArduinoMode = 'default';
app.get('/api/arduino/mode', async (req, res) => {
  res.json({ mode: currentArduinoMode });
});

app.post('/api/arduino/mode', verifyToken, requireRole('master'), async (req, res) => {
  const { mode } = req.body;
  if (mode) {
    currentArduinoMode = mode;
    console.log(`📡 Modo Arduino mudou para: ${mode}`);
    global.broadcast({ type: 'MODE_CHANGED', payload: { mode } });
  }
  res.json({ ok: true, mode: currentArduinoMode });
});





// Status do jogo atual (para debug/monitoramento)
let gameStatus = {
  isRunning: false,
  gameId: null,
  gameName: null,
  startedAt: null,
};

app.get('/api/debug/game-status', verifyToken, requireRole('admin', 'reception', 'game_master', 'display', 'master'), async (req, res) => {
  res.json({
    status: gameStatus,
    connectedClients: wss.clients.size,
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/debug/game-state/:eventoId', verifyToken, requireRole('admin', 'reception', 'game_master', 'display', 'master'), async (req, res) => {
  try {
    const evento = await queryOne(
      'SELECT id, empresa_id, status FROM eventos WHERE LOWER(id) = LOWER(@eventoId)',
      { eventoId: req.params.eventoId }
    );
    if (!evento) return res.status(404).json({ error: 'Evento não encontrado' });
    if (!isMaster(req) && String(evento.empresa_id).trim().toLowerCase() !== String(req.user.empresa_id).trim().toLowerCase()) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence à sua empresa' });
    }

    const state = await getGameState(evento.id);
    const gameType = state?.game_type || 'none';
    const active = state?.mode === 'game' && String(evento.status || '').toLowerCase() === 'active';
    res.json({
      eventoId: evento.id,
      mode: state?.mode || 'idle',
      gameType,
      gameId: state?.game_id || null,
      gameName: state?.game_name || null,
      startedAt: state?.started_at || null,
      stoppedAt: state?.stopped_at || null,
      active,
      selected: Boolean(gameType && gameType !== 'none'),
    });
  } catch (error) {
    console.error('❌ Erro ao carregar estado persistido do jogo:', error.message);
    res.status(500).json({ error: 'Não foi possível carregar o estado do jogo' });
  }
});

app.post('/api/debug/select-game', verifyToken, requireRole('admin', 'game_master', 'master'), async (req, res) => {
  try {
    const { gameId, eventoId } = req.body || {};
    if (!gameId || !eventoId) {
      return res.status(400).json({ error: 'gameId e eventoId são obrigatórios' });
    }

    const evento = await queryOne(
      'SELECT id, empresa_id, status FROM eventos WHERE LOWER(id) = LOWER(@eventoId)',
      { eventoId }
    );
    if (!evento) return res.status(404).json({ error: 'Evento não encontrado' });
    if (!isMaster(req) && String(evento.empresa_id).toLowerCase() !== String(req.user.empresa_id).toLowerCase()) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence à sua empresa' });
    }

    const game = await queryOne(
      'SELECT id, name, type, evento_id, empresa_id FROM brincadeiras WHERE LOWER(id) = LOWER(@gameId)',
      { gameId }
    );
    if (!game) return res.status(404).json({ error: 'Jogo não encontrado' });
    if (String(game.empresa_id).toLowerCase() !== String(evento.empresa_id).toLowerCase()) {
      return res.status(403).json({ error: 'Acesso negado: jogo e evento pertencem a empresas diferentes' });
    }

    const directEventMatch = game.evento_id
      && String(game.evento_id).trim().toLowerCase() === String(eventoId).trim().toLowerCase();
    const linkedEvent = directEventMatch
      ? true
      : await queryOne(
        `SELECT evento_id FROM evento_brincadeiras
         WHERE LOWER(brincadeira_id) = LOWER(@gameId)
           AND LOWER(evento_id) = LOWER(@eventoId)`,
        { gameId, eventoId }
      );
    if (!directEventMatch && !linkedEvent) {
      return res.status(400).json({ error: 'Jogo não pertence ao evento selecionado' });
    }

    const currentState = await getGameState(evento.id);
    const eventIsRunning = currentState?.mode === 'game'
      || String(evento.status || '').trim().toLowerCase() === 'active';
    if (eventIsRunning) {
      return res.status(409).json({ error: 'Finalize o jogo atual antes de selecionar outro jogo' });
    }

    const gameType = game.type === TREASURE_GAME_TYPE
      ? TREASURE_GAME_TYPE
      : game.type === MONSTER_GAME_TYPE ? MONSTER_GAME_TYPE : 'zone_conquest';
    await saveGameState({
      eventoId: evento.id,
      empresaId: evento.empresa_id,
      mode: 'idle',
      gameType,
      gameId: game.id,
      gameName: game.name || null,
      startedAt: null,
      stoppedAt: currentState?.stopped_at || null,
    });

    const payload = {
      gameId: game.id,
      gameName: game.name || null,
      gameType,
      eventoId: evento.id,
      selectionOnly: true,
      selectedAt: new Date().toISOString(),
    };
    if (global.broadcastToEvent) {
      global.broadcastToEvent(evento.id, { type: 'GAME_SELECTED', payload });
    }
    res.json({ ok: true, ...payload });
  } catch (error) {
    console.error('❌ Erro ao selecionar jogo para o telão:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/debug/start-game', verifyToken, requireRole('admin', 'game_master', 'master'), async (req, res) => {
  try {
    const { gameId, gameName, eventoId } = req.body;
    
    if (!eventoId) {
      return res.status(400).json({ error: 'eventoId é obrigatório' });
    }
    
    console.log(`\n🎮 [INICIAR-JOGO] Iniciando processo...`);
    console.log(`   Evento ID: ${eventoId}`);
    console.log(`   Nome do Jogo: ${gameName}`);
    console.log(`   ID do Jogo: ${gameId}`);
    
    // ✅ IMPORTANTE: Verificar status ANTES de atualizar
    console.log(`📋 [INICIAR-JOGO] Verificando status atual do evento...`);
    const eventoAntes = await queryOne(
      `SELECT id, empresa_id, status FROM eventos WHERE LOWER(id) = LOWER(@eventoId)`,
      { eventoId }
    );
    console.log(`   Status ANTES: ${eventoAntes?.status || 'NÃO ENCONTRADO'}`);
    
    if (!eventoAntes) {
      console.error(`❌ [INICIAR-JOGO] Evento NÃO ENCONTRADO no banco de dados!`);
      return res.status(404).json({ error: 'Evento não encontrado' });
    }
    if (!isMaster(req) && String(eventoAntes.empresa_id).toLowerCase() !== String(req.user.empresa_id).toLowerCase()) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence à sua empresa' });
    }

    const selectedGame = await queryOne(
      `SELECT id, name, type, evento_id, empresa_id FROM brincadeiras WHERE LOWER(id) = LOWER(@gameId)`,
      { gameId }
    );
    if (!selectedGame) {
      return res.status(404).json({ error: 'Jogo não encontrado' });
    }
    if (String(selectedGame.empresa_id).toLowerCase() !== String(eventoAntes.empresa_id).toLowerCase()) {
      return res.status(403).json({ error: 'Acesso negado: jogo e evento pertencem a empresas diferentes' });
    }

    const directEventMatch = selectedGame.evento_id
      && String(selectedGame.evento_id).trim().toLowerCase() === String(eventoId).trim().toLowerCase();
    const linkedEvent = directEventMatch
      ? true
      : await queryOne(
        `SELECT evento_id FROM evento_brincadeiras
         WHERE LOWER(brincadeira_id) = LOWER(@gameId)
           AND LOWER(evento_id) = LOWER(@eventoId)`,
        { gameId, eventoId }
      );
    if (!directEventMatch && !linkedEvent) {
      return res.status(400).json({ error: 'Jogo não pertence ao evento selecionado' });
    }

    const gameType = selectedGame.type === TREASURE_GAME_TYPE
      ? TREASURE_GAME_TYPE
      : selectedGame.type === MONSTER_GAME_TYPE ? MONSTER_GAME_TYPE : 'zone_conquest';
    let treasureStart = null;
    let monsterStart = null;
    if (gameType === TREASURE_GAME_TYPE) {
      treasureStart = await startTreasureGame(eventoId, selectedGame.id);
      await stopMonsterGame(eventoId);
      console.log(`   ✓ Caça ao Tesouro iniciado com checkpoint alvo aleatório`);
    } else if (gameType === MONSTER_GAME_TYPE) {
      monsterStart = await startMonsterGame(eventoId, selectedGame.id);
      await stopTreasureGame(eventoId);
      console.log(`   ✓ Caça ao Monstro iniciado com checkpoint especial`);
    } else {
      await stopTreasureGame(eventoId);
      await stopMonsterGame(eventoId);
    }

    // Cada novo início começa sem domínio visual da partida anterior.
    await query(`
      UPDATE checkpoints SET
        territory_owner_time_id = NULL,
        territory_locked_until = NULL,
        territory_cooldown_until = NULL,
        last_conquered_at = NULL
      WHERE LOWER(evento_id) = LOWER(@eventoId)
        AND LOWER(COALESCE(checkpoint_purpose, 'game')) <> 'reception'
    `, { eventoId });
    console.log(`   ✓ Territórios do evento limpos para uma nova partida`);
    
    // ✅ IMPORTANTE: Atualizar o banco de dados
    console.log(`📝 [INICIAR-JOGO] Atualizando evento no banco de dados...`);
    const updateResult = await query(
      `UPDATE eventos SET status = @status WHERE LOWER(id) = LOWER(@eventoId)`,
      { status: 'active', eventoId }
    );
    console.log(`   Atualização executada`);
    
    // ✅ VERIFICAR SE REALMENTE ATUALIZOU
    console.log(`📋 [INICIAR-JOGO] Verificando status DEPOIS de atualizar...`);
    const eventoDepois = await queryOne(
      `SELECT id, status FROM eventos WHERE LOWER(id) = LOWER(@eventoId)`,
      { eventoId }
    );
    console.log(`   Status DEPOIS: ${eventoDepois?.status || 'NÃO ENCONTRADO'}`);
    
    if (eventoDepois?.status !== 'active') {
      console.error(`❌ [INICIAR-JOGO] ⚠️ FALHA NA ATUALIZAÇÃO! Status ainda é: ${eventoDepois?.status}`);
      return res.status(500).json({ 
        error: 'Falha ao atualizar status do evento',
        statusAntes: eventoAntes?.status,
        statusDepois: eventoDepois?.status
      });
    }
    
    console.log(`✅ [INICIAR-JOGO] Banco de dados atualizado com SUCESSO!`);
    
    // ✅ Atualizar variável em memória também
    gameStatus = {
      isRunning: true,
      gameId,
      gameName: selectedGame.name || gameName,
      gameType,
      eventoId,
      startedAt: new Date().toISOString(),
    };
    
    // Atualizar o tipo do jogo para o Arduino
    currentGameType = gameType;
    currentMode = 'game';
    await persistEventMode(eventoId, 'game', gameType, {
      gameId,
      gameName: selectedGame.name || gameName,
      startedAt: gameStatus.startedAt,
    });
    console.log(`🎯 [INICIAR-JOGO] Modo alterado para: game (${gameType})`);
    
    console.log(`🎮 [INICIAR-JOGO] Jogo iniciado com sucesso!`);
    
    // O evento é a sala de sincronização. Nunca publicar estado de jogo para
    // clientes de outras empresas/eventos.
    console.log(`📡 [INICIAR-JOGO] Enviando broadcast apenas para o evento ${eventoId}...`);
    const gameStartedPayload = {
      gameId,
      gameName: selectedGame.name || gameName,
      gameType,
      eventoId,
      startedAt: gameStatus.startedAt,
      treasure: treasureStart ? {
        startingTeamId: treasureStart.startingTeamId,
        startingTeamName: treasureStart.startingTeamName,
        turnTeamId: treasureStart.turnTeamId,
        turnTeamName: treasureStart.turnTeamName,
        turnAvailableAt: treasureStart.turnAvailableAt,
        turnRemainingSeconds: treasureStart.turnRemainingSeconds,
        turnWaitSeconds: treasureStart.turnWaitSeconds,
        initialWait: treasureStart.initialWait,
        targetCheckpointId: treasureStart.targetCheckpointId,
      } : null,
      monster: monsterStart ? {
        monsterHp: monsterStart.monsterHp,
        monsterMaxHp: monsterStart.monsterMaxHp,
        monsterSpecialCheckpoint: monsterStart.monsterSpecialCheckpoint,
      } : null,
    };
    global.broadcastToEvent(eventoId, {
      type: 'GAME_STARTED',
      payload: gameStartedPayload,
    });
    
    // ✨ NOVO: Mudar modo do checkpoint para 'game' via WebSocket
    console.log(`📡 [INICIAR-JOGO] Enviando comando: CHECKPOINT_MODE_CHANGED para modo 'game'`);
    global.broadcastToEvent(eventoId, {
      type: 'CHECKPOINT_MODE_CHANGED',
      payload: { 
        mode: 'game',
        timestamp: new Date().toISOString(),
        eventoId
      }
    });
    
    console.log(`✅ [INICIAR-JOGO] Processo finalizado com sucesso!\n`);
    
    res.json({ 
      ok: true, 
      status: gameStatus,
      verification: {
        statusAntes: eventoAntes?.status,
        statusDepois: eventoDepois?.status,
        updated: eventoDepois?.status === 'active'
      }
    });
  } catch (err) {
    console.error('❌ [INICIAR-JOGO] Erro ao iniciar jogo:', err.message);
    console.error('   Stack:', err.stack);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/debug/stop-game', verifyToken, requireRole('admin', 'game_master', 'master'), async (req, res) => {
  try {
    const { eventoId } = req.body;
    
    if (!eventoId) {
      return res.status(400).json({ error: 'eventoId é obrigatório' });
    }
    
    console.log(`\n⛔ [PARAR-JOGO] Iniciando processo...`);
    console.log(`   Evento ID: ${eventoId}`);
    
    // ✅ IMPORTANTE: Verificar status ANTES de atualizar
    console.log(`📋 [PARAR-JOGO] Verificando status atual do evento...`);
    const eventoAntes = await queryOne(
      `SELECT id, empresa_id, status FROM eventos WHERE id = @eventoId`,
      { eventoId }
    );
    console.log(`   Status ANTES: ${eventoAntes?.status || 'NÃO ENCONTRADO'}`);
    
    if (!eventoAntes) {
      console.error(`❌ [PARAR-JOGO] Evento NÃO ENCONTRADO no banco de dados!`);
      return res.status(404).json({ error: 'Evento não encontrado' });
    }
    if (!isMaster(req) && eventoAntes.empresa_id !== req.user.empresa_id) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence à sua empresa' });
    }

    await stopTreasureGame(eventoId);
    await stopMonsterGame(eventoId);

    // Finalizar encerra o domínio atual, mas preserva pontuação e histórico.
    await query(`
      UPDATE checkpoints SET
        territory_owner_time_id = NULL,
        territory_locked_until = NULL,
        territory_cooldown_until = NULL,
        last_conquered_at = NULL
      WHERE evento_id = @eventoId
        AND LOWER(COALESCE(checkpoint_purpose, 'game')) <> 'reception'
    `, { eventoId });
    console.log(`   ✓ Domínios dos checkpoints encerrados`);
    
    // ✅ IMPORTANTE: Atualizar o banco de dados
    console.log(`📝 [PARAR-JOGO] Atualizando evento no banco de dados...`);
    await query(
      `UPDATE eventos SET status = @status WHERE id = @eventoId`,
      { status: 'scheduled', eventoId }
    );
    console.log(`   Atualização executada`);
    
    // ✅ VERIFICAR SE REALMENTE ATUALIZOU
    console.log(`📋 [PARAR-JOGO] Verificando status DEPOIS de atualizar...`);
    const eventoDepois = await queryOne(
      `SELECT id, status FROM eventos WHERE id = @eventoId`,
      { eventoId }
    );
    console.log(`   Status DEPOIS: ${eventoDepois?.status || 'NÃO ENCONTRADO'}`);
    
    if (eventoDepois?.status !== 'scheduled') {
      console.error(`❌ [PARAR-JOGO] ⚠️ FALHA NA ATUALIZAÇÃO! Status ainda é: ${eventoDepois?.status}`);
      return res.status(500).json({ 
        error: 'Falha ao atualizar status do evento',
        statusAntes: eventoAntes?.status,
        statusDepois: eventoDepois?.status
      });
    }
    
    console.log(`✅ [PARAR-JOGO] Banco de dados atualizado com SUCESSO!`);
    
    // ✅ Atualizar variável em memória também
    gameStatus = {
      isRunning: false,
      gameId: null,
      gameName: null,
      gameType: 'none',
      eventoId: null,
      startedAt: null,
    };
    
    currentGameType = 'none';
    // ✨ NOVO: Atualizar modo para 'idle'
    currentMode = 'idle';
    await persistEventMode(eventoId, 'idle', 'none', {
      stoppedAt: new Date().toISOString(),
    });
    console.log(`🎯 [PARAR-JOGO] Modo alterado para: idle`);
    
    console.log(`⛔ [PARAR-JOGO] Jogo parado com sucesso!`);
    
    console.log(`📡 [PARAR-JOGO] Enviando broadcast apenas para o evento ${eventoId}...`);
    const gameStoppedPayload = {
      eventoId,
      stoppedAt: new Date().toISOString(),
    };
    global.broadcastToEvent(eventoId, {
      type: 'GAME_STOPPED',
      payload: gameStoppedPayload,
    });
    
    // ✨ NOVO: Mudar modo do checkpoint para 'idle' via WebSocket
    console.log(`📡 [PARAR-JOGO] Enviando comando: CHECKPOINT_MODE_CHANGED para modo 'idle'`);
    global.broadcastToEvent(eventoId, {
      type: 'CHECKPOINT_MODE_CHANGED',
      payload: { 
        mode: 'idle',
        timestamp: new Date().toISOString(),
        eventoId
      }
    });
    
    console.log(`✅ [PARAR-JOGO] Processo finalizado com sucesso!\n`);
    
    res.json({ 
      ok: true, 
      status: gameStatus,
      verification: {
        statusAntes: eventoAntes?.status,
        statusDepois: eventoDepois?.status,
        stopped: eventoDepois?.status === 'scheduled'
      }
    });
  } catch (err) {
    console.error('❌ [PARAR-JOGO] Erro ao parar jogo:', err.message);
    console.error('   Stack:', err.stack);
    res.status(500).json({ error: err.message });
  }
});

// DEBUG: Reset territory lock de um checkpoint
app.post('/api/debug/reset-territory/:checkpointId', verifyToken, requireRole('admin', 'game_master', 'master'), async (req, res) => {
  try {
    const checkpoint = await queryOne(
      'SELECT id, empresa_id, checkpoint_purpose FROM checkpoints WHERE id = @checkpointId',
      { checkpointId }
    );
    if (!checkpoint) {
      return res.status(404).json({ error: 'Checkpoint não encontrado' });
    }
    if (String(checkpoint.checkpoint_purpose || 'game').toLowerCase() === 'reception') {
      return res.status(409).json({ error: 'O checkpoint da recepção não possui território de jogo' });
    }

    await query(
      `UPDATE checkpoints SET
        territory_locked_until = NULL,
        territory_cooldown_until = NULL,
        territory_owner_time_id = NULL
       WHERE id = @checkpointId`,
      { checkpointId }
    );
    console.log(`✅ Territory lock resetado para checkpoint: ${checkpointId}`);
    res.json({ ok: true, message: 'Territory lock resetado' });
  } catch (err) {
    console.error('❌ Erro ao resetar territory:', err);
    res.status(500).json({ error: err.message });
  }
});

// DEBUG: Reset ALL territories
app.post('/api/debug/reset-all-territories', verifyToken, requireRole('admin', 'master'), async (req, res) => {
  try {
    const territoryScope = isMaster(req)
      ? " WHERE LOWER(COALESCE(checkpoint_purpose, 'game')) <> 'reception'"
      : " WHERE empresa_id = @empresaId AND LOWER(COALESCE(checkpoint_purpose, 'game')) <> 'reception'";
    await query(
      `UPDATE checkpoints SET
        territory_locked_until = NULL,
        territory_cooldown_until = NULL,
        territory_owner_time_id = NULL${territoryScope ? territoryScope : ''}`,
      isMaster(req) ? {} : { empresaId: req.user.empresa_id }
    );
    console.log(`✅ Todos os territory locks foram resetados`);
    res.json({ ok: true, message: 'Todos os territory locks resetados' });
  } catch (err) {
    console.error('❌ Erro ao resetar territories:', err);
    res.status(500).json({ error: err.message });
  }
});

// ✨ NOVO: Reset pontos de um evento
app.post('/api/debug/reset-scores/:eventoId', verifyToken, requireRole('admin', 'game_master', 'master'), async (req, res) => {
  try {
    const { eventoId } = req.params;
    const evento = await queryOne(
      'SELECT id, empresa_id FROM eventos WHERE LOWER(id) = LOWER(@eventoId)',
      { eventoId }
    );
    if (!evento) {
      return res.status(404).json({ error: 'Evento não encontrado' });
    }
    if (!isMaster(req) && String(evento.empresa_id).toLowerCase() !== String(req.user.empresa_id).toLowerCase()) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence à sua empresa' });
    }
    
    console.log(`🔄 Resetando pontos do evento ${eventoId}...`);
    
    // 1. Resetar scores das crianças
    await query(
      `UPDATE criancas SET scores = 0 WHERE evento_id = @eventoId`,
      { eventoId }
    );
    console.log(`   ✓ Scores das crianças resetados`);
    
    // 2. Resetar pontos dos times
    await query(
      `UPDATE times SET points = 0 WHERE evento_id = @eventoId`,
      { eventoId }
    );
    console.log(`   ✓ Pontos dos times resetados`);
    
    // 3. Limpar histórico de leituras (opcional)
    await query(
      `DELETE FROM leituras
       WHERE checkpoint_id IN (
         SELECT id FROM checkpoints
         WHERE evento_id = @eventoId
           AND LOWER(COALESCE(checkpoint_purpose, 'game')) <> 'reception'
       )`,
      { eventoId }
    );
    console.log(`   ✓ Histórico de leituras deletado`);
    
    // 4. Limpar histórico de pontuações (opcional)
    await query(
      `DELETE FROM pontuacoes WHERE evento_id = @eventoId`,
      { eventoId }
    );
    console.log(`   ✓ Histórico de pontuações deletado`);
    
    // 5. Resetar territories
    await query(
      `UPDATE checkpoints SET 
        territory_locked_until = NULL,
        territory_cooldown_until = NULL,
        territory_owner_time_id = NULL
       WHERE evento_id = @eventoId
         AND LOWER(COALESCE(checkpoint_purpose, 'game')) <> 'reception'`,
      { eventoId }
    );
    console.log(`   ✓ Territories resetados`);
    
    console.log(`✅ Pontos do evento ${eventoId} foram resetados com sucesso!\n`);
    
    res.json({ 
      ok: true, 
      message: 'Pontos resetados com sucesso!',
      summary: {
        'Scores das crianças': 'Zerados ✓',
        'Pontos dos times': 'Zerados ✓',
        'Histórico de leituras': 'Deletado ✓',
        'Histórico de pontuações': 'Deletado ✓',
        'Territories': 'Resetados ✓'
      }
    });
  } catch (err) {
    console.error('❌ Erro ao resetar pontos:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DEBUG: Get current checkpoint mode
let currentMode = 'idle';
let currentGameType = 'none';

// Permite que o processamento NFC encerre o estado global quando a última etapa termina.
global.finishTreasureGameState = (eventoId, finishedAt = new Date().toISOString()) => {
  if (gameStatus.eventoId
    && String(gameStatus.eventoId).trim().toLowerCase() !== String(eventoId).trim().toLowerCase()) return;

  gameStatus = {
    isRunning: false,
    gameId: null,
    gameName: null,
    gameType: 'none',
    eventoId: null,
    startedAt: null,
  };
  currentGameType = 'none';
  currentMode = 'idle';
  query(
    `UPDATE eventos SET status = 'scheduled', active_brincadeira_id = NULL, active_game_type = 'none'
     WHERE LOWER(id) = LOWER(@eventoId)`,
    { eventoId }
  ).catch((error) => {
    console.error('❌ Erro ao limpar jogo ativo do evento após conclusão do tesouro:', error.message);
  });
  persistEventMode(eventoId, 'idle', 'none', { stoppedAt: finishedAt }).catch((error) => {
    console.error('❌ Erro ao persistir encerramento do evento:', error.message);
  });

  const payload = { eventoId, stoppedAt: finishedAt, automatic: true };
  global.broadcastToEvent(eventoId, { type: 'GAME_STOPPED', payload });
  global.broadcastToEvent(eventoId, {
    type: 'CHECKPOINT_MODE_CHANGED',
    payload: { mode: 'idle', gameType: 'none', eventoId, timestamp: finishedAt },
  });
};

global.finishMonsterGameState = (eventoId, finishedAt = new Date().toISOString()) => {
  if (gameStatus.eventoId
    && String(gameStatus.eventoId).trim().toLowerCase() !== String(eventoId).trim().toLowerCase()) return;

  gameStatus = {
    isRunning: false,
    gameId: null,
    gameName: null,
    gameType: 'none',
    eventoId: null,
    startedAt: null,
  };
  currentGameType = 'none';
  currentMode = 'idle';
  query(
    `UPDATE eventos SET status = 'scheduled', active_brincadeira_id = NULL, active_game_type = 'none'
     WHERE LOWER(id) = LOWER(@eventoId)`,
    { eventoId }
  ).catch((error) => {
    console.error('❌ Erro ao limpar jogo ativo do evento após derrota do monstro:', error.message);
  });
  persistEventMode(eventoId, 'idle', 'none', { stoppedAt: finishedAt }).catch((error) => {
    console.error('❌ Erro ao persistir encerramento do Caça ao Monstro:', error.message);
  });

  const payload = { eventoId, stoppedAt: finishedAt, automatic: true };
  global.broadcastToEvent(eventoId, { type: 'GAME_STOPPED', payload });
  global.broadcastToEvent(eventoId, {
    type: 'CHECKPOINT_MODE_CHANGED',
    payload: { mode: 'idle', gameType: 'none', eventoId, timestamp: finishedAt },
  });
};

app.get('/api/debug/checkpoint-mode', async (req, res) => {
  try {
    const checkpointId = req.query.checkpointId;
    if (checkpointId) {
      const checkpoint = await queryOne(
        'SELECT evento_id FROM checkpoints WHERE id = @checkpointId',
        { checkpointId }
      );
      if (checkpoint?.evento_id) {
        const eventState = await getGameState(checkpoint.evento_id);
        if (eventState) {
          return res.json({
            mode: eventState.mode,
            gameType: eventState.game_type,
            eventoId: eventState.evento_id,
            updatedAt: eventState.updated_at,
          });
        }
      }
    }

    res.json({ mode: currentMode, gameType: currentGameType });
  } catch (err) {
    console.error('❌ Erro ao consultar modo do checkpoint:', err);
    res.status(500).json({ error: 'Não foi possível consultar o modo do checkpoint' });
  }
});

// DEBUG: Set checkpoint mode
app.post('/api/debug/checkpoint-mode', verifyToken, requireRole('admin', 'game_master', 'master', 'reception'), async (req, res) => {
  const { mode, eventoId } = req.body;
  const validModes = ['idle', 'checkin', 'bracelets', 'participants', 'game'];
  
  if (!validModes.includes(mode)) {
    return res.status(400).json({ error: `Mode deve ser um de: ${validModes.join(', ')}` });
  }

  if (eventoId) {
    const evento = await queryOne(
      'SELECT id, empresa_id FROM eventos WHERE LOWER(id) = LOWER(@eventoId)',
      { eventoId }
    );
    if (!evento) return res.status(404).json({ error: 'Evento não encontrado' });
    if (!isMaster(req) && String(evento.empresa_id).toLowerCase() !== String(req.user.empresa_id).toLowerCase()) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence à sua empresa' });
    }
  }
  
  currentMode = mode;
  if (mode !== 'game') currentGameType = 'none';
  if (eventoId) {
    await persistEventMode(eventoId, currentMode, currentGameType);
  }
  console.log(`🎯 Modo do checkpoint alterado para: ${mode} ${eventoId ? `(evento: ${eventoId})` : '(global)'}`);
  
  // ✨ NOVO: Broadcast apenas para o evento se especificado, senão global
  const broadcastData = {
    type: 'CHECKPOINT_MODE_CHANGED',
    payload: { mode, timestamp: new Date().toISOString(), eventoId }
  };
  
  if (eventoId) {
    global.broadcastToEvent(eventoId, broadcastData);
  } else {
    global.broadcast(broadcastData);
  }
  
  res.json({ ok: true, mode: currentMode });
});

// DEBUG: Fix bracelet statuses (converter "desvinculada" para "disponivel")
app.post('/api/debug/fix-bracelet-status', verifyToken, requireRole('master'), async (req, res) => {
  try {
    console.log(`🔧 Corrigindo status de pulseiras...`);
    
    // Atualizar todas as pulseiras com status inválido para "disponível"
    const result = await query(
      `UPDATE pulseiras 
       SET status = 'disponivel' 
       WHERE status NOT IN ('disponivel', 'em_uso', 'perdida', 'bloqueada')`
    );
    
    console.log(`✅ Pulseiras corrigidas`);
    res.json({ ok: true, message: 'Status de pulseiras corrigidos' });
  } catch (err) {
    console.error('❌ Erro ao corrigir status:', err);
    res.status(500).json({ error: err.message });
  }
});

// DEBUG: List all bracelet statuses
app.get('/api/debug/bracelet-statuses', verifyToken, requireRole('admin', 'reception', 'game_master', 'master'), async (req, res) => {
  try {
    const result = await allQuery(`
      SELECT DISTINCT status, COUNT(*) as total 
      FROM pulseiras 
      GROUP BY status
    `);
    
    console.log(`📊 Statuses de pulseiras:`, result);
    res.json(result);
  } catch (err) {
    console.error('❌ Erro ao listar statuses:', err);
    res.status(500).json({ error: err.message });
  }
});

// DEBUG: Reset ALL bracelet statuses to "disponível"
app.post('/api/debug/reset-all-bracelets', verifyToken, requireRole('master'), async (req, res) => {
  try {
    console.log(`🔄 Resetando todas as pulseiras para 'disponível'...`);
    
    // 1. Limpar vinculação de crianças com pulseiras
    await query(`UPDATE pulseiras SET status = 'disponivel', crianca_id = NULL`);
    
    console.log(`✅ Todas as pulseiras resetadas`);
    res.json({ ok: true, message: 'Todas as pulseiras resetadas para disponível' });
  } catch (err) {
    console.error('❌ Erro ao resetar:', err);
    res.status(500).json({ error: err.message });
  }
});

// ✨ NOVO: Deletar checkpoints sem empresa_id
app.post('/api/debug/delete-checkpoints-without-empresa', verifyToken, requireRole('master'), async (req, res) => {
  try {
    console.log(`🗑️  Deletando checkpoints sem empresa_id...`);
    
    // 1. Listar checkpoints sem empresa_id
    const orphanedCheckpoints = await allQuery(`
      SELECT id, name, evento_id, empresa_id
      FROM checkpoints
      WHERE empresa_id IS NULL
      ORDER BY name
    `);
    
    console.log(`   Encontrados ${orphanedCheckpoints.length} checkpoints sem empresa_id:`);
    orphanedCheckpoints.forEach(cp => {
      console.log(`   - ${cp.name} (id: ${cp.id}, evento_id: ${cp.evento_id})`);
    });
    
    if (orphanedCheckpoints.length === 0) {
      return res.json({ 
        ok: true, 
        message: 'Nenhum checkpoint sem empresa_id encontrado',
        deleted: 0,
        checkpoints: []
      });
    }
    
    // 2. Deletar leituras associadas
    console.log(`   • Deletando leituras dos checkpoints...`);
    await query(`
      DELETE FROM leituras 
      WHERE checkpoint_id IN (
        SELECT id FROM checkpoints WHERE empresa_id IS NULL
      )
    `);
    console.log(`   ✓ Leituras deletadas`);
    
    // 3. Deletar pontuações associadas
    console.log(`   • Deletando pontuações dos checkpoints...`);
    await query(`
      DELETE FROM pontuacoes 
      WHERE checkpoint_id IN (
        SELECT id FROM checkpoints WHERE empresa_id IS NULL
      )
    `);
    console.log(`   ✓ Pontuações deletadas`);
    
    // 4. Deletar os checkpoints
    console.log(`   • Deletando checkpoints...`);
    const result = await query(`
      DELETE FROM checkpoints 
      WHERE empresa_id IS NULL
    `);
    console.log(`   ✓ Checkpoints deletados`);
    
    console.log(`✅ ${orphanedCheckpoints.length} checkpoints foram deletados com sucesso!\n`);
    
    res.json({ 
      ok: true, 
      message: `${orphanedCheckpoints.length} checkpoints sem empresa_id foram deletados com sucesso!`,
      deleted: orphanedCheckpoints.length,
      checkpoints: orphanedCheckpoints.map(cp => ({
        id: cp.id,
        name: cp.name,
        evento_id: cp.evento_id,
        status: 'DELETADO ✓'
      }))
    });
    
  } catch (err) {
    console.error('❌ Erro ao deletar checkpoints:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ✨ NOVO: Listar checkpoints sem empresa_id
app.get('/api/debug/list-checkpoints-without-empresa', verifyToken, requireRole('master'), async (req, res) => {
  try {
    console.log(`📋 Listando checkpoints sem empresa_id...`);
    
    const orphanedCheckpoints = await allQuery(`
      SELECT id, name, evento_id, empresa_id, status, created_at
      FROM checkpoints
      WHERE empresa_id IS NULL
      ORDER BY name
    `);
    
    console.log(`   Encontrados ${orphanedCheckpoints.length} checkpoints`);
    
    res.json({ 
      total: orphanedCheckpoints.length,
      checkpoints: orphanedCheckpoints
    });
    
  } catch (err) {
    console.error('❌ Erro ao listar checkpoints:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ✨ NOVO: Limpar todas as crianças, pulseiras e resetar checkpoints
app.post('/api/debug/clear-all-children', verifyToken, requireRole('master'), async (req, res) => {
  try {
    console.log(`🗑️  Iniciando limpeza de crianças, pulseiras e checkpoints...`);
    
    // 1. Desassociar todas as pulseiras das crianças
    console.log(`   • Resetando pulseiras...`);
    await query(`UPDATE pulseiras SET status = 'disponivel', crianca_id = NULL`);
    
    // 2. Deletar todas as crianças
    console.log(`   • Deletando crianças...`);
    await query(`DELETE FROM criancas`);
    
    // 3. Resetar times (zerar pontos)
    console.log(`   • Resetando times...`);
    await query(`UPDATE times SET points = 0`);
    
    // 4. Resetar checkpoints (limpar territories, lock, cooldown, scores)
    console.log(`   • Resetando checkpoints...`);
    await query(`
      UPDATE checkpoints SET 
        territory_owner_time_id = NULL,
        territory_locked_until = NULL,
        territory_cooldown_until = NULL,
        status = 'offline'
    `);
    
    console.log(`✅ Limpeza concluída com sucesso!`);
    res.json({ 
      ok: true, 
      message: 'Crianças, pulseiras e checkpoints limpas com sucesso',
      summary: {
        'Crianças': 'Todas deletadas ✓',
        'Pulseiras': 'Todas resetadas para disponível ✓',
        'Times': 'Pontos zerados ✓',
        'Checkpoints': 'Territories e locks resetados ✓'
      }
    });
  } catch (err) {
    console.error('❌ Erro ao limpar:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DEBUG: Assign all bracelets to children (status = 'em_uso')
app.post('/api/debug/assign-all-bracelets', verifyToken, requireRole('master'), async (req, res) => {
  try {
    console.log(`🔗 Vinculando todas as pulseiras com crianças...`);
    
    // Get all pulseiras and crianças ordered
    const pulseiras = await allQuery(`SELECT id = ROW_NUMBER() OVER (ORDER BY code), code FROM pulseiras ORDER BY code`);
    const criancas = await allQuery(`SELECT id, name, bracelet_code FROM criancas ORDER BY id`);
    
    if (pulseiras.length === 0 || criancas.length === 0) {
      return res.status(400).json({ error: 'Pulseiras ou crianças não encontradas' });
    }
    
    // Simple approach: update pulseiras with em_uso status
    await query(`
      UPDATE pulseiras 
      SET status = 'em_uso'
      WHERE code IN (
        SELECT TOP ${Math.min(pulseiras.length, criancas.length)} code 
        FROM pulseiras 
        ORDER BY code
      )
    `);
    
    // Update criancas with bracelet_code
    let idx = 0;
    for (const crianca of criancas) {
      if (idx < pulseiras.length) {
        const pulseira = pulseiras[idx];
        await query(
          `UPDATE criancas SET bracelet_code = @code WHERE id = @id`,
          { code: pulseira.code, id: crianca.id }
        );
        idx++;
      }
    }
    
    console.log(`✅ ${idx} pulseiras vinculadas`);
    res.json({ ok: true, message: `${idx} pulseiras vinculadas com sucesso`, total: idx });
  } catch (err) {
    console.error('❌ Erro ao vincular:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==================== ROTAS ====================
// Autenticação
app.use('/api/auth', authRoutes);

// Autoatendimento do totem
app.use('/api/kiosk', kioskRoutes);

// Consulta de pontuação do totem infantil
app.use('/api/score-kiosk', scoreKioskRoutes);

// Evento operacional selecionado pela recepção
app.use('/api/event-control', eventControlRoutes);

// Clientes
app.use('/api/clientes', clientRoutes);

// Eventos
app.use('/api/eventos', eventRoutes);

// Brincadeiras
app.use('/api/brincadeiras', brincadeirasRoutes);

// Times
app.use('/api/times', timesRoutes);

// Crianças
app.use('/api/criancas', criancasRoutes);

// Pulseiras
app.use('/api/pulseiras', pulseiraRoutes);

// Checkpoints
app.use('/api/checkpoints', checkpointsRoutes);

// Leituras
app.use('/api/leituras', leiturasRoutes);

// Analytics
app.use('/api/analytics', analyticsRoutes);

// Master Dashboard
app.use('/api/master', masterRoutes);

// Settings
app.use('/api/settings', settingsRoutes);

// Ranking
app.use('/api/ranking', rankingRoutes);

// Logs
app.use('/api/logs', logsRoutes);

// Logins (Gerenciamento de Usuários)
app.use('/api/logins', loginsRoutes);

// Caça ao Tesouro
app.use('/api/treasure', treasureRoutes);

// Caça ao Monstro
app.use('/api/monster', monsterRoutes);

// Recursos do dashboard master
app.use('/api/planos', planosRoutes);
app.use('/api/monitoring', monitoringRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/familias', familiasRoutes);

// Servir arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

// Error Handler
app.use((err, req, res, next) => {
  console.error('❌ Erro não tratado:', err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

// Iniciar servidor
const PORT = process.env.PORT || 3001;

async function startServer() {
  try {
    // O schema familiar precisa existir antes de aceitar requisições.
    // Caso contrário, /api/familias/pending pode retornar 500 durante o deploy.
    await ensureFamilySchema();
    await ensureGameStateSchema();
    await ensureEventControlSchema();
    await ensureCheckpointPurposeSchema();
    await ensureCheckpointMapPositionSchema();
    await ensureEventFloorPlanSchema();
    await ensureMonsterHuntSchema();
    await ensureAvatarSchema();
    console.log('✅ Schema de famílias, estado do jogo, mapa dos checkpoints, planta dos eventos, finalidade dos checkpoints e Caça ao Monstro verificados antes de iniciar o servidor.\n');
  } catch (err) {
    console.error('❌ Não foi possível preparar o schema de famílias. Servidor não iniciado:', err);
    clearInterval(interval);
    clearInterval(offlineCheckInterval);
    process.exit(1);
  }

  server.listen(PORT, async () => {
  console.log(`
  ╔═══════════════════════════════════════╗
  ║   🚀 API Pulyn iniciada              ║
  ║   📍 Porta: ${PORT}                      ║
  ║   🌐 http://localhost:${PORT}         ║
  ║   📚 Rotas configuradas:             ║
  ║      ✓ /api/auth                     ║
  ║      ✓ /api/clientes                 ║
  ║      ✓ /api/eventos                  ║
  ║      ✓ /api/brincadeiras             ║
  ║      ✓ /api/times                    ║
  ║      ✓ /api/criancas                 ║
  ║      ✓ /api/pulseiras                ║
  ║      ✓ /api/checkpoints              ║
  ║      ✓ /api/leituras                 ║
  ║      ✓ /api/analytics                ║
  ║      ✓ /api/master                   ║
  ║      ✓ /api/settings                 ║
  ║      ✓ /api/ranking                  ║
  ║      ✓ /api/logs                     ║
  ╚═══════════════════════════════════════╝
  `);
  
  if (DB_DRIVER !== 'postgres' && DB_DRIVER !== 'postgresql') {
    // ✨ Executar migrações legadas do SQL Server somente no driver SQL Server
    // Migrações PostgreSQL serão versionadas separadamente, sem T-SQL no startup.
    console.log('🔧 Verificando e executando migrações legadas do SQL Server...\n');

    // ✨ Executar migração 017 automaticamente no startup
  try {
    console.log('🔧 Verificando e executando migração 017...\n');
    
    // 1. TABELA pontuacoes
    try {
      await query('ALTER TABLE pontuacoes DROP CONSTRAINT FK__pontuacoe__brinc__0E6E26BF');
    } catch (e) {}
    
    await query('ALTER TABLE pontuacoes ALTER COLUMN brincadeira_id UNIQUEIDENTIFIER NULL');
    
    try {
      await query(`
        ALTER TABLE pontuacoes
        ADD CONSTRAINT FK__pontuacoes_brincadeiras_nullable
        FOREIGN KEY (brincadeira_id) 
        REFERENCES brincadeiras(id) 
        ON DELETE SET NULL
      `);
    } catch (e) {}
    
    // 2. TABELA leituras
    try {
      await query('ALTER TABLE leituras DROP CONSTRAINT FK__leituras__brinca__08B54D69');
    } catch (e) {}
    
    await query('ALTER TABLE leituras ALTER COLUMN brincadeira_id UNIQUEIDENTIFIER NULL');
    
    try {
      await query(`
        ALTER TABLE leituras
        ADD CONSTRAINT FK__leituras_brincadeiras_nullable
        FOREIGN KEY (brincadeira_id) 
        REFERENCES brincadeiras(id) 
        ON DELETE SET NULL
      `);
    } catch (e) {}
    
    console.log('✅ Migração 017 concluída!\n');
  } catch (err) {
    console.error('⚠️  Erro na migração 017:', err.message, '\n');
  }

  // ✨ NOVO: Executar migração 018 automaticamente no startup
  try {
    console.log('🔧 Verificando e executando migração 018...\n');
    
    // Verificar se coluna já existe
    const checkColumn = await queryOne(`
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'checkpoints' AND COLUMN_NAME = 'last_seen'
    `);
    
    if (!checkColumn) {
      console.log('  • Adicionando coluna last_seen em checkpoints...');
      await query(`
        ALTER TABLE checkpoints
        ADD last_seen DATETIME NULL DEFAULT GETDATE()
      `);
      console.log('✅ Coluna last_seen adicionada!\n');
    } else {
      console.log('⚠️  Coluna last_seen já existe!\n');
    }
  } catch (err) {
    console.error('⚠️  Erro na migração 018:', err.message, '\n');
  }

  // Migração 019: estado persistente do Caça ao Tesouro
  try {
    await query(`
      IF OBJECT_ID('dbo.caca_tesouro_partidas', 'U') IS NULL
      BEGIN
        CREATE TABLE caca_tesouro_partidas (
          id NVARCHAR(36) NOT NULL PRIMARY KEY,
          evento_id NVARCHAR(36) NOT NULL,
          brincadeira_id NVARCHAR(36) NOT NULL,
          status NVARCHAR(20) NOT NULL,
          round_number INT NOT NULL,
          starting_team_id NVARCHAR(36) NULL,
          turn_team_id NVARCHAR(36) NULL,
          turn_available_at DATETIME2 NULL,
          target_checkpoint_id NVARCHAR(36) NULL,
          completed_checkpoint_ids NVARCHAR(MAX) NULL,
          started_at DATETIME2 NOT NULL,
          round_started_at DATETIME2 NOT NULL,
          finished_at DATETIME2 NULL
        )
      END
    `);

    await query(`
      IF OBJECT_ID('dbo.caca_tesouro_scans', 'U') IS NULL
      BEGIN
        CREATE TABLE caca_tesouro_scans (
          id NVARCHAR(36) NOT NULL PRIMARY KEY,
          partida_id NVARCHAR(36) NOT NULL,
          evento_id NVARCHAR(36) NOT NULL,
          brincadeira_id NVARCHAR(36) NOT NULL,
          round_number INT NOT NULL,
          checkpoint_id NVARCHAR(36) NOT NULL,
          crianca_id NVARCHAR(36) NOT NULL,
          time_id NVARCHAR(36) NOT NULL,
          uid NVARCHAR(100) NOT NULL,
          scanned_at DATETIME2 NOT NULL,
          CONSTRAINT UQ_caca_tesouro_scan_crianca UNIQUE (partida_id, round_number, crianca_id)
        )
      END
    `);
    console.log('✅ Migração 019 do Caça ao Tesouro concluída!\n');
  } catch (err) {
    console.error('⚠️ Erro na migração 019 do Caça ao Tesouro:', err.message, '\n');
  }

  // Migração 020: equipe sorteada para iniciar o Caça ao Tesouro
  try {
    const startingTeamColumn = await queryOne(`
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'caca_tesouro_partidas'
        AND COLUMN_NAME = 'starting_team_id'
    `);

    if (!startingTeamColumn) {
      await query(`
        ALTER TABLE caca_tesouro_partidas
        ADD starting_team_id NVARCHAR(36) NULL
      `);
      console.log('✅ Coluna starting_team_id adicionada na migração 020!\n');
    } else {
      console.log('⚠️ Coluna starting_team_id já existe!\n');
    }
  } catch (err) {
    console.error('⚠️ Erro na migração 020 do Caça ao Tesouro:', err.message, '\n');
  }

  // Migração 021: turnos alternados e intervalo entre equipes
  try {
    const turnTeamColumn = await queryOne(`
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'caca_tesouro_partidas'
        AND COLUMN_NAME = 'turn_team_id'
    `);
    const turnAvailableColumn = await queryOne(`
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'caca_tesouro_partidas'
        AND COLUMN_NAME = 'turn_available_at'
    `);

    if (!turnTeamColumn) {
      await query(`
        ALTER TABLE caca_tesouro_partidas
        ADD turn_team_id NVARCHAR(36) NULL
      `);
    }
    if (!turnAvailableColumn) {
      await query(`
        ALTER TABLE caca_tesouro_partidas
        ADD turn_available_at DATETIME2 NULL
      `);
    }

    console.log('✅ Migração 021 de turnos do Caça ao Tesouro concluída!\n');
  } catch (err) {
    console.error('⚠️ Erro na migração 021 do Caça ao Tesouro:', err.message, '\n');
  }

  // Migração 022: cronômetros individuais das equipes
  try {
    await query(`
      IF OBJECT_ID('dbo.caca_tesouro_tempos', 'U') IS NULL
      BEGIN
        CREATE TABLE caca_tesouro_tempos (
          id NVARCHAR(36) NOT NULL PRIMARY KEY,
          partida_id NVARCHAR(36) NOT NULL,
          evento_id NVARCHAR(36) NOT NULL,
          time_id NVARCHAR(36) NOT NULL,
          started_at DATETIME2 NULL,
          completed_at DATETIME2 NULL,
          elapsed_ms BIGINT NULL,
          CONSTRAINT UQ_caca_tesouro_tempo_equipe UNIQUE (partida_id, time_id)
        )
      END
    `);
    console.log('✅ Migração 022 dos cronômetros do Caça ao Tesouro concluída!\n');
  } catch (err) {
    console.error('⚠️ Erro na migração 022 do Caça ao Tesouro:', err.message, '\n');
  }
  } else {
    console.log('ℹ️ Migrações T-SQL do SQL Server ignoradas: DB_DRIVER=postgres.\n');
  }

  });
}

startServer().catch((err) => {
  console.error('❌ Falha fatal ao iniciar a API:', err);
  process.exit(1);
});

module.exports = { app, server, wss };
