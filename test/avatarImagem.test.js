const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { DEFAULT_AVATAR_CONFIG, encodeAvatar, randomAvatarConfig, AVATAR_STYLE_VERSION } = require('@pulyn/avatar');
const avataresRoutes = require('../routes/avatares');
const {
  TAMANHOS, TAMANHO_PADRAO, interpretarArquivo, interpretarTamanho, etagDe, gerarImagem, limparCache,
} = require('../utils/avatarImagem');

const CODIGO = encodeAvatar(DEFAULT_AVATAR_CONFIG);
const PNG_ASSINATURA = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// fetch() do Node manda Cache-Control: no-cache junto com If-None-Match (é da especificação dele), o que torna o pedido
// "não fresco" de propósito; o app e os navegadores mandam só o If-None-Match, então a conferência de 304 usa http puro.
function pedir(url, headers = {}) {
  return new Promise((resolve, reject) => {
    http.get(url, { headers }, (res) => {
      const partes = [];
      res.on('data', (p) => partes.push(p));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, corpo: Buffer.concat(partes) }));
    }).on('error', reject);
  });
}

// Sobe só a rota de avatares, com um "servidor de arquivos" de mentira atrás (como o express.static do index.js).
function subir(t) {
  const app = express();
  app.use('/avatars', avataresRoutes);
  app.use('/avatars', (req, res) => res.status(200).type('image/svg+xml').send('<svg>pronto</svg>'));
  const servidor = http.createServer(app).listen(0);
  t.after(() => servidor.close());
  return `http://127.0.0.1:${servidor.address().port}`;
}

test('interpretarArquivo aceita só o nome exato de um avatar montado', () => {
  assert.deepEqual(interpretarArquivo(`${CODIGO}.png`), { codigo: CODIGO, formato: 'png' });
  assert.deepEqual(interpretarArquivo(`${CODIGO}.svg`), { codigo: CODIGO, formato: 'svg' });
  for (const ruim of [
    'adventurer-1787066874693.svg', `${CODIGO}.jpg`, `${CODIGO}.png.exe`, `../${CODIGO}.png`, `${CODIGO.toUpperCase()}.png`,
    `${CODIGO}x.png`, `${CODIGO.slice(0, -1)}.png`, 'pulyn1-.png', '', undefined, null, 42,
  ]) assert.equal(interpretarArquivo(ruim), null, String(ruim));
});

test('interpretarTamanho: padrão sem pedido, só os tamanhos da lista, nada de lixo', () => {
  assert.equal(interpretarTamanho(undefined), TAMANHO_PADRAO);
  for (const t of TAMANHOS) assert.equal(interpretarTamanho(String(t)), t);
  for (const ruim of ['', '0', '100', '4096', '-128', '128.5', '128px', 'abc', ['128', '64'], { a: 1 }, null]) {
    assert.equal(interpretarTamanho(ruim), null, JSON.stringify(ruim));
  }
});

test('o ETag muda com a versão do visual, o código e o tamanho', () => {
  assert.ok(etagDe(CODIGO, 'png', 128).includes(`v${AVATAR_STYLE_VERSION}`));
  assert.notEqual(etagDe(CODIGO, 'png', 128), etagDe(CODIGO, 'png', 256));
  assert.notEqual(etagDe(CODIGO, 'png', 128), etagDe(encodeAvatar(randomAvatarConfig()), 'png', 128));
  assert.equal(etagDe(CODIGO, 'svg', 64), etagDe(CODIGO, 'svg', 384)); // svg não depende do tamanho
});

test('gerarImagem desenha um PNG do tamanho pedido e guarda no cache', async () => {
  limparCache();
  const primeira = await gerarImagem(CODIGO, 'png', 96);
  assert.equal(primeira.tipo, 'image/png');
  assert.equal(primeira.doCache, false);
  assert.deepEqual(primeira.corpo.subarray(0, 8), PNG_ASSINATURA);
  assert.equal(primeira.corpo.readUInt32BE(16), 96); // largura no cabeçalho IHDR
  assert.equal(primeira.corpo.readUInt32BE(20), 96); // altura
  const segunda = await gerarImagem(CODIGO, 'png', 96);
  assert.equal(segunda.doCache, true);
  assert.equal(segunda.corpo, primeira.corpo);
  assert.equal(await gerarImagem(CODIGO, 'png', 96, { somenteCache: true }) !== null, true);
  assert.equal(await gerarImagem(CODIGO, 'png', 192, { somenteCache: true }), null);
});

