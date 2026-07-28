// routes/auth.js - Autenticação
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { query, queryOne } = require('../database');

const JWT_SECRET = process.env.JWT_SECRET || 'sua-chave-secreta-super-segura-2026';

// Login: validar email + senha contra tabela logins
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      console.log('❌ Email ou senha não fornecidos');
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }

    console.log('🔍 Buscando usuário:', email);
    const login = await queryOne(
      `SELECT l.id, l.email, l.password, l.status, l.role, l.family_name,
              e.id as empresa_id, e.nome as empresa_nome, e.[plano]
       FROM logins l
       JOIN empresas e ON l.empresa_id = e.id
       WHERE LOWER(l.email) = LOWER(@email)`,
      { email: String(email).trim() }
    );

    if (!login) {
      return res.status(401).json({ error: 'Email ou senha incorretos' });
    }

    // Comparar senha (base64)
    const hashedPassword = Buffer.from(password).toString('base64');
    if (login.password !== hashedPassword) {
      return res.status(401).json({ error: 'Email ou senha incorretos' });
    }
    if (login.status === 'pending') {
      return res.status(403).json({ error: 'Sua conta familiar aguarda aprovação da recepção', code: 'FAMILY_PENDING' });
    }
    if (login.status !== 'active') {
      return res.status(401).json({ error: 'Email ou senha incorretos' });
    }

    // ✅ Login bem-sucedido
    console.log(`✅ Login bem-sucedido: ${email} (role: ${login.role})`);

    // Gerar JWT com empresa_id e role
    const token = jwt.sign(
      { 
        id: login.id,
        email: login.email,
        empresa_id: login.empresa_id,
        empresa_nome: login.empresa_nome,
        role: login.role
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Atualizar último acesso
    await query(
      'UPDATE logins SET ultimo_acesso = GETDATE() WHERE id = @id',
      { id: login.id }
    );

    // Definir redirect baseado no role
    const roleRedirects = {
      'admin': '/admin',
      'reception': '/reception',
      'game_master': '/game-master',
      'display': '/display',
      'family': '/family',
      'master': '/master'
    };

    res.json({
      success: true,
      token: token,
      user: {
        id: login.id,
        name: login.family_name || login.empresa_nome,
        email: login.email,
        role: login.role,
        redirect: roleRedirects[login.role] || '/admin',
        plan: login.plano,
        empresa_id: login.empresa_id
      }
    });

  } catch (err) {
    console.error('❌ Erro ao fazer login:', err);
    res.status(500).json({ error: err.message });
  }
});

// Logout (opcional - apenas para logs)
router.post('/logout', async (req, res) => {
  try {
    console.log('👋 Logout realizado');
    res.json({ success: true, message: 'Logout realizado com sucesso' });
  } catch (err) {
    console.error('❌ Erro ao fazer logout:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
