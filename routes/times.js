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
    const empresa_id = req.user.empresa_id;
    const role = req.user.role;

    let times;
    if (isMaster(req)) {
      // Master vê todos os times (exceto os da Master Admin)
      times = await allQuery(`
        SELECT t.*, (SELECT COUNT(*) FROM crianca c WHERE c.timeId = t.timeId) AS members_count
        FROM time t
        LEFT JOIN empresa e ON t.empresaId = e.empresaId
        WHERE e.nome != 'Master Admin'
        ORDER BY t.nome
      `);
      console.log(`✅ ${times.length} times (master - TODAS as empresas, exceto Master Admin)`);
    } else {
      times = await allQuery(
        `SELECT t.*, (SELECT COUNT(*) FROM crianca c WHERE c.timeId = t.timeId) AS members_count
         FROM time t WHERE t.empresaId = @empresa_id ORDER BY t.nome`,
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

// Times padrão: modelos da empresa, guardados como times sem evento.
router.get('/padrao', verifyToken, requireRole(TEAM_MANAGER_ROLES), async (req, res) => {
  try {
    const templates = await allQuery(
      'SELECT timeId, nome, cor, criadoEm FROM time WHERE eventoId IS NULL AND empresaId = @empresaId ORDER BY criadoEm, nome',
      { empresaId: req.user.empresa_id }
    );
    res.json(templates);
  } catch (err) {
    console.error('❌ Erro ao listar times padrão:', err);
    res.status(500).json({ error: err.message });
  }
});

// Copia os times padrão para o evento (sem duplicar os que já existem pelo nome).
router.post('/eventos/:evento_id/aplicar-padrao', verifyToken, requireRole(TEAM_MANAGER_ROLES), async (req, res) => {
  try {
    const evento = await queryOne(
      'SELECT eventoId, empresaId FROM evento WHERE eventoId = @evento_id',
      { evento_id: req.params.evento_id }
    );
    if (!evento) return res.status(404).json({ error: 'Evento não encontrado' });
    if (!isMaster(req) && evento.empresa_id !== req.user.empresa_id) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence a esta empresa' });
    }

    const result = await withTransaction(async (tx) => {
      const templates = await tx.allQuery(
        'SELECT nome, cor FROM time WHERE eventoId IS NULL AND empresaId = @empresaId ORDER BY criadoEm, nome',
        { empresaId: evento.empresa_id }
      );
      if (templates.length === 0) return { error: 'Cadastre os times padrão antes de aplicá-los a um evento.' };

      const existing = await tx.allQuery(
        'SELECT nome FROM time WHERE eventoId = @eventoId AND empresaId = @empresaId',
        { eventoId: evento.id, empresaId: evento.empresa_id }
      );
      const toCreate = planDefaultTeams({ templates, existingTeams: existing });
      for (const team of toCreate) {
        await tx.query(
          // Todo time adicionado a um evento começa com 0 ponto, mesmo que o modelo tenha outro valor.
          `INSERT INTO time (timeId, eventoId, empresaId, nome, cor, pontos)
           VALUES (@id, @eventoId, @empresaId, @name, @color, 0)`,
          { id: uuidv4(), eventoId: evento.id, empresaId: evento.empresa_id, name: team.name, color: team.color }
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
router.get('/eventos/:evento_id/times', verifyToken, async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const evento = await queryOne('SELECT eventoId, empresaId FROM evento WHERE eventoId = @evento_id', { evento_id: req.params.evento_id });
    if (!evento) return res.status(404).json({ error: 'Evento não encontrado' });
    if (!isMaster(req) && evento.empresa_id !== empresa_id) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence a esta empresa' });
    }

    const times = await allQuery(
      `SELECT * FROM time 
       WHERE eventoId = @evento_id AND (empresaId = @empresa_id OR @isMaster = 1)
       ORDER BY pontos DESC`,
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
      ? await queryOne('SELECT eventoId, empresaId FROM evento WHERE eventoId = @evento_id', { evento_id })
      : null;
    if (evento_id && !evento) return res.status(404).json({ error: 'Evento não encontrado' });
    if (evento && !isMaster(req) && evento.empresa_id !== empresa_id) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence a esta empresa' });
    }
    const targetEmpresaId = evento?.empresa_id || empresa_id;
    const empresa = await queryOne('SELECT empresaId FROM empresa WHERE empresaId = @id', { id: targetEmpresaId });
    if (!empresa) return res.status(403).json({ error: 'Empresa não encontrada' });

    // ✅ CRIAR
    const id = uuidv4();

    await query(
      // A pontuação nunca vem do cliente: todo time novo começa com 0 ponto.
      `INSERT INTO time (timeId, eventoId, empresaId, nome, cor, pontos) 
       VALUES (@id, @evento_id, @empresa_id, @name, @color, 0)`,
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
      'SELECT empresaId FROM time WHERE timeId = @id',
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
      'UPDATE time SET nome = @name, cor = @color WHERE timeId = @id',
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
      'SELECT empresaId FROM time WHERE timeId = @id',
      { id: req.params.id }
    );

    if (!time) {
      return res.status(404).json({ error: 'Time não encontrado' });
    }

    if (time.empresa_id !== empresa_id) {
      return res.status(403).json({ error: 'Acesso negado: time não pertence a esta empresa' });
    }

    // ✅ DELETAR
    await query('DELETE FROM time WHERE timeId = @id', { id: req.params.id });

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
  requireRole(TEAM_MANAGER_ROLES),
  async (req, res) => {
    try {
      const mode = String(req.body?.mode || 'unassigned');
      if (!DISTRIBUTION_MODES.has(mode)) return res.status(400).json({ error: 'Modo de distribuição inválido' });

      const evento = await queryOne(
        'SELECT eventoId, empresaId FROM evento WHERE eventoId = @evento_id',
        { evento_id: req.params.evento_id }
      );
      if (!evento) return res.status(404).json({ error: 'Evento não encontrado' });
      if (!isMaster(req) && evento.empresa_id !== req.user.empresa_id) {
        return res.status(403).json({ error: 'Acesso negado: evento não pertence a esta empresa' });
      }

      const result = await withTransaction(async (tx) => {
        const teams = await tx.allQuery(
          'SELECT timeId, nome FROM time WHERE eventoId = @eventoId AND empresaId = @empresaId ORDER BY nome',
          { eventoId: evento.id, empresaId: evento.empresa_id }
        );
        if (teams.length < 2) {
          return { error: 'Crie pelo menos 2 times neste evento antes de distribuir os participantes.' };
        }

        const children = await tx.allQuery(
          'SELECT criancaId, timeId FROM crianca WHERE eventoId = @eventoId AND empresaId = @empresaId',
          { eventoId: evento.id, empresaId: evento.empresa_id }
        );
        const assignments = planRandomDistribution({ children, teamIds: teams.map(t => t.id), mode });

        for (const { criancaId, timeId } of assignments) {
          await tx.query(
            'UPDATE crianca SET timeId = @timeId WHERE criancaId = @criancaId AND eventoId = @eventoId',
            { timeId, criancaId, eventoId: evento.id }
          );
        }

        // A pontuação do time é a soma das crianças; recalcula para refletir a nova composição.
        for (const team of teams) {
          await tx.query(
            `UPDATE time
             SET pontos = (SELECT ISNULL(SUM(pontos), 0) FROM crianca WHERE timeId = @timeId)
             WHERE timeId = @timeId`,
            { timeId: team.id }
          );
        }

        const sizes = await tx.allQuery(
          'SELECT timeId, COUNT(*) AS total FROM crianca WHERE eventoId = @eventoId AND timeId IS NOT NULL GROUP BY timeId',
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
