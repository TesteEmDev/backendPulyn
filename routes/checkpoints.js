// routes/pontoVerificacao.js - Checkpoints
const express = require('express');
const router = express.Router();
const { query, queryOne, allQuery } = require('../database');
const { verifyToken, isMaster } = require('../utils/middleware');
const { getCheckpointTreasureStatus } = require('../utils/treasure');
const { getCheckpointMonsterStatus } = require('../utils/monster');

function sameId(left, right) {
  return left !== null && left !== undefined
    && right !== null && right !== undefined
    && String(left).trim().toLowerCase() === String(right).trim().toLowerCase();
}

function removeCheckpointFromJson(value, checkpointId) {
  if (!value) return { changed: false, value };

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return { changed: false, value };

    const filtered = parsed.filter(item => {
      const itemId = item && typeof item === 'object' ? item.id : item;
      return !sameId(itemId, checkpointId);
    });

    return {
      changed: filtered.length !== parsed.length,
      value: JSON.stringify(filtered),
    };
  } catch {
    return { changed: false, value };
  }
}

// ✨ NOVO: Heartbeat - Checkpoint registra que está online
// SEM autenticação: Arduino envia heartbeat sem token
router.post('/:checkpointId/heartbeat', async (req, res) => {
  try {
    const { checkpointId } = req.params;
    const now = new Date();
    
    const checkpoint = await queryOne(
      'SELECT id FROM pontoVerificacao WHERE id = @id',
      { id: checkpointId }
    );
    if (!checkpoint) {
      return res.status(404).json({ error: 'Checkpoint não encontrado' });
    }

    // O Arduino envia heartbeat sem JWT; a existência do checkpoint ainda é
    // validada para não aceitar IDs arbitrários.
    try {
      await query(
        `UPDATE pontoVerificacao SET status = 'online', ultimoVisto = @now WHERE id = @id`,
        { id: checkpointId, now }
      );
    } catch (err) {
      // Se coluna ultimoVisto não existe, só atualiza o status
      if (err.message.includes('ultimoVisto')) {
        await query(
          `UPDATE pontoVerificacao SET status = 'online' WHERE id = @id`,
          { id: checkpointId }
        );
      } else {
        throw err;
      }
    }
    
    res.json({ ok: true, message: 'Checkpoint online', timestamp: now });
  } catch (err) {
    console.error('❌ Erro ao processar heartbeat:', err);
    res.status(500).json({ error: err.message });
  }
});

