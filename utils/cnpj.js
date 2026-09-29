// utils/cnpj.js - validação e formatação de CNPJ

const normalizeCnpj = (value) => String(value ?? '').replace(/\D/g, '');

function checkDigit(digits, length) {
  let sum = 0;
  let weight = length - 7;
  for (let i = length; i >= 1; i -= 1) {
    sum += Number(digits[length - i]) * weight;
    weight -= 1;
    if (weight < 2) weight = 9;
  }
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

// 14 dígitos, não repetidos, e os dois dígitos verificadores corretos.
function isValidCnpj(value) {
  const digits = normalizeCnpj(value);
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false;
  return checkDigit(digits, 12) === Number(digits[12]) && checkDigit(digits, 13) === Number(digits[13]);
}

function formatCnpj(value) {
  const digits = normalizeCnpj(value);
  if (digits.length !== 14) return digits;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

module.exports = { normalizeCnpj, isValidCnpj, formatCnpj };
