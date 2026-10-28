// debug/ensaio-checkpoint-transferencia.js
// Ensaio da migração e das rotas do super admin contra o banco do .env, tudo dentro de UMA transação que é
// DESFEITA no final (ROLLBACK): nada fica gravado. Usa: node debug/ensaio-checkpoint-transferencia.js
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const db = require('../database');
const { identificarPorMac } = require('../utils/dispositivoMac');

const REVERTER = 'ENSAIO_REVERTIDO';

function chamar(router, metodo, url, { corpo = {}, papel = 'master', empresaId, viaMac = null } = {}) {
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
    const seguir = () => router.handle(req, res, (erro) => (erro ? reject(erro) : resolve({ status: 404, body: null })));
    if (!viaMac) return seguir();
    // Como no app: o middleware enxerga a URL com o prefixo em que o roteador está montado e pode reescrevê-la.
    req.url = viaMac + req.url;
    identificarPorMac(req, res, () => { req.url = req.url.slice(viaMac.length); seguir(); }).catch(reject);
  });
}

async function ensaio() {
  // As rotas usam withTransaction, que abriria outra conexão e confirmaria de verdade. Aqui ele reaproveita a
  // transação do ensaio. Precisa ser trocado ANTES de carregar a rota (ela desestrutura na importação).
  db.withTransaction = async (trabalho) => trabalho({ query: db.query, queryOne: db.queryOne, allQuery: db.allQuery });
  const { ensureCheckpointTransferSchema } = require('../migrations/checkpointTransferencia');
  const { ensureCheckpointIdNumericoSchema } = require('../migrations/checkpointIdNumerico');
  const router = require('../routes/checkpointsMaster');

  const antes = await db.allQuery('SELECT checkpointId, codigo, empresaId FROM pontoVerificacao ORDER BY checkpointId');

  console.log('▶ migrações (1ª vez)');
  await ensureCheckpointTransferSchema();
  await ensureCheckpointIdNumericoSchema();   // a chave vira o id numérico (a lógica fina é testada em ensaio-chave-numerica.js)
  console.log('▶ migrações (2ª vez: têm de ser idempotentes)');
  await ensureCheckpointTransferSchema();
  await ensureCheckpointIdNumericoSchema();

  const linhas = await db.allQuery('SELECT id, checkpointId, codigo, numCheck, macAddress, statusTransferencia, empresaId FROM pontoVerificacao ORDER BY id');
  assert.equal(linhas.length, antes.length, 'a migração não pode criar nem apagar linhas');
  for (const l of linhas) {
    assert.ok(Number.isInteger(Number(l.id)), `id numérico em ${l.id}`);
    assert.equal(l.checkpointId, String(l.id), `a chave é o id, só dígitos (linha ${l.id})`);
  }
  assert.equal(new Set(linhas.map((l) => l.id)).size, linhas.length, 'ids únicos');
  assert.deepEqual(
    linhas.map((l) => l.empresaId).sort(),
    antes.map((l) => l.empresaId).sort(),
    'cada checkpoint segue no mesmo buffet'
  );
  console.log(`  ✔ ${linhas.length} checkpoints: chave = id numérico, mesmos buffets, nenhum some`);

  const empresa = await db.queryOne("SELECT empresaId, nome FROM empresa WHERE empresaId = 'empresa-001'");
  assert.ok(empresa, 'buffet de teste empresa-001 existe');

  console.log('▶ rotas atuais dos checkpoints não podem mudar de formato');
  const legado = require('../routes/checkpoints');
  // Um checkpoint "antigo" (sem MAC, ID digitado) só para o ensaio, criado dentro da transação: não depende dos dados
  // reais, que mudam (checkpoints apagados, aceitos...). Precisa de um evento existente com buffet.
  const eventoLegado = await db.queryOne('SELECT eventoId, empresaId FROM evento WHERE empresaId IS NOT NULL LIMIT 1');
  assert.ok(eventoLegado, 'há um evento para o ensaio usar');
  const NUM_FIX = 'ENS-LEGADO';   // o número que o buffet deu a ele
  const fixLinha = await db.queryOne(
    `INSERT INTO pontoVerificacao (codigo, numCheck, eventoId, empresaId, nome, tipo, proposito)
     VALUES (@n, @n, @e, @emp, 'Legado do ensaio', 'NFC', 'game') RETURNING id, checkpointId`,
    { n: NUM_FIX, e: eventoLegado.eventoId, emp: eventoLegado.empresaId }
  );
  const FIX = fixLinha.checkpointId;   // a chave do checkpoint: o id, gerado pelo banco
  assert.equal(FIX, String(fixLinha.id), 'inserido sem chave: o banco gera o id e a chave iguais');
  const lista = await chamar(legado, 'GET', `/evento/${eventoLegado.eventoId}`, { empresaId: eventoLegado.empresaId });
  assert.equal(lista.status, 200, JSON.stringify(lista.body));
  assert.ok(lista.body.length > 0);
  for (const cp of lista.body) {
    assert.equal('id' in cp, false, 'a lista do buffet não pode trazer o id novo (o frontend usa id como apelido de checkpointId)');
    assert.ok(cp.checkpointId && cp.codigo, 'continua trazendo checkpointId e codigo');
  }
  const cfg = await chamar(legado, 'GET', `/${FIX}/config`, { empresaId: eventoLegado.empresaId });
  assert.equal(cfg.status, 200, JSON.stringify(cfg.body));
  assert.equal('id' in cfg.body, false);
  console.log(`  ✔ ${lista.body.length} checkpoint(s) listados sem o id novo; /config também`);

  console.log('▶ rotas do super admin');
  let r = await chamar(router, 'GET', '/', { papel: 'admin' });
  assert.equal(r.status, 403, 'não-master recebe 403');

  r = await chamar(router, 'GET', '/buffets');
  assert.equal(r.status, 200);
  assert.ok(r.body.some((b) => b.empresaId === 'empresa-001'), 'lista os buffets');
  assert.ok(!r.body.some((b) => b.nome === 'Master Admin'), 'sem a conta do master');
  r = await chamar(router, 'GET', '/buffets', { papel: 'admin' });
  assert.equal(r.status, 403);

  r = await chamar(router, 'POST', '/', { corpo: { macAddress: 'xx' } });
  assert.equal(r.status, 400, 'MAC inválido');

  r = await chamar(router, 'POST', '/', { corpo: { macAddress: 'aa-bb-cc-dd-ee-01', numCheck: '15' } });
  assert.equal(r.status, 400, 'o master não define o número do checkpoint');
  assert.match(r.body.error, /admin do buffet/);

  r = await chamar(router, 'POST', '/', { corpo: { macAddress: 'aa-bb-cc-dd-ee-01', nome: 'Entrada' } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const a = r.body;
  assert.equal(a.macAddress, 'AA:BB:CC:DD:EE:01');
  assert.equal(a.statusTransferencia, 'estoque');
  assert.equal(a.empresaId, null);
  assert.equal(a.eventoId, null);
  assert.equal(a.numCheck, null, 'nasce sem número: só o buffet o define');
  assert.ok(Number(a.id) > Math.max(...linhas.map((l) => Number(l.id))), 'id novo é maior que os antigos');
  const chave = await db.queryOne('SELECT checkpointId FROM pontoVerificacao WHERE id = @id', { id: a.id });
  assert.equal(chave.checkpointId, String(a.id), 'a chave é o id');
  assert.match(chave.checkpointId, /^\d+$/, 'só dígitos');
  console.log(`  ✔ cadastrado id ${a.id} (gerado pelo banco, só números), sem número`);

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
  r = await chamar(router, 'PATCH', `/${b.id}`, { corpo: { numCheck: '16' } });
  assert.equal(r.status, 400, 'o master não altera o número');
  r = await chamar(router, 'PATCH', `/${b.id}`, { corpo: { nome: 'Saída' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.nome, 'Saída');
  assert.equal(r.body.numCheck, null);
  r = await chamar(router, 'PATCH', `/${b.id}`, { corpo: {} });
  assert.equal(r.status, 400);
  r = await chamar(router, 'PATCH', '/999999', { corpo: { nome: 'x' } });
  assert.equal(r.status, 404);
  r = await chamar(router, 'PATCH', '/abc', { corpo: { nome: 'x' } });
  assert.equal(r.status, 400);

  r = await chamar(router, 'GET', '/?statusTransferencia=estoque');
  assert.equal(r.status, 200);
  assert.deepEqual(
    r.body.map((x) => Number(x.id)).filter((id) => id === Number(a.id) || id === Number(b.id)),
    [Number(a.id), Number(b.id)],
    'lista o estoque'
  );
  assert.ok(r.body.every((x) => x.statusTransferencia === 'estoque'), 'e só o estoque');

  r = await chamar(router, 'POST', `/${a.id}/transferir`, { corpo: { empresaId: 'nao-existe' } });
  assert.equal(r.status, 404, 'buffet inexistente');
  r = await chamar(router, 'POST', `/${a.id}/transferir`, { corpo: {} });
  assert.equal(r.status, 400);

  {
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
    assert.equal(r.status, 400, 'nem pendente: o número é do buffet');

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
  }

  r = await chamar(router, 'DELETE', `/${a.id}`);
  assert.equal(r.status, 200);
  r = await chamar(router, 'DELETE', `/${a.id}`);
  assert.equal(r.status, 404);

  // Um checkpoint antigo (aceito) não pode ser transferido, excluído nem ter o número mudado pelo master.
  const antigo = await db.queryOne('SELECT id FROM pontoVerificacao WHERE checkpointId = @c', { c: FIX });
  r = await chamar(router, 'POST', `/${antigo.id}/transferir`, { corpo: { empresaId: empresa.empresaId } });
  assert.equal(r.status, 409);
  r = await chamar(router, 'DELETE', `/${antigo.id}`);
  assert.equal(r.status, 409);
  r = await chamar(router, 'PATCH', `/${antigo.id}`, { corpo: { numCheck: '777' } });
  assert.equal(r.status, 400, 'o número não é do master');
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

  const y = await criar('AA:BB:CC:DD:EE:03', { nome: 'Rampa' });
  r = await transferir(y);
  assert.equal(r.status, 200, JSON.stringify(r.body));

  r = await chamar(recebimento, 'GET', '/pendentes', admin());
  assert.equal(r.status, 200);
  const pend = r.body.find((p) => p.macAddress === 'AA:BB:CC:DD:EE:03');
  assert.ok(pend, 'o pendente aparece para o buffet de destino');
  assert.equal(pend.nome, 'Rampa');
  assert.equal(pend.numCheck, null, 'o pendente não traz número: o admin do buffet o define');
  assert.equal(pend.checkpointId, String(y.id));

  r = await chamar(recebimento, 'GET', '/pendentes', admin({ empresaId: 'outro-buffet' }));
  assert.equal(r.body.length, 0, 'outro buffet não vê o pendente');
  r = await chamar(recebimento, 'POST', `/${pend.checkpointId}/aceitar`, admin({ empresaId: 'outro-buffet', corpo: { numCheck: '9' } }));
  assert.equal(r.status, 404, 'outro buffet não aceita o que não é dele');
  r = await chamar(recebimento, 'GET', '/pendentes', { papel: 'master' });
  assert.equal(r.status, 403, 'só o admin do buffet usa estas rotas');

  r = await chamar(recebimento, 'POST', `/${pend.checkpointId}/aceitar`, admin({ corpo: { numCheck: NUM_FIX } }));
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
  const semEventoLinha = r.body.find((c) => c.checkpointId === pend.checkpointId);
  assert.ok(semEventoLinha, 'aceito sem evento aparece em sem-evento');
  for (const campo of ['nome', 'tipo', 'macAddress', 'numCheck', 'status', 'zona', 'pontos']) {
    assert.ok(campo in semEventoLinha, `a lista sem-evento traz ${campo} (a tabela do buffet precisa)`);
  }
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

  r = await chamar(recebimento, 'PATCH', `/${pend.checkpointId}/numero`, admin({ corpo: { numCheck: NUM_FIX } }));
  assert.equal(r.status, 409, 'trocar para número que já existe');
  r = await chamar(recebimento, 'PATCH', `/${pend.checkpointId}/numero`, admin({ corpo: { numCheck: '42' } }));
  assert.equal(r.status, 200);
  assert.equal(r.body.numCheck, '42');
  const trocado = await db.queryOne('SELECT checkpointId, codigo FROM pontoVerificacao WHERE checkpointId = @c', { c: pend.checkpointId });
  assert.equal(trocado.checkpointId, pend.checkpointId, 'trocar o número não muda a chave interna');
  assert.equal(trocado.codigo, '42');
  // O número é do buffet para qualquer checkpoint aceito, também os sem MAC: a chave é o id e não depende dele.
  r = await chamar(recebimento, 'PATCH', `/${FIX}/numero`, admin({ corpo: { numCheck: '77' } }));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const legadoNum = await db.queryOne('SELECT checkpointId, codigo, numCheck FROM pontoVerificacao WHERE checkpointId = @c', { c: FIX });
  assert.equal(legadoNum.numCheck, '77');
  assert.equal(legadoNum.codigo, '77', 'codigo acompanha o número');
  assert.equal(legadoNum.checkpointId, FIX, 'e a chave não mudou');


  r = await chamar(recebimento, 'PATCH', `/${pend.checkpointId}/evento`, admin({ corpo: { eventoId: null } }));
  assert.equal(r.status, 200, 'sem histórico, pode sair do evento');
  assert.equal(r.body.eventoId, null);
  console.log('  ✔ número trocado sem mexer na chave; antigo (sem MAC) protegido');

  // Recusar devolve ao estoque do super admin.
  const z = await criar('AA:BB:CC:DD:EE:04', { nome: 'Teto' });
  r = await transferir(z);
  assert.equal(r.status, 200);
  r = await chamar(recebimento, 'POST', `/${z.id}/aceitar`, admin({ corpo: {} }));
  assert.equal(r.status, 400, 'aceitar sem o número definido pelo admin do buffet não vale');
  r = await chamar(recebimento, 'POST', `/${z.id}/aceitar`, admin({ corpo: { numCheck: '   ' } }));
  assert.equal(r.status, 400, 'número em branco também não');
  r = await chamar(recebimento, 'POST', `/${z.id}/recusar`, admin({ empresaId: 'outro-buffet' }));
  assert.equal(r.status, 404);
  r = await chamar(recebimento, 'POST', `/${z.id}/recusar`, admin());
  assert.equal(r.status, 200);
  r = await chamar(router, 'GET', `/?statusTransferencia=estoque`);
  const devolvido = r.body.find((c) => Number(c.id) === Number(z.id));
  assert.ok(devolvido && devolvido.empresaDestinoId === null, 'recusado volta ao estoque sem destino');
  r = await chamar(recebimento, 'POST', `/${z.id}/recusar`, admin());
  assert.equal(r.status, 404, 'já não é pendente deste buffet');
  console.log('  ✔ recusar devolve ao estoque');

  // ---------- etapa 3: o ESP32 se identifica pelo MAC ----------
  console.log('▶ ESP32 identificado pelo MAC');
  const MAC = 'AA:BB:CC:DD:EE:05';
  const viaCp = (rota, metodo, url, extra = {}) => chamar(rota, metodo, url, { viaMac: '/pontoVerificacao', ...extra });
  const statusDoBanco = (chave) => db.queryOne('SELECT status, ultimoVisto FROM pontoVerificacao WHERE checkpointId = @c', { c: chave });

  r = await viaCp(legado, 'POST', '/AA:BB:CC:DD:EE:99/heartbeat');
  assert.equal(r.status, 404, 'MAC desconhecido');
  assert.equal(r.body.mac, 'AA:BB:CC:DD:EE:99');

  const d = await criar(MAC, { nome: 'Portal' });
  const chaveD = String(d.id);
  r = await viaCp(legado, 'POST', `/${MAC}/heartbeat`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.statusTransferencia, 'estoque');
  assert.equal(r.body.numCheck, null);
  assert.equal((await statusDoBanco(chaveD)).status, 'online', 'em estoque o heartbeat marca online (o master vê o aparelho)');
  r = await viaCp(legado, 'POST', `/${MAC.toLowerCase()}/heartbeat`);
  assert.equal(r.status, 200, 'MAC em minúsculas também');
  r = await viaCp(legado, 'GET', `/${MAC}/territory`);
  assert.equal(r.status, 409, 'em estoque não lê território');
  assert.equal(r.body.statusTransferencia, 'estoque');
  console.log('  ✔ MAC desconhecido = 404; em estoque só o heartbeat passa');

  r = await transferir(d);
  assert.equal(r.status, 200);
  r = await viaCp(legado, 'GET', `/${MAC}/territory`);
  assert.equal(r.status, 409);
  assert.equal(r.body.statusTransferencia, 'pendente');

  r = await chamar(recebimento, 'POST', `/${chaveD}/aceitar`, admin({ corpo: { numCheck: '60' } }));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  r = await viaCp(legado, 'GET', `/${MAC}/territory`);
  assert.equal(r.status, 409, 'aceito mas sem evento');
  assert.match(r.body.error, /evento/);
  let respModo = null;
  const resModo = { status(c) { this.c = c; return this; }, json(b) { respModo = { status: this.c, body: b }; return this; } };
  await identificarPorMac({ method: 'GET', url: '/debug/checkpoint-mode?checkpointId=' + MAC, body: undefined, query: { checkpointId: MAC } }, resModo, () => {});
  assert.equal(respModo.status, 200, 'aceito sem evento: a consulta de modo responde parado, não 409');
  assert.equal(respModo.body.mode, 'idle');
  r = await chamar(recebimento, 'PATCH', `/${chaveD}/evento`, admin({ corpo: { eventoId: eventoLegado.eventoId } }));
  assert.equal(r.status, 200);

  r = await viaCp(legado, 'GET', `/${MAC}/territory`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.checkpointId, chaveD, 'a rota recebeu a chave interna no lugar do MAC');
  r = await viaCp(legado, 'POST', `/${MAC}/heartbeat`);
  assert.equal(r.status, 200);
  assert.equal(r.body.numCheck, '60', 'o heartbeat devolve o número que o buffet deu');
  assert.equal(r.body.statusTransferencia, 'aceito');
  console.log('  ✔ pendente e sem evento = 409; aceito com evento = rotas normais, com o número de volta no heartbeat');

  // Trocar o número no buffet não muda a identidade do aparelho: o MAC continua chegando no mesmo checkpoint.
  r = await chamar(recebimento, 'PATCH', `/${chaveD}/numero`, admin({ corpo: { numCheck: '61' } }));
  assert.equal(r.status, 200);
  r = await viaCp(legado, 'POST', `/${MAC}/heartbeat`);
  assert.equal(r.body.numCheck, '61', 'renumerar na tela vale na hora para o aparelho, sem mexer nele');

  // Corpo (leituras e jogos) e query (modo do checkpoint): o MAC no lugar do ID também é traduzido.
  const reescrever = async (req) => {
    let seguiu = false;
    let resp = null;
    const res = { status(c) { this.c = c; return this; }, json(b) { resp = { status: this.c, body: b }; return this; } };
    await identificarPorMac(req, res, () => { seguiu = true; });
    return { seguiu, resp, req };
  };
  let t = await reescrever({ url: '/leituras', body: { checkpointId: MAC, uid: 'X' }, query: {} });
  assert.equal(t.seguiu, true);
  assert.equal(t.req.body.checkpointId, chaveD, 'corpo: MAC trocado pela chave');
  assert.equal(t.req.body.uid, 'X');
  t = await reescrever({ url: '/debug/checkpoint-mode?checkpointId=' + MAC, body: undefined, query: { checkpointId: MAC } });
  assert.equal(t.req.query.checkpointId, chaveD, 'query: MAC trocado pela chave');
  t = await reescrever({ url: '/leituras', body: { checkpointId: '15', uid: 'X' }, query: {} });
  assert.equal(t.req.body.checkpointId, '15', 'ID antigo no corpo segue intacto');
  t = await reescrever({ url: '/leituras', body: { checkpointId: 'AA:BB:CC:DD:EE:77', uid: 'X' }, query: {} });
  assert.equal(t.seguiu, false);
  assert.equal(t.resp.status, 404, 'corpo com MAC desconhecido');
  await criar('AA:BB:CC:DD:EE:06');
  t = await reescrever({ url: '/leituras', body: { checkpointId: 'AA:BB:CC:DD:EE:06', uid: 'X' }, query: {} });
  assert.equal(t.resp.status, 409, 'leitura de quem está em estoque é recusada');
  console.log('  ✔ corpo e query traduzidos; ID antigo intacto; MAC desconhecido e estoque recusados');

  // O buffet "exclui" um checkpoint com MAC: ele não é apagado, volta ao estoque do super admin.
  r = await chamar(legado, 'DELETE', `/evento/${eventoLegado.eventoId}/${chaveD}`, { empresaId: buffet });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.devolvido, true);
  const devolvido2 = await db.queryOne('SELECT * FROM pontoVerificacao WHERE checkpointId = @c', { c: chaveD });
  assert.ok(devolvido2, 'o registro do aparelho continua existindo');
  assert.equal(devolvido2.macAddress, MAC, 'com o MAC');
  assert.equal(devolvido2.statusTransferencia, 'estoque');
  for (const campo of ['empresaId', 'eventoId', 'numCheck', 'codigo', 'empresaDestinoId']) {
    assert.equal(devolvido2[campo], null, `${campo} zerado ao devolver`);
  }
  r = await viaCp(legado, 'GET', `/${MAC}/territory`);
  assert.equal(r.status, 409, 'devolvido: o aparelho volta a só mandar heartbeat');
  r = await chamar(router, 'POST', `/${devolvido2.id}/transferir`, { corpo: { empresaId: buffet } });
  assert.equal(r.status, 200, 'e o super admin pode transferi-lo de novo');
  console.log('  ✔ excluir um checkpoint com MAC o devolve ao estoque, sem apagar o aparelho');

  // Checkpoint antigo: o super admin grava o MAC nele e ele passa a responder por MAC, com a mesma chave de sempre.
  const velho = await db.queryOne('SELECT id, checkpointId FROM pontoVerificacao WHERE checkpointId = @c', { c: FIX });
  r = await chamar(router, 'PATCH', `/${velho.id}`, { corpo: { macAddress: 'AA:BB:CC:DD:EE:15' } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  r = await viaCp(legado, 'GET', '/AA:BB:CC:DD:EE:15/territory');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.checkpointId, velho.checkpointId, 'o antigo continua com a chave dele');
  r = await chamar(legado, 'GET', `/${velho.checkpointId}/territory`);
  assert.equal(r.status, 200, 'e continua respondendo pelo ID antigo');
  console.log('  ✔ checkpoint antigo: MAC gravado pelo master, responde por MAC e pelo ID de antes');

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
