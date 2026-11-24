// utils/classificacaoMonstros.js - classificação das equipes no Caça ao Monstro
//
// O jogo acaba quando o primeiro monstro é derrotado. A ordem é: quem derrotou o monstro (o mais rápido primeiro) e
// depois as outras equipes pela vida que sobrou no monstro delas, da menor para a maior. Mesma chave = empate (derrotaram
// no mesmo instante, ou o monstro ficou com a mesma vida).
//
// @param estados [{ timeId, vida, derrotadoEm }]
// @returns [{ teamId, chave }] da melhor para a pior
function classificacaoDosMonstros(estados = []) {
  const derrotaram = estados.filter((e) => e.derrotadoEm)
    .sort((a, b) => new Date(a.derrotadoEm) - new Date(b.derrotadoEm));
  const vida = (e) => Math.max(0, Number(e.vida || 0));
  const restantes = estados.filter((e) => !e.derrotadoEm).sort((a, b) => vida(a) - vida(b));
  return [
    ...derrotaram.map((e) => ({ teamId: e.timeId, chave: `d${new Date(e.derrotadoEm).getTime()}` })),
    ...restantes.map((e) => ({ teamId: e.timeId, chave: `h${vida(e)}` })),
  ];
}

module.exports = { classificacaoDosMonstros };
