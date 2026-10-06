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
        t.name AS time_name,
        t.color AS time_color,
        e.name AS evento_name,
        e.status AS evento_status,
        e.date AS evento_date
      FROM criancas c
      LEFT JOIN times t ON c.timeId = t.id
      LEFT JOIN eventos e ON c.eventoId = e.id
      WHERE c.empresaId = @empresaId
      ORDER BY e.date DESC, c.scores DESC
    `, { empresaId: req.user?.empresaId });
    res.json(criancas);
  } catch (err) {
    console.error('❌ Erro ao listar crianças de todos os eventos:', err);
    res.status(500).json({ error: err.message });
  }
});

// Listar crianças de um evento
router.get('/eventos/:eventoId/criancas', verifyToken, async (req, res) => {
  try {
    // ✅ NOVO: Extrair empresaId do token para validação
    const empresaId = req.user?.empresaId;
    
    const criancas = await allQuery(`
      SELECT c.*, t.name as time_name, t.color as time_color 
      FROM criancas c
      LEFT JOIN times t ON c.timeId = t.id
      WHERE c.eventoId = @eventoId
      AND c.empresaId = @empresaId
      ORDER BY c.scores DESC
    `, { eventoId: req.params.eventoId, empresaId: empresaId });
    res.json(criancas);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Criar criança
router.post('/eventos/:eventoId/criancas', verifyToken, async (req, res) => {
  try {
    const { name, nickname, age, avatar, braceletCode, timeId } = req.body;
    const normalizedBraceletCode = braceletCode ? normalizeUid(braceletCode) : null;
    const avatarValue = getAvatarForCreate(avatar);
    const { eventoId } = req.params;
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
    
    // ✅ NOVO: Obter empresaId do evento
    const evento = await queryOne('SELECT empresaId FROM eventos WHERE id = @eventoId', { eventoId });
    if (!evento) {
      return res.status(404).json({ error: 'Evento não encontrado' });
    }
    const empresaId = evento.empresaId;

    if (!isMaster(req) && String(req.user.empresaId) !== String(empresaId)) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence à sua empresa' });
    }

    if (timeId) {
      const time = await queryOne(
        `SELECT id FROM times
         WHERE id = @timeId AND eventoId = @eventoId
           AND (empresaId = @empresaId OR @isMaster = 1)`,
        { timeId, eventoId: eventoId, empresaId, isMaster: isMaster(req) ? 1 : 0 }
      );
      if (!time) return res.status(400).json({ error: 'Time não pertence ao evento selecionado' });
    }

    if (normalizedBraceletCode) {
      const pulseira = await queryOne(
        `SELECT codigo, status FROM pulseiras
         WHERE ${uidSqlExpression('codigo')} = @codigo AND empresaId = @empresaId`,
        { codigo: normalizedBraceletCode, empresaId }
      );
      if (!pulseira) return res.status(400).json({ error: 'Pulseira não encontrada nesta empresa' });
      if (pulseira.status !== 'disponivel') return res.status(400).json({ error: 'Pulseira não está disponível' });
    }
    
    if (normalizedBraceletCode) {
      const existing = await queryOne(
        `SELECT id FROM criancas WHERE ${uidSqlExpression('codigoPulseira')} = @codigo`,
        { codigo: normalizedBraceletCode }
      );
      if (existing) {
        return res.status(400).json({ error: 'Pulseira já está vinculada a outra criança' });
      }
    }
    
    // ✅ CORRIGIDO: Incluir empresaId na INSERT
    await query(
      `INSERT INTO criancas (id, eventoId, empresaId, timeId, name, nickname, age, avatar, codigoPulseira) 
       VALUES (@id, @eventoId, @empresaId, @timeId, @name, @nickname, @age, @avatar, @braceletCode)`,
      { id, eventoId, empresaId: empresaId, timeId, name, nickname, age: parseInt(age), avatar: avatarValue, braceletCode: normalizedBraceletCode }
    );
    
    if (normalizedBraceletCode) {
      await query(
        `UPDATE pulseiras SET status = @status, criancaId = @criancaId
         WHERE ${uidSqlExpression('codigo')} = @codigo AND empresaId = @empresaId`,
        { status: 'em_uso', criancaId: id, codigo: normalizedBraceletCode, empresaId: empresaId }
      );
    }
    
    await query(
      `UPDATE times SET points = (SELECT ISNULL(SUM(scores), 0) FROM criancas WHERE timeId = @timeId) 
       WHERE id = @timeId`,
      { timeId }
    );
    
    res.json({ id, name, nickname, age, avatar: avatarValue, braceletCode: normalizedBraceletCode, timeId, scores: 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Buscar criança por pulseira
router.get('/criancas/by-bracelet/:codigo', verifyToken, async (req, res) => {
  try {
    const normalizedCode = normalizeUid(req.params.codigo);
    if (!normalizedCode) {
      return res.status(400).json({ error: 'Código da pulseira inválido' });
    }

    const empresaId = req.user.empresaId;
    const crianca = await queryOne(`
      SELECT c.*, t.name as time_name, t.color as time_color 
      FROM criancas c
      LEFT JOIN times t ON c.timeId = t.id
      WHERE ${uidSqlExpression('c.codigoPulseira')} = @codigo
        AND (c.empresaId = @empresaId OR @isMaster = 1)
    `, { codigo: normalizedCode, empresaId, isMaster: isMaster(req) ? 1 : 0 });
    
    if (!crianca) {
      return res.status(404).json({ error: 'Criança não encontrada' });
    }
    res.json(crianca);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Atualizar criança
router.put('/eventos/:eventoId/criancas/:criancaId', verifyToken, async (req, res) => {
  try {
    const { name, nickname, age, avatar, braceletCode, timeId } = req.body;
    const normalizedBraceletCode = braceletCode ? normalizeUid(braceletCode) : null;
    const { eventoId, criancaId } = req.params;
    
    console.log(`📝 [RECEBIDO] Atualizando criança ${criancaId}`);
    console.log(`   - eventoId: ${eventoId}`);
    console.log(`   - braceletCode recebido: "${braceletCode}"`);
    console.log(`   - timeId: ${timeId}`);
    console.log(`   - name: ${name}`);
    
    // Verificar se criança existe
    const crianca = await queryOne('SELECT * FROM criancas WHERE id = @id AND eventoId = @eventoId AND (empresaId = @empresaId OR @isMaster = 1)', 
      { id: criancaId, eventoId, empresaId: req.user.empresaId, isMaster: isMaster(req) ? 1 : 0 });
    
    if (!crianca) {
      return res.status(404).json({ error: 'Criança não encontrada' });
    }

    const nextAvatar = avatar === undefined || avatar === crianca.avatar
      ? crianca.avatar
      : (isAdventurerAvatarId(avatar) ? avatar : null);
    if (nextAvatar === null) {
      return res.status(400).json({ error: 'Avatar inválido' });
    }

    const nextTimeId = timeId === undefined ? crianca.timeId : (timeId || null);
    if (nextTimeId) {
      const targetTime = await queryOne(
        `SELECT id FROM times
         WHERE id = @timeId
           AND eventoId = @eventoId
           AND (empresaId = @empresaId OR @isMaster = 1)`,
        {
          timeId: nextTimeId,
          eventoId: eventoId,
          empresaId: crianca.empresaId,
          isMaster: isMaster(req) ? 1 : 0,
        }
      );
      if (!targetTime) {
        return res.status(400).json({ error: 'Time não pertence ao evento selecionado' });
      }
    }
    
    // Se está mudando de pulseira, verificar se a nova pulseira existe e está disponível
    if (normalizedBraceletCode && normalizedBraceletCode !== normalizeUid(crianca.codigoPulseira || '')) {
      // Verificar se outra criança já tem essa pulseira
      const existing = await queryOne(
        `SELECT id FROM criancas WHERE ${uidSqlExpression('codigoPulseira')} = @codigo AND id != @criancaId`, 
        { codigo: normalizedBraceletCode, criancaId: criancaId }
      );
      if (existing) {
        console.error(`❌ Pulseira ${normalizedBraceletCode} já vinculada a outra criança`);
        return res.status(400).json({ error: 'Pulseira já está vinculada a outra criança' });
      }
      
      // Verificar se pulseira existe
      const pulseira = await queryOne(
        `SELECT * FROM pulseiras WHERE ${uidSqlExpression('codigo')} = @codigo AND empresaId = @empresaId`,
        { codigo: normalizedBraceletCode, empresaId: crianca.empresaId }
      );
      if (!pulseira) {
        console.error(`❌ Pulseira ${normalizedBraceletCode} não encontrada`);
        return res.status(400).json({ error: 'Pulseira não encontrada' });
      }
      
      // Atualizar status da pulseira antiga para 'disponível' (se existia)
      if (crianca.codigoPulseira) {
        const oldCode = normalizeUid(crianca.codigoPulseira);
        await query(
          `UPDATE pulseiras SET status = @status, criancaId = NULL
           WHERE ${uidSqlExpression('codigo')} = @codigo AND empresaId = @empresaId`,
          { status: 'disponivel', codigo: oldCode, empresaId: crianca.empresaId }
        );
        console.log(`   → Pulseira anterior ${oldCode} marcada como disponível`);
      }
      
      // Marcar pulseira nova como 'em_uso'
      await query(
        `UPDATE pulseiras SET status = @status, criancaId = @criancaId
         WHERE ${uidSqlExpression('codigo')} = @codigo AND empresaId = @empresaId`,
        { status: 'em_uso', criancaId: criancaId, codigo: normalizedBraceletCode, empresaId: crianca.empresaId }
      );
      console.log(`   → Pulseira ${normalizedBraceletCode} marcada como em_uso`);
    }
    
    // Atualizar criança
    await query(
      `UPDATE criancas SET 
        name = @name, 
        nickname = @nickname, 
        age = @age, 
        avatar = @avatar, 
        codigoPulseira = @braceletCode,
        timeId = @timeId
       WHERE id = @criancaId 
       AND eventoId = @eventoId
       AND empresaId = @empresaId`,
      { 
        name: name || crianca.name, 
        nickname: nickname || crianca.nickname, 
        age: age ? parseInt(age) : crianca.age, 
        avatar: nextAvatar,
        braceletCode: normalizedBraceletCode,
        criancaId: criancaId,
        eventoId: eventoId,
        empresaId: crianca.empresaId,
        timeId: nextTimeId
      }
    );

    const affectedTeamIds = [...new Set([crianca.timeId, nextTimeId].filter(Boolean))];
    for (const affectedTeamId of affectedTeamIds) {
      await query(
        `UPDATE times
         SET points = (SELECT ISNULL(SUM(scores), 0) FROM criancas WHERE timeId = @timeId)
         WHERE id = @timeId`,
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
router.delete('/eventos/:eventoId/criancas/:criancaId', verifyToken, async (req, res) => {
  try {
    const allowedRoles = ['admin', 'reception', 'game_master'];
    if (!isMaster(req) && !allowedRoles.includes(req.user?.role)) {
      return res.status(403).json({ error: 'Acesso negado para excluir participantes' });
    }

    const { eventoId, criancaId } = req.params;
    const crianca = await queryOne(
      `SELECT * FROM criancas
       WHERE id = @criancaId
       AND eventoId = @eventoId
       AND (empresaId = @empresaId OR @isMaster = 1)`,
      {
        criancaId: criancaId,
        eventoId: eventoId,
        empresaId: req.user.empresaId,
        isMaster: isMaster(req) ? 1 : 0
      }
    );

    if (!crianca) {
      return res.status(404).json({ error: 'Participante não encontrado' });
    }

    // Liberar a pulseira antes de remover a criança por causa da FK pulseiras.criancaId.
    await query(
      `UPDATE pulseiras
       SET status = @status, criancaId = NULL
       WHERE criancaId = @criancaId
       AND empresaId = @empresaId`,
      { status: 'disponivel', criancaId: criancaId, empresaId: crianca.empresaId }
    );

    // Remover registros que possuem FK obrigatória para a criança.
    await query('DELETE FROM crianca_conquistas WHERE criancaId = @criancaId', { criancaId: criancaId });
    await query('DELETE FROM caca_tesouro_scans WHERE criancaId = @criancaId', { criancaId: criancaId });
    await query('DELETE FROM pontuacoes WHERE criancaId = @criancaId', { criancaId: criancaId });
    await query('DELETE FROM leituras WHERE criancaId = @criancaId', { criancaId: criancaId });

    // Manter a pontuação do time consistente com a remoção do participante.
    if (crianca.timeId && crianca.scores) {
      await query(
        `UPDATE times
         SET points = CASE
           WHEN points >= @scores THEN points - @scores
           ELSE 0
         END
         WHERE id = @timeId AND eventoId = @eventoId`,
        { scores: crianca.scores, timeId: crianca.timeId, eventoId: eventoId }
      );
    }

    await query(
      `DELETE FROM criancas
       WHERE id = @criancaId
       AND eventoId = @eventoId
       AND empresaId = @empresaId`,
      { criancaId: criancaId, eventoId: eventoId, empresaId: crianca.empresaId }
    );

    console.log(`✅ Participante ${crianca.name} (${criancaId}) excluído do evento ${eventoId}`);
    res.json({ ok: true, message: 'Participante excluído com sucesso' });
  } catch (err) {
    console.error('❌ Erro ao excluir participante:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Desvincular pulseira
router.post('/:criancaId/unassign-bracelet', verifyToken, async (req, res) => {
  try {
    const allowedRoles = ['admin', 'reception', 'game_master'];
    if (!isMaster(req) && !allowedRoles.includes(req.user?.role)) {
      return res.status(403).json({ error: 'Acesso negado para desvincular pulseiras' });
    }
    const { criancaId } = req.params;
    const crianca = await queryOne(
      `SELECT * FROM criancas
       WHERE id = @id AND (empresaId = @empresaId OR @isMaster = 1)`,
      { id: criancaId, empresaId: req.user.empresaId, isMaster: isMaster(req) ? 1 : 0 }
    );
    
    if (!crianca) {
      return res.status(404).json({ error: 'Criança não encontrada' });
    }
    
    if (!crianca.codigoPulseira) {
      return res.status(400).json({ error: 'Criança não possui pulseira associada' });
    }
    
    const braceletCode = crianca.codigoPulseira;
    
    await query(
      `UPDATE criancas SET codigoPulseira = NULL
       WHERE id = @criancaId AND (empresaId = @empresaId OR @isMaster = 1)`,
      { criancaId: criancaId, empresaId: crianca.empresaId, isMaster: isMaster(req) ? 1 : 0 }
    );
    
    // ✅ NOVO: Atualizar status da pulseira de volta para "disponível"
    await query(
      `UPDATE pulseiras SET status = @status, criancaId = NULL
       WHERE ${uidSqlExpression('codigo')} = @codigo AND empresaId = @empresaId`,
      { status: 'disponivel', codigo: normalizeUid(braceletCode), empresaId: crianca.empresaId }
    );
    
    console.log(`✅ Pulseira ${braceletCode} desvinculada de ${crianca.name} e marcada como disponível`);
    
    res.json({ ok: true, message: 'Pulseira desvinculada com sucesso' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ NOVO: Gerar/Regenerar QR Code para uma criança
router.post('/:criancaId/generate-qrcode', verifyToken, async (req, res) => {
  try {
    const { criancaId } = req.params;
    
    // Validar acesso
    const crianca = await queryOne(
      `SELECT * FROM criancas
       WHERE id = @id AND (empresaId = @empresaId OR @isMaster = 1)`,
      { id: criancaId, empresaId: req.user.empresaId, isMaster: isMaster(req) ? 1 : 0 }
    );
    
    if (!crianca) {
      return res.status(404).json({ error: 'Criança não encontrada' });
    }

    // Gerar novo QR Code
    const qrCodeData = await createQRCodeForChild(criancaId);

    // Salvar na tabela criancas
    await query(
      `UPDATE criancas SET qrcode = @qrcode 
       WHERE id = @criancaId AND (empresaId = @empresaId OR @isMaster = 1)`,
      { 
        qrcode: qrCodeData.qrCode, 
        criancaId, 
        empresaId: req.user.empresaId,
        isMaster: isMaster(req) ? 1 : 0
      }
    );

    console.log(`✅ QR Code gerado para criança ${crianca.name} (${criancaId}): ${qrCodeData.qrCode}`);

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
router.get('/:criancaId/qrcode-image', verifyToken, async (req, res) => {
  try {
    const { criancaId } = req.params;
    
    // Validar acesso
    const crianca = await queryOne(
      `SELECT * FROM criancas
       WHERE id = @id AND (empresaId = @empresaId OR @isMaster = 1)`,
      { id: criancaId, empresaId: req.user.empresaId, isMaster: isMaster(req) ? 1 : 0 }
    );
    
    if (!crianca) {
      return res.status(404).json({ error: 'Criança não encontrada' });
    }

    // Se não tem QR Code, gerar um
    let qrCode = crianca.qrcode;
    if (!qrCode) {
      const qrCodeData = await createQRCodeForChild(criancaId);
      qrCode = qrCodeData.qrCode;
      
      // Salvar na tabela
      await query(
        `UPDATE criancas SET qrcode = @qrcode 
         WHERE id = @criancaId AND (empresaId = @empresaId OR @isMaster = 1)`,
        { 
          qrcode: qrCode, 
          criancaId, 
          empresaId: req.user.empresaId,
          isMaster: isMaster(req) ? 1 : 0
        }
      );
      
      console.log(`✅ QR Code auto-gerado para criança ${crianca.name} (${criancaId}): ${qrCode}`);
    }

    // Gerar imagem do QR Code existente
    const { generateQRCodeImage } = require('../utils/qrcode');
    const trackingUrl = generateParentTrackingUrl(qrCode, criancaId);
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
router.post('/eventos/:eventoId/generate-qrcodes-batch', verifyToken, async (req, res) => {
  try {
    const allowedRoles = ['admin', 'reception', 'game_master'];
    if (!isMaster(req) && !allowedRoles.includes(req.user?.role)) {
      return res.status(403).json({ error: 'Acesso negado para esta operação em lote' });
    }

    const { eventoId } = req.params;

    // Validar que o evento pertence à empresa
    const evento = await queryOne('SELECT * FROM eventos WHERE id = @eventoId AND (empresaId = @empresaId OR @isMaster = 1)', 
      { eventoId, empresaId: req.user.empresaId, isMaster: isMaster(req) ? 1 : 0 });
    
    if (!evento) {
      return res.status(404).json({ error: 'Evento não encontrado' });
    }

    // Buscar todas as crianças sem QR Code
    const criancasSemQR = await allQuery(
      `SELECT id, name FROM criancas 
       WHERE eventoId = @eventoId 
       AND (qrcode IS NULL OR qrcode = '')
       AND empresaId = @empresaId`,
      { eventoId, empresaId: evento.empresaId }
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
          `UPDATE criancas SET qrcode = @qrcode 
           WHERE id = @criancaId`,
          { qrcode: qrCodeData.qrCode, criancaId: crianca.id }
        );

        results.push({
          criancaId: crianca.id,
          crianca_name: crianca.name,
          qrCode: qrCodeData.qrCode,
          success: true,
        });

        console.log(`✅ QR Code gerado para ${crianca.name}: ${qrCodeData.qrCode}`);
      } catch (err) {
        console.error(`❌ Erro ao gerar QR Code para ${crianca.name}:`, err.message);
        results.push({
          criancaId: crianca.id,
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
