const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { query, queryOne, allQuery, withTransaction } = require('../database');
const { verifyToken, isMaster, requireRole } = require('../utils/middleware');
const { planRandomDistribution, DISTRIBUTION_MODES } = require('../utils/teamDistribution');
const { planDefaultTeams } = require('../utils/defaultTeams');

const TEAM_MANAGER_ROLES = ['admin', 'reception', 'game_master', 'master'];

// Listar time/equipes da empresa
router.get('/', verifyToken, async (req, res) => {
  try {
    const empresaId = req.user.empresaId;
    const role = req.user.role;

    let time;
    if (isMaster(req)) {
      // Master vê todos os time (exceto os da Master Admin)
      time = await allQuery(`
        SELECT t.*, (SELECT COUNT(*) FROM crianca c WHERE c.timeId = t.timeId) AS members_count
        FROM "time" t
        LEFT JOIN empresa e ON t.empresaId = e.empresaId
        WHERE e.nome != 'Master Admin'
        ORDER BY t.nome
      `);
      console.log(`✅ ${time.length} time (master - TODAS as empresa, exceto Master Admin)`);
    } else {
      time = await allQuery(
        `SELECT t.*, (SELECT COUNT(*) FROM crianca c WHERE c.timeId = t.timeId) AS members_count
         FROM "time" t WHERE t.empresaId = @empresaId ORDER BY t.nome`,
        { empresaId }
      );
      console.log(`✅ ${time.length} time da empresa ${empresaId}`);
    }

    res.json(time);
  } catch (err) {
    console.error('❌ Erro ao listar time:', err);
    res.status(500).json({ error: err.message });
  }
});

// Times padrão: modelos da empresa, guardados como time sem evento.
router.get('/padrao', verifyToken, requireRole(TEAM_MANAGER_ROLES), async (req, res) => {
  try {
    const templates = await allQuery(
      'SELECT timeId, nome, cor, criadoEm FROM "time" WHERE eventoId IS NULL AND empresaId = @empresaId ORDER BY criadoEm, nome',
      { empresaId: req.user.empresaId }
    );
    res.json(templates);
  } catch (err) {
    console.error('❌ Erro ao listar time padrão:', err);
    res.status(500).json({ error: err.message });
  }
});

// Copia os time padrão para o evento (sem duplicar os que já existem pelo nome).
router.post('/evento/:eventoId/aplicar-padrao', verifyToken, requireRole(TEAM_MANAGER_ROLES), async (req, res) => {
  try {
    const evento = await queryOne(
      'SELECT eventoId, empresaId FROM evento WHERE eventoId = @eventoId',
      { eventoId: req.params.eventoId }
    );
    if (!evento) return res.status(404).json({ error: 'Evento não encontrado' });
    if (!isMaster(req) && evento.empresaId !== req.user.empresaId) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence a esta empresa' });
    }

    const result = await withTransaction(async (tx) => {
      const templates = await tx.allQuery(
        'SELECT nome, cor FROM "time" WHERE eventoId IS NULL AND empresaId = @empresaId ORDER BY criadoEm, nome',
        { empresaId: evento.empresaId }
      );
      if (templates.length === 0) return { error: 'Cadastre os time padrão antes de aplicá-los a um evento.' };

      const existing = await tx.allQuery(
        'SELECT nome FROM "time" WHERE eventoId = @eventoId AND empresaId = @empresaId',
        { eventoId: evento.eventoId, empresaId: evento.empresaId }
      );
      const toCreate = planDefaultTeams({
        templates: templates.map(t => ({ name: t.nome, color: t.cor })),
        existingTeams: existing.map(t => ({ name: t.nome })),
      });
      for (const team of toCreate) {
        await tx.query(
          // Todo time adicionado a um evento começa com 0 ponto, mesmo que o modelo tenha outro valor.
          `INSERT INTO "time" (timeId, eventoId, empresaId, nome, cor, pontos)
           VALUES (@id, @eventoId, @empresaId, @nome, @cor, 0)`,
          { id: uuidv4(), eventoId: evento.eventoId, empresaId: evento.empresaId, nome: team.name, cor: team.color }
        );
      }
      return { created: toCreate.length, skipped: templates.length - toCreate.length };
    });

    if (result.error) return res.status(400).json({ error: result.error });
    console.log(`✅ Times padrão aplicados ao evento ${evento.eventoId}: ${result.created} criado(s), ${result.skipped} já existia(m)`);
    res.json(result);
  } catch (err) {
    console.error('❌ Erro ao aplicar time padrão:', err);
    res.status(500).json({ error: err.message });
  }
});

