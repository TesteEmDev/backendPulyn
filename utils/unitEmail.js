// E-mails dos usuários de um buffet seguem o nome da unidade: "[usuario]@buffetadv.com".
// Mesma regra de src/utils/unitEmail.ts no frontend.

// "Buffet ADV" -> "buffetadv": sem acentos, espaços ou símbolos, em minúsculas.
function unitEmailSlug(unitName) {
  return String(unitName || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 63); // limite de um rótulo de domínio
}

// Retorna "buffetadv.com", ou null se o nome não gera um domínio (ex.: só símbolos).
function unitEmailDomain(unitName) {
  const slug = unitEmailSlug(unitName);
  return slug ? `${slug}.com` : null;
}

// Parte antes do @: letras minúsculas, números e . _ - (sem espaços, sem começar/terminar com símbolo).
const LOCAL_PART_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;

// Valida um e-mail completo contra o domínio da unidade.
// Retorna { email } normalizado (minúsculas) ou { error }.
function checkUnitEmail(email, unitName) {
  const value = String(email || '').trim().toLowerCase();
  const at = value.lastIndexOf('@');
  if (at < 1) return { error: 'E-mail inválido' };
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  if (local.length > 64 || !LOCAL_PART_PATTERN.test(local)) {
    return { error: 'Use só letras, números, ponto, hífen ou sublinhado antes do @, sem espaços' };
  }
  const expected = unitEmailDomain(unitName);
  if (expected && domain !== expected) {
    return { error: `O e-mail deve terminar com @${expected}` };
  }
  if (!expected && !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) return { error: 'E-mail inválido' };
  return { email: value };
}

module.exports = { unitEmailSlug, unitEmailDomain, checkUnitEmail, LOCAL_PART_PATTERN };
