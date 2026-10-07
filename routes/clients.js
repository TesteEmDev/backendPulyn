// routes/clients.js - Clientes/Empresas
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { query, queryOne, allQuery } = require('../database');
const { verifyToken, isMaster } = require('../utils/middleware');
const { listPlatformClients, normalizeClientText } = require('../utils/platformClients');
const { PLAN_DEFINITIONS } = require('../utils/planDefinitions');

// O mesmo cliente pode existir em `empresa` e em `cliente` com ids diferentes
// (o cadastro cria os dois). Devolve os ids do registro legado que corresponde
// (nome + cidade) à empresa, para editar/excluir os dois lados juntos.
async function legacyClienteIdsFor(empresaId) {
  const empresa = await queryOne('SELECT nome, cidade FROM empresa WHERE empresaId = @id', { id: empresaId });
  if (!empresa) return [];
  const rows = await allQuery('SELECT clienteId, nome, cidade FROM cliente');
  return rows
    .filter((c) => normalizeClientText(c.nome) === normalizeClientText(empresa.nome) &&
      normalizeClientText(c.cidade) === normalizeClientText(empresa.cidade))
    .map((c) => c.clienteId);
}

// ✅ APENAS MASTER pode listar cliente
router.get('/', verifyToken, async (req, res) => {
  try {
    // ✅ Adicionar validação de master
    if (!isMaster(req)) {
      return res.status(403).json({ error: 'Acesso negado: apenas master pode listar cliente' });
    }

    // Une `empresa` e o cadastro legado `cliente` (ver utils/platformClients.js).
    const cliente = await listPlatformClients();

    const formatted = cliente.map((c) => ({
      id: c.id,
      name: c.name,
      city: c.city,
      state: c.state,
      phone: c.phone,
      plan: c.plan,
      status: c.status,
      email: c.email,
      lastAccess: c.lastAccess
        ? new Date(c.lastAccess).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
        : 'Nunca acessou',
      eventsDone: c.eventsDone,
      createdAt: c.createdAt ? new Date(c.createdAt).toLocaleDateString('pt-BR') : '—',
    }));

    console.log(`✅ Listar cliente: ${formatted.length} empresa encontradas`);
    res.json(formatted);
  } catch (err) {
    console.error('❌ Erro ao listar cliente:', err);
    res.status(500).json({ error: err.message });
  }
});

const toIso = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};
const EVENT_STATUS_GROUPS = {
  active: ['active', 'ongoing'],
  scheduled: ['scheduled'],
  finished: ['finished', 'completed'],
};

