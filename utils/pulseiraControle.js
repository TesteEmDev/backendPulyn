// utils/pulseiraControle.js - controle de pulseiras: o cliente (buffet) só usa pulseira que o master forneceu.
//
// Regra: um leitor só "enxerga" pulseira que está cadastrada no MESMO cliente dele (pulseira.empresaId = empresa do
// leitor). Pulseira que ninguém forneceu ao cliente é ignorada na leitura, no check-in e no autoatendimento, e o
// cliente não cria pulseira por conta própria (o master envia e o cliente aceita: routes/pulseirasMaster.js e
// routes/pulseirasRecebimento.js).
//
// Para desligar de emergência (volta ao comportamento antigo, em que o cliente cadastra a pulseira lida):
// PULSEIRAS_CONTROLE_MASTER=0 no .env do backend.

const MENSAGEM_PULSEIRA_DE_OUTRO_CLIENTE = 'Esta pulseira não foi fornecida para este cliente.';

function controleAtivo(env = process.env) {
  return String(env.PULSEIRAS_CONTROLE_MASTER ?? '1').trim() !== '0';
}

module.exports = { controleAtivo, MENSAGEM_PULSEIRA_DE_OUTRO_CLIENTE };
