// routes/clients.js - Clientes/Empresas
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { query, queryOne, allQuery } = require('../database');
const { verifyToken, isMaster } = require('../utils/middleware');

// ✅ APENAS MASTER pode listar clientes
router.get('/', verifyToken, async (req, res) => {
  try {
    // ✅ Adicionar validação de master
    if (!isMaster(req)) {
      return res.status(403).json({ error: 'Acesso negado: apenas master pode listar clientes' });
    }

    // Uma empresa pode ter vários logins (admin, recepção, game master,
    // display, kiosk...). O JOIN direto com logins multiplicava cada
    // empresa por cada login que ela tem — 5 empresas com 3 logins cada
    // apareciam como 15 "clientes". Agrupado por empresa agora, com o
    // e-mail do login 'admin' como representante (ou qualquer outro, se
    // não houver admin).
    const clientes = await allQuery(`
      SELECT
        e.id,
        e.nome as name,
        e.cidade as city,
        e.estado as state,
        e.telefone as phone,
        e.plano as [plan],
        e.status,
        COALESCE(MIN(CASE WHEN l.role = 'admin' THEN l.email END), MIN(l.email)) as email,
        MAX(l.ultimo_acesso) as lastAccess,
        (
          SELECT COUNT(*) FROM eventos ev
          WHERE ev.empresa_id = e.id
            AND LOWER(COALESCE(ev.status, '')) IN ('finished', 'completed')
        ) as eventsDone,
        e.data_criacao as createdAt
      FROM empresas e
      LEFT JOIN logins l ON e.id = l.empresa_id
      WHERE e.nome != 'Master Admin'
      GROUP BY e.id, e.nome, e.cidade, e.estado, e.telefone, e.plano, e.status, e.data_criacao
      ORDER BY e.data_criacao DESC
    `);

    const formatted = clientes.map((c) => ({
      ...c,
      lastAccess: c.lastaccess
        ? new Date(c.lastaccess).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
        : 'Nunca acessou',
      eventsDone: Number(c.eventsdone ?? c.eventsDone ?? 0),
      createdAt: c.createdat ? new Date(c.createdat).toLocaleDateString('pt-BR') : '—',
    }));

    console.log(`✅ Listar clientes: ${formatted.length} empresas encontradas`);
    res.json(formatted);
  } catch (err) {
    console.error('❌ Erro ao listar clientes:', err);
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
        `INSERT INTO clientes (id, name, city, state, email, phone, plano, status) 
         VALUES (@id, @name, @city, @state, @email, @phone, @plano, @status)`,
        {
          id: clienteId,
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

      // Atualizar EMAIL no LOGIN se foi fornecido
      if (email) {
        await query(
          `UPDATE logins SET email = @email, data_atualizacao = GETDATE()
           WHERE empresa_id = @empresa_id`,
          {
            email: email,
            empresa_id: req.params.id
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
      await query(
        'DELETE FROM clientes WHERE id = @id',
        { id: req.params.id }
      );
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
