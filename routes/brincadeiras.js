const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { query, queryOne, allQuery, withTransaction } = require('../database');
const { verifyToken, requireRole, isMaster } = require('../utils/middleware');
const { checkGameStartRequirements } = require('../utils/gameRequirements');
const { buildCheckpointConfigs, parseConfigItems, idOf } = require('../utils/liveCheckpoints');
const { refreshTreasureTargetAfterListChange } = require('../utils/treasure');
const { refreshMonsterSpecialAfterListChange } = require('../utils/monster');

// Eventos em que uma partida deste jogo (Tesouro ou Monstro) está em andamento agora.
async function eventsRunningGame(gameId) {
  const rows = await allQuery(
    `SELECT eventoId, 'treasure_hunt' AS kind FROM cacaTesourPartida
       WHERE LOWER(brincadeiraId) = LOWER(@gameId) AND status = 'active'
     UNION
     SELECT eventoId, 'monster_hunt' AS kind FROM monsterCacaPartida
       WHERE LOWER(brincadeiraId) = LOWER(@gameId) AND status = 'active'`,
    { gameId }
  );
  return rows.map(row => ({ eventoId: row.evento_id, kind: row.kind }));
}

// Depois de trocar a lista com a partida rodando: corrige o que dependia dela (alvo do Tesouro,
// checkpoint especial do Monstro) e avisa as telas do evento para recarregarem.
async function reconcileRunningGames(gameId, checkpointIds) {
  const changes = [];
  for (const { eventoId, kind } of await eventsRunningGame(gameId)) {
    const change = kind === 'treasure_hunt'
      ? await refreshTreasureTargetAfterListChange(eventoId)
      : await refreshMonsterSpecialAfterListChange(eventoId);
    changes.push({ eventoId, kind, ...(change || {}) });
    if (typeof global.broadcastToEvent === 'function') {
      global.broadcastToEvent(eventoId, {
        type: 'GAME_CHECKPOINTS_UPDATED',
        payload: {
          eventoId,
          gameId,
          gameType: kind,
          checkpointIds,
          targetCheckpointId: change?.targetCheckpointId ?? null,
          specialCheckpointId: change?.specialCheckpointId ?? null,
        },
      });
    }
  }
  return changes;
}

const MONSTER_COOLDOWN_MIN_SECONDS = 1;
const MONSTER_COOLDOWN_MAX_SECONDS = 120;

function normalizeCheckpointConfigs(type, checkpoints) {
  if (type !== 'monster_hunt' || !Array.isArray(checkpoints)) return checkpoints;

  return checkpoints.map((checkpoint) => {
    if (!checkpoint || typeof checkpoint !== 'object') return checkpoint;

    const cooldown = Number(checkpoint.cooldown ?? 15);
    if (!Number.isInteger(cooldown)
      || cooldown < MONSTER_COOLDOWN_MIN_SECONDS
      || cooldown > MONSTER_COOLDOWN_MAX_SECONDS) {
      const error = new Error(
        `O bloqueio de cada checkpoint do Monstro deve ser um número inteiro entre ${MONSTER_COOLDOWN_MIN_SECONDS} e ${MONSTER_COOLDOWN_MAX_SECONDS} segundos`
      );
      error.statusCode = 400;
      throw error;
    }

    return { ...checkpoint, cooldown };
  });
}

