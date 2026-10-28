// test/papeis.test.js - Papéis acumulados de uma conta (ver utils/papeis.js)
const test = require('node:test');
const assert = require('node:assert/strict');
const { papeisDaConta, perfisExtrasParaSalvar } = require('../utils/papeis');

test('conta sem papéis extras usa só o perfil principal', () => {
  assert.deepEqual(papeisDaConta({ perfil: 'admin', perfisExtras: null }), ['admin']);
});

test('lista o perfil principal e os extras, sem repetir', () => {
  assert.deepEqual(
    papeisDaConta({ perfil: 'admin', perfisExtras: 'reception,game_master,admin' }),
    ['admin', 'reception', 'game_master']
  );
});

test('ignora papéis que não podem ser acumulados (telão, kiosk, família)', () => {
  assert.deepEqual(
    papeisDaConta({ perfil: 'reception', perfisExtras: 'display,kiosk,family,game_master' }),
    ['reception', 'game_master']
  );
});

test('salva só os papéis acumuláveis, sem o principal', () => {
  assert.equal(perfisExtrasParaSalvar('admin', ['admin', 'reception', 'game_master']), 'reception,game_master');
});

test('sem papéis extras válidos, grava null', () => {
  assert.equal(perfisExtrasParaSalvar('reception', ['kiosk', 'display']), null);
  assert.equal(perfisExtrasParaSalvar('reception', undefined), null);
});
