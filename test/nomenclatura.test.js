const test = require('node:test');
const assert = require('node:assert/strict');
const { citarIdentificadoresCamelCase, converterLinhasParaApi } = require('../utils/sqlNomenclatura');
const { ESQUEMA, mapaChavesDaApi } = require('../schema/nomenclatura');

test('põe aspas só nos identificadores camelCase', () => {
  assert.equal(
    citarIdentificadoresCamelCase('SELECT c.criancaId, c.nome FROM crianca c WHERE c.eventoId = @eventoId'),
    'SELECT c."criancaId", c.nome FROM crianca c WHERE c."eventoId" = @eventoId'
  );
});

test('não mexe em texto entre aspas, identificadores já citados, comentários nem parâmetros', () => {
  const sql = `SELECT "criadoEm", 'fooBar' AS txt, @empresaId, $1 -- comentário criadoEm\n FROM x /* outroNome */`;
  assert.equal(citarIdentificadoresCamelCase(sql), sql);
});

test('aspas dentro de literal com aspas duplicadas não confundem o parser', () => {
  assert.equal(
    citarIdentificadoresCamelCase("SELECT 'it''s criadoEm', criadoEm FROM x"),
    `SELECT 'it''s criadoEm', "criadoEm" FROM x`
  );
});

test('nomes de tabelas e colunas do esquema são únicos e seguem o padrão camelCase', () => {
  const novos = new Set();
  for (const item of ESQUEMA) {
    assert.ok(!novos.has(item.novo), `tabela repetida: ${item.novo}`);
    novos.add(item.novo);
    assert.match(item.novo, /^[a-z][A-Za-z0-9]*$/, `tabela fora do padrão: ${item.novo}`);
    const colunas = new Set();
    for (const nova of Object.values(item.colunas)) {
      assert.match(nova, /^[a-z][A-Za-z0-9]*$/, `coluna fora do padrão: ${item.novo}.${nova}`);
      assert.ok(!colunas.has(nova), `coluna repetida: ${item.novo}.${nova}`);
      colunas.add(nova);
    }
  }
});

test('devolve as chaves que a API sempre expôs para colunas lidas direto da tabela', () => {
  const catalogo = new Map([[10, { tabela: 'crianca', colunas: new Map([[1, 'criancaId'], [2, 'nome'], [3, 'codigoPulseira']]) }]]);
  const fields = [
    { name: 'criancaId', tableID: 10, columnID: 1 },
    { name: 'nome', tableID: 10, columnID: 2 },
    { name: 'codigoPulseira', tableID: 10, columnID: 3 },
    { name: 'total', tableID: 0, columnID: 0 }
  ];
  const rows = [{ criancaId: 'c1', nome: 'Ana', codigoPulseira: 'P1', total: 4 }];
  assert.deepEqual(converterLinhasParaApi(fields, rows, catalogo), [{ id: 'c1', name: 'Ana', bracelet_code: 'P1', total: 4 }]);
});

test('coluna com apelido explícito mantém o apelido', () => {
  const catalogo = new Map([[10, { tabela: 'time', colunas: new Map([[1, 'timeId'], [2, 'nome']]) }]]);
  const fields = [{ name: 'time_id', tableID: 10, columnID: 1 }, { name: 'nome', tableID: 10, columnID: 2 }];
  assert.deepEqual(converterLinhasParaApi(fields, [{ time_id: 't1', nome: 'Azul' }], catalogo), [{ time_id: 't1', name: 'Azul' }]);
});

test('se a conversão fizesse duas colunas colidirem, mantém os nomes do banco', () => {
  const catalogo = new Map([
    [10, { tabela: 'time', colunas: new Map([[1, 'timeId']]) }],
    [11, { tabela: 'crianca', colunas: new Map([[1, 'criancaId']]) }]
  ]);
  const fields = [{ name: 'timeId', tableID: 10, columnID: 1 }, { name: 'criancaId', tableID: 11, columnID: 1 }];
  const rows = [{ timeId: 't1', criancaId: 'c1' }];
  assert.deepEqual(converterLinhasParaApi(fields, rows, catalogo), rows);
});

test('mapaChavesDaApi cobre as tabelas conhecidas e ignora as desconhecidas', () => {
  assert.equal(mapaChavesDaApi('time').get('pontos'), 'points');
  assert.equal(mapaChavesDaApi('tabelaInexistente'), null);
});
