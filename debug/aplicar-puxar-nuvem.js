// debug/aplicar-puxar-nuvem.js - aplica na NUVEM (SYNC_NUVEM_URL) a versão nova do gatilho da fila, que a puxada precisa.
//
// Sem nenhuma confirmação, só mostra o que faria. Para aplicar de verdade:
//   1. faz um backup da nuvem (pg_dump, formato custom) em PULYN_BACKUPS (padrão: ./backups-nuvem);
//   2. se o backup falhar ou sair vazio, para sem aplicar nada;
//   3. aplica o migrations/018-sincronizacao-fila.sql numa única transação (se algo falhar, nada muda);
//   4. confere se a coluna empresaId existe e se o gatilho novo está instalado.
//
// Variáveis: SYNC_NUVEM_URL (obrigatória), APLICAR_NUVEM=YES (para aplicar), PG_DUMP (caminho do pg_dump, se não
// estiver no PATH), PULYN_BACKUPS (pasta do backup).
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const pg = require('pg');

const url = process.env.SYNC_NUVEM_URL;
if (!url) throw new Error('Defina SYNC_NUVEM_URL (o endereço da nuvem) no ambiente do comando.');
const aplicar = process.env.APLICAR_NUVEM === 'YES';
const pastaBackup = process.env.PULYN_BACKUPS || path.join(process.cwd(), 'backups-nuvem');
const pgDump = process.env.PG_DUMP || 'pg_dump';
const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '018-sincronizacao-fila.sql'), 'utf8');

// Mostra só o servidor e o banco, sem usuário nem senha.
const alvo = (() => { const u = new URL(url); return `${u.hostname}:${u.port || 5432}${u.pathname}`; })();

function fazerBackup() {
  fs.mkdirSync(pastaBackup, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const arquivo = path.join(pastaBackup, `nuvem-antes-puxar-${stamp}.dump`);
  // A URL vai por variável de ambiente para não aparecer na linha de comando.
  execFileSync(pgDump, ['--format=custom', '--no-owner', '--no-acl', '--dbname=' + url, '--file=' + arquivo], {
    stdio: 'inherit',
    env: { ...process.env },
  });
  const tamanho = fs.statSync(arquivo).size;
  if (tamanho < 1024) throw new Error(`Backup saiu vazio (${tamanho} bytes): nada foi aplicado.`);
  return { arquivo, tamanho };
}

async function main() {
  console.log(`Alvo: ${alvo}`);
  console.log(`Passos: backup -> aplicar 018 (transação única) -> conferir.`);

  if (!aplicar) {
    console.log('\nNada foi feito. Para aplicar de verdade, defina APLICAR_NUVEM=YES no mesmo comando.');
    return;
  }

  const backup = fazerBackup();
  console.log(`\nBackup gravado: ${backup.arquivo} (${(backup.tamanho / 1024 / 1024).toFixed(2)} MB)`);

  const ssl = String(process.env.SYNC_NUVEM_SSL || 'true').toLowerCase() !== 'false';
  const cliente = new pg.Client({ connectionString: url, ssl: ssl ? { rejectUnauthorized: false } : false, connectionTimeoutMillis: 15000 });
  await cliente.connect();
  try {
    await cliente.query('BEGIN');
    await cliente.query(sql);
    await cliente.query('COMMIT');
    console.log('018 aplicado.');
  } catch (erro) {
    try { await cliente.query('ROLLBACK'); } catch { /* conexão já caiu */ }
    throw erro;
  }

  const coluna = await cliente.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sincronizacaoFila' AND column_name = 'empresaId'`
  );
  const gatilho = await cliente.query(
    `SELECT pg_get_functiondef(p.oid) AS definicao FROM pg_proc p WHERE p.proname = 'sincronizacaoRegistrar'`
  );
  const gatilhos = await cliente.query(`SELECT count(*) AS c FROM pg_trigger WHERE tgname = 'sincronizacaoGatilho' AND NOT tgisinternal`);
  if (!coluna.rows.length) throw new Error('Conferência falhou: a coluna empresaId não existe na fila.');
  if (!gatilho.rows[0] || !gatilho.rows[0].definicao.includes('pulyn.sync_ignorar')) {
    throw new Error('Conferência falhou: a função do gatilho não é a versão nova.');
  }
  console.log(`Conferido: coluna empresaId ok, função nova ok, ${gatilhos.rows[0].c} gatilho(s) instalado(s).`);
  await cliente.end();
}

main().catch((erro) => {
  console.error('❌', erro.message);
  process.exitCode = 1;
});
