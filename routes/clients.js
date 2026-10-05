// routes/clients.js - Clientes/Empresas
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { query, queryOne, allQuery } = require('../database');
const { verifyToken, isMaster } = require('../utils/middleware');
const { listPlatformClients, normalizeClientText } = require('../utils/platformClients');
const { PLAN_DEFINITIONS } = require('../utils/planDefinitions');

// O mesmo cliente pode existir em `empresas` e em `clientes` com ids diferentes
// (o cadastro cria os dois). Devolve os ids do registro legado que corresponde
// (nome + cidade) à empresa, para editar/excluir os dois lados juntos.
async function legacyClienteIdsFor(empresaId) {
  const empresa = await queryOne('SELECT nome, cidade FROM empresas WHERE id = @id', { id: empresaId });
  if (!empresa) return [];
  const rows = await allQuery('SELECT id, name, city FROM clientes');
  return rows
    .filter((c) => normalizeClientText(c.name) === normalizeClientText(empresa.nome) &&
      normalizeClientText(c.city) === normalizeClientText(empresa.cidade))
    .map((c) => c.id);
}

// ✅ APENAS MASTER pode listar clientes
router.get('/', verifyToken, async (req, res) => {
  try {
    // ✅ Adicionar validação de master
    if (!isMaster(req)) {
      return res.status(403).json({ error: 'Acesso negado: apenas master pode listar clientes' });
    }

    // Une `empresas` e o cadastro legado `clientes` (ver utils/platformClients.js).
    const clientes = await listPlatformClients();

    const formatted = clientes.map((c) => ({
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

    console.log(`✅ Listar clientes: ${formatted.length} empresas encontradas`);
    res.json(formatted);
  } catch (err) {
    console.error('❌ Erro ao listar clientes:', err);
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
// acesso, eventos e suporte). Cliente do cadastro legado (`clientes`) não tem empresa, então
// só traz os dados do cadastro.
router.get('/:id/detalhes', verifyToken, async (req, res) => {
  try {
    if (!isMaster(req)) {
      return res.status(403).json({ error: 'Acesso negado: apenas master pode ver detalhes de clientes' });
    }

    const platformClients = await listPlatformClients({ includeFamily: true });
    const client = platformClients.find((c) => String(c.id) === String(req.params.id));
    if (!client) {
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }

    const planId = String(client.plan || 'starter').trim().toLowerCase();
    const planDefinition = PLAN_DEFINITIONS[planId] || null;

    const details = {
      id: client.id,
      origin: client.origin,
      name: client.name,
      cnpj: null,
      city: client.city,
      state: client.state,
      email: client.email,
      phone: client.phone,
      plan: planId,
      status: client.status,
      createdAt: toIso(client.createdAt),
      updatedAt: null,
      lastAccess: toIso(client.lastAccess),
      planInfo: planDefinition ? { id: planId, ...planDefinition } : null,
      usage: {
        eventsTotal: 0, eventsActive: 0, eventsScheduled: 0, eventsFinished: 0, eventsThisMonth: 0,
        childrenTotal: 0, maxCheckpointsPerEvent: 0, usersTotal: 0,
      },
      users: [],
      events: [],
      support: { open: 0, total: 0 },
    };

    if (client.empresaId) {
      const empresaId = client.empresaId;
      const [empresa, users, events, tickets] = await Promise.all([
        queryOne('SELECT cnpj, data_atualizacao FROM empresas WHERE id = @id', { id: empresaId }),
        allQuery(
          `SELECT id, email, role, status, ultimo_acesso, data_criacao
           FROM logins WHERE empresa_id = @id ORDER BY role, email`,
          { id: empresaId }
        ),
        allQuery(
          `SELECT e.id, e.name, TO_CHAR(e.date, 'YYYY-MM-DD') AS date_str, e.time, e.duration, e.status,
                  e.responsible_name, e.started_at, e.ended_at,
                  (SELECT COUNT(*) FROM criancas c WHERE c.evento_id = e.id) AS children_count,
                  (SELECT COUNT(*) FROM checkpoints k
                    WHERE k.evento_id = e.id
                      AND LOWER(COALESCE(k.checkpoint_purpose, 'game')) <> 'reception') AS checkpoints_count
           FROM eventos e
           WHERE e.empresa_id = @id
           ORDER BY e.date DESC, e.time DESC`,
          { id: empresaId }
        ),
        allQuery(
          'SELECT status, COUNT(*) AS total FROM support_tickets WHERE empresa_id = @id GROUP BY status',
          { id: empresaId }
        ),
      ]);

      details.cnpj = empresa?.cnpj || null;
      details.updatedAt = toIso(empresa?.data_atualizacao);

      details.users = users.map((u) => ({
        id: u.id,
        email: u.email,
        role: u.role,
        status: u.status,
        lastAccess: toIso(u.ultimo_acesso),
        createdAt: toIso(u.data_criacao),
      }));

      details.events = events.map((e) => ({
        id: e.id,
        name: e.name,
        date: e.date_str,
        time: e.time ? String(e.time).slice(0, 5) : null,
        duration: e.duration,
        status: String(e.status || '').toLowerCase(),
        responsibleName: e.responsible_name || null,
        startedAt: toIso(e.started_at),
        endedAt: toIso(e.ended_at),
        childrenCount: Number(e.children_count) || 0,
        checkpointsCount: Number(e.checkpoints_count) || 0,
      }));

      const countByGroup = (group) => details.events.filter((e) => EVENT_STATUS_GROUPS[group].includes(e.status)).length;
      const now = new Date();
      const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      details.usage = {
        eventsTotal: details.events.length,
        eventsActive: countByGroup('active'),
        eventsScheduled: countByGroup('scheduled'),
        eventsFinished: countByGroup('finished'),
        eventsThisMonth: details.events.filter((e) => String(e.date || '').startsWith(monthPrefix)).length,
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
      return res.status(403).json({ error: 'Acesso negado: apenas master pode criar clientes' });
    }

    const { name, city, state, email, password, phone, plan } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Senha deve ter pelo menos 6 caracteres' });
    }

    const clienteId = uuidv4();
    const empresaId = uuidv4();
    const loginId = uuidv4();
    
    // Hash simples da senha (em produção, usar bcrypt)
    const hashedPassword = Buffer.from(password).toString('base64');
    
    try {
      // 1️⃣ Criar EMPRESA
      await query(
        `INSERT INTO empresas (id, nome, cidade, estado, telefone, plano, status) 
         VALUES (@id, @nome, @cidade, @estado, @telefone, @plano, @status)`,
        {
          id: empresaId,
          nome: name,
          cidade: city,
          estado: state,
          telefone: phone,
          plano: plan || 'starter',
          status: 'active'
        }
      );
      console.log(`✅ Empresa criada: ${name} (ID: ${empresaId})`);

      // 2️⃣ Criar LOGIN
      await query(
        `INSERT INTO logins (id, empresa_id, email, password, status) 
         VALUES (@id, @empresa_id, @email, @password, @status)`,
        {
          id: loginId,
          empresa_id: empresaId,
          email: email,
          password: hashedPassword,
          status: 'active'
        }
      );
      console.log(`✅ Login criado: ${email} (ID: ${loginId})`);

      // 3️⃣ Criar CLIENTE (referência para compatibilidade)
      await query(
        `INSERT INTO clientes (id, name, city, state, email, phone, plano, status, empresa_id) 
         VALUES (@id, @name, @city, @state, @email, @phone, @plano, @status, @empresa_id)`,
        {
          id: clienteId,
          empresa_id: empresaId,
          name: name,
          city: city,
          state: state,
          email: email,
          phone: phone,
          plano: plan || 'starter',
          status: 'active'
        }
      );
      console.log(`✅ Cliente criado: ${name} (ID: ${clienteId})`);

      res.json({
        id: clienteId,
        empresa_id: empresaId,
        login_id: loginId,
        name,
        city,
        state,
        email,
        phone,
        plan: plan || 'starter',
        status: 'active',
        message: `Cliente ${name} criado com sucesso! Email: ${email}`
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
      return res.status(403).json({ error: 'Acesso negado: apenas master pode atualizar clientes' });
    }

    const { name, city, state, email, phone, plan, status } = req.body;
    
    try {
      // Registro legado em `clientes`: o próprio id (cliente sem empresa) e/ou o
      // espelho da empresa. Resolvido antes do UPDATE, pois casa por nome+cidade antigos.
      const legacyIds = [req.params.id, ...(await legacyClienteIdsFor(req.params.id))];

      // Atualizar EMPRESA
      await query(
        `UPDATE empresas SET nome = @nome, cidade = @cidade, estado = @estado, 
         telefone = @telefone, plano = @plano, status = @status, data_atualizacao = GETDATE()
         WHERE id = @id`,
        {
          nome: name,
          cidade: city,
          estado: state,
          telefone: phone,
          plano: plan,
          status: status,
          id: req.params.id
        }
      );

      // Atualizar EMAIL do LOGIN admin se foi fornecido (sem o filtro de role, o
      // e-mail era gravado em todos os logins da empresa: recepção, telão, famílias...)
      if (email) {
        await query(
          `UPDATE logins SET email = @email, data_atualizacao = GETDATE()
           WHERE empresa_id = @empresa_id AND role = 'admin'`,
          {
            email: email,
            empresa_id: req.params.id
          }
        );
      }

      for (const legacyId of legacyIds) {
        await query(
          `UPDATE clientes SET name = COALESCE(@name, name), city = COALESCE(@city, city),
           state = COALESCE(@state, state), email = COALESCE(@email, email),
           phone = COALESCE(@phone, phone), plano = COALESCE(@plano, plano), status = COALESCE(@status, status)
           WHERE id = @id`,
          {
            name: name ?? null, city: city ?? null, state: state ?? null, email: email || null,
            phone: phone ?? null, plano: plan ?? null, status: status ?? null, id: legacyId,
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
      return res.status(403).json({ error: 'Acesso negado: apenas master pode atualizar status de clientes' });
    }

    const { status } = req.body;

    const legacyIds = [req.params.id, ...(await legacyClienteIdsFor(req.params.id))];
    for (const legacyId of legacyIds) {
      await query('UPDATE clientes SET status = @status WHERE id = @id', { status, id: legacyId });
    }

    // Atualizar status na EMPRESA
    await query(
      'UPDATE empresas SET status = @status, data_atualizacao = GETDATE() WHERE id = @id',
      { status, id: req.params.id }
    );

    // Atualizar status no LOGIN também
    await query(
      'UPDATE logins SET status = @status, data_atualizacao = GETDATE() WHERE empresa_id = @id',
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
      return res.status(403).json({ error: 'Acesso negado: apenas master pode deletar clientes' });
    }

    try {
      // O registro legado tem outro id que o da empresa; sem apagá-lo aqui o
      // cliente reapareceria na lista logo depois de excluído.
      const legacyIds = [req.params.id, ...(await legacyClienteIdsFor(req.params.id))];

      // 1. Deletar LOGIN
      await query(
        'DELETE FROM logins WHERE empresa_id = @id',
        { id: req.params.id }
      );
      console.log(`✅ Login deletado`);

      // 2. Deletar EMPRESA
      await query(
        'DELETE FROM empresas WHERE id = @id',
        { id: req.params.id }
      );
      console.log(`✅ Empresa deletada`);

      // 3. Deletar CLIENTE (compatibilidade)
      for (const legacyId of legacyIds) {
        await query('DELETE FROM clientes WHERE id = @id', { id: legacyId });
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
