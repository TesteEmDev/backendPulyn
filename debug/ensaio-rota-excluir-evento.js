// Ensaio da rota DELETE /api/eventos/:id com o banco e a exclusão trocados por falsos (nada é gravado).
// Uso: node debug/ensaio-rota-excluir-evento.js
const path = require('path');
const assert = require('node:assert/strict');
const http = require('http');
const jwt = require('jsonwebtoken');
const express = require('express');

let linha = null;
const apagados = [];
const stub = (modulo, exports) => {
  const caminho = require.resolve(path.join(__dirname, '..', modulo));
  require.cache[caminho] = { id: caminho, filename: caminho, loaded: true, exports };
};
const banco = require('../database');
stub('database', { ...banco, queryOne: async () => linha });
stub('utils/apagarEvento', { apagarEvento: async (id) => { apagados.push(id); return { participantesApagados: 2, timesApagados: 1, pulseirasLiberadas: 1, checkpointsLiberados: 0 }; } });

const rotas = require('../routes/events');
const segredo = process.env.JWT_SECRET || 'sua-chave-secreta-super-segura-2026';
const token = (role, empresaId = 'emp-1') => jwt.sign({ role, empresaId }, segredo);
const app = express();
app.use(express.json());
app.use('/api/eventos', rotas);

const apagar = async (porta, id, role, empresaId) => {
  const res = await fetch(`http://127.0.0.1:${porta}/api/eventos/${id}`, {
    method: 'DELETE', headers: role ? { Authorization: `Bearer ${token(role, empresaId)}` } : {},
  });
  return { status: res.status, corpo: await res.json() };
};

const servidor = http.createServer(app).listen(0, async () => {
  const porta = servidor.address().port;
  try {
    assert.equal((await apagar(porta, 'e1', null)).status, 401, 'sem token');
    assert.equal((await apagar(porta, 'e1', 'reception', 'emp-1')).status, 403, 'só admin');
    linha = null;
    assert.equal((await apagar(porta, 'e1', 'admin', 'emp-1')).status, 404, 'não existe');
    linha = { eventoId: 'e1', empresaId: 'emp-2', status: 'finished' };
    assert.equal((await apagar(porta, 'e1', 'admin', 'emp-1')).status, 403, 'evento de outro buffet');
    linha = { eventoId: 'e1', empresaId: 'emp-1', status: 'active' };
    assert.equal((await apagar(porta, 'e1', 'admin', 'emp-1')).status, 409, 'ativo não se exclui');
    assert.equal(apagados.length, 0, 'recusados não apagam nada');
    linha = { eventoId: 'e1', empresaId: 'emp-1', status: 'finished' };
    const r = await apagar(porta, 'e1', 'admin', 'emp-1');
    assert.equal(r.status, 200);
    assert.equal(r.corpo.deleted, true);
    assert.equal(r.corpo.resumo.participantesApagados, 2);
    linha = { eventoId: 'e2', empresaId: 'emp-1', status: 'scheduled' };
    assert.equal((await apagar(porta, 'e2', 'admin', 'emp-1')).status, 200, 'agendado também');
    assert.deepEqual(apagados, ['e1', 'e2']);
    console.log('OK: 401, 403 (papel), 404, 403 (outro buffet), 409 (ativo), 200 (encerrado e agendado)');
  } catch (e) {
    console.error('FALHOU:', e.message);
    process.exitCode = 1;
  } finally {
    servidor.close();
    setTimeout(() => process.exit(), 200);
  }
});
