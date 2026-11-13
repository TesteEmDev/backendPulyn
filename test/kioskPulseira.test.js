const test = require('node:test');
const assert = require('node:assert/strict');
const { avaliarPulseira, MOTIVO } = require('../utils/pulseiraKiosk');

// ---- regra pura ----------------------------------------------------------------------------------------------------

test('pulseira que não está no estoque do buffet é recusada, com o motivo', () => {
  for (const ausente of [null, undefined]) {
    const r = avaliarPulseira(ausente);
    assert.equal(r.exists, false);
    assert.equal(r.available, false);
    assert.equal(r.motivo, MOTIVO.FORA_DO_ESTOQUE);
    assert.match(r.mensagem, /não está cadastrada neste buffet/);
  }
});

test('pulseira livre do estoque vale; em uso ou com outro status não', () => {
  assert.deepEqual(avaliarPulseira({ codigo: 'AA', status: 'disponivel', criancaId: null }),
    { exists: true, status: 'disponivel', available: true, motivo: null, mensagem: null });
  assert.equal(avaliarPulseira({ codigo: 'AA', status: 'DISPONIVEL ', criancaId: null }).available, true);

  const emUso = avaliarPulseira({ codigo: 'AA', status: 'em_uso', criancaId: 'c1' });
  assert.equal(emUso.available, false);
  assert.equal(emUso.motivo, MOTIVO.EM_USO);
  assert.equal(emUso.status, 'em_uso'); // o status segue na resposta (telas antigas leem esse campo)

  assert.equal(avaliarPulseira({ codigo: 'AA', status: 'disponivel', criancaId: 'c1' }).motivo, MOTIVO.EM_USO);
  assert.equal(avaliarPulseira({ codigo: 'AA', status: 'perdida', criancaId: null }).motivo, MOTIVO.INDISPONIVEL);
  assert.equal(avaliarPulseira({ codigo: 'AA', status: null, criancaId: null }).motivo, MOTIVO.INDISPONIVEL);
});

// ---- rotas do kiosk, com um banco de mentira -------------------------------------------------------------------------
// O banco responde só o que a rota pergunta sobre a pulseira e o evento; assim dá para ver o que ela consulta e grava.
const dbPath = require.resolve('../database');
const consultas = [];
let estoque = null; // a linha que o "banco" devolve ao procurar a pulseira no estoque
const tx = {
  async queryOne(sql) {
    consultas.push(sql);
    if (/FROM pulseira/.test(sql)) return estoque;
    if (/FROM evento/.test(sql)) return { eventoId: 'ev1', empresaId: 'emp1', status: 'scheduled' };
    return null;
  },
  async allQuery(sql) { consultas.push(sql); return []; },
  async query(sql) { consultas.push(sql); return { rowsAffected: [1] }; },
};
require.cache[dbPath] = {
  id: dbPath, filename: dbPath, loaded: true,
  exports: { ...tx, withTransaction: (trabalho) => trabalho(tx), closeDB: async () => {} },
};
const kiosk = require('../routes/kiosk');

function chamar(metodo, caminho, { params = {}, body = {} } = {}) {
  const camada = kiosk.stack.find((l) => l.route && l.route.path === caminho && l.route.methods[metodo]);
  assert.ok(camada, `rota ${metodo} ${caminho}`);
  const handler = camada.route.stack[camada.route.stack.length - 1].handle;
  return new Promise((resolve, reject) => {
    const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(corpo) { resolve({ status: this.statusCode, corpo }); return this; } };
    Promise.resolve(handler({ user: { id: 'k', role: 'kiosk', empresaId: 'emp1' }, params, body, query: {}, headers: {} }, res)).catch(reject);
  });
}
const comecar = (linhaDoEstoque) => { consultas.length = 0; estoque = linhaDoEstoque; };
const cadastro = (extra = {}) => ({ eventId: 'ev1', nome: 'Maria da Silva', apelido: 'Maria', idade: 7, braceletCode: '04AABBCC', ...extra });

test('GET /bracelets: fora do estoque NÃO está disponível e diz o motivo', async () => {
  comecar(null);
  const { status, corpo } = await chamar('get', '/bracelets/:codigo', { params: { codigo: '04:aa:bb:cc' } });
  assert.equal(status, 200);
  assert.equal(corpo.codigo, '04AABBCC'); // sem estoque, devolve o código já normalizado
  assert.equal(corpo.exists, false);
  assert.equal(corpo.available, false);
  assert.equal(corpo.motivo, 'fora_do_estoque');
  assert.match(corpo.mensagem, /não está cadastrada neste buffet/);
});

test('GET /bracelets: pulseira livre do estoque está disponível; em uso não', async () => {
  comecar({ codigo: '04AABBCC', status: 'disponivel', criancaId: null });
  const livre = (await chamar('get', '/bracelets/:codigo', { params: { codigo: '04AABBCC' } })).corpo;
  assert.equal(livre.available, true);
  assert.equal(livre.motivo, null);

  comecar({ codigo: '04AABBCC', status: 'em_uso', criancaId: 'c1' });
  const ocupada = (await chamar('get', '/bracelets/:codigo', { params: { codigo: '04AABBCC' } })).corpo;
  assert.equal(ocupada.available, false);
  assert.equal(ocupada.status, 'em_uso');
  assert.equal(ocupada.motivo, 'em_uso');
});

test('GET /bracelets: código que não é uma pulseira é 400', async () => {
  comecar(null);
  assert.equal((await chamar('get', '/bracelets/:codigo', { params: { codigo: 'zz-xx' } })).status, 400);
});

test('POST /participants: pulseira fora do estoque é 404 e NÃO cria pulseira nem criança', async () => {
  comecar(null);
  const { status, corpo } = await chamar('post', '/participants', { body: cadastro() });
  assert.equal(status, 404);
  assert.match(corpo.error, /não está cadastrada neste buffet/);
  assert.deepEqual(consultas.filter((sql) => /INSERT|UPDATE|DELETE/i.test(sql)), [], 'não pode gravar nada');
});

test('POST /participants: pulseira já vinculada é 409 e não grava nada', async () => {
  comecar({ codigo: '04AABBCC', status: 'em_uso', criancaId: 'c1' });
  const { status, corpo } = await chamar('post', '/participants', { body: cadastro() });
  assert.equal(status, 409);
  assert.match(corpo.error, /já está vinculada/);
  assert.deepEqual(consultas.filter((sql) => /INSERT|UPDATE|DELETE/i.test(sql)), []);
});

test('POST /participants: pulseira livre do estoque cadastra e vincula (UPDATE, sem INSERT em pulseira)', async () => {
  comecar({ codigo: '04AABBCC', status: 'disponivel', criancaId: null });
  const { status, corpo } = await chamar('post', '/participants', { body: cadastro() });
  assert.equal(status, 201, JSON.stringify(corpo));
  assert.equal(corpo.braceletCode, '04AABBCC');
  assert.ok(consultas.some((sql) => /UPDATE pulseira/.test(sql)), 'vincula a pulseira');
  assert.ok(consultas.some((sql) => /INSERT INTO crianca/.test(sql)), 'cria a criança');
  assert.equal(consultas.filter((sql) => /INSERT INTO pulseira/.test(sql)).length, 0, 'não cria pulseira no cadastro');
});
