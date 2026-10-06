// utils/parallelObjects.js - Lista de objetos da brincadeira paralela "Ache o objeto" (por empresa)
const { v4: uuidv4 } = require('uuid');
const { query, queryOne, allQuery } = require('../database');
const { DEFAULT_OBJECTS, normalizeObjectName, sameName } = require('./parallelObjectsRules');

function httpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

const serialize = (row) => ({ id: row.id, name: row.name });

// A primeira vez que a empresa usa a brincadeira, ganha a lista inicial. Objetos removidos continuam na
// tabela (status 'removed'), então apagar tudo não faz a lista inicial voltar sozinha.
async function ensureDefaultObjects(empresaId) {
  const existing = await queryOne('SELECT COUNT(*) AS total FROM objetoBrincadeiraParalela WHERE empresaId = @empresaId', { empresaId });
  if (Number(existing?.total) > 0) return;
  for (const name of DEFAULT_OBJECTS) {
    await query(
      `INSERT INTO objetoBrincadeiraParalela (id, empresaId, nome, status) VALUES (@id, @empresaId, @name, 'active')`,
      { id: uuidv4(), empresaId, name }
    );
  }
}

async function listObjects(empresaId) {
  await ensureDefaultObjects(empresaId);
  const rows = await allQuery(
    `SELECT id, nome FROM objetoBrincadeiraParalela WHERE empresaId = @empresaId AND status = 'active' ORDER BY criadoEm, nome`,
    { empresaId }
  );
  return rows.map(serialize);
}

async function assertNameFree(empresaId, name, exceptId = null) {
  const rows = await allQuery(
    `SELECT id, nome FROM objetoBrincadeiraParalela WHERE empresaId = @empresaId AND status = 'active'`,
    { empresaId }
  );
  if (rows.some((row) => row.id !== exceptId && sameName(row.name, name))) {
    throw httpError('Este objeto já está na lista', 409);
  }
}

async function addObject(empresaId, rawName) {
  const normalized = normalizeObjectName(rawName);
  if (normalized.error) throw httpError(normalized.error, 400);
  await ensureDefaultObjects(empresaId);
  await assertNameFree(empresaId, normalized.name);
  const id = uuidv4();
  await query(
    `INSERT INTO objetoBrincadeiraParalela (id, empresaId, nome, status) VALUES (@id, @empresaId, @name, 'active')`,
    { id, empresaId, name: normalized.name }
  );
  return { id, name: normalized.name };
}

async function findOwned(empresaId, id) {
  const row = await queryOne(
    `SELECT id, nome FROM objetoBrincadeiraParalela WHERE id = @id AND empresaId = @empresaId AND status = 'active'`,
    { id, empresaId }
  );
  if (!row) throw httpError('Objeto não encontrado', 404);
  return row;
}

async function renameObject(empresaId, id, rawName) {
  const normalized = normalizeObjectName(rawName);
  if (normalized.error) throw httpError(normalized.error, 400);
  await findOwned(empresaId, id);
  await assertNameFree(empresaId, normalized.name, id);
  await query('UPDATE objetoBrincadeiraParalela SET nome = @name WHERE id = @id AND empresaId = @empresaId', { id, empresaId, name: normalized.name });
  return { id, name: normalized.name };
}

async function removeObject(empresaId, id) {
  await findOwned(empresaId, id);
  await query(`UPDATE objetoBrincadeiraParalela SET status = 'removed' WHERE id = @id AND empresaId = @empresaId`, { id, empresaId });
}

module.exports = { listObjects, addObject, renameObject, removeObject };
