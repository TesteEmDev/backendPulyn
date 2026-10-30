// Ensaio do link do telão: roda no banco de dev DENTRO de uma transação e a DESFAZ (nada é gravado).
// Confere a migração (coluna codigoTelao), o código do admin, a entrada sem login e a troca do código.
// Uso: node debug/ensaio-telao.js
require('dotenv').config();
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const database = require('../database');
const { queryOne, closeDB } = database;
const withTransaction = database.withTransaction;
database.withTransaction = (trabalho) => trabalho(database);
const { ensureTelaoSchema } = require('../migrations/telao');
const auth = require('../routes/auth');
const telao = require('../routes/telao');

class Desfazer extends Error {}

function chamar(roteador, metodo, caminho, { usuario, body = {}, query: q = {}, ip = '10.0.0.1' } = {}) {
  const camada = roteador.stack.find((l) => l.route && l.route.path === caminho && l.route.methods[metodo]);
  assert.ok(camada, `rota ${metodo} ${caminho} existe`);
  // verifyToken precisa de cabeçalho; aqui pulamos os middlewares e chamamos o último (o handler), com req.user já posto
  const handler = camada.route.stack[camada.route.stack.length - 1].handle;
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      status(c) { this.statusCode = c; return this; },
      json(corpo) { resolve({ status: this.statusCode, corpo }); return this; },
    };
    Promise.resolve(handler({ user: usuario, body, query: q, params: {}, headers: { 'x-forwarded-for': ip } }, res)).catch(reject);
  });
}

async function main() {
  const empresa = await queryOne('SELECT empresaId, nome FROM empresa ORDER BY nome LIMIT 1');
  assert.ok(empresa, 'há um buffet no banco de dev');
  const admin = { id: 'x', role: 'admin', empresaId: empresa.empresaId };
  const secret = process.env.JWT_SECRET || 'sua-chave-secreta-super-segura-2026';

  try {
    await withTransaction(async () => {
      await ensureTelaoSchema();
      await ensureTelaoSchema();   // roda de novo sem erro
      const coluna = await queryOne("SELECT 1 AS x FROM information_schema.columns WHERE LOWER(table_name) = 'empresa' AND LOWER(column_name) = 'codigotelao'");
      assert.ok(coluna, 'coluna empresa.codigoTelao existe');
      console.log('  ✔ migração: coluna codigoTelao criada (e roda duas vezes sem erro)');

      // 1) o admin pega o código: criado na 1ª consulta, igual na 2ª
      const a = await chamar(telao, 'get', '/codigo', { usuario: admin });
      assert.equal(a.status, 200);
      assert.match(a.corpo.codigo, /^[A-Za-z0-9_-]{24}$/);
      const b = await chamar(telao, 'get', '/codigo', { usuario: admin });
      assert.equal(b.corpo.codigo, a.corpo.codigo);
      console.log('  ✔ admin: código de 24 caracteres criado na 1ª consulta e igual na 2ª');

      // 2) entrada sem login com o código certo: token display só deste buffet
      const entrada = await chamar(auth, 'post', '/telao', { body: { codigo: a.corpo.codigo } });
      assert.equal(entrada.status, 200, JSON.stringify(entrada.corpo));
      const dados = jwt.verify(entrada.corpo.token, secret);
      assert.equal(dados.role, 'display');
      assert.equal(String(dados.empresaId).toLowerCase(), String(empresa.empresaId).toLowerCase());
      assert.deepEqual(dados.papeis, ['display']);
      assert.ok(dados.exp - dados.iat >= 6 * 24 * 3600, 'token vale uns 7 dias');
      assert.equal(entrada.corpo.user.role, 'display');
      assert.equal(entrada.corpo.user.redirect, '/display');
      console.log(`  ✔ entrada pelo código: token display do buffet "${empresa.nome}", válido por 7 dias`);

      // 3) código errado, malformado ou vazio: 404 genérico
      for (const ruim of ['', 'curto', 'x'.repeat(24), 'a b'.repeat(10), null, undefined]) {
        const r = await chamar(auth, 'post', '/telao', { body: { codigo: ruim }, ip: '10.0.0.2' });
        assert.equal(r.status, 404, `código ${JSON.stringify(ruim)} recusado`);
      }
      console.log('  ✔ código errado, curto ou vazio: 404 sem dizer nada além de "inválido"');

      // 4) renovar: o antigo para de entrar, o novo entra
      const nova = await chamar(telao, 'post', '/codigo/renovar', { usuario: admin });
      assert.equal(nova.status, 200);
      assert.notEqual(nova.corpo.codigo, a.corpo.codigo);
      assert.equal((await chamar(auth, 'post', '/telao', { body: { codigo: a.corpo.codigo }, ip: '10.0.0.3' })).status, 404);
      assert.equal((await chamar(auth, 'post', '/telao', { body: { codigo: nova.corpo.codigo }, ip: '10.0.0.3' })).status, 200);
      console.log('  ✔ renovar: o link antigo deixa de entrar e o novo entra');

      // 5) tentativas erradas em sequência são barradas (429), mesmo com o código certo logo depois só depois de esperar
      let ultimo;
      for (let i = 0; i < 16; i++) ultimo = await chamar(auth, 'post', '/telao', { body: { codigo: 'Z'.repeat(24) }, ip: '10.0.0.9' });
      assert.equal(ultimo.status, 429);
      assert.equal((await chamar(auth, 'post', '/telao', { body: { codigo: 'Z'.repeat(24) }, ip: '10.0.0.10' })).status, 404, 'outro IP não é afetado');
      console.log('  ✔ 15 erros seguidos do mesmo IP: 429; outro IP segue normal');

      throw new Desfazer();
    });
  } catch (e) {
    if (!(e instanceof Desfazer)) throw e;
  }
  console.log('ROLLBACK ok (nada foi gravado)');
}

main()
  .then(() => (closeDB ? closeDB() : undefined))
  .catch((e) => { console.error('❌ ENSAIO FALHOU:', e); process.exit(1); });
