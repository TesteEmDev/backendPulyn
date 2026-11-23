const test = require('node:test');
const assert = require('node:assert/strict');
const { montarEventosDaFamilia } = require('../utils/eventosFamilia');

// ---- Lista de eventos da família (alimenta "Meus eventos" e o seletor da home) ----

const ev = (id, data, extra = {}) => ({ eventoId: id, nome: `Evento ${id}`, data, status: 'active', buffetNome: 'Buffet X', ...extra });

test('evento do pré-cadastro já cadastrado pela recepção aparece, sem criança, pontos nem etiqueta de código', () => {
  const lista = montarEventosDaFamilia([], [], [ev('e1', '2026-11-06')]);
  assert.equal(lista.length, 1);
  assert.equal(lista[0].id, 'e1');
  assert.equal(lista[0].adicionadoPorConvite, false);
  assert.deepEqual(lista[0].criancas, []);
  assert.equal(lista[0].totalPontos, 0);
});

test('depois do vínculo o mesmo evento vira um item só, agora com a criança', () => {
  const lista = montarEventosDaFamilia(
    [],
    [{ ...ev('e1', '2026-11-06'), criancaId: 'c1', criancaNome: 'Lia', pontos: 20 }],
    [ev('e1', '2026-11-06')]
  );
  assert.equal(lista.length, 1);
  assert.equal(lista[0].criancas.length, 1);
  assert.equal(lista[0].totalPontos, 20);
});

test('evento por código e por pré-cadastro continua marcado como adicionado por código', () => {
  const lista = montarEventosDaFamilia([ev('e1', '2026-11-06')], [], [ev('e1', '2026-11-06')]);
  assert.equal(lista.length, 1);
  assert.equal(lista[0].adicionadoPorConvite, true);
});

test('sem a terceira origem, o comportamento antigo não muda', () => {
  assert.equal(montarEventosDaFamilia([ev('e1', '2026-11-06')], []).length, 1);
  assert.equal(montarEventosDaFamilia().length, 0);
});

// ---- Acesso da conta ao evento (eventoDaFamilia), com o banco trocado por um falso ----

const databasePath = require.resolve('../database');
const acessoPath = require.resolve('../utils/acessoEventoFamilia');

/**
 * Carrega acessoEventoFamilia com um banco falso. `dados` diz o que cada consulta devolve; `consultas` registra o que foi pedido.
 */
function carregarComBanco(dados) {
  const consultas = [];
  const queryOne = async (sql, params) => {
    consultas.push(sql);
    if (sql.includes('FROM evento')) return dados.evento ?? null;
    if (sql.includes('FROM familiaEvento')) return dados.porConvite ?? null;
    if (sql.includes('perfilVinculoFamiliar')) return dados.porPreCadastro ?? null;
    if (sql.includes('vinculoFamiliar')) return dados.comCrianca ?? null;
    throw new Error(`consulta inesperada: ${sql}`);
  };
  delete require.cache[acessoPath];
  require.cache[databasePath] = { id: databasePath, filename: databasePath, loaded: true, exports: { queryOne } };
  const modulo = require('../utils/acessoEventoFamilia');
  return { ...modulo, consultas };
}

test.after(() => {
  delete require.cache[databasePath];
  delete require.cache[acessoPath];
});

const EVENTO_DO_BUFFET = { eventoId: 'ev-buffet', empresaId: 'empresa-buffet' };
// Conta que se cadastrou sozinha: empresa própria ("Fulano's Family"), diferente da do buffet do evento
const CONTA_AVULSA = { id: 'login-1', role: 'family', empresaId: 'empresa-propria' };

test('conta de outro buffet SEM nenhuma ligação com o evento continua sem acesso', async () => {
  const { eventoDaFamilia } = carregarComBanco({ evento: EVENTO_DO_BUFFET });
  assert.equal(await eventoDaFamilia(CONTA_AVULSA, 'ev-buffet'), null);
});

test('conta de outro buffet COM pré-cadastro já cadastrado no evento tem acesso (o caso do vínculo da pulseira)', async () => {
  const { eventoDaFamilia } = carregarComBanco({ evento: EVENTO_DO_BUFFET, porPreCadastro: { x: 1 } });
  assert.deepEqual(await eventoDaFamilia(CONTA_AVULSA, 'ev-buffet'), EVENTO_DO_BUFFET);
});

test('a consulta do pré-cadastro filtra pela conta e pelo evento, e só roda quando as outras regras não valem', async () => {
  const { eventoDaFamilia, consultas } = carregarComBanco({ evento: EVENTO_DO_BUFFET, comCrianca: { x: 1 } });
  await eventoDaFamilia(CONTA_AVULSA, 'ev-buffet');
  assert.ok(!consultas.some((sql) => sql.includes('perfilVinculoFamiliar')), 'com criança vinculada nem precisa olhar o pré-cadastro');

  const sem = carregarComBanco({ evento: EVENTO_DO_BUFFET });
  await sem.eventoDaFamilia(CONTA_AVULSA, 'ev-buffet');
  const sql = sem.consultas.find((s) => s.includes('perfilVinculoFamiliar'));
  assert.match(sql, /pv\.loginId = @loginId/);
  assert.match(sql, /LOWER\(c\.eventoId\) = LOWER\(@eventoId\)/);
});

test('o buffet da própria conta e o evento inexistente seguem como antes', async () => {
  const mesmo = carregarComBanco({ evento: EVENTO_DO_BUFFET });
  assert.deepEqual(await mesmo.eventoDaFamilia({ id: 'l', role: 'family', empresaId: 'EMPRESA-BUFFET' }, 'ev-buffet'), EVENTO_DO_BUFFET);

  const nenhum = carregarComBanco({});
  assert.equal(await nenhum.eventoDaFamilia(CONTA_AVULSA, 'nao-existe'), null);
  assert.equal(await nenhum.eventoDaFamilia(CONTA_AVULSA, ''), null);
});
