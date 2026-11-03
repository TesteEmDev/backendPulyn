// debug/agendar-limpeza-nuvem.js - agenda na NUVEM (SYNC_NUVEM_URL), com o pg_cron, a limpeza diária da fila de alterações.
// A limpeza apaga o que tem mais de DIAS dias (padrão 60). Um buffet que ficar mais tempo sem conectar que isso precisa
// de recarga (SYNC_RECARGA=1); o sincronizador avisa quando isso acontece.
//
// Sem confirmação, só mostra o plano. Com APLICAR_NUVEM=YES: instala a extensão pg_cron (se faltar) e agenda
// "SELECT sincronizacaoLimparFila(DIAS)" todo dia às 03:00 (horário do servidor, UTC no Supabase).
//   Variáveis: SYNC_NUVEM_URL (obrigatória), DIAS (padrão 60), APLICAR_NUVEM=YES, SYNC_NUVEM_SSL.
const pg = require('pg');

const url = process.env.SYNC_NUVEM_URL;
if (!url) throw new Error('Defina SYNC_NUVEM_URL (o endereço da nuvem).');
const dias = Number(process.env.DIAS || 60);
if (!Number.isInteger(dias) || dias < 7) throw new Error('DIAS: use um número inteiro de pelo menos 7.');
const aplicar = process.env.APLICAR_NUVEM === 'YES';
const ssl = String(process.env.SYNC_NUVEM_SSL || 'true').toLowerCase() !== 'false';
const NOME = 'pulyn-limpar-fila';
const COMANDO = `SELECT sincronizacaoLimparFila(${dias})`;

async function main() {
  console.log(`Plano: instalar pg_cron se faltar, e agendar "${NOME}" às 03:00 com: ${COMANDO}`);
  if (!aplicar) {
    console.log('\nNada foi feito. Para aplicar, defina APLICAR_NUVEM=YES no mesmo comando.');
    return;
  }
  const cliente = new pg.Client({ connectionString: url, ssl: ssl ? { rejectUnauthorized: false } : false, connectionTimeoutMillis: 15000 });
  await cliente.connect();
  try {
    await cliente.query('CREATE EXTENSION IF NOT EXISTS pg_cron');
    // Recria o agendamento: se já existir com o mesmo nome, troca.
    await cliente.query('SELECT cron.unschedule($1) WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = $1)', [NOME]);
    await cliente.query('SELECT cron.schedule($1, $2, $3)', [NOME, '0 3 * * *', COMANDO]);
    const conferido = await cliente.query('SELECT jobname, schedule, command FROM cron.job WHERE jobname = $1', [NOME]);
    if (!conferido.rows.length) throw new Error('Conferência falhou: o agendamento não apareceu.');
    console.log('Agendado:', conferido.rows[0]);
  } finally {
    await cliente.end();
  }
}

main().catch((erro) => {
  console.error('❌', erro.message);
  process.exitCode = 1;
});
