// debug/ensaio-chave-numerica.js
// Ensaio da migração que passa a chave do checkpoint a ser o id numérico (migrations/checkpointIdNumerico.js), contra o
// banco do .env, dentro de UMA transação DESFEITA no final: nada fica gravado. Usa: node debug/ensaio-chave-numerica.js
const assert = require('node:assert/strict');
const db = require('../database');

const REVERTER = 'ENSAIO_REVERTIDO';

const contar = async (tabela) => Number((await db.queryOne(`SELECT COUNT(*) AS n FROM "${tabela}"`)).n);

async function ensaio() {
  // A migração e as rotas abrem a própria transação (outra conexão, que confirmaria de verdade). Aqui reaproveitam a do
  // ensaio. Tem de ser trocado ANTES de carregar os módulos.
  db.withTransaction = async (trabalho) => trabalho({ query: db.query, queryOne: db.queryOne, allQuery: db.allQuery });
  const { ensureCheckpointTransferSchema } = require('../migrations/checkpointTransferencia');
  const { ensureCheckpointIdNumericoSchema, CONSTRAINT } = require('../migrations/checkpointIdNumerico');

  await ensureCheckpointTransferSchema();   // cria o id automático, se ainda não existir

  const jaMigrado = await db.queryOne('SELECT 1 AS ok FROM pg_constraint WHERE conname = @nome', { nome: CONSTRAINT });
  assert.ok(!jaMigrado, 'o banco ainda não foi migrado (este ensaio testa a migração; rode antes de aplicá-la)');

  const tabelas = ['zonaConquistaLeituraTime', 'zonaConquistaLeituraIndividual', 'cacaTesourScan', 'roundBomba', 'monsterCacaPartida', 'brincadeira', 'pontoVerificacao'];
  const antes = {};
  for (const t of tabelas) antes[t] = await contar(t);
  const reais = await db.allQuery('SELECT "checkpointId", id FROM "pontoVerificacao" ORDER BY id');
  console.log(`▶ antes: ${reais.length} checkpoint(s) reais: ${reais.map((r) => `${r.checkpointId}→id ${r.id}`).join(', ')}`);

  // ---- Casos difíceis ----
  console.log('▶ montando casos difíceis');
  // A e B com as chaves CRUZADAS: a chave antiga de A é o id de B e vice-versa.
  const ins = (chave) => db.queryOne(`INSERT INTO "pontoVerificacao" ("checkpointId", nome, tipo, proposito) VALUES (@c, 'Ensaio', 'NFC', 'game') RETURNING id`, { c: chave });
  const a = Number((await ins('TMP-A')).id);
  const b = Number((await ins('TMP-B')).id);
  await db.query(`UPDATE "pontoVerificacao" SET "checkpointId" = @b WHERE id = @a`, { a, b: String(b) });
  await db.query(`UPDATE "pontoVerificacao" SET "checkpointId" = @a WHERE id = @b`, { a: String(a), b });
  // C com uma chave que não é número, como as antigas "R1".
  const c = Number((await ins('ENS-LEGADO')).id);

  // Dependente COM chave estrangeira (acompanha por CASCADE).
  await db.query(`INSERT INTO "etiquetaCheckpoint" ("checkpointId", "tagUid") VALUES (@k, 'ENSAIO-TAG')`, { k: String(b) });   // chave antiga de A

  // Dependentes SEM chave estrangeira: linhas reais apontadas para os casos acima.
  const lt = await db.allQuery(`SELECT id AS pos FROM "zonaConquistaLeituraTime" ORDER BY id LIMIT 4`);
  assert.ok(lt.length >= 4, 'há linhas em zonaConquistaLeituraTime para usar no ensaio');
  const alvo = [String(b), String(a), 'ENS-LEGADO', '999999'];   // pertence a A, a B, a C, e a um checkpoint que não existe
  for (let i = 0; i < 4; i += 1) {
    await db.query(`UPDATE "zonaConquistaLeituraTime" SET "checkpointId" = @k WHERE id = @pos`, { k: alvo[i], pos: lt[i].pos });
  }
  const li = await db.queryOne(`SELECT id AS pos FROM "zonaConquistaLeituraIndividual" ORDER BY id LIMIT 1`);
  await db.query(`UPDATE "zonaConquistaLeituraIndividual" SET "checkpointId" = '0b7e4f1a-9c2d-4e8a-b1c3-5d6f7a8b9c0d' WHERE id = @pos`, { pos: li.pos });

  // Lista JSON de um jogo: [A, C, órfão numérico, órfão não numérico]
  const br = await db.queryOne(`SELECT "brincadeiraId" AS id FROM brincadeira LIMIT 1`);
  await db.query(`UPDATE brincadeira SET checkpoints = @l WHERE "brincadeiraId" = @id`, {
    l: JSON.stringify([{ id: String(b), points: 10 }, 'ENS-LEGADO', '999998', 'CHK-ANTIGO']), id: br.id,
  });

  // ---- Migração ----
  console.log('▶ migração (1ª vez)');
  await ensureCheckpointIdNumericoSchema();

  console.log('▶ conferindo');
  const todos = await db.allQuery(`SELECT "checkpointId" AS chave, id FROM "pontoVerificacao" ORDER BY id`);
  for (const r of todos) assert.equal(r.chave, String(r.id), `chave = id em ${r.id}`);
  assert.equal(await contar('pontoVerificacao'), antes.pontoVerificacao + 3, 'nenhum checkpoint some');
  console.log(`  ✔ ${todos.length} checkpoints: chave = id, só dígitos`);

  const tag = await db.queryOne(`SELECT "checkpointId" AS k FROM "etiquetaCheckpoint" WHERE "tagUid" = 'ENSAIO-TAG'`);
  assert.equal(tag.k, String(a), 'FK acompanhou: era a chave antiga de A (o id de B), agora é o id de A');

  const lido = [];
  for (let i = 0; i < 4; i += 1) {
    lido.push((await db.queryOne(`SELECT "checkpointId" AS k FROM "zonaConquistaLeituraTime" WHERE id = @pos`, { pos: lt[i].pos })).k);
  }
  assert.deepEqual(lido, [String(a), String(b), String(c), 'orfao:999999'], 'chaves cruzadas trocadas de uma vez; órfã de dígitos neutralizada');
  console.log('  ✔ chaves cruzadas trocaram sem se misturar; a órfã "999999" ficou "orfao:999999"');

  const uuid = await db.queryOne(`SELECT "checkpointId" AS k FROM "zonaConquistaLeituraIndividual" WHERE id = @pos`, { pos: li.pos });
  assert.equal(uuid.k, '0b7e4f1a-9c2d-4e8a-b1c3-5d6f7a8b9c0d', 'órfã que não é só dígitos fica como estava');

  const lista = JSON.parse((await db.queryOne(`SELECT checkpoints AS l FROM brincadeira WHERE "brincadeiraId" = @id`, { id: br.id })).l);
  assert.deepEqual(lista, [{ id: String(a), points: 10 }, String(c), 'orfao:999998', 'CHK-ANTIGO'], 'lista JSON reescrita, órfãos preservados');
  console.log('  ✔ lista JSON do jogo reescrita (objeto, texto, órfão numérico e não numérico)');

  for (const t of tabelas.filter((x) => x !== 'pontoVerificacao')) assert.equal(await contar(t), antes[t], `${t}: nenhuma linha some`);
  console.log('  ✔ nenhuma linha de histórico foi apagada');

  // Os órfãos de dígitos que já existiam no banco real não podem casar com nenhum checkpoint.
  const colisoes = await db.queryOne(`SELECT COUNT(*) AS n FROM "zonaConquistaLeituraIndividual" z JOIN "pontoVerificacao" p ON p."checkpointId" = z."checkpointId"`);
  const orfasReaisCasadas = Number(colisoes.n);
  console.log(`  ℹ ${orfasReaisCasadas} linha(s) de histórico de leitura individual casam com algum checkpoint (as órfãs antigas não podem estar entre elas)`);

  // ---- Depois da migração: o banco gera o id e a chave ----
  console.log('▶ o banco gera o id e a chave');
  const novo = await db.queryOne(`INSERT INTO "pontoVerificacao" (nome, tipo, proposito, "macAddress", "statusTransferencia") VALUES ('Novo', 'NFC', 'game', 'AA:BB:CC:00:11:22', 'estoque') RETURNING id, "checkpointId" AS chave`);
  assert.equal(novo.chave, String(novo.id), 'INSERT sem id nem chave: o gatilho copia o id');
  assert.ok(/^\d+$/.test(novo.chave), 'só dígitos');
  const proximo = await db.queryOne(`INSERT INTO "pontoVerificacao" (nome, tipo, proposito, "statusTransferencia") VALUES ('Novo 2', 'NFC', 'game', 'estoque') RETURNING id`);
  assert.equal(Number(proximo.id), Number(novo.id) + 1, 'autoincremento');

  await db.query('SAVEPOINT s1');
  await assert.rejects(
    db.query(`INSERT INTO "pontoVerificacao" ("checkpointId", nome, tipo, proposito) VALUES ('ABC', 'Errado', 'NFC', 'game')`),
    /ck_pontoverificacao_chave_igual_id/, 'o banco recusa chave que não seja o id'
  );
  await db.query('ROLLBACK TO SAVEPOINT s1');
  await db.query('SAVEPOINT s2');
  await assert.rejects(
    db.query(`UPDATE "pontoVerificacao" SET "checkpointId" = '12345678' WHERE id = @id`, { id: novo.id }),
    /ck_pontoverificacao_chave_igual_id/, 'nem por UPDATE'
  );
  await db.query('ROLLBACK TO SAVEPOINT s2');
  console.log('  ✔ INSERT sem chave gera id e chave iguais e crescentes; o banco recusa qualquer outra chave');

  // ---- Idempotência ----
  console.log('▶ migração (2ª vez: não pode mudar nada)');
  const fotoAntes = JSON.stringify(await db.allQuery(`SELECT "checkpointId" AS k FROM "zonaConquistaLeituraTime" ORDER BY id`));
  await ensureCheckpointIdNumericoSchema();
  const fotoDepois = JSON.stringify(await db.allQuery(`SELECT "checkpointId" AS k FROM "zonaConquistaLeituraTime" ORDER BY id`));
  assert.equal(fotoDepois, fotoAntes, 'segunda execução não muda nada (nem prefixa o órfão de novo)');
  console.log('  ✔ idempotente');

  throw new Error(REVERTER);
}

