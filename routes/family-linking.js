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

    console.log(`   🔗 Criando vinculação em transação...`);
    // Criar vinculação em transação
    const { v4: uuidv4 } = require('uuid');
    
    await withTransaction(async (tx) => {
      // ✅ VERIFICAR E INSERIR DENTRO DA TRANSAÇÃO COM LOCK (evita race condition)
      const vinculacaoExistente = await tx.queryOne(
        `SELECT id, status FROM family_child_links
         WHERE login_id = @loginId 
           AND crianca_id = @criancaId
         FOR UPDATE`, // ✅ Lock para thread safety
        { loginId: req.user.id, criancaId: codigoVinculacao.crianca_id }
      );

      if (vinculacaoExistente) {
        // ✅ Já existe - verificar status
        if (vinculacaoExistente.status === 'inactive') {
          // Re-ativar se estava inativa
          console.log(`   ✅ Re-ativando vinculação existente: ${vinculacaoExistente.id}`);
          await tx.query(
            `UPDATE family_child_links
             SET status = 'pending'
             WHERE id = @linkId`,
            { linkId: vinculacaoExistente.id }
          );
        } else {
          // Já está ativa - lançar erro
          throw new Error('ALREADY_LINKED');
        }
      } else {
        // ✅ Criar nova vinculação
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

      // ✅ Marcar QR code como usado
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