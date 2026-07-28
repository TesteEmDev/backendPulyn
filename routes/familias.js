const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { query, queryOne, allQuery } = require('../database');
const { verifyToken, isMaster } = require('../utils/middleware');

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
    SELECT i.*, e.name as evento_nome, e.date as evento_data,
           c.id as linked_child_id, c.name as linked_child_name
    FROM family_invites i
    JOIN eventos e ON e.id = i.evento_id
    LEFT JOIN criancas c ON c.id = i.crianca_id
    WHERE i.token_hash = @tokenHash
  `, { tokenHash: hashToken(token) });
  if (!invite) return null;
  if (invite.status === 'pending' && new Date(invite.expires_at) <= new Date()) {
    await query(`UPDATE family_invites SET status = 'expired' WHERE id = @id AND status = 'pending'`, { id: invite.id });
    invite.status = 'expired';
  }
  return invite;
}

async function getEventForUser(eventoId, req) {
  const evento = await queryOne(
    'SELECT id, empresa_id, name, date FROM eventos WHERE id = @eventoId',
    { eventoId }
  );
  if (!evento) return { error: 'Evento não encontrado', status: 404 };
  if (!isMaster(req) && String(evento.empresa_id) !== String(req.user.empresa_id)) {
    return { error: 'Acesso negado: evento não pertence à sua empresa', status: 403 };
  }
  return { evento };
}

function publicInvite(invite) {
  return {
    valid: invite.status === 'pending',
    status: invite.status,
    event: { id: invite.evento_id, name: invite.evento_nome, date: invite.evento_data },
    child: invite.linked_child_id ? { id: invite.linked_child_id, name: invite.linked_child_name } : null,
    email: invite.email || null,
    expiresAt: invite.expires_at,
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
        `SELECT id FROM criancas WHERE id = @criancaId AND evento_id = @eventoId AND empresa_id = @empresaId`,
        { criancaId, eventoId, empresaId: evento.empresa_id }
      );
      if (!child) return res.status(404).json({ error: 'Criança não encontrada neste evento' });
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const days = Math.min(Math.max(Number(expiresInDays) || 7, 1), 30);
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    const id = crypto.randomUUID();
    await query(`
      INSERT INTO family_invites
        (id, empresa_id, evento_id, crianca_id, email, token_hash, status, expires_at, created_by)
      VALUES (@id, @empresaId, @eventoId, @criancaId, @email, @tokenHash, 'pending', @expiresAt, @createdBy)
    `, {
      id,
      empresaId: evento.empresa_id,
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
      event: { id: evento.id, name: evento.name, date: evento.date },
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

    const { name, parentName, email, password, relationship = 'responsável', child } = req.body;
    const familyName = String(parentName || name || '').trim();
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!familyName || !normalizedEmail || !password) {
      return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios' });
    }
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      return res.status(400).json({ error: 'E-mail inválido' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: 'Senha deve ter no mínimo 6 caracteres' });
    }
    if (!invite.linked_child_id && (!child?.name || !String(child.name).trim())) {
      return res.status(400).json({ error: 'Informe o nome da criança' });
    }

    const existingLogin = await queryOne(
      'SELECT id, role, empresa_id, status, password FROM logins WHERE LOWER(email) = @email',
      { email: normalizedEmail }
    );
    if (existingLogin && (existingLogin.role !== 'family' || String(existingLogin.empresa_id) !== String(invite.empresa_id))) {
      return res.status(409).json({ error: 'Este e-mail já pertence a outra conta. Use outro e-mail.' });
    }
    if (existingLogin && !['active', 'pending'].includes(existingLogin.status)) {
      return res.status(409).json({ error: 'Esta conta familiar não está disponível para novos vínculos.' });
    }
    if (existingLogin && existingLogin.password !== Buffer.from(String(password)).toString('base64')) {
      return res.status(409).json({ error: 'A senha informada não confere com a conta familiar existente.' });
    }

    const claimed = await query(`
      UPDATE family_invites SET status = 'processing'
      WHERE id = @id AND status = 'pending' AND expires_at > GETDATE()
    `, { id: invite.id });
    if (!claimed.rowsAffected?.[0]) {
      return res.status(409).json({ error: 'Convite já está sendo utilizado ou expirou' });
    }

    try {
      const loginId = existingLogin?.id || crypto.randomUUID();
      if (!existingLogin) {
        await query(`
          INSERT INTO logins (id, empresa_id, email, password, family_name, role, status, data_criacao)
          VALUES (@id, @empresaId, @email, @password, @familyName, 'family', 'pending', GETDATE())
        `, {
          id: loginId,
          empresaId: invite.empresa_id,
          email: normalizedEmail,
          password: Buffer.from(String(password)).toString('base64'),
          familyName,
        });
      }

      let childId = invite.linked_child_id;
      if (!childId) {
        childId = crypto.randomUUID();
        await query(`
          INSERT INTO criancas
            (id, evento_id, empresa_id, time_id, name, nickname, age, avatar, scores, status)
          VALUES (@id, @eventoId, @empresaId, NULL, @childName, @nickname, @age, '👤', 0, 'pending')
        `, {
          id: childId,
          eventoId: invite.evento_id,
          empresaId: invite.empresa_id,
          childName: String(child.name).trim(),
          nickname: String(child.nickname || child.name).trim(),
          age: Number.isFinite(Number(child.age)) ? Number(child.age) : null,
        });
      }

      const linkId = crypto.randomUUID();
      await query(`
        INSERT INTO family_child_links
          (id, login_id, crianca_id, empresa_id, relationship, status)
        VALUES (@id, @loginId, @childId, @empresaId, @relationship, 'pending')
      `, {
        id: linkId,
        loginId,
        childId,
        empresaId: invite.empresa_id,
        relationship: String(relationship).trim().slice(0, 50) || 'responsável',
      });

      await query(`
        UPDATE family_invites SET status = 'used', used_at = GETDATE()
        WHERE id = @inviteId AND status = 'processing'
      `, { inviteId: invite.id });

      return res.status(201).json({
        success: true,
        message: 'Cadastro realizado. Aguarde a aprovação da recepção.',
        status: 'pending',
        childId,
      });
    } catch (registrationError) {
      await query(`UPDATE family_invites SET status = 'pending' WHERE id = @id AND status = 'processing'`, { id: invite.id }).catch(() => {});
      throw registrationError;
    }
  } catch (err) {
    console.error('❌ Erro ao registrar família:', err);
    res.status(500).json({ error: err.message });
  }
});
// Pendências visíveis apenas para recepção/admin/master.
router.get('/pending', verifyToken, async (req, res) => {
  try {
    if (!isStaff(req)) return res.status(403).json({ error: 'Acesso negado' });
    const eventoId = req.query.evento_id || null;
    const pending = await allQuery(`
      SELECT l.id as link_id, l.status as link_status, l.relationship, l.created_at as requested_at,
             u.id as login_id, u.email, u.family_name,
             c.id as crianca_id, c.name as crianca_name, c.nickname, c.age, c.status as crianca_status,
             e.id as evento_id, e.name as evento_name, e.date as evento_date,
             t.id as time_id, t.name as time_name, t.color as time_color
      FROM family_child_links l
      JOIN logins u ON u.id = l.login_id
      JOIN criancas c ON c.id = l.crianca_id
      JOIN eventos e ON e.id = c.evento_id
      LEFT JOIN times t ON t.id = c.time_id
      WHERE l.status = 'pending'
        AND (CAST(@eventoId AS VARCHAR(36)) IS NULL OR e.id = CAST(@eventoId AS VARCHAR(36)))
        AND (@isMaster = 1 OR l.empresa_id = @empresaId)
      ORDER BY l.created_at ASC
    `, { eventoId, empresaId: req.user.empresa_id, isMaster: isMaster(req) ? 1 : 0 });
    res.json(pending);
  } catch (err) {
    console.error('❌ Erro ao listar aprovações familiares:', err);
    res.status(500).json({ error: err.message });
  }
});

async function getLinkForStaff(linkId, req) {
  const link = await queryOne(
    `SELECT l.*, c.name as crianca_name, c.status as crianca_status
     FROM family_child_links l
     JOIN criancas c ON c.id = l.crianca_id
     WHERE l.id = @linkId`,
    { linkId }
  );
  if (!link) return { error: 'Solicitação não encontrada', status: 404 };
  if (!isMaster(req) && String(link.empresa_id) !== String(req.user.empresa_id)) {
    return { error: 'Acesso negado', status: 403 };
  }
  return { link };
}

router.post('/links/:linkId/approve', verifyToken, async (req, res) => {
  try {
    if (!isStaff(req)) return res.status(403).json({ error: 'Acesso negado' });
    const result = await getLinkForStaff(req.params.linkId, req);
    if (result.error) return res.status(result.status).json({ error: result.error });
    const { link } = result;
    if (link.status === 'approved') return res.json({ ok: true, status: 'approved', message: 'Solicitação já aprovada' });
    if (link.status !== 'pending') return res.status(409).json({ error: 'Solicitação já foi rejeitada' });

    await query(`
      UPDATE family_child_links
      SET status = 'approved', approved_by = @approvedBy, approved_at = GETDATE()
      WHERE id = @linkId AND status = 'pending'
    `, { linkId: link.id, approvedBy: req.user.id });
    await query(`UPDATE logins SET status = 'active', data_atualizacao = GETDATE() WHERE id = @loginId`, { loginId: link.login_id });
    await query(`UPDATE criancas SET status = 'active' WHERE id = @childId AND status = 'pending'`, { childId: link.crianca_id });

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
      UPDATE family_child_links
      SET status = 'rejected', rejected_at = GETDATE()
      WHERE id = @linkId AND status = 'pending'
    `, { linkId: link.id });
    const approvedLink = await queryOne(`
      SELECT id FROM family_child_links
      WHERE crianca_id = @childId AND status = 'approved'
    `, { childId: link.crianca_id });
    if (!approvedLink) {
      await query(`UPDATE criancas SET status = 'inactive' WHERE id = @childId AND status = 'pending'`, { childId: link.crianca_id });
    }
    const approvedSibling = await queryOne(`
      SELECT id FROM family_child_links WHERE login_id = @loginId AND status = 'approved'
    `, { loginId: link.login_id });
    if (!approvedSibling) {
      await query(`UPDATE logins SET status = 'inactive', data_atualizacao = GETDATE() WHERE id = @loginId AND status = 'pending'`, { loginId: link.login_id });
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
      SELECT id, email, family_name, status, empresa_id
      FROM logins WHERE id = @loginId AND role = 'family'
    `, { loginId: req.user.id });
    if (!family) return res.status(404).json({ error: 'Conta familiar não encontrada' });
    res.json({ id: family.id, name: family.family_name || family.email, email: family.email, status: family.status, empresa_id: family.empresa_id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/children', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'family') return res.status(403).json({ error: 'Acesso exclusivo para famílias' });
    const children = await allQuery(`
      SELECT c.id, c.evento_id, c.name, c.nickname, c.age, c.avatar, c.bracelet_code,
             c.scores, c.status, l.relationship,
             e.name as evento_name, e.date as evento_date, e.status as evento_status,
             t.id as time_id, t.name as time_name, t.color as time_color, t.points as time_points
      FROM family_child_links l
      JOIN criancas c ON c.id = l.crianca_id
      JOIN eventos e ON e.id = c.evento_id
      LEFT JOIN times t ON t.id = c.time_id
      WHERE l.login_id = @loginId AND l.status = 'approved'
      ORDER BY e.date DESC, c.name ASC
    `, { loginId: req.user.id });
    res.json(children);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/children/:id/scores', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'family') return res.status(403).json({ error: 'Acesso exclusivo para famílias' });
    const child = await queryOne(`
      SELECT c.id, c.evento_id, c.name, c.nickname, c.scores, c.status,
             e.name as evento_name
      FROM family_child_links l
      JOIN criancas c ON c.id = l.crianca_id
      JOIN eventos e ON e.id = c.evento_id
      WHERE l.login_id = @loginId AND l.crianca_id = @childId AND l.status = 'approved'
    `, { loginId: req.user.id, childId: req.params.id });
    if (!child) return res.status(404).json({ error: 'Criança não encontrada na sua família' });

    const scores = await allQuery(`
      SELECT p.id, p.points, p.created_at, p.checkpoint_id, cp.name as checkpoint_name,
             p.brincadeira_id
      FROM pontuacoes p
      LEFT JOIN checkpoints cp ON cp.id = p.checkpoint_id
      WHERE p.crianca_id = @childId AND p.evento_id = @eventoId
      ORDER BY p.created_at DESC
    `, { childId: child.id, eventoId: child.evento_id });
    res.json({ child, scores });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
