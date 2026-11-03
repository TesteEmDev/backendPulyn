// utils/senhas.js - guarda e confere senhas de conta.
//
// Contas antigas guardam a senha em base64 (codificação, não proteção). Contas novas e as que trocam a senha
// guardam um hash scrypt com sal aleatório. O login aceita os dois formatos e, quando a senha antiga confere,
// troca o registro para o hash novo.
const crypto = require('crypto');

const PREFIXO = 'scrypt$';
const TAMANHO_CHAVE = 64;
const MINIMO_SENHA = 6; // o mesmo mínimo do cadastro (routes/auth.js)

const base64 = (senha) => Buffer.from(String(senha)).toString('base64');

function hashSenha(senha) {
  const sal = crypto.randomBytes(16);
  const chave = crypto.scryptSync(String(senha), sal, TAMANHO_CHAVE);
  return `${PREFIXO}${sal.toString('hex')}$${chave.toString('hex')}`;
}

function verificarSenha(digitada, armazenada) {
  if (!armazenada || digitada === undefined || digitada === null) return false;
  const guardada = String(armazenada);

  if (guardada.startsWith(PREFIXO)) {
    const [, salHex, chaveHex] = guardada.split('$');
    const hex = /^([0-9a-f]{2})+$/i;
    if (!hex.test(salHex || '') || !hex.test(chaveHex || '')) return false;
    const esperada = Buffer.from(chaveHex, 'hex');
    const calculada = crypto.scryptSync(String(digitada), Buffer.from(salHex, 'hex'), esperada.length);
    return esperada.length === calculada.length && crypto.timingSafeEqual(esperada, calculada);
  }

  // Formato antigo (base64). Comparação em tempo constante para não vazar pelo tempo de resposta.
  const esperada = Buffer.from(guardada);
  const calculada = Buffer.from(base64(digitada));
  return esperada.length === calculada.length && crypto.timingSafeEqual(esperada, calculada);
}

// Verdadeiro quando a senha guardada ainda está no formato antigo e deve ser trocada pelo hash novo.
const precisaAtualizar = (armazenada) => !String(armazenada || '').startsWith(PREFIXO);

// Regra mínima para senha nova. Mantida em um lugar só para o cadastro, a troca e a exclusão falarem a mesma língua.
function validarSenhaNova(senha) {
  const texto = String(senha || '');
  if (texto.length < MINIMO_SENHA) return `A nova senha precisa ter pelo menos ${MINIMO_SENHA} caracteres`;
  if (texto.length > 128) return 'A nova senha é longa demais';
  return null;
}

module.exports = { hashSenha, verificarSenha, precisaAtualizar, validarSenhaNova, MINIMO_SENHA };
