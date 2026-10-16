// utils/bombaTempo.js - Tempo da bomba do Conquistar e Destruir
//
// Ao plantar, o checkpoint toca o som "bombaPlantada". A contagem da bomba só começa DEPOIS desse som: durante
// ele o tempo fica parado no valor cheio e a explosão acontece `SOM_PLANTADA_MS + bombaSeg` depois da leitura.
// SOM_PLANTADA_MS é o mesmo SOUND_DUR_PLANTADA_MS do firmware (Checkpointss/pullynC2_modular/config.h): se o
// arquivo de som mudar de duração, ajuste os dois.
const SOM_PLANTADA_MS = 2500;

const emMs = (data) => new Date(data).getTime();

// Instante em que a bomba explode (ms desde 1970), ou null se ainda não foi plantada.
function explosaoDaBombaEm(plantadaEm, bombaSeg) {
  if (!plantadaEm) return null;
  return emMs(plantadaEm) + SOM_PLANTADA_MS + bombaSeg * 1000;
}

// Tempo que falta para a bomba explodir. Nunca passa de `bombaSeg` (parado durante o som) nem fica negativo.
function restanteDaBomba(plantadaEm, bombaSeg, agora) {
  const explosao = explosaoDaBombaEm(plantadaEm, bombaSeg);
  if (explosao === null) return null;
  return Math.min(bombaSeg * 1000, Math.max(0, explosao - agora.getTime()));
}

module.exports = { SOM_PLANTADA_MS, explosaoDaBombaEm, restanteDaBomba };
