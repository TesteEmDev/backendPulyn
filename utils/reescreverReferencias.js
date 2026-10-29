// utils/reescreverReferencias.js - troca as chaves antigas dos checkpoints pelas novas dentro das listas em texto JSON
// (brincadeira.checkpoints, partidaBomba.locaisIds, partidaRefem.sequenciaIds, cacaTesourPartida.checkpointsCompletadosIds).
//
// Usada pela migração que passa a chave do checkpoint a ser o `id` numérico (migrations/checkpointIdNumerico.js).
//
// Referência órfã = chave que não é de nenhum checkpoint que existe (o checkpoint foi apagado). Se o valor órfão só tem
// dígitos ("1", "15"), depois da troca ele passaria a apontar para o checkpoint que hoje tem esse id, atribuindo o
// histórico a outro checkpoint. Por isso o órfão só de dígitos ganha um prefixo e deixa de casar com qualquer id.

const PREFIXO_ORFAO = 'orfao:';
const SO_DIGITOS = /^[0-9]{1,28}$/;   // até 28 para o prefixo caber nas colunas varchar(36)

// Mapa de busca sem diferenciar maiúsculas de minúsculas (o código sempre comparou os IDs assim).
function criarMapa(pares) {
  const mapa = new Map();
  for (const { velha, nova } of pares) mapa.set(String(velha).trim().toLowerCase(), String(nova));
  return mapa;
}

// Valor novo para uma chave antiga: a chave nova se existir, o órfão de dígitos prefixado, ou o próprio valor.
function novaChave(valor, mapa) {
  const texto = String(valor).trim();
  if (texto.startsWith(PREFIXO_ORFAO)) return texto;
  const nova = mapa.get(texto.toLowerCase());
  if (nova !== undefined) return nova;
  return SO_DIGITOS.test(texto) ? `${PREFIXO_ORFAO}${texto}` : String(valor);
}

// Reescreve uma lista JSON (["10","11"] ou [{"id":"10",...}]). Devolve o novo texto, ou null se nada mudou ou o texto
// não é uma lista.
function reescreverLista(texto, mapa) {
  let lista;
  try { lista = JSON.parse(texto); } catch { return null; }
  if (!Array.isArray(lista)) return null;

  let mudou = false;
  const trocar = (valor) => {
    const novo = novaChave(valor, mapa);
    if (novo !== String(valor)) mudou = true;
    return novo;
  };

  const nova = lista.map((item) => {
    if (typeof item === 'string' || typeof item === 'number') return trocar(item);
    if (item && typeof item === 'object') {
      const copia = { ...item };
      for (const campo of ['id', 'checkpointId']) {
        if (campo in copia && copia[campo] !== null && copia[campo] !== undefined) copia[campo] = trocar(copia[campo]);
      }
      return copia;
    }
    return item;
  });

  return mudou ? JSON.stringify(nova) : null;
}

module.exports = { PREFIXO_ORFAO, criarMapa, novaChave, reescreverLista };
