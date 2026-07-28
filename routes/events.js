const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { query, queryOne, allQuery } = require('../database');
const { verifyToken, isMaster } = require('../utils/middleware');

router.use(verifyToken, (req, res, next) => {
  if (req.user?.role === 'family') return res.status(403).json({ error: 'Famílias devem usar os endpoints de vínculo familiar' });
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
        `SELECT * FROM eventos 
         WHERE empresa_id IS NOT NULL
           AND empresa_id NOT IN (SELECT id FROM empresas WHERE nome = 'Master Admin')
         ORDER BY date DESC`
      );
    } else {
      eventos = await allQuery(
        'SELECT * FROM eventos WHERE empresa_id = @empresa_id ORDER BY date DESC',
        { empresa_id }
      );
    }
    
    res.json(eventos);
  } catch (err) {
    console.error('❌ Erro ao listar eventos:', err);
    res.status(500).json({ error: err.message });
  }
});

// Criar evento
router.post('/', verifyToken, async (req, res) => {
  try {
    const { name, description, date, time, duration, enableDisplay, enableLocation } = req.body;
    const empresa_id = req.user.empresa_id;
    const id = uuidv4();
    
    // Validar campos obrigatórios
    if (!name || !date) {
      return res.status(400).json({ error: 'Nome e data são obrigatórios' });
    }
    
    await query(
      `INSERT INTO eventos (id, empresa_id, name, description, date, time, duration, enable_display, enable_location, status) 
       VALUES (@id, @empresa_id, @name, @description, @date, @time, @duration, @enableDisplay, @enableLocation, 'scheduled')`,
      { 
        id, 
        empresa_id,
        name, 
        description, 
        date, 
        time, 
        duration: parseInt(duration) || 60, 
        enableDisplay: enableDisplay ? 1 : 0, 
        enableLocation: enableLocation ? 1 : 0 
      }
    );
    
    res.json({ id, empresa_id, name, description, date, time, duration, enableDisplay, enableLocation, status: 'scheduled' });
  } catch (err) {
    console.error('❌ Erro ao criar evento:', err);
    res.status(500).json({ error: err.message });
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
      'SELECT id, empresa_id FROM eventos WHERE id = @id',
      { id: evento_id }
    );
    
    if (!evento) {
      return res.status(404).json({ error: 'Evento não encontrado' });
    }
    
    if (!isMaster(req) && evento.empresa_id !== empresa_id) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence a esta empresa' });
    }
    
    const criancas = await allQuery(`
      SELECT c.*, t.name as time_name, t.color as time_color 
      FROM criancas c
      LEFT JOIN times t ON c.time_id = t.id
      WHERE c.evento_id = @evento_id
      AND c.empresa_id = @empresa_id
      ORDER BY c.scores DESC
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
    const evento_id = req.params.evento_id;
    const empresa_id = req.user.empresa_id;
    const id = uuidv4();
    
    // 1. Validar evento e verificar permissão
    const evento = await queryOne('SELECT empresa_id FROM eventos WHERE id = @id', { id: evento_id });
    if (!evento || !evento.empresa_id) {
      return res.status(404).json({ error: 'Evento não encontrado ou sem empresa definida' });
    }
    
    // ✅ Verificar permissão (apenas master ou de mesma empresa)
    if (!isMaster(req) && evento.empresa_id !== empresa_id) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence a esta empresa' });
    }
    
    // 2. Validar se pulseira já está vinculada
    if (braceletCode) {
      const existing = await queryOne('SELECT id FROM criancas WHERE bracelet_code = @code', { code: braceletCode });
      if (existing) {
        return res.status(400).json({ error: 'Pulseira já está vinculada a outra criança' });
      }
    }
    
    // 3. Inserir criança
    await query(
      `INSERT INTO criancas (id, evento_id, empresa_id, time_id, name, nickname, age, avatar, bracelet_code, scores) 
       VALUES (@id, @evento_id, @empresa_id, @time_id, @name, @nickname, @age, @avatar, @bracelet_code, 0)`,
      { 
        id, 
        evento_id,
        empresa_id: evento.empresa_id,
        time_id: timeId || null, 
        name, 
        nickname, 
        age: parseInt(age) || 0, 
        avatar: avatar || '👧', 
        bracelet_code: braceletCode || null
      }
    );
    
    // 4. Atualizar status da pulseira se foi fornecida
    if (braceletCode) {
      await query(
        'UPDATE pulseiras SET status = @status, crianca_id = @crianca_id WHERE code = @code', 
        { status: 'em_uso', crianca_id: id, code: braceletCode }
      );
    }
    
    // 5. Atualizar pontos do time
    if (timeId) {
      await query(
        `UPDATE times SET points = (SELECT ISNULL(SUM(scores), 0) FROM criancas WHERE time_id = @time_id) 
         WHERE id = @time_id`,
        { time_id: timeId }
      );
    }
    
    res.json({ id, name, nickname, age, avatar, braceletCode, timeId, scores: 0, empresa_id: evento.empresa_id });
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
      'SELECT id, empresa_id FROM eventos WHERE id = @id',
      { id: evento_id }
    );
    
    if (!evento) {
      return res.status(404).json({ error: 'Evento não encontrado' });
    }
    
    if (!isMaster(req) && evento.empresa_id !== empresa_id) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence a esta empresa' });
    }
    
    const times = await allQuery(`
      SELECT * FROM times 
      WHERE evento_id = @evento_id
      AND empresa_id = @empresa_id
      ORDER BY points DESC
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
      'SELECT id, status, empresa_id FROM eventos WHERE id = @id',
      { id: evento_id }
    );
    
    if (!evento) {
      return res.status(404).json({ gameRunning: false });
    }
    
    if (!isMaster(req) && evento.empresa_id !== empresa_id) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence a esta empresa' });
    }
    
    res.json({ 
      gameRunning: evento.status === 'active',
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
      'SELECT e.id, e.empresa_id, e.active_game_type, b.name as game_name, b.type as game_type FROM eventos e LEFT JOIN brincadeiras b ON e.active_brincadeira_id = b.id WHERE e.id = @id',
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
router.post('/:evento_id/start-game', verifyToken, async (req, res) => {
  try {
    const { brincadeiraId } = req.body;
    const evento_id = req.params.evento_id;
    
    const evento = await queryOne(
      'SELECT id, empresa_id FROM eventos WHERE id = @id',
      { id: evento_id }
    );
    if (!evento) return res.status(404).json({ error: 'Evento não encontrado' });
    if (!isMaster(req) && evento.empresa_id !== req.user.empresa_id) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence a esta empresa' });
    }

    // Buscar a brincadeira para pegar o tipo
    const brincadeira = await queryOne(
      'SELECT id, type, game_type, empresa_id FROM brincadeiras WHERE id = @id',
      { id: brincadeiraId }
    );
    
    if (!brincadeira) {
      return res.status(404).json({ error: 'Jogo não encontrado' });
    }
    if (!isMaster(req) && brincadeira.empresa_id && brincadeira.empresa_id !== req.user.empresa_id) {
      return res.status(403).json({ error: 'Acesso negado: jogo não pertence a esta empresa' });
    }
    
    const gameType = brincadeira.game_type || brincadeira.type || 'standard';
    
    // Atualizar evento para ativar jogo
    await query(
      `UPDATE eventos 
       SET status = @status, 
           active_brincadeira_id = @brincadeiraId,
           active_game_type = @gameType
       WHERE id = @id`,
      { 
        status: 'active',
        brincadeiraId,
        gameType,
        id: evento_id
      }
    );
    
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
router.post('/:evento_id/stop-game', verifyToken, async (req, res) => {
  try {
    const evento_id = req.params.evento_id;
    const evento = await queryOne('SELECT id, empresa_id FROM eventos WHERE id = @id', { id: evento_id });
    if (!evento) return res.status(404).json({ error: 'Evento não encontrado' });
    if (!isMaster(req) && evento.empresa_id !== req.user.empresa_id) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence a esta empresa' });
    }
    
    // Atualizar evento para pausar jogo
    await query(
      `UPDATE eventos 
       SET status = @status, 
           active_brincadeira_id = NULL,
           active_game_type = 'none'
       WHERE id = @id`,
      { 
        status: 'scheduled',
        id: evento_id
      }
    );
    
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
      'SELECT id, empresa_id FROM eventos WHERE id = @id',
      { id: evento_id }
    );
    
    if (!evento) {
      return res.status(404).json({ error: 'Evento não encontrado' });
    }
    
    if (!isMaster(req) && evento.empresa_id !== empresa_id) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence a esta empresa' });
    }
    
    const checkpoints = await allQuery(`
      SELECT * FROM checkpoints 
      WHERE evento_id = @evento_id
      AND empresa_id = @empresa_id
      ORDER BY name ASC
    `, { evento_id, empresa_id });
    res.json(checkpoints);
  } catch (err) {
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
        'SELECT * FROM eventos WHERE id = @id', 
        { id: req.params.id }
      );
    } else {
      // Usuário regular vê apenas eventos da sua empresa
      evento = await queryOne(
        'SELECT * FROM eventos WHERE id = @id AND empresa_id = @empresa_id', 
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
    const { name, description, date, time, duration, enableDisplay, enableLocation, status } = req.body;
    const empresa_id = req.user.empresa_id;

    // Verificar que o evento pertence à empresa (ou user é master)
    const evento = await queryOne(
      'SELECT empresa_id FROM eventos WHERE id = @id',
      { id: req.params.id }
    );

    if (!evento) {
      return res.status(404).json({ error: 'Evento não encontrado' });
    }

    if (!isMaster(req) && evento.empresa_id !== empresa_id) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence a esta empresa' });
    }

    await query(
      `UPDATE eventos SET name = @name, description = @description, date = @date, time = @time, 
       duration = @duration, enable_display = @enableDisplay, enable_location = @enableLocation, status = @status 
       WHERE id = @id`,
      { name, description, date, time, duration: parseInt(duration) || 60, enableDisplay: enableDisplay ? 1 : 0, enableLocation: enableLocation ? 1 : 0, status, id: req.params.id }
    );

    res.json({ updated: true });
  } catch (err) {
    console.error('❌ Erro ao atualizar evento:', err);
    res.status(500).json({ error: err.message });
  }
});

// Deletar evento
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;

    // Verificar que o evento pertence à empresa (ou user é master)
    const evento = await queryOne(
      'SELECT id, empresa_id FROM eventos WHERE id = @id',
      { id: req.params.id }
    );

    if (!evento) {
      return res.status(404).json({ error: 'Evento não encontrado' });
    }

    if (!isMaster(req) && evento.empresa_id !== empresa_id) {
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

module.exports = router;
