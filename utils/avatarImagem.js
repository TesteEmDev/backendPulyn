// utils/avatarImagem.js - Imagem (PNG ou SVG) de um avatar montado, desenhada no servidor a partir do código pulyn1-...
//
// O app do celular não tem o gerador de avatares do site. Em vez de reescrevê-lo em Dart (duas cópias para manter),
// o backend desenha o personagem com o MESMO pacote do site (@pulyn/avatar) e entrega a imagem pronta.
// PNG é o formato que o app usa: o resvg (WebAssembly, sem binário nativo, então roda igual no Windows, no Linux do
// Render e no container Docker) desenha tudo como o navegador, sem depender do que o flutter_svg consegue interpretar.
const fs = require('fs');
const { Resvg, initWasm } = require('@resvg/resvg-wasm');
const { decodeAvatar, renderAvatarSvg, AVATAR_STYLE_VERSION } = require('@pulyn/avatar');

const TAMANHOS = Object.freeze([64, 96, 128, 192, 256, 384]); // largura em pixels (a imagem é quadrada)
const TAMANHO_PADRAO = 128;

// Só o nome exato de um avatar montado entra: "pulyn1-" + 15 letras/dígitos, mais 4 dos acessórios e 6 da cor de fundo
// própria quando houver (22, 26, 28 ou 32 caracteres), + .png ou .svg. Cada posição é conferida depois, ao decodificar.
// Qualquer outro nome (os adventurer-*.svg prontos, por exemplo) é de quem chamou, não daqui.
const ARQUIVO = /^(pulyn1-[0-9a-z]{15}(?:[0-9a-z]{4})?(?:[0-9a-f]{6})?)\.(png|svg)$/;

function interpretarArquivo(nome) {
  const achou = typeof nome === 'string' ? ARQUIVO.exec(nome) : null;
  return achou ? { codigo: achou[1], formato: achou[2] } : null;
}

// Tamanho pedido na URL (?tamanho=128). Sem pedido vale o padrão; fora da lista é recusado (null), para ninguém
// pedir uma imagem enorme nem encher o cache com tamanhos avulsos.
function interpretarTamanho(valor) {
  if (valor === undefined) return TAMANHO_PADRAO;
  const numero = typeof valor === 'string' && /^\d{2,3}$/.test(valor) ? Number(valor) : NaN;
  return TAMANHOS.includes(numero) ? numero : null;
}

// Identifica a imagem para o cache do navegador/app. Leva a versão do visual: quando o desenho muda (o pacote sobe o
// AVATAR_STYLE_VERSION) o app percebe na próxima conferência em vez de ficar com o personagem antigo.
function etagDe(codigo, formato, tamanho) {
  return `"v${AVATAR_STYLE_VERSION}-${codigo}-${formato === 'png' ? tamanho : 'svg'}"`;
}

// Cache em memória das imagens prontas, limitado por bytes (as mais antigas saem primeiro). Desenhar custa de 8 a 50 ms
// por PNG; o mesmo personagem aparece em várias telas, então quase todo pedido sai daqui.
const LIMITE_BYTES = 16 * 1024 * 1024;
const cache = new Map(); // chave -> { tipo, corpo }
let bytesNoCache = 0;

function guardar(chave, imagem) {
  const tamanho = imagem.corpo.length;
  if (tamanho > LIMITE_BYTES) return;
  cache.set(chave, imagem);
  bytesNoCache += tamanho;
  for (const antiga of cache.keys()) {
    if (bytesNoCache <= LIMITE_BYTES) break;
    bytesNoCache -= cache.get(antiga).corpo.length;
    cache.delete(antiga);
  }
}

function limparCache() {
  cache.clear();
  bytesNoCache = 0;
}

// O WebAssembly do resvg é carregado uma vez, no primeiro PNG pedido.
let iniciando = null;
function iniciarResvg() {
  if (!iniciando) {
    iniciando = Promise.resolve()
      .then(() => initWasm(fs.readFileSync(require.resolve('@resvg/resvg-wasm/index_bg.wasm'))))
      .catch((erro) => { iniciando = null; throw erro; }); // falhou: o próximo pedido tenta de novo
  }
  return iniciando;
}

// Devolve { tipo, corpo, doCache } ou null se o código não for um avatar válido (posição de peça inexistente, por exemplo).
// Com { somenteCache: true } só devolve o que já está pronto (null no resto), sem desenhar nada novo.
async function gerarImagem(codigo, formato, tamanho, { somenteCache = false } = {}) {
  const chave = `${AVATAR_STYLE_VERSION}:${codigo}:${formato === 'png' ? tamanho : 'svg'}`;
  const guardada = cache.get(chave);
  if (guardada) {
    cache.delete(chave); cache.set(chave, guardada); // volta para o fim: é a mais recente
    return { ...guardada, doCache: true };
  }
  if (somenteCache) return null;

  const config = decodeAvatar(codigo);
  if (!config) return null;
  const svg = renderAvatarSvg(config);

  let imagem;
  if (formato === 'svg') {
    imagem = { tipo: 'image/svg+xml; charset=utf-8', corpo: Buffer.from(svg, 'utf8') };
  } else {
    await iniciarResvg();
    const png = new Resvg(svg, { fitTo: { mode: 'width', value: tamanho } }).render().asPng();
    imagem = { tipo: 'image/png', corpo: Buffer.from(png) };
  }
  guardar(chave, imagem);
  return { ...imagem, doCache: false };
}

module.exports = {
  TAMANHOS, TAMANHO_PADRAO, interpretarArquivo, interpretarTamanho, etagDe, gerarImagem, limparCache,
};
