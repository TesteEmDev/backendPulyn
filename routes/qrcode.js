const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const { verifyToken } = require('../utils/middleware');
const { queryOne, query } = require('../database');
const { createQRCodeForChild } = require('../utils/qrcode');

/**
 * 🌐 Detectar URL base automaticamente (funciona em localhost, dev e Render)
 */
const getBaseUrl = () => {
  // Prioridade 1: Variável de ambiente explícita
  if (process.env.FRONTEND_URL) {
    console.log(`🌐 [QRCode] Usando FRONTEND_URL: ${process.env.FRONTEND_URL}`);
    return process.env.FRONTEND_URL;
  }

  // Prioridade 2: URL do Render (automática)
  if (process.env.RENDER_EXTERNAL_URL) {
    console.log(`🌐 [QRCode] Usando RENDER_EXTERNAL_URL: ${process.env.RENDER_EXTERNAL_URL}`);
    return process.env.RENDER_EXTERNAL_URL;
  }

  // Prioridade 3: Ambiente de produção
  if (process.env.NODE_ENV === 'production') {
    console.log(`🌐 [QRCode] Produção detectada, usando Render URL`);
    return 'https://backendpulyn.onrender.com';
  }

  // Fallback: Local
  console.log(`🌐 [QRCode] Usando localhost (desenvolvimento)`);
  return 'http://localhost:3000';
};

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
      'SELECT id, name, eventoId, empresaId FROM criancas WHERE id = @criancaId',
      { criancaId }
    );

    if (!crianca) {
      console.warn(`⚠️ [QRCode] Criança não encontrada: ${criancaId}`);
      return res.status(404).json({ error: 'Criança não encontrada' });
    }

    console.log(`✅ [QRCode] Criança encontrada: ${crianca.name}`);

    // ✅ Usar a função que detecta URL automaticamente
    const baseUrl = getBaseUrl();
    console.log(`📌 [QRCode] URL base para QR: ${baseUrl}`);

    const { qrCode, trackingUrl, image } = await createQRCodeForChild(
      criancaId,
      baseUrl
    );

    // Salvar código QR no banco para validação posterior
    await query(
      `INSERT INTO familyLinkingCodes (criancaId, eventoId, empresaId, qr_code_value, tracking_url, criadoEm, expiramEm, status)
       VALUES (@criancaId, @eventoId, @empresaId, @qrCode, @trackingUrl, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '24 hours', 'active')`,
      {
        criancaId,
        eventoId: crianca.eventoId,
        empresaId: crianca.empresaId,
        qrCode,
        trackingUrl
      }
    );

    console.log(`✅ [QRCode] QR Code salvo no banco: ${qrCode}`);
    console.log(`✅ [QRCode] Tracking URL: ${trackingUrl}`);

    res.json({
      qrCodeDataUrl: `data:image/png;base64,${image.toString('base64')}`,
      qrCode,
      trackingUrl,
      criancaId: crianca.id,
      criancaNome: crianca.name,
      eventoId: crianca.eventoId,
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
      'SELECT id, name, eventoId, empresaId FROM criancas WHERE id = @criancaId',
      { criancaId }
    );

    if (!crianca) {
      console.warn(`⚠️ [QRCode] Criança não encontrada: ${criancaId}`);
      return res.status(404).json({ error: 'Criança não encontrada' });
    }

    console.log(`✅ [QRCode] Criança encontrada: ${crianca.name}`);

    // ✅ Usar a função que detecta URL automaticamente
    const baseUrl = getBaseUrl();
    console.log(`📌 [QRCode] URL base para QR: ${baseUrl}`);

    const { qrCode, trackingUrl, image } = await createQRCodeForChild(
      criancaId,
      baseUrl
    );

    // Salvar código QR no banco para validação posterior
    await query(
      `INSERT INTO familyLinkingCodes (criancaId, eventoId, empresaId, qr_code_value, tracking_url, criadoEm, expiramEm, status)
       VALUES (@criancaId, @eventoId, @empresaId, @qrCode, @trackingUrl, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '24 hours', 'active')`,
      {
        criancaId,
        eventoId: crianca.eventoId,
        empresaId: crianca.empresaId,
        qrCode,
        trackingUrl
      }
    );

    console.log(`✅ [QRCode] QR Code salvo no banco: ${qrCode}`);
    console.log(`✅ [QRCode] Tracking URL: ${trackingUrl}`);

    res.json({
      qrCodeDataUrl: `data:image/png;base64,${image.toString('base64')}`,
      qrCode,
      trackingUrl,
      criancaId: crianca.id,
      criancaNome: crianca.name,
      eventoId: crianca.eventoId,
    });
  } catch (error) {
    console.error('❌ [QRCode] Erro ao buscar QR Code:', error);
    res.status(500).json({ error: 'Erro ao buscar QR Code: ' + error.message });
  }
});

module.exports = router;