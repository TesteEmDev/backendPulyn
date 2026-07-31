const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { query, queryOne, allQuery } = require('../database');
const { verifyToken, isMaster } = require('../utils/middleware');

// Listar brincadeiras por empresa/evento do usuário
router.get('/', verifyToken, async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const evento_id = req.query.evento_id ? String(req.query.evento_id) : null;

    let whereClause = 'b.empresa_id = @empresa_id';
    let eventoSelect = 'b.evento_id';
    const params = { empresa_id };

    if (evento_id) {
      const evento = await queryOne(
        'SELECT id, empresa_id FROM eventos WHERE LOWER(id) = LOWER(@evento_id)',
        { evento_id }
      );
      if (!evento) return res.status(404).json({ error: 'Evento não encontrado' });
      if (!isMaster(req) && String(evento.empresa_id).toLowerCase() !== String(empresa_id).toLowerCase()) {
        return res.status(403).json({ error: 'Acesso negado: evento não pertence à sua empresa' });
      }

      // O evento é a fonte do escopo. Aceita tanto o vínculo direto quanto o legado
      // em evento_brincadeiras, sempre mantendo o isolamento pela empresa do evento.
      whereClause = `LOWER(b.empresa_id) = LOWER(@evento_empresa_id)
        AND (
          LOWER(b.evento_id) = LOWER(@evento_id)
          OR EXISTS (
            SELECT 1
            FROM evento_brincadeiras eb
            WHERE LOWER(eb.brincadeira_id) = LOWER(b.id)
              AND LOWER(eb.evento_id) = LOWER(@evento_id)
          )
        )`;
      eventoSelect = '@evento_id AS evento_id';
      params.evento_id = evento_id;
      params.evento_empresa_id = evento.empresa_id;
    }

    console.log(`📋 [BRINCADEIRAS] Buscando jogos${evento_id ? ` do evento ${evento_id}` : ''}`);
    const brincadeiras = await allQuery(
      `SELECT b.id, b.name, b.description, b.rules, b.type, b.duration, b.default_points,
              b.empresa_id, b.status, ${eventoSelect}, b.checkpoints
       FROM brincadeiras b
       WHERE ${whereClause}
       ORDER BY b.name`,
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
    const validTypes = ['team', 'individual', 'cooperative', 'treasure_hunt'];

    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: 'Tipo de jogo inválido' });
    }
    if (!evento_id) {
      return res.status(400).json({ error: 'evento_id é obrigatório' });
    }

    const evento = await queryOne(
      'SELECT id, empresa_id FROM eventos WHERE id = @evento_id',
      { evento_id }
    );
    if (!evento) return res.status(404).json({ error: 'Evento não encontrado' });
    if (!isMaster(req) && evento.empresa_id !== empresa_id) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence à sua empresa' });
    }

    const selectedCheckpointIds = Array.isArray(checkpoints)
      ? checkpoints.map(cp => String(cp.id || cp)).filter(Boolean)
      : [];
    if (selectedCheckpointIds.length === 0) {
      return res.status(400).json({ error: 'Selecione pelo menos um checkpoint' });
    }
    const validCheckpoints = await allQuery(
      `SELECT id FROM checkpoints
       WHERE evento_id = @evento_id
         AND empresa_id = @empresa_id
         AND LOWER(COALESCE(checkpoint_purpose, 'game')) <> 'reception'`,
      { evento_id, empresa_id: evento.empresa_id }
    );
    const validCheckpointIds = new Set(validCheckpoints.map(cp => String(cp.id)));
    if (selectedCheckpointIds.some(id => !validCheckpointIds.has(id))) {
      return res.status(400).json({ error: 'Todos os checkpoints devem pertencer ao evento selecionado' });
    }
    const id = uuidv4();
    const checkpointsJson = checkpoints ? JSON.stringify(checkpoints) : null;
    await query(
      'INSERT INTO brincadeiras (id, name, description, rules, type, duration, default_points, empresa_id, status, evento_id, checkpoints) VALUES (@id, @name, @description, @rules, @type, @duration, @default_points, @empresa_id, @status, @evento_id, @checkpoints)',
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
    
    console.log(`✅ Jogo criado: ${name} (empresa: ${evento.empresa_id}, checkpoints: ${checkpoints?.length || 0})`);
    res.json({ id, name, description, rules, type, duration, default_points, empresa_id: evento.empresa_id, status: 'active', evento_id, checkpoints });
  } catch (err) {
    console.error('❌ Erro ao criar brincadeira:', err);
    res.status(500).json({ error: err.message });
  }
});

