// Ensaio do código fixo por evento: roda no banco de dev DENTRO de uma transação e a DESFAZ (ROLLBACK).
// Cria a coluna (migração), pede o código como a recepção, usa o MESMO código com várias contas (entrar e cadastro),
// renova o código e encerra o evento, chamando as rotas de verdade (sem HTTP).
// Uso: node debug/ensaio-codigo-do-evento.js
require('dotenv').config();
const assert = require('node:assert/strict');
const crypto = require('crypto');
const database = require('../database');
const { query, queryOne, allQuery, closeDB } = database;
const withTransaction = database.withTransaction;
// As rotas abrem a própria transação; no ensaio elas entram na transação externa (a que será desfeita).
database.withTransaction = (trabalho) => trabalho(database);
const { ensureFamilySchema } = require('../migrations/family');
const router = require('../routes/familias');

class Desfazer extends Error {}

function chamar(metodo, caminho, { usuario = null, params = {}, body = {} } = {}) {
  const camada = router.stack.find((l) => l.route && l.route.path === caminho && l.route.methods[metodo]);
  assert.ok(camada, `rota ${metodo} ${caminho} existe`);
  const handler = camada.route.stack[camada.route.stack.length - 1].handle;
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      status(c) { this.statusCode = c; return this; },
      json(corpo) { resolve({ status: this.statusCode, corpo }); return this; },
    };
    Promise.resolve(handler({ user: usuario, params, body, query: {}, headers: {}, ip: '127.0.0.1' }, res)).catch(reject);
  });
}

const total = async (sql, p) => Number((await queryOne(sql, p)).n);
const fotografia = async () => ({
  colunaExistia: Boolean(await queryOne("SELECT 1 AS x FROM information_schema.columns WHERE LOWER(table_name) = 'evento' AND LOWER(column_name) = 'codigoconvite'")),
  convites: await total('SELECT COUNT(*)::int AS n FROM conviteFamilia'),
  logins: await total('SELECT COUNT(*)::int AS n FROM login'),
});

