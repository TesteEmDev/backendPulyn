const express = require('express');
const router = express.Router();
const { verifyToken } = require('../utils/middleware');
const { queryOne, query, withTransaction } = require('../database');
const { uidSqlExpression } = require('../utils/uid');
const {
  parseBraceletUid,
  checkBraceletLinkable,
  createAttemptLimiter,
} = require('../utils/braceletLinkRules');

// Limite de tentativas do vínculo por pulseira (o UID é público e fixo; ver braceletLinkRules.js).
const braceletAttempts = createAttemptLimiter();

/**
 * MOBILE: POST /api/family/qrcode/validate
 * Valida um QR codigo e vincula o pais/responsável à criança
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
    let codigoQR = null;
    
    // Tenta extrair de URL
    if (typeof qrCodeValue === 'string' && qrCodeValue.startsWith('http')) {
      console.log(`   🔗 Detectado como URL, extraindo token...`);
      try {
        const urlObj = new URL(qrCodeValue);
        const pathParts = urlObj.pathname.split('/');
        const token = pathParts[pathParts.length - 1];
        
        const decoded = Buffer.from(token, 'base64').toString('utf-8');
        const parts = decoded.split(':');
        
        if (parts.length === 2) {
          codigoQR = parts[1];
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
          codigo: 'INVALID_QR_FORMAT'
        });
      }
    }

    console.log(`   🔍 Buscando código QR no banco: "${codigoQR}"`);
    // Buscar código QR ativo
    const codigoVinculacao = await queryOne(
      `SELECT flc.*, c.nome, c.nicknome, c.age, e.nome as evento_nome, e.id as eventoId, c.empresaId
       FROM "familyLinkingCodes" flc
       JOIN criancas c ON flc.criancaId = c.id
       JOIN eventos e ON flc.eventoId = e.id
       WHERE flc.qr_code_value = @codigoQR 
         AND flc.status = 'active'
         AND flc.expiramEm > CURRENT_TIMESTAMP`,
      { codigoQR }
    );

    console.log(`   ✅ Query executada. Resultado:`, codigoVinculacao ? 'Encontrado' : 'Não encontrado');

    if (!codigoVinculacao) {
      console.log(`   ❌ Código QR não encontrado ou expirado`);
      return res.status(404).json({
        error: 'Código QR inválido ou expirado',
        codigo: 'INVALID_QR_CODE'
      });
    }

    console.log(`   ✅ Código encontrado para criança: ${codigoVinculacao.nickname}`);

    console.log(`   🔗 Criando vinculação em transação...`);
    // Criar vinculação em transação
    const { v4: uuidv4 } = require('uuid');
    
    await withTransaction(async (tx) => {
      // ✅ VERIFICAR E INSERIR DENTRO DA TRANSAÇÃO COM LOCK (evita race condition)
      const vinculacaoExistente = await tx.queryOne(
        `SELECT id, status FROM vinculoFamiliar
         WHERE loginId = @loginId 
           AND criancaId = @criancaId
         FOR UPDATE`,
        { loginId: req.user.id, criancaId: codigoVinculacao.criancaId }
      );

      if (vinculacaoExistente) {
        // ✅ Já existe - verificar status
        if (vinculacaoExistente.status === 'inactive') {
          console.log(`   ✅ Re-ativando vinculação existente: ${vinculacaoExistente.id}`);
          await tx.query(
            `UPDATE vinculoFamiliar
             SET status = 'pending'
             WHERE id = @linkId`,
            { linkId: vinculacaoExistente.id }
          );
        } else {
          throw new Error('ALREADY_LINKED');
        }
      } else {
        // ✅ Criar nova vinculação
        const linkId = uuidv4();
        console.log(`   📝 Link ID gerado: ${linkId}`);
        console.log(`   📊 Dados: loginId=${req.user.id}, criancaId=${codigoVinculacao.criancaId}, empresaId=${codigoVinculacao.empresaId}`);
        
        await tx.query(
          `INSERT INTO vinculoFamiliar (id, loginId, criancaId, empresaId, status, relacionamento)
           VALUES (@linkId, @loginId, @criancaId, @empresaId, 'pending', 'responsável')`,
          { 
            linkId: linkId,
            loginId: req.user.id, 
            criancaId: codigoVinculacao.criancaId, 
            empresaId: codigoVinculacao.empresaId 
          }
        );
        console.log(`   ✅ Link criado com sucesso`);
      }

      // ✅ Marcar QR codigo como usado
      const updateResult = await tx.query(
        `UPDATE "familyLinkingCodes"
         SET status = 'used', used_by_login_id = @loginId
         WHERE id = @codeId`,
        { codeId: codigoVinculacao.id, loginId: req.user.id }
      );
      
      console.log(`   ✅ QR codigo marcado como usado. Rows affected: ${updateResult.rowsAffected[0]}`);
    });

    console.log(`✅ Pais/Responsável ${req.user.email} vinculado à criança ${codigoVinculacao.nickname}`);

    res.json({
      success: true,
      message: 'Criança vinculada com sucesso!',
      linkedChild: {
        id: codigoVinculacao.criancaId,
        name: codigoVinculacao.nome,
        nickname: codigoVinculacao.nicknome,
        age: codigoVinculacao.age,
        evento: codigoVinculacao.evento_nome
      }
    });

  } catch (error) {
    // ✅ Tratamento de erro específico
    if (error.message === 'ALREADY_LINKED') {
      console.log(`   ❌ Já vinculado (status ativo)`);
      return res.status(400).json({
        error: 'Você já está vinculado a esta criança',
        codigo: 'ALREADY_LINKED'
      });
    }

    console.error('❌ ERRO na validação de QR codigo:', error.message);
    console.error('   Stack:', error.stack);
    res.status(500).json({ error: 'Erro ao validar QR codigo', details: error.message });
  }
});

/**
 * MOBILE: POST /api/family/bracelet/validate
 * Vincula o responsável à criança lendo a PULSEIRA NFC no celular (alternativa ao QR Code).
 * Body: { uid } — UID da pulseira, como lido pelo celular (hex, 4/7/10 bytes).
 *
 * Mais restrito que o QR, porque o UID é público e fixo: só vale para pulseira em uso por
 * uma criança da MESMA empresa, em evento aberto, com limite de tentativas. O vínculo
 * nasce 'pending' e a recepção aprova, como no QR.
 */
