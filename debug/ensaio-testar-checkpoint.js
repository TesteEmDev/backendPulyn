// Ensaio da rota POST /api/pontoVerificacao/:id/testar com o banco trocado por um falso (nada é gravado).
// Uso: node debug/ensaio-testar-checkpoint.js
const path = require('path');
const assert = require('node:assert/strict');
const http = require('http');
const jwt = require('jsonwebtoken');
const express = require('express');

let linha = null; // o que o "banco" devolve
const bancoFalso = { queryOne: async () => linha, query: async () => ({}), allQuery: async () => [] };
const caminhoBanco = require.resolve(path.join(__dirname, '..', 'database'));
require.cache[caminhoBanco] = { id: caminhoBanco, filename: caminhoBanco, loaded: true, exports: bancoFalso };

const comandos = require('../utils/comandosCheckpoint');
const rotas = require('../routes/checkpoints');
const segredo = process.env.JWT_SECRET || 'sua-chave-secreta-super-segura-2026';
const token = (role) => jwt.sign({ role, empresaId: 'empresa-x' }, segredo);

const app = express();
app.use(express.json());
app.use('/api/pontoVerificacao', rotas);

async function pedir(porta, id, role, corpo) {
  const res = await fetch(`http://127.0.0.1:${porta}/api/pontoVerificacao/${id}/testar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(role ? { Authorization: `Bearer ${token(role)}` } : {}) },
    body: JSON.stringify(corpo),
  });
  return { status: res.status, corpo: await res.json() };
}

const servidor = http.createServer(app).listen(0, async () => {
  const porta = servidor.address().port;
  try {
    let r = await pedir(porta, '5', null, { tipo: 'led' });
    assert.equal(r.status, 401, 'sem token');
    r = await pedir(porta, '5', 'reception', { tipo: 'led' });
    assert.equal(r.status, 403, 'só admin');
    r = await pedir(porta, '5', 'admin', { tipo: 'fogo' });
    assert.equal(r.status, 400, 'tipo inválido');
    linha = null;
    r = await pedir(porta, '5', 'admin', { tipo: 'led' });
    assert.equal(r.status, 404, 'não é do buffet');
    linha = { checkpointId: '5', eventoId: null, ultimoVisto: new Date() };
    r = await pedir(porta, '5', 'admin', { tipo: 'led' });
    assert.equal(r.status, 409, 'sem evento');
    linha = { checkpointId: '5', eventoId: 'ev-1', ultimoVisto: new Date(Date.now() - 10 * 60 * 1000) };
    r = await pedir(porta, '5', 'admin', { tipo: 'led' });
    assert.equal(r.status, 409, 'offline');
    assert.equal(comandos.retirar('5'), null, 'recusado não entra na fila');
    linha = { checkpointId: '5', eventoId: 'ev-1', ultimoVisto: new Date() };
    r = await pedir(porta, '5', 'admin', { tipo: 'som' });
    assert.equal(r.status, 200);
    assert.equal(r.corpo.tipo, 'som');
    assert.equal(comandos.retirar('5'), 'som');
    assert.equal(comandos.retirar('5'), null);
    console.log('OK: 401, 403, 400, 404, 409 (sem evento), 409 (offline) e 200 com o comando na fila');
  } catch (e) {
    console.error('FALHOU:', e.message);
    process.exitCode = 1;
  } finally {
    servidor.close();
  }
});
