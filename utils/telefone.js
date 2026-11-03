// utils/telefone.js - Telefone do responsável (celular ou fixo brasileiro, com DDD)
//
// Guarda só os dígitos (DDD + número, 10 ou 11 dígitos). Aceita máscara, espaços, parênteses e o +55 na frente.

// Devolve só os dígitos (sem o 55 do país) ou null quando não parece um telefone brasileiro com DDD.
function normalizarTelefone(valor) {
  let digitos = String(valor ?? '').replace(/\D/g, '');
  if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith('55')) digitos = digitos.slice(2);
  if (digitos.length !== 10 && digitos.length !== 11) return null;
  const ddd = Number(digitos.slice(0, 2));
  if (ddd < 11 || ddd > 99) return null;
  // Celular (11 dígitos) começa com 9; fixo (10 dígitos) começa de 2 a 5
  const primeiro = digitos[2];
  if (digitos.length === 11 && primeiro !== '9') return null;
  if (digitos.length === 10 && !'2345'.includes(primeiro)) return null;
  return digitos;
}

// (11) 91234-5678 / (11) 3234-5678
function formatarTelefone(digitos) {
  const d = String(digitos ?? '').replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
}

module.exports = { normalizarTelefone, formatarTelefone };
