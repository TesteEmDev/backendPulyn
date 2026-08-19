// routes/logins.js - Gerenciamento de Usuários
const express = require('express');
const router = express.Router();
const { query, queryOne, allQuery } = require('../database');
const { verifyToken, requireRole, isMaster } = require('../utils/middleware');

router.use(verifyToken, (req, res, next) => {
  if (req.user?.role === 'family') return res.status(403).json({ error: 'Famílias devem usar os endpoints de vínculo familiar' });
  next();
});

// ==================== LISTAR USUÁRIOS DA EMPRESA ====================

// GET /api/logins/empresa/:empresa_id
router.get('/empresa/:empresa_id', requireRole('admin', 'master'), async (req, res) => {
  try {
    const { empresa_id } = req.params;
    const user_empresa_id = req.user.empresa_id;

    // Verificar permissão
    if (!isMaster(req) && empresa_id !== user_empresa_id) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const users = await allQuery(`
      SELECT id, email, role, status, data_criacao as created_at
      FROM logins
      WHERE empresa_id = @empresa_id
      ORDER BY data_criacao DESC
    `, { empresa_id });

    res.json(users);
  } catch (err) {
    console.error('❌ Erro ao buscar usuários:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==================== CRIAR NOVO USUÁRIO ====================

// POST /api/logins
router.post('/', requireRole('admin', 'master'), async (req, res) => {
  try {
    const { email, password, role } = req.body;
    const empresa_id = req.user.empresa_id;
    const user_role = req.user.role;

    // Validações
    if (!email || !password || !role) {
      return res.status(400).json({ error: 'Email, senha e role são obrigatórios' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Senha deve ter no mínimo 6 caracteres' });
    }

    // Verificar permissão: apenas admin ou master podem criar usuários
    if (user_role !== 'admin' && user_role !== 'master') {
      return res.status(403).json({ error: 'Acesso negado: apenas admin pode criar usuários' });
    }

    // Verificar se email já existe
    const existing = await queryOne(
      'SELECT id FROM logins WHERE email = @email',
      { email }
    );

    if (existing) {
      return res.status(400).json({ error: 'Email já cadastrado' });
    }

    // Validar role
    const validRoles = ['admin', 'reception', 'game_master', 'display', 'family', 'kiosk', 'score_kiosk'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Role inválido' });
    }

    // Hash da senha (base64 - em produção usar bcrypt)
    const hashedPassword = Buffer.from(password).toString('base64');

    // Criar usuário com empresa_id do token
    const id = require('crypto').randomUUID();
    await query(
      `INSERT INTO logins (id, email, password, role, empresa_id, status, data_criacao)
       VALUES (@id, @email, @password, @role, @empresa_id, @status, GETDATE())`,
      {
        id,
        email,
        password: hashedPassword,
        role,
        empresa_id,
        status: 'active'
      }
    );

    console.log(`✅ Usuário criado: ${email} (${role}) para empresa ${empresa_id}`);

    res.json({
      id,
      email,
      role,
      status: 'active',
      created_at: new Date().toISOString()
    });

  } catch (err) {
    console.error('❌ Erro ao criar usuário:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==================== DELETAR USUÁRIO ====================

// DELETE /api/logins/:id
router.delete('/:id', requireRole('admin', 'master'), async (req, res) => {
  try {
    const { id } = req.params;
    const user_empresa_id = req.user.empresa_id;

    // Buscar usuário
    const user = await queryOne(
      'SELECT empresa_id, role, status FROM logins WHERE id = @id',
      { id }
    );

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    // Verificar permissão
    if (!isMaster(req) && user.empresa_id !== user_empresa_id) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    // Não deixar deletar o último admin
    if (user.role === 'admin') {
      const adminCount = await queryOne(`
        SELECT COUNT(*) as count FROM logins
        WHERE empresa_id = @empresa_id AND role = 'admin' AND status = 'active'
      `, { empresa_id: user.empresa_id });

      if (adminCount.count <= 1) {
        return res.status(400).json({ error: 'Não é possível deletar o único admin' });
      }
    }

    // Deletar usuário (soft delete)
    await query(
      `UPDATE logins 
       SET status = @status, data_atualizacao = GETDATE() 
       WHERE id = @id 
       AND empresa_id = @empresa_id`,
      { id, status: 'inactive', empresa_id: user.empresa_id }
    );

    console.log(`✅ Usuário deletado: ${id}`);

    res.json({ success: true });

  } catch (err) {
    console.error('❌ Erro ao deletar usuário:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
