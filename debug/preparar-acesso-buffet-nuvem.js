// debug/preparar-acesso-buffet-nuvem.js - prepara na NUVEM (SYNC_NUVEM_URL) o acesso de um buffet.
//
// Sem confirmação, só mostra o plano. Com APLICAR_NUVEM=YES:
//   1. faz backup da nuvem (pg_dump, formato custom) em PULYN_BACKUPS (padrão: ./backups-nuvem); sem backup, não aplica;
//   2. aplica o migrations/021-acesso-buffet-nuvem.sql numa transação (RLS, limpeza e checagem de lacuna);
//   3. cria (ou troca a senha de) um usuário para a empresa e concede só o que o buffet precisa;
//   4. confere: o usuário entra, enxerga as linhas da empresa e não enxerga as de outra.
//
// Variáveis: SYNC_NUVEM_URL (obrigatória), EMPRESA_ID (obrigatória), USUARIO (padrão: buffet_<início do id>),
// SENHA (se não vier, é gerada e mostrada uma única vez), APLICAR_NUVEM=YES, PG_DUMP, PULYN_BACKUPS,
// SYNC_NUVEM_SSL=false para banco sem SSL (teste local).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const pg = require('pg');

const url = process.env.SYNC_NUVEM_URL;
const empresaId = process.env.EMPRESA_ID;
if (!url) throw new Error('Defina SYNC_NUVEM_URL (o endereço da nuvem).');
if (!empresaId || !/^[A-Za-z0-9-]{8,64}$/.test(empresaId)) throw new Error('Defina EMPRESA_ID (o id da empresa, só letras, números e hífen).');

const usuario = process.env.USUARIO || `buffet_${empresaId.replace(/-/g, '').slice(0, 8)}`;
if (!/^[a-z][a-z0-9_]{2,30}$/.test(usuario)) throw new Error('USUARIO: use letras minúsculas, números e _ (3 a 31 caracteres).');
const senha = process.env.SENHA || crypto.randomBytes(18).toString('hex');
if (!/^[A-Za-z0-9_-]{12,}$/.test(senha)) throw new Error('SENHA: use pelo menos 12 letras, números, - ou _.');

const aplicar = process.env.APLICAR_NUVEM === 'YES';
const ssl = String(process.env.SYNC_NUVEM_SSL || 'true').toLowerCase() !== 'false';
const pastaBackup = process.env.PULYN_BACKUPS || path.join(process.cwd(), 'backups-nuvem');
const pgDump = process.env.PG_DUMP || 'pg_dump';
const sql021 = fs.readFileSync(path.join(__dirname, '..', 'migrations', '021-acesso-buffet-nuvem.sql'), 'utf8');

const alvo = (() => { const u = new URL(url); return `${u.hostname}:${u.port || 5432}${u.pathname}`; })();

