const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { query, queryOne, allQuery } = require('../database');
const { verifyToken, isMaster } = require('../utils/middleware');
const { normalizeUid, uidSqlExpression } = require('../utils/uid');
const { getAvatarForCreate, isAdventurerAvatarId } = require('../utils/avatar');
const { createQRCodeForChild, generateQRCode, generateParentTrackingUrl } = require('../utils/qrcode');

router.use(verifyToken, (req, res, next) => {
  if (req.user?.role === 'family') return res.status(403).json({ error: 'Famílias devem usar os endpoints de vínculo familiar' });
  next();
});

// Listar as crianças de TODOS os eventos do buffet (com nome do evento e do time).
// Escopo sempre pela empresa do token.
router.get('/', verifyToken, async (req, res) => {
  try {
    const criancas = await allQuery(`
      SELECT TOP 5000
        c.*,
        t.nome AS time_name,
        t.cor AS time_color,
        e.nome AS evento_name,
        e.status AS evento_status,
        e.data AS evento_date
      FROM crianca c
      LEFT JOIN time t ON c.timeId = t.timeId
      LEFT JOIN evento e ON c.eventoId = e.eventoId
      WHERE c.empresaId = @empresa_id
      ORDER BY e.data DESC, c.pontos DESC
    `, { empresa_id: req.user?.empresa_id });
    res.json(criancas);
  } catch (err) {
    console.error('❌ Erro ao listar crianças de todos os eventos:', err);
    res.status(500).json({ error: err.message });
  }
});

