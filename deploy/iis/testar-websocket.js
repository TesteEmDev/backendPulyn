// testar-websocket.js - confere se o WebSocket passa pelo IIS ate o backend.
// Uso: node testar-websocket.js wss://127.0.0.1/   (rode com a pasta atual = C:\Pulyn\backend, onde esta o modulo ws)
// Sem token o backend recusa a conexao; o que importa e QUEM recusou:
//   - resposta 401/403 (ou abriu e fechou) = chegou no backend: o proxy do WebSocket esta funcionando;
//   - resposta 200/404 em HTML = quem respondeu foi o IIS, o proxy NAO esta repassando o Upgrade.
const WebSocket = require('ws');

const url = process.argv[2] || 'wss://127.0.0.1/';
const socket = new WebSocket(url, { rejectUnauthorized: false, handshakeTimeout: 8000 });
let terminou = false;
const fim = (codigo, texto) => { if (terminou) return; terminou = true; console.log(texto); process.exit(codigo); };

socket.on('open', () => fim(0, 'OK: conexao WebSocket aberta (chegou no backend).'));
socket.on('unexpected-response', (req, res) => {
  const chegou = res.statusCode === 401 || res.statusCode === 403 || res.statusCode === 400;
  fim(chegou ? 0 : 1, chegou
    ? 'OK: o backend respondeu ' + res.statusCode + ' (recusa por falta de token), entao o proxy do WebSocket funciona.'
    : 'FALHA: respondeu ' + res.statusCode + ' sem passar pelo backend. Veja a secao WebSocket do README-IIS.md.');
});
socket.on('error', (erro) => fim(1, 'FALHA: ' + erro.message));
setTimeout(() => fim(1, 'FALHA: sem resposta em 10 s.'), 10000);
