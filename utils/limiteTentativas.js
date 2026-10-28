// utils/limiteTentativas.js - Limita tentativas erradas (ex.: código de convite que não existe) por cliente.
//
// O código do convite tem 8 dígitos hexadecimais; sem limite, dava para adivinhar um por tentativa e erro.
// Só as FALHAS contam: quem acerta de primeira nunca é barrado. O estado fica na memória do processo
// (vale por instância; reiniciar o back zera).

function criarLimitador({ max = 15, janelaMs = 10 * 60 * 1000, maxChaves = 5000 } = {}) {
  const falhas = new Map(); // chave -> instantes (ms) das falhas ainda dentro da janela

  const recentes = (chave, agora) => {
    const lista = (falhas.get(chave) || []).filter((instante) => agora - instante < janelaMs);
    if (lista.length) falhas.set(chave, lista);
    else falhas.delete(chave);
    return lista;
  };

  return {
    bloqueado(chave, agora = Date.now()) {
      return recentes(chave, agora).length >= max;
    },
    registrarFalha(chave, agora = Date.now()) {
      if (falhas.size >= maxChaves) {
        for (const outra of [...falhas.keys()]) recentes(outra, agora);
      }
      falhas.set(chave, [...recentes(chave, agora), agora]);
    },
    limpar(chave) {
      falhas.delete(chave);
    },
  };
}

// IP de quem fez o pedido. Atrás de um proxy (Render, IIS) o req.ip é o do proxy, igual para todo mundo; vale o último
// endereço de X-Forwarded-For, que é o que o nosso proxy anotou (os da esquerda o cliente pode inventar).
function ipDoCliente(req) {
  const encaminhado = String(req.headers?.['x-forwarded-for'] || '').split(',').map((p) => p.trim()).filter(Boolean);
  return encaminhado.length ? encaminhado[encaminhado.length - 1] : (req.ip || 'desconhecido');
}

module.exports = { criarLimitador, ipDoCliente };