function fazerBackup() {
  fs.mkdirSync(pastaBackup, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const arquivo = path.join(pastaBackup, `nuvem-antes-acesso-${stamp}.dump`);
  execFileSync(pgDump, ['--format=custom', '--no-owner', '--no-acl', '--dbname=' + url, '--file=' + arquivo], { stdio: 'inherit' });
  const tamanho = fs.statSync(arquivo).size;
  if (tamanho < 1024) throw new Error(`Backup saiu vazio (${tamanho} bytes): nada foi aplicado.`);
  return { arquivo, tamanho };
}

// O pooler do Supabase identifica o projeto pelo sufixo do usuário (postgres.<referencia>): o usuário do buffet
// precisa levar o mesmo sufixo.
function usuarioDeConexao() {
  const donoDaUrl = decodeURIComponent(new URL(url).username);
  const posicao = donoDaUrl.indexOf('.');
  return posicao === -1 ? usuario : `${usuario}${donoDaUrl.slice(posicao)}`;
}

const conectar = (connectionString) => {
  const cliente = new pg.Client({ connectionString, ssl: ssl ? { rejectUnauthorized: false } : false, connectionTimeoutMillis: 15000 });
  return cliente.connect().then(() => cliente);
};

// Tabelas com coluna de empresa (ou `empresas`): o buffet pode alterar só essas.
async function tabelasDaEmpresa(cliente) {
  const r = await cliente.query(`
    SELECT DISTINCT c.table_name AS tabela FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND (c.column_name IN ('empresaId', 'empresa_id') OR c.table_name = 'empresas')
      AND c.table_name <> 'sincronizacaoAcesso'
    ORDER BY 1`);
  return r.rows.map((linha) => linha.tabela);
}

async function main() {
  console.log(`Alvo: ${alvo}`);
  console.log(`Empresa: ${empresaId}`);
  console.log(`Usuário do buffet: ${usuario}`);
  console.log('Passos: backup -> aplicar 021 -> criar usuário e permissões -> conferir.');

  if (!aplicar) {
    console.log('\nNada foi feito. Para aplicar, defina APLICAR_NUVEM=YES no mesmo comando.');
    return;
  }

  const backup = fazerBackup();
  console.log(`\nBackup gravado: ${backup.arquivo} (${(backup.tamanho / 1024 / 1024).toFixed(2)} MB)`);

  const dono = await conectar(url);
  try {
    await dono.query('BEGIN');
    await dono.query(sql021);
    const existe = await dono.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [usuario]);
    // Nome de usuário já validado acima (só letras, números e _), então pode entrar no comando sem aspas.
    await dono.query(existe.rows.length
      ? `ALTER ROLE ${usuario} LOGIN PASSWORD '${senha}'`
      : `CREATE ROLE ${usuario} LOGIN PASSWORD '${senha}'`);
    await dono.query('GRANT USAGE ON SCHEMA public TO ' + usuario);
    await dono.query('GRANT SELECT ON ALL TABLES IN SCHEMA public TO ' + usuario);
    for (const tabela of await tabelasDaEmpresa(dono)) {
      await dono.query(`GRANT INSERT, UPDATE, DELETE ON "${tabela}" TO ${usuario}`);
    }
    await dono.query(
      `INSERT INTO "sincronizacaoAcesso" ("usuario", "empresaId") VALUES ($1, $2)
       ON CONFLICT ("usuario") DO UPDATE SET "empresaId" = EXCLUDED."empresaId"`,
      [usuario, empresaId]
    );
    await dono.query('COMMIT');
    console.log('Migração 021 aplicada e usuário criado.');
  } catch (erro) {
    try { await dono.query('ROLLBACK'); } catch { /* conexão já caiu */ }
    throw erro;
  } finally {
    await dono.end();
  }

  // Conferência: entra com o usuário novo e vê só a empresa dele.
  const u = new URL(url);
  u.username = usuarioDeConexao();
  u.password = senha;
  const buffet = await conectar(u.toString());
  try {
    const minhas = await buffet.query('SELECT count(*) AS c FROM "evento"');
    const outras = await buffet.query('SELECT count(*) AS c FROM "evento" WHERE "empresaId" IS DISTINCT FROM $1', [empresaId]);
    if (Number(outras.rows[0].c) !== 0) throw new Error('Conferência falhou: o usuário enxerga eventos de outra empresa.');
    console.log(`Conferido: o usuário entra e enxerga ${minhas.rows[0].c} evento(s), todos da empresa.`);
  } finally {
    await buffet.end();
  }

  console.log('\nGuarde esta senha agora; ela não é mostrada de novo:');
  const paraBuffet = new URL(url);
  paraBuffet.username = usuarioDeConexao();
  paraBuffet.password = senha;
  console.log(`SYNC_NUVEM_URL=${paraBuffet.toString()}`);
}

main().catch((erro) => {
  console.error('❌', erro.message);
  process.exitCode = 1;
});
