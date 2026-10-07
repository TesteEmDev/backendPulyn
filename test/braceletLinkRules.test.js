const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseBraceletUid,
  checkBraceletLinkable,
  createAttemptLimiter,
} = require('../utils/braceletLinkRules');

const aberta = { status: 'em_uso', criancaId: 'c1', eventoId: 'e1', evento_status: 'scheduled' };

test('UID de NTAG (7 bytes) é normalizado para maiúsculas, sem separadores', () => {
  assert.deepEqual(parseBraceletUid('04:e7:2c:1a:89:68:80'), { uid: '04E72C1A896880' });
  assert.deepEqual(parseBraceletUid('04 E7 2C 1A 89 68 80'), { uid: '04E72C1A896880' });
});

test('UIDs de 4 e 10 bytes também são aceitos', () => {
  assert.deepEqual(parseBraceletUid('a1b2c3d4'), { uid: 'A1B2C3D4' });
  assert.equal(parseBraceletUid('04E72C1A896880AABBCC').uid, '04E72C1A896880AABBCC');
});

test('UID vazio, curto, longo ou de tamanho estranho é recusado', () => {
  for (const value of ['', null, undefined, 'ABC', '04E72C1A8968', '04E72C1A89688001', 'ZZZZZZZZ']) {
    const result = parseBraceletUid(value);
    assert.equal(result.uid, undefined, `deveria recusar ${JSON.stringify(value)}`);
    assert.equal(result.code, 'INVALID_BRACELET');
  }
});

test('pulseira em uso, com criança, em evento aberto: pode vincular', () => {
  assert.deepEqual(checkBraceletLinkable(aberta), { ok: true });
});

test('pulseira inexistente, livre, sem criança ou sem evento: mesma resposta genérica', () => {
  const casos = [
    null,
    { ...aberta, status: 'disponivel' },
    { ...aberta, criancaId: null },
    { ...aberta, eventoId: null },
  ];
  for (const row of casos) {
    const result = checkBraceletLinkable(row);
    assert.equal(result.ok, false);
    assert.equal(result.code, 'BRACELET_NOT_AVAILABLE');
  }
  const mensagens = new Set(casos.map((row) => checkBraceletLinkable(row).error));
  assert.equal(mensagens.size, 1, 'a mensagem não pode revelar o motivo');
});

test('evento encerrado ou cancelado: não pode vincular', () => {
  for (const evento_status of ['completed', 'finished', 'cancelled', 'canceled', ' COMPLETED ']) {
    assert.equal(checkBraceletLinkable({ ...aberta, evento_status }).ok, false, evento_status);
  }
});

test('evento agendado ou ativo: pode vincular', () => {
  for (const evento_status of ['scheduled', 'active', null, undefined]) {
    assert.equal(checkBraceletLinkable({ ...aberta, evento_status }).ok, true, String(evento_status));
  }
});

test('limite de tentativas: bloqueia a partir da 11ª e informa quanto esperar', () => {
  let agora = 1_000_000;
  const limiter = createAttemptLimiter({ max: 10, windowMs: 600_000, now: () => agora });

  for (let i = 0; i < 10; i++) {
    assert.equal(limiter.hit('maria').allowed, true, `tentativa ${i + 1}`);
    agora += 1000;
  }

  const bloqueada = limiter.hit('maria');
  assert.equal(bloqueada.allowed, false);
  assert.ok(bloqueada.retryAfterSec > 0 && bloqueada.retryAfterSec <= 600);
});

test('limite de tentativas: é por responsável e libera depois da janela', () => {
  let agora = 0;
  const limiter = createAttemptLimiter({ max: 2, windowMs: 1000, now: () => agora });

  assert.equal(limiter.hit('maria').allowed, true);
  assert.equal(limiter.hit('maria').allowed, true);
  assert.equal(limiter.hit('maria').allowed, false);
  assert.equal(limiter.hit('joao').allowed, true, 'outro responsável não é afetado');

  agora = 1001;
  assert.equal(limiter.hit('maria').allowed, true, 'libera depois da janela');
});
