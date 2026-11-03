// Início e encerramento automáticos: as linhas vêm do banco com as colunas em camelCase (duracao, eventoId).
const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateLifecycle } = require('../utils/eventLifecycle');

// 03/11/2026 12:00 em São Paulo (UTC-3)
const agora = new Date('2026-11-03T15:00:00Z');
const linha = (extra) => ({ eventoId: 'e1', status: 'scheduled', duracao: 60, autoInicio: 0, autoFim: 0, date_str: '2026-11-03', time_str: '11:55', ...extra });

test('início automático dentro da janela [início, início + duração)', () => {
  assert.equal(evaluateLifecycle(linha({ autoInicio: 1 }), agora), 'start');
  assert.equal(evaluateLifecycle(linha({ autoInicio: 1, time_str: '12:30' }), agora), null, 'ainda não chegou');
  assert.equal(evaluateLifecycle(linha({ autoInicio: 1, time_str: '09:00' }), agora), null, 'a janela inteira já passou');
  assert.equal(evaluateLifecycle(linha({ autoInicio: 0 }), agora), null, 'início manual');
});

test('encerramento automático conta a duração a partir do início real', () => {
  const ativo = { status: 'active', autoFim: 1, duracao: 60 };
  assert.equal(evaluateLifecycle(linha({ ...ativo, iniciadoEm: '2026-11-03T13:30:00Z' }), agora), 'finish');
  assert.equal(evaluateLifecycle(linha({ ...ativo, iniciadoEm: '2026-11-03T14:30:00Z' }), agora), null, 'ainda dentro da duração');
  assert.equal(evaluateLifecycle(linha({ ...ativo, autoFim: 0, iniciadoEm: '2026-11-03T13:30:00Z' }), agora), null, 'encerramento manual');
});

test('sem duração informada vale 60 minutos', () => {
  assert.equal(evaluateLifecycle(linha({ status: 'active', autoFim: 1, duracao: null, iniciadoEm: '2026-11-03T13:30:00Z' }), agora), 'finish');
});
