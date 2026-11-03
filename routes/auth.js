// routes/auth.js - Autenticação
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { query, queryOne } = require('../database');
const { verifyToken } = require('../utils/middleware');
const { papeisDaConta } = require('../utils/papeis');
const { hashSenha, verificarSenha, precisaAtualizar, validarSenhaNova } = require('../utils/senhas');
const { enviarEmail, emailConfigurado } = require('../utils/email');
const { modeloCodigo } = require('../utils/emailModelos');

const MINUTOS_CODIGO = 15;
const TENTATIVAS_CODIGO = 5;
const SEGUNDOS_ENTRE_CODIGOS = 60;

const JWT_SECRET = process.env.JWT_SECRET || 'sua-chave-secreta-super-segura-2026';
const VALID_ROLES = new Set(['admin', 'reception', 'game_master', 'display', 'family', 'master', 'kiosk', 'score_kiosk']);

// Token da conta na área `role`. `papeis` é a lista de áreas que a conta pode usar (vai junto para o front).
function assinarToken(login, role, papeis) {
  return jwt.sign(
    {
      id: login.loginId,
      email: login.email,
      empresaId: login.empresaId,
      empresa_nome: login.empresa_nome,
      role,
      papeis,
      plan: login.plano,   // o painel usa para mostrar os jogos do plano (o backend confere no banco)
      tv: Number(login.tokenVersao || 0)   // versão da sessão: trocar a senha ou excluir a conta derruba este token
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

const ROLE_REDIRECTS = {
  'admin': '/admin',
  'reception': '/reception',
  'game_master': '/game-master',
  'display': '/display',
  'family': '/family',
  'master': '/master',
  'kiosk': '/reception/kiosk',
  'score_kiosk': '/score-kiosk'
};

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
      `SELECT l.loginId, l.email, l.senha, l.status, l.perfil, l.perfisExtras, l.nomeFamilia, l.tokenVersao,
              e.empresaId as empresaId, e.nome as empresa_nome, e.[plano]
       FROM login l
       JOIN empresa e ON l.empresaId = e.empresaId
       WHERE LOWER(l.email) = LOWER(@email)`,
      { email: String(email).trim() }
    );

    if (!login) {
      return res.status(401).json({ error: 'Email ou senha incorretos' });
    }

    if (!verificarSenha(senha, login.senha)) {
      return res.status(401).json({ error: 'Email ou senha incorretos' });
    }
    // Senha ainda guardada em base64: passa a ser guardada com hash, agora que sabemos que está certa.
    if (precisaAtualizar(login.senha)) {
      await query('UPDATE login SET senha = @senha WHERE loginId = @id', { senha: hashSenha(senha), id: login.loginId });
    }
    if (login.status === 'pending') {
      return res.status(403).json({ error: 'Sua conta familiar aguarda aprovação da recepção', codigo: 'FAMILY_PENDING' });
    }
    if (login.status !== 'active') {
      return res.status(401).json({ error: 'Email ou senha incorretos' });
    }

    if (!VALID_ROLES.has(login.perfil)) {
      console.error(`❌ Role inválido configurado para o usuário ${email}: ${login.perfil}`);
      return res.status(403).json({ error: 'Perfil de usuário inválido. Procure o administrador.' });
    }

    // ✅ Login bem-sucedido
    console.log(`✅ Login bem-sucedido: ${email} (role: ${login.perfil})`);

    // Token na área principal da conta; as outras áreas dela ficam em papeis
    const papeis = papeisDaConta(login);
    const token = assinarToken(login, login.perfil, papeis);

    // Atualizar último acesso
    await query(
      'UPDATE login SET ultimoAcesso = GETDATE() WHERE loginId = @id',
      { id: login.loginId }
    );

    // Entra direto na área principal; as outras áreas da conta aparecem no menu
    const redirect = ROLE_REDIRECTS[login.perfil] || '/admin';

    res.json({
      success: true,
      token: token,
      user: {
        id: login.loginId,
        nome: login.nomeFamilia || login.empresa_nome,
        perfil: login.perfil,
        // Mantidos em inglês para o frontenPulyn (web) até ele migrar
        name: login.nomeFamilia || login.empresa_nome,
        email: login.email,
        role: login.perfil,
        papeis,
        redirect,
        plan: login.plano,
        empresaId: login.empresaId
      }
    });

  } catch (err) {
    console.error('❌ Erro ao fazer login:', err);
    res.status(500).json({ error: err.message });
  }
});

