const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { query, queryOne, allQuery } = require('../database');
const { verifyToken, isMaster } = require('../utils/middleware');

// Listar times/equipes da empresa
router.get('/', verifyToken, async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const role = req.user.role;

    let times;
    if (isMaster(req)) {
      // Master vê todos os times (exceto os da Master Admin)
      times = await allQuery(`
        SELECT t.* FROM times t
        LEFT JOIN empresas e ON t.empresa_id = e.id
        WHERE e.nome != 'Master Admin'
        ORDER BY t.name
      `);
      console.log(`✅ ${times.length} times (master - TODAS as empresas, exceto Master Admin)`);
    } else {
      times = await allQuery(
        'SELECT * FROM times WHERE empresa_id = @empresa_id ORDER BY name',
        { empresa_id }
      );
      console.log(`✅ ${times.length} times da empresa ${empresa_id}`);
    }

    res.json(times);
  } catch (err) {
    console.error('❌ Erro ao listar times:', err);
    res.status(500).json({ error: err.message });
  }
});

// Listar times de um evento específico
router.get('/eventos/:evento_id/times', verifyToken, async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;

    const times = await allQuery(
      `SELECT * FROM times 
       WHERE evento_id = @evento_id AND empresa_id = @empresa_id 
       ORDER BY points DESC`,
      { evento_id: req.params.evento_id, empresa_id }
    );

    res.json(times);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Criar time/equipe
router.post('/', verifyToken, async (req, res) => {
  try {
    const { name, color, evento_id } = req.body;
    const empresa_id = req.user.empresa_id;

    if (!name || !color) {
      return res.status(400).json({ error: 'nome e cor são obrigatórios' });
    }

    // ✅ VERIFICAR EMPRESA
    const empresa = await queryOne(
      'SELECT id FROM empresas WHERE id = @id',
      { id: empresa_id }
    );

    if (!empresa) {
      return res.status(403).json({ error: 'Empresa não encontrada' });
    }

    // ✅ CRIAR
    const id = uuidv4();

    await query(
      `INSERT INTO times (id, evento_id, empresa_id, name, color) 
       VALUES (@id, @evento_id, @empresa_id, @name, @color)`,
      { id, evento_id: evento_id || null, empresa_id, name, color }
    );

    console.log(`✅ Time criado: ${name} (empresa: ${empresa_id}${evento_id ? `, evento: ${evento_id}` : ', sem evento'})`);
    res.json({ id, evento_id: evento_id || null, empresa_id, name, color, points: 0 });
  } catch (err) {
    console.error('❌ Erro ao criar time:', err);
    res.status(500).json({ error: err.message });
  }
});

// Atualizar time
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { name, color } = req.body;
    const empresa_id = req.user.empresa_id;

    // ✅ VERIFICAR QUE PERTENCE À EMPRESA
    const time = await queryOne(
      'SELECT empresa_id FROM times WHERE id = @id',
      { id: req.params.id }
    );

    if (!time) {
      return res.status(404).json({ error: 'Time não encontrado' });
    }

    if (time.empresa_id !== empresa_id) {
      return res.status(403).json({ error: 'Acesso negado: time não pertence a esta empresa' });
    }

    // ✅ ATUALIZAR
    await query(
      'UPDATE times SET name = @name, color = @color WHERE id = @id',
      { name, color, id: req.params.id }
    );

    console.log(`✅ Time atualizado: ${req.params.id}`);
    res.json({ updated: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Deletar time
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;

    // ✅ VERIFICAR QUE PERTENCE À EMPRESA
    const time = await queryOne(
      'SELECT empresa_id FROM times WHERE id = @id',
      { id: req.params.id }
    );

    if (!time) {
      return res.status(404).json({ error: 'Time não encontrado' });
    }

    if (time.empresa_id !== empresa_id) {
      return res.status(403).json({ error: 'Acesso negado: time não pertence a esta empresa' });
    }

    // ✅ DELETAR
    await query('DELETE FROM times WHERE id = @id', { id: req.params.id });

    console.log(`✅ Time deletado: ${req.params.id}`);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
