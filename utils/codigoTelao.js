// utils/codigoTelao.js - Código do link do telão (/telao/<código>)
//
// 18 bytes aleatórios em base64url = 24 caracteres (144 bits): não dá para adivinhar por tentativa e erro.
// Quem tem o link tem o acesso do telão daquele buffet; trocar o código fecha o link antigo.
const crypto = require('crypto');

const FORMATO = /^[A-Za-z0-9_-]{24,40}$/;

function gerarCodigoTelao() {
  return crypto.randomBytes(18).toString('base64url');
}

// Devolve o código sem espaços, ou '' quando não tem cara de código (evita ir ao banco com lixo).
function normalizarCodigoTelao(valor) {
  const codigo = String(valor ?? '').trim();
  return FORMATO.test(codigo) ? codigo : '';
}

module.exports = { gerarCodigoTelao, normalizarCodigoTelao };
