// Confere (só leitura) o status que a lista de checkpoints devolve: banco x calculado pelo último heartbeat.
// Uso: node debug/verificar-status-checkpoints.js
require('dotenv').config();
const assert = require('node:assert/strict');
const { queryOne, closeDB } = require('../database');
const router = require('../routes/checkpoints');

function chamar(caminho, { usuario, params = {}, query = {} }) {
  const camada = router.stack.find((l) => l.route && l.route.path === caminho && l.route.methods.get);
  assert.ok(camada, `rota GET ${caminho} existe`);
  const handler = camada.route.stack[camada.route.stack.length - 1].handle;
  return new Promise((resolve, reject) => {
    const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(corpo) { resolve({ status: this.statusCode, corpo }); return this; } };
    Promise.resolve(handler({ user: usuario, params, query, headers: {} }, res)).catch(reject);
  });
}

async function main() {
  const evento = await queryOne("SELECT eventoId, empresaId, nome FROM evento WHERE nome = 'Festa do João'");
  assert.ok(evento, 'a Festa do João existe');
  const usuario = { id: 'x', email: 'verificacao', role: 'admin', empresaId: evento.empresaId };

  const lista = await chamar('/evento/:eventoId', { usuario, params: { eventoId: evento.eventoId } });
  assert.equal(lista.status, 200);
  const noBanco = await queryOne("SELECT COUNT(*)::int AS n FROM pontoVerificacao WHERE eventoId = @e AND LOWER(COALESCE(proposito,'game')) <> 'reception' AND status = 'online'", { e: evento.eventoId });
  console.log(`Evento "${evento.nome}": ${lista.corpo.length} checkpoint(s); o banco diz online em ${noBanco.n}`);
  for (const cp of lista.corpo) {
    const min = cp.ultimoVisto ? Math.round((Date.now() - new Date(cp.ultimoVisto).getTime()) / 60000) : null;
    console.log(`  #${cp.codigo} ${cp.nome}: agora=${cp.status} visto há ${min === null ? '—' : min + ' min'}`);
  }
  const online = lista.corpo.filter((cp) => cp.status === 'online').length;
  console.log(`A lista agora devolve ${online} online (calculado pelo último heartbeat).`);

  const resumo = await chamar('/resumo', { usuario });
  assert.equal(resumo.status, 200);
  const doEvento = resumo.corpo.find((r) => String(r.eventoId).toLowerCase() === String(evento.eventoId).toLowerCase());
  assert.equal(doEvento.online, online, 'o resumo e a lista concordam');
  console.log(`Resumo do evento: ${doEvento.online} online / ${doEvento.total}. Lista e resumo concordam.`);
}

main().then(() => closeDB()).catch((e) => { console.error('❌', e); process.exit(1); });