// Troca de área: a conta pede um token para outro papel que ela já tem
// POST /auth/papel  { role }
router.post('/papel', verifyToken, async (req, res) => {
  try {
    const { role } = req.body || {};

    const login = await queryOne(
      `SELECT l.loginId, l.email, l.status, l.perfil, l.perfisExtras, l.nomeFamilia, l.tokenVersao,
              e.empresaId as empresaId, e.nome as empresa_nome, e.[plano]
       FROM login l
       JOIN empresa e ON l.empresaId = e.empresaId
       WHERE l.loginId = @id`,
      { id: req.user.id }
    );

    if (!login || login.status !== 'active') {
      return res.status(401).json({ error: 'Sessão inválida. Entre de novo.' });
    }

    const papeis = papeisDaConta(login);
    if (!papeis.includes(role)) {
      return res.status(403).json({ error: 'Esta conta não tem acesso a essa área' });
    }

    const token = assinarToken(login, role, papeis);
    res.json({
      success: true,
      token,
      user: {
        id: login.loginId,
        name: login.nomeFamilia || login.empresa_nome,
        email: login.email,
        role,
        papeis,
        redirect: ROLE_REDIRECTS[role] || '/admin',
        plan: login.plano,
        empresaId: login.empresaId
      }
    });
  } catch (err) {
    console.error('❌ Erro ao trocar de área:', err);
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
      'SELECT loginId FROM login WHERE LOWER(email) = @email',
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

    if (!email || !senha || !nome) {
      console.log('❌ Email, senha ou nome não fornecidos');
      return res.status(400).json({ error: 'Email, senha e nome são obrigatórios' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const hashedPassword = hashSenha(String(senha));

    console.log('🔍 Verificando se email já existe:', normalizedEmail);
    
    // Verificar se email já existe
    const existingLogin = await queryOne(
      'SELECT loginId, perfil, status FROM login WHERE LOWER(email) = @email',
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
      `INSERT INTO empresa (empresaId, nome, plano, status, dataCriacao)
       VALUES (@id, @nome, 'family', 'active', GETDATE())`,
      { 
        id: empresaId, 
        nome: `${nome}'s Family` 
      }
    );

    console.log('✅ Empresa criada:', empresaId);

    // Criar login para a família
    const loginId = crypto.randomUUID();
    console.log('📝 Criando login para família...');
    
    await query(
      `INSERT INTO login (loginId, empresaId, email, senha, nomeFamilia, perfil, status, dataCriacao)
       VALUES (@id, @empresaId, @email, @senha, @familyNome, 'family', 'active', GETDATE())`,
      {
        id: loginId,
        empresaId: empresaId,
        email: normalizedEmail,
        senha: hashedPassword,
        familyNome: nomeFamilia || nome
      }
    );

    console.log('✅ Login criado:', loginId);

    // Gerar JWT
    const token = jwt.sign(
      {
        id: loginId,
        email: normalizedEmail,
        empresaId: empresaId,
        empresa_nome: `${nome}'s Family`,
        role: 'family',
        tv: 0   // conta nova: versão inicial da sessão
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
        empresa_nome: `${nome}'s Family`
      }
    });

  } catch (err) {
    console.error('❌ Erro ao registrar:', err);
    res.status(500).json({ error: err.message });
  }
});

// Troca a senha da conta logada. Confere a senha atual, grava o hash novo e derruba as outras sessões (a versão
// da sessão sobe). A sessão atual recebe um token novo, para o aparelho que trocou continuar logado.
// POST /auth/alterar-senha  { senhaAtual, novaSenha }
router.post('/alterar-senha', verifyToken, async (req, res) => {
  try {
    const { senhaAtual, novaSenha } = req.body || {};
    if (!senhaAtual || !novaSenha) return res.status(400).json({ error: 'Informe a senha atual e a nova senha' });
    const erroSenha = validarSenhaNova(novaSenha);
    if (erroSenha) return res.status(400).json({ error: erroSenha });

    const conta = await queryOne('SELECT loginId, senha, tokenVersao FROM login WHERE loginId = @id', { id: req.user.id });
    if (!conta) return res.status(401).json({ error: 'Sessão inválida. Entre de novo.' });
    if (!verificarSenha(senhaAtual, conta.senha)) return res.status(403).json({ error: 'A senha atual está incorreta' });

    const versao = Number(conta.tokenVersao || 0) + 1;
    await query(
      'UPDATE login SET senha = @senha, tokenVersao = @versao WHERE loginId = @id',
      { senha: hashSenha(novaSenha), versao, id: conta.loginId }
    );

    // Mesmo payload da sessão atual, com a versão nova.
    const { iat, exp, ...payload } = req.user;
    const token = jwt.sign({ ...payload, tv: versao }, JWT_SECRET, { expiresIn: '24h' });
    console.log(`🔑 Senha alterada: loginId ${conta.loginId}; outras sessões encerradas`);
    res.json({ success: true, token, message: 'Senha alterada. As outras sessões foram encerradas.' });
  } catch (err) {
    console.error('❌ Erro ao alterar senha:', err);
    res.status(500).json({ error: err.message });
  }
});

// Atualiza nome e e-mail da conta de família. O e-mail é o login, então trocar o e-mail exige a senha atual.
// PATCH /auth/perfil  { nome, email, senhaAtual? }
router.patch('/perfil', verifyToken, async (req, res) => {
  try {
    const { nome, email, senhaAtual } = req.body || {};
    const conta = await queryOne(
      'SELECT loginId, email, senha, perfil, status FROM login WHERE loginId = @id',
      { id: req.user.id }
    );
    if (!conta || conta.status !== 'active') return res.status(401).json({ error: 'Sessão inválida. Entre de novo.' });
    if (conta.perfil !== 'family') return res.status(403).json({ error: 'Os dados desta conta são alterados pelo administrador do buffet' });

    const nomeNovo = String(nome ?? '').trim();
    if (nomeNovo.length < 2 || nomeNovo.length > 120) return res.status(400).json({ error: 'O nome precisa ter entre 2 e 120 caracteres' });

    const emailNovo = String(email ?? '').trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(emailNovo) || emailNovo.length > 255) return res.status(400).json({ error: 'Email inválido' });

    if (emailNovo !== String(conta.email).toLowerCase()) {
      if (!senhaAtual || !verificarSenha(senhaAtual, conta.senha)) {
        return res.status(403).json({ error: 'Para trocar o e-mail, confirme a senha atual' });
      }
      const usado = await queryOne(
        'SELECT loginId FROM login WHERE LOWER(email) = @email AND loginId <> @id',
        { email: emailNovo, id: conta.loginId }
      );
      if (usado) return res.status(409).json({ error: 'Este e-mail já está em uso' });
    }

    await query(
      'UPDATE login SET nomeFamilia = @nome, email = @email WHERE loginId = @id',
      { nome: nomeNovo, email: emailNovo, id: conta.loginId }
    );
    res.json({ success: true, user: { id: conta.loginId, nome: nomeNovo, name: nomeNovo, email: emailNovo } });
  } catch (err) {
    console.error('❌ Erro ao atualizar perfil:', err);
    res.status(500).json({ error: err.message });
  }
});

// ----- Códigos por e-mail (recuperação de senha e confirmação do e-mail) -----

function gerarCodigo() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

// Cria um código novo para a conta e o tipo (guardado com hash). Devolve null se já foi enviado há pouco.
async function emitirCodigo(loginId, tipo) {
  const recente = await queryOne(
    `SELECT 1 AS ok FROM "codigoEmail"
     WHERE loginId = @id AND tipo = @tipo AND criadoEm > now() - make_interval(secs => @segundos)`,
    { id: loginId, tipo, segundos: SEGUNDOS_ENTRE_CODIGOS }
  );
  if (recente) return null;

  const codigo = gerarCodigo();
  await query(
    `INSERT INTO "codigoEmail" ("loginId", "tipo", "codigoHash", "expiraEm", "tentativas", "criadoEm")
     VALUES (@id, @tipo, @hash, now() + make_interval(mins => @minutos), 0, now())
     ON CONFLICT ("loginId", "tipo") DO UPDATE SET
       "codigoHash" = EXCLUDED."codigoHash", "expiraEm" = EXCLUDED."expiraEm",
       "tentativas" = 0, "criadoEm" = EXCLUDED."criadoEm"`,
    { id: loginId, tipo, hash: hashSenha(codigo), minutos: MINUTOS_CODIGO }
  );
  return codigo;
}

// Confere o código digitado. Devolve null se estiver certo, ou {status, error} com o motivo.
async function conferirCodigo(loginId, tipo, codigoDigitado) {
  const guardado = await queryOne(
    `SELECT "codigoHash", "tentativas", ("expiraEm" > now()) AS valido
     FROM "codigoEmail" WHERE loginId = @id AND tipo = @tipo`,
    { id: loginId, tipo }
  );
  if (!guardado || !guardado.valido) return { status: 400, error: 'Código inválido ou expirado. Peça um novo código.' };
  if (Number(guardado.tentativas) >= TENTATIVAS_CODIGO) {
    return { status: 429, error: 'Muitas tentativas. Peça um novo código.' };
  }
  if (!verificarSenha(String(codigoDigitado || '').trim(), guardado.codigoHash)) {
    await query('UPDATE "codigoEmail" SET tentativas = tentativas + 1 WHERE loginId = @id AND tipo = @tipo', { id: loginId, tipo });
    return { status: 400, error: 'Código inválido ou expirado. Peça um novo código.' };
  }
  return null;
}

async function mandarCodigoPorEmail(para, codigo, assunto, abertura) {
  if (!emailConfigurado()) {
    console.warn('⚠️ E-mail não configurado (BREVO_API_KEY / EMAIL_REMETENTE): código não enviado');
    return;
  }
  const { html, texto } = modeloCodigo({ titulo: assunto, abertura, codigo, minutos: MINUTOS_CODIGO });
  await enviarEmail({ para, assunto, texto, html });
}

// Pede o código para redefinir a senha. Responde igual existindo ou não a conta (não revela e-mails cadastrados).
// POST /auth/esqueci-senha  { email }
router.post('/esqueci-senha', async (req, res) => {
  const resposta = { success: true, message: 'Se o e-mail estiver cadastrado, enviamos um código para redefinir a senha.' };
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'Informe o e-mail' });

    const conta = await queryOne(
      "SELECT loginId, email FROM login WHERE LOWER(email) = @email AND status = 'active'",
      { email }
    );
    if (conta) {
      const codigo = await emitirCodigo(conta.loginId, 'senha');
      if (codigo) {
        try {
          await mandarCodigoPorEmail(conta.email, codigo, 'Redefinir sua senha do Pulyn', 'Você pediu para redefinir a senha do Pulyn.');
        } catch (erro) {
          console.error('❌ Falha ao enviar código de senha:', erro.message);
        }
      }
    }
    res.json(resposta);
  } catch (err) {
    console.error('❌ Erro em esqueci-senha:', err);
    res.json(resposta);
  }
});

