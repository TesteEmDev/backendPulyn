const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

/**
 * Gera um código único para QR Code
 * Formato: PULYN-[8 caracteres aleatórios]
 */
function generateQRCode() {
  const randomPart = crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 8);
  return `PULYN-${randomPart}`;
}

/**
 * Cria a URL para acompanhamento do filho
 * @param {string} qrCodeValue - O código do QR Code
 * @param {string} criancaId - ID da criança
 * @param {string} baseUrl - URL base do frontend (ex: https://app.pulyn.com)
 */
function generateParentTrackingUrl(qrCodeValue, criancaId, baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000') {
  // Criar um token seguro para acesso ao desempenho da criança
  const token = Buffer.from(`${criancaId}:${qrCodeValue}`).toString('base64');
  return `${baseUrl}/child-performance/${token}`;
}

/**
 * Gera a imagem PNG do QR Code
 * @param {string} trackingUrl - URL que será codificada no QR
 * @returns {Promise<Buffer>} Buffer da imagem PNG
 */
async function generateQRCodeImage(trackingUrl) {
  try {
    const qrCodeImage = await QRCode.toBuffer(trackingUrl, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      quality: 0.95,
      margin: 2,
      width: 300,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
    });
    return qrCodeImage;
  } catch (error) {
    console.error('❌ Erro ao gerar imagem QR Code:', error);
    throw error;
  }
}

/**
 * Gera URL com dados do QR Code SVG (para salvar como arquivo, por exemplo)
 * @param {string} trackingUrl - URL que será codificada no QR
 * @returns {Promise<string>} String SVG
 */
async function generateQRCodeSVG(trackingUrl) {
  try {
    const qrCodeSVG = await QRCode.toString(trackingUrl, {
      errorCorrectionLevel: 'H',
      type: 'svg',
      quality: 0.95,
      margin: 2,
      width: 300,
    });
    return qrCodeSVG;
  } catch (error) {
    console.error('❌ Erro ao gerar SVG QR Code:', error);
    throw error;
  }
}

/**
 * Completo: Gera código QR, cria URL de rastreamento e retorna a imagem
 * @param {string} criancaId - ID da criança
 * @param {string} baseUrl - URL base do frontend
 * @returns {Promise<{qrCode: string, trackingUrl: string, image: Buffer}>}
 */
async function createQRCodeForChild(criancaId, baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000') {
  try {
    const qrCode = generateQRCode();
    const trackingUrl = generateParentTrackingUrl(qrCode, criancaId, baseUrl);
    const image = await generateQRCodeImage(trackingUrl);

    return {
      qrCode,
      trackingUrl,
      image,
    };
  } catch (error) {
    console.error('❌ Erro ao criar QR Code para criança:', error);
    throw error;
  }
}

module.exports = {
  generateQRCode,
  generateParentTrackingUrl,
  generateQRCodeImage,
  generateQRCodeSVG,
  createQRCodeForChild,
};
