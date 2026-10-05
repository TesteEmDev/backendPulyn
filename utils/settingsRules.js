// Validação das configurações enviadas pela tela de Configurações.
const KEY_PATTERN = /^[a-z][a-z0-9_]{0,99}$/;
const MAX_VALUE_LENGTH = 1000;

// Telefone brasileiro: DDD + número, 10 dígitos (fixo) ou 11 (celular). Vazio é permitido.
// Mesma regra de src/utils/phone.ts no frontend.
function phoneError(text) {
  const digits = text.replace(/\D/g, '');
  if (digits.length === 0) return null;
  if (digits.length !== 10 && digits.length !== 11) return 'Telefone deve ter 10 ou 11 dígitos (DDD + número)';
  if (/^(\d)\1+$/.test(digits) || digits[0] === '0' || digits[1] === '0') return 'Telefone inválido';
  if (digits.length === 11 && digits[2] !== '9') return 'Celular com 11 dígitos deve começar com 9 depois do DDD';
  return null;
}

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
