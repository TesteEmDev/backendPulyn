const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizarDataNascimento, idadeNaData } = require('../utils/nascimento');
const { normalizarTelefone, formatarTelefone } = require('../utils/telefone');

const hoje = new Date('2026-11-04T15:00:00Z');   // 04/11/2026 no Brasil

test('data de nascimento: aceita AAAA-MM-DD, DD/MM/AAAA e DDMMAAAA', () => {
  assert.deepEqual(normalizarDataNascimento('2018-06-15', hoje), { data: '2018-06-15' });
  assert.deepEqual(normalizarDataNascimento('15/06/2018', hoje), { data: '2018-06-15' });
  assert.deepEqual(normalizarDataNascimento('15062018', hoje), { data: '2018-06-15' });
  assert.deepEqual(normalizarDataNascimento(' 2026-11-04 ', hoje), { data: '2026-11-04' }, 'nascida hoje vale');
});

test('data de nascimento: recusa futuro, dia que não existe, velho demais e texto', () => {
  assert.match(normalizarDataNascimento('2026-11-05', hoje).erro, /futuro/);
  assert.match(normalizarDataNascimento('2027-01-01', hoje).erro, /futuro/);
  assert.match(normalizarDataNascimento('31/02/2018', hoje).erro, /não existe/);
  assert.match(normalizarDataNascimento('2018-13-01', hoje).erro, /não existe/);
  assert.match(normalizarDataNascimento('1990-01-01', hoje).erro, /mais de 18/);
  for (const ruim of ['', 'abc', null, undefined, '2018/06/15', '15-06-2018']) assert.match(normalizarDataNascimento(ruim, hoje).erro, /formato/);
  assert.equal(normalizarDataNascimento('2008-11-04', hoje).data, '2008-11-04', '18 anos completos ainda vale');
});

test('idade na data: anos completos no dia', () => {
  assert.equal(idadeNaData('2018-11-04', hoje), 8);
  assert.equal(idadeNaData('2018-11-05', hoje), 7, 'faz anos amanhã');
  assert.equal(idadeNaData('2026-11-04', hoje), 0);
  assert.equal(idadeNaData('2020-02-29', hoje), 6);
  assert.equal(idadeNaData('lixo', hoje), null);
  assert.equal(idadeNaData(new Date(2018, 5, 15), hoje), 8, 'aceita Date (coluna date do banco)');
});

test('telefone: só dígitos com DDD; aceita máscara e +55', () => {
  assert.equal(normalizarTelefone('(11) 91234-5678'), '11912345678');
  assert.equal(normalizarTelefone('11 3234-5678'), '1132345678');
  assert.equal(normalizarTelefone('+55 (21) 99876-5432'), '21998765432');
  assert.equal(normalizarTelefone('5511912345678'), '11912345678');
});

test('telefone: recusa o que não é celular ou fixo brasileiro com DDD', () => {
  for (const ruim of ['', null, undefined, '123', '911234567', '(11) 31234-5678', '(00) 91234-5678', '(10) 91234-5678', '(11) 61234-567', 'abc']) {
    assert.equal(normalizarTelefone(ruim), null, String(ruim));
  }
});

test('telefone: formatação', () => {
  assert.equal(formatarTelefone('11912345678'), '(11) 91234-5678');
  assert.equal(formatarTelefone('1132345678'), '(11) 3234-5678');
  assert.equal(formatarTelefone('123'), '123');
});
