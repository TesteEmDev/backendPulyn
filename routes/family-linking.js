// routes/family-linking.js - Vinculação de pais/responsáveis aos filhos via QR Code
const express = require('express');
const router = express.Router();
const { query, queryOne, withTransaction } = require('../database');
const { verifyToken } = require('../utils/middleware');

/**
 * MOBILE: POST /api/family/qrcode/validate
 * Valida um QR code e vincula o pais/responsável à criança
 * Chamado quando pais escaneia o código no app
 */
router.post('/qrcode/validate', verifyToken, async (req, res) => {
  console.log('📞 [FAMILY-LINKING] POST /qrcode/validate chamado');
  console.log(`   Usuario: ${req.user?.email || 'ANÔNIMO'}`);
  console.log(`   Role: ${req.user?.role || 'NENHUMA'}`);
  
  try {
    const { qrCodeValue } = req.body;
    console.log(`   QR Code recebido (raw): ${qrCodeValue}`);
    console.log(`   QR Code tipo: ${typeof qrCodeValue}`);
    
    // Quem é o usuário chamando? Precisa ser role 'family'
    if (req.user.role !== 'family') {
      console.log(`   ❌ Acesso negado: role é ${req.user.role}, esperado 'family'`);
      return res.status(403).json({ error: 'Apenas usuários com perfil familiar podem vincular crianças' });
    }

    if (!qrCodeValue) {
      console.log(`   ❌ QR Code vazio`);
      return res.status(400).json({ error: 'qrCodeValue é obrigatório' });
    }

    // 🔍 Extrair o código QR do que foi escaneado
    // O QR agora contém a URL de rastreamento: http://localhost:3000/child-performance/base64token
    // Token = base64(criancaId:qrCode)
    // Logo, precisamos extrair o código da URL
    
    let codigoQR = null;
    
    // Tenta extrair de URL
    if (typeof qrCodeValue === 'string' && qrCodeValue.startsWith('http')) {
      console.log(`   🔗 Detectado como URL, extraindo token...`);
      try {
        // Extrair token da URL: /child-performance/{token}
        const urlObj = new URL(qrCodeValue);
        const pathParts = urlObj.pathname.split('/');
        const token = pathParts[pathParts.length - 1];
        
        // Decodificar base64: criancaId:qrCode
        const decoded = Buffer.from(token, 'base64').toString('utf-8');
        const parts = decoded.split(':');
        
        if (parts.length === 2) {
          codigoQR = parts[1]; // O código QR está no segundo índice
          console.log(`   ✅ Código extraído de URL: ${codigoQR}`);
        }
      } catch (e) {
        console.log(`   ⚠️  Erro ao extrair token de URL: ${e.message}`);
      }
    }
    
    // Se não conseguiu extrair, pode ser que esteja como string direto
    if (!codigoQR) {
      if (typeof qrCodeValue === 'string' && qrCodeValue.startsWith('PULYN-')) {
        codigoQR = qrCodeValue;
        console.log(`   ✅ Usando como código direto: ${codigoQR}`);
      } else {
        console.log(`   ❌ Não consegui extrair código válido de: ${qrCodeValue}`);
        return res.status(400).json({
          error: 'Formato de QR Code inválido. Esperado: URL ou PULYN-XXXXXXXX',
          code: 'INVALID_QR_FORMAT'
        });
      }
    }

    console.log(`   🔍 Buscando código QR no banco: "${codigoQR}"`);
    // Buscar código QR ativo
    const codigoVinculacao = await queryOne(
      `SELECT flc.*, c.name, c.nickname, c.age, e.name as evento_nome, e.id as evento_id, c.empresa_id
       FROM family_linking_codes flc
       JOIN criancas c ON flc.crianca_id = c.id
       JOIN eventos e ON flc.evento_id = e.id
       WHERE flc.qr_code_value = @codigoQR 
         AND flc.status = 'active'
         AND flc.expires_at > CURRENT_TIMESTAMP`,
      { codigoQR }
    );

    console.log(`   ✅ Query executada. Resultado:`, codigoVinculacao ? 'Encontrado' : 'Não encontrado');

    if (!codigoVinculacao) {
      console.log(`   ❌ Código QR não encontrado ou expirado`);
      return res.status(404).json({
        error: 'Código QR inválido ou expirado',
        code: 'INVALID_QR_CODE'
      });
    }

    console.log(`   ✅ Código encontrado para criança: ${codigoVinculacao.nickname}`);

    // Verificar se já está vinculado (evitar duplicatas)
    const jaBemVinculado = await queryOne(
      `SELECT id FROM family_child_links
       WHERE login_id = @loginId 
         AND crianca_id = @criancaId
         AND status IN ('approved', 'pending')`,
      { loginId: req.user.id, criancaId: codigoVinculacao.crianca_id }
    );

    if (jaBemVinculado) {
      console.log(`   ❌ Já vinculado (status ativo)`);
      return res.status(400).json({
        error: 'Você já está vinculado a esta criança',
        code: 'ALREADY_LINKED'
      });
    }

    console.log(`   🔗 Criando vinculação em transação...`);
    // Criar vinculação em transação
    const { v4: uuidv4 } = require('uuid');
    
    await withTransaction(async (tx) => {
      // Verificar se existe vinculação inativa (para re-ativar)
      const vinculacaoExistente = await tx.queryOne(
        `SELECT id FROM family_child_links
         WHERE login_id = @loginId 
           AND crianca_id = @criancaId
           AND status = 'inactive'`,
        { loginId: req.user.id, criancaId: codigoVinculacao.crianca_id }
      );

      if (vinculacaoExistente) {
        // Re-ativar vinculação existente
        console.log(`   ✅ Re-ativando vinculação existente: ${vinculacaoExistente.id}`);
        await tx.query(
          `UPDATE family_child_links
           SET status = 'pending'
           WHERE id = @linkId`,
          { linkId: vinculacaoExistente.id }
        );
      } else {
        // Criar nova vinculação
        const linkId = uuidv4();
        console.log(`   📝 Link ID gerado: ${linkId}`);
        console.log(`   📊 Dados: loginId=${req.user.id}, criancaId=${codigoVinculacao.crianca_id}, empresaId=${codigoVinculacao.empresa_id}`);
        
        await tx.query(
          `INSERT INTO family_child_links (id, login_id, crianca_id, empresa_id, status, relationship)
           VALUES (@linkId, @loginId, @criancaId, @empresaId, 'pending', 'responsável')`,
          { 
            linkId: linkId,
            loginId: req.user.id, 
            criancaId: codigoVinculacao.crianca_id, 
            empresaId: codigoVinculacao.empresa_id 
          }
        );
        console.log(`   ✅ Link criado com sucesso`);
      }

      // Marcar QR code como usado
      const updateResult = await tx.query(
        `UPDATE family_linking_codes
         SET status = 'used', used_by_login_id = @loginId
         WHERE id = @codeId`,
        { codeId: codigoVinculacao.id, loginId: req.user.id }
      );
      
      console.log(`   ✅ QR code marcado como usado. Rows affected: ${updateResult.rowsAffected[0]}`);
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
    console.error('❌ ERRO na validação de QR code:', error.message);
    console.error('   Stack:', error.stack);
    res.status(500).json({ error: 'Erro ao validar QR code', details: error.message });
  }
});

/**
 * RECEPTION/MASTER: GET /api/family/links/all
 * Lista todas as vinculações família-criança
 */
router.get('/links/all', verifyToken, async (req, res) => {
  try {
    // Verificar se é master, admin ou reception
    if (req.user.role !== 'master' && req.user.role !== 'admin' && req.user.role !== 'reception') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const links = await query(
      `SELECT 
        fcl.id,
        l.email as pai_email,
        c.name as crianca_nome,
        fcl.status,
        fcl.created_at
       FROM family_child_links fcl
       JOIN logins l ON fcl.login_id = l.id
       JOIN criancas c ON fcl.crianca_id = c.id
       ORDER BY fcl.created_at DESC`
    );

    console.log(`📋 [FAMILY-LINKS] Listando todas as vinculações`);

    res.json({
      success: true,
      links: links.recordset || []
    });

  } catch (error) {
    console.error('❌ Erro ao listar vinculações:', error);
    res.status(500).json({ error: 'Erro ao listar vinculações', details: error.message });
  }
});

/**
 * MASTER: POST /api/family/links/:linkId/unlink
 * Desvincula uma criança de um pai específico
 */
router.post('/links/:linkId/unlink', verifyToken, async (req, res) => {
  try {
    const { linkId } = req.params;

    if (req.user.role !== 'master' && req.user.role !== 'admin' && req.user.role !== 'reception') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const result = await query(
      `UPDATE family_child_links
       SET status = 'inactive'
       WHERE id = @linkId`,
      { linkId }
    );

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Vinculação não encontrada' });
    }

    console.log(`✅ Vinculação ${linkId} desativada`);

    res.json({
      success: true,
      message: 'Criança desvinculada com sucesso'
    });

  } catch (error) {
    console.error('❌ Erro ao desvincullar:', error);
    res.status(500).json({ error: 'Erro ao desvincullar', details: error.message });
  }
});

/**
 * MASTER: POST /api/family/links/unlink-all
 * Desvincula TODAS as crianças de TODOS os pais
 */
router.post('/unlink-all', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'master' && req.user.role !== 'admin' && req.user.role !== 'reception') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const result = await query(
      `UPDATE family_child_links
       SET status = 'inactive'
       WHERE status IN ('pending', 'approved')`
    );

    console.log(`⚠️ TODAS as vinculações foram desativadas. Total: ${result.rowsAffected[0]}`);

    res.json({
      success: true,
      message: `✅ ${result.rowsAffected[0]} vinculações foram removidas`,
      affectedRows: result.rowsAffected[0]
    });

  } catch (error) {
    console.error('❌ Erro ao desvincullar todos:', error);
    res.status(500).json({ error: 'Erro ao desvincullar', details: error.message });
  }
});
router.get('/children', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'family') {
      return res.status(403).json({ error: 'Apenas usuários com perfil familiar podem acessar' });
    }

    const children = await query(
      `SELECT fcl.id as link_id, c.id as crianca_id, c.name, c.nickname, c.age, 
              c.bracelet_code, t.name as time_name, t.color as team_color,
              e.id as evento_id, e.name as evento_nome, e.date, e.status
       FROM family_child_links fcl
       JOIN criancas c ON fcl.crianca_id = c.id
       LEFT JOIN times t ON c.time_id = t.id
       JOIN eventos e ON c.evento_id = e.id
       WHERE fcl.login_id = @loginId AND (fcl.status = 'pending' OR fcl.status = 'approved')
       ORDER BY e.date DESC, c.name ASC`,
      { loginId: req.user.id }
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
router.get('/children/:criancaId/performance', verifyToken, async (req, res) => {
  try {
    const { criancaId } = req.params;

    if (req.user.role !== 'family') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    // Verificar se pais está vinculado à criança
    const linked = await queryOne(
      `SELECT 1 FROM family_child_links
       WHERE login_id = @loginId AND crianca_id = @criancaId AND status = 'approved'`,
      { loginId: req.user.id, criancaId }
    );

    if (!linked) {
      return res.status(403).json({ error: 'Você não tem permissão para ver dados desta criança' });
    }

    // Buscar desempenho
    const crianca = await queryOne(
      `SELECT c.id, c.name, c.nickname, c.age, c.bracelet_code,
              c.scores, c.achievements, t.name as time_name, t.color as time_color,
              e.name as evento_nome, e.date, e.status
       FROM criancas c
       LEFT JOIN times t ON c.time_id = t.id
       JOIN eventos e ON c.evento_id = e.id
       WHERE c.id = @criancaId`,
      { criancaId }
    );

    if (!crianca) {
      return res.status(404).json({ error: 'Criança não encontrada' });
    }

    // Buscar histórico de pontuações
    const scoreHistory = await query(
      `SELECT checkpoint_id, points, created_at
       FROM pontuacoes
       WHERE crianca_id = @criancaId
       ORDER BY created_at DESC
       LIMIT 50`,
      { criancaId }
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
router.delete('/children/:criancaId/unlink', verifyToken, async (req, res) => {
  try {
    const { criancaId } = req.params;

    if (req.user.role !== 'family') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const result = await query(
      `UPDATE family_child_links
       SET status = 'inactive'
       WHERE login_id = @loginId AND crianca_id = @criancaId`,
      { loginId: req.user.id, criancaId }
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
