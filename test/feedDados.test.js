const test = require('node:test');
const assert = require('node:assert/strict');
const { topicosDaRota, criarEmissor, enviarParaCanal, checkpointDaRequisicao, JANELA_MS } = require('../utils/feedDados');

test('cada parte da API vira o assunto certo (e o que depende dele vem junto)', () => {
  assert.deepEqual(topicosDaRota('/master/checkpoints/12/transferir'), ['checkpoints']);
  assert.deepEqual(topicosDaRota('/pontoVerificacao/recebimento/12/aceitar'), ['checkpoints']);
  assert.deepEqual(topicosDaRota('/pontoVerificacao/evento/ev1/12'), ['checkpoints']);
  assert.ok(topicosDaRota('/clientes/abc').includes('checkpoints'), 'apagar cliente mexe nos checkpoints');
  assert.ok(topicosDaRota('/clientes/abc').includes('eventos'));
  assert.deepEqual(topicosDaRota('/brincadeiras/x'), ['jogos']);
  assert.ok(topicosDaRota('/criancas').includes('times'));
  assert.ok(topicosDaRota('/leituras').includes('criancas'));
  assert.deepEqual(topicosDaRota('/auth/login'), [], 'login não avisa ninguém');
  assert.deepEqual(topicosDaRota('/qualquer-coisa-nova'), ['outros']);
});

test('checkpointDaRequisicao acha o checkpoint no caminho ou no corpo', () => {
  assert.equal(checkpointDaRequisicao({ body: {} }, '/master/checkpoints/12/transferir'), '12');
  assert.equal(checkpointDaRequisicao({ body: {} }, '/pontoVerificacao/recebimento/33/devolver'), '33');
  assert.equal(checkpointDaRequisicao({ body: {} }, '/pontoVerificacao/77/heartbeat'), '77');
  assert.equal(checkpointDaRequisicao({ body: { checkpointId: '5' } }, '/leituras'), '5');
  assert.equal(checkpointDaRequisicao({ body: {} }, '/pontoVerificacao/evento/ev1/12'), '12');
});

test('várias mudanças seguidas viram um aviso só', async () => {
  const enviados = [];
  const emitir = criarEmissor((t, e) => enviados.push({ t, e }));
  emitir(['checkpoints'], ['a']);
  emitir(['checkpoints'], ['a']);
  emitir(['checkpoints'], ['a']);
  emitir(['jogos'], ['a']);
  assert.equal(enviados.length, 0, 'ainda esperando a janela');
  await new Promise((r) => setTimeout(r, JANELA_MS + 80));
  assert.equal(enviados.length, 2);
});

test('o master recebe tudo; cada buffet só recebe o que é dele', () => {
  const recebidos = {};
  const cliente = (nome, user, companyId, canalDados = true) => ({ readyState: 1, canalDados, user, companyId, send: (m) => { (recebidos[nome] ||= []).push(JSON.parse(m)); } });
  const wss = { clients: new Set([
    cliente('master', { role: 'master' }, 'm1'),
    cliente('buffetA', { role: 'admin' }, 'A'),
    cliente('buffetB', { role: 'admin' }, 'B'),
    cliente('telao', { role: 'admin' }, 'A', false),
  ]) };
  enviarParaCanal(wss, ['checkpoints'], ['A']);
  assert.equal(recebidos.master.length, 1);
  assert.equal(recebidos.buffetA.length, 1);
  assert.equal(recebidos.buffetB, undefined, 'outro buffet não recebe');
  assert.equal(recebidos.telao, undefined, 'só quem está no canal de dados recebe');
  assert.deepEqual(recebidos.buffetA[0].topicos, ['checkpoints']);
  assert.equal(recebidos.buffetA[0].type, 'DADOS_ALTERADOS');
});