// Listar brincadeiras por empresa/evento do usuário
router.get('/', verifyToken, async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const evento_id = req.query.evento_id ? String(req.query.evento_id) : null;

    let whereClause = `b.empresaId = @empresa_id
      AND LOWER(COALESCE(b.status, 'active')) <> 'archived'`;
    let eventoSelect = 'b.eventoId';
    const params = { empresa_id };

    if (evento_id) {
      const evento = await queryOne(
        'SELECT eventoId, empresaId FROM evento WHERE LOWER(eventoId) = LOWER(@evento_id)',
        { evento_id }
      );
      if (!evento) return res.status(404).json({ error: 'Evento não encontrado' });
      if (!isMaster(req) && String(evento.empresa_id).toLowerCase() !== String(empresa_id).toLowerCase()) {
        return res.status(403).json({ error: 'Acesso negado: evento não pertence à sua empresa' });
      }

      // O evento é a fonte do escopo. Aceita tanto o vínculo direto quanto o legado
      // em evento_brincadeiras, sempre mantendo o isolamento pela empresa do evento.
      whereClause = `LOWER(b.empresaId) = LOWER(@evento_empresa_id)
        AND LOWER(COALESCE(b.status, 'active')) <> 'archived'
        AND (
          LOWER(b.eventoId) = LOWER(@evento_id)
          OR EXISTS (
            SELECT 1
            FROM eventoBrincadeira eb
            WHERE LOWER(eb.brincadeiraId) = LOWER(b.brincadeiraId)
              AND LOWER(eb.eventoId) = LOWER(@evento_id)
          )
        )`;
      eventoSelect = '@evento_id AS evento_id';
      params.evento_id = evento_id;
      params.evento_empresa_id = evento.empresa_id;
    }

    console.log(`📋 [BRINCADEIRAS] Buscando jogos${evento_id ? ` do evento ${evento_id}` : ''}`);
    const brincadeiras = await allQuery(
      `SELECT b.brincadeiraId, b.nome, b.descricao, b.regras, b.tipo, b.duracao, b.pontosPadrao,
              b.empresaId, b.status, ${eventoSelect}, b.checkpoints
       FROM brincadeira b
       WHERE ${whereClause}
       ORDER BY b.nome`,
      params
    );

    const parsed = brincadeiras.map(b => ({
      ...b,
      checkpoints: b.checkpoints ? JSON.parse(b.checkpoints) : []
    }));

    res.json(parsed);
  } catch (err) {
    console.error('❌ Erro ao listar brincadeiras:', err);
    res.status(500).json({ error: err.message });
  }
});

