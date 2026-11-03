// Ensaio da data de nascimento e do telefone do responsável: roda no banco de dev DENTRO de uma transação e a DESFAZ (ROLLBACK).
// Cadastra criança pelo kiosk e pela recepção com a data de nascimento (a idade é calculada) e registra um responsável
// com telefone pelo código do evento, chamando as rotas de verdade (sem HTTP).
// Uso: node debug/ensaio-nascimento-telefone.js
require('dotenv').config();
const assert = require('node:assert/strict');
const crypto = require('crypto');
const database = require('../database');
const { queryOne, closeDB } = database;
const withTransaction = database.withTransaction;
database.withTransaction = (trabalho) => trabalho(database);
const { ensureFamilySchema } = require('../migrations/family');
const { ensurePerfilCriancaSchema } = require('../migrations/perfilCrianca');
const { idadeNaData } = require('../utils/nascimento');
const kiosk = require('../routes/kiosk');
const criancas = require('../routes/criancas');
const familias = require('../routes/familias');

class Desfazer extends Error {}

function chamar(roteador, metodo, caminho, { usuario = null, params = {}, body = {}, query = {} } = {}) {
  const camada = roteador.stack.find((l) => l.route && l.route.path === caminho && l.route.methods[metodo]);
  assert.ok(camada, `rota ${metodo} ${caminho} existe`);
  const handler = camada.route.stack[camada.route.stack.length - 1].handle;
  return new Promise((resolve, reject) => {
    const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(corpo) { resolve({ status: this.statusCode, corpo }); return this; } };
    Promise.resolve(handler({ user: usuario, params, body, query, headers: {}, ip: '127.0.0.1' }, res)).catch(reject);
  });
}

