// Ensaio da exclusão de evento: apaga os eventos do banco de dev DENTRO de uma transação e a DESFAZ (ROLLBACK).
// Uso: node debug/ensaio-apagar-evento.js [eventoId]   (sem argumento, ensaia todos os eventos, um por vez)
require('dotenv').config();
const assert = require('node:assert/strict');
const { queryOne, allQuery, withTransaction } = require('../database');
const { apagarEventoDentroDaTransacao } = require('../utils/apagarEvento');

class Desfazer extends Error {}
const total = async (sql, p) => Number((await queryOne(sql, p)).n);

async function ensaiar(evento) {
  const p = { id: evento.eventoId };
  const antes = {
    criancas: await total('SELECT COUNT(*)::int AS n FROM crianca WHERE eventoId = @id', p),
    times: await total('SELECT COUNT(*)::int AS n FROM "time" WHERE eventoId = @id', p),
    checkpoints: await total('SELECT COUNT(*)::int AS n FROM pontoVerificacao WHERE eventoId = @id', p),
    comMac: await total('SELECT COUNT(*)::int AS n FROM pontoVerificacao WHERE eventoId = @id AND macAddress IS NOT NULL', p),
    perfis: await total('SELECT COUNT(*)::int AS n FROM perfilCrianca', {}),
    pulseirasEmUso: await total("SELECT COUNT(*)::int AS n FROM pulseira WHERE criancaId IS NOT NULL", {}),
  };
  let resumo;
  try {
    await withTransaction(async () => {
      resumo = await apagarEventoDentroDaTransacao(evento.eventoId);
      assert.equal(await total('SELECT COUNT(*)::int AS n FROM evento WHERE eventoId = @id', p), 0, 'evento apagado');
      assert.equal(await total('SELECT COUNT(*)::int AS n FROM crianca WHERE eventoId = @id', p), 0);
      assert.equal(await total('SELECT COUNT(*)::int AS n FROM pontoVerificacao WHERE eventoId = @id', p), 0);
      assert.equal(await total('SELECT COUNT(*)::int AS n FROM perfilCrianca', {}), antes.perfis, 'perfil permanente fica');
      assert.equal(await total('SELECT COUNT(*)::int AS n FROM pontoVerificacao WHERE macAddress IS NOT NULL', {}), await total('SELECT COUNT(*)::int AS n FROM pontoVerificacao WHERE macAddress IS NOT NULL', {}));
      throw new Desfazer();
    });
  } catch (e) {
    if (!(e instanceof Desfazer)) throw e;
  }
  const depois = await total('SELECT COUNT(*)::int AS n FROM evento WHERE eventoId = @id', p);
  assert.equal(depois, 1, 'ROLLBACK devolveu o evento');
  console.log(`  ✔ ${evento.nome}: antes ${JSON.stringify(antes)} -> apagou ${JSON.stringify(resumo)}`);
}

// Checkpoints dentro de um evento: o aparelho (com MAC) fica no buffet sem evento; o cadastro antigo (sem MAC) é apagado.
async function ensaiarComCheckpoints() {
  const evento = await queryOne("SELECT eventoId, empresaId FROM evento WHERE empresaId IS NOT NULL ORDER BY data DESC LIMIT 1");
  const aparelho = await queryOne('SELECT id, checkpointId FROM pontoVerificacao WHERE macAddress IS NOT NULL ORDER BY id LIMIT 1');
  const time = await queryOne('SELECT timeId FROM "time" WHERE eventoId = @id LIMIT 1', { id: evento.eventoId });
  try {
    await withTransaction(async () => {
      await queryOne('UPDATE pontoVerificacao SET eventoId = @e, territorioDonoTimeId = @t WHERE id = @id RETURNING id', { e: evento.eventoId, t: time.timeId, id: aparelho.id });
      const antigo = await queryOne(
        `INSERT INTO pontoVerificacao (eventoId, empresaId, nome, tipo, proposito, statusTransferencia)
         VALUES (@e, @emp, 'ENSAIO-SEM-MAC', 'NFC', 'game', 'aceito') RETURNING id, checkpointId`,
        { e: evento.eventoId, emp: evento.empresaId }
      );
      const resumo = await apagarEventoDentroDaTransacao(evento.eventoId);
      assert.equal(resumo.checkpointsLiberados, 1, 'o aparelho com MAC é liberado');
      assert.equal(resumo.checkpointsApagados, 1, 'o cadastro sem MAC é apagado');
      const ficou = await queryOne('SELECT eventoId, statusTransferencia, territorioDonoTimeId, macAddress FROM pontoVerificacao WHERE id = @id', { id: aparelho.id });
      assert.equal(ficou.eventoId, null);
      assert.equal(ficou.territorioDonoTimeId, null);
      assert.equal(ficou.statusTransferencia, 'aceito');
      assert.ok(ficou.macAddress, 'o MAC continua');
      assert.ok(!(await queryOne('SELECT 1 AS x FROM pontoVerificacao WHERE id = @id', { id: antigo.id })), 'cadastro sem MAC apagado');
      throw new Desfazer();
    });
  } catch (e) {
    if (!(e instanceof Desfazer)) throw e;
  }
  console.log('  ✔ com checkpoints: o aparelho com MAC volta para o buffet sem evento e o cadastro sem MAC é apagado');
}

(async () => {
  const eventos = process.argv[2]
    ? [{ eventoId: process.argv[2], nome: process.argv[2] }]
    : await allQuery('SELECT eventoId, nome FROM evento ORDER BY data DESC');
  const macsAntes = await total('SELECT COUNT(*)::int AS n FROM pontoVerificacao WHERE macAddress IS NOT NULL', {});
  for (const evento of eventos) await ensaiar(evento);
  if (!process.argv[2]) await ensaiarComCheckpoints();
  assert.equal(await total('SELECT COUNT(*)::int AS n FROM pontoVerificacao WHERE macAddress IS NOT NULL', {}), macsAntes);
  console.log('Transações desfeitas: o banco ficou como estava.');
  process.exit(0);
})().catch((e) => { console.error('FALHOU:', e.message); process.exit(1); });
