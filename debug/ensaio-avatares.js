// Ensaio dos avatares sem repetição no evento: roda no banco de dev DENTRO de uma transação e a DESFAZ (ROLLBACK).
// Cadastra participantes pelo kiosk e troca avatar pela recepção, chamando as rotas de verdade (sem HTTP).
// Uso: node debug/ensaio-avatares.js
require('dotenv').config();
const assert = require('node:assert/strict');
const database = require('../database');
const { queryOne, allQuery, closeDB } = database;
const withTransaction = database.withTransaction;
// As rotas abrem a própria transação; no ensaio elas entram na transação externa (a que será desfeita).
database.withTransaction = (trabalho) => trabalho(database);
const { ADVENTURER_AVATAR_IDS } = require('../utils/avatar');
const { CORES_PARTICIPANTE } = require('../utils/corParticipante');
const { ensurePerfilCriancaSchema } = require('../migrations/perfilCrianca');
const kiosk = require('../routes/kiosk');
const criancas = require('../routes/criancas');

class Desfazer extends Error {}

function chamar(roteador, metodo, caminho, { usuario, params = {}, body = {}, query = {} }) {
  const camada = roteador.stack.find((l) => l.route && l.route.path === caminho && l.route.methods[metodo]);
  assert.ok(camada, `rota ${metodo} ${caminho} existe`);
  const handler = camada.route.stack[camada.route.stack.length - 1].handle;
  return new Promise((resolve, reject) => {
    const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(corpo) { resolve({ status: this.statusCode, corpo }); return this; } };
    Promise.resolve(handler({ user: usuario, params, body, query, headers: {} }, res)).catch(reject);
  });
}

