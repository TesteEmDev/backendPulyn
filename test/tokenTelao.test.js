const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { verifyToken } = require('../utils/middleware');
const JWT_SECRET = process.env.JWT_SECRET || 'sua-chave-secreta-super-segura-2026';

// Sessão do telão: o id é o do buffet, não existe conta em `login`. Um token assim não pode levar `tv`:
// com `tv` o verifyToken procura a conta, não acha e responde 401 "Sessão encerrada".
test('token do telao sem tv passa pela verificacao sem consultar conta', async () => {
  const token = jwt.sign({ id: 'empresa-1', email: 'telao', empresaId: 'empresa-1', role: 'display' }, JWT_SECRET, { expiresIn: '1h' });
  let passou = false;
  const res = { status() { return this; }, json() { return this; } };
  await verifyToken({ headers: { authorization: `Bearer ${token}` } }, res, () => { passou = true; });
  assert.equal(passou, true);
});

test('assinarToken: conta leva tv; sessao sem conta (telao) nao leva', () => {
  const { assinarToken } = require('../routes/auth');
  const conta = jwt.decode(assinarToken({ loginId: 'l1', email: 'a@b.c', empresaId: 'e1', tokenVersao: 3 }, 'admin', ['admin']));
  assert.equal(conta.tv, 3);
  const telao = jwt.decode(assinarToken({ loginId: 'e1', email: 'telao', empresaId: 'e1' }, 'display', ['display'], '7d', { semConta: true }));
  assert.equal(telao.tv, undefined);
  assert.equal(telao.role, 'display');
});

test('token antigo do telao (tv 0 e id do buffet) tambem passa', async () => {
  const token = jwt.sign({ id: 'empresa-1', email: 'telao', empresaId: 'empresa-1', role: 'display', tv: 0 }, JWT_SECRET, { expiresIn: '1h' });
  let passou = false;
  const res = { status() { return this; }, json() { return this; } };
  await verifyToken({ headers: { authorization: `Bearer ${token}` } }, res, () => { passou = true; });
  assert.equal(passou, true);
});
