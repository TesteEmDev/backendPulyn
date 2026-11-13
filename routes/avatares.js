// routes/avatares.js - Imagem dos avatares montados (pulyn1-...), para o app do celular.
//
//   GET /avatars/pulyn1-XXXXXXXXXXXXXXX.png?tamanho=128   (tamanhos: 64, 96, 128, 192, 256, 384; padrão 128)
//   GET /avatars/pulyn1-XXXXXXXXXXXXXXX.svg
//
// Público, igual aos avatares prontos (/avatars/adventurer-*.svg): é só um desenho, sem dado de ninguém. Como o
// código dá o mesmo personagem sempre, a resposta pode ficar em cache; o ETag leva a versão do visual (ver avatarImagem.js).
// Nomes que não são de avatar montado seguem adiante e quem responde é o servidor de arquivos (os adventurer-*.svg).
const express = require('express');
const { criarLimitador, ipDoCliente } = require('../utils/limiteTentativas');
const { interpretarArquivo, interpretarTamanho, etagDe, gerarImagem } = require('../utils/avatarImagem');

const router = express.Router();

// Desenhar um personagem que ainda não está no cache custa CPU; esta rota é pública, então cada desenho novo conta
// para o IP de quem pediu. Quem pede o que já está pronto nunca é barrado.
const limiteDesenhos = criarLimitador({ max: 300, janelaMs: 60 * 1000 });

router.get('/:arquivo', async (req, res, next) => {
  const alvo = interpretarArquivo(req.params.arquivo);
  if (!alvo) return next();

  const tamanho = interpretarTamanho(req.query.tamanho);
  if (tamanho === null) return res.status(400).json({ error: 'Tamanho inválido. Use 64, 96, 128, 192, 256 ou 384.' });

  // Quem já tem a imagem (If-None-Match igual) recebe 304 sem gastar nada, nem desenhar.
  res.set('ETag', etagDe(alvo.codigo, alvo.formato, tamanho));
  res.set('Cache-Control', 'public, max-age=3600');
  if (req.fresh) return res.status(304).end();

  const ip = ipDoCliente(req);
  try {
    if (limiteDesenhos.bloqueado(ip)) {
      // o cache só atende quem pede o que já foi desenhado; o resto espera a janela passar
      const pronta = await gerarImagem(alvo.codigo, alvo.formato, tamanho, { somenteCache: true });
      if (!pronta) {
        res.set('Retry-After', '30');
        return res.status(429).json({ error: 'Muitos pedidos. Tente de novo em instantes.' });
      }
      return enviar(res, pronta);
    }

    const imagem = await gerarImagem(alvo.codigo, alvo.formato, tamanho);
    if (!imagem) {
      res.removeHeader('ETag');
      res.set('Cache-Control', 'public, max-age=60');
      return res.status(404).end();
    }
    if (!imagem.doCache) limiteDesenhos.registrarFalha(ip); // "falha" aqui é só a contagem de desenhos novos
    return enviar(res, imagem);
  } catch (erro) {
    return next(erro);
  }
});

function enviar(res, imagem) {
  res.set('Content-Type', imagem.tipo);
  res.set('X-Content-Type-Options', 'nosniff');
  return res.send(imagem.corpo);
}

module.exports = router;
