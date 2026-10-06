const express = require('express');
const router = express.Router();
const { verifyToken } = require('../utils/middleware');
const { queryOne, query, withTransaction } = require('../database');

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
          code: 'INVALID_QR_FORMAT'
        });
      }
    }

    console.log(`   🔍 Buscando código QR no banco: "${codigoQR}"`);
    // Buscar código QR ativo
    const codigoVinculacao = await queryOne(
      `SELECT flc.*, c.nome, c.apelido, c.idade, e.nome as evento_nome, e.eventoId as evento_id, c.empresaId
       FROM codigoVinculoFamiliar flc
       JOIN crianca c ON flc.criancaId = c.criancaId
       JOIN evento e ON flc.eventoId = e.eventoId
       WHERE flc.valorQrCode = @codigoQR 
         AND flc.status = 'active'
         AND flc.expiraEm > CURRENT_TIMESTAMP`,
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

    console.log(`   🔗 Criando vinculação em transação...`);
    // Criar vinculação em transação
    const { v4: uuidv4 } = require('uuid');
    
    await withTransaction(async (tx) => {
      // ✅ VERIFICAR E INSERIR DENTRO DA TRANSAÇÃO COM LOCK (evita race condition)
      const vinculacaoExistente = await tx.queryOne(
        `SELECT vinculoId, status FROM vinculoFamiliar
         WHERE loginId = @loginId 
           AND criancaId = @criancaId
         FOR UPDATE`,
        { loginId: req.user.id, criancaId: codigoVinculacao.crianca_id }
      );

      if (vinculacaoExistente) {
        // ✅ Já existe - verificar status
        if (vinculacaoExistente.status === 'inactive') {
          console.log(`   ✅ Re-ativando vinculação existente: ${vinculacaoExistente.id}`);
          await tx.query(
            `UPDATE vinculoFamiliar
             SET status = 'pending'
             WHERE vinculoId = @linkId`,
            { linkId: vinculacaoExistente.id }
          );
        } else {
          throw new Error('ALREADY_LINKED');
        }
      } else {
        // ✅ Criar nova vinculação
        const linkId = uuidv4();
        console.log(`   📝 Link ID gerado: ${linkId}`);
        console.log(`   📊 Dados: loginId=${req.user.id}, criancaId=${codigoVinculacao.crianca_id}, empresaId=${codigoVinculacao.empresa_id}`);
        
        await tx.query(
          `INSERT INTO vinculoFamiliar (vinculoId, loginId, criancaId, empresaId, status, relacionamento)
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

      // ✅ Marcar QR code como usado
      const updateResult = await tx.query(
        `UPDATE codigoVinculoFamiliar
         SET status = 'used', usadoPorLoginId = @loginId
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
    // ✅ Tratamento de erro específico
    if (error.message === 'ALREADY_LINKED') {
      console.log(`   ❌ Já vinculado (status ativo)`);
      return res.status(400).json({
        error: 'Você já está vinculado a esta criança',
        code: 'ALREADY_LINKED'
      });
    }

    console.error('❌ ERRO na validação de QR code:', error.message);
    console.error('   Stack:', error.stack);
    res.status(500).json({ error: 'Erro ao validar QR code', details: error.message });
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
        code: 'LINK_NOT_FOUND'
      });
    }

    console.log(`   ✅ Vínculo encontrado: ${link.id}`);
    console.log(`   📝 Status atual: ${link.status}`);

    // Desvincullar = marcar como 'inactive'
    await query(
      `UPDATE vinculoFamiliar
       SET status = 'inactive'
       WHERE vinculoId = @linkId`,
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