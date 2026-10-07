const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { query, queryOne, allQuery, withTransaction } = require('../database');
const { verifyToken, requireRole, isMaster } = require('../utils/middleware');

const MONSTER_COOLDOWN_MIN_SECONDS = 1;
const MONSTER_COOLDOWN_MAX_SECONDS = 120;

function normalizeCheckpointConfigs(tipo, checkpoints) {
  if (tipo !== 'monster_hunt' || !Array.isArray(checkpoints)) return checkpoints;

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

// Listar brincadeira por empresa/evento do usuário
router.get('/', verifyToken, async (req, res) => {
  try {
    const empresaId = req.user.empresaId;
    const eventoId = req.query.eventoId ? String(req.query.eventoId) : null;

    let whereClause = `b.empresaId = @empresaId
      AND LOWER(COALESCE(b.status, 'active')) <> 'archived'`;
    let eventoSelect = 'b.eventoId';
    const params = { empresaId };

    if (eventoId) {
      const evento = await queryOne(
        'SELECT eventoId, empresaId FROM evento WHERE LOWER(eventoId) = LOWER(@eventoId)',
        { eventoId }
      );
      if (!evento) return res.status(404).json({ error: 'Evento não encontrado' });
      if (!isMaster(req) && String(evento.empresaId).toLowerCase() !== String(empresaId).toLowerCase()) {
        return res.status(403).json({ error: 'Acesso negado: evento não pertence à sua empresa' });
      }

      // O evento é a fonte do escopo. Aceita tanto o vínculo direto quanto o legado
      // em eventoBrincadeira, sempre mantendo o isolamento pela empresa do evento.
      whereClause = `LOWER(b.empresaId) = LOWER(@evento_empresa_id)
        AND LOWER(COALESCE(b.status, 'active')) <> 'archived'
        AND (
          LOWER(b.eventoId) = LOWER(@eventoId)
          OR EXISTS (
            SELECT 1
            FROM eventoBrincadeira eb
            WHERE LOWER(eb.brincadeiraId) = LOWER(b.brincadeiraId)
              AND LOWER(eb.eventoId) = LOWER(@eventoId)
          )
        )`;
      eventoSelect = '@eventoId AS eventoId';
      params.eventoId = eventoId;
      params.evento_empresa_id = evento.empresaId;
    }

    console.log(`📋 [BRINCADEIRAS] Buscando jogos${eventoId ? ` do evento ${eventoId}` : ''}`);
    const brincadeira = await allQuery(
      `SELECT b.brincadeiraId, b.nome, b.descricao, b.regras, b.tipo, b.duracao, b.pontosPadrao,
              b.empresaId, b.status, ${eventoSelect}, b.checkpoints
       FROM brincadeira b
       WHERE ${whereClause}
       ORDER BY b.nome`,
      params
    );

    const parsed = brincadeira.map(b => ({
      ...b,
      checkpoints: b.checkpoints ? JSON.parse(b.checkpoints) : []
    }));

    res.json(parsed);
  } catch (err) {
    console.error('❌ Erro ao listar brincadeira:', err);
    res.status(500).json({ error: err.message });
  }
});

// Criar brincadeira
router.post('/', verifyToken, async (req, res) => {
  try {
    const { nome, description, rules, tipo, duration, pontosPadrao, eventoId, checkpoints } = req.body;
    const empresaId = req.user.empresaId;
    const validTypes = ['team', 'individual', 'cooperative', 'treasure_hunt', 'monster_hunt'];

    if (!validTypes.includes(tipo)) {
      return res.status(400).json({ error: 'Tipo de jogo inválido' });
    }
    if (!eventoId) {
      return res.status(400).json({ error: 'eventoId é obrigatório' });
    }

    const evento = await queryOne(
      'SELECT eventoId, empresaId FROM evento WHERE eventoId = @eventoId',
      { eventoId }
    );
    if (!evento) return res.status(404).json({ error: 'Evento não encontrado' });
    if (!isMaster(req) && evento.empresaId !== empresaId) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence à sua empresa' });
    }

    const normalizedCheckpoints = normalizeCheckpointConfigs(tipo, checkpoints);
    const selectedCheckpointIds = Array.isArray(normalizedCheckpoints)
      ? normalizedCheckpoints.map(cp => String(cp.checkpointId || cp)).filter(Boolean)
      : [];
    if (selectedCheckpointIds.length === 0) {
      return res.status(400).json({ error: 'Selecione pelo menos um checkpoint' });
    }
    const validCheckpoints = await allQuery(
      `SELECT checkpointId FROM pontoVerificacao
       WHERE eventoId = @eventoId
         AND empresaId = @empresaId
         AND LOWER(COALESCE(proposito, 'game')) <> 'reception'`,
      { eventoId, empresaId: evento.empresaId }
    );
    const validCheckpointIds = new Set(validCheckpoints.map(cp => String(cp.checkpointId)));
    if (selectedCheckpointIds.some(id => !validCheckpointIds.has(id))) {
      return res.status(400).json({ error: 'Todos os checkpoints devem pertencer ao evento selecionado' });
    }
    const id = uuidv4();
    const checkpointsJson = normalizedCheckpoints ? JSON.stringify(normalizedCheckpoints) : null;
    
    await query(
      'INSERT INTO brincadeira (brincadeiraId, nome, descricao, regras, tipo, duracao, pontosPadrao, empresaId, status, eventoId, checkpoints) VALUES (@id, @nome, @description, @rules, @tipo, @duration, @pontosPadrao, @empresaId, @status, @eventoId, @checkpoints)',
      { 
        id, 
        nome, 
        description, 
        rules, 
        tipo, 
        duration: parseInt(duration), 
        pontosPadrao: pontosPadrao || 10, 
        empresaId: evento.empresaId, 
        status: 'active',
        eventoId: eventoId || null,
        checkpoints: checkpointsJson
      }
    );
    
    console.log(`✅ Jogo criado: ${nome}`);
    res.json({ id, nome, description, rules, tipo, duration, pontosPadrao, empresaId: evento.empresaId, status: 'active', eventoId, checkpoints: normalizedCheckpoints });
  } catch (err) {
    console.error('❌ Erro ao criar brincadeira:', err);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// Atualizar brincadeira
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { nome, description, rules, tipo, duration, pontosPadrao, status, eventoId, checkpoints } = req.body;
    const empresaId = req.user.empresaId;
    const validTypes = ['team', 'individual', 'cooperative', 'treasure_hunt', 'monster_hunt'];
    if (!validTypes.includes(tipo)) {
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
    
    if (!isMaster(req) && brincadeira.empresaId !== empresaId) {
      return res.status(403).json({ error: 'Acesso negado: jogo não pertence a esta empresa' });
    }

    const targetEventoId = eventoId || brincadeira.eventoId;
    if (!targetEventoId) {
      return res.status(400).json({ error: 'eventoId é obrigatório' });
    }
    const evento = await queryOne(
      'SELECT eventoId, empresaId FROM evento WHERE eventoId = @eventoId',
      { eventoId: targetEventoId }
    );
    if (!evento) {
      return res.status(404).json({ error: 'Evento não encontrado' });
    }
    if (evento.empresaId !== brincadeira.empresaId) {
      return res.status(403).json({ error: 'O jogo e o evento devem pertencer à mesma empresa' });
    }
    
    const normalizedCheckpoints = normalizeCheckpointConfigs(tipo, checkpoints);
    const selectedCheckpointIds = Array.isArray(normalizedCheckpoints)
      ? normalizedCheckpoints.map(cp => String(cp.checkpointId || cp)).filter(Boolean)
      : [];
    const checkpointsJson = normalizedCheckpoints ? JSON.stringify(normalizedCheckpoints) : null;

    const validCheckpoints = await allQuery(
      `SELECT checkpointId FROM pontoVerificacao
       WHERE eventoId = @eventoId
         AND empresaId = @empresaId
         AND LOWER(COALESCE(proposito, 'game')) <> 'reception'`,
      { eventoId: targetEventoId, empresaId: evento.empresaId }
    );
    const validCheckpointIds = new Set(validCheckpoints.map(cp => String(cp.checkpointId)));
    if (selectedCheckpointIds.length === 0 || selectedCheckpointIds.some(id => !validCheckpointIds.has(id))) {
      return res.status(400).json({ error: 'Selecione apenas checkpoints de jogo pertencentes ao evento' });
    }

    await query(
      `UPDATE brincadeira SET nome = @nome, descricao = @description, regras = @rules, 
       tipo = @tipo, duracao = @duration, pontosPadrao = @pontosPadrao, status = @status,
       eventoId = @eventoId, checkpoints = @checkpoints
       WHERE brincadeiraId = @id`,
      {
        nome,
        description,
        rules,
        tipo,
        duration: parseInt(duration),
        pontosPadrao,
        status,
        eventoId: targetEventoId,
        checkpoints: checkpointsJson,
        id: req.params.id
      }
    );
    
    console.log(`✅ Jogo atualizado: ${req.params.id}`);
    res.json({ updated: true });
  } catch (err) {
    console.error('❌ Erro ao atualizar brincadeira:', err);
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
      && String(brincadeira.empresaId || '').trim().toLowerCase()
        !== String(req.user.empresaId || '').trim().toLowerCase()) {
      return res.status(403).json({ error: 'Acesso negado: jogo não pertence a esta empresa' });
    }

    await query(
      "UPDATE brincadeira SET status = @status WHERE LOWER(brincadeiraId) = LOWER(@id) AND LOWER(COALESCE(status, 'active')) <> 'archived'",
      { status, id: brincadeira.brincadeiraId }
    );

    console.log(`🎮 Jogo ${brincadeira.brincadeiraId} -> ${status}`);
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
    const empresaId = req.user.empresaId;

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
        && String(brincadeira.empresaId || '').trim().toLowerCase()
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

      const activeEstado = await tx.queryOne(
        `SELECT TOP 1 eventoId
         FROM estadoJogoEvento
         WHERE LOWER(brincadeiraId) = LOWER(@id)
           AND LOWER(COALESCE(modo, 'idle')) = 'game'`,
        { id: gameId }
      );
      if (activeEstado) {
        const error = new Error('Finalize o jogo antes de arquivá-lo');
        error.statusCode = 409;
        throw error;
      }

      const activeSessionTable = brincadeira.tipo === 'treasure_hunt'
        ? 'cacaTesourPartida'
        : brincadeira.tipo === 'monster_hunt' ? '"monsterCacaPartida"' : null;
      if (activeSessionTable) {
        const activeSession = await tx.queryOne(
          `SELECT TOP 1 id
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

      return { id: brincadeira.brincadeiraId, name: brincadeira.nome };
    });

    console.log(`✅ Jogo arquivado: ${result.id}`);
    res.json({ deleted: true, archived: true, id: result.id });
  } catch (err) {
    console.error('❌ Erro ao arquivar brincadeira:', err);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

module.exports = router;
