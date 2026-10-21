// utils/uhfLote.js - Lote de leituras enviado pelos leitores UHF (Chainway UR4)
//
// Cada leitor fecha um ciclo a cada 1 s e manda um lote por ciclo (1 por segundo) com o resumo por (pulseira, porta):
// em quantos ciclos ela apareceu (n), a média do melhor RSSI de cada ciclo e o maior RSSI. Sem rede (ou com o envio
// atrasado) o leitor junta mais ciclos num lote só; `ciclos` diz quantos.
// O servidor soma os lotes em janelas de 5 s (balde): amostraUhf por (pulseira, antena) e loteUhf.ciclos por leitor,
// que é o total de ciclos da janela (a presença é n / esse total).
// A tag é guardada como o EPC sem zeros à esquerda (codigoDoEpc). Qual pulseira ela é vem de `pulseira.epc`
// (vínculo feito em /admin/uhf, ex.: ABCABC000000000000000010) ou, no padrão antigo, do próprio código NFC
// completado com zeros à esquerda até 24 hex.
// Funções puras: o acesso ao banco fica em routes/uhf.js.
const crypto = require('crypto');
const { normalizeUid } = require('./uid');

const EPC_TAMANHO = 24;
const JANELA_MS = 5000;           // o mapa é recalculado a cada 5 s
const CICLO_MS = 1000;            // um ciclo a cada 1 s
const CICLOS_POR_LOTE = 1;        // um lote por ciclo = 1 lote por segundo
const LIMITE_LEITURAS = 300;      // leituras por lote
const PORTAS = [1, 2, 3, 4];

// EPC lido -> código da pulseira. '' quando não é uma pulseira válida.
function codigoDoEpc(epc) {
  const hex = normalizeUid(epc);
  if (!hex || hex.length > EPC_TAMANHO) return '';
  return hex.replace(/^0+/, '');
}

// Código da pulseira -> EPC para gravar na tag (24 hex com zeros à esquerda).
function epcDoCodigo(codigo) {
  const hex = normalizeUid(codigo);
  if (!hex || hex.length > EPC_TAMANHO) return '';
  return hex.padStart(EPC_TAMANHO, '0');
}

// Início da janela de 5 s que contém `data`.
function baldeDe(data, janelaMs = JANELA_MS) {
  const ms = new Date(data).getTime();
  return new Date(Math.floor(ms / janelaMs) * janelaMs);
}

// Momento do lote: o fim da janela informado pelo leitor (fimEm, epoch ms pelo relógio do servidor, que o leitor
// aprende na resposta) ou a hora da chegada. Assim um lote que ficou no SD sem rede cai na janela em que foi lido.
// fimEm fora de [agora - 24 h, agora + 1 min] é ignorado.
function momentoDoLote(fimEm, agora = new Date()) {
  const ms = Number(fimEm);
  const agoraMs = agora.getTime();
  if (!Number.isFinite(ms) || ms < agoraMs - 24 * 60 * 60 * 1000 || ms > agoraMs + 60 * 1000) return agora;
  return new Date(Math.min(ms, agoraMs));
}

const inteiro = (valor) => (Number.isInteger(Number(valor)) ? Number(valor) : NaN);
const numero = (valor) => (valor === null || valor === '' || valor === undefined ? NaN : Number(valor));

/**
 * Valida o corpo do lote. Devolve { erro } ou { seq, ciclos, portas, leituras, ignoradas }.
 * `leituras` sai sem repetição de (codigo, porta) e já filtrada pelo RSSI mínimo do leitor.
 */
function validarLote(corpo, { rssiMin = -Infinity } = {}) {
  if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) return { erro: 'Corpo do lote inválido' };

  const seq = inteiro(corpo.seq);
  if (!Number.isFinite(seq) || seq < 0) return { erro: 'seq deve ser um inteiro >= 0' };

  const ciclos = inteiro(corpo.ciclos ?? CICLOS_POR_LOTE);
  if (!Number.isFinite(ciclos) || ciclos < 1 || ciclos > 100) return { erro: 'ciclos deve estar entre 1 e 100' };

  const lista = corpo.leituras ?? [];
  if (!Array.isArray(lista)) return { erro: 'leituras deve ser uma lista' };
  if (lista.length > LIMITE_LEITURAS) return { erro: `O lote passa de ${LIMITE_LEITURAS} leituras`, status: 413 };

  const portas = Array.isArray(corpo.portas)
    ? [...new Set(corpo.portas.map(inteiro).filter((p) => PORTAS.includes(p)))].sort()
    : [];

  const porChave = new Map();
  let ignoradas = 0;
  for (const item of lista) {
    const codigo = codigoDoEpc(item?.epc);
    const porta = inteiro(item?.ant);
    const n = Math.min(inteiro(item?.n), ciclos);
    const rssiMed = numero(item?.rssiMed);
    const rssiMax = Number.isFinite(numero(item?.rssiMax)) ? numero(item?.rssiMax) : rssiMed;
    const valida = codigo && PORTAS.includes(porta) && n >= 1
      && Number.isFinite(rssiMed) && rssiMed < 0 && rssiMed > -120 && rssiMed >= rssiMin;
    if (!valida) { ignoradas += 1; continue; }

    const chave = `${codigo}|${porta}`;
    const anterior = porChave.get(chave);
    if (anterior) ignoradas += 1;
    if (!anterior || n > anterior.n) porChave.set(chave, { codigo, porta, n, rssiMed, rssiMax: Math.max(rssiMax, rssiMed) });
  }

  return { seq, ciclos, portas, leituras: [...porChave.values()], ignoradas };
}

// ---------- chave do leitor ----------

function gerarChave() {
  return crypto.randomBytes(24).toString('base64url');
}

function hashChave(chave) {
  return crypto.createHash('sha256').update(String(chave || '')).digest('hex');
}

function chaveConfere(chave, hashGuardado) {
  if (!chave || !hashGuardado) return false;
  const a = Buffer.from(hashChave(chave), 'hex');
  const b = Buffer.from(String(hashGuardado), 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = {
  EPC_TAMANHO, JANELA_MS, CICLO_MS, CICLOS_POR_LOTE, LIMITE_LEITURAS, PORTAS,
  codigoDoEpc, epcDoCodigo, baldeDe, momentoDoLote, validarLote, gerarChave, hashChave, chaveConfere,
};
