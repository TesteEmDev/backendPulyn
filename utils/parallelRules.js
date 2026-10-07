// Regras da brincadeira paralela: os 3 primeiros participantes a ler o checkpoint escolhido
// ganham 50, 40 e 30 pontos. Aqui só a decisão (sem banco), para poder testar.
const PARALLEL_PRIZES = Object.freeze([50, 40, 30]);

// winners: [{ crianca_id, position }] já registrados nesta partida.
// Retorna:
//  - { status: 'won', position, points }   -> esta criança entrou no pódio agora
//  - { status: 'already', position }       -> ela já está no pódio (cada um ganha uma vez)
//  - { status: 'closed' }                  -> os 3 lugares já foram preenchidos
function planParallelAward(winners, criancaId, prizes = PARALLEL_PRIZES) {
  const mine = winners.find((winner) => String(winner.crianca_id).toLowerCase() === String(criancaId).toLowerCase());
  if (mine) return { status: 'already', position: Number(mine.position) };
  if (winners.length >= prizes.length) return { status: 'closed' };
  const position = winners.length + 1;
  return { status: 'won', position, points: prizes[position - 1] };
}

const ORDINAL = ['1º', '2º', '3º'];
const positionLabel = (position) => ORDINAL[position - 1] || `${position}º`;

module.exports = { PARALLEL_PRIZES, planParallelAward, positionLabel };