async function main() {
  const evento = await queryOne("SELECT eventoId, empresaId, nome FROM evento WHERE nome = 'Festa do João'");
  assert.ok(evento, 'a Festa do João existe');
  const usuarioKiosk = { id: 'k', role: 'kiosk', empresaId: evento.empresaId };
  const admin = { id: 'a', role: 'admin', empresaId: evento.empresaId };
  let n = 0;
  const cadastrar = (avatar, cor) => chamar(kiosk, 'post', '/participants', {
    usuario: usuarioKiosk,
    body: { eventId: evento.eventoId, nome: `Ensaio ${++n}`, idade: 8, braceletCode: `0ABC${String(n).padStart(6, '0')}`, ...(avatar ? { avatar } : {}), ...(cor ? { cor } : {}) },
  });
  const emUso = async () => new Set((await allQuery('SELECT avatar FROM crianca WHERE eventoId = @e AND avatar IS NOT NULL', { e: evento.eventoId })).map((r) => r.avatar));

  try {
    await withTransaction(async () => {
      await ensurePerfilCriancaSchema();   // a coluna crianca.cor (a migração roda no startup; aqui dentro da transação desfeita)
      // 1) sem avatar: entra um LIVRE (antes todo mundo ficava com o padrão)
      const antes = await emUso();
      const livresAntes = ADVENTURER_AVATAR_IDS.filter((id) => !antes.has(id));
      assert.ok(livresAntes.length >= 3, 'o ensaio precisa de avatares livres');
      const a = await cadastrar();
      assert.equal(a.status, 201, JSON.stringify(a.corpo));
      assert.ok(livresAntes.includes(a.corpo.avatar), 'o avatar sorteado estava livre');
      console.log(`  ✔ kiosk sem avatar: recebe um avatar livre (${livresAntes.length} livres antes)`);

      // 2) avatar já usado por outro participante: 409 com os livres
      const repetido = await cadastrar(a.corpo.avatar);
      assert.equal(repetido.status, 409);
      assert.match(repetido.corpo.error, /já foi escolhido/);
      assert.ok(Array.isArray(repetido.corpo.avataresLivres) && !repetido.corpo.avataresLivres.includes(a.corpo.avatar));
      console.log('  ✔ kiosk com avatar de outro participante: 409 "já foi escolhido" e a lista dos livres');

      // 3) avatar livre pedido: vale
      const livre = repetido.corpo.avataresLivres[0];
      const b = await cadastrar(livre);
      assert.equal(b.status, 201, JSON.stringify(b.corpo));
      assert.equal(b.corpo.avatar, livre);
      console.log('  ✔ kiosk com avatar livre: usa o pedido');

      // 4) avatar que não existe: 400
      assert.equal((await cadastrar('avatar-que-nao-existe')).status, 400);
      console.log('  ✔ avatar inexistente: 400');

      // 5) lista de avatares em uso (kiosk e recepção)
      const lk = await chamar(kiosk, 'get', '/events/:eventId/avatars-in-use', { usuario: usuarioKiosk, params: { eventId: evento.eventoId } });
      const lr = await chamar(criancas, 'get', '/evento/:eventoId/avatares-em-uso', { usuario: admin, params: { eventoId: evento.eventoId } });
      for (const l of [lk, lr]) {
        assert.equal(l.status, 200);
        assert.ok(l.corpo.avatares.includes(a.corpo.avatar) && l.corpo.avatares.includes(b.corpo.avatar));
        assert.equal(new Set(l.corpo.avatares).size, l.corpo.avatares.length, 'sem repetidos na lista');
      }
      assert.equal((await chamar(criancas, 'get', '/evento/:eventoId/avatares-em-uso', { usuario: { ...admin, empresaId: '00000000-0000-0000-0000-000000000000' }, params: { eventoId: evento.eventoId } })).status, 403);
      console.log('  ✔ lista de avatares em uso (kiosk e recepção); outro buffet recebe 403');

      // 6) trocar o avatar na recepção: para um em uso, 409; para um livre, vale
      const ocupado = (await emUso());
      const outroDoEvento = [...ocupado].find((id) => id !== b.corpo.avatar);
      const troca409 = await chamar(criancas, 'put', '/evento/:eventoId/crianca/:criancaId', {
        usuario: admin, params: { eventoId: evento.eventoId, criancaId: b.corpo.id }, body: { avatar: outroDoEvento },
      });
      assert.equal(troca409.status, 409, JSON.stringify(troca409.corpo));
      const livresAgora = ADVENTURER_AVATAR_IDS.filter((id) => !ocupado.has(id));
      const troca200 = await chamar(criancas, 'put', '/evento/:eventoId/crianca/:criancaId', {
        usuario: admin, params: { eventoId: evento.eventoId, criancaId: b.corpo.id }, body: { avatar: livresAgora[0] },
      });
      assert.equal(troca200.status, 200, JSON.stringify(troca200.corpo));
      console.log('  ✔ recepção trocando avatar: para um em uso 409; para um livre vale');

      // 6b) cor do participante: escolhida na hora do cadastro, sem repetir no evento
      const coresAntes = new Set((await allQuery('SELECT cor FROM crianca WHERE eventoId = @e AND cor IS NOT NULL', { e: evento.eventoId })).map((r) => String(r.cor).toUpperCase()));
      const corLivre = CORES_PARTICIPANTE.find((c) => !coresAntes.has(c));
      const comCor = await cadastrar(undefined, corLivre.toLowerCase());
      assert.equal(comCor.status, 201, JSON.stringify(comCor.corpo));
      assert.equal(comCor.corpo.color, corLivre, 'usa a cor escolhida (em maiúsculas)');
      const gravada = await queryOne('SELECT cor FROM crianca WHERE criancaId = @id', { id: comCor.corpo.id });
      assert.equal(gravada.cor, corLivre);
      const corRepetida = await cadastrar(undefined, corLivre);
      assert.equal(corRepetida.status, 409);
      assert.match(corRepetida.corpo.error, /cor/i);
      assert.ok(!corRepetida.corpo.coresLivres.includes(corLivre));
      assert.equal((await cadastrar(undefined, '#123456')).status, 400);
      const semCor = await cadastrar();
      assert.equal(semCor.status, 201);
      assert.ok(CORES_PARTICIPANTE.includes(semCor.corpo.color) && semCor.corpo.color !== corLivre, 'sem escolher, entra uma cor livre');
      const listaCores = await chamar(kiosk, 'get', '/events/:eventId/avatars-in-use', { usuario: usuarioKiosk, params: { eventId: evento.eventoId } });
      assert.ok(listaCores.corpo.cores.includes(corLivre) && listaCores.corpo.cores.includes(semCor.corpo.color));
      const trocaCor = await chamar(criancas, 'put', '/evento/:eventoId/crianca/:criancaId', {
        usuario: admin, params: { eventoId: evento.eventoId, criancaId: semCor.corpo.id }, body: { cor: corLivre },
      });
      assert.equal(trocaCor.status, 409, JSON.stringify(trocaCor.corpo));
      console.log('  ✔ cor do participante: escolhida no cadastro (kiosk), gravada, sem repetir no evento (409), inválida 400, sem escolha vem uma livre, troca para cor em uso 409');

      // 7) todos em uso: a repetição passa a ser permitida (são só 20 avatares)
      let ultimo;
      for (let i = 0; i < 25; i += 1) {
        ultimo = await cadastrar();
        assert.equal(ultimo.status, 201, JSON.stringify(ultimo.corpo));
      }
      const total = await emUso();
      assert.equal(total.size, ADVENTURER_AVATAR_IDS.length, 'os 20 avatares ficaram em uso');
      const repetidoPermitido = await cadastrar(ADVENTURER_AVATAR_IDS[3]);
      assert.equal(repetidoPermitido.status, 201);
      console.log('  ✔ com os 20 avatares em uso, o participante seguinte ainda é cadastrado (repetição só então)');

      throw new Desfazer();
    });
  } catch (e) {
    if (!(e instanceof Desfazer)) throw e;
  }
  console.log('ROLLBACK ok (nada foi gravado)');
}

main().then(() => closeDB()).catch((e) => { console.error('❌ ENSAIO FALHOU:', e); process.exit(1); });
