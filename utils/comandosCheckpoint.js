// utils/comandosCheckpoint.js - comandos de teste (LED e som) que o admin manda para uma placa
//
// A placa não aceita conexão do servidor (fica atrás do Wi-Fi do buffet), então o comando espera aqui até ela buscá-lo:
// ela consulta /api/debug/checkpoint-mode a cada ~10 s e o servidor devolve o comando junto, uma única vez.
// A fila é em memória (um comando por checkpoint, o mais novo vale) e o comando vence em 60 s: placa offline não
// executa um teste antigo quando voltar.
const TIPOS = ['led', 'som'];
const VALIDADE_MS = 60 * 1000;

const fila = new Map(); // checkpointId (minúsculo) -> { tipo, pedidoEm }

const chave = (checkpointId) => String(checkpointId).trim().toLowerCase();

function agendar(checkpointId, tipo, agora = Date.now()) {
  if (!TIPOS.includes(tipo)) throw new Error(`Comando inválido: ${tipo}`);
  fila.set(chave(checkpointId), { tipo, pedidoEm: agora });
}

// Entrega o comando pendente (e o tira da fila). null se não há ou se venceu.
function retirar(checkpointId, agora = Date.now()) {
  const id = chave(checkpointId);
  const comando = fila.get(id);
  if (!comando) return null;
  fila.delete(id);
  return agora - comando.pedidoEm <= VALIDADE_MS ? comando.tipo : null;
}

module.exports = { TIPOS, VALIDADE_MS, agendar, retirar };
