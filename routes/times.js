const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { query, queryOne, allQuery, withTransaction } = require('../database');
const { verifyToken, isMaster, requireRole } = require('../utils/middleware');
const { planRandomDistribution, DISTRIBUTION_MODES } = require('../utils/teamDistribution');

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
    const evento = await queryOne('SELECT id, empresa_id FROM eventos WHERE id = @evento_id', { evento_id: req.params.evento_id });
    if (!evento) return res.status(404).json({ error: 'Evento não encontrado' });
    if (!isMaster(req) && evento.empresa_id !== empresa_id) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence a esta empresa' });
    }

    const times = await allQuery(
      `SELECT * FROM times 
       WHERE evento_id = @evento_id AND (empresa_id = @empresa_id OR @isMaster = 1)
       ORDER BY points DESC`,
      { evento_id: req.params.evento_id, empresa_id, isMaster: isMaster(req) ? 1 : 0 }
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

    const evento = evento_id
      ? await queryOne('SELECT id, empresa_id FROM eventos WHERE id = @evento_id', { evento_id })
      : null;
    if (evento_id && !evento) return res.status(404).json({ error: 'Evento não encontrado' });
    if (evento && !isMaster(req) && evento.empresa_id !== empresa_id) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence a esta empresa' });
    }
    const targetEmpresaId = evento?.empresa_id || empresa_id;
    const empresa = await queryOne('SELECT id FROM empresas WHERE id = @id', { id: targetEmpresaId });
    if (!empresa) return res.status(403).json({ error: 'Empresa não encontrada' });

    // ✅ CRIAR
    const id = uuidv4();

    await query(
      `INSERT INTO times (id, evento_id, empresa_id, name, color) 
       VALUES (@id, @evento_id, @empresa_id, @name, @color)`,
      { id, evento_id: evento_id || null, empresa_id: targetEmpresaId, name, color }
    );

    console.log(`✅ Time criado: ${name} (empresa: ${empresa_id}${evento_id ? `, evento: ${evento_id}` : ', sem evento'})`);
    res.json({ id, evento_id: evento_id || null, empresa_id: targetEmpresaId, name, color, points: 0 });
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

// Distribuir aleatoriamente as crianças do evento entre os times do evento.
// mode 'unassigned' (padrão): só quem está sem time. mode 'all': sorteia todos de novo.
router.post(
  '/eventos/:evento_id/distribuir-aleatorio',
  verifyToken,
  requireRole('admin', 'reception', 'game_master', 'master'),
  async (req, res) => {
    try {
      const mode = String(req.body?.mode || 'unassigned');
      if (!DISTRIBUTION_MODES.has(mode)) return res.status(400).json({ error: 'Modo de distribuição inválido' });

      const evento = await queryOne(
        'SELECT id, empresa_id FROM eventos WHERE id = @evento_id',
        { evento_id: req.params.evento_id }
      );
      if (!evento) return res.status(404).json({ error: 'Evento não encontrado' });
      if (!isMaster(req) && evento.empresa_id !== req.user.empresa_id) {
        return res.status(403).json({ error: 'Acesso negado: evento não pertence a esta empresa' });
      }

      const result = await withTransaction(async (tx) => {
        const teams = await tx.allQuery(
          'SELECT id, name FROM times WHERE evento_id = @eventoId AND empresa_id = @empresaId ORDER BY name',
          { eventoId: evento.id, empresaId: evento.empresa_id }
        );
        if (teams.length < 2) {
          return { error: 'Crie pelo menos 2 times neste evento antes de distribuir os participantes.' };
        }

        const children = await tx.allQuery(
          'SELECT id, time_id FROM criancas WHERE evento_id = @eventoId AND empresa_id = @empresaId',
          { eventoId: evento.id, empresaId: evento.empresa_id }
        );
        const assignments = planRandomDistribution({ children, teamIds: teams.map(t => t.id), mode });

        for (const { criancaId, timeId } of assignments) {
          await tx.query(
            'UPDATE criancas SET time_id = @timeId WHERE id = @criancaId AND evento_id = @eventoId',
            { timeId, criancaId, eventoId: evento.id }
          );
        }

        // A pontuação do time é a soma das crianças; recalcula para refletir a nova composição.
        for (const team of teams) {
          await tx.query(
            `UPDATE times
             SET points = (SELECT ISNULL(SUM(scores), 0) FROM criancas WHERE time_id = @timeId)
             WHERE id = @timeId`,
            { timeId: team.id }
          );
        }

        const sizes = await tx.allQuery(
          'SELECT time_id, COUNT(*) AS total FROM criancas WHERE evento_id = @eventoId AND time_id IS NOT NULL GROUP BY time_id',
          { eventoId: evento.id }
        );
        const totalByTeam = new Map(sizes.map(row => [row.time_id, Number(row.total)]));
        return {
          mode,
          distributed: assignments.length,
          totalChildren: children.length,
          teams: teams.map(team => ({ id: team.id, name: team.name, members: totalByTeam.get(team.id) || 0 })),
        };
      });

      if (result.error) return res.status(400).json({ error: result.error });
      console.log(`🎲 Distribuição aleatória (${mode}): ${result.distributed} criança(s) no evento ${evento.id}`);
      return res.json(result);
    } catch (err) {
      console.error('❌ Erro ao distribuir participantes:', err);
      return res.status(500).json({ error: err.message });
    }
  }
);

module.exports = router;
