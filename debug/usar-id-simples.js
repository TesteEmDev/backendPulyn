// Passa o ID simples (só o número, como o ESP32 foi gravado) para um checkpoint cuja chave tem prefixo do buffet.
// O checkpoint que hoje tem o ID simples, em outro buffet, passa a ter a chave "<código do buffet>-<ID>".
//
//   node debug/usar-id-simples.js <chave do checkpoint>             mostra o que seria feito (não altera nada)
//   node debug/usar-id-simples.js <chave do checkpoint> --aplicar   faz a troca
//
// Exemplo: node debug/usar-id-simples.js FPUETV-12 --aplicar
process.chdir(require('path').join(__dirname, '..'));
const db = require('../database');
const { usarIdSimples } = require('../utils/chaveCheckpoint');

const chave = process.argv[2];
const aplicar = process.argv.includes('--aplicar');

(async () => {
  if (!chave || chave.startsWith('--')) {
    console.error('Informe a chave do checkpoint (ex.: FPUETV-12).');
    process.exit(1);
  }
  await db.connectDB();

  const linha = (c) => `${c.checkpointId}  (ID ${c.codigo}) "${c.nome}" — buffet ${c.empresa} (${c.empresaCodigo}), evento "${c.evento || '-'}"`;
  const sql = `SELECT p.checkpointId, p.codigo, p.nome, e.nome AS empresa, e.codigo AS empresaCodigo, v.nome AS evento
               FROM pontoVerificacao p JOIN empresa e ON e.empresaId = p.empresaId LEFT JOIN evento v ON v.eventoId = p.eventoId
               WHERE LOWER(p.checkpointId) = LOWER(@chave)`;
  const alvo = await db.queryOne(sql, { chave });
  if (!alvo) { console.error(`Checkpoint "${chave}" não encontrado.`); process.exit(1); }
  const dono = await db.queryOne(sql, { chave: alvo.codigo });

  console.log('Passa a ter o ID simples:  ' + linha(alvo));
  console.log(dono && dono.checkpointId.toLowerCase() !== alvo.checkpointId.toLowerCase()
    ? 'Hoje tem o ID simples:      ' + linha(dono) + '\n   -> passa a precisar do código do buffet no ESP32 (chave "<código>-' + dono.codigo + '")'
    : 'Ninguém tem o ID simples agora.');

  if (!aplicar) {
    console.log('\nNada foi alterado. Para fazer a troca: adicione --aplicar');
    process.exit(0);
  }
  const resultado = await usarIdSimples(alvo.checkpointId);
  console.log(`\n✅ Pronto: "${resultado.nome}" agora é o checkpoint ${resultado.chave}.` +
    (resultado.donoAnterior ? ` O antigo dono virou ${resultado.donoAnterior.chave}.` : ''));
  process.exit(0);
})().catch((erro) => { console.error('❌', erro.message); process.exit(1); });