// Define a senha nova com o código recebido por e-mail. Derruba as sessões abertas.
// POST /auth/redefinir-senha  { email, codigo, novaSenha }
router.post('/redefinir-senha', async (req, res) => {
  try {
    const { email, codigo, novaSenha } = req.body || {};
    const erroSenha = validarSenhaNova(novaSenha);
    if (erroSenha) return res.status(400).json({ error: erroSenha });

    const conta = await queryOne(
      "SELECT loginId FROM login WHERE LOWER(email) = @email AND status = 'active'",
      { email: String(email || '').trim().toLowerCase() }
    );
    if (!conta) return res.status(400).json({ error: 'Código inválido ou expirado. Peça um novo código.' });

    const falha = await conferirCodigo(conta.loginId, 'senha', codigo);
    if (falha) return res.status(falha.status).json({ error: falha.error });

    await query(
      'UPDATE login SET senha = @senha, tokenVersao = tokenVersao + 1 WHERE loginId = @id',
      { senha: hashSenha(novaSenha), id: conta.loginId }
    );
    await query(`DELETE FROM "codigoEmail" WHERE loginId = @id AND tipo = 'senha'`, { id: conta.loginId });
    console.log(`🔑 Senha redefinida por código: loginId ${conta.loginId}`);
    res.json({ success: true, message: 'Senha redefinida. Entre com a nova senha.' });
  } catch (err) {
    console.error('❌ Erro ao redefinir senha:', err);
    res.status(500).json({ error: err.message });
  }
});

