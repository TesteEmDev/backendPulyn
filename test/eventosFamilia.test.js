const test = require('node:test');
const assert = require('node:assert/strict');
const { avaliarConviteParaEntrar, montarEventosDaFamilia } = require('../utils/eventosFamilia');

const convite = (extra = {}) => ({ status: 'pending', email: null, ...extra });

test('convite que não existe é 404', () => {
  assert.deepEqual(avaliarConviteParaEntrar(null, 'a@a.com'), { ok: false, status: 404, error: 'Convite não encontrado' });
});

test('convite usado ou expirado é 410, com a mensagem de cada caso', () => {
  assert.equal(avaliarConviteParaEntrar(convite({ status: 'used' }), 'a@a.com').error, 'Convite já utilizado');
  assert.equal(avaliarConviteParaEntrar(convite({ status: 'processing' }), 'a@a.com').status, 410);
  const expirado = avaliarConviteParaEntrar(convite({ status: 'expired' }), 'a@a.com');
  assert.equal(expirado.status, 410);
  assert.equal(expirado.error, 'Convite expirado');
});

test('convite aberto (sem e-mail) vale para qualquer responsável', () => {
  assert.deepEqual(avaliarConviteParaEntrar(convite(), 'a@a.com'), { ok: true });
});

test('convite feito para um e-mail só vale para ele (sem diferenciar maiúsculas e espaços)', () => {
  assert.equal(avaliarConviteParaEntrar(convite({ email: 'ana@email.com' }), '  ANA@email.com ').ok, true);
  const outro = avaliarConviteParaEntrar(convite({ email: 'ana@email.com' }), 'bia@email.com');
  assert.equal(outro.ok, false);
  assert.equal(outro.status, 403);
});

const ev = (id, data, extra = {}) => ({ eventoId: id, nome: `Evento ${id}`, data, status: 'finished', buffetNome: 'Buffet X', ...extra });

test('evento adicionado só pelo código aparece, sem crianças', () => {
  const lista = montarEventosDaFamilia([ev('e1', '2026-10-01')], []);
  assert.equal(lista.length, 1);
  assert.equal(lista[0].adicionadoPorConvite, true);
  assert.deepEqual(lista[0].criancas, []);
  assert.equal(lista[0].totalPontos, 0);
});

test('evento de criança vinculada aparece mesmo sem convite, somando os pontos dos filhos', () => {
  const lista = montarEventosDaFamilia([], [
    { ...ev('e1', '2026-10-01'), criancaId: 'c1', criancaNome: 'Lia', apelido: null, pontos: 30 },
    { ...ev('e1', '2026-10-01'), criancaId: 'c2', criancaNome: 'Davi', apelido: 'Dav', pontos: '15' },
  ]);
  assert.equal(lista.length, 1);
  assert.equal(lista[0].adicionadoPorConvite, false);
  assert.equal(lista[0].criancas.length, 2);
  assert.equal(lista[0].totalPontos, 45);
});

test('o mesmo evento pelas duas origens vira um item só', () => {
  const lista = montarEventosDaFamilia(
    [ev('e1', '2026-10-01')],
    [{ ...ev('e1', '2026-10-01'), criancaId: 'c1', criancaNome: 'Lia', pontos: 10 }]
  );
  assert.equal(lista.length, 1);
  assert.equal(lista[0].adicionadoPorConvite, true);
  assert.equal(lista[0].criancas.length, 1);
});

test('linha repetida da mesma criança não conta os pontos duas vezes', () => {
  const linha = { ...ev('e1', '2026-10-01'), criancaId: 'c1', criancaNome: 'Lia', pontos: 10 };
  const lista = montarEventosDaFamilia([], [linha, linha]);
  assert.equal(lista[0].totalPontos, 10);
});

test('mais recentes primeiro e evento sem data por último', () => {
  const lista = montarEventosDaFamilia([ev('velho', '2026-01-01'), ev('semData', null), ev('novo', '2026-10-20')], []);
  assert.deepEqual(lista.map((e) => e.id), ['novo', 'velho', 'semData']);
});

test('encerrado vem da situação do evento', () => {
  const lista = montarEventosDaFamilia([
    ev('a', '2026-10-01', { status: 'finished' }),
    ev('b', '2026-10-02', { status: 'active' }),
    ev('c', '2026-10-03', { status: 'scheduled' }),
    ev('d', '2026-10-04', { status: null }),
  ], []);
  const porId = Object.fromEntries(lista.map((e) => [e.id, e.encerrado]));
  assert.deepEqual(porId, { a: true, b: false, c: false, d: false });
});

test('evento sem nome ganha um nome padrão', () => {
  assert.equal(montarEventosDaFamilia([ev('e1', '2026-10-01', { nome: null })], [])[0].nome, 'Evento');
});
