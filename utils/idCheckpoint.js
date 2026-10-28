// utils/idCheckpoint.js - regras do ID que o ESP32 aceita na página /config (espelham idValido em config_remota.h).
//
// O ID tem de ter de 1 a 16 caracteres, só letras, números, - e _. Quando o mesmo ID já existe em outro buffet, a chave
// vira "<código do buffet>-<ID>" (ver codigoBuffet.js), e essa chave também precisa caber nos 16 caracteres.

const LIMITE_ID_ESP32 = 16;
const PADRAO_ID_ESP32 = /^[A-Za-z0-9_-]+$/;

// Devolve a mensagem de erro do ID digitado, ou null se o ESP32 aceita.
function validarCodigoCheckpoint(codigo) {
  if (codigo.length < 1 || codigo.length > LIMITE_ID_ESP32 || !PADRAO_ID_ESP32.test(codigo)) {
    return `O ID do checkpoint deve ter de 1 a ${LIMITE_ID_ESP32} caracteres, só letras, números, - ou _ (é o que o ESP32 aceita)`;
  }
  return null;
}

function chaveComCodigoDoBuffet(codigo, codigoBuffet) {
  return `${codigoBuffet}-${codigo}`;
}

function cabeNoEsp32(chave) {
  return String(chave).length <= LIMITE_ID_ESP32;
}

// Maior ID que ainda cabe na chave com o código do buffet na frente.
function tamanhoMaximoComCodigoDoBuffet(codigoBuffet) {
  return LIMITE_ID_ESP32 - (String(codigoBuffet).length + 1);
}

module.exports = {
  LIMITE_ID_ESP32,
  validarCodigoCheckpoint,
  chaveComCodigoDoBuffet,
  cabeNoEsp32,
  tamanhoMaximoComCodigoDoBuffet,
};