const iso = (anosAtras, mes = 1, dia = 15) => `${new Date().getFullYear() - anosAtras}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;

async function main() {
  const evento = await queryOne("SELECT eventoId, empresaId, nome FROM evento WHERE nome = 'Festa do João'");
  assert.ok(evento, 'a Festa do João existe');
  const admin = { id: 'a', role: 'admin', empresaId: evento.empresaId };
  const usuarioKiosk = { id: 'k', role: 'kiosk', empresaId: evento.empresaId };
  let n = 0;
  const kioskCadastrar = (extra) => chamar(kiosk, 'post', '/participants', {
    usuario: usuarioKiosk,
    body: { eventId: evento.eventoId, nome: `Nascimento ${++n}`, braceletCode: `0DEF${String(n).padStart(6, '0')}`, ...extra },
  });

  try {
    await withTransaction(async () => {
      await ensureFamilySchema();
      await ensurePerfilCriancaSchema();   // colunas novas (a migração roda no startup; aqui dentro da transação desfeita)

      // 1) kiosk: a data de nascimento vira a idade
      const nasc = iso(7, 1, 1);
      const a = await kioskCadastrar({ dataNascimento: nasc });
      assert.equal(a.status, 201, JSON.stringify(a.corpo));
      assert.equal(a.corpo.age, idadeNaData(nasc));
      assert.equal(a.corpo.birthDate, nasc);
      const gravada = await queryOne('SELECT idade, CAST(dataNascimento AS text) AS d FROM crianca WHERE criancaId = @id', { id: a.corpo.id });
      assert.equal(gravada.d, nasc);
      assert.equal(Number(gravada.idade), idadeNaData(nasc));
      const perfil = await queryOne('SELECT CAST(dataNascimento AS text) AS d, idade FROM perfilCrianca WHERE perfilCriancaId = @id', { id: a.corpo.perfilCriancaId });
      assert.equal(perfil.d, nasc);
      console.log(`  ✔ kiosk: nascimento ${nasc} gravado na criança e no cadastro permanente; idade calculada = ${a.corpo.age}`);

      // 2) formato com barras e recusas
      assert.equal((await kioskCadastrar({ dataNascimento: '15/06/2018' })).status, 201);
      for (const [dataNascimento, texto] of [['2999-01-01', /futuro/], ['31/02/2018', /não existe/], ['1950-01-01', /mais de 18/], ['abc', /formato/]]) {
        const r = await kioskCadastrar({ dataNascimento });
        assert.equal(r.status, 400, dataNascimento);
        assert.match(r.corpo.error, texto);
      }
      const semNada = await kioskCadastrar({});
      assert.equal(semNada.status, 400);
      assert.match(semNada.corpo.error, /data de nascimento/i);
      console.log('  ✔ kiosk: dd/mm/aaaa aceito; futuro, dia que não existe, mais de 18 anos e texto são recusados; sem data (e sem idade) é recusado');

      // 3) versão antiga do app: só a idade continua valendo
      const legado = await kioskCadastrar({ idade: 9 });
      assert.equal(legado.status, 201, JSON.stringify(legado.corpo));
      assert.equal(legado.corpo.age, 9);
      console.log('  ✔ quem ainda manda só a idade (app antigo) continua cadastrando');

      // 4) quem volta no cadastro: a idade mostrada no kiosk é a de hoje (da data de nascimento)
      const lista = await chamar(kiosk, 'get', '/profiles', { usuario: usuarioKiosk, query: { eventId: evento.eventoId, busca: 'Nascimento 1' } });
      assert.equal(lista.status, 200);

      // 5) recepção: cadastrar e editar com a data
      const recepcao = await chamar(criancas, 'post', '/evento/:eventoId/crianca', {
        usuario: admin, params: { eventoId: evento.eventoId }, body: { nome: 'Recepção Nasc', apelido: 'Rec', dataNascimento: iso(5, 3, 20) },
      });
      assert.equal(recepcao.status, 200, JSON.stringify(recepcao.corpo));
      assert.equal(recepcao.corpo.age, idadeNaData(iso(5, 3, 20)));
      const edicao = await chamar(criancas, 'put', '/evento/:eventoId/crianca/:criancaId', {
        usuario: admin, params: { eventoId: evento.eventoId, criancaId: recepcao.corpo.id }, body: { dataNascimento: iso(10, 12, 25) },
      });
      assert.equal(edicao.status, 200, JSON.stringify(edicao.corpo));
      const editada = await queryOne('SELECT idade, CAST(dataNascimento AS text) AS d FROM crianca WHERE criancaId = @id', { id: recepcao.corpo.id });
      assert.equal(editada.d, iso(10, 12, 25));
      assert.equal(Number(editada.idade), idadeNaData(iso(10, 12, 25)));
      assert.equal((await chamar(criancas, 'put', '/evento/:eventoId/crianca/:criancaId', {
        usuario: admin, params: { eventoId: evento.eventoId, criancaId: recepcao.corpo.id }, body: { dataNascimento: '2999-01-01' },
      })).status, 400);
      console.log('  ✔ recepção: cadastro e edição com a data de nascimento calculam e gravam a idade; data no futuro é recusada');

      // 6) responsável com telefone, pelo código do evento
      const codigo = await chamar(familias, 'get', '/eventos/:eventoId/codigo', { usuario: admin, params: { eventoId: evento.eventoId } });
      assert.equal(codigo.status, 200, JSON.stringify(codigo.corpo));
      const token = String(codigo.corpo.codigo).toLowerCase();
      const sufixo = crypto.randomBytes(3).toString('hex');
      const registrar = (extra) => chamar(familias, 'post', '/invites/:token/register', {
        params: { token }, body: { parentNome: 'Responsável Tel', senha: 'segredo123', email: `tel-${crypto.randomBytes(3).toString('hex')}-${sufixo}@exemplo.com`, ...extra },
      });
      const ok = await registrar({ telefone: '(11) 91234-5678', children: [{ name: 'Filha Tel', nickname: 'Filhinha', dataNascimento: iso(6, 5, 10) }] });
      assert.equal(ok.status, 201, JSON.stringify(ok.corpo));
      const conta = await queryOne('SELECT telefone FROM login WHERE LOWER(nomeFamilia) = LOWER(@n) ORDER BY dataCriacao DESC LIMIT 1', { n: 'Responsável Tel' });
      assert.equal(conta.telefone, '11912345678', 'só os dígitos, com DDD');
      const filha = await queryOne("SELECT idade, CAST(dataNascimento AS text) AS d FROM crianca WHERE apelido = 'Filhinha' ORDER BY criadoEm DESC LIMIT 1");
      assert.equal(filha.d, iso(6, 5, 10));
      assert.equal(Number(filha.idade), idadeNaData(iso(6, 5, 10)));
      for (const ruim of ['123', '(11) 31234-5678', '00 91234-5678', 'telefone']) {
        const r = await registrar({ telefone: ruim });
        assert.equal(r.status, 400, ruim);
        assert.match(r.corpo.error, /Telefone inválido/);
      }
      const dataRuim = await registrar({ telefone: '11912345678', children: [{ name: 'X', dataNascimento: '2999-01-01' }] });
      assert.equal(dataRuim.status, 400);
      assert.match(dataRuim.corpo.error, /futuro/);
      const comMascara = await registrar({ telefone: '+55 (21) 99876-5432' });
      assert.equal(comMascara.status, 201);
      console.log('  ✔ responsável: telefone gravado só com os dígitos (aceita máscara e +55); telefone inválido e data de nascimento da criança no futuro são recusados');

      throw new Desfazer();
    });
  } catch (e) {
    if (!(e instanceof Desfazer)) throw e;
  }
  console.log('ROLLBACK ok (nada foi gravado)');
}

main().then(() => closeDB()).catch((e) => { console.error('❌ ENSAIO FALHOU:', e); process.exit(1); });
