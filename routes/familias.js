const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { query, queryOne, allQuery } = require('../database');
const { verifyToken, isMaster } = require('../utils/middleware');
const { planInviteRegistration, describeRegistrationResult } = require('../utils/familyInviteRules');
const { criarPerfil } = require('../utils/perfilCrianca');

const STAFF_ROLES = ['admin', 'reception', 'master'];
const FRONTEND_URL = String(process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function isStaff(req) {
  return STAFF_ROLES.includes(req.user?.role);
}

async function getInvite(token) {
  if (!token || token.length < 32) return null;
  const invite = await queryOne(`
    SELECT i.*, e.nome as evento_nome, e.data as evento_data,
           c.criancaId as linked_child_id, c.nome as linked_child_name
    FROM conviteFamilia i
    JOIN evento e ON e.eventoId = i.eventoId
    LEFT JOIN crianca c ON c.criancaId = i.criancaId
    WHERE i.hashToken = @tokenHash
  `, { tokenHash: hashToken(token) });
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
    event: { id: invite.eventoId, name: invite.evento_nome, date: invite.evento_data },
    child: invite.linked_child_id ? { id: invite.linked_child_id, name: invite.linked_child_name } : null,
    email: invite.email || null,
    expiresAt: invite.expiramEm,
  };
}

// Validar convite sem revelar o token armazenado ou dados internos.
router.get('/invites/:token', async (req, res) => {
  try {
    const invite = await getInvite(req.params.token);
    if (!invite) return res.status(404).json({ error: 'Convite não encontrado' });
    if (invite.status !== 'pending') {
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

    const rawToken = crypto.randomBytes(32).toString('hex');
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
      tokenHash: hashToken(rawToken),
      expiresAt,
      createdBy: req.user.id,
    });

    res.status(201).json({
      id,
      token: rawToken,
      inviteUrl: `${FRONTEND_URL}/family/invite/${rawToken}`,
      expiresAt: expiresAt.toISOString(),
      event: { id: evento.eventoId, name: evento.nome, date: evento.data },
    });
  } catch (err) {
    console.error('❌ Erro ao criar convite familiar:', err);
    res.status(500).json({ error: err.message });
  }
});

