// utils/codigoConvite.js - Código do convite de família: 8 dígitos hexadecimais (ex.: A3F09C12).
//
// Antes o convite era um token de 64 caracteres, só usável por link. O código curto é digitado no app.
// É guardado em minúsculas (só o hash vai para o banco) e mostrado em maiúsculas; ao ler, não diferencia
// maiúsculas, espaços nem hífen (digitado como "a3f0 9c12" ou "A3F0-9C12" vale). Convites antigos, de 64
// caracteres, continuam valendo até vencerem.
const crypto = require('crypto');

const CODIGO_CURTO = /^[0-9a-f]{8}$/;
const TAMANHO_MINIMO_ANTIGO = 32;

// 4 bytes aleatórios = 8 dígitos hexadecimais, em minúsculas (a forma guardada).
function gerarCodigo() {
  return crypto.randomBytes(4).toString('hex');
}

// A forma única que vira hash: código curto limpo e em minúsculas; qualquer outra coisa (token antigo) fica como veio.
function normalizarCodigo(entrada) {
  const texto = String(entrada ?? '').trim();
  const curto = texto.replace(/[\s-]/g, '').toLowerCase();
  return CODIGO_CURTO.test(curto) ? curto : texto;
}

// É um código curto (8 dígitos hexadecimais, já normalizado)? Só ele pode ser o código fixo de um evento.
function ehCodigoCurto(codigo) {
  return CODIGO_CURTO.test(String(codigo ?? ''));
}

// Vale a pena consultar o banco? Descarta de cara o que não é código curto nem token antigo.
function formatoValido(entrada) {
  const codigo = normalizarCodigo(entrada);
  return CODIGO_CURTO.test(codigo) || codigo.length >= TAMANHO_MINIMO_ANTIGO;
}

// Como o código aparece para as pessoas.
function exibirCodigo(codigo) {
  return String(codigo).toUpperCase();
}

module.exports = { gerarCodigo, normalizarCodigo, ehCodigoCurto, formatoValido, exibirCodigo };
