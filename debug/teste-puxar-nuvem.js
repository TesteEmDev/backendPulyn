// debug/teste-puxar-nuvem.js - ensaio de ida e volta entre a nuvem e um buffet, com dois bancos de teste.
//
// Antes, crie dois bancos com a cópia do banco local (ex.: pulyn_teste_nuvem e pulyn_teste_buffet) e passe os
// endereços pelo ambiente (TESTE_NUVEM_URL e TESTE_BUFFET_URL). Não usa o banco de verdade nem o Supabase.
//   node debug/teste-puxar-nuvem.js
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const pg = require('pg');
const { criarSincronizador, tiposSemPerdaDePrecisao } = require('../utils/sincronizacao');

const EMPRESA = 'c9287e4b-399d-4764-8bff-2e0ce7058dcb';
const EVENTO_DA_EMPRESA = '909bb418-82c5-4461-869e-72bc9bfbb3aa';
const EVENTO_DE_OUTRO = 'evento-teste-1';
const EVENTO_NOVO = 'teste-sync-puxar';

const nuvemUrl = process.env.TESTE_NUVEM_URL;
const buffetUrl = process.env.TESTE_BUFFET_URL;
if (!nuvemUrl || !buffetUrl) throw new Error('Defina TESTE_NUVEM_URL e TESTE_BUFFET_URL (bancos de teste, nunca o de produção).');
if (/supabase|pooler/i.test(nuvemUrl) && !process.env.TESTE_NUVEM_PERMITIR) {
  throw new Error('TESTE_NUVEM_URL parece ser a nuvem de produção. Use um banco de teste.');
}

const types = tiposSemPerdaDePrecisao(pg);
const nuvem = new pg.Pool({ connectionString: nuvemUrl, ssl: false, max: 3, types });
const local = new pg.Pool({ connectionString: buffetUrl, ssl: false, max: 3, types });
const sem = { warn() {}, info() {}, error: console.error };

const contar = async (pool, sql, valores = []) => Number((await pool.query(sql, valores)).rows[0].c);
const nomeNo = async (pool, id) => (await pool.query('SELECT nome FROM evento WHERE "eventoId" = $1', [id])).rows[0]?.nome ?? null;
const pendentesLocais = () => contar(local, 'SELECT count(*) AS c FROM "sincronizacaoFila" WHERE "enviadoEm" IS NULL');

async function main() {
  // A nuvem precisa do gatilho novo (com a empresa e sem eco). O mesmo arquivo roda no banco local a cada boot.
  await nuvem.query(fs.readFileSync(path.join(__dirname, '..', 'migrations', '018-sincronizacao-fila.sql'), 'utf8'));

  const buffet = criarSincronizador({ local, nuvem, empresaId: EMPRESA, log: sem, lote: 50, margemNuvemSegundos: 0 });

  // 1. Primeiro ciclo: o buffet manda o que tem. A nuvem não pode registrar isso de volta na própria fila.
  const filaNuvemAntes = await contar(nuvem, 'SELECT count(*) AS c FROM "sincronizacaoFila"');
  await buffet.executarAgora();
  assert.equal(await contar(nuvem, 'SELECT count(*) AS c FROM "sincronizacaoFila"'), filaNuvemAntes, 'envio não ecoa na nuvem');
  assert.equal(await pendentesLocais(), 0, 'o envio esvaziou a fila local');
  console.log('✔ envio não ecoa na fila da nuvem');

  // 2. A nuvem muda um evento da empresa e um de outro buffet. Só o da empresa deve chegar.
  const filaDaEmpresa = () => contar(nuvem, 'SELECT count(*) AS c FROM "sincronizacaoFila" WHERE "empresaId" = $1', [EMPRESA]);
  const antesDaMudanca = await filaDaEmpresa();
  await nuvem.query('UPDATE evento SET nome = $2 WHERE "eventoId" = $1', [EVENTO_DA_EMPRESA, 'Mudado na nuvem']);
  await nuvem.query('UPDATE evento SET nome = $2 WHERE "eventoId" = $1', [EVENTO_DE_OUTRO, 'Mudado em outro buffet']);
  const novas = (await filaDaEmpresa()) - antesDaMudanca;
  assert.equal(novas, 1, 'a nuvem registrou a mudança da empresa, e não a de outro buffet');
  const recebidas = await buffet.puxarDaNuvem();
  assert.equal(recebidas, novas, 'puxa só as alterações da empresa (a de outro buffet fica de fora)');
  assert.equal(await nomeNo(local, EVENTO_DA_EMPRESA), 'Mudado na nuvem', 'a mudança da empresa chegou');
  assert.equal(await nomeNo(local, EVENTO_DE_OUTRO), 'Evento RFID Teste', 'a mudança de outro buffet não chegou');
  assert.equal(await pendentesLocais(), 0, 'puxar não gera envio de volta (sem eco)');
  console.log('✔ puxa só a empresa, sem eco');

  // 3. Inserção e exclusão na nuvem chegam também.
  await nuvem.query(
    `INSERT INTO evento ("eventoId", nome, "empresaId", data) VALUES ($1, 'Criado na nuvem', $2, CURRENT_DATE)`,
    [EVENTO_NOVO, EMPRESA]
  );
  await buffet.puxarDaNuvem();
  assert.equal(await nomeNo(local, EVENTO_NOVO), 'Criado na nuvem', 'inserção chegou');
  await nuvem.query('DELETE FROM evento WHERE "eventoId" = $1', [EVENTO_NOVO]);
  await buffet.puxarDaNuvem();
  assert.equal(await nomeNo(local, EVENTO_NOVO), null, 'exclusão chegou');
  console.log('✔ inserção e exclusão puxadas');

  // 4. Conflito: o buffet mudou o evento localmente e ainda não enviou; a nuvem mudou o mesmo evento.
  await local.query('UPDATE evento SET nome = $2 WHERE "eventoId" = $1', [EVENTO_DA_EMPRESA, 'Local']);
  await nuvem.query('UPDATE evento SET nome = $2 WHERE "eventoId" = $1', [EVENTO_DA_EMPRESA, 'Nuvem 2']);
  await buffet.puxarDaNuvem();
  assert.equal(await nomeNo(local, EVENTO_DA_EMPRESA), 'Local', 'alteração local pendente não é sobrescrita ao puxar');
  await buffet.executarAgora();
  assert.equal(await nomeNo(nuvem, EVENTO_DA_EMPRESA), 'Local', 'o envio leva a versão local para a nuvem');
  console.log('✔ conflito: a versão local pendente vence até o envio');

  console.log('\nTodos os ensaios de puxada passaram.');
}

main()
  .catch((erro) => { console.error('❌', erro.message); process.exitCode = 1; })
  .finally(() => Promise.allSettled([nuvem.end(), local.end()]));
