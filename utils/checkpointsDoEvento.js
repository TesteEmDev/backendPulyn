// utils/checkpointsDoEvento.js - Checkpoints são do buffet e passam por vários eventos
//
// Enquanto o evento acontece, o checkpoint fica nele (pontoVerificacao.eventoId). Ao encerrar o evento (ou ao mudar o
// checkpoint de evento) o vínculo é desfeito, como nas pulseiras, e fica registrado em eventoCheckpoint quais
// checkpoints o evento usou. Reabrir o evento devolve os que continuam livres.
const { v4: uuidv4 } = require('uuid');
const { query, allQuery, withTransaction } = require('../database');

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
       ON CONFLICT (eventoId, checkpointId) DO UPDATE SET numCheck = EXCLUDED.numCheck, nome = EXCLUDED.nome`,
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

// Checkpoints do evento: os que estão nele agora e os que já passaram por ele. `noEvento` diz se ainda estão nele.
async function listarCheckpointsDoEvento(eventoId, empresaId) {
  const atuais = await allQuery(
    `SELECT checkpointId, numCheck, nome, zona, status, ultimoVisto
     FROM pontoVerificacao
     WHERE LOWER(eventoId) = LOWER(@eventoId) AND empresaId = @empresaId
       AND LOWER(COALESCE(proposito, 'game')) <> 'reception'`,
    { eventoId, empresaId }
  );
  const historico = await allQuery(
    `SELECT h.checkpointId, COALESCE(p.numCheck, h.numCheck) AS numCheck, COALESCE(p.nome, h.nome) AS nome,
            p.zona, p.eventoId AS eventoAtualId
     FROM eventoCheckpoint h
     LEFT JOIN pontoVerificacao p ON p.checkpointId = h.checkpointId
     WHERE LOWER(h.eventoId) = LOWER(@eventoId) AND h.empresaId = @empresaId
       AND LOWER(COALESCE(p.proposito, 'game')) <> 'reception'`,
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
  restaurarCheckpointsDoEvento, listarCheckpointsDoEvento,
};
