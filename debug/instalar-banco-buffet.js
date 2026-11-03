// debug/instalar-banco-buffet.js - monta o banco local de um buffet novo, a partir da nuvem.
//
// O que faz, na ordem (sem confirmação só mostra o plano):
//   1. cria o usuário do aplicativo (pulyn_app) e o banco local vazio, dono desse usuário;
//   2. copia o SCHEMA da nuvem (sem dados) com pg_dump, usando o usuário do buffet;
//   3. aplica o schema no banco local;
//   4. faz a carga inicial: copia para o banco local os dados que a nuvem tem desta empresa;
//   5. mostra a linha DATABASE_URL para o .env de produção (a senha aparece uma vez só).
//
// Variáveis:
//   ADMIN_URL          conexão local como superusuário do PostgreSQL (ex.: postgres)
//   BANCO              nome do banco local (padrão AdvPulyn)
//   SYNC_NUVEM_URL     usuário do buffet na nuvem (gerado por preparar-acesso-buffet-nuvem.js)
//   SYNC_EMPRESA_ID    id da empresa
//   APLICAR_INSTALACAO=YES para executar; PG_DUMP (caminho do pg_dump, se não estiver no PATH)
//   SENHA_APP          senha do pulyn_app (se não vier, é gerada)
//   SSL_LOCAL=false    para o PostgreSQL local sem SSL (padrão false); SYNC_NUVEM_SSL (padrão true)
//
// Só roda em banco que ainda não tenha as tabelas do sistema (é uma instalação nova).
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const pg = require('pg');
const { criarSincronizador, tiposSemPerdaDePrecisao } = require('../utils/sincronizacao');

const adminUrl = process.env.ADMIN_URL;
const nuvemUrl = process.env.SYNC_NUVEM_URL;
const empresaId = process.env.SYNC_EMPRESA_ID;
if (!adminUrl || !nuvemUrl || !empresaId) throw new Error('Defina ADMIN_URL, SYNC_NUVEM_URL e SYNC_EMPRESA_ID.');

const banco = process.env.BANCO || 'AdvPulyn';
if (!/^[A-Za-z][A-Za-z0-9_]{1,40}$/.test(banco)) throw new Error('BANCO: use letras, números e _.');
const senhaApp = process.env.SENHA_APP || crypto.randomBytes(18).toString('hex');
if (!/^[A-Za-z0-9_-]{12,}$/.test(senhaApp)) throw new Error('SENHA_APP: pelo menos 12 letras, números, - ou _.');
const aplicar = process.env.APLICAR_INSTALACAO === 'YES';
const sslLocal = String(process.env.SSL_LOCAL || 'false').toLowerCase() === 'true';
const sslNuvem = String(process.env.SYNC_NUVEM_SSL || 'true').toLowerCase() !== 'false';
const pgDump = process.env.PG_DUMP || 'pg_dump';
const APP = process.env.USUARIO_APP || 'pulyn_app';
if (!/^[a-z][a-z0-9_]{2,30}$/.test(APP)) throw new Error('USUARIO_APP: use letras minúsculas, números e _.');

const ssl = (on) => (on ? { rejectUnauthorized: false } : false);
const types = tiposSemPerdaDePrecisao(pg);

// URL do banco local com o usuário do aplicativo.
function urlDoApp() {
  const u = new URL(adminUrl);
  u.username = APP;
  u.password = senhaApp;
  u.pathname = '/' + banco;
  return u.toString();
}

function schemaDaNuvem() {
  const arquivo = path.join(os.tmpdir(), `pulyn-schema-${Date.now()}.sql`);
  execFileSync(pgDump, ['--schema-only', '--no-owner', '--no-acl', '--dbname=' + nuvemUrl, '--file=' + arquivo], { stdio: 'inherit' });
  const sql = fs.readFileSync(arquivo, 'utf8').split('\n').filter((linha) => !linha.startsWith('\\')).join('\n');
  fs.unlinkSync(arquivo);
  if (!/CREATE TABLE/.test(sql)) throw new Error('O schema da nuvem veio sem tabelas.');
  return sql;
}

async function main() {
  console.log(`Banco local: ${banco} (usuário ${APP})`);
  console.log(`Nuvem: ${new URL(nuvemUrl).hostname} (empresa ${empresaId})`);
  console.log('Passos: criar usuário e banco -> schema da nuvem -> carga inicial -> linha do .env.');
  if (!aplicar) {
    console.log('\nNada foi feito. Para instalar, defina APLICAR_INSTALACAO=YES no mesmo comando.');
    return;
  }

  // 1. usuário e banco
  const admin = new pg.Client({ connectionString: adminUrl, ssl: ssl(sslLocal) });
  await admin.connect();
  const jaExiste = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [banco]);
  if (jaExiste.rows.length) throw new Error(`O banco ${banco} já existe. Esta instalação é só para banco novo.`);
  // Nunca troca a senha de um usuário que já existe: ele pode ser de outra instalação.
  const papel = await admin.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [APP]);
  if (papel.rows.length) throw new Error(`O usuário ${APP} já existe neste PostgreSQL. Use outro nome em USUARIO_APP.`);
  await admin.query(`CREATE ROLE ${APP} LOGIN PASSWORD '${senhaApp}'`);
  await admin.query(`CREATE DATABASE ${banco} OWNER ${APP} ENCODING 'UTF8'`);
  await admin.end();
  console.log('Usuário e banco criados.');

  // 2 e 3. schema da nuvem no banco local, como dono do banco
  const dono = new pg.Client({ connectionString: urlDoApp(), ssl: ssl(sslLocal) });
  await dono.connect();
  await dono.query(schemaDaNuvem());
  const tabelas = await dono.query(`SELECT count(*) AS c FROM information_schema.tables WHERE table_schema = 'public'`);
  await dono.end();
  console.log(`Schema aplicado: ${tabelas.rows[0].c} tabelas.`);

  // 4. carga inicial a partir da nuvem
  const poolLocal = new pg.Pool({ connectionString: urlDoApp(), ssl: ssl(sslLocal), max: 3, types });
  const poolNuvem = new pg.Pool({ connectionString: nuvemUrl, ssl: ssl(sslNuvem), max: 3, types });
  try {
    const sync = criarSincronizador({
      local: poolLocal,
      nuvem: poolNuvem,
      empresaId,
      log: { warn: console.warn, info: console.log, error: console.error },
      margemNuvemSegundos: 60,
    });
    await sync.recarregarAgora();
    const { rows: [{ c }] } = await poolLocal.query('SELECT count(*) AS c FROM "evento"');
    const { rows: [{ c: nuvemC }] } = await poolNuvem.query('SELECT count(*) AS c FROM "evento" WHERE "empresaId" = $1', [empresaId]);
    if (Number(c) !== Number(nuvemC)) throw new Error(`Carga incompleta: ${c} eventos aqui, ${nuvemC} na nuvem.`);
    console.log(`Carga inicial: ${c} evento(s), igual à nuvem.`);
  } finally {
    await Promise.allSettled([poolLocal.end(), poolNuvem.end()]);
  }

  // 5. linha do .env
  console.log('\nGuarde esta linha no .env de produção (a senha não é mostrada de novo):');
  console.log(`DATABASE_URL=${urlDoApp()}`);
  console.log(`(senha do ${APP}: ${senhaApp})`);
}

main().catch((erro) => {
  console.error('❌', erro.message);
  process.exitCode = 1;
});