(async () => {
  try {
    await db.connectDB();
    const real = db.withTransaction;
    await real(ensaio);
  } catch (erro) {
    if (erro.message !== REVERTER) {
      console.error('❌ ENSAIO FALHOU:', erro.message);
      if (erro.stack) console.error(erro.stack.split('\n').slice(1, 5).join('\n'));
      await verificarLimpeza();
      process.exit(1);
    }
    console.log('\n↩️ Transação desfeita (ROLLBACK) como planejado.');
  }
  await verificarLimpeza();
  process.exit(0);
})();

// Outra conexão confirma que nada do ensaio ficou no banco.
async function verificarLimpeza() {
  const marca = await db.queryOne(`SELECT 1 AS ok FROM pg_constraint WHERE conname = 'ck_pontoverificacao_chave_igual_id'`);
  const n = await db.queryOne('SELECT COUNT(*) AS n FROM "pontoVerificacao"');
  const sujos = await db.queryOne(`SELECT COUNT(*) AS n FROM "pontoVerificacao" WHERE nome IN ('Ensaio', 'Novo', 'Novo 2')`);
  console.log(`🔎 Depois do ensaio: migração ${marca ? 'APLICADA (!)' : 'não aplicada'} · ${n.n} checkpoints · ${sujos.n} resíduos do ensaio`);
}
