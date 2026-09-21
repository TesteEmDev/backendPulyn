const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const { verifyToken } = require('../utils/middleware');
const { queryOne, query } = require('../database');
const { createQRCodeForChild } = require('../utils/qrcode');

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
      'SELECT id, name, evento_id, empresa_id FROM criancas WHERE id = @criancaId',
      { criancaId }
    );

    if (!crianca) {
      console.warn(`⚠️ [QRCode] Criança não encontrada: ${criancaId}`);
      return res.status(404).json({ error: 'Criança não encontrada' });
    }

    console.log(`✅ [QRCode] Criança encontrada: ${crianca.name}`);

    // Usar a função correta que gera URL de rastreamento + salva no banco
    const { qrCode, trackingUrl, image } = await createQRCodeForChild(
      criancaId,
      process.env.FRONTEND_URL || 'http://localhost:3000'
    );

    // Salvar código QR no banco para validação posterior
    await query(
      `INSERT INTO family_linking_codes (crianca_id, evento_id, empresa_id, qr_code_value, tracking_url, created_at, expires_at, status)
       VALUES (@criancaId, @eventoId, @empresaId, @qrCode, @trackingUrl, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '24 hours', 'active')`,
      {
        criancaId,
        eventoId: crianca.evento_id,
        empresaId: crianca.empresa_id,
        qrCode,
        trackingUrl
      }
    );

    console.log(`✅ [QRCode] QR Code salvo no banco: ${qrCode}`);

    res.json({
      qrCodeDataUrl: `data:image/png;base64,${image.toString('base64')}`,
      qrCode,
      trackingUrl,
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
      'SELECT id, name, evento_id, empresa_id FROM criancas WHERE id = @criancaId',
      { criancaId }
    );

    if (!crianca) {
      console.warn(`⚠️ [QRCode] Criança não encontrada: ${criancaId}`);
      return res.status(404).json({ error: 'Criança não encontrada' });
    }

    console.log(`✅ [QRCode] Criança encontrada: ${crianca.name}`);

    // Usar a função correta que gera URL de rastreamento + salva no banco
    const { qrCode, trackingUrl, image } = await createQRCodeForChild(
      criancaId,
      process.env.FRONTEND_URL || 'http://localhost:3000'
    );

    // Salvar código QR no banco para validação posterior
    await query(
      `INSERT INTO family_linking_codes (crianca_id, evento_id, empresa_id, qr_code_value, tracking_url, created_at, expires_at, status)
       VALUES (@criancaId, @eventoId, @empresaId, @qrCode, @trackingUrl, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '24 hours', 'active')`,
      {
        criancaId,
        eventoId: crianca.evento_id,
        empresaId: crianca.empresa_id,
        qrCode,
        trackingUrl
      }
    );

    console.log(`✅ [QRCode] QR Code salvo no banco: ${qrCode}`);

    res.json({
      qrCodeDataUrl: `data:image/png;base64,${image.toString('base64')}`,
      qrCode,
      trackingUrl,
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