// Cadastro público: a conta e o vínculo nascem pendentes de aprovação.
router.post('/invites/:token/register', async (req, res) => {
  let invite = null;
  try {
    invite = await getInvite(req.params.token);
    if (!invite) return res.status(404).json({ error: 'Convite não encontrado' });
    if (invite.status !== 'pending') {
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
    `, { id: invite.id });
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
            VALUES (@id, @eventoId, @empresaId, NULL, @childNome, @apelido, @age, '👤', 0, 'pending', @perfilId)
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
            (vinculoId, loginId, criancaId, empresaId, relacionamento, status)
          VALUES (@id, @loginId, @childId, @empresaId, @relacionamento, 'pending')
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
      `, { inviteId: invite.id });

      const result = describeRegistrationResult({
        childless: plan.childless,
        plannedLoginStatus: plan.loginStatus,
        existingLoginStatus: existingLogin?.status,
      });

      return res.status(201).json({
        success: true,
        message: result.message,
        status: result.status,
        childId: childIds[0],
        childIds,
        childrenCount: childIds.length,
      });
    } catch (registrationError) {
      await query(`UPDATE conviteFamilia SET status = 'pending' WHERE conviteId = @id AND status = 'processing'`, { id: invite.id }).catch(() => {});
      throw registrationError;
    }
  } catch (err) {
    console.error('❌ Erro ao registrar família:', err);
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

router.get('/pending', verifyToken, async (req, res) => {
  try {
    if (!isStaff(req)) return res.status(403).json({ error: 'Acesso negado' });
    const pending = await listFamilyLinks('pending', req.query.eventoId || null, req);
    res.json(pending);
  } catch (err) {
    console.error('❌ Erro ao listar aprovações familiares:', err);
    res.status(500).json({ error: err.message });
  }
});

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

router.post('/links/:linkId/approve', verifyToken, async (req, res) => {
  try {
    if (!isStaff(req)) return res.status(403).json({ error: 'Acesso negado' });
    const result = await getLinkForStaff(req.params.linkId, req);
    if (result.error) return res.status(result.status).json({ error: result.error });
    const { link } = result;
    if (link.status === 'approved') return res.json({ ok: true, status: 'approved', message: 'Solicitação já aprovada' });
    if (link.status !== 'pending') return res.status(409).json({ error: 'Solicitação já foi rejeitada' });

    await query(`
      UPDATE vinculoFamiliar
      SET status = 'approved', aprovadoPor = @approvedBy, aprovadoEm = GETDATE()
      WHERE vinculoId = @linkId AND status = 'pending'
    `, { linkId: link.id, approvedBy: req.user.id });
    await query(`UPDATE login SET status = 'active', dataAtualizacao = GETDATE() WHERE loginId = @loginId`, { loginId: link.loginId });
    await query(`UPDATE crianca SET status = 'active' WHERE criancaId = @childId AND status = 'pending'`, { childId: link.criancaId });

    res.json({ ok: true, status: 'approved', message: 'Família aprovada com sucesso' });
  } catch (err) {
    console.error('❌ Erro ao aprovar família:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/links/:linkId/reject', verifyToken, async (req, res) => {
  try {
    if (!isStaff(req)) return res.status(403).json({ error: 'Acesso negado' });
    const result = await getLinkForStaff(req.params.linkId, req);
    if (result.error) return res.status(result.status).json({ error: result.error });
    const { link } = result;
    if (link.status === 'rejected') return res.json({ ok: true, status: 'rejected', message: 'Solicitação já rejeitada' });
    if (link.status === 'approved') return res.status(409).json({ error: 'Uma solicitação aprovada não pode ser rejeitada' });

    await query(`
      UPDATE vinculoFamiliar
      SET status = 'rejected', rejeitadoEm = GETDATE()
      WHERE vinculoId = @linkId AND status = 'pending'
    `, { linkId: link.id });
    const approvedLink = await queryOne(`
      SELECT vinculoId FROM vinculoFamiliar
      WHERE criancaId = @childId AND status = 'approved'
    `, { childId: link.criancaId });
    if (!approvedLink) {
      await query(`UPDATE crianca SET status = 'inactive' WHERE criancaId = @childId AND status = 'pending'`, { childId: link.criancaId });
    }
    const approvedSibling = await queryOne(`
      SELECT vinculoId FROM vinculoFamiliar WHERE loginId = @loginId AND status = 'approved'
    `, { loginId: link.loginId });
    if (!approvedSibling) {
      await query(`UPDATE login SET status = 'inactive', dataAtualizacao = GETDATE() WHERE loginId = @loginId AND status = 'pending'`, { loginId: link.loginId });
    }

    res.json({ ok: true, status: 'rejected', message: 'Solicitação rejeitada' });
  } catch (err) {
    console.error('❌ Erro ao rejeitar família:', err);
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
    res.json({ id: family.loginId, name: family.nomeFamilia || family.email, email: family.email, status: family.status, empresaId: family.empresaId });
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
             t.timeId as "teamId", t.nome as "teamName", t.cor as "teamColor", t.pontos as team_points
      FROM vinculoFamiliar l
      JOIN crianca c ON c.criancaId = l.criancaId
      LEFT JOIN "time" t ON t.timeId = c.timeId
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
      name: child.nome,
      nickname: child.apelido,
      age: child.idade,
      profileImage: child.profileImage,
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

    // Buscar primeira criança vinculada (aprovada ou pendente)
    const firstChild = await queryOne(`
      SELECT c.criancaId, c.eventoId, c.nome
      FROM vinculoFamiliar l
      JOIN crianca c ON c.criancaId = l.criancaId
      WHERE l.loginId = @loginId AND (l.status = 'approved' OR l.status = 'pending')
      ORDER BY c.nome ASC
      LIMIT 1
    `, { loginId: req.user.id });

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
