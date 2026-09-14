const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const { verifyToken } = require('../utils/middleware');
const { queryOne } = require('../database');

/**
 * Gerar QR Code para uma criança
 * GET /api/qrcode/generate/:criancaId
 */
router.get('/generate/:criancaId', verifyToken, async (req, res) => {
  try {
    const { criancaId } = req.params;

    console.log(`📊 [QRCode] Gerando QR Code para criança: ${criancaId}`);

    if (!criancaId || criancaId.trim() === '') {
      return res.status(400).json({ error: 'ID da criança é obrigatório' });
    }

    // Buscar informações da criança
    const crianca = await queryOne(
      'SELECT id, name, evento_id FROM criancas WHERE id = @criancaId',
      { criancaId }
    );

    if (!crianca) {
      console.warn(`⚠️ [QRCode] Criança não encontrada: ${criancaId}`);
      return res.status(404).json({ error: 'Criança não encontrada' });
    }

    console.log(`✅ [QRCode] Criança encontrada: ${crianca.name}`);

    // Gerar QR Code com o ID da criança
    // O QR Code conterá: criancaId:eventoId:nome
    const qrData = JSON.stringify({
      criancaId: crianca.id,
      eventoId: crianca.evento_id,
      name: crianca.name,
      timestamp: new Date().toISOString(),
    });

    console.log(`🔄 [QRCode] Gerando imagem do QR Code com dados:`, qrData);

    // Gerar QR Code como Data URL (base64)
    const qrCodeDataUrl = await QRCode.toDataURL(qrData, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      quality: 0.95,
      margin: 2,
      width: 300,
    });

    console.log(`✅ [QRCode] QR Code gerado com sucesso para ${crianca.name}`);

    res.json({
      qrCodeDataUrl,
      criancaId: crianca.id,
      criancaNome: crianca.name,
      eventoId: crianca.evento_id,
    });
  } catch (error) {
    console.error('❌ [QRCode] Erro ao gerar QR Code:', error);
    res.status(500).json({ error: 'Erro ao gerar QR Code: ' + error.message });
  }
});

/**
 * Buscar QR Code de uma criança (atalho)
 * GET /api/qrcode/:criancaId
 */
router.get('/:criancaId', verifyToken, async (req, res) => {
  try {
    const { criancaId } = req.params;

    console.log(`📊 [QRCode] Buscando QR Code para criança: ${criancaId}`);

    if (!criancaId || criancaId.trim() === '') {
      return res.status(400).json({ error: 'ID da criança é obrigatório' });
    }

    // Buscar informações da criança
    const crianca = await queryOne(
      'SELECT id, name, evento_id FROM criancas WHERE id = @criancaId',
      { criancaId }
    );

    if (!crianca) {
      console.warn(`⚠️ [QRCode] Criança não encontrada: ${criancaId}`);
      return res.status(404).json({ error: 'Criança não encontrada' });
    }

    console.log(`✅ [QRCode] Criança encontrada: ${crianca.name}`);

    // Gerar QR Code com o ID da criança
    const qrData = JSON.stringify({
      criancaId: crianca.id,
      eventoId: crianca.evento_id,
      name: crianca.name,
      timestamp: new Date().toISOString(),
    });

    console.log(`🔄 [QRCode] Gerando imagem do QR Code com dados:`, qrData);

    // Gerar QR Code como Data URL (base64)
    const qrCodeDataUrl = await QRCode.toDataURL(qrData, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      quality: 0.95,
      margin: 2,
      width: 300,
    });

    console.log(`✅ [QRCode] QR Code gerado com sucesso para ${crianca.name}`);

    res.json({
      qrCodeDataUrl,
      criancaId: crianca.id,
      criancaNome: crianca.name,
      eventoId: crianca.evento_id,
    });
  } catch (error) {
    console.error('❌ [QRCode] Erro ao buscar QR Code:', error);
    res.status(500).json({ error: 'Erro ao buscar QR Code: ' + error.message });
  }
});

module.exports = router;
