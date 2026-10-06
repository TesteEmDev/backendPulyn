// routes/checkpoints.js - Checkpoints
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
router.post('/:checkpoint_id/heartbeat', async (req, res) => {
  try {
    const { checkpoint_id } = req.params;
    const now = new Date();
    
    const checkpoint = await queryOne(
      'SELECT checkpointId FROM pontoVerificacao WHERE checkpointId = @id',
      { id: checkpoint_id }
    );
    if (!checkpoint) {
      return res.status(404).json({ error: 'Checkpoint não encontrado' });
    }

    // O Arduino envia heartbeat sem JWT; a existência do checkpoint ainda é
    // validada para não aceitar IDs arbitrários.
    try {
      await query(
        `UPDATE pontoVerificacao SET status = 'online', ultimoVisto = @now WHERE checkpointId = @id`,
        { id: checkpoint_id, now }
      );
    } catch (err) {
      // Se coluna last_seen não existe, só atualiza o status
      if (err.message.includes('last_seen')) {
        await query(
          `UPDATE pontoVerificacao SET status = 'online' WHERE checkpointId = @id`,
          { id: checkpoint_id }
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

// Resumo dos checkpoints de jogo de TODOS os eventos da empresa: quantos estão
// cadastrados e quantos online, por evento. Os checkpoints de recepção ficam de fora.
// "Indisponíveis" = cadastrados - online (offline ou sem status).
router.get('/resumo', verifyToken, async (req, res) => {
  try {
    const rows = await allQuery(`
      SELECT
        c.eventoId,
        e.nome AS evento_name,
        e.status AS evento_status,
        e.data AS evento_date,
        COUNT(*) AS total,
        SUM(CASE WHEN c.status = 'online' THEN 1 ELSE 0 END) AS online
      FROM pontoVerificacao c
      INNER JOIN evento e ON e.eventoId = c.eventoId
      WHERE e.empresaId = @empresa_id
        AND LOWER(COALESCE(c.proposito, 'game')) <> 'reception'
      GROUP BY c.eventoId, e.nome, e.status, e.data
      ORDER BY e.data DESC
    `, { empresa_id: req.user.empresa_id });

    res.json(rows.map((row) => {
      const total = Number(row.total) || 0;
      const online = Number(row.online) || 0;
      return {
        eventoId: row.evento_id,
        eventoName: row.evento_name,
        eventoStatus: row.evento_status,
        eventoDate: row.evento_date,
        total,
        online,
        offline: total - online,
      };
    }));
  } catch (err) {
    console.error('❌ Erro ao resumir checkpoints:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/evento/:evento_id', verifyToken, async (req, res) => {
  try {
    const { evento_id } = req.params;
    console.log(`📍 [CHECKPOINTS] GET /evento/:evento_id chamado`);
    console.log(`   👤 User: ${req.user.email} (role: ${req.user.role})`);
    console.log(`   🎯 evento_id: ${evento_id}`);
    
    const evento = await queryOne(
      'SELECT eventoId, empresaId FROM evento WHERE eventoId = @evento_id',
      { evento_id }
    );

    if (!evento) {
      console.log(`❌ [CHECKPOINTS] Evento ${evento_id} NÃO ENCONTRADO no banco`);
      return res.status(404).json({ error: 'Evento não encontrado' });
    }

    console.log(`✅ [CHECKPOINTS] Evento encontrado: ${evento.id}, empresa_id: ${evento.empresa_id}`);

    // Permitir: master (acesso total), family (acesso a leitura), ou mesma empresa
    if (!isMaster(req) && req.user.role !== 'family' && !sameId(evento.empresa_id, req.user.empresa_id)) {
      console.log(`❌ [CHECKPOINTS] Acesso negado para usuario ${req.user.email}`);
      return res.status(403).json({ error: 'Acesso negado: evento não pertence a esta empresa' });
    }

    const checkpoints = await allQuery(
      `SELECT * FROM pontoVerificacao
       WHERE eventoId = @evento_id
         AND empresaId = @empresa_id
         AND LOWER(COALESCE(proposito, 'game')) <> 'reception'
       ORDER BY nome`,
      { evento_id, empresa_id: evento.empresa_id }
    );

    console.log(`📊 [CHECKPOINTS] Encontrados ${checkpoints.length} checkpoints para evento ${evento_id}`);
    res.json(checkpoints || []);
  } catch (err) {
    console.error('❌ Erro ao listar checkpoints:', err.message);
    res.status(500).json({ error: err.message || 'Erro ao consultar checkpoints' });
  }
});

router.get('/:id/config', verifyToken, async (req, res) => {
  try {
    const checkpoint = await queryOne(
      `SELECT * FROM pontoVerificacao 
       WHERE checkpointId = @id AND empresaId = @empresa_id`,
      { id: req.params.id, empresa_id: req.user.empresa_id }
    );

    if (!checkpoint) {
      return res.status(404).json({ error: 'Checkpoint não encontrado' });
    }

    // Buscar tags autorizadas
    const tags = await allQuery(
      'SELECT tagUid FROM etiquetaCheckpoint WHERE checkpointId = @id',
      { id: req.params.id }
    );

    checkpoint.authorizedTags = tags.map(t => t.tag_uid);
    checkpoint.ledColor = checkpoint.led_color || '#00FF00';

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
        checkpointId,
        territorioTravadoAte,
        territorioCooldownAte,
        territorioDonoTimeId,
        proposito
      FROM pontoVerificacao WHERE checkpointId = @id`,
      { id: req.params.id }
    );

    if (!checkpoint) {
      return res.status(404).json({ error: 'Checkpoint não encontrado' });
    }
    if (String(checkpoint.checkpoint_purpose || 'game').toLowerCase() === 'reception') {
      return res.status(404).json({ error: 'Checkpoint de recepção não possui território de jogo' });
    }

    const now = new Date();
    const isLocked = checkpoint.territory_locked_until && new Date(checkpoint.territory_locked_until) > now;
    const isCooldown = checkpoint.territory_cooldown_until && new Date(checkpoint.territory_cooldown_until) > now;

    // Se tem owner, buscar informações do time
    let ownerTeam = null;
    if (checkpoint.territory_owner_time_id) {
      ownerTeam = await queryOne(
        `SELECT timeId, nome, cor FROM time WHERE timeId = @id`,
        { id: checkpoint.territory_owner_time_id }
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
      lockedUntil: checkpoint.territory_locked_until,
      cooldownUntil: checkpoint.territory_cooldown_until,
      remainingSeconds: isLocked ? Math.max(0, Math.ceil((new Date(checkpoint.territory_locked_until) - now) / 1000)) : 0,
      cooldownRemaining: isCooldown ? Math.max(0, Math.ceil((new Date(checkpoint.territory_cooldown_until) - now) / 1000)) : 0,
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
router.post('/evento/:evento_id', verifyToken, async (req, res) => {
  try {
    const { evento_id } = req.params;
    const empresa_id = req.user.empresa_id; // ✅ Pegar empresa_id do token
    const { id, name, type, zone, ip, points, status, authorizedTags, mapX, mapY } = req.body;

    // Validar campos obrigatórios
    if (!id || !name) {
      return res.status(400).json({ error: 'ID e Nome são obrigatórios' });
    }

    // ✅ Validar que o evento pertence à empresa do usuário
    const evento = await queryOne(
      'SELECT eventoId, empresaId FROM evento WHERE eventoId = @id',
      { id: evento_id }
    );

    if (!evento) {
      return res.status(404).json({ error: 'Evento não encontrado' });
    }

    if (!isMaster(req) && !sameId(evento.empresa_id, empresa_id)) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence a esta empresa' });
    }

    // Verificar se checkpoint já existe
    const existing = await queryOne(
      'SELECT checkpointId FROM pontoVerificacao WHERE checkpointId = @id AND eventoId = @evento_id',
      { id, evento_id }
    );

    if (existing) {
      return res.status(400).json({ error: 'Checkpoint com este ID já existe' });
    }

    // ✅ Inserir novo checkpoint COM empresa_id
    await query(`
      INSERT INTO pontoVerificacao (checkpointId, eventoId, empresaId, nome, tipo, proposito, zona, ip, pontos, status, tagsAutorizadas, mapaX, mapaY)
      VALUES (@id, @evento_id, @empresa_id, @name, @type, @checkpoint_purpose, @zone, @ip, @points, @status, @authorized_tags, @map_x, @map_y)
    `, {
      id,
      evento_id,
      empresa_id, // ✅ NOVO: Incluir empresa_id
      name,
      type: type || 'NFC',
      checkpoint_purpose: 'game',
      zone: zone || null,
      ip: ip || null,
      points: points || 10,
      status: status || 'configured',
      authorized_tags: authorizedTags ? JSON.stringify(authorizedTags) : null,
      map_x: Number.isFinite(Number(mapX)) ? Math.round(Number(mapX)) : null,
      map_y: Number.isFinite(Number(mapY)) ? Math.round(Number(mapY)) : null
    });

    console.log(`✅ Checkpoint criado: ${name} (empresa_id: ${empresa_id})`);
    res.json({ success: true, message: 'Checkpoint criado com sucesso', id, empresa_id });
  } catch (err) {
    console.error('❌ Erro ao criar checkpoint:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST - Autorizar tags para checkpoint
// SEM autenticação: Arduino envia tags sem token
router.post('/:checkpoint_id/authorize-tags', async (req, res) => {
  try {
    const { checkpoint_id } = req.params;
    console.log(`\n📖 [CHECKPOINTS-AUTH-TAGS] POST recebido: checkpointId=${checkpoint_id}, body=${JSON.stringify(req.body)}`);
    const { tags } = req.body; // Array de UIDs: ["1C:AB:3A:72", "AA:BB:CC:DD"]

    if (!Array.isArray(tags) || tags.length === 0) {
      return res.status(400).json({ error: 'Tags não fornecidas ou inválidas' });
    }

    // ✅ Verificar se checkpoint existe (sem validação de empresa - é Arduino)
    const checkpoint = await queryOne(
      'SELECT checkpointId FROM pontoVerificacao WHERE checkpointId = @id',
      { id: checkpoint_id }
    );

    if (!checkpoint) {
      return res.status(404).json({ error: 'Checkpoint não encontrado' });
    }

    // Limpar tags antigas
    await query('DELETE FROM etiquetaCheckpoint WHERE checkpointId = @id', { id: checkpoint_id });

    // Inserir novas tags
    for (const tag of tags) {
      if (tag && tag.trim()) {
        await query(
          'INSERT INTO etiquetaCheckpoint (checkpointId, tagUid) VALUES (@checkpointId, @tagUid)',
          { checkpointId: checkpoint_id, tagUid: tag.trim().toUpperCase() }
        );
      }
    }

    console.log(`✅ ${tags.length} tags autorizadas para checkpoint ${checkpoint_id}`);
    res.json({ ok: true, message: 'Tags autorizadas com sucesso', count: tags.length });
  } catch (err) {
    console.error('❌ Erro ao autorizar tags:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE - Excluir checkpoint
router.delete('/evento/:evento_id/:checkpoint_id', verifyToken, async (req, res) => {
  try {
    const { evento_id, checkpoint_id } = req.params;
    const empresa_id = req.user.empresa_id;

    const evento = await queryOne(
      'SELECT eventoId, empresaId FROM evento WHERE LOWER(eventoId) = LOWER(@id)',
      { id: evento_id }
    );

    if (!evento) {
      return res.status(404).json({ error: 'Evento não encontrado' });
    }

    if (!sameId(evento.empresa_id, empresa_id)) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence a esta empresa' });
    }

    const checkpoint = await queryOne(
      `SELECT checkpointId, proposito FROM pontoVerificacao
       WHERE LOWER(checkpointId) = LOWER(@id)
         AND LOWER(eventoId) = LOWER(@evento_id)
         AND LOWER(empresaId) = LOWER(@empresa_id)`,
      { id: checkpoint_id, evento_id, empresa_id }
    );

    if (!checkpoint) {
      return res.status(404).json({ error: 'Checkpoint não encontrado' });
    }

    if (String(checkpoint.checkpoint_purpose || 'game').toLowerCase() === 'reception') {
      return res.status(409).json({ error: 'O checkpoint da recepção não pode ser excluído por esta tela' });
    }

    // Não alterar a estrutura de uma partida enquanto o jogo está ativo.
    const activeTreasure = await queryOne(
      `SELECT partidaId FROM cacaTesourPartida
       WHERE LOWER(eventoId) = LOWER(@evento_id) AND status = 'active'`,
      { evento_id }
    );
    if (activeTreasure) {
      return res.status(409).json({
        error: 'Não é possível excluir checkpoint enquanto o Caça ao Tesouro está ativo. Finalize o jogo primeiro.',
      });
    }

    const activeMonster = await queryOne(
      `SELECT id FROM monsterCacaPartida
       WHERE LOWER(eventoId) = LOWER(@evento_id) AND status = 'active'`,
      { evento_id }
    );
    if (activeMonster) {
      return res.status(409).json({
        error: 'Não é possível excluir checkpoint enquanto o Caça ao Monstro está ativo. Finalize o jogo primeiro.',
      });
    }

    // Remover o checkpoint de históricos JSON de partidas encerradas.
    const treasureSessions = await allQuery(
      `SELECT partidaId, checkpointAlvoId, checkpointsCompletadosIds
       FROM cacaTesourPartida
       WHERE LOWER(eventoId) = LOWER(@evento_id)`,
      { evento_id }
    );
    for (const session of treasureSessions) {
      const completed = removeCheckpointFromJson(session.completed_checkpoint_ids, checkpoint_id);
      const targetWasDeleted = sameId(session.target_checkpoint_id, checkpoint_id);
      if (completed.changed || targetWasDeleted) {
        await query(
          `UPDATE cacaTesourPartida
           SET checkpointAlvoId = @targetCheckpointId,
               checkpointsCompletadosIds = @completedCheckpointIds
           WHERE LOWER(partidaId) = LOWER(@partidaId)`,
          {
            partidaId: session.id,
            targetCheckpointId: targetWasDeleted ? null : session.target_checkpoint_id,
            completedCheckpointIds: completed.changed
              ? completed.value
              : session.completed_checkpoint_ids,
          }
        );
      }
    }

    // Remover referências serializadas da configuração dos jogos do evento.
    const brincadeiras = await allQuery(
      `SELECT brincadeiraId, checkpoints
       FROM brincadeira
       WHERE LOWER(empresaId) = LOWER(@empresa_id)
         AND LOWER(COALESCE(status, 'active')) <> 'archived'
         AND (
           LOWER(eventoId) = LOWER(@evento_id)
           OR EXISTS (
             SELECT 1 FROM eventoBrincadeira eb
             WHERE LOWER(eb.brincadeiraId) = LOWER(brincadeira.brincadeiraId)
               AND LOWER(eb.eventoId) = LOWER(@evento_id)
           )
         )`,
      { empresa_id: evento.empresa_id, evento_id }
    );
    for (const brincadeira of brincadeiras) {
      const cleaned = removeCheckpointFromJson(brincadeira.checkpoints, checkpoint_id);
      if (cleaned.changed) {
        await query(
          `UPDATE brincadeira SET checkpoints = @checkpoints
           WHERE LOWER(brincadeiraId) = LOWER(@brincadeiraId)`,
          { brincadeiraId: brincadeira.id, checkpoints: cleaned.value }
        );
      }
    }

    // As FKs do schema não usam ON DELETE CASCADE; limpar dependências antes
    // do registro principal evita a violação de FK sem afetar outros eventos.
    await query(
      `DELETE FROM monsterCacaLeitura
       WHERE LOWER(checkpointId) = LOWER(@checkpointId)
         AND LOWER(eventoId) = LOWER(@evento_id)`,
      { checkpointId: checkpoint.id, evento_id }
    );
    await query(
      `DELETE FROM cacaTesourScan
       WHERE LOWER(checkpointId) = LOWER(@checkpointId)
         AND LOWER(eventoId) = LOWER(@evento_id)`,
      { checkpointId: checkpoint.id, evento_id }
    );
    await query(
      `DELETE FROM pontuacao
       WHERE LOWER(checkpointId) = LOWER(@checkpointId)
         AND LOWER(eventoId) = LOWER(@evento_id)`,
      { checkpointId: checkpoint.id, evento_id }
    );
    await query(
      `DELETE FROM leitura
       WHERE LOWER(checkpointId) = LOWER(@checkpointId)`,
      { checkpointId: checkpoint.id }
    );
    await query(
      `DELETE FROM etiquetaCheckpoint
       WHERE LOWER(checkpointId) = LOWER(@checkpointId)`,
      { checkpointId: checkpoint.id }
    );
    await query(
      `DELETE FROM pontoVerificacao
       WHERE LOWER(checkpointId) = LOWER(@checkpointId)
         AND LOWER(eventoId) = LOWER(@evento_id)
         AND LOWER(empresaId) = LOWER(@empresa_id)`,
      { checkpointId: checkpoint.id, evento_id, empresa_id }
    );

    res.json({ success: true, message: 'Checkpoint excluído com sucesso' });
  } catch (err) {
    console.error('❌ Erro ao excluir checkpoint:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/evento/:evento_id/config/:id', verifyToken, async (req, res) => {
  try {
    const { evento_id, id } = req.params;
    const empresa_id = req.user.empresa_id; // ✅ Pegar empresa_id do token
    const { name, status, location, type, zone, ip, points, authorizedTags, mapX, mapY } = req.body;

    // ✅ Validar que o evento pertence à empresa do usuário
    const evento = await queryOne(
      'SELECT eventoId, empresaId FROM evento WHERE eventoId = @id',
      { id: evento_id }
    );

    if (!evento) {
      return res.status(404).json({ error: 'Evento não encontrado' });
    }

    if (!isMaster(req) && !sameId(evento.empresa_id, empresa_id)) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence a esta empresa' });
    }

    // Construir UPDATE dinamicamente
    let updateFields = [];
    let params = { id, evento_id };

    if (name !== undefined) {
      updateFields.push('nome = @name');
      params.name = name;
    }
    if (status !== undefined) {
      updateFields.push('status = @status');
      params.status = status;
    }
    if (location !== undefined) {
      updateFields.push('localizacao = @location');
      params.location = location;
    }
    if (type !== undefined) {
      updateFields.push('tipo = @type');
      params.type = type;
    }
    if (zone !== undefined) {
      updateFields.push('zona = @zone');
      params.zone = zone;
    }
    if (ip !== undefined) {
      updateFields.push('ip = @ip');
      params.ip = ip;
    }
    if (points !== undefined) {
      updateFields.push('pontos = @points');
      params.points = points;
    }
    if (authorizedTags !== undefined) {
      updateFields.push('tagsAutorizadas = @authorized_tags');
      params.authorized_tags = authorizedTags ? JSON.stringify(authorizedTags) : null;
    }
    if (mapX !== undefined) {
      updateFields.push('mapaX = @map_x');
      params.map_x = Number.isFinite(Number(mapX)) ? Math.round(Number(mapX)) : null;
    }
    if (mapY !== undefined) {
      updateFields.push('mapaY = @map_y');
      params.map_y = Number.isFinite(Number(mapY)) ? Math.round(Number(mapY)) : null;
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    }

    const updateQuery = `
      UPDATE pontoVerificacao 
      SET ${updateFields.join(', ')}
      WHERE checkpointId = @id AND eventoId = @evento_id AND empresaId = @empresa_id
    `;
    
    params.empresa_id = empresa_id; // ✅ Validar empresa_id

    await query(updateQuery, params);

    res.json({ success: true, message: 'Configuração salva com sucesso' });
  } catch (err) {
    console.error('❌ Erro ao salvar configuração:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