// ✅ APENAS MASTER: detalhes completos de um cliente (cadastro, plano e uso, usuários de
// acesso, evento e suporte). Cliente do cadastro legado (`cliente`) não tem empresa, então
// só traz os dados do cadastro.
router.get('/:id/detalhes', verifyToken, async (req, res) => {
  try {
    if (!isMaster(req)) {
      return res.status(403).json({ error: 'Acesso negado: apenas master pode ver detalhes de cliente' });
    }

    const platformClients = await listPlatformClients({ includeFamily: true });
    const cliente = platformClients.find((c) => String(c.id) === String(req.params.id));
    if (!cliente) {
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }

    const planId = String(cliente.plan || 'starter').trim().toLowerCase();
    const planDefinition = PLAN_DEFINITIONS[planId] || null;

    const details = {
      id: cliente.id,
      origin: cliente.origin,
      name: cliente.name,
      cnpj: null,
      city: cliente.city,
      state: cliente.state,
      email: cliente.email,
      phone: cliente.phone,
      plan: planId,
      status: cliente.status,
      createdAt: toIso(cliente.createdAt),
      updatedAt: null,
      lastAccess: toIso(cliente.lastAccess),
      planInfo: planDefinition ? { id: planId, ...planDefinition } : null,
      usage: {
        eventsTotal: 0, eventsActive: 0, eventsScheduled: 0, eventsFinished: 0, eventsThisMonth: 0,
        childrenTotal: 0, maxCheckpointsPerEvent: 0, usersTotal: 0,
      },
      users: [],
      events: [],
      support: { open: 0, total: 0 },
    };

    if (cliente.empresaId) {
      const empresaId = cliente.empresaId;
      const [empresa, users, events, tickets] = await Promise.all([
        queryOne('SELECT cnpj, dataAtualizacao FROM empresa WHERE empresaId = @id', { id: empresaId }),
        allQuery(
          `SELECT loginId, email, perfil, status, ultimoAcesso, dataCriacao
           FROM login WHERE empresaId = @id ORDER BY perfil, email`,
          { id: empresaId }
        ),
        allQuery(
          `SELECT e.eventoId, e.nome, TO_CHAR(e.data, 'YYYY-MM-DD') AS date_str, e.hora, e.duracao, e.status,
                  e.nomeResponsavel, e.iniciadoEm, e.finalizadoEm,
                  (SELECT COUNT(*) FROM crianca c WHERE c.eventoId = e.eventoId) AS children_count,
                  (SELECT COUNT(*) FROM pontoVerificacao k
                    WHERE k.eventoId = e.eventoId
                      AND LOWER(COALESCE(k.proposito, 'game')) <> 'reception') AS totalCheckpoints
           FROM evento e
           WHERE e.empresaId = @id
           ORDER BY e.data DESC, e.hora DESC`,
          { id: empresaId }
        ),
        allQuery(
          'SELECT status, COUNT(*) AS total FROM chamadoSuport WHERE empresaId = @id GROUP BY status',
          { id: empresaId }
        ),
      ]);

      details.cnpj = empresa?.cnpj || null;
      details.updatedAt = toIso(empresa?.dataAtualizacao);

      details.users = users.map((u) => ({
        id: u.loginId,
        email: u.email,
        role: u.perfil,
        status: u.status,
        lastAccess: toIso(u.ultimoAcesso),
        createdAt: toIso(u.dataCriacao),
      }));

      details.events = events.map((e) => ({
        id: e.eventoId,
        name: e.nome,
        date: e.data_str,
        time: e.hora ? String(e.hora).slice(0, 5) : null,
        duration: e.duracao,
        status: String(e.status || '').toLowerCase(),
        responsibleName: e.nomeResponsavel || null,
        startedAt: toIso(e.iniciadoEm),
        endedAt: toIso(e.finalizadoEm),
        childrenCount: Number(e.children_count) || 0,
        checkpointsCount: Number(e.totalCheckpoints) || 0,
      }));

      const countByGroup = (group) => details.events.filter((e) => EVENT_STATUS_GROUPS[group].includes(e.status)).length;
      const now = new Date();
      const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      details.usage = {
        eventsTotal: details.events.length,
        eventsActive: countByGroup('active'),
        eventsScheduled: countByGroup('scheduled'),
        eventsFinished: countByGroup('finished'),
        eventsThisMonth: details.events.filter((e) => String(e.data || '').startsWith(monthPrefix)).length,
        childrenTotal: details.events.reduce((sum, e) => sum + e.childrenCount, 0),
        maxCheckpointsPerEvent: details.events.reduce((max, e) => Math.max(max, e.checkpointsCount), 0),
        usersTotal: details.users.length,
      };

      const ticketTotal = tickets.reduce((sum, t) => sum + (Number(t.total) || 0), 0);
      const ticketsByStatus = Object.fromEntries(tickets.map((t) => [String(t.status), Number(t.total) || 0]));
      details.support = {
        open: Object.entries(ticketsByStatus)
          .filter(([status]) => status !== 'resolvido' && status !== 'fechado')
          .reduce((sum, [, total]) => sum + total, 0),
        total: ticketTotal,
      };
    }

    res.json(details);
  } catch (err) {
    console.error('❌ Erro ao buscar detalhes do cliente:', err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ APENAS MASTER pode criar cliente
router.post('/', verifyToken, async (req, res) => {
  try {
    // ✅ Validação de master
    if (!isMaster(req)) {
      return res.status(403).json({ error: 'Acesso negado: apenas master pode criar cliente' });
    }

    const { nome, cidade, estado, email, senha, telefone, plan } = req.body;
    
    if (!email || !senha) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }

    if (senha.length < 6) {
      return res.status(400).json({ error: 'Senha deve ter pelo menos 6 caracteres' });
    }

    const clienteId = uuidv4();
    const empresaId = uuidv4();
    const loginId = uuidv4();
    
    // Hash simples da senha (em produção, usar bcrypt)
    const hashedPassword = Buffer.from(senha).toString('base64');
    
    try {
      // 1️⃣ Criar EMPRESA
      await query(
        `INSERT INTO empresa (empresaId, nome, cidade, estado, telefone, plano, status) 
         VALUES (@id, @nome, @cidade, @estado, @telefone, @plano, @status)`,
        {
          id: empresaId,
          nome: nome,
          cidade: cidade,
          estado: estado,
          telefone: telefone,
          plano: plan || 'starter',
          status: 'active'
        }
      );
      console.log(`✅ Empresa criada: ${nome} (ID: ${empresaId})`);

      // 2️⃣ Criar LOGIN
      await query(
        `INSERT INTO login (loginId, empresaId, email, senha, status) 
         VALUES (@id, @empresaId, @email, @senha, @status)`,
        {
          id: loginId,
          empresaId: empresaId,
          email: email,
          senha: hashedPassword,
          status: 'active'
        }
      );
      console.log(`✅ Login criado: ${email} (ID: ${loginId})`);

      // 3️⃣ Criar CLIENTE (referência para compatibilidade)
      await query(
        `INSERT INTO cliente (clienteId, nome, cidade, estado, email, telefone, plano, status, empresaId) 
         VALUES (@id, @nome, @cidade, @estado, @email, @telefone, @plano, @status, @empresaId)`,
        {
          id: clienteId,
          empresaId: empresaId,
          nome: nome,
          cidade: cidade,
          estado: estado,
          email: email,
          telefone: telefone,
          plano: plan || 'starter',
          status: 'active'
        }
      );
      console.log(`✅ Cliente criado: ${nome} (ID: ${clienteId})`);

      res.json({
        id: clienteId,
        empresaId: empresaId,
        loginId: loginId,
        nome,
        cidade,
        estado,
        email,
        telefone,
        plan: plan || 'starter',
        status: 'active',
        message: `Cliente ${nome} criado com sucesso! Email: ${email}`
      });

    } catch (error) {
      console.error('❌ Erro ao criar cliente/empresa/login:', error.message);
      throw error;
    }

  } catch (err) {
    console.error('❌ Erro ao criar cliente:', err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ APENAS MASTER pode atualizar cliente
router.put('/:id', verifyToken, async (req, res) => {
  try {
    // ✅ Validação de master
    if (!isMaster(req)) {
      return res.status(403).json({ error: 'Acesso negado: apenas master pode atualizar cliente' });
    }

    const { nome, cidade, estado, email, telefone, plan, status } = req.body;
    
    try {
      // Registro legado em `cliente`: o próprio id (cliente sem empresa) e/ou o
      // espelho da empresa. Resolvido antes do UPDATE, pois casa por nome+cidade antigos.
      const legacyIds = [req.params.id, ...(await legacyClienteIdsFor(req.params.id))];

      // Atualizar EMPRESA
      await query(
        `UPDATE empresa SET nome = @nome, cidade = @cidade, estado = @estado, 
         telefone = @telefone, plano = @plano, status = @status, dataAtualizacao = GETDATE()
         WHERE empresaId = @id`,
        {
          nome: nome,
          cidade: cidade,
          estado: estado,
          telefone: telefone,
          plano: plan,
          status: status,
          id: req.params.id
        }
      );

      // Atualizar EMAIL do LOGIN admin se foi fornecido (sem o filtro de perfil, o
      // e-mail era gravado em todos os logins da empresa: recepção, telão, famílias...)
      if (email) {
        await query(
          `UPDATE login SET email = @email, dataAtualizacao = GETDATE()
           WHERE empresaId = @empresaId AND perfil = 'admin'`,
          {
            email: email,
            empresaId: req.params.id
          }
        );
      }

      for (const legacyId of legacyIds) {
        await query(
          `UPDATE cliente SET nome = COALESCE(@nome, nome), cidade = COALESCE(@cidade, cidade),
           estado = COALESCE(@estado, estado), email = COALESCE(@email, email),
           telefone = COALESCE(@telefone, telefone), plano = COALESCE(@plano, plano), status = COALESCE(@status, status)
           WHERE clienteId = @id`,
          {
            nome: nome ?? null, cidade: cidade ?? null, estado: estado ?? null, email: email || null,
            telefone: telefone ?? null, plano: plan ?? null, status: status ?? null, id: legacyId,
          }
        );
      }

      console.log(`✅ Cliente atualizado: ${req.params.id}`);
      res.json({ updated: true, message: 'Cliente atualizado com sucesso!' });
    } catch (error) {
      console.error('❌ Erro ao atualizar:', error.message);
      throw error;
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ APENAS MASTER pode atualizar status do cliente
router.put('/:id/status', verifyToken, async (req, res) => {
  try {
    // ✅ Validação de master
    if (!isMaster(req)) {
      return res.status(403).json({ error: 'Acesso negado: apenas master pode atualizar status de cliente' });
    }

    const { status } = req.body;

    const legacyIds = [req.params.id, ...(await legacyClienteIdsFor(req.params.id))];
    for (const legacyId of legacyIds) {
      await query('UPDATE cliente SET status = @status WHERE clienteId = @id', { status, id: legacyId });
    }

    // Atualizar status na EMPRESA
    await query(
      'UPDATE empresa SET status = @status, dataAtualizacao = GETDATE() WHERE empresaId = @id',
      { status, id: req.params.id }
    );

    // Atualizar status no LOGIN também
    await query(
      'UPDATE login SET status = @status, dataAtualizacao = GETDATE() WHERE empresaId = @id',
      { status, id: req.params.id }
    );

    console.log(`✅ Status do cliente atualizado: ${req.params.id} → ${status}`);
    res.json({ updated: true, message: `Status alterado para ${status}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ APENAS MASTER pode deletar cliente
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    // ✅ Validação de master
    if (!isMaster(req)) {
      return res.status(403).json({ error: 'Acesso negado: apenas master pode deletar cliente' });
    }

    try {
      // O registro legado tem outro id que o da empresa; sem apagá-lo aqui o
      // cliente reapareceria na lista logo depois de excluído.
      const legacyIds = [req.params.id, ...(await legacyClienteIdsFor(req.params.id))];

      // 1. Deletar LOGIN
      await query(
        'DELETE FROM login WHERE empresaId = @id',
        { id: req.params.id }
      );
      console.log(`✅ Login deletado`);

      // 2. Deletar EMPRESA
      await query(
        'DELETE FROM empresa WHERE empresaId = @id',
        { id: req.params.id }
      );
      console.log(`✅ Empresa deletada`);

      // 3. Deletar CLIENTE (compatibilidade)
      for (const legacyId of legacyIds) {
        await query('DELETE FROM cliente WHERE clienteId = @id', { id: legacyId });
      }
      console.log(`✅ Cliente deletado`);

      res.json({ deleted: true, message: 'Cliente removido com sucesso!' });
    } catch (error) {
      console.error('❌ Erro ao deletar:', error.message);
      throw error;
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
