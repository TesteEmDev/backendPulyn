const test = require('node:test');
const assert = require('node:assert/strict');
const { ONLINE_ATE_MS, statusEfetivo } = require('../utils/statusCheckpoint');

const agora = Date.parse('2026-10-30T15:00:00Z');
const haSegundos = (s) => new Date(agora - s * 1000);

test('online só com heartbeat recente', () => {
  assert.equal(statusEfetivo('online', haSegundos(5), agora), 'online');
  assert.equal(statusEfetivo('online', haSegundos(ONLINE_ATE_MS / 1000), agora), 'online');
  assert.equal(statusEfetivo('online', haSegundos(ONLINE_ATE_MS / 1000 + 1), agora), 'offline');
  assert.equal(statusEfetivo('online', haSegundos(3600), agora), 'offline');
});

test('placa desligada: o banco ainda diz online, mas a lista mostra offline', () => {
  assert.equal(statusEfetivo('online', haSegundos(15 * 60), agora), 'offline');
});

test('sem registro de quando foi vista, ou status que não é online: offline', () => {
  assert.equal(statusEfetivo('online', null, agora), 'offline');
  assert.equal(statusEfetivo('online', undefined, agora), 'offline');
  assert.equal(statusEfetivo('online', 'lixo', agora), 'offline');
  assert.equal(statusEfetivo('offline', haSegundos(1), agora), 'offline');
  assert.equal(statusEfetivo(null, haSegundos(1), agora), 'offline');
  assert.equal(statusEfetivo(' ONLINE ', haSegundos(1), agora), 'online');
});
