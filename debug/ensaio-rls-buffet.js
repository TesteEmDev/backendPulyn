// debug/ensaio-rls-buffet.js - ensaio do acesso por buffet na nuvem, contra o banco de TESTE.
//
// TESTE_NUVEM_URL: o dono da nuvem de teste (vê tudo). TESTE_BUFFET_NUVEM_URL: o usuário do buffet (preparado por
// debug/preparar-acesso-buffet-nuvem.js). TESTE_BUFFET_LOCAL_URL: o banco local desse buffet de teste.
//   node debug/ensaio-rls-buffet.js
const assert = require('node:assert/strict');
const pg = require('pg');
const { criarSincronizador, tiposSemPerdaDePrecisao } = require('../utils/sincronizacao');

const EMPRESA = process.env.TESTE_EMPRESA_ID || 'c9287e4b-399d-4764-8bff-2e0ce7058dcb';
const OUTRA_EVENTO = 'evento-teste-1'; // empresaId nulo, de outro lugar
const EVENTO_PROPRIO = '909bb418-82c5-4461-869e-72bc9bfbb3aa';

const urls = ['TESTE_NUVEM_URL', 'TESTE_BUFFET_NUVEM_URL', 'TESTE_BUFFET_LOCAL_URL'].map((nome) => {
  if (!process.env[nome]) throw new Error(`Defina ${nome} (bancos de teste, nunca o de produção).`);
  return process.env[nome];
});
const types = tiposSemPerdaDePrecisao(pg);
const dono = new pg.Pool({ connectionString: urls[0], ssl: false, max: 2, types });
const buffet = new pg.Pool({ connectionString: urls[1], ssl: false, max: 3, types });
const local = new pg.Pool({ connectionString: urls[2], ssl: false, max: 3, types });
const sem = { warn() {}, info() {}, error: console.error };

const contar = async (pool, sql, valores = []) => Number((await pool.query(sql, valores)).rows[0].c);

async function main() {
  // 1. Só enxerga a própria empresa.
  const meus = await contar(buffet, 'SELECT count(*) AS c FROM "evento"');
  const dosDono = await contar(dono, 'SELECT count(*) AS c FROM "evento" WHERE "empresaId" = $1', [EMPRESA]);
  assert.equal(meus, dosDono, 'o buffet vê exatamente as linhas da sua empresa');
  assert.equal(await contar(buffet, 'SELECT count(*) AS c FROM "evento" WHERE "empresaId" IS DISTINCT FROM $1', [EMPRESA]), 0);
  console.log('✔ vê só a própria empresa');

  // 2. Não consegue gravar nem mover linha para outra empresa.
  await assert.rejects(
    buffet.query(`INSERT INTO "evento" ("eventoId", nome, "empresaId", data) VALUES ('invasao-teste', 'x', 'outra-empresa', CURRENT_DATE)`),
    'inserir em outra empresa deve falhar'
  );
  // Linha de outra empresa nem aparece para o buffet: o UPDATE não encontra nada e não altera nada.
  const semEfeito = await buffet.query(`UPDATE "evento" SET nome = 'invadido' WHERE "eventoId" = $1`, [OUTRA_EVENTO]);
  assert.equal(semEfeito.rowCount, 0, 'linha de outra empresa não é alcançada');
  // Linha própria não pode sair da empresa.
  await assert.rejects(
    buffet.query(`UPDATE "evento" SET "empresaId" = 'outra-empresa' WHERE "eventoId" = $1`, [EVENTO_PROPRIO]),
    'mover linha própria para outra empresa deve falhar'
  );
  assert.equal(await contar(dono, 'SELECT count(*) AS c FROM "evento" WHERE "eventoId" = $1', ['invasao-teste']), 0);
  console.log('✔ não grava em outra empresa');

  // 3. Tabela sem vínculo com empresa fica fechada.
  // Escolhe uma tabela sem coluna de empresa que tenha linhas (ex.: staff, zonas).
  let semVinculo = null;
  for (const candidata of ['staff', 'zonas', 'conquistas', 'checkpoint_tags', 'mensagens_display', 'clientes']) {
    const existe = await dono.query('SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2', ['public', candidata]);
    if (existe.rows.length && await contar(dono, `SELECT count(*) AS c FROM "${candidata}"`) > 0) { semVinculo = candidata; break; }
  }
  if (semVinculo) {
    assert.equal(await contar(buffet, `SELECT count(*) AS c FROM "${semVinculo}"`), 0, `${semVinculo} fica fechada`);
    console.log(`✔ tabela sem empresa (${semVinculo}) fica fechada para o buffet`);
  } else {
    console.log('– nenhuma tabela sem empresa com linhas neste banco; checagem pulada');
  }

  // 4. A fila da nuvem mostra só a empresa, e a checagem de lacuna funciona sem expor dados.
  assert.equal(await contar(buffet, 'SELECT count(*) AS c FROM "sincronizacaoFila" WHERE "empresaId" IS DISTINCT FROM $1', [EMPRESA]), 0);
  const menor = await buffet.query('SELECT "sincronizacaoMenorFilaId"() AS menor');
  assert.ok('menor' in menor.rows[0]);
  console.log('✔ fila restrita e checagem de lacuna disponível');

  // 5. Um ciclo completo de sincronização como esse buffet: envia, puxa e não dá erro.
  await local.query('DELETE FROM "sincronizacaoEstado" WHERE "chave" = $1', ['puxarCursor']);
  const sync = criarSincronizador({ local, nuvem: buffet, empresaId: EMPRESA, log: sem, lote: 50, margemNuvemSegundos: 0 });
  const resultado = await sync.executarAgora();
  assert.equal(resultado.ok, true, `ciclo como buffet falhou: ${resultado.erro}`);
  console.log('✔ ciclo de sincronização como buffet roda sem erro');

  // 6. Mudança feita pelo dono na empresa chega ao buffet.
  await dono.query('UPDATE "evento" SET nome = $2 WHERE "eventoId" = $1', ['909bb418-82c5-4461-869e-72bc9bfbb3aa', 'Ensaio RLS']);
  await sync.puxarDaNuvem();
  const nome = (await local.query('SELECT nome FROM "evento" WHERE "eventoId" = $1', ['909bb418-82c5-4461-869e-72bc9bfbb3aa'])).rows[0]?.nome;
  assert.equal(nome, 'Ensaio RLS', 'o buffet recebe a mudança do dono');
  console.log('✔ recebe a mudança do dono da própria empresa');

  console.log('\nTodos os ensaios de acesso passaram.');
}

main()
  .catch((erro) => { console.error('❌', erro.message); process.exitCode = 1; })
  .finally(() => Promise.allSettled([dono.end(), buffet.end(), local.end()]));
