// routes/family-linking.js - Vinculação de pais/responsáveis aos filhos via QR Code
const express = require('express');
const router = express.Router();
const { query, queryOne, withTransaction } = require('../database');
const { createQRCodeForChild } = require('../utils/qrcode');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'sua-chave-secreta-super-segura-2026';

// Middleware para validar token JWT
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token inválido ou expirado' });
    }
    req.user = user;
    next();
  });
}

/**
 * RECEPCÇÃO: POST /api/family/qrcode/generate
 * Gera um QR Code único para uma criança
 * Este QR Code será escaneado pelos pais no app mobile
 */
router.post('/qrcode/generate', authenticateToken, async (req, res) => {
  try {
    const { criancaId, eventoId } = req.body;

    // Validar que quem está gerando é recepcionista ou admin
    if (!['reception', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Apenas recepção pode gerar QR codes' });
    }

    if (!criancaId || !eventoId) {
      return res.status(400).json({ error: 'criancaId e eventoId são obrigatórios' });
    }

    // Verificar se criança existe
    const crianca = await queryOne(
      `SELECT c.id, c.name, c.nickname, c.evento_id, e.nome as evento_nome
       FROM criancas c
       JOIN eventos e ON c.evento_id = e.id
       WHERE c.id = @id AND c.evento_id = @evento_id AND c.empresa_id = @empresa_id`,
      { id: criancaId, evento_id: eventoId, empresa_id: req.user.empresa_id }
    );

    if (!crianca) {
      return res.status(404).json({ error: 'Criança não encontrada neste evento' });
    }

    // Gerar QR code
    const { qrCode, trackingUrl, image } = await createQRCodeForChild(
      criancaId,
      process.env.FRONTEND_URL || 'http://localhost:3000'
    );

    // Salvar código QR no banco (para validação posterior)
    await query(
      `INSERT INTO family_linking_codes (id, crianca_id, evento_id, empresa_id, qr_code_value, tracking_url, created_at, expires_at, status)
       VALUES (NEWID(), @crianca_id, @evento_id, @empresa_id, @qr_code_value, @tracking_url, GETDATE(), DATEADD(hour, 24, GETDATE()), 'active')`,
      {
        crianca_id: criancaId,
        evento_id: eventoId,
        empresa_id: req.user.empresa_id,
        qr_code_value: qrCode,
        tracking_url: trackingUrl
      }
    );

    console.log(`✅ QR Code gerado para criança ${crianca.nickname} - Código: ${qrCode}`);

    res.json({
      success: true,
      qrCode,
      trackingUrl,
      crianca: {
        id: crianca.id,
        name: crianca.name,
        nickname: crianca.nickname,
        evento: crianca.evento_nome
      },
      // Retornar imagem em base64
      qrCodeImage: `data:image/png;base64,${image.toString('base64')}`
    });

  } catch (error) {
    console.error('❌ Erro ao gerar QR code:', error);
    res.status(500).json({ error: 'Erro ao gerar QR code', details: error.message });
  }
});

/**
 * MOBILE: POST /api/family/qrcode/validate
 * Valida um QR code e vincula o pais/responsável à criança
 * Chamado quando pais escaneia o código no app
 */
router.post('/qrcode/validate', authenticateToken, async (req, res) => {
  try {
    const { qrCodeValue } = req.body;

    // Quem é o usuário chamando? Precisa ser role 'family'
    if (req.user.role !== 'family') {
      return res.status(403).json({ error: 'Apenas usuários com perfil familiar podem vincular crianças' });
    }

    if (!qrCodeValue) {
      return res.status(400).json({ error: 'qrCodeValue é obrigatório' });
    }

    // Buscar código QR ativo
    const codigoVinculacao = await queryOne(
      `SELECT flc.*, c.name, c.nickname, c.age, e.nome as evento_nome
       FROM family_linking_codes flc
       JOIN criancas c ON flc.crianca_id = c.id
       JOIN eventos e ON flc.evento_id = e.id
       WHERE flc.qr_code_value = @qr_code_value 
         AND flc.status = 'active'
         AND flc.expires_at > GETDATE()`,
      { qr_code_value: qrCodeValue }
    );

    if (!codigoVinculacao) {
      return res.status(404).json({
        error: 'Código QR inválido ou expirado',
        code: 'INVALID_QR_CODE'
      });
    }

    // Verificar se já está vinculado (evitar duplicatas)
    const jaBemVinculado = await queryOne(
      `SELECT id FROM family_child_links
       WHERE family_login_id = @family_id 
         AND crianca_id = @crianca_id`,
      { family_id: req.user.id, crianca_id: codigoVinculacao.crianca_id }
    );

    if (jaBemVinculado) {
      return res.status(400).json({
        error: 'Você já está vinculado a esta criança',
        code: 'ALREADY_LINKED'
      });
    }

    // Criar vinculação em transação
    await withTransaction(async (tx) => {
      // 1. Criar link family <-> criança
      await tx.query(
        `INSERT INTO family_child_links (id, family_login_id, crianca_id, empresa_id, linked_at, status)
         VALUES (NEWID(), @family_id, @crianca_id, @empresa_id, GETDATE(), 'active')`,
        {
          family_id: req.user.id,
          crianca_id: codigoVinculacao.crianca_id,
          empresa_id: codigoVinculacao.empresa_id
        }
      );

      // 2. Marcar QR code como usado
      await tx.query(
        `UPDATE family_linking_codes
         SET status = 'used', used_at = GETDATE(), used_by_login_id = @family_id
         WHERE id = @id`,
        { id: codigoVinculacao.id, family_id: req.user.id }
      );
    });

    console.log(`✅ Pais/Responsável ${req.user.email} vinculado à criança ${codigoVinculacao.nickname}`);

    res.json({
      success: true,
      message: 'Criança vinculada com sucesso!',
      linkedChild: {
        id: codigoVinculacao.crianca_id,
        name: codigoVinculacao.name,
        nickname: codigoVinculacao.nickname,
        age: codigoVinculacao.age,
        evento: codigoVinculacao.evento_nome
      }
    });

  } catch (error) {
    console.error('❌ Erro ao validar QR code:', error);
    res.status(500).json({ error: 'Erro ao validar QR code', details: error.message });
  }
});

/**
 * MOBILE: GET /api/family/children
 * Lista todas as crianças vinculadas ao pais/responsável autenticado
 */
router.get('/children', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'family') {
      return res.status(403).json({ error: 'Apenas usuários com perfil familiar podem acessar' });
    }

    const children = await query(
      `SELECT fcl.id as link_id, c.id as crianca_id, c.name, c.nickname, c.age, 
              c.bracelet_code, t.name as time_name, t.color as time_color,
              e.id as evento_id, e.nome as evento_nome, e.[date], e.[status]
       FROM family_child_links fcl
       JOIN criancas c ON fcl.crianca_id = c.id
       LEFT JOIN times t ON c.time_id = t.id
       JOIN eventos e ON c.evento_id = e.id
       WHERE fcl.family_login_id = @family_id AND fcl.status = 'active'
       ORDER BY e.[date] DESC, c.name ASC`,
      { family_id: req.user.id }
    );

    res.json({
      success: true,
      children: children.recordset || []
    });

  } catch (error) {
    console.error('❌ Erro ao listar crianças:', error);
    res.status(500).json({ error: 'Erro ao listar crianças vinculadas', details: error.message });
  }
});