// Listar time de um evento específico
router.get('/evento/:eventoId/time', verifyToken, async (req, res) => {
  try {
    const empresaId = req.user.empresaId;
    const evento = await queryOne('SELECT eventoId, empresaId FROM evento WHERE eventoId = @eventoId', { eventoId: req.params.eventoId });
    if (!evento) return res.status(404).json({ error: 'Evento não encontrado' });
    if (!isMaster(req) && evento.empresaId !== empresaId) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence a esta empresa' });
    }

    const time = await allQuery(
      `SELECT * FROM "time" 
       WHERE eventoId = @eventoId AND (empresaId = @empresaId OR @isMaster = 1)
       ORDER BY pontos DESC`,
      { eventoId: req.params.eventoId, empresaId, isMaster: isMaster(req) ? 1 : 0 }
    );

    res.json(time);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Criar time/equipe
router.post('/', verifyToken, async (req, res) => {
  try {
    const { nome, color, eventoId } = req.body;
    const empresaId = req.user.empresaId;

    if (!nome || !color) {
      return res.status(400).json({ error: 'nome e cor são obrigatórios' });
    }

    const evento = eventoId
      ? await queryOne('SELECT eventoId, empresaId FROM evento WHERE eventoId = @eventoId', { eventoId })
      : null;
    if (eventoId && !evento) return res.status(404).json({ error: 'Evento não encontrado' });
    if (evento && !isMaster(req) && evento.empresaId !== empresaId) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence a esta empresa' });
    }
    const targetEmpresaId = evento?.empresaId || empresaId;
    const empresa = await queryOne('SELECT empresaId FROM empresa WHERE empresaId = @id', { id: targetEmpresaId });
    if (!empresa) return res.status(403).json({ error: 'Empresa não encontrada' });

    // ✅ CRIAR
    const id = uuidv4();

    await query(
      // A pontuação nunca vem do cliente: todo time novo começa com 0 ponto.
      `INSERT INTO "time" (timeId, eventoId, empresaId, nome, cor, pontos) 
       VALUES (@id, @eventoId, @empresaId, @nome, @color, 0)`,
      { id, eventoId: eventoId || null, empresaId: targetEmpresaId, nome, color }
    );

    console.log(`✅ Time criado: ${nome} (empresa: ${empresaId}${eventoId ? `, evento: ${eventoId}` : ', sem evento'})`);
    res.json({ id, eventoId: eventoId || null, empresaId: targetEmpresaId, nome, color, points: 0 });
  } catch (err) {
    console.error('❌ Erro ao criar time:', err);
    res.status(500).json({ error: err.message });
  }
});

// Atualizar time
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { nome, color } = req.body;
    const empresaId = req.user.empresaId;

    // ✅ VERIFICAR QUE PERTENCE À EMPRESA
    const time = await queryOne(
      'SELECT empresaId FROM "time" WHERE timeId = @id',
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
      'UPDATE "time" SET nome = @nome, cor = @color WHERE timeId = @id',
      { nome, color, id: req.params.id }
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
      'SELECT empresaId FROM "time" WHERE timeId = @id',
      { id: req.params.id }
    );

    if (!time) {
      return res.status(404).json({ error: 'Time não encontrado' });
    }

    if (time.empresaId !== empresaId) {
      return res.status(403).json({ error: 'Acesso negado: time não pertence a esta empresa' });
    }

    // ✅ DELETAR
    await query('DELETE FROM "time" WHERE timeId = @id', { id: req.params.id });

    console.log(`✅ Time deletado: ${req.params.id}`);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Distribuir aleatoriamente as crianças do evento entre os time do evento.
// mode 'unassigned' (padrão): só quem está sem time. mode 'all': sorteia todos de novo.
router.post(
  '/evento/:eventoId/distribuir-aleatorio',
  verifyToken,
  requireRole(TEAM_MANAGER_ROLES),
  async (req, res) => {
    try {
      const mode = String(req.body?.mode || 'unassigned');
      if (!DISTRIBUTION_MODES.has(mode)) return res.status(400).json({ error: 'Modo de distribuição inválido' });

      const evento = await queryOne(
        'SELECT eventoId, empresaId FROM evento WHERE eventoId = @eventoId',
        { eventoId: req.params.eventoId }
      );
      if (!evento) return res.status(404).json({ error: 'Evento não encontrado' });
      if (!isMaster(req) && evento.empresaId !== req.user.empresaId) {
        return res.status(403).json({ error: 'Acesso negado: evento não pertence a esta empresa' });
      }

      const result = await withTransaction(async (tx) => {
        const teams = await tx.allQuery(
          'SELECT timeId, nome FROM "time" WHERE eventoId = @eventoId AND empresaId = @empresaId ORDER BY nome',
          { eventoId: evento.eventoId, empresaId: evento.empresaId }
        );
        if (teams.length < 2) {
          return { error: 'Crie pelo menos 2 time neste evento antes de distribuir os participantes.' };
        }

        const children = await tx.allQuery(
          'SELECT criancaId, timeId FROM crianca WHERE eventoId = @eventoId AND empresaId = @empresaId',
          { eventoId: evento.eventoId, empresaId: evento.empresaId }
        );
        const assignments = planRandomDistribution({ children, teamIds: teams.map(t => t.timeId), mode });

        for (const { criancaId, timeId } of assignments) {
          await tx.query(
            'UPDATE crianca SET timeId = @timeId WHERE criancaId = @criancaId AND eventoId = @eventoId',
            { timeId, criancaId, eventoId: evento.eventoId }
          );
        }

        // A pontuação do time é a soma das crianças; recalcula para refletir a nova composição.
        for (const team of teams) {
          await tx.query(
            `UPDATE "time"
             SET pontos = (SELECT ISNULL(SUM(pontos), 0) FROM crianca WHERE timeId = @timeId)
             WHERE timeId = @timeId`,
            { timeId: team.timeId }
          );
        }

        const sizes = await tx.allQuery(
          'SELECT timeId, COUNT(*) AS total FROM crianca WHERE eventoId = @eventoId AND timeId IS NOT NULL GROUP BY timeId',
          { eventoId: evento.eventoId }
        );
        const totalByTeam = new Map(sizes.map(row => [row.timeId, Number(row.total)]));
        return {
          mode,
          distributed: assignments.length,
          totalChildren: children.length,
          teams: teams.map(team => ({ id: team.timeId, name: team.nome, members: totalByTeam.get(team.timeId) || 0 })),
        };
      });

      if (result.error) return res.status(400).json({ error: result.error });
      console.log(`🎲 Distribuição aleatória (${mode}): ${result.distributed} criança(s) no evento ${evento.eventoId}`);
      return res.json(result);
    } catch (err) {
      console.error('❌ Erro ao distribuir participantes:', err);
      return res.status(500).json({ error: err.message });
    }
  }
);

module.exports = router;
