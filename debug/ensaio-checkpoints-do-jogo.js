// Ensaio de PUT /api/brincadeiras/:id/checkpoints com jogos reaproveitados (ligados ao evento só por eventoBrincadeira).
// Lê o banco de dev de verdade, mas toda escrita é interceptada e só registrada (nada é gravado).
// Uso: node debug/ensaio-checkpoints-do-jogo.js
require('dotenv').config();
const path = require('path');
const assert = require('node:assert/strict');
const http = require('http');
const jwt = require('jsonwebtoken');
const express = require('express');

const escritas = [];
const real = require('../database');
const caminho = require.resolve(path.join(__dirname, '..', 'database'));
require.cache[caminho] = {
  id: caminho, filename: caminho, loaded: true,
  exports: {
    ...real,
    query: async (sql, p) => {
      if (/^\s*select/i.test(sql)) return real.query(sql, p);
      escritas.push(sql.replace(/\s+/g, ' ').trim().slice(0, 60));
      return { rowsAffected: [1], rows: [] };
    },
  },
};

const rotas = require('../routes/brincadeiras');
const segredo = process.env.JWT_SECRET || 'sua-chave-secreta-super-segura-2026';
const app = express();
app.use(express.json());
app.use('/api/brincadeiras', rotas);

const servidor = http.createServer(app).listen(0, async () => {
  const porta = servidor.address().port;
  try {
    const jogos = await real.allQuery(
      `SELECT b.brincadeiraId, b.nome, b.tipo, b.empresaId, e.eventoId
       FROM brincadeira b JOIN "eventoBrincadeira" eb ON eb.brincadeiraId = b.brincadeiraId JOIN evento e ON e.eventoId = eb.eventoId
       WHERE b.eventoId IS NULL AND b.tipo IN ('treasure_hunt', 'monster_hunt') LIMIT 2`
    );
    assert.ok(jogos.length, 'precisa de um jogo reaproveitado no banco de dev');
    for (const jogo of jogos) {
      const cps = await real.allQuery('SELECT checkpointId FROM pontoVerificacao WHERE eventoId = @e AND LOWER(COALESCE(proposito, \'game\')) <> \'reception\' ORDER BY id', { e: jogo.eventoId });
      assert.ok(cps.length >= 2, 'o evento precisa de checkpoints');
      const token = jwt.sign({ role: 'game_master', empresaId: jogo.empresaId }, segredo);
      const pedir = async (id, corpo, tk = token) => {
        const res = await fetch(`http://127.0.0.1:${porta}/api/brincadeiras/${id}/checkpoints`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tk}` }, body: JSON.stringify(corpo),
        });
        return { status: res.status, corpo: await res.json() };
      };
      let r = await pedir(jogo.brincadeiraId, { checkpoints: cps.map((c) => c.checkpointId) });
      assert.equal(r.status, 200, `${jogo.nome}: ${JSON.stringify(r.corpo)}`);
      assert.equal(r.corpo.updated, true);
      assert.equal(r.corpo.checkpoints.length, cps.length);
      r = await pedir(jogo.brincadeiraId, { checkpoints: ['99999'] });
      assert.equal(r.status, 400, 'checkpoint que não é do evento é recusado');
      assert.match(r.corpo.error, /pertencentes ao evento/);
      r = await pedir(jogo.brincadeiraId, { checkpoints: [] });
      assert.equal(r.status, 400);
      const outroBuffet = jwt.sign({ role: 'game_master', empresaId: 'outra-empresa' }, segredo);
      r = await pedir(jogo.brincadeiraId, { checkpoints: [cps[0].checkpointId] }, outroBuffet);
      assert.equal(r.status, 403, 'outro buffet');
      console.log(`  ✔ ${jogo.nome} (${jogo.tipo}): salva ${cps.length} checkpoints; recusa id de fora, lista vazia e outro buffet`);
    }
    assert.ok(escritas.some((s) => /UPDATE brincadeira SET checkpoints/i.test(s)), 'tentou gravar a lista');
    console.log(`OK. Escritas interceptadas (nada gravado): ${escritas.length}`);
  } catch (e) {
    console.error('FALHOU:', e.message);
    process.exitCode = 1;
  } finally {
    servidor.close();
    setTimeout(() => process.exit(), 200);
  }
});