// Criar brincadeira
router.post('/', verifyToken, async (req, res) => {
  try {
    const { name, description, rules, type, duration, default_points, evento_id, checkpoints } = req.body;
    const empresa_id = req.user.empresa_id;
    const validTypes = ['team', 'individual', 'cooperative', 'treasure_hunt', 'monster_hunt'];

    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: 'Tipo de jogo inválido' });
    }
    if (!evento_id) {
      return res.status(400).json({ error: 'evento_id é obrigatório' });
    }

    const evento = await queryOne(
      'SELECT eventoId, empresaId FROM evento WHERE eventoId = @evento_id',
      { evento_id }
    );
    if (!evento) return res.status(404).json({ error: 'Evento não encontrado' });
    if (!isMaster(req) && evento.empresa_id !== empresa_id) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence à sua empresa' });
    }

    const normalizedCheckpoints = normalizeCheckpointConfigs(type, checkpoints);
    const selectedCheckpointIds = Array.isArray(normalizedCheckpoints)
      ? normalizedCheckpoints.map(cp => String(cp.id || cp)).filter(Boolean)
      : [];
    if (selectedCheckpointIds.length === 0) {
      return res.status(400).json({ error: 'Selecione pelo menos um checkpoint' });
    }
    const validCheckpoints = await allQuery(
      `SELECT checkpointId FROM pontoVerificacao
       WHERE eventoId = @evento_id
         AND empresaId = @empresa_id
         AND LOWER(COALESCE(proposito, 'game')) <> 'reception'`,
      { evento_id, empresa_id: evento.empresa_id }
    );
    const validCheckpointIds = new Set(validCheckpoints.map(cp => String(cp.id)));
    if (selectedCheckpointIds.some(id => !validCheckpointIds.has(id))) {
      return res.status(400).json({ error: 'Todos os checkpoints devem pertencer ao evento selecionado' });
    }
    const id = uuidv4();
    const checkpointsJson = normalizedCheckpoints ? JSON.stringify(normalizedCheckpoints) : null;
    
    await query(
      'INSERT INTO brincadeira (brincadeiraId, nome, descricao, regras, tipo, duracao, pontosPadrao, empresaId, status, eventoId, checkpoints) VALUES (@id, @name, @description, @rules, @type, @duration, @default_points, @empresa_id, @status, @evento_id, @checkpoints)',
      { 
        id, 
        name, 
        description, 
        rules, 
        type, 
        duration: parseInt(duration), 
        default_points: default_points || 10, 
        empresa_id: evento.empresa_id, 
        status: 'active',
        evento_id: evento_id || null,
        checkpoints: checkpointsJson
      }
    );
    
    console.log(`✅ Jogo criado: ${name}`);
    res.json({ id, name, description, rules, type, duration, default_points, empresa_id: evento.empresa_id, status: 'active', evento_id, checkpoints: normalizedCheckpoints });
  } catch (err) {
    console.error('❌ Erro ao criar brincadeira:', err);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// Atualizar brincadeira
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { name, description, rules, type, duration, default_points, status, evento_id, checkpoints } = req.body;
    const empresa_id = req.user.empresa_id;
    const validTypes = ['team', 'individual', 'cooperative', 'treasure_hunt', 'monster_hunt'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: 'Tipo de jogo inválido' });
    }
    
    // ✅ Verificar que o jogo pertence à empresa
    const brincadeira = await queryOne(
      `SELECT brincadeiraId, empresaId, eventoId, status
       FROM brincadeira
       WHERE brincadeiraId = @id`,
      { id: req.params.id }
    );
    
    if (!brincadeira) {
      return res.status(404).json({ error: 'Jogo não encontrado' });
    }
    if (String(brincadeira.status || '').trim().toLowerCase() === 'archived') {
      return res.status(404).json({ error: 'Jogo não encontrado' });
    }
    
    if (!isMaster(req) && brincadeira.empresa_id !== empresa_id) {
      return res.status(403).json({ error: 'Acesso negado: jogo não pertence a esta empresa' });
    }

    const targetEventoId = evento_id || brincadeira.evento_id;
    if (!targetEventoId) {
      return res.status(400).json({ error: 'evento_id é obrigatório' });
    }
    const evento = await queryOne(
      'SELECT eventoId, empresaId FROM evento WHERE eventoId = @evento_id',
      { evento_id: targetEventoId }
    );
    if (!evento) {
      return res.status(404).json({ error: 'Evento não encontrado' });
    }
    if (evento.empresa_id !== brincadeira.empresa_id) {
      return res.status(403).json({ error: 'O jogo e o evento devem pertencer à mesma empresa' });
    }
    
    const normalizedCheckpoints = normalizeCheckpointConfigs(type, checkpoints);
    const selectedCheckpointIds = Array.isArray(normalizedCheckpoints)
      ? normalizedCheckpoints.map(cp => String(cp.id || cp)).filter(Boolean)
      : [];
    const checkpointsJson = normalizedCheckpoints ? JSON.stringify(normalizedCheckpoints) : null;

    const validCheckpoints = await allQuery(
      `SELECT checkpointId FROM pontoVerificacao
       WHERE eventoId = @evento_id
         AND empresaId = @empresa_id
         AND LOWER(COALESCE(proposito, 'game')) <> 'reception'`,
      { evento_id: targetEventoId, empresa_id: evento.empresa_id }
    );
    const validCheckpointIds = new Set(validCheckpoints.map(cp => String(cp.id)));
    if (selectedCheckpointIds.length === 0 || selectedCheckpointIds.some(id => !validCheckpointIds.has(id))) {
      return res.status(400).json({ error: 'Selecione apenas checkpoints de jogo pertencentes ao evento' });
    }

    await query(
      `UPDATE brincadeira SET nome = @name, descricao = @description, regras = @rules, 
       tipo = @type, duracao = @duration, pontosPadrao = @default_points, status = @status,
       eventoId = @evento_id, checkpoints = @checkpoints
       WHERE brincadeiraId = @id`,
      {
        name,
        description,
        rules,
        type,
        duration: parseInt(duration),
        default_points,
        status,
        evento_id: targetEventoId,
        checkpoints: checkpointsJson,
        id: req.params.id
      }
    );
    
    console.log(`✅ Jogo atualizado: ${req.params.id}`);

    // Se este jogo está rodando, a partida passa a usar a lista nova (alvo/especial corrigidos).
    try {
      await reconcileRunningGames(req.params.id, selectedCheckpointIds);
    } catch (reconcileError) {
      console.warn(`⚠️ Jogo atualizado, mas a partida em andamento não foi ajustada: ${reconcileError.message}`);
    }
    res.json({ updated: true });
  } catch (err) {
    console.error('❌ Erro ao atualizar brincadeira:', err);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// Troca só os checkpoints do jogo, inclusive com a partida em andamento (recreacionista, admin e master).
// Mantém a configuração de quem continua na lista (bloqueio do Monstro) e corrige o que dependia dela.
router.put('/:id/checkpoints', verifyToken, requireRole('admin', 'game_master', 'master'), async (req, res) => {
  try {
    const game = await queryOne(
      'SELECT brincadeiraId, nome, empresaId, eventoId, tipo, status, checkpoints FROM brincadeira WHERE LOWER(brincadeiraId) = LOWER(@id)',
      { id: req.params.id }
    );
    if (!game || String(game.status || '').trim().toLowerCase() === 'archived') {
      return res.status(404).json({ error: 'Jogo não encontrado' });
    }
    if (!isMaster(req) && String(game.empresa_id).toLowerCase() !== String(req.user.empresa_id).toLowerCase()) {
      return res.status(403).json({ error: 'Acesso negado: jogo não pertence a esta empresa' });
    }
    if (!game.evento_id) return res.status(400).json({ error: 'Este jogo não está ligado a um evento' });

    const requestedIds = Array.isArray(req.body?.checkpoints) ? req.body.checkpoints.map(idOf).filter(Boolean) : [];
    if (requestedIds.length === 0) return res.status(400).json({ error: 'Selecione pelo menos um checkpoint' });

    const valid = await allQuery(
      `SELECT checkpointId FROM pontoVerificacao
       WHERE LOWER(eventoId) = LOWER(@eventoId)
         AND LOWER(COALESCE(proposito, 'game')) <> 'reception'`,
      { eventoId: game.evento_id }
    );
    const validIds = new Set(valid.map(row => String(row.id).toLowerCase()));
    if (requestedIds.some(id => !validIds.has(id.toLowerCase()))) {
      return res.status(400).json({ error: 'Selecione apenas checkpoints de jogo pertencentes ao evento' });
    }

    const items = buildCheckpointConfigs({
      type: game.type,
      requestedIds,
      existingItems: parseConfigItems(game.checkpoints),
      specialId: req.body?.specialCheckpointId || null,
    });
    const checkpointsJson = JSON.stringify(items);

    // Com a partida rodando, a lista nova também precisa atender o mínimo de checkpoints online do jogo.
    const running = await eventsRunningGame(game.id);
    for (const { eventoId } of running) {
      const requirement = await checkGameStartRequirements(eventoId, { ...game, checkpoints: checkpointsJson });
      if (!requirement.ok) {
        return res.status(409).json({
          error: `Com o jogo em andamento, a lista precisa ter pelo menos ${requirement.required} checkpoints online `
            + `(com essa seleção há ${requirement.available}). Selecione mais checkpoints ou ligue os que estão offline.`,
          requirement,
        });
      }
    }

    await query('UPDATE brincadeira SET checkpoints = @checkpoints WHERE brincadeiraId = @id', { checkpoints: checkpointsJson, id: game.id });
    const changes = await reconcileRunningGames(game.id, requestedIds);

    res.json({ updated: true, running: running.length > 0, checkpoints: items, changes });
  } catch (err) {
    console.error('❌ Erro ao trocar os checkpoints do jogo:', err);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// Ativar/desativar um jogo (só o status; o resto do jogo não é alterado)
router.patch('/:id/status', verifyToken, requireRole('admin', 'master'), async (req, res) => {
  try {
    const status = String(req.body?.status || '').trim().toLowerCase();
    if (status !== 'active' && status !== 'inactive') {
      return res.status(400).json({ error: "Status inválido. Use 'active' ou 'inactive'." });
    }

    const brincadeira = await queryOne(
      'SELECT brincadeiraId, empresaId, status FROM brincadeira WHERE LOWER(brincadeiraId) = LOWER(@id)',
      { id: req.params.id }
    );
    if (!brincadeira || String(brincadeira.status || '').trim().toLowerCase() === 'archived') {
      return res.status(404).json({ error: 'Jogo não encontrado' });
    }
    if (!isMaster(req)
      && String(brincadeira.empresa_id || '').trim().toLowerCase()
        !== String(req.user.empresa_id || '').trim().toLowerCase()) {
      return res.status(403).json({ error: 'Acesso negado: jogo não pertence a esta empresa' });
    }

    await query(
      "UPDATE brincadeira SET status = @status WHERE LOWER(brincadeiraId) = LOWER(@id) AND LOWER(COALESCE(status, 'active')) <> 'archived'",
      { status, id: brincadeira.id }
    );

    console.log(`🎮 Jogo ${brincadeira.id} -> ${status}`);
    res.json({ updated: true, status });
  } catch (err) {
    console.error('❌ Erro ao alterar status do jogo:', err);
    res.status(500).json({ error: err.message });
  }
});

// Arquivar brincadeira sem apagar o histórico
router.delete('/:id', verifyToken, requireRole('admin', 'master'), async (req, res) => {
  try {
    const gameId = req.params.id;
    const empresaId = req.user.empresa_id;

    const result = await withTransaction(async (tx) => {
      const brincadeira = await tx.queryOne(
        `SELECT brincadeiraId, nome, tipo, empresaId, status
         FROM brincadeira
         WHERE LOWER(brincadeiraId) = LOWER(@id)`,
        { id: gameId }
      );

      if (!brincadeira) {
        const error = new Error('Jogo não encontrado');
        error.statusCode = 404;
        throw error;
      }

      if (!isMaster(req)
        && String(brincadeira.empresa_id || '').trim().toLowerCase()
          !== String(empresaId || '').trim().toLowerCase()) {
        const error = new Error('Acesso negado: jogo não pertence a esta empresa');
        error.statusCode = 403;
        throw error;
      }

      if (String(brincadeira.status || '').trim().toLowerCase() === 'archived') {
        const error = new Error('Este jogo já foi arquivado');
        error.statusCode = 409;
        throw error;
      }

      const activeEvent = await tx.queryOne(
        `SELECT TOP 1 eventoId
         FROM evento
         WHERE LOWER(brincadeiraAtivaId) = LOWER(@id)
           AND LOWER(COALESCE(status, '')) = 'active'`,
        { id: gameId }
      );
      if (activeEvent) {
        const error = new Error('Finalize o jogo antes de arquivá-lo');
        error.statusCode = 409;
        throw error;
      }

      const activeState = await tx.queryOne(
        `SELECT TOP 1 eventoId
         FROM estadoJogoEvento
         WHERE LOWER(brincadeiraId) = LOWER(@id)
           AND LOWER(COALESCE(modo, 'idle')) = 'game'`,
        { id: gameId }
      );
      if (activeState) {
        const error = new Error('Finalize o jogo antes de arquivá-lo');
        error.statusCode = 409;
        throw error;
      }

      const activeSessionTable = brincadeira.type === 'treasure_hunt'
        ? 'cacaTesourPartida'
        : brincadeira.type === 'monster_hunt' ? 'monsterCacaPartida' : null;
      if (activeSessionTable) {
        const activeSession = await tx.queryOne(
          `SELECT TOP 1 1 AS found
           FROM ${activeSessionTable}
           WHERE LOWER(brincadeiraId) = LOWER(@id)
             AND LOWER(COALESCE(status, '')) = 'active'`,
          { id: gameId }
        );
        if (activeSession) {
          const error = new Error('Finalize a partida antes de arquivar este jogo');
          error.statusCode = 409;
          throw error;
        }
      }

      const update = await tx.query(
        `UPDATE brincadeira
         SET status = 'archived'
         WHERE LOWER(brincadeiraId) = LOWER(@id)`,
        { id: gameId }
      );
      if (!(update.rowsAffected?.[0] || 0)) {
        const error = new Error('Não foi possível arquivar o jogo');
        error.statusCode = 409;
        throw error;
      }

      return { id: brincadeira.id, name: brincadeira.name };
    });

    console.log(`✅ Jogo arquivado: ${result.id}`);
    res.json({ deleted: true, archived: true, id: result.id });
  } catch (err) {
    console.error('❌ Erro ao arquivar brincadeira:', err);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

module.exports = router;
