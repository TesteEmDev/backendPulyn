// utils/cacheCurto.js - cache de poucos milissegundos para consultas repetidas por muitos clientes.
//
// Os checkpoints (ESP32) e os telões perguntam o estado do jogo a cada ~1 s. Cada pergunta fazia de 5 a 7 consultas ao banco
// remoto, e com vários checkpoints o pool de conexões (10) saturava: respostas lentas, timeouts e "API indisponível" nos
// ESP32. Aqui as perguntas que chegam no mesmo instante compartilham UMA consulta (inclusive a que ainda está em andamento)
// e o resultado vale por `ttlMs`. Quem muda o estado chama invalidar() para ninguém ler dado velho depois da mudança.
function criarCache(ttlMs) {
  const itens = new Map();   // chave -> { em, promessa }

  return {
    // Devolve o valor guardado (ou em andamento) se ainda vale; senão chama `produzir` e guarda.
    obter(chave, produzir) {
      const agora = Date.now();
      const atual = itens.get(chave);
      if (atual && agora - atual.em < ttlMs) return atual.promessa;

      const promessa = Promise.resolve().then(produzir);
      const item = { em: agora, promessa };
      itens.set(chave, item);
      promessa.catch(() => { if (itens.get(chave) === item) itens.delete(chave); });   // erro não fica guardado
      return promessa;
    },
    // Esquece tudo que começa com `prefixo` (ex.: o id do evento).
    invalidar(prefixo) {
      for (const chave of itens.keys()) {
        if (chave.startsWith(prefixo)) itens.delete(chave);
      }
    },
    limpar() { itens.clear(); },
  };
}

module.exports = { criarCache };
