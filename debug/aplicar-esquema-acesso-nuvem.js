// debug/aplicar-esquema-acesso-nuvem.js - aplica na NUVEM (SYNC_NUVEM_URL) o migrations/021-acesso-buffet-nuvem.sql.
// Não cria nenhum usuário de buffet: isso é feito depois, por debug/preparar-acesso-buffet-nuvem.js.
//
// Sem confirmação, só mostra o plano. Com APLICAR_NUVEM=YES: backup da nuvem (pg_dump) em PULYN_BACKUPS, depois
// aplica o 021 numa transação e confere as funções e a tabela de acesso.
//   Variáveis: SYNC_NUVEM_URL (obrigatória), APLICAR_NUVEM=YES, PG_DUMP, PULYN_BACKUPS, SYNC_NUVEM_SSL.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const pg = require('pg');

const url = process.env.SYNC_NUVEM_URL;
if (!url) throw new Error('Defina SYNC_NUVEM_URL (o endereço da nuvem).');
const aplicar = process.env.APLICAR_NUVEM === 'YES';
const ssl = String(process.env.SYNC_NUVEM_SSL || 'true').toLowerCase() !== 'false';
const pastaBackup = process.env.PULYN_BACKUPS || path.join(process.cwd(), 'backups-nuvem');
const pgDump = process.env.PG_DUMP || 'pg_dump';
const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '021-acesso-buffet-nuvem.sql'), 'utf8');
const alvo = (() => { const u = new URL(url); return `${u.hostname}:${u.port || 5432}${u.pathname}`; })();

function fazerBackup() {
  fs.mkdirSync(pastaBackup, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const arquivo = path.join(pastaBackup, `nuvem-antes-esquema-acesso-${stamp}.dump`);
  execFileSync(pgDump, ['--format=custom', '--no-owner', '--no-acl', '--dbname=' + url, '--file=' + arquivo], { stdio: 'inherit' });
  const tamanho = fs.statSync(arquivo).size;
  if (tamanho < 1024) throw new Error(`Backup saiu vazio (${tamanho} bytes): nada foi aplicado.`);
  return { arquivo, tamanho };
}

async function main() {
  console.log(`Alvo: ${alvo}`);
  console.log('Passos: backup -> aplicar 021 (transação única) -> conferir. Nenhum usuário é criado aqui.');
  if (!aplicar) {
    console.log('\nNada foi feito. Para aplicar, defina APLICAR_NUVEM=YES no mesmo comando.');
    return;
  }

  const backup = fazerBackup();
  console.log(`\nBackup gravado: ${backup.arquivo} (${(backup.tamanho / 1024 / 1024).toFixed(2)} MB)`);

  const cliente = new pg.Client({ connectionString: url, ssl: ssl ? { rejectUnauthorized: false } : false, connectionTimeoutMillis: 15000 });
  await cliente.connect();
  try {
    await cliente.query('BEGIN');
    await cliente.query(sql);
    await cliente.query('COMMIT');
    console.log('021 aplicado.');
  } catch (erro) {
    try { await cliente.query('ROLLBACK'); } catch { /* conexão já caiu */ }
    throw erro;
  }

  const funcoes = await cliente.query(
    `SELECT proname FROM pg_proc WHERE proname IN ('sincronizacaoEmpresasDoUsuario', 'sincronizacaoPerdeuAlteracoesDesde', 'sincronizacaoLimparFila') ORDER BY 1`
  );
  const tabela = await cliente.query(`SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sincronizacaoAcesso'`);
  const rls = await cliente.query(`SELECT count(*) AS c FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relrowsecurity`);
  if (funcoes.rows.length !== 3 || !tabela.rows.length) throw new Error('Conferência falhou: funções ou tabela de acesso não estão lá.');
  console.log(`Conferido: 3 funções, tabela de acesso ok, ${rls.rows[0].c} tabela(s) com RLS.`);
  await cliente.end();
}

main().catch((erro) => {
  console.error('❌', erro.message);
  process.exitCode = 1;
});
