// Ensaio de "adicionar evento pelo código" e "meus eventos": roda tudo no banco de dev DENTRO de uma transação e a DESFAZ (ROLLBACK).
// Cria a tabela familiaEvento (migração), convites de teste, chama as rotas de verdade (sem HTTP) e confere o resultado.
// Uso: node debug/ensaio-eventos-familia.js
require('dotenv').config();
const assert = require('node:assert/strict');
const crypto = require('crypto');
const database = require('../database');
const { query, queryOne, allQuery, closeDB } = database;
const withTransaction = database.withTransaction;
// A rota abre a própria transação; no ensaio ela precisa entrar na transação externa (a que será desfeita),
// senão não enxerga o que o ensaio criou. A rota é carregada depois do ajuste porque pega a função ao ser lida.
database.withTransaction = (trabalho) => trabalho();
const { ensureFamilySchema } = require('../migrations/family');
const { apagarEventoDentroDaTransacao } = require('../utils/apagarEvento');
const router = require('../routes/familias');

class Desfazer extends Error {}

// Chama o último handler da rota (o que vem depois do verifyToken), já com o usuário preenchido.
function chamar(metodo, caminho, { usuario, params = {}, body = {} }) {
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

const novoConvite = async ({ empresaId, eventoId, criancaId = null, email = null }) => {
  const token = crypto.randomBytes(32).toString('hex');
  const conviteId = crypto.randomUUID();
  await query(
    `INSERT INTO conviteFamilia (conviteId, empresaId, eventoId, criancaId, email, hashToken, status, expiramEm)
     VALUES (@conviteId, @empresaId, @eventoId, @criancaId, @email, @hash, 'pending', NOW() + INTERVAL '1 day')`,
    { conviteId, empresaId, eventoId, criancaId, email, hash: crypto.createHash('sha256').update(token).digest('hex') }
  );
  return { token, conviteId };
};

const total = async (sql, p) => Number((await queryOne(sql, p)).n);
const fotografia = async () => ({
  familiaEventoExistia: Boolean(await queryOne("SELECT 1 AS x FROM information_schema.tables WHERE table_name = 'familiaevento'")),
  convitesPendentes: await total("SELECT COUNT(*)::int AS n FROM conviteFamilia WHERE status = 'pending'"),
  vinculos: await total('SELECT COUNT(*)::int AS n FROM vinculoFamiliar'),
});

async function main() {
  const login = await queryOne("SELECT loginId, email, empresaId FROM login WHERE perfil = 'family' AND status = 'active' LIMIT 1")
    || await queryOne("SELECT loginId, email, empresaId FROM login WHERE perfil = 'family' LIMIT 1");
  assert.ok(login, 'há um login de família no banco de dev');
  const usuario = { id: login.loginId, email: login.email, role: 'family', empresaId: login.empresaId };

  const eventos = await allQuery('SELECT eventoId, empresaId, nome FROM evento WHERE empresaId IS NOT NULL ORDER BY data DESC LIMIT 2');
  assert.ok(eventos.length >= 1, 'há evento no banco de dev');
  const e1 = eventos[0];
  const e2 = eventos[1] || eventos[0];
  const crianca = await queryOne(
    `SELECT c.criancaId, c.eventoId, c.empresaId, c.nome FROM crianca c
     WHERE NOT EXISTS (SELECT 1 FROM vinculoFamiliar v WHERE v.criancaId = c.criancaId AND v.loginId = @l) LIMIT 1`, { l: login.loginId });

  const antes = await fotografia();

  try {
    await withTransaction(async () => {
      await ensureFamilySchema();
      await ensureFamilySchema(); // rodar duas vezes não pode dar erro

      const listar = async () => (await chamar('get', '/eventos', { usuario })).corpo.eventos;
      const entrar = (token, u = usuario) => chamar('post', '/invites/:token/entrar', { usuario: u, params: { token } });
      const inicial = await listar();

      // 1) Convite genérico (sem criança): o evento entra na conta.
      const c1 = await novoConvite({ empresaId: e1.empresaId, eventoId: e1.eventoId });
      const r1 = await entrar(c1.token);
      assert.equal(r1.status, 201, JSON.stringify(r1.corpo));
      assert.equal(r1.corpo.evento.id, e1.eventoId);
      assert.equal(r1.corpo.crianca, null);
      assert.equal(r1.corpo.jaTinhaEvento, false);
      const depois1 = await listar();
      const item = depois1.find((e) => e.id === e1.eventoId);
      assert.ok(item && item.adicionadoPorConvite, 'evento adicionado aparece na lista');
      console.log(`  ✔ convite genérico: "${e1.nome}" entrou (${inicial.length} -> ${depois1.length} eventos)`);

      // 2) O mesmo código de novo é recusado.
      const r2 = await entrar(c1.token);
      assert.equal(r2.status, 410);
      assert.equal(r2.corpo.error, 'Convite já utilizado');
      console.log('  ✔ código repetido: 410 "Convite já utilizado"');

      // 3) Outro convite para o mesmo evento não duplica o evento.
      const c3 = await novoConvite({ empresaId: e1.empresaId, eventoId: e1.eventoId });
      const r3 = await entrar(c3.token);
      assert.equal(r3.status, 201);
      assert.equal(r3.corpo.jaTinhaEvento, true);
      assert.equal((await listar()).filter((e) => e.id === e1.eventoId).length, 1);
      console.log('  ✔ evento já adicionado: não duplica (jaTinhaEvento)');

      // 4) Convite feito para outro e-mail: 403 e o convite continua valendo.
      const c4 = await novoConvite({ empresaId: e2.empresaId, eventoId: e2.eventoId, email: 'outra.pessoa@exemplo.com' });
      const r4 = await entrar(c4.token);
      assert.equal(r4.status, 403);
      assert.equal((await queryOne('SELECT status FROM conviteFamilia WHERE conviteId = @id', { id: c4.conviteId })).status, 'pending');
      console.log('  ✔ convite de outro e-mail: 403, convite segue pendente');

      // 5) Convite de uma criança: vincula a criança e mostra os pontos dela.
      if (crianca) {
        const c5 = await novoConvite({ empresaId: crianca.empresaId, eventoId: crianca.eventoId, criancaId: crianca.criancaId });
        const r5 = await entrar(c5.token);
        assert.equal(r5.status, 201, JSON.stringify(r5.corpo));
        assert.equal(r5.corpo.crianca.id, crianca.criancaId);
        const v = await queryOne('SELECT status FROM vinculoFamiliar WHERE loginId = @l AND criancaId = @c', { l: login.loginId, c: crianca.criancaId });
        assert.equal(v.status, 'approved');
        const ev5 = (await listar()).find((e) => e.id === crianca.eventoId);
        assert.ok(ev5.criancas.some((c) => c.id === crianca.criancaId), 'a criança aparece no evento');
        console.log(`  ✔ convite de criança: "${crianca.nome}" vinculada e listada`);

        // 5b) Vínculo desfeito (inactive) volta a valer.
        await query("UPDATE vinculoFamiliar SET status = 'inactive' WHERE loginId = @l AND criancaId = @c", { l: login.loginId, c: crianca.criancaId });
        const c6 = await novoConvite({ empresaId: crianca.empresaId, eventoId: crianca.eventoId, criancaId: crianca.criancaId });
        assert.equal((await entrar(c6.token)).status, 201);
        const reativado = await queryOne('SELECT status FROM vinculoFamiliar WHERE loginId = @l AND criancaId = @c', { l: login.loginId, c: crianca.criancaId });
        assert.equal(reativado.status, 'approved');
        console.log('  ✔ vínculo desfeito: reativado pelo convite');
      } else {
        console.log('  - sem criança livre no banco: caso do convite de criança não ensaiado');
      }

      // 5c) Convite criado pela rota: código de 8 dígitos hexadecimais, aceito em qualquer escrita.
      const equipe = { id: 'equipe-ensaio', email: 'equipe@ensaio.com', role: 'admin', empresaId: e2.empresaId };
      const criado = await chamar('post', '/invites', { usuario: equipe, body: { eventoId: e2.eventoId } });
      assert.equal(criado.status, 201, JSON.stringify(criado.corpo));
      assert.match(criado.corpo.codigo, /^[0-9A-F]{8}$/);
      assert.equal(criado.corpo.token, criado.corpo.codigo);
      assert.ok(criado.corpo.inviteUrl.endsWith(`/family/invite/${criado.corpo.codigo}`));
      const guardado = await queryOne('SELECT hashToken FROM conviteFamilia WHERE conviteId = @id', { id: criado.corpo.id });
      assert.equal(guardado.hashToken, crypto.createHash('sha256').update(criado.corpo.codigo.toLowerCase()).digest('hex'), 'só o hash do código em minúsculas vai para o banco');
      const consulta = await chamar('get', '/invites/:token', { usuario: null, params: { token: criado.corpo.codigo.toLowerCase() } });
      assert.equal(consulta.status, 200, 'consulta pública aceita minúsculas');
      assert.equal(consulta.corpo.event.id, e2.eventoId);
      const digitado = `${criado.corpo.codigo.slice(0, 4)} ${criado.corpo.codigo.slice(4)}`.toLowerCase();
      const r9 = await entrar(digitado);
      assert.equal(r9.status, 201, JSON.stringify(r9.corpo));
      assert.equal((await entrar(criado.corpo.codigo)).status, 410, 'o mesmo código não vale duas vezes');
      console.log(`  ✔ convite criado pela rota: código ${criado.corpo.codigo}; aceito digitado como "${digitado}"; só vale uma vez`);

      // 6) Quem não é família não usa a rota; código que não existe dá 404.
      assert.equal((await entrar('x'.repeat(40), { ...usuario, role: 'admin' })).status, 403);
      assert.equal((await entrar('x'.repeat(40))).status, 404);
      console.log('  ✔ não-família: 403; código que não existe: 404');

      // 7) Apagar o evento leva o registro junto.
      await apagarEventoDentroDaTransacao(e1.eventoId);
      assert.equal(await total('SELECT COUNT(*)::int AS n FROM familiaEvento WHERE eventoId = @e', { e: e1.eventoId }), 0);
      console.log('  ✔ excluir o evento apaga o registro de familiaEvento');

      // 8) Muitos códigos inválidos seguidos: o cliente é barrado (429), mesmo que o próximo fosse certo.
      const chato = { id: `chato-${crypto.randomUUID()}`, email: 'chato@ensaio.com', role: 'family', empresaId: login.empresaId };
      for (let i = 0; i < 15; i++) {
        assert.equal((await entrar(crypto.randomBytes(4).toString('hex'), chato)).status, 404);
      }
      const barrado = await entrar(crypto.randomBytes(4).toString('hex'), chato);
      assert.equal(barrado.status, 429);
      const certo = await novoConvite({ empresaId: e2.empresaId, eventoId: e2.eventoId }); // e1 já foi excluído no passo 7
      assert.equal((await entrar(certo.token, chato)).status, 429, 'barrado vale também para o código certo');
      assert.equal((await entrar(certo.token)).status, 201, 'outro cliente não é afetado');
      console.log('  ✔ 15 códigos inválidos seguidos: 429 para esse cliente, sem afetar os outros');

      throw new Desfazer();
    });
  } catch (e) {
    if (!(e instanceof Desfazer)) throw e;
  }

  const depois = await fotografia();
  assert.deepEqual(depois, antes, 'ROLLBACK deixou o banco como estava');
  console.log(`ROLLBACK ok: banco igual a antes (${JSON.stringify(antes)})`);
}

main()
  .then(() => (closeDB ? closeDB() : undefined))
  .catch((e) => { console.error('❌ ENSAIO FALHOU:', e); process.exit(1); });
