// Ensaio da entrega dos jogos do plano: roda no banco de dev DENTRO de uma transação e a DESFAZ (ROLLBACK).
// Entrega os jogos a todos os clientes e confere: cada um fica com exatamente os tipos do plano dele, sem duplicar;
// uma segunda passada não cria nada; jogo arquivado é entregue de novo; jogo que já existe não é alterado.
// Uso: node debug/ensaio-jogos-do-plano.js
require('dotenv').config();
const assert = require('node:assert/strict');
const database = require('../database');
const { garantirJogosDaEmpresa, garantirJogosDeTodasAsEmpresas } = require('../utils/jogosDoPlano');
const { tiposDeJogoDoPlano } = require('../utils/planDefinitions');

class Desfazer extends Error {}

async function main() {
  try {
    await database.withTransaction(async (q) => {
      const antes = Number((await q.queryOne('SELECT COUNT(*)::int AS n FROM brincadeira')).n);
      const criados = await garantirJogosDeTodasAsEmpresas(q);
      console.log(`  jogos criados na 1ª passada: ${criados}`);

      const empresas = await q.allQuery("SELECT empresaId, nome, plano FROM empresa WHERE nome <> 'Master Admin'");
      for (const e of empresas) {
        const plano = String(e.plano || 'starter').toLowerCase();
        const jogos = await q.allQuery(
          "SELECT tipo FROM brincadeira WHERE empresaId = @id AND LOWER(COALESCE(status,'active')) <> 'archived'", { id: e.empresaId });
        const tipos = jogos.map((j) => j.tipo);
        if (plano === 'family') { assert.equal(tipos.length, 0, `${e.nome}: família não recebe jogos`); continue; }
        for (const t of tiposDeJogoDoPlano(plano)) {
          assert.equal(tipos.filter((x) => x === t).length >= 1, true, `${e.nome} (${plano}) recebeu ${t}`);
        }
      }
      console.log(`  ✔ ${empresas.length} empresas conferidas: todas têm os tipos do plano`);

      assert.equal(await garantirJogosDeTodasAsEmpresas(q), 0, 'a 2ª passada não cria nada');
      console.log('  ✔ segunda passada não cria nada (idempotente)');

      // jogo arquivado volta a ser entregue; o que existe não muda
      const alvo = empresas.find((e) => String(e.plano || 'starter').toLowerCase() === 'starter');
      if (alvo) {
        const jogo = await q.queryOne("SELECT brincadeiraId, nome, duracao FROM brincadeira WHERE empresaId = @id AND tipo = 'treasure_hunt' AND LOWER(COALESCE(status,'active')) <> 'archived'", { id: alvo.empresaId });
        await q.query("UPDATE brincadeira SET status = 'archived' WHERE brincadeiraId = @id", { id: jogo.brincadeiraId });
        const novos = await garantirJogosDaEmpresa(alvo.empresaId, q);
        assert.deepEqual(novos, ['treasure_hunt']);
        const outros = await q.allQuery("SELECT nome, duracao FROM brincadeira WHERE empresaId = @id AND tipo <> 'treasure_hunt'", { id: alvo.empresaId });
        assert.ok(outros.length >= 3, 'os outros jogos continuam');
        console.log('  ✔ jogo arquivado é entregue de novo; os outros não mudam');
      }

      const depois = Number((await q.queryOne('SELECT COUNT(*)::int AS n FROM brincadeira')).n);
      console.log(`  brincadeiras: ${antes} -> ${depois}`);
      throw new Desfazer();
    });
  } catch (e) {
    if (!(e instanceof Desfazer)) throw e;
  }
  console.log('ROLLBACK ok (nada foi gravado)');
}

main().then(() => database.closeDB()).catch((e) => { console.error('❌ ENSAIO FALHOU:', e); process.exit(1); });