// Listar crianças de um evento
router.get('/eventos/:evento_id/criancas', verifyToken, async (req, res) => {
  try {
    // ✅ NOVO: Extrair empresa_id do token para validação
    const empresaId = req.user?.empresa_id;
    
    const criancas = await allQuery(`
      SELECT c.*, t.nome as time_name, t.cor as time_color 
      FROM crianca c
      LEFT JOIN time t ON c.timeId = t.timeId
      WHERE c.eventoId = @evento_id
      AND c.empresaId = @empresa_id
      ORDER BY c.pontos DESC
    `, { evento_id: req.params.evento_id, empresa_id: empresaId });
    res.json(criancas);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Criar criança
router.post('/eventos/:evento_id/criancas', verifyToken, async (req, res) => {
  try {
    const { name, nickname, age, avatar, braceletCode, timeId } = req.body;
    const normalizedBraceletCode = braceletCode ? normalizeUid(braceletCode) : null;
    const avatarValue = getAvatarForCreate(avatar);
    const { evento_id } = req.params;
    const id = uuidv4();

    if (!avatarValue) {
      return res.status(400).json({ error: 'Avatar inválido' });
    }

    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Nome da criança é obrigatório' });
    }

    if (braceletCode && !normalizedBraceletCode) {
      return res.status(400).json({ error: 'Código da pulseira inválido' });
    }
    
    // ✅ NOVO: Obter empresa_id do evento
    const evento = await queryOne('SELECT empresaId FROM evento WHERE eventoId = @evento_id', { evento_id });
    if (!evento) {
      return res.status(404).json({ error: 'Evento não encontrado' });
    }
    const empresaId = evento.empresa_id;

    if (!isMaster(req) && String(req.user.empresa_id) !== String(empresaId)) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence à sua empresa' });
    }

    if (timeId) {
      const time = await queryOne(
        `SELECT timeId FROM time
         WHERE timeId = @timeId AND eventoId = @eventoId
           AND (empresaId = @empresaId OR @isMaster = 1)`,
        { timeId, eventoId: evento_id, empresaId, isMaster: isMaster(req) ? 1 : 0 }
      );
      if (!time) return res.status(400).json({ error: 'Time não pertence ao evento selecionado' });
    }

    if (normalizedBraceletCode) {
      const pulseira = await queryOne(
        `SELECT codigo, status FROM pulseira
         WHERE ${uidSqlExpression('codigo')} = @code AND empresaId = @empresaId`,
        { code: normalizedBraceletCode, empresaId }
      );
      if (!pulseira) return res.status(400).json({ error: 'Pulseira não encontrada nesta empresa' });
      if (pulseira.status !== 'disponivel') return res.status(400).json({ error: 'Pulseira não está disponível' });
    }
    
    if (normalizedBraceletCode) {
      const existing = await queryOne(
        `SELECT criancaId FROM crianca WHERE ${uidSqlExpression('codigoPulseira')} = @code`,
        { code: normalizedBraceletCode }
      );
      if (existing) {
        return res.status(400).json({ error: 'Pulseira já está vinculada a outra criança' });
      }
    }
    
    // ✅ CORRIGIDO: Incluir empresa_id na INSERT
    await query(
      `INSERT INTO crianca (criancaId, eventoId, empresaId, timeId, nome, apelido, idade, avatar, codigoPulseira) 
       VALUES (@id, @evento_id, @empresa_id, @timeId, @name, @nickname, @age, @avatar, @braceletCode)`,
      { id, evento_id, empresa_id: empresaId, timeId, name, nickname, age: parseInt(age), avatar: avatarValue, braceletCode: normalizedBraceletCode }
    );
    
    if (normalizedBraceletCode) {
      await query(
        `UPDATE pulseira SET status = @status, criancaId = @crianca_id
         WHERE ${uidSqlExpression('codigo')} = @code AND empresaId = @empresa_id`,
        { status: 'em_uso', crianca_id: id, code: normalizedBraceletCode, empresa_id: empresaId }
      );
    }
    
    await query(
      `UPDATE time SET pontos = (SELECT ISNULL(SUM(pontos), 0) FROM crianca WHERE timeId = @timeId) 
       WHERE timeId = @timeId`,
      { timeId }
    );
    
    res.json({ id, name, nickname, age, avatar: avatarValue, braceletCode: normalizedBraceletCode, timeId, scores: 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Buscar criança por pulseira
router.get('/criancas/by-bracelet/:code', verifyToken, async (req, res) => {
  try {
    const normalizedCode = normalizeUid(req.params.code);
    if (!normalizedCode) {
      return res.status(400).json({ error: 'Código da pulseira inválido' });
    }

    const empresaId = req.user.empresa_id;
    const crianca = await queryOne(`
      SELECT c.*, t.nome as time_name, t.cor as time_color 
      FROM crianca c
      LEFT JOIN time t ON c.timeId = t.timeId
      WHERE ${uidSqlExpression('c.codigoPulseira')} = @code
        AND (c.empresaId = @empresaId OR @isMaster = 1)
    `, { code: normalizedCode, empresaId, isMaster: isMaster(req) ? 1 : 0 });
    
    if (!crianca) {
      return res.status(404).json({ error: 'Criança não encontrada' });
    }
    res.json(crianca);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Atualizar criança
router.put('/eventos/:evento_id/criancas/:crianca_id', verifyToken, async (req, res) => {
  try {
    const { name, nickname, age, avatar, braceletCode, timeId } = req.body;
    const normalizedBraceletCode = braceletCode ? normalizeUid(braceletCode) : null;
    const { evento_id, crianca_id } = req.params;
    
    console.log(`📝 [RECEBIDO] Atualizando criança ${crianca_id}`);
    console.log(`   - evento_id: ${evento_id}`);
    console.log(`   - braceletCode recebido: "${braceletCode}"`);
    console.log(`   - timeId: ${timeId}`);
    console.log(`   - name: ${name}`);
    
    // Verificar se criança existe
    const crianca = await queryOne('SELECT * FROM crianca WHERE criancaId = @id AND eventoId = @evento_id AND (empresaId = @empresaId OR @isMaster = 1)', 
      { id: crianca_id, evento_id, empresaId: req.user.empresa_id, isMaster: isMaster(req) ? 1 : 0 });
    
    if (!crianca) {
      return res.status(404).json({ error: 'Criança não encontrada' });
    }

    const nextAvatar = avatar === undefined || avatar === crianca.avatar
      ? crianca.avatar
      : (isAdventurerAvatarId(avatar) ? avatar : null);
    if (nextAvatar === null) {
      return res.status(400).json({ error: 'Avatar inválido' });
    }

    const nextTimeId = timeId === undefined ? crianca.time_id : (timeId || null);
    if (nextTimeId) {
      const targetTime = await queryOne(
        `SELECT timeId FROM time
         WHERE timeId = @timeId
           AND eventoId = @eventoId
           AND (empresaId = @empresaId OR @isMaster = 1)`,
        {
          timeId: nextTimeId,
          eventoId: evento_id,
          empresaId: crianca.empresa_id,
          isMaster: isMaster(req) ? 1 : 0,
        }
      );
      if (!targetTime) {
        return res.status(400).json({ error: 'Time não pertence ao evento selecionado' });
      }
    }
    
    // Se está mudando de pulseira, verificar se a nova pulseira existe e está disponível
    if (normalizedBraceletCode && normalizedBraceletCode !== normalizeUid(crianca.bracelet_code || '')) {
      // Verificar se outra criança já tem essa pulseira
      const existing = await queryOne(
        `SELECT criancaId FROM crianca WHERE ${uidSqlExpression('codigoPulseira')} = @code AND criancaId != @criancaId`, 
        { code: normalizedBraceletCode, criancaId: crianca_id }
      );
      if (existing) {
        console.error(`❌ Pulseira ${normalizedBraceletCode} já vinculada a outra criança`);
        return res.status(400).json({ error: 'Pulseira já está vinculada a outra criança' });
      }
      
      // Verificar se pulseira existe
      const pulseira = await queryOne(
        `SELECT * FROM pulseira WHERE ${uidSqlExpression('codigo')} = @code AND empresaId = @empresaId`,
        { code: normalizedBraceletCode, empresaId: crianca.empresa_id }
      );
      if (!pulseira) {
        console.error(`❌ Pulseira ${normalizedBraceletCode} não encontrada`);
        return res.status(400).json({ error: 'Pulseira não encontrada' });
      }
      
      // Atualizar status da pulseira antiga para 'disponível' (se existia)
      if (crianca.bracelet_code) {
        const oldCode = normalizeUid(crianca.bracelet_code);
        await query(
          `UPDATE pulseira SET status = @status, criancaId = NULL
           WHERE ${uidSqlExpression('codigo')} = @code AND empresaId = @empresaId`,
          { status: 'disponivel', code: oldCode, empresaId: crianca.empresa_id }
        );
        console.log(`   → Pulseira anterior ${oldCode} marcada como disponível`);
      }
      
      // Marcar pulseira nova como 'em_uso'
      await query(
        `UPDATE pulseira SET status = @status, criancaId = @criancaId
         WHERE ${uidSqlExpression('codigo')} = @code AND empresaId = @empresaId`,
        { status: 'em_uso', criancaId: crianca_id, code: normalizedBraceletCode, empresaId: crianca.empresa_id }
      );
      console.log(`   → Pulseira ${normalizedBraceletCode} marcada como em_uso`);
    }
    
    // Atualizar criança
    await query(
      `UPDATE crianca SET 
        nome = @name, 
        apelido = @nickname, 
        idade = @age, 
        avatar = @avatar, 
        codigoPulseira = @braceletCode,
        timeId = @timeId
       WHERE criancaId = @criancaId 
       AND eventoId = @eventoId
       AND empresaId = @empresaId`,
      { 
        name: name || crianca.name, 
        nickname: nickname || crianca.nickname, 
        age: age ? parseInt(age) : crianca.age, 
        avatar: nextAvatar,
        braceletCode: normalizedBraceletCode,
        criancaId: crianca_id,
        eventoId: evento_id,
        empresaId: crianca.empresa_id,
        timeId: nextTimeId
      }
    );

    const affectedTeamIds = [...new Set([crianca.time_id, nextTimeId].filter(Boolean))];
    for (const affectedTeamId of affectedTeamIds) {
      await query(
        `UPDATE time
         SET pontos = (SELECT ISNULL(SUM(pontos), 0) FROM crianca WHERE timeId = @timeId)
         WHERE timeId = @timeId`,
        { timeId: affectedTeamId }
      );
    }
    
    console.log(`✅ Criança ${crianca.name} atualizada com pulseira ${normalizedBraceletCode}`);
    res.json({ ok: true, message: 'Criança atualizada com sucesso' });
  } catch (err) {
    console.error('❌ Erro ao atualizar criança:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Excluir participante do evento
router.delete('/eventos/:evento_id/criancas/:crianca_id', verifyToken, async (req, res) => {
  try {
    const allowedRoles = ['admin', 'reception', 'game_master'];
    if (!isMaster(req) && !allowedRoles.includes(req.user?.role)) {
      return res.status(403).json({ error: 'Acesso negado para excluir participantes' });
    }

    const { evento_id, crianca_id } = req.params;
    const crianca = await queryOne(
      `SELECT * FROM crianca
       WHERE criancaId = @criancaId
       AND eventoId = @eventoId
       AND (empresaId = @empresaId OR @isMaster = 1)`,
      {
        criancaId: crianca_id,
        eventoId: evento_id,
        empresaId: req.user.empresa_id,
        isMaster: isMaster(req) ? 1 : 0
      }
    );

    if (!crianca) {
      return res.status(404).json({ error: 'Participante não encontrado' });
    }

    // Liberar a pulseira antes de remover a criança por causa da FK pulseiras.crianca_id.
    await query(
      `UPDATE pulseira
       SET status = @status, criancaId = NULL
       WHERE criancaId = @criancaId
       AND empresaId = @empresaId`,
      { status: 'disponivel', criancaId: crianca_id, empresaId: crianca.empresa_id }
    );

    // Remover registros que possuem FK obrigatória para a criança.
    await query('DELETE FROM criancaConquista WHERE criancaId = @criancaId', { criancaId: crianca_id });
    await query('DELETE FROM cacaTesourScan WHERE criancaId = @criancaId', { criancaId: crianca_id });
    await query('DELETE FROM pontuacao WHERE criancaId = @criancaId', { criancaId: crianca_id });
    await query('DELETE FROM leitura WHERE criancaId = @criancaId', { criancaId: crianca_id });

    // Manter a pontuação do time consistente com a remoção do participante.
    if (crianca.time_id && crianca.scores) {
      await query(
        `UPDATE time
         SET pontos = CASE
           WHEN pontos >= @scores THEN pontos - @scores
           ELSE 0
         END
         WHERE timeId = @timeId AND eventoId = @eventoId`,
        { scores: crianca.scores, timeId: crianca.time_id, eventoId: evento_id }
      );
    }

    await query(
      `DELETE FROM crianca
       WHERE criancaId = @criancaId
       AND eventoId = @eventoId
       AND empresaId = @empresaId`,
      { criancaId: crianca_id, eventoId: evento_id, empresaId: crianca.empresa_id }
    );

    console.log(`✅ Participante ${crianca.name} (${crianca_id}) excluído do evento ${evento_id}`);
    res.json({ ok: true, message: 'Participante excluído com sucesso' });
  } catch (err) {
    console.error('❌ Erro ao excluir participante:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Desvincular pulseira
router.post('/:crianca_id/unassign-bracelet', verifyToken, async (req, res) => {
  try {
    const allowedRoles = ['admin', 'reception', 'game_master'];
    if (!isMaster(req) && !allowedRoles.includes(req.user?.role)) {
      return res.status(403).json({ error: 'Acesso negado para desvincular pulseiras' });
    }
    const { crianca_id } = req.params;
    const crianca = await queryOne(
      `SELECT * FROM crianca
       WHERE criancaId = @id AND (empresaId = @empresaId OR @isMaster = 1)`,
      { id: crianca_id, empresaId: req.user.empresa_id, isMaster: isMaster(req) ? 1 : 0 }
    );
    
    if (!crianca) {
      return res.status(404).json({ error: 'Criança não encontrada' });
    }
    
    if (!crianca.bracelet_code) {
      return res.status(400).json({ error: 'Criança não possui pulseira associada' });
    }
    
    const braceletCode = crianca.bracelet_code;
    
    await query(
      `UPDATE crianca SET ultimaPulseira = codigoPulseira, codigoPulseira = NULL
       WHERE criancaId = @criancaId AND (empresaId = @empresaId OR @isMaster = 1)`,
      { criancaId: crianca_id, empresaId: crianca.empresa_id, isMaster: isMaster(req) ? 1 : 0 }
    );
    
    // ✅ NOVO: Atualizar status da pulseira de volta para "disponível"
    await query(
      `UPDATE pulseira SET status = @status, criancaId = NULL
       WHERE ${uidSqlExpression('codigo')} = @code AND empresaId = @empresaId`,
      { status: 'disponivel', code: normalizeUid(braceletCode), empresaId: crianca.empresa_id }
    );
    
    console.log(`✅ Pulseira ${braceletCode} desvinculada de ${crianca.name} e marcada como disponível`);
    
    res.json({ ok: true, message: 'Pulseira desvinculada com sucesso' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ NOVO: Gerar/Regenerar QR Code para uma criança
router.post('/:crianca_id/generate-qrcode', verifyToken, async (req, res) => {
  try {
    const { crianca_id } = req.params;
    
    // Validar acesso
    const crianca = await queryOne(
      `SELECT * FROM crianca
       WHERE criancaId = @id AND (empresaId = @empresaId OR @isMaster = 1)`,
      { id: crianca_id, empresaId: req.user.empresa_id, isMaster: isMaster(req) ? 1 : 0 }
    );
    
    if (!crianca) {
      return res.status(404).json({ error: 'Criança não encontrada' });
    }

    // Gerar novo QR Code
    const qrCodeData = await createQRCodeForChild(crianca_id);

    // Salvar na tabela criancas
    await query(
      `UPDATE crianca SET codigoQr = @qrcode 
       WHERE criancaId = @crianca_id AND (empresaId = @empresaId OR @isMaster = 1)`,
      { 
        qrcode: qrCodeData.qrCode, 
        crianca_id, 
        empresaId: req.user.empresa_id,
        isMaster: isMaster(req) ? 1 : 0
      }
    );

    console.log(`✅ QR Code gerado para criança ${crianca.name} (${crianca_id}): ${qrCodeData.qrCode}`);

    res.json({
      ok: true,
      message: 'QR Code gerado com sucesso',
      qrCode: qrCodeData.qrCode,
      trackingUrl: qrCodeData.trackingUrl,
    });
  } catch (err) {
    console.error('❌ Erro ao gerar QR Code:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ✅ NOVO: Obter imagem do QR Code de uma criança
router.get('/:crianca_id/qrcode-image', verifyToken, async (req, res) => {
  try {
    const { crianca_id } = req.params;
    
    // Validar acesso
    const crianca = await queryOne(
      `SELECT * FROM crianca
       WHERE criancaId = @id AND (empresaId = @empresaId OR @isMaster = 1)`,
      { id: crianca_id, empresaId: req.user.empresa_id, isMaster: isMaster(req) ? 1 : 0 }
    );
    
    if (!crianca) {
      return res.status(404).json({ error: 'Criança não encontrada' });
    }

    // Se não tem QR Code, gerar um
    let qrCode = crianca.qrcode;
    if (!qrCode) {
      const qrCodeData = await createQRCodeForChild(crianca_id);
      qrCode = qrCodeData.qrCode;
      
      // Salvar na tabela
      await query(
        `UPDATE crianca SET codigoQr = @qrcode 
         WHERE criancaId = @crianca_id AND (empresaId = @empresaId OR @isMaster = 1)`,
        { 
          qrcode: qrCode, 
          crianca_id, 
          empresaId: req.user.empresa_id,
          isMaster: isMaster(req) ? 1 : 0
        }
      );
      
      console.log(`✅ QR Code auto-gerado para criança ${crianca.name} (${crianca_id}): ${qrCode}`);
    }

    // Gerar imagem do QR Code existente
    const { generateQRCodeImage } = require('../utils/qrcode');
    const trackingUrl = generateParentTrackingUrl(qrCode, crianca_id);
    const qrCodeImage = await generateQRCodeImage(trackingUrl);

    // Retornar imagem PNG
    res.type('image/png');
    res.send(qrCodeImage);
  } catch (err) {
    console.error('❌ Erro ao obter imagem QR Code:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ✅ NOVO: Gerar QR Code para todas as crianças NULL em um evento (batch)
router.post('/eventos/:evento_id/generate-qrcodes-batch', verifyToken, async (req, res) => {
  try {
    const allowedRoles = ['admin', 'reception', 'game_master'];
    if (!isMaster(req) && !allowedRoles.includes(req.user?.role)) {
      return res.status(403).json({ error: 'Acesso negado para esta operação em lote' });
    }

    const { evento_id } = req.params;

    // Validar que o evento pertence à empresa
    const evento = await queryOne('SELECT * FROM evento WHERE eventoId = @evento_id AND (empresaId = @empresaId OR @isMaster = 1)', 
      { evento_id, empresaId: req.user.empresa_id, isMaster: isMaster(req) ? 1 : 0 });
    
    if (!evento) {
      return res.status(404).json({ error: 'Evento não encontrado' });
    }

    // Buscar todas as crianças sem QR Code
    const criancasSemQR = await allQuery(
      `SELECT criancaId, nome FROM crianca 
       WHERE eventoId = @evento_id 
       AND (codigoQr IS NULL OR codigoQr = '')
       AND empresaId = @empresa_id`,
      { evento_id, empresa_id: evento.empresa_id }
    );

    if (criancasSemQR.length === 0) {
      return res.json({ 
        ok: true, 
        message: 'Todas as crianças já possuem QR Code',
        generated: 0,
        total: 0
      });
    }

    // Gerar QR Code para cada criança
    const results = [];
    for (const crianca of criancasSemQR) {
      try {
        const qrCodeData = await createQRCodeForChild(crianca.id);
        
        await query(
          `UPDATE crianca SET codigoQr = @qrcode 
           WHERE criancaId = @crianca_id`,
          { qrcode: qrCodeData.qrCode, crianca_id: crianca.id }
        );

        results.push({
          crianca_id: crianca.id,
          crianca_name: crianca.name,
          qrCode: qrCodeData.qrCode,
          success: true,
        });

        console.log(`✅ QR Code gerado para ${crianca.name}: ${qrCodeData.qrCode}`);
      } catch (err) {
        console.error(`❌ Erro ao gerar QR Code para ${crianca.name}:`, err.message);
        results.push({
          crianca_id: crianca.id,
          crianca_name: crianca.name,
          success: false,
          error: err.message,
        });
      }
    }

    const successCount = results.filter(r => r.success).length;

    res.json({
      ok: true,
      message: `${successCount} QR Code(s) gerado(s) com sucesso`,
      generated: successCount,
      total: criancasSemQR.length,
      results,
    });
  } catch (err) {
    console.error('❌ Erro ao gerar QR Codes em lote:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
