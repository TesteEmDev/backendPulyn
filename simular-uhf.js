// simular-uhf.js - Simula leitores UR4 mandando lotes, para ver o mapa de calor sem hardware
//
// Uso (backend rodando):
//   node simular-uhf.js --leitor MODULO:CHAVE [--leitor MODULO2:CHAVE2] [--url http://localhost:3001] [--criancas 20] [--rapido]
//
// Cadastre os leitores em /admin/uhf, posicione as antenas e copie o ID do módulo e a chave mostrados ao criar.
// O simulador lê do banco (mesmo .env do backend) a posição das antenas e as pulseiras da empresa, faz as crianças
// andarem pela planta e manda um lote por leitor a cada 20 s (ou a cada 2 s com --rapido), como o firmware faria.
require('dotenv').config();
const { allQuery, queryOne } = require('./database');
const { epcDoCodigo, CICLOS_POR_JANELA, JANELA_MS } = require('./utils/uhfLote');
const { ESCALA_PADRAO } = require('./utils/uhfMapa');

function argumentos() {
  const lista = process.argv.slice(2);
  const opcoes = { leitores: [], url: `http://localhost:${process.env.PORT || 3001}`, criancas: 20, rapido: false };
  for (let i = 0; i < lista.length; i += 1) {
    const valor = lista[i + 1];
    if (lista[i] === '--leitor') { const [modulo, ...chave] = valor.split(':'); opcoes.leitores.push({ modulo, chave: chave.join(':') }); i += 1; }
    else if (lista[i] === '--url') { opcoes.url = valor; i += 1; }
    else if (lista[i] === '--criancas') { opcoes.criancas = Number(valor); i += 1; }
    else if (lista[i] === '--rapido') opcoes.rapido = true;
  }
  if (opcoes.leitores.length === 0) {
    console.log('Uso: node simular-uhf.js --leitor MODULO:CHAVE [--leitor ...] [--url http://localhost:3001] [--criancas 20] [--rapido]');
    process.exit(1);
  }
  return opcoes;
}

const aleatorio = (min, max) => min + Math.random() * (max - min);
const ruido = (desvio) => desvio * Math.sqrt(-2 * Math.log(Math.random() || 1e-9)) * Math.cos(2 * Math.PI * Math.random());

async function main() {
  const opcoes = argumentos();

  const leitores = [];
  for (const { modulo, chave } of opcoes.leitores) {
    const leitor = await queryOne('SELECT leitorId, empresaId, nome FROM leitorUhf WHERE moduleId = @modulo', { modulo });
    if (!leitor) throw new Error(`Leitor ${modulo} não cadastrado`);
    const antenas = await allQuery(
      'SELECT porta, mapaX, mapaY, raioMetros FROM antenaUhf WHERE leitorId = @leitorId AND ativa AND mapaX IS NOT NULL',
      { leitorId: leitor.leitorId }
    );
    leitores.push({ ...leitor, modulo, chave, antenas, seq: Date.now() % 1e9 });
    console.log(`📡 ${modulo} (${leitor.nome}): ${antenas.length} antena(s) posicionada(s)`);
  }

  const empresaId = leitores[0].empresaId;
  const empresa = await queryOne('SELECT mapaMetrosPorUnidade FROM empresa WHERE empresaId = @empresaId', { empresaId });
  const escala = Number(empresa?.mapaMetrosPorUnidade) || ESCALA_PADRAO;
  const pulseiras = await allQuery('SELECT codigo FROM pulseira WHERE empresaId = @empresaId LIMIT @limite', { empresaId, limite: opcoes.criancas });
  if (pulseiras.length === 0) throw new Error('A empresa não tem pulseiras cadastradas');

  // Crianças começam perto de alguma antena (senão quase ninguém seria lido) e andam ~0,5 m por ciclo.
  const todasAntenas = leitores.flatMap((l) => l.antenas);
  if (todasAntenas.length === 0) throw new Error('Nenhuma antena posicionada');
  const largura = 450 * escala, altura = 320 * escala;
  const criancas = pulseiras.map((p) => {
    const a = todasAntenas[Math.floor(Math.random() * todasAntenas.length)];
    return { epc: epcDoCodigo(p.codigo), x: a.mapaX * escala + aleatorio(-1, 1), y: a.mapaY * escala + aleatorio(-1, 1) };
  });
  console.log(`👧 ${criancas.length} pulseira(s) andando numa planta de ${largura.toFixed(1)} x ${altura.toFixed(1)} m`);

  const intervaloCiclo = (opcoes.rapido ? 2000 : JANELA_MS) / CICLOS_POR_JANELA;
  const acumulado = new Map(leitores.map((l) => [l.modulo, new Map()]));

  for (let ciclo = 1; ; ciclo += 1) {
    for (const c of criancas) {
      c.x = Math.min(largura, Math.max(0, c.x + ruido(0.3)));
      c.y = Math.min(altura, Math.max(0, c.y + ruido(0.3)));
    }
    for (const leitor of leitores) {
      const porChave = acumulado.get(leitor.modulo);
      for (const antena of leitor.antenas) {
        const raio = Number(antena.raioMetros) || 1.2;
        for (const c of criancas) {
          const d = Math.max(0.1, Math.hypot(c.x - antena.mapaX * escala, c.y - antena.mapaY * escala));
          if (d > raio || Math.random() > 1 - (d / raio) ** 2 * 0.7) continue;   // longe = lida menos vezes
          const rssi = Math.round((-50 - 40 * Math.log10(d) + ruido(3)) * 10) / 10;
          const chave = `${c.epc}|${antena.porta}`;
          const atual = porChave.get(chave) || { epc: c.epc, ant: Number(antena.porta), n: 0, soma: 0, rssiMax: -200 };
          atual.n += 1; atual.soma += rssi; atual.rssiMax = Math.max(atual.rssiMax, rssi);
          porChave.set(chave, atual);
        }
      }
    }

    if (ciclo % CICLOS_POR_JANELA === 0) {
      for (const leitor of leitores) {
        const porChave = acumulado.get(leitor.modulo);
        const leituras = [...porChave.values()].map((l) => ({ epc: l.epc, ant: l.ant, n: l.n, rssiMed: Math.round((l.soma / l.n) * 10) / 10, rssiMax: l.rssiMax }));
        porChave.clear();
        leitor.seq += 1;
        try {
          const resposta = await fetch(`${opcoes.url}/api/uhf/lote`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Module-Id': leitor.modulo, 'X-Device-Key': leitor.chave },
            body: JSON.stringify({ seq: leitor.seq, fw: 'simulador', ciclos: CICLOS_POR_JANELA, portas: [1, 2, 3, 4], leituras }),
          });
          const corpo = await resposta.json();
          console.log(`${new Date().toLocaleTimeString()} ${leitor.modulo} seq ${leitor.seq}: ${resposta.status} aceitas ${corpo.aceitas ?? '-'} ${corpo.error || ''}`);
        } catch (err) {
          console.log(`${new Date().toLocaleTimeString()} ${leitor.modulo}: falha no envio (${err.message})`);
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, intervaloCiclo));
  }
}

main().catch((err) => { console.error('❌', err.message); process.exit(1); });
