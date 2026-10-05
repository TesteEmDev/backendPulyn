// Validação das configurações enviadas pela tela de Configurações.
const KEY_PATTERN = /^[a-z][a-z0-9_]{0,99}$/;
const MAX_VALUE_LENGTH = 1000;
const { phoneError } = require('./phone');

const FIELD_VALIDATORS = { unit_phone: phoneError };

// Aceita um objeto { chave: valor }. Retorna { entries } com os pares normalizados
// (valor sempre string) ou { error } descrevendo o primeiro problema.
function parseSettingsPayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Envie as configurações como um objeto chave/valor' };
  }
  const entries = [];
  for (const [key, value] of Object.entries(body)) {
    if (!KEY_PATTERN.test(key)) return { error: `Nome de configuração inválido: ${key}` };
    if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) {
      return { error: `Valor inválido para ${key}` };
    }
    const text = value === null ? '' : String(value).trim();
    if (text.length > MAX_VALUE_LENGTH) return { error: `Valor de ${key} excede ${MAX_VALUE_LENGTH} caracteres` };
    const fieldError = FIELD_VALIDATORS[key]?.(text);
    if (fieldError) return { error: fieldError };
    entries.push([key, text]);
  }
  if (entries.length === 0) return { error: 'Nenhuma configuração enviada' };
  return { entries };
}

module.exports = { parseSettingsPayload, KEY_PATTERN, MAX_VALUE_LENGTH };
