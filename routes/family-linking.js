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

// O evento onde o responsável quer vincular a criança. Vale se o evento é do buffet do login, se a família entrou nele
// pelo código de convite (familiaEvento) ou se já tem criança vinculada nele. Qualquer outro caso é como se o evento
// não existisse (null), para não revelar eventos de outros buffets.
async function eventoDoVinculo(user, eventoId) {
  const evento = await queryOne(
    'SELECT eventoId, empresaId FROM evento WHERE LOWER(eventoId) = LOWER(@eventoId)',
    { eventoId: String(eventoId) }
  );
  if (!evento) return null;
  if (evento.empresaId && String(evento.empresaId).toLowerCase() === String(user.empresaId).toLowerCase()) return evento;

  const porConvite = await queryOne(
    'SELECT 1 AS x FROM familiaEvento WHERE loginId = @loginId AND LOWER(eventoId) = LOWER(@eventoId)',
    { loginId: user.id, eventoId: evento.eventoId }
  );
  if (porConvite) return evento;

  const comCrianca = await queryOne(
    `SELECT 1 AS x FROM vinculoFamiliar v JOIN crianca c ON c.criancaId = v.criancaId
     WHERE v.loginId = @loginId AND v.status IN ('approved', 'pending') AND LOWER(c.eventoId) = LOWER(@eventoId)`,
    { loginId: user.id, eventoId: evento.eventoId }
  );
  return comCrianca ? evento : null;
}

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
      `SELECT flc.*, c.nome, c.apelido, c.idade, e.nome as evento_nome, e.eventoId as eventoId, c.empresaId, c.perfilCriancaId
       FROM "codigoVinculoFamiliar" flc
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
        codigo: 'INVALID_QR_CODE'
      });
    }

    console.log(`   ✅ Código encontrado para criança: ${codigoVinculacao.apelido}`);

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
        { loginId: req.user.id, criancaId: codigoVinculacao.criancaId }
      );

      if (vinculacaoExistente) {
        // ✅ Já existe - verificar status
        if (vinculacaoExistente.status === 'inactive') {
          console.log(`   ✅ Re-ativando vinculação existente: ${vinculacaoExistente.vinculoId}`);
          await tx.query(
            `UPDATE vinculoFamiliar
             SET status = 'approved', aprovadoEm = CURRENT_TIMESTAMP
             WHERE vinculoId = @linkId`,
            { linkId: vinculacaoExistente.vinculoId }
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
          `INSERT INTO vinculoFamiliar (vinculoId, loginId, criancaId, empresaId, status, relacionamento, aprovadoEm, perfilCriancaId)
           VALUES (@linkId, @loginId, @criancaId, @empresaId, 'approved', 'responsável', CURRENT_TIMESTAMP, @perfilCriancaId)`,
          {
            linkId: linkId,
            loginId: req.user.id, 
            criancaId: codigoVinculacao.criancaId, 
            empresaId: codigoVinculacao.empresaId,
            // Valor direto: repetir @criancaId num subselect dá "tipos inconsistentes" no PostgreSQL
            perfilCriancaId: codigoVinculacao.perfilCriancaId || null,
          }
        );
        console.log(`   ✅ Link criado com sucesso`);
      }

      // ✅ Marcar QR codigo como usado
      const updateResult = await tx.query(
        `UPDATE "codigoVinculoFamiliar"
         SET status = 'used', usadoPorLoginId = @loginId
         WHERE id = @codeId`,
        { codeId: codigoVinculacao.id, loginId: req.user.id }
      );
      
      console.log(`   ✅ QR codigo marcado como usado. Rows affected: ${updateResult.rowsAffected[0]}`);
    });

    console.log(`✅ Pais/Responsável ${req.user.email} vinculado à criança ${codigoVinculacao.apelido}`);

    res.json({
      success: true,
      message: 'Criança vinculada com sucesso!',
      linkedChild: {
        id: codigoVinculacao.criancaId,
        nome: codigoVinculacao.nome,
        apelido: codigoVinculacao.apelido,
        idade: codigoVinculacao.idade,
        evento: codigoVinculacao.evento_nome,
        // Mantidos em inglês para o frontenPulyn (web) até ele migrar
        name: codigoVinculacao.nome,
        nickname: codigoVinculacao.apelido,
        age: codigoVinculacao.idade
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
 * Body: { uid, eventoId? } — UID da pulseira, como lido pelo celular (hex, 4/7/10 bytes). Com eventoId (o evento
 * escolhido no app) a pulseira é procurada no buffet DESSE evento e tem de ser de uma criança dele; sem eventoId vale
 * o buffet do login, como antes.
 *
 * Mais restrito que o QR, porque o UID é público e fixo: só vale para pulseira em uso por
 * uma criança da MESMA empresa, em evento aberto, com limite de tentativas. O vínculo
 * já nasce 'approved' (sem aprovação da recepção), como no QR.
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

    // A busca já filtra pela empresa: pulseira de outra empresa é indistinguível de pulseira que não existe.
    // Com o evento escolhido no app, a empresa é a do evento (se a família tem acesso a ele) e a criança tem de ser dele.
    const pedido = req.body?.eventoId ? String(req.body.eventoId).trim() : '';
    let empresaDaBusca = req.user.empresaId;
    let filtroEvento = '';
    const parametros = { uid: parsed.uid };
    if (pedido) {
      const evento = await eventoDoVinculo(req.user, pedido);
      if (!evento) {
        const negado = checkBraceletLinkable(null);
        return res.status(404).json({ error: negado.error, codigo: negado.code });
      }
      empresaDaBusca = evento.empresaId;
      filtroEvento = 'AND LOWER(c.eventoId) = LOWER(@eventoId)';
      parametros.eventoId = evento.eventoId;
    }
    parametros.empresaId = empresaDaBusca;

    const row = await queryOne(
      `SELECT p.codigo, p.status, p.criancaId, p.empresaId,
              c.nome, c.apelido, c.idade, c.eventoId, c.perfilCriancaId,
              e.nome AS evento_nome, e.status AS evento_status
       FROM pulseira p
       JOIN crianca c ON c.criancaId = p.criancaId
       LEFT JOIN evento e ON e.eventoId = c.eventoId
       WHERE ${uidSqlExpression('p.codigo')} = @uid
         AND LOWER(p.empresaId) = LOWER(@empresaId)
         ${filtroEvento}`,
      parametros
    );

    const decision = checkBraceletLinkable(row);
    if (!decision.ok) {
      return res.status(404).json({ error: decision.error, codigo: decision.code });
    }

    const { v4: uuidv4 } = require('uuid');

    await withTransaction(async (tx) => {
      const vinculacaoExistente = await tx.queryOne(
        `SELECT vinculoId, status FROM vinculoFamiliar
         WHERE loginId = @loginId
           AND criancaId = @criancaId
         FOR UPDATE`,
        { loginId: req.user.id, criancaId: row.criancaId }
      );

      if (vinculacaoExistente) {
        if (vinculacaoExistente.status === 'inactive') {
          await tx.query(
            `UPDATE vinculoFamiliar SET status = 'approved', aprovadoEm = CURRENT_TIMESTAMP WHERE vinculoId = @linkId`,
            { linkId: vinculacaoExistente.vinculoId }
          );
        } else {
          throw new Error('ALREADY_LINKED');
        }
      } else {
        await tx.query(
          `INSERT INTO vinculoFamiliar (vinculoId, loginId, criancaId, empresaId, status, relacionamento, aprovadoEm, perfilCriancaId)
           VALUES (@linkId, @loginId, @criancaId, @empresaId, 'approved', 'responsável', CURRENT_TIMESTAMP, @perfilCriancaId)`,
          {
            linkId: uuidv4(),
            loginId: req.user.id,
            criancaId: row.criancaId,
            empresaId: row.empresaId,
            // Valor direto: repetir @criancaId num subselect dá "tipos inconsistentes" no PostgreSQL
            perfilCriancaId: row.perfilCriancaId || null,
          }
        );
      }
    });

    console.log(`✅ [FAMILY-LINKING] ${req.user.email} vinculado à criança ${row.apelido || row.nome} pela pulseira`);

    res.json({
      success: true,
      message: 'Criança vinculada com sucesso!',
      linkedChild: {
        id: row.criancaId,
        nome: row.nome,
        apelido: row.apelido,
        idade: row.idade,
        evento: row.evento_nome,
        // Mantidos em inglês para o frontenPulyn (web) até ele migrar
        name: row.nome,
        nickname: row.apelido,
        age: row.idade,
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

    console.log(`   ✅ Vínculo encontrado: ${link.vinculoId}`);
    console.log(`   📝 Status atual: ${link.status}`);

    // Desvincullar = marcar como 'inactive'
    await query(
      `UPDATE vinculoFamiliar
       SET status = 'inactive'
       WHERE vinculoId = @linkId`,
      { linkId: link.vinculoId }
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