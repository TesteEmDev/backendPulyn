const test = require('node:test');
const assert = require('node:assert/strict');
const {
  aspas,
  dividirEmLotes,
  linhasPorComando,
  agruparFila,
  particionarPorTabela,
  montarSelectPorChave,
  montarDelete,
  montarUpsert,
  atrasoTentativaMs,
  ordenarTabelas,
  ehErroDeConexao,
} = require('../utils/sincronizacaoSql');

test('aspas protege nomes camelCase e aspas dentro do nome', () => {
  assert.equal(aspas('eventoId'), '"eventoId"');
  assert.equal(aspas('a"b'), '"a""b"');
});

test('dividirEmLotes respeita o tamanho e mantém a ordem', () => {
  assert.deepEqual(dividirEmLotes([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(dividirEmLotes([], 3), []);
});

test('linhasPorComando nunca passa do limite de parâmetros do Postgres', () => {
  assert.ok(linhasPorComando(20) * 20 <= 65535);
  assert.equal(linhasPorComando(100000), 1);
});

test('agruparFila junta a mesma linha, mantém a ordem da primeira ocorrência e guarda todos os ids', () => {
  const chaves = { time: ['timeId'], crianca: ['criancaId'] };
  const grupos = agruparFila([
    { filaId: 1, tabela: 'time', chave: { timeId: 'A' }, tentativas: 0 },
    { filaId: 2, tabela: 'crianca', chave: { criancaId: 'C1' }, tentativas: 0 },
    { filaId: 3, tabela: 'time', chave: { timeId: 'A' }, tentativas: 2 },
    { filaId: 4, tabela: 'time', chave: { timeId: 'B' }, tentativas: 0 },
  ], chaves);
  assert.deepEqual(grupos.map((g) => [g.tabela, g.valores[0], g.ids]), [
    ['time', 'A', [1, 3]],
    ['crianca', 'C1', [2]],
    ['time', 'B', [4]],
  ]);
  assert.equal(grupos[0].tentativas, 2);
});

test('agruparFila trata a chave numérica e a textual como a mesma linha', () => {
  const grupos = agruparFila([
    { filaId: 1, tabela: 'configuracao', chave: { configuracaoId: 7 } },
    { filaId: 2, tabela: 'configuracao', chave: { configuracaoId: '7' } },
  ], { configuracao: ['configuracaoId'] });
  assert.equal(grupos.length, 1);
  assert.deepEqual(grupos[0].ids, [1, 2]);
});

test('particionarPorTabela só junta sequências consecutivas, sem trocar a ordem entre tabelas', () => {
  const blocos = particionarPorTabela([{ tabela: 'a' }, { tabela: 'a' }, { tabela: 'b' }, { tabela: 'a' }]);
  assert.deepEqual(blocos.map((b) => [b.tabela, b.grupos.length]), [['a', 2], ['b', 1], ['a', 1]]);
});

test('montarSelectPorChave e montarDelete suportam chave simples e composta', () => {
  const simples = montarSelectPorChave({ tabela: 'time', colunas: ['timeId'], chaves: [['A'], ['B']] });
  assert.equal(simples.text, 'SELECT * FROM "time" WHERE ("timeId") IN (($1), ($2))');
  assert.deepEqual(simples.values, ['A', 'B']);

  const composta = montarDelete({ tabela: 'criancaConquista', colunas: ['criancaId', 'conquistaId'], chaves: [['c', 'q'], ['d', 'r']] });
  assert.equal(composta.text, 'DELETE FROM "criancaConquista" WHERE ("criancaId", "conquistaId") IN (($1, $2), ($3, $4))');
  assert.deepEqual(composta.values, ['c', 'q', 'd', 'r']);
});

test('montarUpsert grava a linha inteira e atualiza tudo menos a chave', () => {
  const { text, values } = montarUpsert({
    tabela: 'time',
    colunas: ['timeId', 'nome', 'cor'],
    colunasChave: ['timeId'],
    linhas: [{ timeId: 'A', nome: 'Azul', cor: '#00f' }, { timeId: 'B', nome: 'Verde', cor: undefined }],
  });
  assert.equal(
    text,
    'INSERT INTO "time" ("timeId", "nome", "cor") VALUES ($1, $2, $3), ($4, $5, $6) '
    + 'ON CONFLICT ("timeId") DO UPDATE SET "nome" = EXCLUDED."nome", "cor" = EXCLUDED."cor"'
  );
  assert.deepEqual(values, ['A', 'Azul', '#00f', 'B', 'Verde', null]);
});

test('montarUpsert usa DO NOTHING quando a tabela só tem colunas de chave', () => {
  const { text } = montarUpsert({
    tabela: 'eventoBrincadeira', colunas: ['eventoId', 'brincadeiraId'], colunasChave: ['eventoId', 'brincadeiraId'],
    linhas: [{ eventoId: 'e', brincadeiraId: 'b' }],
  });
  assert.match(text, /ON CONFLICT \("eventoId", "brincadeiraId"\) DO NOTHING$/);
});

test('atrasoTentativaMs cresce e para em 15 minutos', () => {
  assert.equal(atrasoTentativaMs(1), 5000);
  assert.equal(atrasoTentativaMs(2), 10000);
  assert.equal(atrasoTentativaMs(3), 20000);
  assert.equal(atrasoTentativaMs(50), 15 * 60 * 1000);
  assert.equal(atrasoTentativaMs(0), 5000);
});

test('ordenarTabelas põe o pai antes do filho e tolera ciclos', () => {
  const ordem = ordenarTabelas(['crianca', 'time', 'evento', 'empresa'], [
    { filho: 'crianca', pai: 'time' }, { filho: 'crianca', pai: 'evento' },
    { filho: 'time', pai: 'evento' }, { filho: 'evento', pai: 'empresa' }, { filho: 'time', pai: 'empresa' },
  ]);
  assert.deepEqual(ordem, ['empresa', 'evento', 'time', 'crianca']);

  const comCiclo = ordenarTabelas(['a', 'b', 'c'], [{ filho: 'a', pai: 'b' }, { filho: 'b', pai: 'a' }]);
  assert.deepEqual(comCiclo.sort(), ['a', 'b', 'c']);
});

test('ehErroDeConexao separa queda de rede de erro de dados', () => {
  assert.equal(ehErroDeConexao({ code: 'ECONNREFUSED' }), true);
  assert.equal(ehErroDeConexao({ code: 'ENOTFOUND' }), true);
  assert.equal(ehErroDeConexao({ code: '57P01' }), true);
  assert.equal(ehErroDeConexao({ message: 'Connection terminated unexpectedly' }), true);
  assert.equal(ehErroDeConexao({ code: '23503', message: 'violates foreign key', severity: 'ERROR' }), false);
  assert.equal(ehErroDeConexao({ code: '23505', message: 'duplicate key' }), false);
  assert.equal(ehErroDeConexao(null), false);
});