router.post('/bracelet/validate', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'family') {
      return res.status(403).json({ error: 'Apenas usuários com perfil familiar podem vincular crianças' });
    }

    const attempt = braceletAttempts.hit(req.user.id);
    if (!attempt.allowed) {
      res.set('Retry-After', String(attempt.retryAfterSec));
      return res.status(429).json({
        error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
        codigo: 'TOO_MANY_ATTEMPTS',
        retryAfterSec: attempt.retryAfterSec,
      });
    }

    const parsed = parseBraceletUid(req.body?.uid);
    if (!parsed.uid) {
      return res.status(400).json({ error: parsed.error, codigo: parsed.codigo });
    }

    // A busca já filtra pela empresa do responsável: pulseira de outra empresa é
    // indistinguível de pulseira que não existe.
    const row = await queryOne(
      `SELECT p.codigo, p.status, p.criancaId, p.empresaId,
              c.nome, c.nicknome, c.age, c.eventoId,
              e.nome AS evento_nome, e.status AS evento_status
       FROM pulseiras p
       JOIN criancas c ON c.id = p.criancaId
       LEFT JOIN eventos e ON e.id = c.eventoId
       WHERE ${uidSqlExpression('p.codigo')} = @uid
         AND LOWER(p.empresaId) = LOWER(@empresaId)`,
      { uid: parsed.uid, empresaId: req.user.empresaId }
    );

    const decision = checkBraceletLinkable(row);
    if (!decision.ok) {
      return res.status(404).json({ error: decision.error, codigo: decision.codigo });
    }

    const { v4: uuidv4 } = require('uuid');

    await withTransaction(async (tx) => {
      const vinculacaoExistente = await tx.queryOne(
        `SELECT id, status FROM vinculoFamiliar
         WHERE loginId = @loginId
           AND criancaId = @criancaId
         FOR UPDATE`,
        { loginId: req.user.id, criancaId: row.criancaId }
      );

      if (vinculacaoExistente) {
        if (vinculacaoExistente.status === 'inactive') {
          await tx.query(
            `UPDATE vinculoFamiliar SET status = 'pending' WHERE id = @linkId`,
            { linkId: vinculacaoExistente.id }
          );
        } else {
          throw new Error('ALREADY_LINKED');
        }
      } else {
        await tx.query(
          `INSERT INTO vinculoFamiliar (id, loginId, criancaId, empresaId, status, relacionamento)
           VALUES (@linkId, @loginId, @criancaId, @empresaId, 'pending', 'responsável')`,
          {
            linkId: uuidv4(),
            loginId: req.user.id,
            criancaId: row.criancaId,
            empresaId: row.empresaId,
          }
        );
      }
    });

    console.log(`✅ [FAMILY-LINKING] ${req.user.email} vinculado (pendente) à criança ${row.nickname || row.name} pela pulseira`);

    res.json({
      success: true,
      message: 'Criança vinculada com sucesso!',
      linkedChild: {
        id: row.criancaId,
        name: row.nome,
        nickname: row.nicknome,
        age: row.age,
        evento: row.evento_nome,
      },
    });
  } catch (error) {
    if (error.message === 'ALREADY_LINKED') {
      return res.status(400).json({
        error: 'Você já está vinculado a esta criança',
        codigo: 'ALREADY_LINKED',
      });
    }

    console.error('❌ ERRO no vínculo por pulseira:', error.message);
    res.status(500).json({ error: 'Erro ao vincular pela pulseira' });
  }
});