// Resumo dos pontoVerificacao de jogo de TODOS os eventos da empresa: quantos estão
// cadastrados e quantos online, por evento. Os pontoVerificacao de recepção ficam de fora.
// "Indisponíveis" = cadastrados - online (offline ou sem status).
router.get('/resumo', verifyToken, async (req, res) => {
  try {
    const rows = await allQuery(`
      SELECT
        c.eventoId,
        e.name AS evento_name,
        e.status AS evento_status,
        e.date AS evento_date,
        COUNT(*) AS total,
        SUM(CASE WHEN c.status = 'online' THEN 1 ELSE 0 END) AS online
      FROM pontoVerificacao c
      INNER JOIN eventos e ON e.id = c.eventoId
      WHERE e.empresaId = @empresaId
        AND LOWER(COALESCE(c.propositoCheckpoint, 'game')) <> 'reception'
      GROUP BY c.eventoId, e.name, e.status, e.date
      ORDER BY e.date DESC
    `, { empresaId: req.user.empresaId });

    res.json(rows.map((row) => {
      const total = Number(row.total) || 0;
      const online = Number(row.online) || 0;
      return {
        eventoId: row.eventoId,
        eventoName: row.evento_name,
        eventoStatus: row.evento_status,
        eventoDate: row.evento_date,
        total,
        online,
        offline: total - online,
      };
    }));
  } catch (err) {
    console.error('❌ Erro ao resumir pontoVerificacao:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/evento/:eventoId', verifyToken, async (req, res) => {
  try {
    const { eventoId } = req.params;
    console.log(`📍 [CHECKPOINTS] GET /evento/:eventoId chamado`);
    console.log(`   👤 User: ${req.user.email} (role: ${req.user.role})`);
    console.log(`   🎯 eventoId: ${eventoId}`);
    
    const evento = await queryOne(
      'SELECT id, empresaId FROM eventos WHERE id = @eventoId',
      { eventoId }
    );

    if (!evento) {
      console.log(`❌ [CHECKPOINTS] Evento ${eventoId} NÃO ENCONTRADO no banco`);
      return res.status(404).json({ error: 'Evento não encontrado' });
    }

    console.log(`✅ [CHECKPOINTS] Evento encontrado: ${evento.id}, empresaId: ${evento.empresaId}`);

    // Permitir: master (acesso total), family (acesso a leitura), ou mesma empresa
    if (!isMaster(req) && req.user.role !== 'family' && !sameId(evento.empresaId, req.user.empresaId)) {
      console.log(`❌ [CHECKPOINTS] Acesso negado para usuario ${req.user.email}`);
      return res.status(403).json({ error: 'Acesso negado: evento não pertence a esta empresa' });
    }

    const pontoVerificacao = await allQuery(
      `SELECT * FROM pontoVerificacao
       WHERE eventoId = @eventoId
         AND empresaId = @empresaId
         AND LOWER(COALESCE(propositoCheckpoint, 'game')) <> 'reception'
       ORDER BY name`,
      { eventoId, empresaId: evento.empresaId }
    );

    console.log(`📊 [CHECKPOINTS] Encontrados ${pontoVerificacao.length} pontoVerificacao para evento ${eventoId}`);
    res.json(pontoVerificacao || []);
  } catch (err) {
    console.error('❌ Erro ao listar pontoVerificacao:', err.message);
    res.status(500).json({ error: err.message || 'Erro ao consultar pontoVerificacao' });
  }
});

router.get('/:id/config', verifyToken, async (req, res) => {
  try {
    const checkpoint = await queryOne(
      `SELECT * FROM pontoVerificacao 
       WHERE id = @id AND empresaId = @empresaId`,
      { id: req.params.id, empresaId: req.user.empresaId }
    );

    if (!checkpoint) {
      return res.status(404).json({ error: 'Checkpoint não encontrado' });
    }

    // Buscar tags autorizadas
    const tags = await allQuery(
      'SELECT tagUid FROM checkpointTags WHERE checkpointId = @id',
      { id: req.params.id }
    );

    checkpoint.authorizedTags = tags.map(t => t.tagUid);
    checkpoint.ledColor = checkpoint.corLed || '#00FF00';

    res.json(checkpoint);
  } catch (err) {
    console.error('❌ Erro ao buscar configuração do checkpoint:', err);
    res.status(500).json({ error: err.message });
  }
});

// ✨ NOVO: Buscar status do território de um checkpoint
router.get('/:id/territory', async (req, res) => {
  try {
    const checkpoint = await queryOne(
      `SELECT 
        id,
        territorioTravadoAte,
        territorioCooldownAte,
        territorioDonoTimeId,
        propositoCheckpoint
      FROM pontoVerificacao WHERE id = @id`,
      { id: req.params.id }
    );

    if (!checkpoint) {
      return res.status(404).json({ error: 'Checkpoint não encontrado' });
    }
    if (String(checkpoint.propositoCheckpoint || 'game').toLowerCase() === 'reception') {
      return res.status(404).json({ error: 'Checkpoint de recepção não possui território de jogo' });
    }

    const now = new Date();
    const isLocked = checkpoint.territorioTravadoAte && new Date(checkpoint.territorioTravadoAte) > now;
    const isCooldown = checkpoint.territorioCooldownAte && new Date(checkpoint.territorioCooldownAte) > now;

    // Se tem owner, buscar informações do time
    let ownerTeam = null;
    if (checkpoint.territorioDonoTimeId) {
      ownerTeam = await queryOne(
        `SELECT id, name, color FROM times WHERE id = @id`,
        { id: checkpoint.territorioDonoTimeId }
      );
    }

    const treasureStatus = await getCheckpointTreasureStatus(req.params.id);
    const monsterStatus = await getCheckpointMonsterStatus(req.params.id);

    // O ESP32 decide a cor do LED pelo campo `gameType`. Resolvemos ele de forma
    // explícita para que o espalhamento de um status não sobrescreva o do outro.
    const activeGameType = [treasureStatus.gameType, monsterStatus.gameType]
      .find(type => type && type !== 'none') || 'none';

    // `monsters` traz o progresso de todas as equipes e é grande demais para o
    // buffer JSON do firmware. Ele continua disponível em /api/monster/...
    const { monsters, ...monsterSummary } = monsterStatus;

    res.json({
      checkpointId: checkpoint.id,
      isLocked,
      isCooldown,
      ownerTeam: ownerTeam || null,
      lockedUntil: checkpoint.territorioTravadoAte,
      cooldownUntil: checkpoint.territorioCooldownAte,
      remainingSeconds: isLocked ? Math.max(0, Math.ceil((new Date(checkpoint.territorioTravadoAte) - now) / 1000)) : 0,
      cooldownRemaining: isCooldown ? Math.max(0, Math.ceil((new Date(checkpoint.territorioCooldownAte) - now) / 1000)) : 0,
      ...treasureStatus,
      ...monsterSummary,
      gameType: activeGameType
    });
  } catch (err) {
    console.error('❌ Erro ao buscar status do território:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST - Criar novo checkpoint
router.post('/evento/:eventoId', verifyToken, async (req, res) => {
  try {
    const { eventoId } = req.params;
    const empresaId = req.user.empresaId; // ✅ Pegar empresaId do token
    const { id, name, type, zone, ip, points, status, authorizedTags, mapX, mapY } = req.body;

    // Validar campos obrigatórios
    if (!id || !name) {
      return res.status(400).json({ error: 'ID e Nome são obrigatórios' });
    }

    // ✅ Validar que o evento pertence à empresa do usuário
    const evento = await queryOne(
      'SELECT id, empresaId FROM eventos WHERE id = @id',
      { id: eventoId }
    );

    if (!evento) {
      return res.status(404).json({ error: 'Evento não encontrado' });
    }

    if (!isMaster(req) && !sameId(evento.empresaId, empresaId)) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence a esta empresa' });
    }

    // Verificar se checkpoint já existe
    const existing = await queryOne(
      'SELECT id FROM pontoVerificacao WHERE id = @id AND eventoId = @eventoId',
      { id, eventoId }
    );

    if (existing) {
      return res.status(400).json({ error: 'Checkpoint com este ID já existe' });
    }

    // ✅ Inserir novo checkpoint COM empresaId
    await query(`
      INSERT INTO pontoVerificacao (id, eventoId, empresaId, name, type, propositoCheckpoint, zone, ip, points, status, tagsAutorizadas, mapaX, mapaY)
      VALUES (@id, @eventoId, @empresaId, @name, @type, @propositoCheckpoint, @zone, @ip, @points, @status, @tagsAutorizadas, @mapaX, @mapaY)
    `, {
      id,
      eventoId,
      empresaId, // ✅ NOVO: Incluir empresaId
      name,
      type: type || 'NFC',
      propositoCheckpoint: 'game',
      zone: zone || null,
      ip: ip || null,
      points: points || 10,
      status: status || 'configured',
      tagsAutorizadas: authorizedTags ? JSON.stringify(authorizedTags) : null,
      mapaX: Number.isFinite(Number(mapX)) ? Math.round(Number(mapX)) : null,
      mapaY: Number.isFinite(Number(mapY)) ? Math.round(Number(mapY)) : null
    });

    console.log(`✅ Checkpoint criado: ${name} (empresaId: ${empresaId})`);
    res.json({ success: true, message: 'Checkpoint criado com sucesso', id, empresaId });
  } catch (err) {
    console.error('❌ Erro ao criar checkpoint:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST - Autorizar tags para checkpoint
// SEM autenticação: Arduino envia tags sem token
router.post('/:checkpointId/authorize-tags', async (req, res) => {
  try {
    const { checkpointId } = req.params;
    console.log(`\n📖 [CHECKPOINTS-AUTH-TAGS] POST recebido: checkpointId=${checkpointId}, body=${JSON.stringify(req.body)}`);
    const { tags } = req.body; // Array de UIDs: ["1C:AB:3A:72", "AA:BB:CC:DD"]

    if (!Array.isArray(tags) || tags.length === 0) {
      return res.status(400).json({ error: 'Tags não fornecidas ou inválidas' });
    }

    // ✅ Verificar se checkpoint existe (sem validação de empresa - é Arduino)
    const checkpoint = await queryOne(
      'SELECT id FROM pontoVerificacao WHERE id = @id',
      { id: checkpointId }
    );

    if (!checkpoint) {
      return res.status(404).json({ error: 'Checkpoint não encontrado' });
    }

    // Limpar tags antigas
    await query('DELETE FROM checkpointTags WHERE checkpointId = @id', { id: checkpointId });

    // Inserir novas tags
    for (const tag of tags) {
      if (tag && tag.trim()) {
        await query(
          'INSERT INTO checkpointTags (checkpointId, tagUid) VALUES (@checkpointId, @tagUid)',
          { checkpointId: checkpointId, tagUid: tag.trim().toUpperCase() }
        );
      }
    }

    console.log(`✅ ${tags.length} tags autorizadas para checkpoint ${checkpointId}`);
    res.json({ ok: true, message: 'Tags autorizadas com sucesso', count: tags.length });
  } catch (err) {
    console.error('❌ Erro ao autorizar tags:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE - Excluir checkpoint
router.delete('/evento/:eventoId/:checkpointId', verifyToken, async (req, res) => {
  try {
    const { eventoId, checkpointId } = req.params;
    const empresaId = req.user.empresaId;

    const evento = await queryOne(
      'SELECT id, empresaId FROM eventos WHERE LOWER(id) = LOWER(@id)',
      { id: eventoId }
    );

    if (!evento) {
      return res.status(404).json({ error: 'Evento não encontrado' });
    }

    if (!sameId(evento.empresaId, empresaId)) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence a esta empresa' });
    }

    const checkpoint = await queryOne(
      `SELECT id, propositoCheckpoint FROM pontoVerificacao
       WHERE LOWER(id) = LOWER(@id)
         AND LOWER(eventoId) = LOWER(@eventoId)
         AND LOWER(empresaId) = LOWER(@empresaId)`,
      { id: checkpointId, eventoId, empresaId }
    );

    if (!checkpoint) {
      return res.status(404).json({ error: 'Checkpoint não encontrado' });
    }

    if (String(checkpoint.propositoCheckpoint || 'game').toLowerCase() === 'reception') {
      return res.status(409).json({ error: 'O checkpoint da recepção não pode ser excluído por esta tela' });
    }

    // Não alterar a estrutura de uma partida enquanto o jogo está ativo.
    const activeTreasure = await queryOne(
      `SELECT id FROM cacaTesourPartidas
       WHERE LOWER(eventoId) = LOWER(@eventoId) AND status = 'active'`,
      { eventoId }
    );
    if (activeTreasure) {
      return res.status(409).json({
        error: 'Não é possível excluir checkpoint enquanto o Caça ao Tesouro está ativo. Finalize o jogo primeiro.',
      });
    }

    const activeMonster = await queryOne(
      `SELECT id FROM monsterHuntPartidas
       WHERE LOWER(eventoId) = LOWER(@eventoId) AND status = 'active'`,
      { eventoId }
    );
    if (activeMonster) {
      return res.status(409).json({
        error: 'Não é possível excluir checkpoint enquanto o Caça ao Monstro está ativo. Finalize o jogo primeiro.',
      });
    }

    // Remover o checkpoint de históricos JSON de partidas encerradas.
    const treasureSessions = await allQuery(
      `SELECT id, checkpointAlvoId, checkpointsCompletadosIds
       FROM cacaTesourPartidas
       WHERE LOWER(eventoId) = LOWER(@eventoId)`,
      { eventoId }
    );
    for (const session of treasureSessions) {
      const completed = removeCheckpointFromJson(session.checkpointsCompletadosIds, checkpointId);
      const targetWasDeleted = sameId(session.checkpointAlvoId, checkpointId);
      if (completed.changed || targetWasDeleted) {
        await query(
          `UPDATE cacaTesourPartidas
           SET checkpointAlvoId = @targetCheckpointId,
               checkpointsCompletadosIds = @completedCheckpointIds
           WHERE LOWER(id) = LOWER(@partidaId)`,
          {
            partidaId: session.id,
            targetCheckpointId: targetWasDeleted ? null : session.checkpointAlvoId,
            completedCheckpointIds: completed.changed
              ? completed.value
              : session.checkpointsCompletadosIds,
          }
        );
      }
    }

    // Remover referências serializadas da configuração dos jogos do evento.
    const brincadeiras = await allQuery(
      `SELECT id, pontoVerificacao
       FROM brincadeiras
       WHERE LOWER(empresaId) = LOWER(@empresaId)
         AND LOWER(COALESCE(status, 'active')) <> 'archived'
         AND (
           LOWER(eventoId) = LOWER(@eventoId)
           OR EXISTS (
             SELECT 1 FROM eventoBrincadeiras eb
             WHERE LOWER(eb.brincadeiraId) = LOWER(brincadeiras.id)
               AND LOWER(eb.eventoId) = LOWER(@eventoId)
           )
         )`,
      { empresaId: evento.empresaId, eventoId }
    );
    for (const brincadeira of brincadeiras) {
      const cleaned = removeCheckpointFromJson(brincadeira.pontoVerificacao, checkpointId);
      if (cleaned.changed) {
        await query(
          `UPDATE brincadeiras SET pontoVerificacao = @pontoVerificacao
           WHERE LOWER(id) = LOWER(@brincadeiraId)`,
          { brincadeiraId: brincadeira.id, pontoVerificacao: cleaned.value }
        );
      }
    }

    // As FKs do schema não usam ON DELETE CASCADE; limpar dependências antes
    // do registro principal evita a violação de FK sem afetar outros eventos.
    await query(
      `DELETE FROM monsterHuntScans
       WHERE LOWER(checkpointId) = LOWER(@checkpointId)
         AND LOWER(eventoId) = LOWER(@eventoId)`,
      { checkpointId: checkpoint.id, eventoId }
    );
    await query(
      `DELETE FROM cacaTesourScans
       WHERE LOWER(checkpointId) = LOWER(@checkpointId)
         AND LOWER(eventoId) = LOWER(@eventoId)`,
      { checkpointId: checkpoint.id, eventoId }
    );
    await query(
      `DELETE FROM pontuacoes
       WHERE LOWER(checkpointId) = LOWER(@checkpointId)
         AND LOWER(eventoId) = LOWER(@eventoId)`,
      { checkpointId: checkpoint.id, eventoId }
    );
    await query(
      `DELETE FROM leituras
       WHERE LOWER(checkpointId) = LOWER(@checkpointId)`,
      { checkpointId: checkpoint.id }
    );
    await query(
      `DELETE FROM checkpointTags
       WHERE LOWER(checkpointId) = LOWER(@checkpointId)`,
      { checkpointId: checkpoint.id }
    );
    await query(
      `DELETE FROM pontoVerificacao
       WHERE LOWER(id) = LOWER(@checkpointId)
         AND LOWER(eventoId) = LOWER(@eventoId)
         AND LOWER(empresaId) = LOWER(@empresaId)`,
      { checkpointId: checkpoint.id, eventoId, empresaId }
    );

    res.json({ success: true, message: 'Checkpoint excluído com sucesso' });
  } catch (err) {
    console.error('❌ Erro ao excluir checkpoint:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/evento/:eventoId/config/:id', verifyToken, async (req, res) => {
  try {
    const { eventoId, id } = req.params;
    const empresaId = req.user.empresaId; // ✅ Pegar empresaId do token
    const { name, status, location, type, zone, ip, points, authorizedTags, mapX, mapY } = req.body;

    // ✅ Validar que o evento pertence à empresa do usuário
    const evento = await queryOne(
      'SELECT id, empresaId FROM eventos WHERE id = @id',
      { id: eventoId }
    );

    if (!evento) {
      return res.status(404).json({ error: 'Evento não encontrado' });
    }

    if (!isMaster(req) && !sameId(evento.empresaId, empresaId)) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence a esta empresa' });
    }

    // Construir UPDATE dinamicamente
    let updateFields = [];
    let params = { id, eventoId };

    if (name !== undefined) {
      updateFields.push('name = @name');
      params.name = name;
    }
    if (status !== undefined) {
      updateFields.push('status = @status');
      params.status = status;
    }
    if (location !== undefined) {
      updateFields.push('location = @location');
      params.location = location;
    }
    if (type !== undefined) {
      updateFields.push('type = @type');
      params.type = type;
    }
    if (zone !== undefined) {
      updateFields.push('zone = @zone');
      params.zone = zone;
    }
    if (ip !== undefined) {
      updateFields.push('ip = @ip');
      params.ip = ip;
    }
    if (points !== undefined) {
      updateFields.push('points = @points');
      params.points = points;
    }
    if (authorizedTags !== undefined) {
      updateFields.push('tagsAutorizadas = @tagsAutorizadas');
      params.tagsAutorizadas = authorizedTags ? JSON.stringify(authorizedTags) : null;
    }
    if (mapX !== undefined) {
      updateFields.push('mapaX = @mapaX');
      params.mapaX = Number.isFinite(Number(mapX)) ? Math.round(Number(mapX)) : null;
    }
    if (mapY !== undefined) {
      updateFields.push('mapaY = @mapaY');
      params.mapaY = Number.isFinite(Number(mapY)) ? Math.round(Number(mapY)) : null;
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    }

    const updateQuery = `
      UPDATE pontoVerificacao 
      SET ${updateFields.join(', ')}
      WHERE id = @id AND eventoId = @eventoId AND empresaId = @empresaId
    `;
    
    params.empresaId = empresaId; // ✅ Validar empresaId

    await query(updateQuery, params);

    res.json({ success: true, message: 'Configuração salva com sucesso' });
  } catch (err) {
    console.error('❌ Erro ao salvar configuração:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
