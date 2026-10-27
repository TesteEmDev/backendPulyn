// utils/dispositivoMac.js - o ESP32 se identifica pelo MAC em vez do ID do checkpoint
//
// Contrato com o firmware: ele chama as MESMAS URLs de sempre, mas no lugar do ID manda o MAC (AA:BB:CC:DD:EE:FF):
//   - no caminho:  /api/pontoVerificacao/<MAC>/heartbeat, .../territory, /api/<jogo>/pontoVerificacao/<MAC>/estado
//   - no corpo:    { "checkpointId": "<MAC>", ... }  em /api/leituras, /api/leituras/reception, /api/<jogo>/leitura
//   - na query:    /api/debug/checkpoint-mode?checkpointId=<MAC>
// O middleware troca o MAC pela chave interna do checkpoint antes das rotas, então nenhuma delas precisa saber de MAC.
// Só vale o MAC com dois-pontos. O ID numérico do checkpoint ("15") segue valendo no lugar do MAC, pois as telas do
// sistema o usam. ESP32 com firmware antigo, que mandava o ID que a pessoa digitou, deixam de ser reconhecidos: o ID
// agora é gerado pelo banco e só vale para o checkpoint de mesmo número (ver COMO_CADASTRAR_POR_MAC.md).
//
// Quem ainda não foi aceito por um buffet (estoque/pendente) só consegue mandar heartbeat: assim o super admin vê o
// aparelho online, mas ele não lê pulseira nem entra em jogo. Os demais pedidos recebem 409.
const { queryOne } = require('../database');
const { normalizarMac, STATUS } = require('./checkpointTransferencia');

const MAC_COM_DOIS_PONTOS = /^[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5}$/;
// Depois de /pontoVerificacao/ vêm rotas que não são ID de checkpoint.
const SEGMENTOS_RESERVADOS = new Set(['evento', 'recebimento', 'resumo', 'codigo-buffet']);
const SEGMENTO_DO_ID = /(\/pontoVerificacao\/)([^/?#]+)/i;
const HEARTBEAT = /\/pontoVerificacao\/[^/?#]+\/heartbeat(?:[/?#]|$)/i;

const ehMac = (valor) => typeof valor === 'string' && MAC_COM_DOIS_PONTOS.test(valor.trim());

function decodificar(texto) {
  try { return decodeURIComponent(texto); } catch { return texto; }
}

// O MAC que está no lugar do ID no caminho da URL, ou null.
function macDaUrl(url) {
  const achou = SEGMENTO_DO_ID.exec(String(url || ''));
  if (!achou) return null;
  const segmento = decodificar(achou[2]);
  if (SEGMENTOS_RESERVADOS.has(segmento.toLowerCase()) || !ehMac(segmento)) return null;
  return segmento;
}

// Troca o MAC do caminho pela chave interna do checkpoint.
function trocarMacNaUrl(url, chave) {
  return String(url).replace(SEGMENTO_DO_ID, (_, prefixo) => `${prefixo}${encodeURIComponent(chave)}`);
}

const ehHeartbeat = (url) => HEARTBEAT.test(String(url || ''));

function resposta(res, status, corpo) {
  return res.status(status).json(corpo);
}

// Middleware: resolve o MAC (caminho, corpo ou query) para o checkpoint e troca pelo ID interno.
async function identificarPorMac(req, res, next) {
  try {
    const noCaminho = macDaUrl(req.url);
    const noCorpo = req.body && typeof req.body === 'object' && ehMac(req.body.checkpointId) ? req.body.checkpointId : null;
    const naQuery = req.query && ehMac(req.query.checkpointId) ? req.query.checkpointId : null;
    const bruto = noCaminho || noCorpo || naQuery;
    if (!bruto) return next();

    const mac = normalizarMac(bruto);
    const checkpoint = await queryOne(
      'SELECT checkpointId, numCheck, statusTransferencia, eventoId FROM pontoVerificacao WHERE macAddress = @mac',
      { mac }
    );
    if (!checkpoint) {
      console.warn(`⚠️ [MAC] Aparelho desconhecido tentou se conectar: ${mac}`);
      return resposta(res, 404, { error: 'Nenhum checkpoint cadastrado para este MAC', mac });
    }

    if (!ehHeartbeat(req.url)) {
      if (checkpoint.statusTransferencia !== STATUS.ACEITO) {
        return resposta(res, 409, {
          error: 'Este checkpoint ainda não foi aceito por um buffet',
          statusTransferencia: checkpoint.statusTransferencia,
        });
      }
      if (!checkpoint.eventoId) {
        return resposta(res, 409, { error: 'Este checkpoint ainda não está em nenhum evento', numCheck: checkpoint.numCheck });
      }
    }

    if (noCaminho) req.url = trocarMacNaUrl(req.url, checkpoint.checkpointId);
    if (noCorpo) req.body.checkpointId = checkpoint.checkpointId;
    if (naQuery) req.query.checkpointId = checkpoint.checkpointId;
    req.checkpointPorMac = checkpoint;
    return next();
  } catch (err) {
    console.error('❌ [MAC] Erro ao identificar o checkpoint pelo MAC:', err);
    return resposta(res, 500, { error: 'Erro ao identificar o checkpoint' });
  }
}

module.exports = { ehMac, macDaUrl, trocarMacNaUrl, ehHeartbeat, identificarPorMac };