/**
 * MOBILE: GET /api/family/children/:criancaId/performance
 * Retorna pontuação e desempenho de uma criança específica
 */
router.get('/children/:criancaId/performance', authenticateToken, async (req, res) => {
  try {
    const { criancaId } = req.params;

    if (req.user.role !== 'family') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    // Verificar se pais está vinculado à criança
    const linked = await queryOne(
      `SELECT 1 FROM family_child_links
       WHERE family_login_id = @family_id AND crianca_id = @crianca_id AND status = 'active'`,
      { family_id: req.user.id, crianca_id: criancaId }
    );

    if (!linked) {
      return res.status(403).json({ error: 'Você não tem permissão para ver dados desta criança' });
    }

    // Buscar desempenho
    const crianca = await queryOne(
      `SELECT c.id, c.name, c.nickname, c.age, c.bracelet_code,
              c.scores, c.achievements, t.name as time_name, t.color as time_color,
              e.nome as evento_nome, e.[date], e.[status]
       FROM criancas c
       LEFT JOIN times t ON c.time_id = t.id
       JOIN eventos e ON c.evento_id = e.id
       WHERE c.id = @id`,
      { id: criancaId }
    );

    if (!crianca) {
      return res.status(404).json({ error: 'Criança não encontrada' });
    }

    // Buscar histórico de pontuações
    const scoreHistory = await query(
      `SELECT TOP 50 checkpoint_id, points, created_at
       FROM pontuacoes
       WHERE crianca_id = @crianca_id
       ORDER BY created_at DESC`,
      { crianca_id: criancaId }
    );

    res.json({
      success: true,
      crianca: {
        id: crianca.id,
        name: crianca.name,
        nickname: crianca.nickname,
        age: crianca.age,
        totalScore: crianca.scores || 0,
        team: {
          name: crianca.time_name,
          color: crianca.time_color
        },
        event: {
          name: crianca.evento_nome,
          date: crianca.date,
          status: crianca.status
        }
      },
      scoreHistory: scoreHistory.recordset || []
    });

  } catch (error) {
    console.error('❌ Erro ao buscar desempenho:', error);
    res.status(500).json({ error: 'Erro ao buscar desempenho', details: error.message });
  }
});

/**
 * MOBILE: DELETE /api/family/children/:criancaId/unlink
 * Remove a vinculação entre pais e criança
 */
router.delete('/children/:criancaId/unlink', authenticateToken, async (req, res) => {
  try {
    const { criancaId } = req.params;

    if (req.user.role !== 'family') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const result = await query(
      `UPDATE family_child_links
       SET status = 'inactive', unlinked_at = GETDATE()
       WHERE family_login_id = @family_id AND crianca_id = @crianca_id`,
      { family_id: req.user.id, crianca_id: criancaId }
    );

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Vinculação não encontrada' });
    }

    console.log(`✅ Vinculação removida: ${req.user.email} -> ${criancaId}`);

    res.json({
      success: true,
      message: 'Criança desvinculada com sucesso'
    });

  } catch (error) {
    console.error('❌ Erro ao remover vinculação:', error);
    res.status(500).json({ error: 'Erro ao remover vinculação', details: error.message });
  }
});

module.exports = router;
