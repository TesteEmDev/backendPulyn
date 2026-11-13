// utils/checkpointsDoEvento.js - Checkpoints são do buffet e passam por vários eventos
//
// Enquanto o evento acontece, o checkpoint fica nele (pontoVerificacao.eventoId). Ao encerrar o evento (ou ao mudar o
// checkpoint de evento) o vínculo é desfeito, como nas pulseiras, e fica registrado em eventoCheckpoint quais
// checkpoints o evento usou. Reabrir o evento devolve os que continuam livres.
const { v4: uuidv4 } = require('uuid');
const { query, queryOne, allQuery, withTransaction } = require('../database');
const { statusEfetivo } = require('./statusCheckpoint');

// Guarda (ou atualiza) os checkpoints que estão neste evento agora.
async function registrarUsoDosCheckpoints(db, eventoId) {
  const atuais = await db.query(
    `SELECT checkpointId, empresaId, numCheck, nome FROM pontoVerificacao WHERE LOWER(eventoId) = LOWER(@eventoId)`,
    { eventoId }
  );
  const linhas = atuais?.recordset || atuais?.rows || [];
  for (const cp of linhas) {
    await db.query(
      `INSERT INTO eventoCheckpoint (id, empresaId, eventoId, checkpointId, numCheck, nome)
       VALUES (@id, @empresaId, @eventoId, @checkpointId, @numCheck, @nome)
       ON CONFLICT (eventoId, checkpointId) DO UPDATE SET numCheck = EXCLUDED.numCheck, nome = EXCLUDED.nome, usadoEm = CURRENT_TIMESTAMP`,
      { id: uuidv4(), empresaId: cp.empresaId || null, eventoId, checkpointId: cp.checkpointId, numCheck: cp.numCheck ?? null, nome: cp.nome ?? null }
    );
  }
  return linhas.length;
}

// Tira os checkpoints do evento (ficam livres para o próximo) depois de registrar o uso. O território conquistado acaba.
async function liberarCheckpointsDoEvento(db, eventoId) {
  const registrados = await registrarUsoDosCheckpoints(db, eventoId);
  await db.query(
    `UPDATE pontoVerificacao
     SET eventoId = NULL, territorioDonoTimeId = NULL, territorioDonosCriancaId = NULL,
         territorioTravadoAte = NULL, territorioCooldownAte = NULL, ultimoConquistadoEm = NULL
     WHERE LOWER(eventoId) = LOWER(@eventoId)`,
    { eventoId }
  );
  return { checkpointsLiberados: registrados };
}

const liberarCheckpointsParaEvento = (eventoId) => withTransaction((tx) => liberarCheckpointsDoEvento(tx, eventoId));

// Reabrir o evento: volta para ele os checkpoints que usou e que continuam livres (não foram para outro evento).
async function restaurarCheckpointsDoEvento(eventoId) {
  const r = await query(
    `UPDATE pontoVerificacao SET eventoId = @eventoId
     WHERE eventoId IS NULL
       AND checkpointId IN (SELECT checkpointId FROM eventoCheckpoint WHERE LOWER(eventoId) = LOWER(@eventoId))`,
    { eventoId }
  );
  return Number(r?.rowsAffected?.[0] || 0);
}

const SQL_ENTRAR = `UPDATE pontoVerificacao
   SET eventoId = @eventoId, atualizadoEm = now(),
       territorioDonoTimeId = NULL, territorioDonosCriancaId = NULL,
       territorioTravadoAte = NULL, territorioCooldownAte = NULL, ultimoConquistadoEm = NULL
   WHERE checkpointId = @checkpointId`;

