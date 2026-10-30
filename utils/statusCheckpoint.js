// utils/statusCheckpoint.js - Um checkpoint está LIGADO se avisou que está vivo há pouco tempo
//
// O banco guarda status = 'online' quando a placa manda o heartbeat (a cada 60 s) ou uma leitura, mas nada o volta
// para 'offline' quando ela é desligada. Por isso a lista de checkpoints calcula o status na hora de responder:
// online só se o registro diz online E a placa foi vista dentro da janela abaixo.
const ONLINE_ATE_MS = 3 * 60 * 1000; // o heartbeat chega a cada 60 s: tolera duas falhas seguidas

function statusEfetivo(status, ultimoVisto, agora = Date.now()) {
  if (String(status || '').trim().toLowerCase() !== 'online') return 'offline';
  const visto = ultimoVisto ? new Date(ultimoVisto).getTime() : NaN;
  return Number.isFinite(visto) && agora - visto <= ONLINE_ATE_MS ? 'online' : 'offline';
}

module.exports = { ONLINE_ATE_MS, statusEfetivo };
