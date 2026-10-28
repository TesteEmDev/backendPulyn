const test = require('node:test');
const assert = require('node:assert/strict');
const { ehMac, macDaUrl, trocarMacNaUrl, ehHeartbeat, ehConsultaDeModo } = require('../utils/dispositivoMac');

test('só o MAC com dois-pontos é reconhecido; chaves antigas não', () => {
  assert.equal(ehMac('AA:BB:CC:DD:EE:FF'), true);
  assert.equal(ehMac('aa:bb:cc:dd:ee:ff'), true);
  assert.equal(ehMac(' AA:BB:CC:DD:EE:FF '), true);
  for (const nao of ['15', 'R1', 'cp-4', 'FPUETV-R1', 'AABBCCDDEEFF', 'AA-BB-CC-DD-EE-FF', 'AA:BB:CC:DD:EE', 'GG:BB:CC:DD:EE:FF', '', null, undefined, 12]) {
    assert.equal(ehMac(nao), false, String(nao));
  }
});

test('acha o MAC no lugar do ID no caminho, também com os dois-pontos codificados', () => {
  assert.equal(macDaUrl('/pontoVerificacao/AA:BB:CC:DD:EE:FF/heartbeat'), 'AA:BB:CC:DD:EE:FF');
  assert.equal(macDaUrl('/pontoVerificacao/AA%3ABB%3ACC%3ADD%3AEE%3AFF/territory'), 'AA:BB:CC:DD:EE:FF');
  assert.equal(macDaUrl('/api/bomba/pontoVerificacao/aa:bb:cc:dd:ee:ff/estado?x=1'), 'aa:bb:cc:dd:ee:ff');
});

test('caminhos com ID antigo ou rotas que não são ID não são tocados', () => {
  assert.equal(macDaUrl('/pontoVerificacao/15/heartbeat'), null);
  assert.equal(macDaUrl('/pontoVerificacao/cp-4/territory'), null);
  assert.equal(macDaUrl('/pontoVerificacao/evento/abc'), null);
  assert.equal(macDaUrl('/pontoVerificacao/recebimento/pendentes'), null);
  assert.equal(macDaUrl('/pontoVerificacao/resumo'), null);
  assert.equal(macDaUrl('/leituras'), null);
  assert.equal(macDaUrl(''), null);
  assert.equal(macDaUrl(undefined), null);
});

test('troca o MAC do caminho pela chave interna e preserva o resto da URL', () => {
  assert.equal(trocarMacNaUrl('/pontoVerificacao/AA:BB:CC:DD:EE:FF/heartbeat', 'cp-4'), '/pontoVerificacao/cp-4/heartbeat');
  assert.equal(trocarMacNaUrl('/api/bomba/pontoVerificacao/AA:BB:CC:DD:EE:FF/estado?a=1', '15'), '/api/bomba/pontoVerificacao/15/estado?a=1');
  assert.equal(trocarMacNaUrl('/pontoVerificacao/AA:BB:CC:DD:EE:FF/territory', 'FPUETV-R1'), '/pontoVerificacao/FPUETV-R1/territory');
});

test('chave com símbolo é codificada para não quebrar o caminho', () => {
  assert.equal(trocarMacNaUrl('/pontoVerificacao/AA:BB:CC:DD:EE:FF/heartbeat', 'a b'), '/pontoVerificacao/a%20b/heartbeat');
});

test('reconhece o heartbeat, o único pedido que um checkpoint ainda não aceito pode fazer', () => {
  assert.equal(ehHeartbeat('/pontoVerificacao/AA:BB:CC:DD:EE:FF/heartbeat'), true);
  assert.equal(ehHeartbeat('/api/pontoVerificacao/15/heartbeat?x=1'), true);
  assert.equal(ehHeartbeat('/pontoVerificacao/15/territory'), false);
  assert.equal(ehHeartbeat('/leituras'), false);
  assert.equal(ehHeartbeat('/pontoVerificacao/15/heartbeats'), false);
});

test('só o GET do modo do checkpoint é a consulta de modo', () => {
  assert.equal(ehConsultaDeModo({ method: 'GET', url: '/debug/checkpoint-mode?checkpointId=70:4B:CA:02:ED:54' }), true);
  assert.equal(ehConsultaDeModo({ method: 'GET', url: '/debug/checkpoint-mode' }), true);
  assert.equal(ehConsultaDeModo({ method: 'POST', url: '/debug/checkpoint-mode?checkpointId=1' }), false);
  assert.equal(ehConsultaDeModo({ method: 'GET', url: '/debug/checkpoint-mode-x?checkpointId=1' }), false);
  assert.equal(ehConsultaDeModo({ method: 'GET', url: '/pontoVerificacao/1/territory' }), false);
});
