// utils/sorteioMonstros.js - Sorteio do monstro de cada equipe no Caça ao Monstro
//
// São 6 monstros (dragão, orc, slime, cogumelo, esqueleto, morcego), cada um em 3 cores. O sorteio acontece uma vez, quando o
// jogo começa, e fica gravado na equipe da partida: o telão (ou vários) sempre mostra o mesmo monstro, mesmo recarregando.
// Um monstro não se repete no mesmo jogo. Com mais de 6 equipes os tipos voltam, mas cada um numa cor diferente das já
// usadas, e só depois das 18 combinações se esgotarem é que algo se repete.

// Cores de cada monstro, com um tom de referência para casar com a cor da equipe
const MONSTROS = {
  dragao: { verde: '#4CAF50', fogo: '#F4511E', gelo: '#4FC3F7' },
  orc: { verde: '#6BA34A', cinza: '#9E9E9E', vermelho: '#D32F2F' },
  slime: { verde: '#66BB6A', azul: '#42A5F5', roxo: '#AB47BC' },
  cogumelo: { vermelho: '#E53935', azul: '#3F6FD8', marrom: '#8D6E63' },
  esqueleto: { marfim: '#EFE6C8', carvao: '#455A64', ametista: '#9C27B0' },
  morcego: { roxo: '#7E57C2', vermelho: '#C62828', azul: '#1E88E5' },
};
const TIPOS = Object.keys(MONSTROS);

function rgbDe(hex) {
  const texto = String(hex || '').trim().replace('#', '');
  const completo = texto.length === 3 ? texto.split('').map((c) => c + c).join('') : texto;
  if (!/^[0-9a-fA-F]{6}$/.test(completo)) return null;
  return [0, 2, 4].map((i) => parseInt(completo.slice(i, i + 2), 16));
}

function distancia(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function embaralhar(lista, aleatorio) {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i -= 1) {
    const j = Math.floor(aleatorio() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

// Entre as cores livres do monstro, a mais parecida com a da equipe (sem cor de equipe válida, uma ao acaso)
function escolherCor(tipo, livres, corDaEquipe, aleatorio) {
  const alvo = rgbDe(corDaEquipe);
  if (!alvo) return livres[Math.floor(aleatorio() * livres.length)];
  return [...livres].sort((a, b) => distancia(rgbDe(MONSTROS[tipo][a]), alvo) - distancia(rgbDe(MONSTROS[tipo][b]), alvo))[0];
}

/**
 * @param equipes [{ timeId, cor }]
 * @returns Map timeId -> { tipo, cor }
 */
function sortearMonstros(equipes, aleatorio = Math.random) {
  const resultado = new Map();
  const usadas = new Set(); // "tipo|cor"
  let fila = [];
  for (const equipe of equipes) {
    if (fila.length === 0) fila = embaralhar(TIPOS, aleatorio); // um novo "baralho" de tipos a cada 6 equipes
    // Tipo da vez; se todas as cores dele já saíram, passa para o próximo do baralho que ainda tenha cor livre
    let posicao = fila.findIndex((tipo) => Object.keys(MONSTROS[tipo]).some((cor) => !usadas.has(`${tipo}|${cor}`)));
    if (posicao < 0) { usadas.clear(); posicao = 0; } // as 18 combinações acabaram: recomeça
    const [tipo] = fila.splice(posicao, 1);
    const livres = Object.keys(MONSTROS[tipo]).filter((cor) => !usadas.has(`${tipo}|${cor}`));
    const cor = escolherCor(tipo, livres, equipe.cor, aleatorio);
    usadas.add(`${tipo}|${cor}`);
    resultado.set(equipe.timeId, { tipo, cor });
  }
  return resultado;
}

module.exports = { MONSTROS, TIPOS, sortearMonstros };
