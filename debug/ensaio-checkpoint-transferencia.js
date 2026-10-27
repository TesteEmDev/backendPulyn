// debug/ensaio-checkpoint-transferencia.js
// Ensaio da migração e das rotas do super admin contra o banco do .env, tudo dentro de UMA transação que é
// DESFEITA no final (ROLLBACK): nada fica gravado. Usa: node debug/ensaio-checkpoint-transferencia.js
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const db = require('../database');

const REVERTER = 'ENSAIO_REVERTIDO';

function chamar(router, metodo, url, { corpo = {}, papel = 'master', empresaId } = {}) {
  return new Promise((resolve, reject) => {
    const [caminho, texto = ''] = url.split('?');
    const req = {
      method: metodo, url: caminho + (texto ? `?${texto}` : ''), originalUrl: url, baseUrl: '',
      headers: { authorization: `Bearer ${jwt.sign({ role: papel, email: 'ensaio@pulyn', empresaId },process.env.JWT_SECRET || 'sua-chave-secreta-super-segura-2026')}` },
      body: corpo, query: Object.fromEntries(new URLSearchParams(texto)),
    };
    const res = {
      statusCode: 200,
      status(codigo) { this.statusCode = codigo; return this; },
      json(body) { resolve({ status: this.statusCode, body }); return this; },
    };
    router.handle(req, res, (erro) => (erro ? reject(erro) : resolve({ status: 404, body: null })));
  });
}

