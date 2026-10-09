const test = require('node:test');
const assert = require('node:assert/strict');
const { planInviteRegistration, describeRegistrationResult } = require('../utils/familyInviteRules');

test('convite genérico SEM crianças é aceito e a conta nasce ativa', () => {
  const plan = planInviteRegistration({ linkedChildId: null, children: [] });
  assert.equal(plan.error, undefined);
  assert.equal(plan.childless, true);
  assert.equal(plan.loginStatus, 'active');
});

test('sem o campo children (o app novo não envia) também é aceito', () => {
  const plan = planInviteRegistration({ linkedChildId: null, children: undefined });
  assert.equal(plan.error, undefined);
  assert.equal(plan.loginStatus, 'active');
});

test('convite genérico COM crianças também nasce ativo (sem aprovação da recepção)', () => {
  const plan = planInviteRegistration({ linkedChildId: null, children: [{ name: 'Lia' }] });
  assert.equal(plan.error, undefined);
  assert.equal(plan.childless, false);
  assert.equal(plan.loginStatus, 'active');
});

test('convite já vinculado a uma criança também nasce ativo', () => {
  const plan = planInviteRegistration({ linkedChildId: 'abc', children: [] });
  assert.equal(plan.childless, false);
  assert.equal(plan.loginStatus, 'active');
});

test('mais de 10 crianças ou criança sem nome continuam recusados', () => {
  const many = Array.from({ length: 11 }, (_, i) => ({ name: `C${i}` }));
  assert.match(planInviteRegistration({ linkedChildId: null, children: many }).error, /no máximo 10/);
  assert.match(planInviteRegistration({ linkedChildId: null, children: [{ name: '  ' }] }).error, /nome de todas/);
});

test('convite vinculado ignora a lista de crianças enviada', () => {
  const plan = planInviteRegistration({ linkedChildId: 'abc', children: [{ name: '' }] });
  assert.equal(plan.error, undefined);
});

test('resposta: sem crianças e conta ativa => "active" com instrução do QR Code', () => {
  const r = describeRegistrationResult({ childless: true, plannedLoginStatus: 'active', existingLoginStatus: undefined });
  assert.equal(r.status, 'active');
  assert.match(r.message, /QR Code/);
});

test('resposta: com crianças e conta ativa => "active"', () => {
  const r = describeRegistrationResult({ childless: false, plannedLoginStatus: 'active', existingLoginStatus: undefined });
  assert.equal(r.status, 'active');
});

test('resposta: e-mail com conta ainda pendente (fluxo antigo) continua "pending"', () => {
  const r = describeRegistrationResult({ childless: true, plannedLoginStatus: 'active', existingLoginStatus: 'pending' });
  assert.equal(r.status, 'pending');
});
