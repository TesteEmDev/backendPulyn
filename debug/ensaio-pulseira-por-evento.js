// Ensaio do vínculo por pulseira com o evento escolhido no app: roda no banco de dev DENTRO de uma transação e a DESFAZ (ROLLBACK).
// Caso real que motivou: conta de família de outro buffet (ou com buffet próprio) não achava a pulseira do evento.
// Uso: node debug/ensaio-pulseira-por-evento.js
require('dotenv').config();
const assert = require('node:assert/strict');
const crypto = require('crypto');
const database = require('../database');
const { query, queryOne, closeDB } = database;
const withTransaction = database.withTransaction;
// A rota abre a própria transação; no ensaio ela entra na transação externa (a que será desfeita).
database.withTransaction = (trabalho) => trabalho(database);
const { ensureFamilySchema } = require('../migrations/family');
const router = require('../routes/family-linking');
const routerFamilias = require('../routes/familias');

class Desfazer extends Error {}

function chamar(roteador, caminho, usuario, body, params = {}) {
  const camada = roteador.stack.find((l) => l.route && l.route.path === caminho && l.route.methods.post);
  assert.ok(camada, `rota ${caminho} existe`);
  const handler = camada.route.stack[camada.route.stack.length - 1].handle;
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      status(c) { this.statusCode = c; return this; },
      set() { return this; },
      json(corpo) { resolve({ status: this.statusCode, corpo }); return this; },
    };
    Promise.resolve(handler({ user: usuario, body, params, headers: {}, ip: '127.0.0.1' }, res)).catch(reject);
  });
}
const validarPulseira = (usuario, body) => chamar(router, '/bracelet/validate', usuario, body);

const total = async (sql, p) => Number((await queryOne(sql, p)).n);
const fotografia = async () => ({
  vinculos: await total('SELECT COUNT(*)::int AS n FROM vinculoFamiliar'),
  familiaEventoExistia: Boolean(await queryOne("SELECT 1 AS x FROM information_schema.tables WHERE table_name = 'familiaevento'")),
});