async function ensaio() {
  // As rotas usam withTransaction, que abriria outra conexão e confirmaria de verdade. Aqui ele reaproveita a
  // transação do ensaio. Precisa ser trocado ANTES de carregar a rota (ela desestrutura na importação).
  db.withTransaction = async (trabalho) => trabalho({ query: db.query, queryOne: db.queryOne, allQuery: db.allQuery });
  const { ensureCheckpointTransferSchema } = require('../migrations/checkpointTransferencia');
  const router = require('../routes/checkpointsMaster');

  const antes = await db.allQuery('SELECT checkpointId, codigo, empresaId FROM pontoVerificacao ORDER BY checkpointId');

  console.log('▶ migração (1ª vez)');
  await ensureCheckpointTransferSchema();
  console.log('▶ migração (2ª vez: tem de ser idempotente)');
  await ensureCheckpointTransferSchema();

  const linhas = await db.allQuery('SELECT id, checkpointId, codigo, numCheck, macAddress, statusTransferencia, empresaId FROM pontoVerificacao ORDER BY id');
  assert.equal(linhas.length, antes.length, 'a migração não pode criar nem apagar linhas');
  for (const l of linhas) {
    assert.ok(Number.isInteger(Number(l.id)), `id numérico em ${l.checkpointId}`);
    assert.equal(l.numCheck, l.codigo, `numCheck copiado de codigo em ${l.checkpointId}`);
    assert.equal(l.statusTransferencia, 'aceito', `linha antiga fica aceita: ${l.checkpointId}`);
    assert.equal(l.macAddress, null);
  }
  assert.equal(new Set(linhas.map((l) => l.id)).size, linhas.length, 'ids únicos');
  const intactas = await db.allQuery('SELECT checkpointId, empresaId FROM pontoVerificacao ORDER BY checkpointId');
  assert.deepEqual(intactas, antes.map(({ checkpointId, empresaId }) => ({ checkpointId, empresaId })), 'chave e buffet antigos intactos');
  console.log(`  ✔ ${linhas.length} checkpoints antigos: id gerado, numCheck copiado, status aceito, chave intacta`);

  const empresa = await db.queryOne("SELECT empresaId, nome FROM empresa WHERE empresaId = 'empresa-001'");
  assert.ok(empresa, 'buffet de teste empresa-001 existe');

  console.log('▶ rotas atuais dos checkpoints não podem mudar de formato');
  const legado = require('../routes/checkpoints');
  const eventoLegado = await db.queryOne("SELECT eventoId, empresaId FROM pontoVerificacao WHERE proposito = 'game' LIMIT 1");
  assert.ok(eventoLegado, 'há um checkpoint de jogo para comparar');
  const lista = await chamar(legado, 'GET', `/evento/${eventoLegado.eventoId}`, { empresaId: eventoLegado.empresaId });
  assert.equal(lista.status, 200, JSON.stringify(lista.body));
  assert.ok(lista.body.length > 0);
  for (const cp of lista.body) {
    assert.equal('id' in cp, false, 'a lista do buffet não pode trazer o id novo (o frontend usa id como apelido de checkpointId)');
    assert.ok(cp.checkpointId && cp.codigo, 'continua trazendo checkpointId e codigo');
  }
  const cfg = await chamar(legado, 'GET', `/${lista.body[0].checkpointId}/config`, { empresaId: eventoLegado.empresaId });
  assert.equal(cfg.status, 200, JSON.stringify(cfg.body));
  assert.equal('id' in cfg.body, false);
  console.log(`  ✔ ${lista.body.length} checkpoint(s) listados sem o id novo; /config também`);

  console.log('▶ rotas do super admin');
  let r = await chamar(router, 'GET', '/', { papel: 'admin' });
  assert.equal(r.status, 403, 'não-master recebe 403');

  r = await chamar(router, 'POST', '/', { corpo: { macAddress: 'xx' } });
  assert.equal(r.status, 400, 'MAC inválido');

  r = await chamar(router, 'POST', '/', { corpo: { macAddress: 'aa-bb-cc-dd-ee-01', numCheck: '1 2' } });
  assert.equal(r.status, 400, 'número inválido');

  r = await chamar(router, 'POST', '/', { corpo: { macAddress: 'aa-bb-cc-dd-ee-01', nome: 'Entrada', numCheck: '15' } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const a = r.body;
  assert.equal(a.macAddress, 'AA:BB:CC:DD:EE:01');
  assert.equal(a.statusTransferencia, 'estoque');
  assert.equal(a.empresaId, null);
  assert.equal(a.eventoId, null);
  assert.equal(a.numCheck, '15');
  assert.ok(Number(a.id) > Math.max(...linhas.map((l) => Number(l.id))), 'id novo é maior que os antigos');
  const chave = await db.queryOne('SELECT checkpointId FROM pontoVerificacao WHERE id = @id', { id: a.id });
  assert.equal(chave.checkpointId, `cp-${a.id}`);
  console.log(`  ✔ cadastrado id ${a.id}, chave provisória ${chave.checkpointId}`);

  r = await chamar(router, 'POST', '/', { corpo: { macAddress: 'AA:BB:CC:DD:EE:01' } });
  assert.equal(r.status, 409, 'MAC repetido');

  r = await chamar(router, 'POST', '/', { corpo: { macAddress: 'AA:BB:CC:DD:EE:02' } });
  assert.equal(r.status, 201);
  const b = r.body;
  assert.equal(b.numCheck, null);
  assert.equal(b.nome, `Checkpoint ${b.id}`);
  assert.equal(Number(b.id), Number(a.id) + 1, 'autoincremento');

  r = await chamar(router, 'PATCH', `/${b.id}`, { corpo: { macAddress: 'AA:BB:CC:DD:EE:01' } });
  assert.equal(r.status, 409, 'editar para MAC de outro');
  r = await chamar(router, 'PATCH', `/${b.id}`, { corpo: { nome: 'Saída', numCheck: '16' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.nome, 'Saída');
  assert.equal(r.body.numCheck, '16');
  r = await chamar(router, 'PATCH', `/${b.id}`, { corpo: {} });
  assert.equal(r.status, 400);
  r = await chamar(router, 'PATCH', '/999999', { corpo: { nome: 'x' } });
  assert.equal(r.status, 404);
  r = await chamar(router, 'PATCH', '/abc', { corpo: { nome: 'x' } });
  assert.equal(r.status, 400);

  r = await chamar(router, 'GET', '/?statusTransferencia=estoque');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.map((x) => Number(x.id)), [Number(a.id), Number(b.id)], 'lista só o estoque');

  r = await chamar(router, 'POST', `/${a.id}/transferir`, { corpo: { empresaId: 'nao-existe' } });
  assert.equal(r.status, 404, 'buffet inexistente');
  r = await chamar(router, 'POST', `/${a.id}/transferir`, { corpo: {} });
  assert.equal(r.status, 400);

  // Conflito de número: o buffet de destino já tem um checkpoint com o número 15?
  const comNumero = await db.queryOne("SELECT id FROM pontoVerificacao WHERE empresaId = @e AND LOWER(numCheck) = '15'", { e: empresa.empresaId });
  if (!comNumero) {
    r = await chamar(router, 'POST', `/${a.id}/transferir`, { corpo: { empresaId: empresa.empresaId } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.statusTransferencia, 'pendente');
    assert.equal(r.body.empresaDestinoId, empresa.empresaId);
    assert.equal(r.body.empresaDestinoNome, empresa.nome);
    assert.equal(r.body.empresaId, null, 'ainda não é do buffet até aceitar');
    assert.ok(r.body.transferidoEm);
    console.log(`  ✔ transferido para "${empresa.nome}" (pendente, empresaId continua NULL)`);

    r = await chamar(router, 'POST', `/${a.id}/transferir`, { corpo: { empresaId: empresa.empresaId } });
    assert.equal(r.status, 409, 'não transfere duas vezes');
    r = await chamar(router, 'DELETE', `/${a.id}`);
    assert.equal(r.status, 409, 'não exclui pendente');
    r = await chamar(router, 'PATCH', `/${a.id}`, { corpo: { numCheck: '99' } });
    assert.equal(r.status, 200, 'pendente ainda aceita editar número');

    // A tela atual do buffet filtra por eventoId e empresaId: o pendente não pode aparecer nela.
    const visivel = await db.allQuery('SELECT id FROM pontoVerificacao WHERE empresaId = @e AND id = @id', { e: empresa.empresaId, id: a.id });
    assert.equal(visivel.length, 0, 'pendente invisível para as rotas atuais do buffet');

    r = await chamar(router, 'POST', `/${a.id}/cancelar-transferencia`);
    assert.equal(r.status, 200);
    assert.equal(r.body.statusTransferencia, 'estoque');
    assert.equal(r.body.empresaDestinoId, null);
    assert.equal(r.body.transferidoEm, null);
    r = await chamar(router, 'POST', `/${a.id}/cancelar-transferencia`);
    assert.equal(r.status, 409, 'não cancela o que já voltou ao estoque');
  } else {
    console.log('  ⚠ empresa-001 já tem número 15: pulei o teste de transferência');
  }

  r = await chamar(router, 'DELETE', `/${a.id}`);
  assert.equal(r.status, 200);
  r = await chamar(router, 'DELETE', `/${a.id}`);
  assert.equal(r.status, 404);

  // Um checkpoint antigo (aceito) não pode ser transferido, excluído nem ter o número mudado pelo master.
  const antigo = linhas[0];
  r = await chamar(router, 'POST', `/${antigo.id}/transferir`, { corpo: { empresaId: empresa.empresaId } });
  assert.equal(r.status, 409);
  r = await chamar(router, 'DELETE', `/${antigo.id}`);
  assert.equal(r.status, 409);
  r = await chamar(router, 'PATCH', `/${antigo.id}`, { corpo: { numCheck: '777' } });
  assert.equal(r.status, 409);
  console.log('  ✔ todas as rotas responderam como esperado');

  // ---------- etapa 2: o buffet recebe ----------
  console.log('▶ buffet recebe os checkpoints transferidos');
  const recebimento = require('../routes/checkpointsRecebimento');
  const buffet = eventoLegado.empresaId;   // buffet que já tem o checkpoint "15" no evento eventoLegado.eventoId
  const nomeBuffet = await db.queryOne('SELECT empresaId FROM empresa WHERE empresaId = @e', { e: buffet });
  assert.ok(nomeBuffet, 'o buffet dos checkpoints antigos existe na tabela empresa');
  const admin = (extra = {}) => ({ papel: 'admin', empresaId: buffet, ...extra });

  const criar = async (mac, corpo = {}) => {
    const x = await chamar(router, 'POST', '/', { corpo: { macAddress: mac, ...corpo } });
    assert.equal(x.status, 201, JSON.stringify(x.body));
    return x.body;
  };
  const transferir = (cp) => chamar(router, 'POST', `/${cp.id}/transferir`, { corpo: { empresaId: buffet } });

  // Número que já existe no buffet de destino impede a transferência (o checkpoint "15" antigo).
  const y = await criar('AA:BB:CC:DD:EE:03', { nome: 'Rampa', numCheck: '15' });
  r = await transferir(y);
  assert.equal(r.status, 409, 'número 15 já existe no buffet');
  r = await chamar(router, 'PATCH', `/${y.id}`, { corpo: { numCheck: '40' } });
  assert.equal(r.status, 200);
  r = await transferir(y);
  assert.equal(r.status, 200, JSON.stringify(r.body));

  r = await chamar(recebimento, 'GET', '/pendentes', admin());
  assert.equal(r.status, 200);
  const pend = r.body.find((p) => p.macAddress === 'AA:BB:CC:DD:EE:03');
  assert.ok(pend, 'o pendente aparece para o buffet de destino');
  assert.equal(pend.nome, 'Rampa');
  assert.equal(pend.numCheck, '40', 'a sugestão do super admin vem preenchida');
  assert.equal(pend.checkpointId, `cp-${y.id}`);

  r = await chamar(recebimento, 'GET', '/pendentes', admin({ empresaId: 'outro-buffet' }));
  assert.equal(r.body.length, 0, 'outro buffet não vê o pendente');
  r = await chamar(recebimento, 'POST', `/${pend.checkpointId}/aceitar`, admin({ empresaId: 'outro-buffet', corpo: { numCheck: '9' } }));
  assert.equal(r.status, 404, 'outro buffet não aceita o que não é dele');
  r = await chamar(recebimento, 'GET', '/pendentes', { papel: 'master' });
  assert.equal(r.status, 403, 'só o admin do buffet usa estas rotas');

  r = await chamar(recebimento, 'POST', `/${pend.checkpointId}/aceitar`, admin({ corpo: { numCheck: '15' } }));
  assert.equal(r.status, 409, 'número repetido no buffet');
  r = await chamar(recebimento, 'POST', `/${pend.checkpointId}/aceitar`, admin({ corpo: { numCheck: '1 2' } }));
  assert.equal(r.status, 400, 'número inválido');
  r = await chamar(recebimento, 'POST', `/${pend.checkpointId}/aceitar`, admin({ corpo: { numCheck: '41', eventoId: 'nao-existe' } }));
  assert.equal(r.status, 404, 'evento inexistente');
  r = await chamar(recebimento, 'POST', `/${pend.checkpointId}/aceitar`, admin({ corpo: { numCheck: '41' } }));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.statusTransferencia, 'aceito');
  assert.equal(r.body.numCheck, '41');
  assert.equal(r.body.eventoId, null);
  const aceito = await db.queryOne('SELECT empresaId, empresaDestinoId, codigo, numCheck FROM pontoVerificacao WHERE checkpointId = @c', { c: pend.checkpointId });
  assert.equal(aceito.empresaId, buffet);
  assert.equal(aceito.empresaDestinoId, null);
  assert.equal(aceito.codigo, '41', 'codigo acompanha o número para as telas atuais');
  r = await chamar(recebimento, 'POST', `/${pend.checkpointId}/aceitar`, admin({ corpo: { numCheck: '41' } }));
  assert.equal(r.status, 409, 'não aceita duas vezes');
  console.log('  ✔ aceite: valida número, evento e buffet; grava empresaId e codigo');

  r = await chamar(recebimento, 'GET', '/sem-evento', admin());
  assert.ok(r.body.some((c) => c.checkpointId === pend.checkpointId), 'aceito sem evento aparece em sem-evento');
  let legadoLista = await chamar(legado, 'GET', `/evento/${eventoLegado.eventoId}`, { empresaId: buffet });
  assert.ok(!legadoLista.body.some((c) => c.checkpointId === pend.checkpointId), 'sem evento não entra na lista de um evento');

  r = await chamar(recebimento, 'PATCH', `/${pend.checkpointId}/evento`, admin({ corpo: { eventoId: 'nao-existe' } }));
  assert.equal(r.status, 404);
  r = await chamar(recebimento, 'PATCH', `/${pend.checkpointId}/evento`, admin({ corpo: { eventoId: eventoLegado.eventoId } }));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.eventoId, eventoLegado.eventoId);
  legadoLista = await chamar(legado, 'GET', `/evento/${eventoLegado.eventoId}`, { empresaId: buffet });
  const naLista = legadoLista.body.find((c) => c.checkpointId === pend.checkpointId);
  assert.ok(naLista, 'depois de atribuído, aparece na lista do evento (tela atual)');
  assert.equal(naLista.codigo, '41');
  assert.equal(naLista.numCheck, '41');
  assert.equal(naLista.macAddress, 'AA:BB:CC:DD:EE:03');
  assert.equal('id' in naLista, false);
  console.log('  ✔ atribuído ao evento: aparece na tela atual do buffet com número e MAC');

  r = await chamar(recebimento, 'PATCH', `/${pend.checkpointId}/numero`, admin({ corpo: { numCheck: '15' } }));
  assert.equal(r.status, 409, 'trocar para número que já existe');
  r = await chamar(recebimento, 'PATCH', `/${pend.checkpointId}/numero`, admin({ corpo: { numCheck: '42' } }));
  assert.equal(r.status, 200);
  assert.equal(r.body.numCheck, '42');
  const trocado = await db.queryOne('SELECT checkpointId, codigo FROM pontoVerificacao WHERE checkpointId = @c', { c: pend.checkpointId });
  assert.equal(trocado.checkpointId, pend.checkpointId, 'trocar o número não muda a chave interna');
  assert.equal(trocado.codigo, '42');
  r = await chamar(recebimento, 'PATCH', `/${lista.body[0].checkpointId}/numero`, admin({ corpo: { numCheck: '77' } }));
  assert.equal(r.status, 409, 'checkpoint antigo (sem MAC) não troca de número por aqui');

  r = await chamar(recebimento, 'PATCH', `/${pend.checkpointId}/evento`, admin({ corpo: { eventoId: null } }));
  assert.equal(r.status, 200, 'sem histórico, pode sair do evento');
  assert.equal(r.body.eventoId, null);
  console.log('  ✔ número trocado sem mexer na chave; antigo (sem MAC) protegido');

  // Recusar devolve ao estoque do super admin.
  const z = await criar('AA:BB:CC:DD:EE:04', { nome: 'Teto' });
  r = await transferir(z);
  assert.equal(r.status, 200);
  r = await chamar(recebimento, 'POST', `/cp-${z.id}/recusar`, admin({ empresaId: 'outro-buffet' }));
  assert.equal(r.status, 404);
  r = await chamar(recebimento, 'POST', `/cp-${z.id}/recusar`, admin());
  assert.equal(r.status, 200);
  r = await chamar(router, 'GET', `/?statusTransferencia=estoque`);
  const devolvido = r.body.find((c) => Number(c.id) === Number(z.id));
  assert.ok(devolvido && devolvido.empresaDestinoId === null, 'recusado volta ao estoque sem destino');
  r = await chamar(recebimento, 'POST', `/cp-${z.id}/recusar`, admin());
  assert.equal(r.status, 404, 'já não é pendente deste buffet');
  console.log('  ✔ recusar devolve ao estoque');

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
  const cols = await db.allQuery(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = 'pontoVerificacao'
       AND column_name IN ('id', 'numCheck', 'macAddress', 'statusTransferencia', 'empresaDestinoId', 'transferidoEm')`
  );
  const n = await db.queryOne('SELECT COUNT(*) AS n FROM "pontoVerificacao"');
  console.log(`🔎 Depois do ensaio: ${cols.length} coluna(s) nova(s) no banco (esperado 0 se a migração ainda não rodou de verdade) · ${n.n} checkpoints`);
}