// Manda o código para confirmar o e-mail da conta logada.
// POST /auth/confirmacao-email/enviar
router.post('/confirmacao-email/enviar', verifyToken, async (req, res) => {
  try {
    const conta = await queryOne(
      "SELECT loginId, email, emailConfirmadoEm FROM login WHERE loginId = @id AND status = 'active'",
      { id: req.user.id }
    );
    if (!conta) return res.status(401).json({ error: 'Sessão inválida. Entre de novo.' });
    if (conta.emailConfirmadoEm) return res.json({ success: true, jaConfirmado: true });

    const codigo = await emitirCodigo(conta.loginId, 'email');
    if (!codigo) return res.status(429).json({ error: 'Aguarde um minuto antes de pedir outro código.' });
    await mandarCodigoPorEmail(conta.email, codigo, 'Confirme seu e-mail no Pulyn', 'Use o código abaixo para confirmar seu e-mail.');
    res.json({ success: true, message: 'Código enviado para o seu e-mail.' });
  } catch (err) {
    console.error('❌ Erro ao enviar código de confirmação:', err);
    res.status(500).json({ error: err.message });
  }
});

// Confirma o e-mail com o código recebido.
// POST /auth/confirmacao-email/confirmar  { codigo }
router.post('/confirmacao-email/confirmar', verifyToken, async (req, res) => {
  try {
    const conta = await queryOne(
      "SELECT loginId FROM login WHERE loginId = @id AND status = 'active'",
      { id: req.user.id }
    );
    if (!conta) return res.status(401).json({ error: 'Sessão inválida. Entre de novo.' });

    const falha = await conferirCodigo(conta.loginId, 'email', req.body?.codigo);
    if (falha) return res.status(falha.status).json({ error: falha.error });

    await query('UPDATE login SET emailConfirmadoEm = now() WHERE loginId = @id', { id: conta.loginId });
    await query(`DELETE FROM "codigoEmail" WHERE loginId = @id AND tipo = 'email'`, { id: conta.loginId });
    res.json({ success: true, message: 'E-mail confirmado' });
  } catch (err) {
    console.error('❌ Erro ao confirmar e-mail:', err);
    res.status(500).json({ error: err.message });
  }
});

