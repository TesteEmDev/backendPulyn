const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { query, queryOne, allQuery, withTransaction } = require('../database');
const { verifyToken, isMaster, requireRole } = require('../utils/middleware');
const { planRandomDistribution, DISTRIBUTION_MODES } = require('../utils/teamDistribution');
const { planDefaultTeams } = require('../utils/defaultTeams');

const TEAM_MANAGER_ROLES = ['admin', 'reception', 'game_master', 'master'];

// Listar times/equipes da empresa
router.get('/', verifyToken, async (req, res) => {
  try {
    const empresaId = req.user.empresaId;
    const role = req.user.role;

    let times;
    if (isMaster(req)) {
      // Master vê todos os times (exceto os da Master Admin)
      times = await allQuery(`
        SELECT t.*, (SELECT COUNT(*) FROM criancas c WHERE c.timeId = t.id) AS members_count
        FROM times t
        LEFT JOIN empresas e ON t.empresaId = e.id
        WHERE e.nome != 'Master Admin'
        ORDER BY t.name
      `);
      console.log(`✅ ${times.length} times (master - TODAS as empresas, exceto Master Admin)`);
    } else {
      times = await allQuery(
        `SELECT t.*, (SELECT COUNT(*) FROM criancas c WHERE c.timeId = t.id) AS members_count
         FROM times t WHERE t.empresaId = @empresaId ORDER BY t.name`,
        { empresaId }
      );
      console.log(`✅ ${times.length} times da empresa ${empresaId}`);
    }

    res.json(times);
  } catch (err) {
    console.error('❌ Erro ao listar times:', err);
    res.status(500).json({ error: err.message });
  }
});

// Times padrão: modelos da empresa, guardados como times sem evento.
router.get('/padrao', verifyToken, requireRole(TEAM_MANAGER_ROLES), async (req, res) => {
  try {
    const templates = await allQuery(
      'SELECT id, name, color, criadoEm FROM times WHERE eventoId IS NULL AND empresaId = @empresaId ORDER BY criadoEm, name',
      { empresaId: req.user.empresaId }
    );
    res.json(templates);
  } catch (err) {
    console.error('❌ Erro ao listar times padrão:', err);
    res.status(500).json({ error: err.message });
  }
});

// Copia os times padrão para o evento (sem duplicar os que já existem pelo nome).
router.post('/eventos/:eventoId/aplicar-padrao', verifyToken, requireRole(TEAM_MANAGER_ROLES), async (req, res) => {
  try {
    const evento = await queryOne(
      'SELECT id, empresaId FROM eventos WHERE id = @eventoId',
      { eventoId: req.params.eventoId }
    );
    if (!evento) return res.status(404).json({ error: 'Evento não encontrado' });
    if (!isMaster(req) && evento.empresaId !== req.user.empresaId) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence a esta empresa' });
    }

    const result = await withTransaction(async (tx) => {
      const templates = await tx.allQuery(
        'SELECT name, color FROM times WHERE eventoId IS NULL AND empresaId = @empresaId ORDER BY criadoEm, name',
        { empresaId: evento.empresaId }
      );
      if (templates.length === 0) return { error: 'Cadastre os times padrão antes de aplicá-los a um evento.' };

      const existing = await tx.allQuery(
        'SELECT name FROM times WHERE eventoId = @eventoId AND empresaId = @empresaId',
        { eventoId: evento.id, empresaId: evento.empresaId }
      );
      const toCreate = planDefaultTeams({ templates, existingTeams: existing });
      for (const team of toCreate) {
        await tx.query(
          // Todo time adicionado a um evento começa com 0 ponto, mesmo que o modelo tenha outro valor.
          `INSERT INTO times (id, eventoId, empresaId, name, color, points)
           VALUES (@id, @eventoId, @empresaId, @name, @color, 0)`,
          { id: uuidv4(), eventoId: evento.id, empresaId: evento.empresaId, name: team.name, color: team.color }
        );
      }
      return { created: toCreate.length, skipped: templates.length - toCreate.length };
    });

    if (result.error) return res.status(400).json({ error: result.error });
    console.log(`✅ Times padrão aplicados ao evento ${evento.id}: ${result.created} criado(s), ${result.skipped} já existia(m)`);
    res.json(result);
  } catch (err) {
    console.error('❌ Erro ao aplicar times padrão:', err);
    res.status(500).json({ error: err.message });
  }
});

