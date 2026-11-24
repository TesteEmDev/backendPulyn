// Pontos da partida para o telão: todo mundo do evento aparece, mesmo zerado; equipes somam os pontos das crianças.
const test = require('node:test');
const assert = require('node:assert/strict');
const { montarPontosDaPartida } = require('../utils/pontosDaPartida');

const crianca = (id, nome, timeId, pontos) => ({ criancaId: id, nome, avatar: null, timeId, timeNome: null, timeCor: null, pontos });
const EQUIPES = [{ timeId: 't1', nome: 'Azul', cor: '#00f' }, { timeId: 't2', nome: 'Verde', cor: '#0f0' }, { timeId: 't3', nome: 'Roxa', cor: '#a0f' }];

test('antes de qualquer leitura, todas as crianças e equipes aparecem zeradas, em ordem alfabética', () => {
  const r = montarPontosDaPartida([crianca('c1', 'Theo', 't1', 0), crianca('c2', 'Ana', 't2', 0)], EQUIPES);
  assert.deepEqual(r.participantes.map((p) => [p.nome, p.pontos]), [['Ana', 0], ['Theo', 0]]);
  assert.deepEqual(r.equipes.map((e) => [e.nome, e.pontos]), [['Azul', 0], ['Roxa', 0], ['Verde', 0]]);
});

test('quem pontuou vem primeiro; a equipe soma os pontos das suas crianças; equipe sem criança continua com 0', () => {
  const r = montarPontosDaPartida([
    crianca('c1', 'Theo', 't1', 20), crianca('c2', 'Ana', 't2', 0), crianca('c3', 'Bia', 't1', 10), crianca('c4', 'Leo', null, 30),
  ], EQUIPES);
  assert.deepEqual(r.participantes.map((p) => p.nome), ['Leo', 'Theo', 'Bia', 'Ana']);
  assert.deepEqual(r.equipes.map((e) => [e.nome, e.pontos]), [['Azul', 30], ['Roxa', 0], ['Verde', 0]]);
});

test('pontos vindos do banco como texto são somados como número', () => {
  const r = montarPontosDaPartida([crianca('c1', 'Theo', 't1', '15'), crianca('c3', 'Bia', 't1', '5')], EQUIPES);
  assert.equal(r.equipes[0].pontos, 20);
  assert.equal(r.participantes[0].pontos, 15);
});
