// Ensaio do mapa/histórico para conta de família de OUTRO buffet: roda no banco de dev DENTRO de uma transação e a DESFAZ.
// Caso real: a conta ("Fulano's Family") entrou na Festa do João pelo código e lia checkpoints, mas o app não atualizava
// porque o histórico, a lista de jogos e o WebSocket comparavam o evento com a empresa da CONTA.
// Uso: node debug/ensaio-mapa-familia.js
require('dotenv').config();
const assert = require('node:assert/strict');
const crypto = require('crypto');
const database = require('../database');
const { query, queryOne, allQuery, closeDB } = database;
const withTransaction = database.withTransaction;
database.withTransaction = (trabalho) => trabalho(database);
const { ensureFamilySchema } = require('../migrations/family');
const { eventoDaFamilia } = require('../utils/acessoEventoFamilia');
const leituras = require('../routes/leituras');
const brincadeiras = require('../routes/brincadeiras');
const companyMap = require('../routes/companyMap');

class Desfazer extends Error {}

function chamar(roteador, metodo, caminho, { usuario, params = {}, query: q = {} } = {}) {
  const camada = roteador.stack.find((l) => l.route && l.route.path === caminho && l.route.methods[metodo]);
  assert.ok(camada, `rota ${metodo} ${caminho} existe`);
  const handler = camada.route.stack[camada.route.stack.length - 1].handle;
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      status(c) { this.statusCode = c; return this; },
      json(corpo) { resolve({ status: this.statusCode, corpo }); return this; },
    };
    Promise.resolve(handler({ user: usuario, params, query: q, body: {}, headers: {} }, res)).catch(reject);
  });
}

