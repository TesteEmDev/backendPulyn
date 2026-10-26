// routes/logins.js - Gerenciamento de Usuários
const express = require('express');
const router = express.Router();
const { query, queryOne, allQuery } = require('../database');
const { verifyToken, requireRole, isMaster } = require('../utils/middleware');
const { checkUnitEmail } = require('../utils/unitEmail');
const { loadUnitProfile } = require('../utils/unitProfileStore');
const database = require('../database');
const { papeisDaConta, perfisExtrasParaSalvar, PAPEIS_ACUMULAVEIS } = require('../utils/papeis');

router.use(verifyToken, (req, res, next) => {
  if (req.user?.role === 'family') return res.status(403).json({ error: 'Famílias devem usar os endpoints de vínculo familiar' });
  next();
});

// ==================== LISTAR USUÁRIOS DA EMPRESA ====================

// GET /api/logins/empresa/:empresaId
router.get('/empresa/:empresaId', requireRole('admin', 'master'), async (req, res) => {
  try {
    const { empresaId } = req.params;
    const user_empresa_id = req.user.empresaId;

    // Verificar permissão
    if (!isMaster(req) && empresaId !== user_empresa_id) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const users = await allQuery(`
      SELECT loginId, email, perfil, perfisExtras, status, dataCriacao as criadoEm
      FROM login
      WHERE empresaId = @empresaId
      ORDER BY dataCriacao DESC
    `, { empresaId });

    res.json(users.map((u) => ({ ...u, papeis: papeisDaConta(u) })));
  } catch (err) {
    console.error('❌ Erro ao buscar usuários:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==================== CRIAR NOVO USUÁRIO ====================

// POST /api/logins
router.post('/', requireRole('admin', 'master'), async (req, res) => {
  try {
    const { senha, role, papeis } = req.body;
    let email = typeof req.body.email === 'string' ? req.body.email.trim() : req.body.email;
    const empresaId = req.user.empresaId;
    const user_role = req.user.role;

    // Validações
    if (!email || !senha || !role) {
      return res.status(400).json({ error: 'Email, senha e role são obrigatórios' });
    }

    if (senha.length < 6) {
      return res.status(400).json({ error: 'Senha deve ter no mínimo 6 caracteres' });
    }

    // Verificar permissão: apenas admin ou master podem criar usuários
    if (user_role !== 'admin' && user_role !== 'master') {
      return res.status(403).json({ error: 'Acesso negado: apenas admin pode criar usuários' });
    }

    // O e-mail dos usuários de um buffet segue o nome da unidade: usuario@nomedaunidade.com.
    // (O master cria usuários da própria conta e não segue essa regra.)
    if (!isMaster(req)) {
      const profile = await loadUnitProfile(database, empresaId);
      const checked = checkUnitEmail(email, profile?.name);
      if (checked.error) return res.status(400).json({ error: checked.error });
      email = checked.email;
    }

    // Verificar se email já existe (o login ignora maiúsculas/minúsculas)
    const existing = await queryOne(
      'SELECT loginId FROM login WHERE LOWER(email) = LOWER(@email)',
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
    const hashedPassword = Buffer.from(senha).toString('base64');

    // Criar usuário com empresaId do token
    const id = require('crypto').randomUUID();
    await query(
      `INSERT INTO login (loginId, email, senha, perfil, perfisExtras, empresaId, status, dataCriacao)
       VALUES (@id, @email, @senha, @perfil, @perfisExtras, @empresaId, @status, GETDATE())`,
      {
        id,
        email,
        senha: hashedPassword,
        perfil: role,
        perfisExtras: perfisExtrasParaSalvar(role, papeis),
        empresaId,
        status: 'active'
      }
    );

    console.log(`✅ Usuário criado: ${email} (${role}) para empresa ${empresaId}`);

    res.json({
      id,
      email,
      role,
      status: 'active',
      criadoEm: new Date().toISOString()
    });

  } catch (err) {
    console.error('❌ Erro ao criar usuário:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==================== PAPÉIS DE UMA CONTA ====================

// PUT /api/logins/:id/papeis  { papeis: ["reception", "game_master"] }
// Define as áreas extras da conta (além do perfil principal). Só para contas da equipe.
router.put('/:id/papeis', requireRole('admin', 'master'), async (req, res) => {
  try {
    const { id } = req.params;
    const { papeis } = req.body || {};

    if (!Array.isArray(papeis)) {
      return res.status(400).json({ error: 'Informe a lista de papéis em "papeis"' });
    }
    const invalidos = papeis.filter((p) => !PAPEIS_ACUMULAVEIS.has(p));
    if (invalidos.length > 0) {
      return res.status(400).json({ error: `Papel não pode ser acumulado: ${invalidos.join(', ')}` });
    }

    const user = await queryOne(
      'SELECT loginId, empresaId, perfil FROM login WHERE loginId = @id',
      { id }
    );
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    if (!isMaster(req) && String(user.empresaId) !== String(req.user.empresaId)) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    if (!PAPEIS_ACUMULAVEIS.has(user.perfil)) {
      return res.status(400).json({ error: 'Esta conta não pode acumular papéis' });
    }

    const perfisExtras = perfisExtrasParaSalvar(user.perfil, papeis);
    await query(
      'UPDATE login SET perfisExtras = @perfisExtras, dataAtualizacao = GETDATE() WHERE loginId = @id',
      { id, perfisExtras }
    );

    res.json({ success: true, papeis: papeisDaConta({ perfil: user.perfil, perfisExtras }) });
  } catch (err) {
    console.error('❌ Erro ao definir papéis:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==================== DELETAR USUÁRIO ====================

// DELETE /api/logins/:id
router.delete('/:id', requireRole('admin', 'master'), async (req, res) => {
  try {
    const { id } = req.params;
    const user_empresa_id = req.user.empresaId;

    // Buscar usuário
    const user = await queryOne(
      'SELECT empresaId, perfil, status FROM login WHERE loginId = @id',
      { id }
    );

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    // Verificar permissão
    if (!isMaster(req) && user.empresaId !== user_empresa_id) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    // Não deixar deletar o último admin
    if (user.perfil === 'admin') {
      const adminCount = await queryOne(`
        SELECT COUNT(*) as count FROM login
        WHERE empresaId = @empresaId AND perfil = 'admin' AND status = 'active'
      `, { empresaId: user.empresaId });

      if (adminCount.count <= 1) {
        return res.status(400).json({ error: 'Não é possível deletar o único admin' });
      }
    }

    // Deletar usuário (soft delete)
    await query(
      `UPDATE login 
       SET status = @status, dataAtualizacao = GETDATE() 
       WHERE loginId = @id 
       AND empresaId = @empresaId`,
      { id, status: 'inactive', empresaId: user.empresaId }
    );

    console.log(`✅ Usuário deletado: ${id}`);

    res.json({ success: true });

  } catch (err) {
    console.error('❌ Erro ao deletar usuário:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
