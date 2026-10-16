const test = require('node:test');
const assert = require('node:assert/strict');
const {
  codigoDoEpc, epcDoCodigo, baldeDe, validarLote, gerarChave, hashChave, chaveConfere, LIMITE_LEITURAS,
} = require('../utils/uhfLote');

test('EPC de 24 hex volta a ser o código da pulseira sem os zeros', () => {
  assert.equal(codigoDoEpc('0000000000040FE75ABB2191'), '40FE75ABB2191');
  assert.equal(codigoDoEpc('00000000 0004 0fe7 5abb 2191'), '40FE75ABB2191');
  assert.equal(codigoDoEpc(''), '');
  assert.equal(codigoDoEpc('0'.repeat(25) + '1'), '');
});

test('código da pulseira vira EPC de 24 hex e o caminho de volta compara igual', () => {
  assert.equal(epcDoCodigo('040FE75ABB2191'), '0000000000040FE75ABB2191');
  assert.equal(codigoDoEpc(epcDoCodigo('040FE75ABB2191')), codigoDoEpc('040FE75ABB2191'));
  assert.equal(epcDoCodigo('x'.repeat(3)), '');
});

test('balde é o início da janela de 20 s', () => {
  assert.equal(baldeDe('2026-10-16T18:00:19.999Z').toISOString(), '2026-10-16T18:00:00.000Z');
  assert.equal(baldeDe('2026-10-16T18:00:20.000Z').toISOString(), '2026-10-16T18:00:20.000Z');
});

test('lote válido: limita n aos ciclos, junta repetidos e conta ignoradas', () => {
  const lote = validarLote({
    seq: 7, ciclos: 16, portas: [1, 2, 9],
    leituras: [
      { epc: '0000000000040FE75ABB2191', ant: 2, n: 9, rssiMed: -61.5, rssiMax: -55 },
      { epc: '0000000000040FE75ABB2191', ant: 2, n: 12, rssiMed: -60, rssiMax: -54 },
      { epc: '0000000000040FE75ABB2191', ant: 3, n: 40, rssiMed: -70 },
      { epc: 'lixo', ant: 1, n: 3, rssiMed: -60 },
      { epc: '0000000000040FE75ABB2191', ant: 5, n: 3, rssiMed: -60 },
      { epc: '0000000000040FE75ABB2191', ant: 1, n: 0, rssiMed: -60 },
    ],
  });
  assert.equal(lote.seq, 7);
  assert.deepEqual(lote.portas, [1, 2]);
  assert.deepEqual(lote.leituras, [
    { codigo: '40FE75ABB2191', porta: 2, n: 12, rssiMed: -60, rssiMax: -54 },
    { codigo: '40FE75ABB2191', porta: 3, n: 16, rssiMed: -70, rssiMax: -70 },
  ]);
  assert.equal(lote.ignoradas, 4);
});

test('RSSI abaixo do mínimo do leitor é descartado', () => {
  const lote = validarLote({ seq: 1, leituras: [{ epc: '01', ant: 1, n: 2, rssiMed: -80 }] }, { rssiMin: -75 });
  assert.deepEqual(lote.leituras, []);
  assert.equal(lote.ignoradas, 1);
});

test('lotes inválidos devolvem erro', () => {
  assert.ok(validarLote(null).erro);
  assert.ok(validarLote({ seq: -1 }).erro);
  assert.ok(validarLote({ seq: 1, ciclos: 0 }).erro);
  assert.ok(validarLote({ seq: 1, leituras: 'x' }).erro);
  const grande = validarLote({ seq: 1, leituras: Array(LIMITE_LEITURAS + 1).fill({}) });
  assert.equal(grande.status, 413);
});

test('chave do leitor: só a chave certa confere com o hash', () => {
  const chave = gerarChave();
  const hash = hashChave(chave);
  assert.equal(chaveConfere(chave, hash), true);
  assert.equal(chaveConfere(chave + 'x', hash), false);
  assert.equal(chaveConfere('', hash), false);
  assert.equal(chaveConfere(chave, null), false);
});
