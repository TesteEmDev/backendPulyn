// utils/pontosDaPartida.js - monta os pontos de uma partida para o telão (rota GET /leituras/evento/:id/pontos-da-partida)
//
// `linhas`: uma por criança do evento (criancaId, nome, avatar, timeId, timeNome, timeCor, pontos ganhos na partida, 0
// se não leu nada). `equipesDoEvento`: todas as equipes do evento (timeId, nome, cor). Todo mundo entra, mesmo zerado,
// para o telão mostrar as listas desde o início. Mais pontos primeiro; empatados e zerados em ordem alfabética.
const ordem = (a, b) => b.pontos - a.pontos || String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');

function montarPontosDaPartida(linhas = [], equipesDoEvento = []) {
  const porEquipe = new Map(equipesDoEvento.map((t) => [t.timeId, { id: t.timeId, nome: t.nome, cor: t.cor, pontos: 0 }]));
  const participantes = linhas.map((linha) => {
    const pontos = Number(linha.pontos) || 0;
    if (linha.timeId) {
      // Equipe de outro evento (não deveria acontecer): entra assim mesmo, com os dados da criança
      const atual = porEquipe.get(linha.timeId) || { id: linha.timeId, nome: linha.timeNome, cor: linha.timeCor, pontos: 0 };
      atual.pontos += pontos;
      porEquipe.set(linha.timeId, atual);
    }
    return { id: linha.criancaId, nome: linha.nome, cor: linha.timeCor || null, avatar: linha.avatar || null, pontos };
  });
  return { equipes: [...porEquipe.values()].sort(ordem), participantes: participantes.sort(ordem) };
}

module.exports = { montarPontosDaPartida };
