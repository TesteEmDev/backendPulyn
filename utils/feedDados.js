// utils/feedDados.js - avisa as telas, na hora, quando algum dado muda (sem F5 e sem esperar uma atualização periódica)
//
// Toda requisição que ALTERA dados e termina com sucesso (POST/PUT/PATCH/DELETE) gera um aviso "DADOS_ALTERADOS" com os
// assuntos que mudaram (checkpoints, clientes, eventos...). As telas conectadas no canal `?scope=dados` que se interessam
// por aquele assunto recarregam os próprios dados em silêncio. O aviso não leva dado nenhum, só o assunto: a tela busca o
// que mudou pela API de sempre, com as permissões dela.
//
// Quem recebe: o master recebe tudo; cada buffet só recebe o que é dele (a empresa de quem fez a ação e, se a ação mexe
// num checkpoint, as empresas ligadas a ele, como o buffet que recebeu ou devolveu).
const { queryOne } = require('../database');

// Assunto de cada parte da API. O primeiro que casar vale.
const ROTAS = [
  [/^\/master\/checkpoints/, ['checkpoints']],
  [/^\/master\/pulseiras/, ['pulseiras']],
  [/^\/pontoVerificacao/, ['checkpoints']],
  [/^\/clientes/, ['clientes']],
  [/^\/eventos/, ['eventos']],
  [/^\/brincadeiras|^\/parallel-games|^\/treasure|^\/monster|^\/bomba|^\/refem|^\/zonaDominio|^\/zone-conquest|^\/debug/, ['jogos']],
  [/^\/times/, ['times']],
  [/^\/criancas|^\/kiosk|^\/score-kiosk/, ['criancas']],
  [/^\/pulseiras/, ['pulseiras']],
  [/^\/leituras|^\/uhf/, ['leituras']],
  [/^\/acessos/, ['usuarios']],
  [/^\/support/, ['suporte']],
  [/^\/planos/, ['planos']],
  [/^\/familias|^\/family/, ['familias']],
  [/^\/configuracoes|^\/empresa|^\/company-map|^\/telao/, ['config']],
  [/^\/messages/, ['mensagens']],
  [/^\/master/, ['master']],
];

// Um assunto que muda leva junto os que dependem dele (apagar um cliente mexe em eventos, checkpoints, crianças...).
const IMPLICA = {
  clientes: ['clientes', 'checkpoints', 'eventos', 'jogos', 'criancas', 'times', 'pulseiras', 'usuarios', 'planos', 'suporte'],
  eventos: ['eventos', 'checkpoints', 'jogos', 'criancas', 'times', 'pulseiras'],
  checkpoints: ['checkpoints'],
  jogos: ['jogos'],
  criancas: ['criancas', 'times', 'pulseiras'],
  times: ['times', 'criancas'],
  pulseiras: ['pulseiras', 'criancas'],
  leituras: ['leituras', 'criancas', 'times', 'pulseiras'],
  usuarios: ['usuarios'],
  familias: ['familias', 'criancas'],
};

// Rotas que só leem ou que mudam coisas sem interesse para as telas (login, relógio do telão...).
const IGNORAR = /^\/auth|^\/event-control\/heartbeat|^\/qrcode/;

function topicosDaRota(caminho) {
  const alvo = String(caminho || '').split('?')[0];
  if (IGNORAR.test(alvo)) return [];
  const achado = ROTAS.find(([regex]) => regex.test(alvo));
  const base = achado ? achado[1] : ['outros'];
  return [...new Set(base.flatMap((t) => IMPLICA[t] || [t]))];
}

// Checkpoint citado no caminho (/pontoVerificacao/:id/..., /master/checkpoints/:id/..., /recebimento/:id/...) ou no corpo.
function checkpointDaRequisicao(req, caminho) {
  const m = String(caminho).match(/^\/(?:master\/checkpoints|pontoVerificacao(?:\/recebimento|\/evento\/[^/]+)?)\/([^/?]+)/);
  const doCaminho = m && m[1] !== 'evento' ? m[1] : null;
  return doCaminho || req.body?.checkpointId || null;
}

async function empresasDoCheckpoint(checkpointId) {
  if (!checkpointId) return [];
  try {
    const linha = await queryOne(
      `SELECT empresaId, empresaDestinoId FROM pontoVerificacao
       WHERE checkpointId = @id OR CAST(id AS text) = @id`, { id: String(checkpointId) });
    return [linha?.empresaId, linha?.empresaDestinoId].filter(Boolean);
  } catch {
    return [];
  }
}