async function main() {
  const evento = await queryOne("SELECT eventoId, empresaId, nome FROM evento WHERE nome = 'Festa do João'");
  assert.ok(evento, 'a Festa do João existe no banco de dev');
  const outroEvento = await queryOne('SELECT eventoId FROM evento WHERE eventoId <> @e AND empresaId IS NOT NULL LIMIT 1', { e: evento.eventoId });
  // Conta cujo buffet não é o do evento (empresa própria): o caso que falhava.
  const conta = await queryOne(
    `SELECT l.loginId, l.email, l.empresaId FROM login l
     WHERE l.perfil = 'family' AND LOWER(l.empresaId) <> LOWER(@emp)
       AND NOT EXISTS (SELECT 1 FROM familiaEvento f WHERE f.loginId = l.loginId)
       AND NOT EXISTS (SELECT 1 FROM vinculoFamiliar v WHERE v.loginId = l.loginId) LIMIT 1`,
    { emp: evento.empresaId }).catch(() => null)
    || await queryOne(`SELECT l.loginId, l.email, l.empresaId FROM login l WHERE l.perfil = 'family' AND LOWER(l.empresaId) <> LOWER(@emp) LIMIT 1`, { emp: evento.empresaId });
  assert.ok(conta, 'há uma conta de família de outro buffet no banco de dev');
  const usuario = { id: conta.loginId, email: conta.email, role: 'family', empresaId: conta.empresaId };
  const historico = () => chamar(leituras, 'get', '/evento/:eventoId/historico', { usuario, params: { eventoId: evento.eventoId }, query: { allGames: '1' } });
  const jogos = () => chamar(brincadeiras, 'get', '/', { usuario, query: { eventoId: evento.eventoId } });
  const planta = () => chamar(companyMap, 'get', '/floor-plan', { usuario, query: { eventoId: evento.eventoId } });

  try {
    await withTransaction(async () => {
      await ensureFamilySchema();
      // Garante que a conta não tem nenhum acesso ao evento no começo do ensaio.
      await query('DELETE FROM familiaEvento WHERE loginId = @l', { l: conta.loginId });
      await query("UPDATE vinculoFamiliar SET status = 'inactive' WHERE loginId = @l", { l: conta.loginId });

      // 1) Sem acesso ao evento: tudo continua barrado, como se ele não existisse.
      assert.equal(await eventoDaFamilia(usuario, evento.eventoId), null);
      assert.equal((await historico()).status, 403);
      assert.equal((await jogos()).status, 403);
      assert.notEqual((await planta()).corpo.empresaId, evento.empresaId, 'sem acesso a planta é a da própria conta');
      console.log('  ✔ sem acesso ao evento: histórico 403, jogos 403, planta da própria conta (nada vaza)');

      // 2) Entrou pelo código: histórico, jogos, planta e a autorização do WebSocket passam a funcionar.
      await query('INSERT INTO familiaEvento (familiaEventoId, loginId, eventoId, empresaId) VALUES (@id, @l, @e, @emp)',
        { id: crypto.randomUUID(), l: conta.loginId, e: evento.eventoId, emp: evento.empresaId });
      const ws = await eventoDaFamilia(usuario, evento.eventoId);
      assert.equal(String(ws.eventoId).toLowerCase(), String(evento.eventoId).toLowerCase(), 'WebSocket autorizado');
      const h = await historico();
      assert.equal(h.status, 200, JSON.stringify(h.corpo).slice(0, 200));
      assert.ok(Array.isArray(h.corpo), 'o histórico vem como lista');
      assert.ok(h.corpo.length > 0, 'o histórico traz as leituras do evento (é de onde o app tira a posição de cada criança)');
      const cps = await allQuery('SELECT checkpointId FROM pontoVerificacao WHERE eventoId = @e', { e: evento.eventoId });
      const ids = new Set(cps.map((c) => String(c.checkpointId)));
      const casam = h.corpo.filter((x) => x.childId && ids.has(String(x.checkpointId)));
      assert.ok(casam.length > 0, 'as leituras trazem o checkpointId (texto) de um checkpoint do evento');
      const j = await jogos();
      assert.equal(j.status, 200, JSON.stringify(j.corpo).slice(0, 200));
      assert.equal((await planta()).corpo.empresaId, evento.empresaId, 'a planta é a do buffet do evento');
      console.log(`  ✔ entrou pelo código: WebSocket autorizado, histórico ${h.corpo.length} leitura(s), ${Array.isArray(j.corpo) ? j.corpo.length : '?'} jogo(s), planta do buffet do evento`);

      // 3) O acesso é só ao evento da família: outro evento de outro buffet continua barrado.
      if (outroEvento) {
        const outro = await eventoDaFamilia(usuario, outroEvento.eventoId);
        const mesmoBuffet = await queryOne('SELECT 1 AS x FROM evento WHERE eventoId = @e AND LOWER(empresaId) = LOWER(@emp)', { e: outroEvento.eventoId, emp: conta.empresaId });
        if (!mesmoBuffet) assert.equal(outro, null, 'outro evento de outro buffet segue sem acesso');
        console.log('  ✔ outro evento (de outro buffet) segue barrado');
      }

      // 4) Quem só tem criança vinculada no evento também acompanha.
      await query('DELETE FROM familiaEvento WHERE loginId = @l', { l: conta.loginId });
      assert.equal(await eventoDaFamilia(usuario, evento.eventoId), null);
      const crianca = await queryOne('SELECT criancaId, empresaId FROM crianca WHERE eventoId = @e LIMIT 1', { e: evento.eventoId });
      if (crianca) {
        await query(
          `INSERT INTO vinculoFamiliar (vinculoId, loginId, criancaId, empresaId, status, relacionamento, aprovadoEm)
           VALUES (@id, @l, @c, @emp, 'approved', 'responsável', CURRENT_TIMESTAMP)`,
          { id: crypto.randomUUID(), l: conta.loginId, c: crianca.criancaId, emp: crianca.empresaId });
        assert.ok(await eventoDaFamilia(usuario, evento.eventoId), 'com criança vinculada tem acesso');
        assert.equal((await historico()).status, 200);
        console.log('  ✔ só com criança vinculada no evento: acompanha também');
      }

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
