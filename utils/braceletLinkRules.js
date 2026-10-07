/**
 * Regras do vínculo família -> criança pela PULSEIRA (NFC), isoladas da rota para
 * poderem ser testadas sem banco de dados.
 *
 * O UID de uma pulseira é público e nunca muda (diferente do QR Code, que expira e
 * só vale uma vez). Por isso este caminho é mais restrito que o do QR:
 *  - só vale para pulseira EM USO por uma criança da MESMA empresa do responsável;
 *  - o evento da criança precisa estar aberto;
 *  - há limite de tentativas por responsável;
 *  - o vínculo nasce 'pending' e a recepção continua aprovando (igual ao QR).
 */
const { normalizeUid } = require('./uid');

// Mesmos estados de encerramento de utils/eventLifecycle.js (não importado aqui para
// manter este arquivo livre de banco de dados).
const CLOSED_EVENT_STATUSES = new Set(['finished', 'completed', 'cancelled', 'canceled']);

// NFC usa UIDs de 4, 7 ou 10 bytes (8, 14 ou 20 caracteres hexadecimais).
const VALID_UID_LENGTHS = new Set([8, 14, 20]);

const MAX_ATTEMPTS = 10;
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;

/**
 * @param {unknown} value UID como o app enviou (com ou sem ':' / espaços, qualquer caixa)
 * @returns {{ uid: string } | { error: string, code: 'INVALID_BRACELET' }}
 */
function parseBraceletUid(value) {
  const uid = normalizeUid(value);
  if (!VALID_UID_LENGTHS.has(uid.length)) {
    return { error: 'Não foi possível ler esta pulseira. Tente novamente.', code: 'INVALID_BRACELET' };
  }
  return { uid };
}

/**
 * Decide se a pulseira encontrada pode ser vinculada. A resposta de "não pode" é
 * sempre a mesma, para não revelar se um código existe, é de outra empresa ou está livre.
 *
 * @param {{ status?: string, criancaId?: string|null, evento_status?: string|null, eventoId?: string|null } | null} row
 * @returns {{ ok: true } | { ok: false, code: 'BRACELET_NOT_AVAILABLE', error: string }}
 */
function checkBraceletLinkable(row) {
  const notAvailable = {
    ok: false,
    code: 'BRACELET_NOT_AVAILABLE',
    error: 'Pulseira não encontrada ou sem criança vinculada neste evento.',
  };

  if (!row) return notAvailable;
  if (String(row.status || '').trim().toLowerCase() !== 'em_uso') return notAvailable;
  if (!row.criancaId) return notAvailable;
  if (!row.eventoId) return notAvailable;

  const eventStatus = String(row.evento_status || 'scheduled').trim().toLowerCase();
  if (CLOSED_EVENT_STATUSES.has(eventStatus)) return notAvailable;

  return { ok: true };
}

/**
 * Limite de tentativas por chave (id do responsável). Em memória: vale por instância
 * do servidor, o que basta para barrar adivinhação de códigos.
 */
function createAttemptLimiter({ max = MAX_ATTEMPTS, windowMs = ATTEMPT_WINDOW_MS, now = Date.now } = {}) {
  const attempts = new Map(); // chave -> timestamps recentes

  return {
    /** Registra uma tentativa e diz se ela é permitida. */
    hit(key) {
      const current = now();
      const recent = (attempts.get(key) || []).filter((time) => current - time < windowMs);

      if (recent.length >= max) {
        attempts.set(key, recent);
        const retryAfterSec = Math.max(1, Math.ceil((recent[0] + windowMs - current) / 1000));
        return { allowed: false, retryAfterSec };
      }

      recent.push(current);
      attempts.set(key, recent);
      return { allowed: true, retryAfterSec: 0 };
    },
  };
}

module.exports = {
  CLOSED_EVENT_STATUSES,
  MAX_ATTEMPTS,
  ATTEMPT_WINDOW_MS,
  parseBraceletUid,
  checkBraceletLinkable,
  createAttemptLimiter,
};
