// epc-pulseiras.js - Lista qual EPC (tag UHF) está vinculado a cada pulseira da empresa
//
// O vínculo é feito na tela /admin/uhf (Pulseiras UHF). Pulseiras sem EPC aparecem com a coluna vazia.
// Uso: node epc-pulseiras.js <empresaId> [arquivo.csv]
//   Sem arquivo, imprime o CSV na tela.
require('dotenv').config();
const fs = require('fs');
const { allQuery } = require('./database');

async function main() {
  const [empresaId, arquivo] = process.argv.slice(2);
  if (!empresaId) {
    console.log('Uso: node epc-pulseiras.js <empresaId> [arquivo.csv]');
    process.exit(1);
  }
  const pulseiras = await allQuery('SELECT codigo, epc, status FROM pulseira WHERE empresaId = @empresaId ORDER BY epc NULLS LAST, codigo', { empresaId });
  const linhas = ['codigo;epc;status', ...pulseiras.map((p) => [p.codigo, p.epc || '', p.status].join(';'))];
  const csv = linhas.join('\n') + '\n';
  if (arquivo) {
    fs.writeFileSync(arquivo, csv);
    const vinculadas = pulseiras.filter((p) => p.epc).length;
    console.log(`✅ ${pulseiras.length} pulseira(s), ${vinculadas} com EPC, em ${arquivo}`);
  } else {
    process.stdout.write(csv);
  }
  process.exit(0);
}

main().catch((err) => { console.error('❌', err.message); process.exit(1); });