test('gerarImagem recusa código com posição de peça que não existe', async () => {
  const fora = `pulyn1-z${CODIGO.slice(8)}`; // a primeira peça (formato do rosto) só tem 6 opções
  assert.equal(await gerarImagem(fora, 'png', 128), null);
  assert.equal(await gerarImagem(fora, 'svg', 128), null);
});

test('GET .png devolve a imagem com cache e ETag; repetir com If-None-Match dá 304', async (t) => {
  limparCache();
  const base = subir(t);
  const r = await fetch(`${base}/avatars/${CODIGO}.png?tamanho=128`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'image/png');
  assert.equal(r.headers.get('cache-control'), 'public, max-age=3600');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  const etag = r.headers.get('etag');
  assert.equal(etag, etagDe(CODIGO, 'png', 128));
  const corpo = Buffer.from(await r.arrayBuffer());
  assert.deepEqual(corpo.subarray(0, 8), PNG_ASSINATURA);

  const deNovo = await pedir(`${base}/avatars/${CODIGO}.png?tamanho=128`, { 'If-None-Match': etag });
  assert.equal(deNovo.status, 304);
  assert.equal(deNovo.corpo.length, 0);

  const outroTamanho = await pedir(`${base}/avatars/${CODIGO}.png?tamanho=64`, { 'If-None-Match': etag });
  assert.equal(outroTamanho.status, 200); // ETag de outro tamanho não vale
  assert.ok(outroTamanho.corpo.length > 0);
});

test('GET sem tamanho usa o padrão; GET .svg devolve o desenho em SVG', async (t) => {
  limparCache();
  const base = subir(t);
  const png = Buffer.from(await (await fetch(`${base}/avatars/${CODIGO}.png`)).arrayBuffer());
  assert.equal(png.readUInt32BE(16), TAMANHO_PADRAO);
  const svg = await fetch(`${base}/avatars/${CODIGO}.svg`);
  assert.equal(svg.status, 200);
  assert.match(svg.headers.get('content-type'), /^image\/svg\+xml/);
  assert.ok((await svg.text()).startsWith('<svg'));
});

test('tamanho inválido é 400; código inválido é 404 sem corpo; outros nomes seguem para o servidor de arquivos', async (t) => {
  const base = subir(t);
  const ruim = await fetch(`${base}/avatars/${CODIGO}.png?tamanho=5000`);
  assert.equal(ruim.status, 400);
  assert.ok((await ruim.json()).error);

  const fora = await fetch(`${base}/avatars/pulyn1-z${CODIGO.slice(8)}.png`);
  assert.equal(fora.status, 404);
  assert.equal((await fora.text()), '');
  assert.equal(fora.headers.get('etag'), null);

  const pronto = await fetch(`${base}/avatars/adventurer-1787066874693.svg`);
  assert.equal(pronto.status, 200);
  assert.equal(await pronto.text(), '<svg>pronto</svg>');
});

test('muitos desenhos novos de um mesmo IP viram 429, mas o que já está pronto continua saindo', async (t) => {
  limparCache();
  const base = subir(t);
  const pronto = await fetch(`${base}/avatars/${CODIGO}.png?tamanho=64`); // já fica no cache
  assert.equal(pronto.status, 200);

  let barrado = null;
  for (let i = 0; i < 400 && !barrado; i += 1) {
    const r = await fetch(`${base}/avatars/${encodeAvatar(randomAvatarConfig())}.svg`);
    if (r.status === 429) barrado = r;
    else assert.equal(r.status, 200);
  }
  assert.ok(barrado, 'nenhum pedido foi barrado');
  assert.equal(barrado.headers.get('retry-after'), '30');

  const aindaSai = await fetch(`${base}/avatars/${CODIGO}.png?tamanho=64`, { headers: { 'Cache-Control': 'no-cache' } });
  assert.equal(aindaSai.status, 200); // do cache: nunca barrado
});
