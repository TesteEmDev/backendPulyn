// index.js - API Server Principal
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');
const { query, allQuery, queryOne } = require('./database');

// Importar rotas
const authRoutes = require('./routes/auth');
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
const { verifyToken, isMaster } = require('./utils/middleware');
const {
  TREASURE_GAME_TYPE,
  getGameForEvent,
  startTreasureGame,
  stopTreasureGame,
} = require('./utils/treasure');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ 
  server,
  perMessageDeflate: false
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
    if (client.readyState === 1 && client.eventoId === eventoId) {
      client.send(msgStr);
    }
  });
};

// ✨ NOVO: Função de broadcast para todos (manter para compatibilidade)
global.broadcastAll = (message) => {
  global.broadcast(message);
};

// Middleware
app.use(express.json());
app.use(cors());

// WebSocket Connection com Rooms
wss.on('connection', (ws, req) => {
  // Extrair evento_id da URL query string
  const url = new URL(req.url, `ws://${req.headers.host}`);
  const eventoId = url.searchParams.get('evento_id') || 'global';
  
  // Atribuir evento_id ao WebSocket
  ws.eventoId = eventoId;
  ws.isAlive = true;
  
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
      
      console.log(`📨 Mensagem recebida via WebSocket (evento: ${eventoId}):`, data.type);
      
      // Comandos enviados pelas telas também atualizam o modo que o Arduino consulta via HTTP.
      if (data.type === 'SET_MODE') {
        const validModes = ['idle', 'checkin', 'bracelets', 'participants', 'game'];
        if (validModes.includes(data.mode)) {
          currentMode = data.mode;
          if (data.mode !== 'game') currentGameType = 'none';
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

app.post('/api/arduino/mode', async (req, res) => {
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

app.get('/api/debug/game-status', async (req, res) => {
  res.json({
    status: gameStatus,
    connectedClients: wss.clients.size,
    timestamp: new Date().toISOString(),
  });
});

app.post('/api/debug/start-game', verifyToken, async (req, res) => {
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
      `SELECT id, empresa_id, status FROM eventos WHERE id = @eventoId`,
      { eventoId }
    );
    console.log(`   Status ANTES: ${eventoAntes?.status || 'NÃO ENCONTRADO'}`);
    
    if (!eventoAntes) {
      console.error(`❌ [INICIAR-JOGO] Evento NÃO ENCONTRADO no banco de dados!`);
      return res.status(404).json({ error: 'Evento não encontrado' });
    }
    if (!isMaster(req) && eventoAntes.empresa_id !== req.user.empresa_id) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence à sua empresa' });
    }

    const selectedGame = await queryOne(
      `SELECT id, name, type, evento_id, empresa_id FROM brincadeiras WHERE id = @gameId`,
      { gameId }
    );
    if (!selectedGame) {
      return res.status(404).json({ error: 'Jogo não encontrado' });
    }
    if (!isMaster(req) && selectedGame.empresa_id !== req.user.empresa_id) {
      return res.status(403).json({ error: 'Acesso negado: jogo não pertence à sua empresa' });
    }
    if (!selectedGame.evento_id || String(selectedGame.evento_id).trim().toLowerCase() !== String(eventoId).trim().toLowerCase()) {
      return res.status(400).json({ error: 'Jogo não pertence ao evento selecionado' });
    }

    const gameType = selectedGame.type === TREASURE_GAME_TYPE ? TREASURE_GAME_TYPE : 'zone_conquest';
    if (gameType === TREASURE_GAME_TYPE) {
      await startTreasureGame(eventoId, selectedGame.id);
      console.log(`   ✓ Caça ao Tesouro iniciado com checkpoint alvo aleatório`);
    } else {
      await stopTreasureGame(eventoId);
    }

    // Cada novo início começa sem domínio visual da partida anterior.
    await query(`
      UPDATE checkpoints SET
        territory_owner_time_id = NULL,
        territory_locked_until = NULL,
        territory_cooldown_until = NULL,
        last_conquered_at = NULL
      WHERE evento_id = @eventoId
    `, { eventoId });
    console.log(`   ✓ Territórios do evento limpos para uma nova partida`);
    
    // ✅ IMPORTANTE: Atualizar o banco de dados
    console.log(`📝 [INICIAR-JOGO] Atualizando evento no banco de dados...`);
    const updateResult = await query(
      `UPDATE eventos SET status = @status WHERE id = @eventoId`,
      { status: 'active', eventoId }
    );
    console.log(`   Atualização executada`);
    
    // ✅ VERIFICAR SE REALMENTE ATUALIZOU
    console.log(`📋 [INICIAR-JOGO] Verificando status DEPOIS de atualizar...`);
    const eventoDepois = await queryOne(
      `SELECT id, status FROM eventos WHERE id = @eventoId`,
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
    console.log(`🎯 [INICIAR-JOGO] Modo alterado para: game (${gameType})`);
    
    console.log(`🎮 [INICIAR-JOGO] Jogo iniciado com sucesso!`);
    
    // Broadcast para todos os clientes (Arduino, Display, etc)
    console.log(`📡 [INICIAR-JOGO] Enviando broadcasts...`);
    global.broadcast({
      type: 'GAME_STARTED',
      payload: {
        gameId,
        gameName,
        eventoId,
        startedAt: gameStatus.startedAt,
      }
    });
    
    // Também broadcast por evento específico
    global.broadcastToEvent(eventoId, {
      type: 'GAME_STARTED',
      payload: {
        gameId,
        gameName,
        eventoId,
        startedAt: gameStatus.startedAt,
      }
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

app.post('/api/debug/stop-game', verifyToken, async (req, res) => {
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

    // Finalizar encerra o domínio atual, mas preserva pontuação e histórico.
    await query(`
      UPDATE checkpoints SET
        territory_owner_time_id = NULL,
        territory_locked_until = NULL,
        territory_cooldown_until = NULL,
        last_conquered_at = NULL
      WHERE evento_id = @eventoId
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
    console.log(`🎯 [PARAR-JOGO] Modo alterado para: idle`);
    
    console.log(`⛔ [PARAR-JOGO] Jogo parado com sucesso!`);
    
    // Broadcast para todos os clientes
    console.log(`📡 [PARAR-JOGO] Enviando broadcasts...`);
    global.broadcast({
      type: 'GAME_STOPPED',
      payload: { 
        eventoId,
        stoppedAt: new Date().toISOString() 
      }
    });
    
    // Também broadcast por evento específico
    global.broadcastToEvent(eventoId, {
      type: 'GAME_STOPPED',
      payload: { 
        eventoId,
        stoppedAt: new Date().toISOString() 
      }
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
app.post('/api/debug/reset-territory/:checkpointId', async (req, res) => {
  try {
    const checkpointId = req.params.checkpointId;
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
app.post('/api/debug/reset-all-territories', async (req, res) => {
  try {
    await query(
      `UPDATE checkpoints SET 
        territory_locked_until = NULL,
        territory_cooldown_until = NULL,
        territory_owner_time_id = NULL`
    );
    console.log(`✅ Todos os territory locks foram resetados`);
    res.json({ ok: true, message: 'Todos os territory locks resetados' });
  } catch (err) {
    console.error('❌ Erro ao resetar territories:', err);
    res.status(500).json({ error: err.message });
  }
});

// ✨ NOVO: Reset pontos de um evento
app.post('/api/debug/reset-scores/:eventoId', async (req, res) => {
  try {
    const { eventoId } = req.params;
    
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
      `DELETE FROM leituras WHERE checkpoint_id IN (SELECT id FROM checkpoints WHERE evento_id = @eventoId)`,
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
       WHERE evento_id = @eventoId`,
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
  if (gameStatus.eventoId && String(gameStatus.eventoId) !== String(eventoId)) return;

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

  const payload = { eventoId, stoppedAt: finishedAt, automatic: true };
  global.broadcast({ type: 'GAME_STOPPED', payload });
  global.broadcastToEvent(eventoId, { type: 'GAME_STOPPED', payload });
  global.broadcastToEvent(eventoId, {
    type: 'CHECKPOINT_MODE_CHANGED',
    payload: { mode: 'idle', gameType: 'none', eventoId, timestamp: finishedAt },
  });
};

app.get('/api/debug/checkpoint-mode', async (req, res) => {
  res.json({ mode: currentMode, gameType: currentGameType });
});

// DEBUG: Set checkpoint mode
app.post('/api/debug/checkpoint-mode', async (req, res) => {
  const { mode, eventoId } = req.body;
  const validModes = ['idle', 'checkin', 'bracelets', 'participants', 'game'];
  
  if (!validModes.includes(mode)) {
    return res.status(400).json({ error: `Mode deve ser um de: ${validModes.join(', ')}` });
  }
  
  currentMode = mode;
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
app.post('/api/debug/fix-bracelet-status', async (req, res) => {
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
app.get('/api/debug/bracelet-statuses', async (req, res) => {
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
app.post('/api/debug/reset-all-bracelets', async (req, res) => {
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
app.post('/api/debug/delete-checkpoints-without-empresa', async (req, res) => {
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
app.get('/api/debug/list-checkpoints-without-empresa', async (req, res) => {
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
app.post('/api/debug/clear-all-children', async (req, res) => {
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
app.post('/api/debug/assign-all-bracelets', async (req, res) => {
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
});

module.exports = { app, server, wss };