/**
 * ✅ DELETE /api/family/children/:childId/unlink
 * Desvincula uma criança da família
 * Chamado quando pais quer remover uma criança da sua conta
 */
router.delete('/children/:childId/unlink', verifyToken, async (req, res) => {
  console.log('📞 [FAMILY-LINKING] DELETE /children/:childId/unlink chamado');
  console.log(`   Usuario: ${req.user?.email || 'ANÔNIMO'}`);
  console.log(`   Role: ${req.user?.role || 'NENHUMA'}`);
  console.log(`   childId: ${req.params.childId}`);
  
  try {
    const { childId } = req.params;

    // Verificar se é role 'family'
    if (req.user.role !== 'family') {
      console.log(`   ❌ Acesso negado: role é ${req.user.role}, esperado 'family'`);
      return res.status(403).json({ error: 'Apenas usuários com perfil familiar podem desvincullar' });
    }

    if (!childId) {
      console.log(`   ❌ childId vazio`);
      return res.status(400).json({ error: 'childId é obrigatório' });
    }

    console.log(`   🔍 Buscando vínculo...`);
    // Verificar se a criança pertence a essa família
    const link = await queryOne(
      `SELECT l.* FROM vinculoFamiliar l
       WHERE l.criancaId = @childId AND l.loginId = @loginId`,
      { childId, loginId: req.user.id }
    );

    if (!link) {
      console.log(`   ❌ Vínculo não encontrado`);
      return res.status(404).json({
        error: 'Criança não vinculada a sua família',
        codigo: 'LINK_NOT_FOUND'
      });
    }

    console.log(`   ✅ Vínculo encontrado: ${link.id}`);
    console.log(`   📝 Status atual: ${link.status}`);

    // Desvincullar = marcar como 'inactive'
    await query(
      `UPDATE vinculoFamiliar
       SET status = 'inactive'
       WHERE id = @linkId`,
      { linkId: link.id }
    );

    console.log(`   ✅ Criança desvinculada com sucesso`);

    res.json({
      success: true,
      message: 'Criança desvinculada com sucesso!'
    });

  } catch (error) {
    console.error('❌ ERRO ao desvincullar criança:', error.message);
    console.error('   Stack:', error.stack);
    res.status(500).json({ error: 'Erro ao desvincullar criança', details: error.message });
  }
});

module.exports = router;