// Envio com junção: várias mudanças seguidas (ex.: leituras em rajada) viram um aviso só.
const JANELA_MS = 250;
function criarEmissor(enviar) {
  const pendentes = new Map();
  return function emitir(topicos, empresas) {
    if (!topicos.length) return;
    const chave = `${[...topicos].sort().join(',')}|${[...new Set(empresas)].sort().join(',')}`;
    if (pendentes.has(chave)) return;
    pendentes.set(chave, setTimeout(() => {
      pendentes.delete(chave);
      enviar([...topicos], [...new Set(empresas)]);
    }, JANELA_MS));
  };
}

// Envia para quem está no canal de dados: o master recebe tudo; os demais, só o que é da empresa deles.
function enviarParaCanal(wss, topicos, empresas) {
  const mensagem = JSON.stringify({ type: 'DADOS_ALTERADOS', topicos, em: new Date().toISOString() });
  const alvo = new Set(empresas.map((e) => String(e).toLowerCase()));
  wss.clients.forEach((cliente) => {
    if (cliente.readyState !== 1 || !cliente.canalDados) return;
    const ehMaster = cliente.user?.role === 'master';
    const daEmpresa = alvo.has(String(cliente.companyId || '').toLowerCase());
    if (ehMaster || daEmpresa) cliente.send(mensagem);
  });
}

// Middleware: depois que uma requisição que altera dados termina com sucesso, avisa as telas.
function middlewareDeAviso(wss) {
  const emitir = criarEmissor((topicos, empresas) => enviarParaCanal(wss, topicos, empresas));
  return (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
    res.on('finish', () => {
      if (res.statusCode >= 400) return;
      const caminho = req.originalUrl.replace(/^\/api/, '');
      const topicos = topicosDaRota(caminho);
      if (!topicos.length) return;
      const empresas = [req.user?.empresaId, req.body?.empresaId, req.body?.empresaDestinoId].filter(Boolean);
      const checkpoint = checkpointDaRequisicao(req, caminho.split('?')[0]);
      if (checkpoint && topicos.includes('checkpoints')) {
        empresasDoCheckpoint(checkpoint).then((extra) => emitir(topicos, [...empresas, ...extra]));
      } else {
        emitir(topicos, empresas);
      }
    });
    next();
  };
}

// Vigia da situação dos checkpoints: online/offline é calculado pelo último sinal da placa, então um checkpoint pode ficar
// offline sem nenhuma requisição. A cada `intervaloMs` compara com a vez anterior e avisa só quando algo mudou.
function iniciarVigiaDeCheckpoints({ allQuery, statusEfetivo, avisar, intervaloMs = 20000 }) {
  let anterior = null;
  let rodando = false;
  const checar = async () => {
    if (rodando) return;
    rodando = true;
    try {
      const linhas = await allQuery('SELECT checkpointId, status, ultimoVisto, empresaId, empresaDestinoId FROM pontoVerificacao');
      const agora = Date.now();
      const atual = new Map(linhas.map((l) => [String(l.checkpointId), statusEfetivo(l.status, l.ultimoVisto, agora)]));
      if (anterior) {
        const empresas = [];
        for (const l of linhas) {
          const id = String(l.checkpointId);
          if (anterior.get(id) !== atual.get(id)) empresas.push(l.empresaId, l.empresaDestinoId);
        }
        if (empresas.length || anterior.size !== atual.size) avisar(['checkpoints'], empresas.filter(Boolean));
      }
      anterior = atual;
    } catch (erro) {
      console.warn(`⚠️ [FEED] Vigia dos checkpoints falhou: ${erro.message}`);
    } finally {
      rodando = false;
    }
  };
  checar();
  return setInterval(checar, intervaloMs);
}

// Mudanças que não passam por uma requisição de tela (início/fim automático de evento, por exemplo).
function avisarMudanca(topicos, empresas = []) {
  if (typeof global.avisarDados === 'function') global.avisarDados(topicos, empresas);
}

module.exports = { iniciarVigiaDeCheckpoints, topicosDaRota, criarEmissor, enviarParaCanal, middlewareDeAviso, avisarMudanca, checkpointDaRequisicao, JANELA_MS };