// Atualizar brincadeira
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { name, description, rules, type, duration, default_points, status, evento_id, checkpoints } = req.body;
    const empresa_id = req.user.empresa_id;
    const validTypes = ['team', 'individual', 'cooperative', 'treasure_hunt'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: 'Tipo de jogo inválido' });
    }
    
    // ✅ Verificar que o jogo pertence à empresa
    const brincadeira = await queryOne(
      'SELECT id, empresa_id, evento_id FROM brincadeiras WHERE id = @id',
      { id: req.params.id }
    );
    
    if (!brincadeira) {
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
      'SELECT id, empresa_id FROM eventos WHERE id = @evento_id',
      { evento_id: targetEventoId }
    );
    if (!evento) {
      return res.status(404).json({ error: 'Evento não encontrado' });
    }
    if (evento.empresa_id !== brincadeira.empresa_id) {
      return res.status(403).json({ error: 'O jogo e o evento devem pertencer à mesma empresa' });
    }
    
    const selectedCheckpointIds = Array.isArray(checkpoints)
      ? checkpoints.map(cp => String(cp.id || cp)).filter(Boolean)
      : [];
    const checkpointsJson = checkpoints ? JSON.stringify(checkpoints) : null;

    const validCheckpoints = await allQuery(
      `SELECT id FROM checkpoints
       WHERE evento_id = @evento_id
         AND empresa_id = @empresa_id
         AND LOWER(COALESCE(checkpoint_purpose, 'game')) <> 'reception'`,
      { evento_id: targetEventoId, empresa_id: evento.empresa_id }
    );
    const validCheckpointIds = new Set(validCheckpoints.map(cp => String(cp.id)));
    if (selectedCheckpointIds.length === 0 || selectedCheckpointIds.some(id => !validCheckpointIds.has(id))) {
      return res.status(400).json({ error: 'Selecione apenas checkpoints de jogo pertencentes ao evento' });
    }

    await query(
      `UPDATE brincadeiras SET name = @name, description = @description, rules = @rules, 
       type = @type, duration = @duration, default_points = @default_points, status = @status,
       evento_id = @evento_id, checkpoints = @checkpoints
       WHERE id = @id`,
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
    res.json({ updated: true });
  } catch (err) {
    console.error('❌ Erro ao atualizar brincadeira:', err);
    res.status(500).json({ error: err.message });
  }
});

// Deletar brincadeira
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    
    // ✅ Verificar que o jogo pertence à empresa
    const brincadeira = await queryOne(
      'SELECT id, empresa_id FROM brincadeiras WHERE id = @id',
      { id: req.params.id }
    );
    
    if (!brincadeira) {
      return res.status(404).json({ error: 'Jogo não encontrado' });
    }
    
    if (!isMaster(req) && brincadeira.empresa_id !== empresa_id) {
      return res.status(403).json({ error: 'Acesso negado: jogo não pertence a esta empresa' });
    }
    
    await query('DELETE FROM brincadeiras WHERE id = @id', { id: req.params.id });
    
    console.log(`✅ Jogo deletado: ${req.params.id}`);
    res.json({ deleted: true });
  } catch (err) {
    console.error('❌ Erro ao deletar brincadeira:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
