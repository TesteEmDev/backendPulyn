// utils/pulseiraTransferencia.js - Envio de pulseiras do master para os buffets (estoque -> pendente -> aceito, e devolução)
//
// A pulseira do estoque do master é uma linha de `pulseira` na empresa dele. Ao enviar, continua com o master (pendente) até o
// admin do buffet aceitar; aí a linha passa a ser do buffet. Devolver faz o caminho de volta, desde que ninguém esteja
// usando a pulseira.
const { v4: uuidv4 } = require('uuid');
const { normalizeUid } = require('./uid');

const STATUS = Object.freeze({ ESTOQUE: 'estoque', PENDENTE: 'pendente', ACEITO: 'aceito' });
const LIMITE_POR_PEDIDO = 1000;

// Lista de códigos vinda da tela (leitura, digitação ou colagem): normaliza, tira vazios e repetidos.
// Devolve { codigos, invalidos } ou { erro }.
function lerCodigos(entrada) {
  const bruto = Array.isArray(entrada) ? entrada : String(entrada ?? '').split(/[\s,;]+/);
  if (bruto.length > LIMITE_POR_PEDIDO) return { erro: `Envie no máximo ${LIMITE_POR_PEDIDO} pulseiras por vez` };
  const codigos = [];
  const invalidos = [];
  const vistos = new Set();
  for (const item of bruto) {
    if (String(item ?? '').trim() === '') continue;
    const codigo = normalizeUid(item);
    // Uma pulseira NFC/UHF tem de 4 a 24 dígitos hexadecimais
    if (codigo.length < 4 || codigo.length > 24) { invalidos.push(String(item)); continue; }
    if (vistos.has(codigo)) continue;
    vistos.add(codigo);
    codigos.push(codigo);
  }
  return { codigos, invalidos };
}

// "IN (@c0, @c1, ...)" com os parâmetros correspondentes
function listaDeParametros(codigos, prefixo = 'c') {
  const params = {};
  const marcadores = codigos.map((codigo, i) => {
    params[`${prefixo}${i}`] = codigo;
    return `@${prefixo}${i}`;
  });
  return { marcadores: marcadores.join(', '), params };
}

// Registra um passo no histórico (usado para os totais de envios)
function registrarMovimento(db, { codigo, tipo, empresaOrigemId = null, empresaDestinoId = null, porNome = null }) {
  return db.query(
    `INSERT INTO pulseiraMovimento (id, codigo, tipo, empresaOrigemId, empresaDestinoId, porNome)
     VALUES (@id, @codigo, @tipo, @empresaOrigemId, @empresaDestinoId, @porNome)`,
    { id: uuidv4(), codigo, tipo, empresaOrigemId, empresaDestinoId, porNome }
  );
}

module.exports = { STATUS, LIMITE_POR_PEDIDO, lerCodigos, listaDeParametros, registrarMovimento };
