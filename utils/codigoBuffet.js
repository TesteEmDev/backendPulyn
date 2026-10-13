// utils/codigoBuffet.js - código curto de cada buffet (empresa), usado para diferenciar checkpoints de buffets distintos.
//
// O ID que o recreacionista dá ao checkpoint (ex.: 12) é único DENTRO do buffet, mas pode se repetir entre buffets.
// Internamente a chave continua global (pontoVerificacao.checkpointId, usada pelo ESP32 e pelas FKs):
//   - ID livre no sistema todo:  checkpointId = ID  (como sempre foi; o ESP32 só precisa do ID)
//   - ID já usado por outro buffet:  checkpointId = "<código do buffet>-<ID>"  (o ESP32 informa o código do buffet na
//     página /config e monta esse mesmo valor sozinho)
const { query, queryOne, allQuery } = require('../database');

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // sem 0/O e 1/I para não confundir ao digitar no ESP32

function sortearCodigo(tamanho = 6) {
  let codigo = '';
  for (let i = 0; i < tamanho; i++) codigo += ALFABETO[Math.floor(Math.random() * ALFABETO.length)];
  return codigo;
}

// Devolve o código do buffet, criando um (único) se ainda não tiver.
async function garantirCodigo(empresaId) {
  const empresa = await queryOne('SELECT empresaId, codigo FROM empresa WHERE empresaId = @empresaId', { empresaId });
  if (!empresa) return null;
  if (empresa.codigo) return empresa.codigo;

  for (let tentativa = 0; tentativa < 20; tentativa++) {
    const codigo = sortearCodigo();
    const usado = await queryOne('SELECT empresaId FROM empresa WHERE LOWER(codigo) = LOWER(@codigo)', { codigo });
    if (usado) continue;
    const gravou = await query(
      'UPDATE empresa SET codigo = @codigo WHERE empresaId = @empresaId AND codigo IS NULL',
      { codigo, empresaId }
    );
    if (Number(gravou?.rowsAffected?.[0] || 0)) return codigo;
    // outra requisição gravou primeiro
    return (await queryOne('SELECT codigo FROM empresa WHERE empresaId = @empresaId', { empresaId }))?.codigo || null;
  }
  throw new Error('Não foi possível gerar o código do buffet');
}

async function preencherCodigos() {
  const semCodigo = await allQuery('SELECT empresaId FROM empresa WHERE codigo IS NULL');
  for (const { empresaId } of semCodigo) await garantirCodigo(empresaId);
  return semCodigo.length;
}

module.exports = { garantirCodigo, preencherCodigos };