// Exclui a conta de família pelo próprio app (exigência da App Store). A conta deixa de entrar, e o e-mail, o nome da
// família e a senha são apagados. O histórico de eventos fica sem identificação. Contas da equipe do buffet
// (admin, recepção etc.) não são excluídas aqui: isso é com o administrador do buffet.
// DELETE /auth/conta  { senha }
router.delete('/conta', verifyToken, async (req, res) => {
  try {
    const { senha } = req.body || {};
    if (!senha) return res.status(400).json({ error: 'Informe a senha para excluir a conta' });

    const conta = await queryOne('SELECT loginId, senha, status, perfil FROM login WHERE loginId = @id', { id: req.user.id });
    if (!conta || conta.status === 'excluida') return res.status(401).json({ error: 'Sessão inválida. Entre de novo.' });
    if (conta.perfil !== 'family') {
      return res.status(403).json({ error: 'Esta conta não pode ser excluída pelo app. Procure o administrador do buffet.' });
    }
    if (!verificarSenha(senha, conta.senha)) return res.status(403).json({ error: 'A senha está incorreta' });

    // Senha aleatória descartada: ninguém consegue entrar de novo, nem por recuperação.
    const descartada = hashSenha(crypto.randomBytes(32).toString('hex'));
    await query(
      `UPDATE login SET status = 'excluida', email = @email, nomeFamilia = NULL, senha = @senha,
              tokenVersao = tokenVersao + 1
       WHERE loginId = @id`,
      { email: `excluida-${conta.loginId}@removida.pulyn`, senha: descartada, id: conta.loginId }
    );
    console.log(`🗑️ Conta de família excluída pelo próprio usuário: loginId ${conta.loginId}`);
    res.json({ success: true, message: 'Conta excluída' });
  } catch (err) {
    console.error('❌ Erro ao excluir conta:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
