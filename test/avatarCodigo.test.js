const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_AVATAR_CONFIG, encodeAvatar, randomAvatarConfig } = require('@pulyn/avatar');
const { isAvatarMontado, isAvatarValido, getAvatarForCreate } = require('../utils/avatar');
const { interpretarArquivo, gerarImagem, limparCache } = require('../utils/avatarImagem');

// Todos os formatos de código que o montador do site já gerou: 26 (atual), 32 (com cor de fundo própria) e os antigos 22 e 28.
const novo = encodeAvatar(DEFAULT_AVATAR_CONFIG);
const novoComCor = encodeAvatar({ ...DEFAULT_AVATAR_CONFIG, bg: '#12ab9c' });
const antigo = novo.slice(0, 22);
const antigoComCor = `${antigo}12ab9c`;
const FORMATOS = { 'novo (26)': novo, 'novo com cor própria (32)': novoComCor, 'antigo (22)': antigo, 'antigo com cor própria (28)': antigoComCor };

test('os quatro formatos de código têm os tamanhos esperados', () => {
  assert.deepEqual(Object.values(FORMATOS).map((c) => c.length), [26, 32, 22, 28]);
});

test('o servidor aceita os quatro formatos de avatar montado (antes recusava o novo com "Avatar inválido")', () => {
  for (const [nome, codigo] of Object.entries(FORMATOS)) {
    assert.equal(isAvatarMontado(codigo), true, nome);
    assert.equal(isAvatarValido(codigo), true, nome);
    assert.equal(getAvatarForCreate(codigo), codigo, nome);
  }
});

test('o servidor aceita 500 personagens sorteados pelo gerador do site', () => {
  for (let i = 0; i < 500; i += 1) assert.equal(isAvatarValido(encodeAvatar(randomAvatarConfig())), true);
});

test('o servidor segue recusando o que não é código de avatar montado', () => {
  for (const ruim of [
    novo.slice(0, 21), novo.slice(0, 25), `${novo}1`, `${novo}12ab9`, `${novo}12ab9g`, novo.replace('pulyn1-', 'pulyn2-'), `${novo}.png`,
    '', 'adventurer-outro', ' ' + novo, `${novo}\n`,
  ]) assert.equal(isAvatarValido(ruim), false, JSON.stringify(ruim));
});

test('a rota de imagem reconhece os quatro formatos e desenha todos', async () => {
  limparCache();
  for (const [nome, codigo] of Object.entries(FORMATOS)) {
    assert.deepEqual(interpretarArquivo(`${codigo}.png`), { codigo, formato: 'png' }, nome);
    const png = await gerarImagem(codigo, 'png', 64);
    assert.ok(png && png.corpo.length > 100, nome);
    const svg = await gerarImagem(codigo, 'svg', 64);
    assert.ok(svg && svg.corpo.toString('utf8').startsWith('<svg'), nome);
  }
});

test('a rota de imagem recusa tamanho de código que não existe e posição de peça inválida', async () => {
  for (const ruim of [novo.slice(0, 21), novo.slice(0, 25), `${novo}1`]) {
    assert.equal(interpretarArquivo(`${ruim}.png`), null, ruim);
  }
  assert.equal(await gerarImagem(`pulyn1-z${novo.slice(8)}`, 'png', 64), null); // formato do rosto: só há 6
  assert.equal(await gerarImagem(`${novo.slice(0, 22)}z${novo.slice(23)}`, 'png', 64), null); // óculos: só há 6
});
