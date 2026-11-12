// criar-master.js - cria a empresa da Pulyn e o usuario master num banco novo (instalacao com banco limpo).
// Usado por 02-banco-producao.ps1 -BancoLimpo. Le tudo de variaveis de ambiente (nada de senha na linha de comando):
//   DATABASE_URL   conexao com o banco novo (usuario do aplicativo)
//   MASTER_EMAIL   e-mail de login do master
//   MASTER_SENHA   senha do master (guardada so como hash scrypt, igual ao login do sistema)
//   MASTER_EMPRESA nome da empresa do master (padrao: Pulyn)
// Nao faz nada se o banco ja tiver um master.
const crypto = require('crypto');
const pg = require('pg');
const { hashSenha, validarSenhaNova } = require('../../utils/senhas');

const url = process.env.DATABASE_URL;
const email = String(process.env.MASTER_EMAIL || '').trim().toLowerCase();
const senha = String(process.env.MASTER_SENHA || '');
const nomeEmpresa = String(process.env.MASTER_EMPRESA || 'Pulyn').trim() || 'Pulyn';

async function main() {
  if (!url) throw new Error('Defina DATABASE_URL.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('MASTER_EMAIL invalido.');
  const problema = validarSenhaNova(senha);
  if (problema) throw new Error(problema);

  const cliente = new pg.Client({ connectionString: url });
  await cliente.connect();
  try {
    const ja = await cliente.query(`SELECT 1 FROM login WHERE perfil = 'master' LIMIT 1`);
    if (ja.rows.length) {
      console.log('O banco ja tem um usuario master: nada foi criado.');
      return;
    }
    const empresaId = crypto.randomUUID();
    const loginId = crypto.randomUUID();
    await cliente.query('BEGIN');
    await cliente.query(
      `INSERT INTO empresa ("empresaId", nome, status) VALUES ($1, $2, 'active')`,
      [empresaId, nomeEmpresa]
    );
    await cliente.query(
      `INSERT INTO login ("loginId", "empresaId", email, senha, status, perfil, "nomeFamilia", "senhaTemporaria")
       VALUES ($1, $2, $3, $4, 'active', 'master', 'Master', false)`,
      [loginId, empresaId, email, hashSenha(senha)]
    );
    await cliente.query('COMMIT');
    console.log(`Usuario master criado: ${email} (empresa ${nomeEmpresa}).`);
  } catch (erro) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw erro;
  } finally {
    await cliente.end();
  }
}

main().catch((erro) => {
  console.error('ERRO: ' + erro.message);
  process.exitCode = 1;
});
