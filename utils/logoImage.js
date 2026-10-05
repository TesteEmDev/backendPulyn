// Validação da logo/foto da unidade enviada pela tela de Configurações.
// A imagem é guardada como data URL (igual à planta do evento) e já chega reduzida pelo frontend.
const MAX_LOGO_LENGTH = 1.5 * 1024 * 1024; // caracteres do data URL
const DATA_URL_PATTERN = /^data:(image\/(?:png|jpeg|webp|gif|svg\+xml));base64,([A-Za-z0-9+/]+={0,2})$/;

// Retorna { value: { dataUrl, name, type } } ou { error }. O tipo vem do próprio data URL,
// não do que o cliente declarou.
function parseLogoPayload(body) {
  const { dataUrl, name } = body || {};
  if (typeof dataUrl !== 'string') return { error: 'Envie a imagem como data URL' };
  if (dataUrl.length > MAX_LOGO_LENGTH) {
    return { error: 'A imagem é muito grande. Use uma imagem menor (até cerca de 1 MB).' };
  }
  const match = DATA_URL_PATTERN.exec(dataUrl);
  if (!match) return { error: 'Use uma imagem PNG, JPG, WEBP, GIF ou SVG válida' };
  return {
    value: {
      dataUrl,
      name: String(name || 'logo-da-unidade').trim().slice(0, 255) || 'logo-da-unidade',
      type: match[1],
    },
  };
}

module.exports = { parseLogoPayload, MAX_LOGO_LENGTH };
