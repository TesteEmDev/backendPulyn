// Telefone brasileiro: DDD + número, 10 dígitos (fixo) ou 11 (celular). Vazio é permitido.
// Mesma regra de src/utils/phone.ts no frontend. Retorna a mensagem de erro ou null.
function phoneError(text) {
  const digits = String(text ?? '').replace(/\D/g, '');
  if (digits.length === 0) return null;
  if (digits.length !== 10 && digits.length !== 11) return 'Telefone deve ter 10 ou 11 dígitos (DDD + número)';
  if (/^(\d)\1+$/.test(digits) || digits[0] === '0' || digits[1] === '0') return 'Telefone inválido';
  if (digits.length === 11 && digits[2] !== '9') return 'Celular com 11 dígitos deve começar com 9 depois do DDD';
  return null;
}

module.exports = { phoneError };