// Listar times de um evento específico
router.get('/eventos/:eventoId/times', verifyToken, async (req, res) => {
  try {
    const empresaId = req.user.empresaId;
    const evento = await queryOne('SELECT id, empresaId FROM eventos WHERE id = @eventoId', { eventoId: req.params.eventoId });
    if (!evento) return res.status(404).json({ error: 'Evento não encontrado' });
    if (!isMaster(req) && evento.empresaId !== empresaId) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence a esta empresa' });
    }

    const times = await allQuery(
      `SELECT * FROM times 
       WHERE eventoId = @eventoId AND (empresaId = @empresaId OR @isMaster = 1)
       ORDER BY points DESC`,
      { eventoId: req.params.eventoId, empresaId, isMaster: isMaster(req) ? 1 : 0 }
    );

    res.json(times);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Criar time/equipe
router.post('/', verifyToken, async (req, res) => {
  try {
    const { name, color, eventoId } = req.body;
    const empresaId = req.user.empresaId;

    if (!name || !color) {
      return res.status(400).json({ error: 'nome e cor são obrigatórios' });
    }

    const evento = eventoId
      ? await queryOne('SELECT id, empresaId FROM eventos WHERE id = @eventoId', { eventoId })
      : null;
    if (eventoId && !evento) return res.status(404).json({ error: 'Evento não encontrado' });
    if (evento && !isMaster(req) && evento.empresaId !== empresaId) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence a esta empresa' });
    }
    const targetEmpresaId = evento?.empresaId || empresaId;
    const empresa = await queryOne('SELECT id FROM empresas WHERE id = @id', { id: targetEmpresaId });
    if (!empresa) return res.status(403).json({ error: 'Empresa não encontrada' });

    // ✅ CRIAR
    const id = uuidv4();

    await query(
      // A pontuação nunca vem do cliente: todo time novo começa com 0 ponto.
      `INSERT INTO times (id, eventoId, empresaId, name, color, points) 
       VALUES (@id, @eventoId, @empresaId, @name, @color, 0)`,
      { id, eventoId: eventoId || null, empresaId: targetEmpresaId, name, color }
    );

    console.log(`✅ Time criado: ${name} (empresa: ${empresaId}${eventoId ? `, evento: ${eventoId}` : ', sem evento'})`);
    res.json({ id, eventoId: eventoId || null, empresaId: targetEmpresaId, name, color, points: 0 });
  } catch (err) {
    console.error('❌ Erro ao criar time:', err);
    res.status(500).json({ error: err.message });
  }
});

// Atualizar time
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { name, color } = req.body;
    const empresaId = req.user.empresaId;

    // ✅ VERIFICAR QUE PERTENCE À EMPRESA
    const time = await queryOne(
      'SELECT empresaId FROM times WHERE id = @id',
      { id: req.params.id }
    );

    if (!time) {
      return res.status(404).json({ error: 'Time não encontrado' });
    }

    if (time.empresaId !== empresaId) {
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
    const empresaId = req.user.empresaId;

    // ✅ VERIFICAR QUE PERTENCE À EMPRESA
    const time = await queryOne(
      'SELECT empresaId FROM times WHERE id = @id',
      { id: req.params.id }
    );

    if (!time) {
      return res.status(404).json({ error: 'Time não encontrado' });
    }

    if (time.empresaId !== empresaId) {
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
  '/eventos/:eventoId/distribuir-aleatorio',
  verifyToken,
  requireRole(TEAM_MANAGER_ROLES),
  async (req, res) => {
    try {
      const mode = String(req.body?.mode || 'unassigned');
      if (!DISTRIBUTION_MODES.has(mode)) return res.status(400).json({ error: 'Modo de distribuição inválido' });

      const evento = await queryOne(
        'SELECT id, empresaId FROM eventos WHERE id = @eventoId',
        { eventoId: req.params.eventoId }
      );
      if (!evento) return res.status(404).json({ error: 'Evento não encontrado' });
      if (!isMaster(req) && evento.empresaId !== req.user.empresaId) {
        return res.status(403).json({ error: 'Acesso negado: evento não pertence a esta empresa' });
      }

      const result = await withTransaction(async (tx) => {
        const teams = await tx.allQuery(
          'SELECT id, name FROM times WHERE eventoId = @eventoId AND empresaId = @empresaId ORDER BY name',
          { eventoId: evento.id, empresaId: evento.empresaId }
        );
        if (teams.length < 2) {
          return { error: 'Crie pelo menos 2 times neste evento antes de distribuir os participantes.' };
        }

        const children = await tx.allQuery(
          'SELECT id, timeId FROM criancas WHERE eventoId = @eventoId AND empresaId = @empresaId',
          { eventoId: evento.id, empresaId: evento.empresaId }
        );
        const assignments = planRandomDistribution({ children, teamIds: teams.map(t => t.id), mode });

        for (const { criancaId, timeId } of assignments) {
          await tx.query(
            'UPDATE criancas SET timeId = @timeId WHERE id = @criancaId AND eventoId = @eventoId',
            { timeId, criancaId, eventoId: evento.id }
          );
        }

        // A pontuação do time é a soma das crianças; recalcula para refletir a nova composição.
        for (const team of teams) {
          await tx.query(
            `UPDATE times
             SET points = (SELECT ISNULL(SUM(scores), 0) FROM criancas WHERE timeId = @timeId)
             WHERE id = @timeId`,
            { timeId: team.id }
          );
        }

        const sizes = await tx.allQuery(
          'SELECT timeId, COUNT(*) AS total FROM criancas WHERE eventoId = @eventoId AND timeId IS NOT NULL GROUP BY timeId',
          { eventoId: evento.id }
        );
        const totalByTeam = new Map(sizes.map(row => [row.timeId, Number(row.total)]));
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
