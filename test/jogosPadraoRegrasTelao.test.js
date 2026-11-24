// Regras curtas do telão (regrasTelao): só nos jogos de buffet, poucas e curtas, para as crianças (o Lumi fala cada uma).
const test = require('node:test');
const assert = require('node:assert/strict');
const { JOGOS_PADRAO } = require('../utils/jogosPadrao');
const { TIPOS_COMUNS, TIPOS_PULYNBALL } = require('../utils/planDefinitions');

// Mesma limpeza do GameGuide (parseGuideRules) no FrontEnd: tira a numeração "1- "
const regrasDe = (texto) => String(texto || '').split(/\r?\n/)
  .map((linha) => linha.replace(/^\s*(?:[-•*–]+|\d+\s*[.)\-–:])\s*/, '').trim())
  .filter(Boolean);

test('jogos de buffet têm regras curtas para o telão', () => {
  for (const tipo of TIPOS_COMUNS) {
    const regras = regrasDe(JOGOS_PADRAO[tipo].regrasTelao);
    assert.ok(regras.length >= 3 && regras.length <= 5, `${tipo}: ${regras.length} regras`);
    for (const regra of regras) assert.ok(regra.length <= 80, `${tipo}: regra longa demais: ${regra}`);
    // as regras completas continuam para a equipe
    assert.ok(regrasDe(JOGOS_PADRAO[tipo].regras).length > 0, `${tipo}: sem as regras completas`);
  }
});

test('jogos PulynBall usam as regras completas no telão', () => {
  for (const tipo of TIPOS_PULYNBALL) assert.equal(JOGOS_PADRAO[tipo].regrasTelao, undefined, tipo);
});
