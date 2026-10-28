const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { query, queryOne, allQuery, withTransaction } = require('../database');
const { verifyToken, isMaster } = require('../utils/middleware');
const { planInviteRegistration, describeRegistrationResult } = require('../utils/familyInviteRules');
const { criarPerfil } = require('../utils/perfilCrianca');
const { eventoAberto, validarPreCadastro } = require('../utils/preCadastroFamilia');
const { getAvatarForCreate } = require('../utils/avatar');
const { avaliarConviteParaEntrar, montarEventosDaFamilia } = require('../utils/eventosFamilia');
const { gerarCodigo, normalizarCodigo, formatoValido, exibirCodigo } = require('../utils/codigoConvite');
const { criarLimitador, ipDoCliente } = require('../utils/limiteTentativas');

const STAFF_ROLES = ['admin', 'reception', 'master'];
const FRONTEND_URL = String(process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// O código do convite tem só 8 dígitos hexadecimais: quem erra códigos demais é barrado por um tempo.
const tentativasDeConvite = criarLimitador({ max: 15 });
const MENSAGEM_MUITAS_TENTATIVAS = 'Muitas tentativas com códigos inválidos. Tente de novo em alguns minutos.';
const quemPede = (req) => req.user?.id || ipDoCliente(req);

function isStaff(req) {
  return STAFF_ROLES.includes(req.user?.role);
}

async function getInvite(token) {
  if (!formatoValido(token)) return null;
  const invite = await queryOne(`
    SELECT i.*, e.nome as evento_nome, e.data as evento_data,
           c.criancaId as linked_child_id, c.nome as linked_child_name
    FROM conviteFamilia i
    JOIN evento e ON e.eventoId = i.eventoId
    LEFT JOIN crianca c ON c.criancaId = i.criancaId
    WHERE i.hashToken = @tokenHash
  `, { tokenHash: hashToken(normalizarCodigo(token)) });
  if (!invite) return null;
  if (invite.status === 'pending' && new Date(invite.expiramEm) <= new Date()) {
    await query(`UPDATE conviteFamilia SET status = 'expired' WHERE conviteId = @id AND status = 'pending'`, { id: invite.conviteId });
    invite.status = 'expired';
  }
  return invite;
}

async function getEventForUser(eventoId, req) {
  const evento = await queryOne(
    'SELECT eventoId, empresaId, nome, data FROM evento WHERE eventoId = @eventoId',
    { eventoId }
  );
  if (!evento) return { error: 'Evento não encontrado', status: 404 };
  if (!isMaster(req) && String(evento.empresaId) !== String(req.user.empresaId)) {
    return { error: 'Acesso negado: evento não pertence à sua empresa', status: 403 };
  }
  return { evento };
}

function publicInvite(invite) {
  return {
    valid: invite.status === 'pending',
    status: invite.status,
    event: { id: invite.eventoId, nome: invite.evento_nome, data: invite.evento_data, name: invite.evento_nome, date: invite.evento_data },
    child: invite.linked_child_id ? { id: invite.linked_child_id, nome: invite.linked_child_name, name: invite.linked_child_name } : null,
    email: invite.email || null,
    expiresAt: invite.expiramEm,
  };
}

// Validar convite sem revelar o token armazenado ou dados internos.
router.get('/invites/:token', async (req, res) => {
  try {
    const quem = quemPede(req);
    if (tentativasDeConvite.bloqueado(quem)) return res.status(429).json({ error: MENSAGEM_MUITAS_TENTATIVAS });
    const invite = await getInvite(req.params.token);
    if (!invite) {
      tentativasDeConvite.registrarFalha(quem);
      return res.status(404).json({ error: 'Convite não encontrado' });
    }
    if (invite.status !== 'pending') {
      tentativasDeConvite.registrarFalha(quem);
      return res.status(410).json({ error: invite.status === 'expired' ? 'Convite expirado' : 'Convite já utilizado', status: invite.status });
    }
    res.json(publicInvite(invite));
  } catch (err) {
    console.error('❌ Erro ao validar convite familiar:', err);
    res.status(500).json({ error: err.message });
  }
});
// Criar convite para um evento ou para uma participação já existente.
router.post('/invites', verifyToken, async (req, res) => {
  try {
    if (!isStaff(req)) return res.status(403).json({ error: 'Acesso negado' });
    const { eventoId, criancaId, email, expiresInDays = 7 } = req.body;
    if (!eventoId) return res.status(400).json({ error: 'eventoId é obrigatório' });

    const eventResult = await getEventForUser(eventoId, req);
    if (eventResult.error) return res.status(eventResult.status).json({ error: eventResult.error });
    const evento = eventResult.evento;

    if (criancaId) {
      const child = await queryOne(
        `SELECT criancaId FROM crianca WHERE criancaId = @criancaId AND eventoId = @eventoId AND empresaId = @empresaId`,
        { criancaId, eventoId, empresaId: evento.empresaId }
      );
      if (!child) return res.status(404).json({ error: 'Criança não encontrada neste evento' });
    }

    // Código de 8 dígitos hexadecimais; sorteia de novo se por azar já existir um igual (mesmo de convite antigo)
    let codigo = gerarCodigo();
    for (let tentativa = 0; tentativa < 10; tentativa++) {
      const existente = await queryOne('SELECT conviteId FROM conviteFamilia WHERE hashToken = @tokenHash', { tokenHash: hashToken(codigo) });
      if (!existente) break;
      codigo = gerarCodigo();
    }
    const days = Math.min(Math.max(Number(expiresInDays) || 7, 1), 30);
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    const id = crypto.randomUUID();
    await query(`
      INSERT INTO conviteFamilia
        (conviteId, empresaId, eventoId, criancaId, email, hashToken, status, expiramEm, criadoPor)
      VALUES (@id, @empresaId, @eventoId, @criancaId, @email, @tokenHash, 'pending', @expiresAt, @createdBy)
    `, {
      id,
      empresaId: evento.empresaId,
      eventoId,
      criancaId: criancaId || null,
      email: email ? String(email).trim().toLowerCase() : null,
      tokenHash: hashToken(codigo),
      expiresAt,
      createdBy: req.user.id,
    });

    res.status(201).json({
      id,
      codigo: exibirCodigo(codigo),
      token: exibirCodigo(codigo), // mesmo valor do código; mantido para quem ainda lê "token"
      inviteUrl: `${FRONTEND_URL}/family/invite/${exibirCodigo(codigo)}`,
      expiresAt: expiresAt.toISOString(),
      event: { id: evento.eventoId, name: evento.nome, date: evento.data },
    });
  } catch (err) {
    console.error('❌ Erro ao criar convite familiar:', err);
    res.status(500).json({ error: err.message });
  }
});

// Cadastro público: a conta e o vínculo já nascem liberados (sem aprovação da recepção).
router.post('/invites/:token/register', async (req, res) => {
  let invite = null;
  try {
    const quem = quemPede(req);
    if (tentativasDeConvite.bloqueado(quem)) return res.status(429).json({ error: MENSAGEM_MUITAS_TENTATIVAS });
    invite = await getInvite(req.params.token);
    if (!invite) {
      tentativasDeConvite.registrarFalha(quem);
      return res.status(404).json({ error: 'Convite não encontrado' });
    }
    if (invite.status !== 'pending') {
      tentativasDeConvite.registrarFalha(quem);
      return res.status(410).json({ error: invite.status === 'expired' ? 'Convite expirado' : 'Convite já utilizado', status: invite.status });
    }

    const { nome, parentNome, email, senha, relacionamento = 'responsável', child, children: requestedChildren } = req.body;
    const familyName = String(parentNome || nome || '').trim();
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const childrenPayload = Array.isArray(requestedChildren)
      ? requestedChildren
      : (child ? [child] : []);
    if (!familyName || !normalizedEmail || !senha) {
      return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios' });
    }
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      return res.status(400).json({ error: 'E-mail inválido' });
    }
    if (String(senha).length < 6) {
      return res.status(400).json({ error: 'Senha deve ter no mínimo 6 caracteres' });
    }
    // O responsável pode se cadastrar sem crianças (vincula depois pelo QR Code no app)
    const plan = planInviteRegistration({ linkedChildId: invite.linked_child_id, children: childrenPayload });
    if (plan.error) {
      return res.status(400).json({ error: plan.error });
    }

    const existingLogin = await queryOne(
      'SELECT loginId, perfil, empresaId, status, senha FROM login WHERE LOWER(email) = @email',
      { email: normalizedEmail }
    );
    if (existingLogin && (existingLogin.perfil !== 'family' || String(existingLogin.empresaId) !== String(invite.empresaId))) {
      return res.status(409).json({ error: 'Este e-mail já pertence a outra conta. Use outro e-mail.' });
    }
    if (existingLogin && !['active', 'pending'].includes(existingLogin.status)) {
      return res.status(409).json({ error: 'Esta conta familiar não está disponível para novos vínculos.' });
    }
    if (existingLogin && existingLogin.senha !== Buffer.from(String(senha)).toString('base64')) {
      return res.status(409).json({ error: 'A senha informada não confere com a conta familiar existente.' });
    }

    const claimed = await query(`
      UPDATE conviteFamilia SET status = 'processing'
      WHERE conviteId = @id AND status = 'pending' AND expiramEm > GETDATE()
    `, { id: invite.conviteId });
    if (!claimed.rowsAffected?.[0]) {
      return res.status(409).json({ error: 'Convite já está sendo utilizado ou expirou' });
    }

    try {
      const loginId = existingLogin?.loginId || crypto.randomUUID();
      if (!existingLogin) {
        await query(`
          INSERT INTO login (loginId, empresaId, email, senha, nomeFamilia, perfil, status, dataCriacao)
          VALUES (@id, @empresaId, @email, @senha, @familyNome, 'family', @loginStatus, GETDATE())
        `, {
          id: loginId,
          empresaId: invite.empresaId,
          email: normalizedEmail,
          senha: Buffer.from(String(senha)).toString('base64'),
          familyNome: familyName,
          loginStatus: plan.loginStatus,
        });
      }

      const childIds = [];
      if (invite.linked_child_id) {
        childIds.push(invite.linked_child_id);
      } else {
        for (const childData of childrenPayload) {
          const childId = crypto.randomUUID();
          const childNomeLimpo = String(childData.name).trim();
          const childApelido = String(childData.nickname || childData.name).trim();
          const childIdade = Number.isFinite(Number(childData.age)) ? Number(childData.age) : null;
          const perfilId = await criarPerfil({
            empresaId: invite.empresaId, eventoId: invite.eventoId,
            nome: childNomeLimpo, apelido: childApelido, idade: childIdade, avatar: '👤',
          });
          await query(`
            INSERT INTO crianca
              (criancaId, eventoId, empresaId, timeId, nome, apelido, idade, avatar, pontos, status, perfilCriancaId)
            VALUES (@id, @eventoId, @empresaId, NULL, @childNome, @apelido, @age, '👤', 0, 'active', @perfilId)
          `, {
            id: childId,
            perfilId,
            eventoId: invite.eventoId,
            empresaId: invite.empresaId,
            childNome: String(childData.name).trim(),
            apelido: String(childData.nickname || childData.name).trim(),
            age: Number.isFinite(Number(childData.age)) ? Number(childData.age) : null,
          });
          childIds.push(childId);
        }
      }

      for (const childId of childIds) {
        const linkId = crypto.randomUUID();
        await query(`
          INSERT INTO vinculoFamiliar
            (vinculoId, loginId, criancaId, empresaId, relacionamento, status, aprovadoEm, perfilCriancaId)
          VALUES (@id, @loginId, @childId, @empresaId, @relacionamento, 'approved', GETDATE(),
                  (SELECT c.perfilCriancaId FROM crianca c WHERE c.criancaId = @childId))
        `, {
          id: linkId,
          loginId,
          childId,
          empresaId: invite.empresaId,
          relacionamento: String(relacionamento).trim().slice(0, 50) || 'responsável',
        });
      }

      await query(`
        UPDATE conviteFamilia SET status = 'used', usadoEm = GETDATE()
        WHERE conviteId = @inviteId AND status = 'processing'
      `, { inviteId: invite.conviteId });

      const result = describeRegistrationResult({
        childless: plan.childless,
        plannedLoginStatus: plan.loginStatus,
        existingLoginStatus: existingLogin?.status,
      });

      return res.status(201).json({
        success: true,
        mensagem: result.message,
        message: result.message,
        status: result.status,
        childId: childIds[0],
        childIds,
        childrenCount: childIds.length,
      });
    } catch (registrationError) {
      await query(`UPDATE conviteFamilia SET status = 'pending' WHERE conviteId = @id AND status = 'processing'`, { id: invite.conviteId }).catch(() => {});
      throw registrationError;
    }
  } catch (err) {
    console.error('❌ Erro ao registrar família:', err);
    res.status(500).json({ error: err.message });
  }
});
// Responsável já logado adiciona um evento digitando o código do convite. O evento passa a ser da conta dele
// (familiaEvento) e, se o convite era de uma criança específica, ela também é vinculada.
router.post('/invites/:token/entrar', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'family') return res.status(403).json({ error: 'Acesso exclusivo para famílias' });

    const quem = quemPede(req);
    if (tentativasDeConvite.bloqueado(quem)) return res.status(429).json({ error: MENSAGEM_MUITAS_TENTATIVAS });
    const invite = await getInvite(req.params.token);
    const avaliacao = avaliarConviteParaEntrar(invite, req.user.email);
    if (!avaliacao.ok) {
      // Código inexistente, usado ou vencido conta como tentativa errada; e-mail diferente não (o código estava certo)
      if (avaliacao.status !== 403) tentativasDeConvite.registrarFalha(quem);
      return res.status(avaliacao.status).json({ error: avaliacao.error });
    }

    const resultado = await withTransaction(async () => {
      // O UPDATE é a trava: se dois pedidos chegam juntos, só um consegue marcar o convite como usado.
      const usado = await query(`
        UPDATE conviteFamilia SET status = 'used', usadoEm = GETDATE()
        WHERE conviteId = @id AND status = 'pending' AND expiramEm > GETDATE()
      `, { id: invite.conviteId });
      if (!usado.rowsAffected?.[0]) return { conflito: true };

      const jaTinhaEvento = Boolean(await queryOne(
        'SELECT familiaEventoId FROM familiaEvento WHERE loginId = @loginId AND eventoId = @eventoId',
        { loginId: req.user.id, eventoId: invite.eventoId }
      ));
      if (!jaTinhaEvento) {
        await query(`
          INSERT INTO familiaEvento (familiaEventoId, loginId, eventoId, empresaId, conviteId)
          VALUES (@id, @loginId, @eventoId, @empresaId, @conviteId)
        `, {
          id: crypto.randomUUID(), loginId: req.user.id, eventoId: invite.eventoId,
          empresaId: invite.empresaId, conviteId: invite.conviteId,
        });
      }

      let crianca = null;
      if (invite.linked_child_id) {
        const vinculo = await queryOne(
          'SELECT vinculoId, status FROM vinculoFamiliar WHERE loginId = @loginId AND criancaId = @criancaId',
          { loginId: req.user.id, criancaId: invite.linked_child_id }
        );
        if (!vinculo) {
          const cadastro = await queryOne('SELECT perfilCriancaId FROM crianca WHERE criancaId = @criancaId', { criancaId: invite.linked_child_id });
          await query(`
            INSERT INTO vinculoFamiliar
              (vinculoId, loginId, criancaId, empresaId, relacionamento, status, aprovadoEm, perfilCriancaId)
            VALUES (@id, @loginId, @criancaId, @empresaId, 'responsável', 'approved', GETDATE(), @perfilCriancaId)
          `, {
            id: crypto.randomUUID(), loginId: req.user.id, criancaId: invite.linked_child_id,
            empresaId: invite.empresaId, perfilCriancaId: cadastro?.perfilCriancaId || null,
          });
        } else if (vinculo.status !== 'approved') {
          await query(
            `UPDATE vinculoFamiliar SET status = 'approved', aprovadoEm = GETDATE(), rejeitadoEm = NULL WHERE vinculoId = @id`,
            { id: vinculo.vinculoId }
          );
        }
        crianca = { id: invite.linked_child_id, nome: invite.linked_child_name };
      }
      return { jaTinhaEvento, crianca };
    });

    if (resultado.conflito) return res.status(409).json({ error: 'Convite já foi utilizado ou expirou' });
    res.status(201).json({
      success: true,
      evento: { id: invite.eventoId, nome: invite.evento_nome, data: invite.evento_data },
      crianca: resultado.crianca,
      jaTinhaEvento: resultado.jaTinhaEvento,
    });
  } catch (err) {
    console.error('❌ [FAMILIAS] Erro ao adicionar evento pelo convite:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Pendências visíveis apenas para recepção/admin/master.
async function listFamilyLinks(status, eventoId, req) {
  return allQuery(`
    SELECT l.vinculoId as link_id, l.status as link_status, l.relacionamento, l.criadoEm as requested_at,
           u.loginId as loginId, u.email, u.nomeFamilia,
           c.criancaId as criancaId, c.nome as crianca_nome, c.apelido, c.idade, c.avatar,
           c.codigoPulseira, c.pontos, c.status as crianca_status,
           e.eventoId as eventoId, e.nome as evento_nome, e.data as evento_date,
           t.timeId as timeId, t.nome as time_nome, t.cor as time_color
    FROM vinculoFamiliar l
    JOIN login u ON u.loginId = l.loginId
    JOIN crianca c ON c.criancaId = l.criancaId
    JOIN evento e ON e.eventoId = c.eventoId
    LEFT JOIN "time" t ON t.timeId = c.timeId
    WHERE l.status = @status
      AND (CAST(@eventoId AS VARCHAR(36)) IS NULL OR e.eventoId = CAST(@eventoId AS VARCHAR(36)))
      AND (@isMaster = 1 OR l.empresaId = @empresaId)
    ORDER BY l.criadoEm ASC
  `, {
    status,
    eventoId,
    empresaId: req.user.empresaId,
    isMaster: isMaster(req) ? 1 : 0,
  });
}

router.get('/approved', verifyToken, async (req, res) => {
  try {
    if (!isStaff(req)) return res.status(403).json({ error: 'Acesso negado' });
    const approved = await listFamilyLinks('approved', req.query.eventoId || null, req);
    res.json(approved);
  } catch (err) {
    console.error('❌ Erro ao listar famílias aprovadas:', err);
    res.status(500).json({ error: err.message });
  }
});

// Sem aprovação da recepção (os vínculos já nascem aprovados), não existe pendência.
// A rota continua respondendo para o painel da recepção do frontenPulyn não receber 404.
router.get('/pending', verifyToken, async (req, res) => {
  if (!isStaff(req)) return res.status(403).json({ error: 'Acesso negado' });
  res.json([]);
});

async function getLinkForStaff(linkId, req) {
  const link = await queryOne(
    `SELECT l.*, c.nome as crianca_nome, c.status as crianca_status
     FROM vinculoFamiliar l
     JOIN crianca c ON c.criancaId = l.criancaId
     WHERE l.vinculoId = @linkId`,
    { linkId }
  );
  if (!link) return { error: 'Solicitação não encontrada', status: 404 };
  if (!isMaster(req) && String(link.empresaId) !== String(req.user.empresaId)) {
    return { error: 'Acesso negado', status: 403 };
  }
  return { link };
}

// Todas as vinculações (aprovadas, pendentes, rejeitadas e desvinculadas) com a criança e o
// responsável, para a tela de Vinculações da recepção. Filtros opcionais: evento e status.
const LINK_STATUSES = new Set(['approved', 'pending', 'rejected', 'inactive']);

router.get('/links', verifyToken, async (req, res) => {
  try {
    if (!isStaff(req)) return res.status(403).json({ error: 'Acesso negado' });
    const status = req.query.status ? String(req.query.status) : null;
    if (status && !LINK_STATUSES.has(status)) return res.status(400).json({ error: 'Status inválido' });

    const links = await allQuery(`
      SELECT l.vinculoId, l.status AS statusVinculo, l.relacionamento,
             l.criadoEm AS solicitadoEm, l.aprovadoEm, l.rejeitadoEm,
             u.loginId, u.email, u.nomeFamilia,
             c.criancaId, c.nome AS nomeCrianca, c.apelido, c.idade, c.avatar,
             COALESCE(c.codigoPulseira, c.ultimaPulseira) AS codigoPulseira, c.status AS statusCrianca,
             e.eventoId, e.nome AS nomeEvento, e.data AS dataEvento,
             t.nome AS nomeTime, t.cor AS corTime
      FROM vinculoFamiliar l
      JOIN login u ON u.loginId = l.loginId
      JOIN crianca c ON c.criancaId = l.criancaId
      JOIN evento e ON e.eventoId = c.eventoId
      LEFT JOIN "time" t ON t.timeId = c.timeId
      WHERE (CAST(@status AS VARCHAR(20)) IS NULL OR l.status = CAST(@status AS VARCHAR(20)))
        AND (CAST(@eventoId AS VARCHAR(36)) IS NULL OR e.eventoId = CAST(@eventoId AS VARCHAR(36)))
        AND (@isMaster = 1 OR l.empresaId = @empresaId)
      ORDER BY e.data DESC, c.nome ASC, l.criadoEm ASC
    `, {
      status,
      eventoId: req.query.eventoId ? String(req.query.eventoId) : null,
      empresaId: req.user.empresaId,
      isMaster: isMaster(req) ? 1 : 0,
    });
    res.json(links);
  } catch (err) {
    console.error('❌ Erro ao listar vinculações:', err);
    res.status(500).json({ error: err.message });
  }
});

// Desvincula um responsável de uma criança. Marca o vínculo como 'inactive' (mesmo estado
// que o próprio responsável usa ao remover a criança no app), então o histórico fica e
// ele pode se vincular de novo pelo QR code.
router.post('/links/:linkId/unlink', verifyToken, async (req, res) => {
  try {
    if (!isStaff(req)) return res.status(403).json({ error: 'Acesso negado' });
    const result = await getLinkForStaff(req.params.linkId, req);
    if (result.error) return res.status(result.status).json({ error: result.error });
    const { link } = result;

    if (link.status === 'inactive') return res.json({ ok: true, status: 'inactive', message: 'Este vínculo já estava desfeito' });
    if (link.status === 'rejected') return res.status(409).json({ error: 'Esta solicitação foi rejeitada; não há vínculo para desfazer' });

    await query(
      `UPDATE vinculoFamiliar SET status = 'inactive' WHERE vinculoId = @linkId AND status IN ('approved', 'pending')`,
      { linkId: link.vinculoId }
    );
    res.json({ ok: true, status: 'inactive', message: 'Vínculo desfeito' });
  } catch (err) {
    console.error('❌ Erro ao desvincular responsável:', err);
    res.status(500).json({ error: err.message });
  }
});

// Dados da própria família: todas as consultas usam o login autenticado e vínculo aprovado.
router.get('/me', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'family') return res.status(403).json({ error: 'Acesso exclusivo para famílias' });
    const family = await queryOne(`
      SELECT loginId, email, nomeFamilia, status, empresaId
      FROM login WHERE loginId = @loginId AND perfil = 'family'
    `, { loginId: req.user.id });
    if (!family) return res.status(404).json({ error: 'Conta familiar não encontrada' });
    res.json({
      id: family.loginId,
      nome: family.nomeFamilia || family.email,
      perfil: 'family',
      email: family.email,
      status: family.status,
      empresaId: family.empresaId,
      // Mantido em inglês para o frontenPulyn (web) até ele migrar
      name: family.nomeFamilia || family.email,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/children', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'family') return res.status(403).json({ error: 'Acesso exclusivo para famílias' });
    
    console.log(`📋 [FAMILIAS] GET /children chamado para login: ${req.user.id}`);
    
    const children = await allQuery(`
      SELECT c.criancaId, c.eventoId, c.nome, c.apelido, c.idade, c.avatar as "profileImage", c.codigoPulseira,
             COALESCE(c.pontos, 0) as "currentScore",
             COALESCE(c.pontos, 0) as "totalScore",
             l.relacionamento, l.status as link_status,
             t.timeId as "teamId", t.nome as "teamName", t.cor as "teamColor", t.pontos as team_points,
             e.nome as "eventoNome"
      FROM vinculoFamiliar l
      JOIN crianca c ON c.criancaId = l.criancaId
      LEFT JOIN "time" t ON t.timeId = c.timeId
      LEFT JOIN evento e ON e.eventoId = c.eventoId
      WHERE l.loginId = @loginId AND (l.status = 'approved' OR l.status = 'pending')
      ORDER BY c.nome ASC
    `, { loginId: req.user.id });

    console.log(`📊 [FAMILIAS] Crianças encontradas: ${children.length}`);
    children.forEach((c, idx) => {
      console.log(`   [${idx}] ${c.apelido || c.nome} → eventoId: ${c.eventoId} (${typeof c.eventoId})`);
    });
    
    // Mapear para o formato esperado pela app
    const mappedChildren = children.map(child => ({
      id: child.criancaId,
      eventoId: child.eventoId,  // ✅ ADICIONADO - importante para o app mobile!
      eventoNome: child.eventoNome,  // nome do evento da criança (seletor de eventos no app)
      nome: child.nome,
      apelido: child.apelido,
      idade: child.idade,
      // Mantidos em inglês para o frontenPulyn (web) até ele migrar
      name: child.nome,
      nickname: child.apelido,
      age: child.idade,
      profileImage: child.profileImage,
      // As telas da família leem `avatar` (mesmo campo que a criança guarda no cadastro)
      avatar: child.profileImage,
      currentScore: child.currentScore || 0,
      totalScore: child.totalScore || 0,
      teamId: child.teamId || '',
      teamName: child.teamName || 'Sem time',
      teamColor: child.teamColor || '#cccccc',
      rank: 0,
      achievements: []
    }));
    
    console.log(`✅ [FAMILIAS] Crianças mapeadas com eventoId:`);
    mappedChildren.forEach((c, idx) => {
      console.log(`   [${idx}] ${c.nickname || c.name} → eventoId: ${c.eventoId} (${c.eventoId ? '✓' : '❌'})`);
    });
    
    res.json({
      success: true,
      children: mappedChildren
    });
  } catch (err) {
    console.error('❌ [FAMILIAS] Erro ao buscar children:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/children/:id/scores', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'family') return res.status(403).json({ error: 'Acesso exclusivo para famílias' });
    const child = await queryOne(`
      SELECT c.criancaId, c.eventoId, c.nome, c.apelido, c.pontos, c.status,
             e.nome as evento_name
      FROM vinculoFamiliar l
      JOIN crianca c ON c.criancaId = l.criancaId
      JOIN evento e ON e.eventoId = c.eventoId
      WHERE l.loginId = @loginId AND l.criancaId = @childId AND l.status = 'approved'
    `, { loginId: req.user.id, childId: req.params.id });
    if (!child) return res.status(404).json({ error: 'Criança não encontrada na sua família' });

    const scores = await allQuery(`
      SELECT p.pontuacaoId, p.pontos, p.criadoEm, p.checkpointId, cp.nome as checkpoint_nome,
             p.brincadeiraId
      FROM pontuacao p
      LEFT JOIN pontoVerificacao cp ON cp.checkpointId = p.checkpointId
      WHERE p.criancaId = @childId AND p.eventoId = @eventoId
      ORDER BY p.criadoEm DESC
    `, { childId: child.criancaId, eventoId: child.eventoId });
    res.json({ child, scores });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/familias/children/:id/history
// Eventos em que a criança já esteve (todas as linhas de cadastro do mesmo perfil),
// com os pontos e a quantidade de checkpoints visitados em cada um.
router.get('/children/:id/history', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'family') return res.status(403).json({ error: 'Acesso exclusivo para famílias' });

    const child = await queryOne(`
      SELECT c.criancaId, c.perfilCriancaId, c.nome, c.apelido
      FROM vinculoFamiliar l
      JOIN crianca c ON c.criancaId = l.criancaId
      WHERE l.loginId = @loginId AND l.criancaId = @childId AND l.status = 'approved'
    `, { loginId: req.user.id, childId: req.params.id });
    if (!child) return res.status(404).json({ error: 'Criança não encontrada na sua família' });

    const eventos = await allQuery(`
      SELECT c.criancaId, c.eventoId, c.pontos, e.nome AS eventoNome, e.data AS dataEvento,
             (SELECT COUNT(DISTINCT p.checkpointId) FROM pontuacao p
               WHERE p.criancaId = c.criancaId AND p.eventoId = c.eventoId) AS checkpointsVisitados
      FROM crianca c
      JOIN evento e ON e.eventoId = c.eventoId
      WHERE c.criancaId = @criancaId
         OR (@perfilCriancaId IS NOT NULL AND c.perfilCriancaId = @perfilCriancaId)
      ORDER BY e.data DESC
    `, { criancaId: child.criancaId, perfilCriancaId: child.perfilCriancaId || null });

    res.json({
      child: { id: child.criancaId, nome: child.nome, apelido: child.apelido },
      eventos: eventos.map((ev) => ({
        criancaId: ev.criancaId,
        eventoId: ev.eventoId,
        eventoNome: ev.eventoNome,
        data: ev.dataEvento,
        pontos: Number(ev.pontos || 0),
        checkpointsVisitados: Number(ev.checkpointsVisitados || 0),
      })),
    });
  } catch (err) {
    console.error('❌ [FAMILIAS] Erro ao buscar histórico:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Pré-cadastro: eventos abertos de qualquer buffet, para o responsável escolher onde cadastrar a criança.
router.get('/eventos-abertos', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'family') return res.status(403).json({ error: 'Acesso exclusivo para famílias' });

    const eventos = await allQuery(`
      SELECT e.eventoId, e.nome, e.data, e.status, emp.nome AS buffetNome, emp.cidade AS buffetCidade
      FROM evento e
      JOIN empresa emp ON emp.empresaId = e.empresaId
      WHERE emp.nome <> 'Master Admin'
      ORDER BY e.data ASC
    `);
    res.json({ eventos: eventos.filter(eventoAberto).slice(0, 50) });
  } catch (err) {
    console.error('❌ [FAMILIAS] Erro ao listar eventos abertos:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Eventos da família (os adicionados pelo código e os das crianças vinculadas), passados e atuais.
router.get('/eventos', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'family') return res.status(403).json({ error: 'Acesso exclusivo para famílias' });

    const porConvite = await allQuery(`
      SELECT fe.eventoId, e.nome, e.data, e.status, emp.nome AS "buffetNome"
      FROM familiaEvento fe
      JOIN evento e ON e.eventoId = fe.eventoId
      LEFT JOIN empresa emp ON emp.empresaId = e.empresaId
      WHERE fe.loginId = @loginId
    `, { loginId: req.user.id });

    const porCrianca = await allQuery(`
      SELECT c.eventoId, e.nome, e.data, e.status, emp.nome AS "buffetNome",
             c.criancaId AS "criancaId", c.nome AS "criancaNome", c.apelido, COALESCE(c.pontos, 0) AS pontos
      FROM vinculoFamiliar l
      JOIN crianca c ON c.criancaId = l.criancaId
      JOIN evento e ON e.eventoId = c.eventoId
      LEFT JOIN empresa emp ON emp.empresaId = e.empresaId
      WHERE l.loginId = @loginId AND l.status IN ('approved', 'pending')
    `, { loginId: req.user.id });

    res.json({ eventos: montarEventosDaFamilia(porConvite, porCrianca) });
  } catch (err) {
    console.error('❌ [FAMILIAS] Erro ao listar eventos da família:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Pré-cadastro: crianças que o responsável cadastrou e que ainda não entraram em nenhum evento.
router.get('/perfis', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'family') return res.status(403).json({ error: 'Acesso exclusivo para famílias' });

    const perfis = await allQuery(`
      SELECT p.perfilCriancaId, p.nome, p.apelido, p.idade, p.avatar, emp.nome AS buffetNome
      FROM perfilVinculoFamiliar pv
      JOIN perfilCrianca p ON p.perfilCriancaId = pv.perfilCriancaId
      JOIN empresa emp ON emp.empresaId = pv.empresaId
      WHERE pv.loginId = @loginId
        AND NOT EXISTS (SELECT 1 FROM crianca c WHERE c.perfilCriancaId = p.perfilCriancaId)
      ORDER BY p.nome ASC
    `, { loginId: req.user.id });
    res.json({ perfis });
  } catch (err) {
    console.error('❌ [FAMILIAS] Erro ao listar pré-cadastros:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Pré-cadastro: cria o cadastro da criança no buffet do evento escolhido e liga o responsável a ele.
// O buffet vem do evento no banco, nunca do corpo da requisição.
router.post('/perfis', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'family') return res.status(403).json({ error: 'Acesso exclusivo para famílias' });

    const dados = validarPreCadastro(req.body);
    if (!dados.ok) return res.status(400).json({ error: dados.error });
    const { eventoId, nome, apelido, idade } = dados.value;

    const evento = await queryOne(
      'SELECT eventoId, empresaId, status FROM evento WHERE eventoId = @eventoId',
      { eventoId }
    );
    if (!evento) return res.status(404).json({ error: 'Evento não encontrado' });
    if (!eventoAberto(evento)) return res.status(409).json({ error: 'Este evento não está aberto para cadastro' });

    const perfilCriancaId = await withTransaction(async () => {
      const perfilId = await criarPerfil({
        empresaId: evento.empresaId,
        eventoId: null,
        nome,
        apelido,
        idade,
        avatar: getAvatarForCreate(null),
      });
      await query(
        `INSERT INTO perfilVinculoFamiliar (vinculoId, loginId, perfilCriancaId, empresaId, relacionamento)
         VALUES (@vinculoId, @loginId, @perfilCriancaId, @empresaId, 'responsável')`,
        {
          vinculoId: crypto.randomUUID(),
          loginId: req.user.id,
          perfilCriancaId: perfilId,
          empresaId: evento.empresaId,
        }
      );
      return perfilId;
    });

    res.status(201).json({ perfilCriancaId, nome, apelido, idade });
  } catch (err) {
    console.error('❌ [FAMILIAS] Erro ao pré-cadastrar criança:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * ✅ GET /api/familias/active-event
 * Retorna o evento/jogo ativo para a família
 * Baseado no eventoId da primeira criança vinculada
 */
router.get('/active-event', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'family') {
      return res.status(403).json({ error: 'Acesso exclusivo para famílias' });
    }

    console.log(`🎮 [FAMILIAS] GET /active-event chamado para login: ${req.user.id}`);

    // Evento escolhido no app (?eventoId=); sem ele, usa a primeira criança vinculada
    const eventoEscolhido = req.query.eventoId ? String(req.query.eventoId) : null;

    // Buscar a criança do evento escolhido (ou a primeira vinculada), aprovada ou pendente
    const firstChild = await queryOne(`
      SELECT c.criancaId, c.eventoId, c.nome
      FROM vinculoFamiliar l
      JOIN crianca c ON c.criancaId = l.criancaId
      WHERE l.loginId = @loginId AND (l.status = 'approved' OR l.status = 'pending')
        ${eventoEscolhido ? 'AND LOWER(c.eventoId) = LOWER(@eventoId)' : ''}
      ORDER BY c.nome ASC
      LIMIT 1
    `, eventoEscolhido ? { loginId: req.user.id, eventoId: eventoEscolhido } : { loginId: req.user.id });

    if (!firstChild || !firstChild.eventoId) {
      console.log(`⚠️ [FAMILIAS] Nenhuma criança com eventoId encontrada`);
      return res.status(404).json({ error: 'Nenhum evento associado' });
    }

    // Buscar evento com brincadeira ativa (jogo ativo)
    const activeEvent = await queryOne(`
      SELECT e.eventoId, e.nome, e.data, e.status, e.empresaId,
             e.tipoJogoAtivo, e.brincadeiraAtivaId,
             b.nome as active_game_nome, b.tipo as tipoJogo, b.descricao as game_description,
             COUNT(DISTINCT c.criancaId) as child_count,
             COUNT(DISTINCT t.timeId) as team_count,
             COUNT(DISTINCT cp.checkpointId) as checkpoint_count
      FROM evento e
      LEFT JOIN brincadeira b ON b.brincadeiraId = e.brincadeiraAtivaId
      LEFT JOIN crianca c ON c.eventoId = e.eventoId
      LEFT JOIN "time" t ON t.eventoId = e.eventoId
      LEFT JOIN pontoVerificacao cp ON cp.eventoId = e.eventoId AND cp.proposito != 'reception'
      WHERE e.eventoId = @eventoId
      GROUP BY e.eventoId, e.nome, e.data, e.status, e.empresaId,
               e.tipoJogoAtivo, e.brincadeiraAtivaId,
               b.nome, b.tipo, b.descricao
    `, { eventoId: firstChild.eventoId });

    if (!activeEvent) {
      console.log(`⚠️ [FAMILIAS] Evento não encontrado: ${firstChild.eventoId}`);
      return res.status(404).json({ error: 'Evento não encontrado' });
    }

    console.log(`✅ [FAMILIAS] Evento ativo encontrado: ${activeEvent.nome}`);
    console.log(`   🎮 Jogo ativo: ${activeEvent.active_game_nome || 'Nenhum jogo ativo'}`);

    // Montar resposta com info do jogo ativo
    res.json({
      success: true,
      activeGame: {
        id: activeEvent.eventoId,
        nome: activeEvent.nome,
        // Mantido em inglês para o frontenPulyn (web) até ele migrar
        name: activeEvent.nome,
        date: activeEvent.data,
        status: activeEvent.status,
        // 🎮 Info do jogo ativo
        gameId: activeEvent.brincadeiraAtivaId || null,
        gameName: activeEvent.active_game_nome || 'Nenhum jogo em andamento',
        gameType: activeEvent.tipoJogoAtivo || 'none',
        gameTypeDetail: activeEvent.tipoJogo || null,
        gameDescription: activeEvent.game_description || null,
        // 📊 Contadores
        childCount: activeEvent.child_count || 0,
        teamCount: activeEvent.team_count || 0,
        checkpointCount: activeEvent.checkpoint_count || 0,
        isActive: activeEvent.status === 'active',
        hasActiveGame: !!activeEvent.brincadeiraAtivaId
      }
    });
  } catch (error) {
    console.error('❌ [FAMILIAS] Erro ao buscar evento ativo:', error);
    res.status(500).json({ error: 'Erro ao buscar evento ativo', details: error.message });
  }
});

/**
 * ✅ GET /api/familias/notifications
 * Lista notificações da família
 * Implementação básica: por enquanto retorna lista vazia
 * TODO: Implementar sistema de notificações completo
 */
router.get('/notifications', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'family') {
      return res.status(403).json({ error: 'Acesso exclusivo para famílias' });
    }

    // ✅ Por enquanto retorna lista vazia
    // TODO: Implementar tabela de notificações com evento de criança
    res.json({
      success: true,
      notifications: []
    });
  } catch (error) {
    console.error('❌ Erro ao buscar notificações:', error);
    res.status(500).json({ error: 'Erro ao buscar notificações', details: error.message });
  }
});

/**
 * ✅ GET /api/familias/children/:id/achievements
 * Lista conquista de uma criança
 * Implementação básica: por enquanto retorna lista vazia
 * TODO: Implementar sistema de achievements/badges completo
 */
router.get('/children/:id/achievements', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'family') {
      return res.status(403).json({ error: 'Acesso exclusivo para famílias' });
    }

    const { id } = req.params;

    // Verificar se pais tem acesso a essa criança
    const hasAccess = await queryOne(
      `SELECT 1 FROM vinculoFamiliar
       WHERE loginId = @family_id AND criancaId = @criancaId AND status = 'active'`,
      { family_id: req.user.id, criancaId: id }
    );

    if (!hasAccess) {
      return res.status(403).json({ error: 'Você não tem permissão para ver dados desta criança' });
    }

    // ✅ Por enquanto retorna lista vazia
    // TODO: Implementar tabela de conquista/badges com evento
    res.json({
      success: true,
      achievements: []
    });
  } catch (error) {
    console.error('❌ Erro ao buscar conquista:', error);
    res.status(500).json({ error: 'Erro ao buscar conquista', details: error.message });
  }
});

module.exports = router;
