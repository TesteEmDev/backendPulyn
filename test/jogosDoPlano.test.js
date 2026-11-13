const test = require('node:test');
const assert = require('node:assert/strict');
const { tiposDeJogoDoPlano, TIPOS_COMUNS, TIPOS_PULYNBALL } = require('../utils/planDefinitions');
const { JOGOS_PADRAO } = require('../utils/jogosPadrao');
const { validarDuracao } = require('../utils/jogosDoPlano');

test('os planos comuns entregam 4 jogos e o PulynBall entrega 3', () => {
  assert.deepEqual([...TIPOS_COMUNS].sort(), ['individual', 'monster_hunt', 'team', 'treasure_hunt']);
  assert.deepEqual([...TIPOS_PULYNBALL].sort(), ['bomb_defusal', 'hostage_rescue', 'zone_domination']);
  for (const plano of ['starter', 'professional', 'enterprise']) assert.deepEqual(tiposDeJogoDoPlano(plano), TIPOS_COMUNS);
  assert.deepEqual(tiposDeJogoDoPlano('pulynball'), TIPOS_PULYNBALL);
});

test('todo jogo entregue tem padrão completo (nome, descrição, regras, duração e pontos)', () => {
  for (const tipo of [...TIPOS_COMUNS, ...TIPOS_PULYNBALL]) {
    const j = JOGOS_PADRAO[tipo];
    assert.ok(j, `padrão de ${tipo}`);
    assert.ok(j.nome && j.descricao && j.regras, `textos de ${tipo}`);
    assert.ok(Number.isInteger(j.duracao) && j.duracao > 0, `duração de ${tipo}`);
    assert.ok(j.pontosPadrao > 0, `pontos de ${tipo}`);
    assert.equal(/Ã|�/.test(j.nome + j.descricao + j.regras), false, `${tipo} sem caracteres corrompidos`);
  }
});

test('validarDuracao: inteiro de 1 a 240 minutos', () => {
  assert.deepEqual(validarDuracao(15), { ok: true, valor: 15 });
  assert.deepEqual(validarDuracao('20'), { ok: true, valor: 20 });
  for (const ruim of [0, -5, 241, 1.5, 'abc', '', null, undefined]) assert.equal(validarDuracao(ruim).ok, false, String(ruim));
});
