// routes/auth.js - Autenticação
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { query, queryOne } = require('../database');

const JWT_SECRET = process.env.JWT_SECRET || 'sua-chave-secreta-super-segura-2026';
const VALID_ROLES = new Set(['admin', 'reception', 'game_master', 'display', 'family', 'master', 'kiosk', 'score_kiosk']);

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

    if (!VALID_ROLES.has(login.role)) {
      console.error(`❌ Role inválido configurado para o usuário ${email}: ${login.role}`);
      return res.status(403).json({ error: 'Perfil de usuário inválido. Procure o administrador.' });
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
      'master': '/master',
      'kiosk': '/reception/kiosk',
      'score_kiosk': '/score-kiosk'
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

// Registro direto: criar conta familiar sem convite
// POST /auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, family_name } = req.body;

    if (!email || !password || !name) {
      console.log('❌ Email, senha ou nome não fornecidos');
      return res.status(400).json({ error: 'Email, senha e nome são obrigatórios' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const hashedPassword = Buffer.from(String(password)).toString('base64');

    console.log('🔍 Verificando se email já existe:', normalizedEmail);
    
    // Verificar se email já existe
    const existingLogin = await queryOne(
      'SELECT id, role, status FROM logins WHERE LOWER(email) = @email',
      { email: normalizedEmail }
    );

    if (existingLogin) {
      console.log('❌ Email já registrado:', normalizedEmail);
      return res.status(409).json({ error: 'Este email já foi registrado' });
    }

    // Validações
    if (String(password).length < 6) {
      return res.status(400).json({ error: 'Senha deve ter no mínimo 6 caracteres' });
    }

    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      return res.status(400).json({ error: 'Email inválido' });
    }

    console.log('📝 Criando nova empresa para família...');
    
    // Criar empresa para a família (buffet pessoal)
    const crypto = require('crypto');
    const empresaId = crypto.randomUUID();
    
    await query(
      `INSERT INTO empresas (id, nome, plano, status, data_criacao)
       VALUES (@id, @nome, 'family', 'active', GETDATE())`,
      { 
        id: empresaId, 
        nome: `${name}'s Family` 
      }
    );

    console.log('✅ Empresa criada:', empresaId);

    // Criar login para a família
    const loginId = crypto.randomUUID();
    console.log('📝 Criando login para família...');
    
    await query(
      `INSERT INTO logins (id, empresa_id, email, password, family_name, role, status, data_criacao)
       VALUES (@id, @empresaId, @email, @password, @familyName, 'family', 'active', GETDATE())`,
      {
        id: loginId,
        empresaId: empresaId,
        email: normalizedEmail,
        password: hashedPassword,
        familyName: family_name || name
      }
    );

    console.log('✅ Login criado:', loginId);

    // Gerar JWT
    const token = jwt.sign(
      {
        id: loginId,
        email: normalizedEmail,
        empresa_id: empresaId,
        empresa_nome: `${name}'s Family`,
        role: 'family'
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    console.log('✅ Registro bem-sucedido para:', normalizedEmail);

    res.status(201).json({
      success: true,
      message: 'Conta criada com sucesso',
      token: token,
      user: {
        id: loginId,
        email: normalizedEmail,
        name: name,
        family_name: family_name || name,
        role: 'family',
        empresa_id: empresaId,
        empresa_nome: `${name}'s Family`
      }
    });

  } catch (err) {
    console.error('❌ Erro ao registrar:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;