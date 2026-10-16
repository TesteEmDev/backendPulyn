// epc-pulseiras.js - Lista o EPC que deve ser gravado em cada pulseira (para regravar as tags UHF)
//
// Padrão: EPC = código da pulseira em hex, completado com zeros à esquerda até 24 caracteres (96 bits).
// Uso: node epc-pulseiras.js <empresaId> [arquivo.csv]
//   Sem arquivo, imprime o CSV na tela. Códigos que não cabem no padrão aparecem com o motivo.
require('dotenv').config();
const fs = require('fs');
const { allQuery } = require('./database');
const { epcDoCodigo, codigoDoEpc } = require('./utils/uhfLote');

async function main() {
  const [empresaId, arquivo] = process.argv.slice(2);
  if (!empresaId) {
    console.log('Uso: node epc-pulseiras.js <empresaId> [arquivo.csv]');
    process.exit(1);
  }
  const pulseiras = await allQuery('SELECT codigo, status FROM pulseira WHERE empresaId = @empresaId ORDER BY codigo', { empresaId });
  const linhas = ['codigo;epc;status;observacao'];
  const vistos = new Map();
  for (const p of pulseiras) {
    const epc = epcDoCodigo(p.codigo);
    let observacao = '';
    if (!epc) observacao = 'código inválido para EPC (só 0-9/A-F, até 24 caracteres)';
    else if (vistos.has(codigoDoEpc(epc))) observacao = `mesmo EPC da pulseira ${vistos.get(codigoDoEpc(epc))}`;
    if (epc) vistos.set(codigoDoEpc(epc), p.codigo);
    linhas.push([p.codigo, epc, p.status, observacao].join(';'));
  }
  const csv = linhas.join('\n') + '\n';
  if (arquivo) {
    fs.writeFileSync(arquivo, csv);
    console.log(`✅ ${pulseiras.length} pulseira(s) em ${arquivo}`);
  } else {
    process.stdout.write(csv);
  }
  process.exit(0);
}

main().catch((err) => { console.error('❌', err.message); process.exit(1); });
