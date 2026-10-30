const test = require('node:test');
const assert = require('node:assert/strict');
const { planRandomDistribution } = require('../utils/teamDistribution');

const kids = (n, timeId = null) => Array.from({ length: n }, (_, i) => ({ criancaId: `c${i}`, timeId: timeId }));
const sizes = (children, assignments, teamIds) => {
  const byChild = new Map(children.map(c => [c.criancaId, c.timeId]));
  assignments.forEach(a => byChild.set(a.criancaId, a.timeId));
  return teamIds.map(id => [...byChild.values()].filter(t => t === id).length);
};

test('modo unassigned distribui os sem time de forma equilibrada', () => {
  const children = kids(10);
  const result = planRandomDistribution({ children, teamIds: ['A', 'B', 'C'] });
  assert.equal(result.length, 10);
  const s = sizes(children, result, ['A', 'B', 'C']);
  assert.ok(Math.max(...s) - Math.min(...s) <= 1, `desequilibrado: ${s}`);
});

test('modo unassigned não mexe em quem já tem time e compensa o time maior', () => {
  const children = [
    { criancaId: 'x1', timeId: 'A' }, { criancaId: 'x2', timeId: 'A' }, { criancaId: 'x3', timeId: 'A' },
    ...kids(3),
  ];
  const result = planRandomDistribution({ children, teamIds: ['A', 'B'] });
  assert.ok(result.every(a => !a.criancaId.startsWith('x')));
  assert.deepEqual(result.map(a => a.timeId), ['B', 'B', 'B']);
});

test('criança com time de outro evento é tratada como sem time', () => {
  const children = [{ criancaId: 'c1', timeId: 'OUTRO' }];
  const result = planRandomDistribution({ children, teamIds: ['A', 'B'] });
  assert.equal(result.length, 1);
  assert.ok(['A', 'B'].includes(result[0].timeId));
});

test('modo all redistribui todo mundo e equilibra', () => {
  const children = kids(7, 'A');
  const result = planRandomDistribution({ children, teamIds: ['A', 'B', 'C'], mode: 'all' });
  const s = sizes(children, result, ['A', 'B', 'C']);
  assert.deepEqual([...s].sort(), [2, 2, 3]);
});

test('o sorteio varia conforme o random e não repete sempre a mesma ordem', () => {
  const children = kids(20);
  const teamIds = ['A', 'B', 'C', 'D'];
  const outcomes = new Set();
  for (let i = 0; i < 30; i += 1) {
    const plan = planRandomDistribution({ children, teamIds });
    outcomes.add(plan.map(a => `${a.criancaId}:${a.timeId}`).sort().join(','));
  }
  assert.ok(outcomes.size > 1);
});

test('sem times ou sem crianças não há o que distribuir; modo inválido falha', () => {
  assert.deepEqual(planRandomDistribution({ children: kids(3), teamIds: [] }), []);
  assert.deepEqual(planRandomDistribution({ children: [], teamIds: ['A'] }), []);
  assert.throws(() => planRandomDistribution({ children: kids(1), teamIds: ['A'], mode: 'x' }));
});

test('formação dos times para o telão: membros por time, em ordem, marcando quem foi sorteado agora', () => {
  const { montarFormacaoDosTimes } = require('../utils/teamDistribution');
  const teams = [{ timeId: 'A', nome: 'Azul', cor: '#00F' }, { timeId: 'V', nome: 'Verde', cor: null }];
  const children = [
    { criancaId: '1', nome: 'Zeca Silva', apelido: 'Zeca', avatar: 'a1', timeId: 'A' },
    { criancaId: '2', nome: 'Ana Souza', apelido: null, avatar: null, timeId: 'A' },
    { criancaId: '3', nome: 'Bia', apelido: 'Bibi', avatar: 'a3', timeId: 'V' },
    { criancaId: '4', nome: 'Sem Time', apelido: 'Solto', avatar: null, timeId: null },
  ];
  const formacao = montarFormacaoDosTimes({ teams, children, sorteadosIds: ['2', 3] });
  assert.deepEqual(formacao.map((t) => [t.id, t.name, t.color]), [['A', 'Azul', '#00F'], ['V', 'Verde', null]]);
  assert.deepEqual(formacao[0].members.map((m) => [m.nickname, m.novo]), [['Ana Souza', true], ['Zeca', false]]);
  assert.deepEqual(formacao[1].members.map((m) => [m.nickname, m.novo, m.avatar]), [['Bibi', true, 'a3']]);
  assert.equal(formacao.flatMap((t) => t.members).some((m) => m.nickname === 'Solto'), false);
});
