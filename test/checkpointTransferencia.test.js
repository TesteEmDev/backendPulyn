const test = require('node:test');
const assert = require('node:assert/strict');
const {
  STATUS, normalizarMac, validarNumCheck,
  podeTransferir, podeCancelarTransferencia, podeExcluir, podeEditarNumCheck, chaveProvisoria, semIdNovo,
} = require('../utils/checkpointTransferencia');

test('as respostas atuais não levam o id novo, para o apelido id -> checkpointId do frontend continuar valendo', () => {
  const linha = { id: 4, checkpointId: '15', nome: 'Entrada', numCheck: '15' };
  assert.deepEqual(semIdNovo(linha), { checkpointId: '15', nome: 'Entrada', numCheck: '15' });
  assert.deepEqual(semIdNovo([linha, { id: 5, checkpointId: 'R1' }]), [
    { checkpointId: '15', nome: 'Entrada', numCheck: '15' },
    { checkpointId: 'R1' },
  ]);
  assert.equal('id' in linha, true, 'não altera a linha original');
  assert.equal(semIdNovo(undefined), undefined);
  assert.equal(semIdNovo(null), null);
});

test('o MAC é normalizado para maiúsculas com dois-pontos, venha como vier', () => {
  assert.equal(normalizarMac('aa:bb:cc:dd:ee:ff'), 'AA:BB:CC:DD:EE:FF');
  assert.equal(normalizarMac('AA-BB-CC-DD-EE-FF'), 'AA:BB:CC:DD:EE:FF');
  assert.equal(normalizarMac('aabb.ccdd.eeff'), 'AA:BB:CC:DD:EE:FF');
  assert.equal(normalizarMac('  a0b1c2d3e4f5  '), 'A0:B1:C2:D3:E4:F5');
});

test('o que não é um MAC de 12 dígitos hexadecimais é recusado', () => {
  assert.equal(normalizarMac(''), null);
  assert.equal(normalizarMac(null), null);
  assert.equal(normalizarMac(undefined), null);
  assert.equal(normalizarMac('AA:BB:CC:DD:EE'), null);
  assert.equal(normalizarMac('AA:BB:CC:DD:EE:FF:00'), null);
  assert.equal(normalizarMac('GG:BB:CC:DD:EE:FF'), null);
});

test('o número do checkpoint pode ficar vazio até o buffet definir', () => {
  for (const vazio of [undefined, null, '', '   ']) {
    assert.deepEqual(validarNumCheck(vazio), { ok: true, valor: null });
  }
});

test('o número do checkpoint aceita letras e números e tira os espaços das pontas', () => {
  assert.deepEqual(validarNumCheck(' 12 '), { ok: true, valor: '12' });
  assert.deepEqual(validarNumCheck('R1'), { ok: true, valor: 'R1' });
  assert.deepEqual(validarNumCheck(7), { ok: true, valor: '7' });
});

test('o número do checkpoint recusa espaço, símbolos de URL e mais de 40 caracteres', () => {
  for (const ruim of ['1 2', 'a/b', 'a\\b', 'a?b', 'a#b', 'a%b', 'x'.repeat(41)]) {
    assert.equal(validarNumCheck(ruim).ok, false, ruim);
  }
  assert.equal(validarNumCheck('x'.repeat(40)).ok, true);
});

test('só transfere o que está em estoque', () => {
  assert.equal(podeTransferir(STATUS.ESTOQUE), true);
  assert.equal(podeTransferir(STATUS.PENDENTE), false);
  assert.equal(podeTransferir(STATUS.ACEITO), false);
});

test('só cancela a transferência que ainda está pendente', () => {
  assert.equal(podeCancelarTransferencia(STATUS.PENDENTE), true);
  assert.equal(podeCancelarTransferencia(STATUS.ESTOQUE), false);
  assert.equal(podeCancelarTransferencia(STATUS.ACEITO), false);
});

test('só exclui o que nunca saiu do estoque', () => {
  assert.equal(podeExcluir(STATUS.ESTOQUE), true);
  assert.equal(podeExcluir(STATUS.PENDENTE), false);
  assert.equal(podeExcluir(STATUS.ACEITO), false);
});

test('depois do aceite o número é do buffet e o master não edita', () => {
  assert.equal(podeEditarNumCheck(STATUS.ESTOQUE), true);
  assert.equal(podeEditarNumCheck(STATUS.PENDENTE), true);
  assert.equal(podeEditarNumCheck(STATUS.ACEITO), false);
});

test('a chave provisória não bate com os IDs antigos como "12" ou "R1"', () => {
  assert.equal(chaveProvisoria(12), 'cp-12');
  assert.equal(chaveProvisoria('7'), 'cp-7');
});
