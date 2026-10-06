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
    const { email, senha } = req.body;

    if (!email || !senha) {
      console.log('❌ Email ou senha não fornecidos');
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }

    console.log('🔍 Buscando usuário:', email);
    const login = await queryOne(
      `SELECT l.id, l.email, l.senha, l.status, l.perfil, l.nomeFamilia,
              e.id as empresaId, e.nome as empresa_nome, e.[plano]
       FROM logins l
       JOIN empresa e ON l.empresaId = e.id
       WHERE LOWER(l.email) = LOWER(@email)`,
      { email: String(email).trim() }
    );

    if (!login) {
      return res.status(401).json({ error: 'Email ou senha incorretos' });
    }

    // Comparar senha (base64)
    const hashedPassword = Buffer.from(senha).toString('base64');
    if (login.senha !== hashedPassword) {
      return res.status(401).json({ error: 'Email ou senha incorretos' });
    }
    if (login.status === 'pending') {
      return res.status(403).json({ error: 'Sua conta familiar aguarda aprovação da recepção', codigo: 'FAMILY_PENDING' });
    }
    if (login.status !== 'active') {
      return res.status(401).json({ error: 'Email ou senha incorretos' });
    }

    if (!VALID_ROLES.has(login.perfil)) {
      console.error(`❌ Role inválido configurado para o usuário ${email}: ${login.role}`);
      return res.status(403).json({ error: 'Perfil de usuário inválido. Procure o administrador.' });
    }

    // ✅ Login bem-sucedido
    console.log(`✅ Login bem-sucedido: ${email} (role: ${login.role})`);

    // Gerar JWT com empresaId e role
    const token = jwt.sign(
      { 
        id: login.id,
        email: login.email,
        empresaId: login.empresaId,
        empresa_nome: login.empresa_nome,
        role: login.role
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Atualizar último acesso
    await query(
      'UPDATE logins SET ultimoAcesso = GETDATE() WHERE id = @id',
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
        name: login.nomeFamilia || login.empresa_nome,
        email: login.email,
        role: login.perfil,
        redirect: roleRedirects[login.role] || '/admin',
        plan: login.plano,
        empresaId: login.empresaId
      }
    });

  } catch (err) {
    console.error('❌ Erro ao fazer login:', err);
    res.status(500).json({ error: err.message });
  }
});

// Logout (opcional - apenas para log)
router.post('/logout', async (req, res) => {
  try {
    console.log('👋 Logout realizado');
    res.json({ success: true, message: 'Logout realizado com sucesso' });
  } catch (err) {
    console.error('❌ Erro ao fazer logout:', err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Validação de email: verificar se já existe
// GET /auth/check-email?email=user@example.com
router.get('/check-email', async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      console.log('❌ Email não fornecido');
      return res.status(400).json({ error: 'Email é obrigatório' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    // Validação básica de email
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      console.log('❌ Email inválido:', normalizedEmail);
      return res.status(400).json({
        available: false,
        error: 'Email inválido'
      });
    }

    console.log('🔍 Verificando disponibilidade de email:', normalizedEmail);

    // Verificar se email já existe
    const existingLogin = await queryOne(
      'SELECT id FROM logins WHERE LOWER(email) = @email',
      { email: normalizedEmail }
    );

    if (existingLogin) {
      console.log('❌ Email já registrado:', normalizedEmail);
      return res.json({
        available: false,
        message: 'Este email já foi registrado'
      });
    }

    console.log('✅ Email disponível:', normalizedEmail);
    return res.json({
      available: true,
      message: 'Email disponível para registro'
    });

  } catch (err) {
    console.error('❌ Erro ao verificar email:', err);
    res.status(500).json({ error: err.message });
  }
});

// Registro direto: criar conta familiar sem convite
// POST /auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, senha, nome, nomeFamilia } = req.body;

    if (!email || !senha || !name) {
      console.log('❌ Email, senha ou nome não fornecidos');
      return res.status(400).json({ error: 'Email, senha e nome são obrigatórios' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const hashedPassword = Buffer.from(String(senha)).toString('base64');

    console.log('🔍 Verificando se email já existe:', normalizedEmail);
    
    // Verificar se email já existe
    const existingLogin = await queryOne(
      'SELECT id, perfil, status FROM logins WHERE LOWER(email) = @email',
      { email: normalizedEmail }
    );

    if (existingLogin) {
      console.log('❌ Email já registrado:', normalizedEmail);
      return res.status(409).json({ error: 'Este email já foi registrado' });
    }

    // Validações
    if (String(senha).length < 6) {
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
      `INSERT INTO empresa (id, nome, plano, status, dataCriacao)
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
      `INSERT INTO logins (id, empresaId, email, senha, nomeFamilia, perfil, status, dataCriacao)
       VALUES (@id, @empresaId, @email, @senha, @familyNome, 'family', 'active', GETDATE())`,
      {
        id: loginId,
        empresaId: empresaId,
        email: normalizedEmail,
        senha: hashedPassword,
        familyName: nomeFamilia || name
      }
    );

    console.log('✅ Login criado:', loginId);

    // Gerar JWT
    const token = jwt.sign(
      {
        id: loginId,
        email: normalizedEmail,
        empresaId: empresaId,
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
        name: nome,
        nomeFamilia: nomeFamilia || nome,
        role: 'family',
        empresaId: empresaId,
        empresa_nome: `${name}'s Family`
      }
    });

  } catch (err) {
    console.error('❌ Erro ao registrar:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
