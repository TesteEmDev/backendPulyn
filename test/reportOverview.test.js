const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizeEvents } = require('../utils/reportOverview');

const rows = [
  { id: 'a', name: 'Festa A', date: '2026-09-10', status: 'finished', participants: '10', teams: '2', total_points: '200', scorings: '40' },
  { id: 'b', name: 'Festa B', date: '2026-09-25', status: 'completed', participants: '5', teams: '2', total_points: '50', scorings: '9' },
  { id: 'c', name: 'Festa C', date: '2026-10-05', status: 'active', participants: '0', teams: '0', total_points: '0', scorings: '0' },
  { id: 'd', name: 'Sem data', date: null, status: 'scheduled', participants: '3', teams: '1', total_points: '0', scorings: '0' },
];

test('totais somam todos os eventos e convertem os números que o banco devolve como texto', () => {
  const { totals } = summarizeEvents(rows);
  assert.equal(totals.events, 4);
  assert.equal(totals.finishedEvents, 2);
  assert.equal(totals.runningEvents, 1);
  assert.equal(totals.participants, 18);
  assert.equal(totals.teams, 5);
  assert.equal(totals.totalPoints, 250);
  assert.equal(totals.scorings, 49);
});

test('média de pontos é por participante e evita divisão por zero', () => {
  assert.equal(summarizeEvents(rows).totals.avgPoints, Math.round(250 / 18));
  assert.equal(summarizeEvents(rows).events[2].avgPoints, 0);
  assert.equal(summarizeEvents([]).totals.avgPoints, 0);
});

test('agrupa por mês em ordem cronológica e ignora evento sem data', () => {
  const { byMonth } = summarizeEvents(rows);
  assert.deepEqual(byMonth, [
    { month: '2026-09', events: 2, participants: 15 },
    { month: '2026-10', events: 1, participants: 0 },
  ]);
});

test('lista vazia gera relatório vazio', () => {
  const result = summarizeEvents([]);
  assert.equal(result.totals.events, 0);
  assert.deepEqual(result.events, []);
  assert.deepEqual(result.byMonth, []);
});