async function main() {
  const evento = await queryOne("SELECT eventoId, empresaId, nome FROM evento WHERE nome = 'Festa do João'")
    || await queryOne("SELECT eventoId, empresaId, nome FROM evento WHERE status = 'active' AND empresaId IS NOT NULL LIMIT 1");
  assert.ok(evento, 'há um evento ativo no banco de dev');
  const outroBuffet = await queryOne('SELECT empresaId FROM evento WHERE empresaId IS NOT NULL AND LOWER(empresaId) <> LOWER(@e) LIMIT 1', { e: evento.empresaId });
  const contas = await allQuery(
    `SELECT l.loginId, l.email, l.empresaId FROM login l
     WHERE l.perfil = 'family' AND l.status = 'active'
       AND NOT EXISTS (SELECT 1 FROM familiaEvento f WHERE f.loginId = l.loginId AND f.eventoId = @e) LIMIT 2`,
    { e: evento.eventoId }).catch(() => []);
  const antes = await fotografia();

  try {
    await withTransaction(async () => {
      await ensureFamilySchema();
      await ensureFamilySchema(); // rodar duas vezes não pode dar erro

      const recepcao = { id: 'recepcao-ensaio', email: 'recepcao@ensaio.com', role: 'reception', empresaId: evento.empresaId };
      const familia = (c) => ({ id: c.loginId, email: c.email, role: 'family', empresaId: c.empresaId });
      const pedirCodigo = (u = recepcao) => chamar('get', '/eventos/:eventoId/codigo', { usuario: u, params: { eventoId: evento.eventoId } });

      // 1) A recepção pede o código: nasce na primeira consulta e não muda nas seguintes.
      const c1 = await pedirCodigo();
      assert.equal(c1.status, 200, JSON.stringify(c1.corpo));
      assert.match(c1.corpo.codigo, /^[0-9A-F]{8}$/);
      assert.equal(c1.corpo.encerrado, false);
      assert.ok(c1.corpo.inviteUrl.endsWith(`/family/invite/${c1.corpo.codigo}`));
      assert.equal((await pedirCodigo()).corpo.codigo, c1.corpo.codigo, 'a segunda consulta devolve o mesmo código');
      const guardado = await queryOne('SELECT codigoConvite FROM evento WHERE eventoId = @e', { e: evento.eventoId });
      assert.equal(guardado.codigoConvite, c1.corpo.codigo.toLowerCase(), 'guardado em minúsculas');
      const codigo = c1.corpo.codigo;
      console.log(`  ✔ recepção pede o código de "${evento.nome}": ${codigo} (o mesmo nas duas consultas)`);

      // 2) Quem não é da equipe do buffet dono do evento não vê o código.
      assert.equal((await pedirCodigo({ ...recepcao, role: 'family' })).status, 403);
      if (outroBuffet) assert.equal((await pedirCodigo({ ...recepcao, empresaId: outroBuffet.empresaId })).status, 403);
      console.log('  ✔ família e equipe de outro buffet: 403');

      // 3) Consulta pública do código (como o app faz antes do cadastro).
      const consulta = await chamar('get', '/invites/:token', { params: { token: codigo.toLowerCase() } });
      assert.equal(consulta.status, 200);
      assert.equal(consulta.corpo.event.id, evento.eventoId);
      assert.equal(consulta.corpo.child, null);
      console.log('  ✔ consulta pública do código: 200, evento certo, sem criança');

      // 4) O MESMO código vale para contas diferentes e não se esgota.
      const convitesAntes = await total('SELECT COUNT(*)::int AS n FROM conviteFamilia');
      const entrar = (conta, token = codigo) => chamar('post', '/invites/:token/entrar', { usuario: familia(conta), params: { token } });
      if (contas.length >= 2) {
        const [a, b] = contas;
        const ra = await entrar(a);
        const rb = await entrar(b);
        assert.equal(ra.status, 201, JSON.stringify(ra.corpo));
        assert.equal(rb.status, 201, JSON.stringify(rb.corpo));
        assert.equal(ra.corpo.jaTinhaEvento, false);
        assert.equal(rb.corpo.jaTinhaEvento, false);
        const rep = await entrar(a);
        assert.equal(rep.status, 201);
        assert.equal(rep.corpo.jaTinhaEvento, true, 'mesma conta de novo: já tinha o evento');
        assert.equal(await total('SELECT COUNT(*)::int AS n FROM familiaEvento WHERE eventoId = @e AND loginId IN (@a, @b)', { e: evento.eventoId, a: a.loginId, b: b.loginId }), 2);
        console.log(`  ✔ duas contas entram com o mesmo código (${a.email}, ${b.email}); a mesma conta de novo não duplica`);
      } else {
        console.log('  - menos de 2 contas de família livres no banco: caso "duas contas por entrar" não ensaiado');
      }
      assert.equal(await total('SELECT COUNT(*)::int AS n FROM conviteFamilia'), convitesAntes, 'o código do evento não cria nem consome convite');

      // 5) Cadastro de conta nova com o código: duas pessoas diferentes, mesmo código.
      const sufixo = crypto.randomBytes(3).toString('hex');
      const cadastrar = (email, senha = 'segredo123') => chamar('post', '/invites/:token/register', {
        params: { token: codigo.toLowerCase() }, body: { nome: 'Responsável Ensaio', email, senha },
      });
      const e1 = `ensaio1-${sufixo}@exemplo.com`;
      const e2 = `ensaio2-${sufixo}@exemplo.com`;
      const r1 = await cadastrar(e1);
      const r2 = await cadastrar(e2);
      assert.equal(r1.status, 201, JSON.stringify(r1.corpo));
      assert.equal(r2.status, 201, JSON.stringify(r2.corpo));
      for (const email of [e1, e2]) {
        const conta = await queryOne('SELECT loginId, empresaId, perfil, status FROM login WHERE email = @e', { e: email });
        assert.equal(conta.perfil, 'family');
        assert.equal(String(conta.empresaId).toLowerCase(), String(evento.empresaId).toLowerCase(), 'a conta nasce no buffet do evento');
        assert.equal(await total('SELECT COUNT(*)::int AS n FROM familiaEvento WHERE loginId = @l AND eventoId = @e', { l: conta.loginId, e: evento.eventoId }), 1, 'o evento entra na conta');
      }
      assert.equal((await cadastrar(e1, 'senha-errada-1')).status, 409, 'mesmo e-mail com outra senha é recusado');
      assert.equal((await cadastrar(e1)).status, 201, 'mesma conta, mesma senha: entra de novo sem erro');
      console.log('  ✔ cadastro de duas contas novas com o mesmo código; o evento entra nas duas');

      // 6) Convite individual continua de uso único.
      const tokenIndividual = crypto.randomBytes(4).toString('hex');
      await query(
        `INSERT INTO conviteFamilia (conviteId, empresaId, eventoId, hashToken, status, expiramEm)
         VALUES (@id, @emp, @e, @h, 'pending', NOW() + INTERVAL '1 day')`,
        { id: crypto.randomUUID(), emp: evento.empresaId, e: evento.eventoId, h: crypto.createHash('sha256').update(tokenIndividual).digest('hex') });
      const conta = contas[0] || { loginId: 'x', email: 'x@x.com', empresaId: evento.empresaId };
      assert.equal((await entrar(conta, tokenIndividual)).status, 201);
      assert.equal((await entrar(conta, tokenIndividual)).status, 410, 'o individual não vale duas vezes');
      console.log('  ✔ convite individual segue de uso único (410 na segunda vez)');

      // 7) Renovar: o código antigo para de valer na hora, o novo funciona; só a equipe renova.
      assert.equal((await chamar('post', '/eventos/:eventoId/codigo/renovar', { usuario: { ...recepcao, role: 'family' }, params: { eventoId: evento.eventoId } })).status, 403);
      const novo = await chamar('post', '/eventos/:eventoId/codigo/renovar', { usuario: recepcao, params: { eventoId: evento.eventoId } });
      assert.equal(novo.status, 200, JSON.stringify(novo.corpo));
      assert.notEqual(novo.corpo.codigo, codigo);
      assert.equal((await chamar('get', '/invites/:token', { params: { token: codigo } })).status, 404, 'o código antigo não existe mais');
      assert.equal((await chamar('get', '/invites/:token', { params: { token: novo.corpo.codigo } })).status, 200);
      assert.equal((await pedirCodigo()).corpo.codigo, novo.corpo.codigo);
      console.log(`  ✔ renovar: ${codigo} deixa de valer; ${novo.corpo.codigo} passa a valer`);

      // 8) Evento encerrado: o código deixa de valer (410), mas continua aparecendo para a recepção.
      await query("UPDATE evento SET status = 'finished' WHERE eventoId = @e", { e: evento.eventoId });
      const consultaFim = await chamar('get', '/invites/:token', { params: { token: novo.corpo.codigo } });
      assert.equal(consultaFim.status, 410);
      assert.equal(consultaFim.corpo.error, 'Convite expirado');
      if (contas[1]) assert.equal((await chamar('post', '/invites/:token/entrar', { usuario: familia(contas[1]), params: { token: novo.corpo.codigo } })).status, 410);
      assert.equal((await pedirCodigo()).corpo.encerrado, true);
      console.log('  ✔ evento encerrado: 410 "Convite expirado"; a recepção vê o código marcado como encerrado');

      throw new Desfazer();
    });
  } catch (e) {
    if (!(e instanceof Desfazer)) throw e;
  }

  assert.deepEqual(await fotografia(), antes, 'ROLLBACK deixou o banco como estava');
  console.log(`ROLLBACK ok: banco igual a antes (${JSON.stringify(antes)})`);
}

main()
  .then(() => (closeDB ? closeDB() : undefined))
  .catch((e) => { console.error('❌ ENSAIO FALHOU:', e); process.exit(1); });