// Um evento que começa leva todos os checkpoints do buffet que estão LIGADOS e livres (sem evento, ou ainda presos a um
// evento que já terminou). Os desligados não entram, e os que estão em outro evento em andamento ficam onde estão.
async function trazerCheckpointsParaEvento(eventoId, empresaId) {
  const livres = await allQuery(
    `SELECT p.checkpointId, p.status, p.ultimoVisto
     FROM pontoVerificacao p LEFT JOIN evento e ON e.eventoId = p.eventoId
     WHERE p.empresaId = @empresaId AND p.macAddress IS NOT NULL AND p.statusTransferencia = 'aceito'
       AND (p.eventoId IS NULL OR LOWER(COALESCE(e.status, '')) IN ('finished', 'completed', 'cancelled', 'canceled'))`,
    { empresaId }
  );
  const ligados = livres.filter((cp) => statusEfetivo(cp.status, cp.ultimoVisto) === 'online');
  for (const cp of ligados) await query(SQL_ENTRAR, { eventoId, checkpointId: cp.checkpointId });
  if (ligados.length > 0) await registrarUsoDosCheckpoints({ query }, eventoId);
  return ligados.length;
}

// Um checkpoint que liga com um evento em andamento e sem evento entra nele (heartbeat). Devolve true se entrou.
async function entrarNoEventoAtivo(checkpoint) {
  if (checkpoint.eventoId || !checkpoint.empresaId || !checkpoint.macAddress) return false;
  const evento = await queryOne(
    `SELECT eventoId FROM evento
     WHERE empresaId = @empresaId AND LOWER(COALESCE(status, '')) = 'active'
     ORDER BY iniciadoEm DESC LIMIT 1`,
    { empresaId: checkpoint.empresaId }
  );
  if (!evento) return false;
  await query(SQL_ENTRAR, { eventoId: evento.eventoId, checkpointId: checkpoint.checkpointId });
  await registrarUsoDosCheckpoints({ query }, evento.eventoId);
  return true;
}

// Checkpoints do evento: os que estão nele agora e os que já passaram por ele. `noEvento` diz se ainda estão nele.
async function listarCheckpointsDoEvento(eventoId, empresaId) {
  const atuais = await allQuery(
    `SELECT checkpointId, numCheck, nome, zona, status, ultimoVisto
     FROM pontoVerificacao
     WHERE LOWER(eventoId) = LOWER(@eventoId) AND empresaId = @empresaId
       AND LOWER(COALESCE(proposito, 'game')) = 'game'`,
    { eventoId, empresaId }
  );
  const historico = await allQuery(
    `SELECT h.checkpointId, COALESCE(p.numCheck, h.numCheck) AS numCheck, COALESCE(p.nome, h.nome) AS nome,
            p.zona, p.eventoId AS eventoAtualId
     FROM eventoCheckpoint h
     LEFT JOIN pontoVerificacao p ON p.checkpointId = h.checkpointId
     WHERE LOWER(h.eventoId) = LOWER(@eventoId) AND h.empresaId = @empresaId
       AND LOWER(COALESCE(p.proposito, 'game')) = 'game'`,
    { eventoId, empresaId }
  );
  const vistos = new Set(atuais.map((cp) => String(cp.checkpointId).toLowerCase()));
  const lista = [
    ...atuais.map((cp) => ({ checkpointId: cp.checkpointId, numero: cp.numCheck, nome: cp.nome, zona: cp.zona || null, noEvento: true })),
    ...historico.filter((cp) => !vistos.has(String(cp.checkpointId).toLowerCase()))
      .map((cp) => ({ checkpointId: cp.checkpointId, numero: cp.numCheck, nome: cp.nome, zona: cp.zona || null, noEvento: false })),
  ];
  return lista.sort((a, b) => (Number(a.numero) || 1e9) - (Number(b.numero) || 1e9) || String(a.nome).localeCompare(String(b.nome)));
}

module.exports = {
  registrarUsoDosCheckpoints, liberarCheckpointsDoEvento, liberarCheckpointsParaEvento,
  restaurarCheckpointsDoEvento, listarCheckpointsDoEvento, trazerCheckpointsParaEvento, entrarNoEventoAtivo,
};