async function main() {
  const usuarioDe = (l) => ({ id: l.loginId, email: l.email, role: 'family', empresaId: l.empresaId });

  // Conta cujo buffet não tem nenhuma pulseira (ex.: "Fulano's Family"): é o caso que falhava.
  const deFora = await queryOne(
    `SELECT l.loginId, l.email, l.empresaId FROM login l
     WHERE l.perfil = 'family' AND NOT EXISTS (SELECT 1 FROM pulseira p WHERE p.empresaId = l.empresaId) LIMIT 1`);
  // Conta do mesmo buffet das pulseiras: tem de continuar funcionando sem mandar evento.
  const alvo = await queryOne(
    `SELECT p.codigo, p.empresaId, c.criancaId, c.eventoId
     FROM pulseira p JOIN crianca c ON c.criancaId = p.criancaId JOIN evento e ON e.eventoId = c.eventoId
     WHERE p.status = 'em_uso' AND e.status NOT IN ('finished','completed','cancelled','canceled') LIMIT 1`);
  const doBuffet = alvo && await queryOne(
    `SELECT l.loginId, l.email, l.empresaId FROM login l
     WHERE l.perfil = 'family' AND LOWER(l.empresaId) = LOWER(@e) AND l.status = 'active'
       AND NOT EXISTS (SELECT 1 FROM vinculoFamiliar v WHERE v.loginId = l.loginId AND v.criancaId = @c) LIMIT 1`,
    { e: alvo.empresaId, c: alvo.criancaId });
  const encerrada = await queryOne(
    `SELECT p.codigo, c.eventoId FROM pulseira p JOIN crianca c ON c.criancaId = p.criancaId JOIN evento e ON e.eventoId = c.eventoId
     WHERE p.status = 'em_uso' AND e.status IN ('finished','completed') LIMIT 1`);
  const outroEvento = alvo && await queryOne('SELECT eventoId FROM evento WHERE eventoId <> @e LIMIT 1', { e: alvo.eventoId });

  assert.ok(deFora && alvo && doBuffet, 'o banco de dev tem os três personagens do ensaio');
  const antes = await fotografia();

  try {
    await withTransaction(async () => {
      await ensureFamilySchema();
      const fora = usuarioDe(deFora);
      const vinculoExiste = () => total('SELECT COUNT(*)::int AS n FROM vinculoFamiliar WHERE loginId = @l AND criancaId = @c', { l: deFora.loginId, c: alvo.criancaId });

      // 1) Sem mandar o evento: continua valendo só o buffet do login (esta conta não tem pulseiras).
      let r = await validarPulseira(fora, { uid: alvo.codigo });
      assert.equal(r.status, 404);
      assert.equal(r.corpo.codigo, 'BRACELET_NOT_AVAILABLE');
      console.log('  ✔ conta de outro buffet, sem evento: 404 (como antes)');

      // 2) Mandando um evento ao qual a família não tem acesso: 404, sem revelar nada.
      r = await validarPulseira(fora, { uid: alvo.codigo, eventoId: alvo.eventoId });
      assert.equal(r.status, 404);
      assert.equal(await vinculoExiste(), 0);
      console.log('  ✔ evento sem acesso (não entrou por código): 404');

      // 3) Depois de entrar no evento pelo código, a pulseira dele é achada e vincula.
      await query('INSERT INTO familiaEvento (familiaEventoId, loginId, eventoId, empresaId) VALUES (@id, @l, @e, @emp)',
        { id: crypto.randomUUID(), l: deFora.loginId, e: alvo.eventoId, emp: alvo.empresaId });
      r = await validarPulseira(fora, { uid: alvo.codigo, eventoId: alvo.eventoId });
      assert.equal(r.status, 200, JSON.stringify(r.corpo));
      assert.equal(r.corpo.linkedChild.id, alvo.criancaId);
      assert.equal(await vinculoExiste(), 1);
      console.log('  ✔ entrou no evento por código: pulseira achada e criança vinculada');

      // 4) Pulseira lida com o evento errado escolhido: 404.
      await query('DELETE FROM vinculoFamiliar WHERE loginId = @l AND criancaId = @c', { l: deFora.loginId, c: alvo.criancaId });
      if (outroEvento) {
        await query('INSERT INTO familiaEvento (familiaEventoId, loginId, eventoId) VALUES (@id, @l, @e)',
          { id: crypto.randomUUID(), l: deFora.loginId, e: outroEvento.eventoId });
        r = await validarPulseira(fora, { uid: alvo.codigo, eventoId: outroEvento.eventoId });
        assert.equal(r.status, 404);
        assert.equal(await vinculoExiste(), 0);
        console.log('  ✔ pulseira de um evento lida com outro evento escolhido: 404');
      }

      // 5) Evento encerrado continua recusado, mesmo com acesso.
      if (encerrada) {
        await query('INSERT INTO familiaEvento (familiaEventoId, loginId, eventoId) VALUES (@id, @l, @e) ON CONFLICT DO NOTHING',
          { id: crypto.randomUUID(), l: deFora.loginId, e: encerrada.eventoId });
        r = await validarPulseira(fora, { uid: encerrada.codigo, eventoId: encerrada.eventoId });
        assert.equal(r.status, 404);
        console.log('  ✔ evento encerrado: 404 (proposital)');
      }

      // 6) Conta do mesmo buffet da pulseira: sem evento continua funcionando; com o evento certo também.
      const dentro = usuarioDe(doBuffet);
      r = await validarPulseira(dentro, { uid: alvo.codigo });
      assert.equal(r.status, 200, JSON.stringify(r.corpo));
      await query('DELETE FROM vinculoFamiliar WHERE loginId = @l AND criancaId = @c', { l: doBuffet.loginId, c: alvo.criancaId });
      r = await validarPulseira(dentro, { uid: alvo.codigo, eventoId: alvo.eventoId });
      assert.equal(r.status, 200, JSON.stringify(r.corpo));
      console.log('  ✔ conta do mesmo buffet: funciona sem evento e com o evento escolhido');

      // 7) Vínculo por QR Code (mesma correção do INSERT): vincula e guarda o perfil permanente da criança.
      await query('DELETE FROM vinculoFamiliar WHERE loginId = @l AND criancaId = @c', { l: doBuffet.loginId, c: alvo.criancaId });
      const valorQr = `PULYN-ENSAIO${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      await query(
        `INSERT INTO "codigoVinculoFamiliar" ("criancaId", "eventoId", "empresaId", "valorQrCode", "urlRastreio", status, "expiraEm")
         VALUES (@c, @e, @emp, @v, 'ensaio', 'active', NOW() + INTERVAL '1 day')`,
        { c: alvo.criancaId, e: alvo.eventoId, emp: alvo.empresaId, v: valorQr });
      r = await chamar(router, '/qrcode/validate', dentro, { qrCodeValue: valorQr });
      assert.equal(r.status, 200, JSON.stringify(r.corpo));
      const vq = await queryOne('SELECT status, perfilCriancaId FROM vinculoFamiliar WHERE loginId = @l AND criancaId = @c', { l: doBuffet.loginId, c: alvo.criancaId });
      assert.equal(vq.status, 'approved');
      const perfil = await queryOne('SELECT perfilCriancaId FROM crianca WHERE criancaId = @c', { c: alvo.criancaId });
      assert.equal(vq.perfilCriancaId, perfil.perfilCriancaId, 'o vínculo guarda o perfil da criança');
      console.log('  ✔ vínculo por QR Code: criança vinculada com o perfil permanente');

      // 8) Cadastro por convite de uma criança específica (mesma correção): conta nova já vinculada.
      const tokenConvite = crypto.randomBytes(4).toString('hex');
      await query(
        `INSERT INTO conviteFamilia (conviteId, empresaId, eventoId, criancaId, hashToken, status, expiramEm)
         VALUES (@id, @emp, @e, @c, @h, 'pending', NOW() + INTERVAL '1 day')`,
        { id: crypto.randomUUID(), emp: alvo.empresaId, e: alvo.eventoId, c: alvo.criancaId, h: crypto.createHash('sha256').update(tokenConvite).digest('hex') });
      const emailNovo = `ensaio-${tokenConvite}@exemplo.com`;
      r = await chamar(routerFamilias, '/invites/:token/register', null, { nome: 'Responsável Ensaio', email: emailNovo, senha: 'segredo123' }, { token: tokenConvite });
      assert.equal(r.status, 201, JSON.stringify(r.corpo));
      const novo = await queryOne('SELECT loginId FROM login WHERE email = @e', { e: emailNovo });
      const vn = await queryOne('SELECT status, perfilCriancaId FROM vinculoFamiliar WHERE loginId = @l AND criancaId = @c', { l: novo.loginId, c: alvo.criancaId });
      assert.equal(vn.status, 'approved');
      assert.equal(vn.perfilCriancaId, perfil.perfilCriancaId);
      console.log('  ✔ cadastro por convite de criança: conta criada e criança vinculada');

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
