const test = require('node:test');
const assert = require('node:assert/strict');
const { criarMapa, novaChave, reescreverLista } = require('../utils/reescreverReferencias');

// Chaves antigas -> id novo. Repare nos cruzamentos: a chave "2" vira "15" e a chave "15" vira "2".
const mapa = criarMapa([
  { velha: 'R1', nova: '1' },
  { velha: '2', nova: '15' },
  { velha: '15', nova: '2' },
  { velha: 'FPUETV-R1', nova: '3' },
]);

test('troca a chave antiga pela nova sem diferenciar maiúsculas', () => {
  assert.equal(novaChave('R1', mapa), '1');
  assert.equal(novaChave('r1', mapa), '1');
  assert.equal(novaChave(' FPUETV-R1 ', mapa), '3');
});

test('chaves que se cruzam são trocadas de uma vez, sem encadear', () => {
  assert.equal(novaChave('2', mapa), '15');
  assert.equal(novaChave('15', mapa), '2');
  assert.equal(reescreverLista('["2","15"]', mapa), '["15","2"]');
});

test('órfão só de dígitos ganha prefixo para não casar com o id de outro checkpoint', () => {
  assert.equal(novaChave('7', mapa), 'orfao:7');
  assert.equal(novaChave(7, mapa), 'orfao:7');
});

test('órfão que não é só dígitos fica como está: não pode virar um id', () => {
  assert.equal(novaChave('CHK-ANTIGO', mapa), 'CHK-ANTIGO');
  assert.equal(novaChave('0b7e4f1a-9c2d-4e8a-b1c3-5d6f7a8b9c0d', mapa), '0b7e4f1a-9c2d-4e8a-b1c3-5d6f7a8b9c0d');
});

test('rodar de novo não prefixa duas vezes', () => {
  assert.equal(novaChave('orfao:7', mapa), 'orfao:7');
  assert.equal(reescreverLista('["orfao:7"]', mapa), null);
});

test('lista de textos, de números e de objetos com id ou checkpointId', () => {
  assert.equal(reescreverLista('["R1","2"]', mapa), '["1","15"]');
  assert.equal(reescreverLista('[2,"R1"]', mapa), '["15","1"]');
  assert.equal(
    reescreverLista('[{"id":"R1","points":10,"special":true},{"checkpointId":"2","cooldown":5}]', mapa),
    '[{"id":"1","points":10,"special":true},{"checkpointId":"15","cooldown":5}]'
  );
});

test('a lista guarda a ordem e o tamanho, e os órfãos continuam lá', () => {
  const nova = JSON.parse(reescreverLista('["R1","9","FPUETV-R1","8"]', mapa));
  assert.deepEqual(nova, ['1', 'orfao:9', '3', 'orfao:8']);
});

test('devolve null quando nada muda ou quando o texto não é uma lista', () => {
  assert.equal(reescreverLista('[]', mapa), null);
  assert.equal(reescreverLista('["CHK-ANTIGO"]', mapa), null);
  assert.equal(reescreverLista('{"id":"R1"}', mapa), null);
  assert.equal(reescreverLista('isso não é json', mapa), null);
  assert.equal(reescreverLista('', mapa), null);
  assert.equal(reescreverLista(null, mapa), null);
});

test('itens sem id ou com id vazio passam intactos', () => {
  assert.equal(reescreverLista('[{"nome":"x"},{"id":null}]', mapa), null);
  assert.equal(reescreverLista('[null,true]', mapa), null);
});
