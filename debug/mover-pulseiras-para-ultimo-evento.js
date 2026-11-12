// debug/mover-pulseiras-para-ultimo-evento.js
//
// Põe cada pulseira que já foi usada em algum evento no cliente (empresa) do ÚLTIMO evento em que foi usada.
// Ex.: a pulseira usada em eventos do buffet ADV passa a ser do ADV.
//
//   node debug/mover-pulseiras-para-ultimo-evento.js            -> só mostra o que seria feito (não altera nada)
//   node debug/mover-pulseiras-para-ultimo-evento.js --aplicar  -> aplica, tudo numa transação (se algo falhar, nada muda)
//
// Regras:
// - "Usada" = alguma participação (crianca) com codigoPulseira igual ao código. O último evento é o de data mais recente
//   (empate: a participação mais recente).
// - Se a pulseira já está cadastrada em outro cliente, a linha dela muda de dono (empresaId). Se o cliente do último
//   evento já tem a mesma pulseira cadastrada, nada é movido e o caso é só listado (conflito).
// - Se a pulseira foi usada mas não existe em nenhum cliente, ela é cadastrada no cliente do último evento.
// - Status, criança vinculada e demais campos da pulseira não mudam. Pulseira nunca usada em evento não é tocada.
// - Cada mudança fica registrada em pulseiraMovimento (tipo "ajuste").
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { connectDB, closeDB, withTransaction, allQuery } = require('../database');
const { normalizeUid } = require('../utils/uid');
const { registrarMovimento } = require('../utils/pulseiraTransferencia');

const aplicar = process.argv.includes('--aplicar');

function ts(valor) {
  const t = valor ? new Date(valor).getTime() : 0;
  return Number.isFinite(t) ? t : 0;
}

(async () => {
  await connectDB();
  try {
    const empresas = await allQuery('SELECT empresaId, nome FROM empresa');
    const nomeDe = (id) => `${empresas.find((e) => e.empresaId === id)?.nome || '?'} (${String(id).slice(0, 6)})`;

    const usos = await allQuery(
      `SELECT c.codigoPulseira AS codigo, c.empresaId, c.criadoEm, e.data AS dataEvento
       FROM crianca c LEFT JOIN evento e ON e.eventoId = c.eventoId
       WHERE c.codigoPulseira IS NOT NULL AND c.empresaId IS NOT NULL`
    );
    const pulseiras = await allQuery('SELECT codigo, empresaId FROM pulseira');

    // último uso de cada código
    const ultimo = new Map();
    for (const uso of usos) {
      const codigo = normalizeUid(uso.codigo);
      if (!codigo) continue;
      const peso = [ts(uso.dataEvento), ts(uso.criadoEm)];
      const atual = ultimo.get(codigo);
      if (!atual || peso[0] > atual.peso[0] || (peso[0] === atual.peso[0] && peso[1] > atual.peso[1])) {
        ultimo.set(codigo, { empresaId: uso.empresaId, peso });
      }
    }

    const plano = { mover: [], cadastrar: [], jaCerto: 0, conflito: [] };
    for (const [codigo, { empresaId: destino }] of ultimo) {
      const donas = pulseiras.filter((p) => normalizeUid(p.codigo) === codigo);
      if (donas.some((p) => p.empresaId === destino)) {
        if (donas.length === 1) plano.jaCerto += 1;
        else plano.conflito.push({ codigo, destino, outras: donas.filter((p) => p.empresaId !== destino).map((p) => p.empresaId) });
        continue;
      }
      if (donas.length === 0) plano.cadastrar.push({ codigo, destino });
      else if (donas.length === 1) plano.mover.push({ codigo, de: donas[0].empresaId, destino, codigoOriginal: donas[0].codigo });
      else plano.conflito.push({ codigo, destino, outras: donas.map((p) => p.empresaId) });
    }

    console.log(`Pulseiras usadas em eventos: ${ultimo.size}`);
    console.log(`  já no cliente certo: ${plano.jaCerto}`);
    console.log(`  a mover de cliente: ${plano.mover.length}`);
    for (const m of plano.mover) console.log(`    ${m.codigo}: ${nomeDe(m.de)} -> ${nomeDe(m.destino)}`);
    console.log(`  a cadastrar (usadas, mas sem cadastro): ${plano.cadastrar.length}`);
    for (const c of plano.cadastrar) console.log(`    ${c.codigo}: -> ${nomeDe(c.destino)}`);
    console.log(`  conflitos (não mexe): ${plano.conflito.length}`);
    for (const c of plano.conflito) console.log(`    ${c.codigo}: destino ${nomeDe(c.destino)}; também em ${c.outras.map(nomeDe).join(', ')}`);

    if (!aplicar) {
      console.log('\nNada foi alterado. Para aplicar: node debug/mover-pulseiras-para-ultimo-evento.js --aplicar');
      return;
    }
    if (plano.mover.length + plano.cadastrar.length === 0) {
      console.log('\nNada a fazer.');
      return;
    }

    await withTransaction(async (tx) => {
      for (const m of plano.mover) {
        await tx.query('UPDATE pulseira SET empresaId = @destino, atualizadoEm = CURRENT_TIMESTAMP WHERE codigo = @codigo AND empresaId = @de',
          { destino: m.destino, codigo: m.codigoOriginal, de: m.de });
        await registrarMovimento(tx, { codigo: m.codigo, tipo: 'ajuste', empresaOrigemId: m.de, empresaDestinoId: m.destino, porNome: 'ajuste: cliente do último evento' });
      }
      for (const c of plano.cadastrar) {
        await tx.query(
          `INSERT INTO pulseira (codigo, status, empresaId, statusTransferencia, criadoEm)
           VALUES (@codigo, 'disponivel', @destino, 'aceito', CURRENT_TIMESTAMP)`,
          { codigo: c.codigo, destino: c.destino }
        );
        await registrarMovimento(tx, { codigo: c.codigo, tipo: 'ajuste', empresaOrigemId: null, empresaDestinoId: c.destino, porNome: 'ajuste: cliente do último evento' });
      }
    });
    console.log(`\nAplicado: ${plano.mover.length} movida(s), ${plano.cadastrar.length} cadastrada(s).`);
  } finally {
    await closeDB();
  }
})().catch((erro) => {
  console.error('ERRO:', erro.message);
  process.exit(1);
});
