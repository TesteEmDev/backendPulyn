const test = require('node:test');
const assert = require('node:assert/strict');
const { parseLogoPayload, MAX_LOGO_LENGTH } = require('../utils/logoImage');

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

test('aceita PNG válido e deriva o tipo do próprio data URL', () => {
  const { value, error } = parseLogoPayload({ dataUrl: PNG, name: ' minha logo.png ', type: 'text/html' });
  assert.equal(error, undefined);
  assert.equal(value.type, 'image/png');
  assert.equal(value.name, 'minha logo.png');
});

test('aceita jpeg, webp, gif e svg em base64', () => {
  for (const type of ['jpeg', 'webp', 'gif', 'svg+xml']) {
    assert.equal(parseLogoPayload({ dataUrl: `data:image/${type};base64,AAAA` }).error, undefined, type);
  }
});

test('rejeita o que não é imagem em data URL base64', () => {
  assert.ok(parseLogoPayload({}).error);
  assert.ok(parseLogoPayload({ dataUrl: 123 }).error);
  assert.ok(parseLogoPayload({ dataUrl: 'https://exemplo.com/logo.png' }).error);
  assert.ok(parseLogoPayload({ dataUrl: 'data:text/html;base64,PHNjcmlwdD4=' }).error);
  assert.ok(parseLogoPayload({ dataUrl: 'data:image/png;base64,AAA<script>' }).error);
  assert.ok(parseLogoPayload({ dataUrl: 'data:image/bmp;base64,AAAA' }).error);
});

test('rejeita imagem grande demais', () => {
  const huge = `data:image/png;base64,${'A'.repeat(MAX_LOGO_LENGTH)}`;
  assert.ok(parseLogoPayload({ dataUrl: huge }).error);
});

test('nome padrão quando vazio e limite de 255 caracteres', () => {
  assert.equal(parseLogoPayload({ dataUrl: PNG, name: '   ' }).value.name, 'logo-da-unidade');
  assert.equal(parseLogoPayload({ dataUrl: PNG, name: 'a'.repeat(400) }).value.name.length, 255);
});
