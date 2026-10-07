#!/usr/bin/env node
// conferir-sincronizacao.js - compara o banco local com a nuvem, tabela por tabela (só leitura).
// Uso: npm run sync:conferir      (usa DATABASE_URL e SYNC_NUVEM_URL do .env)
// Saída: quantas tabelas estão idênticas e, para as diferentes, quantas linhas há de cada lado.
// Código de saída: 0 = tudo idêntico; 1 = há diferenças; 2 = não conseguiu conferir.
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Client } = require('pg');

const ligado = (valor, padrao = 'true') => String(valor ?? padrao).toLowerCase() !== 'false';

function conexao(url, ssl) {
  return new Client({ connectionString: url, ssl: ssl ? { rejectUnauthorized: false } : false });
}

async function main() {
  const urlLocal = process.env.DATABASE_URL;
  const urlNuvem = process.env.SYNC_NUVEM_URL;
  if (!urlLocal || !urlNuvem) {
    console.error('Defina DATABASE_URL e SYNC_NUVEM_URL no .env.');
    process.exit(2);
  }
  const local = conexao(urlLocal, ligado(process.env.DB_SSL, 'true'));
  const nuvem = conexao(urlNuvem, ligado(process.env.SYNC_NUVEM_SSL, 'true'));
  await local.connect();
  await nuvem.connect();
  // Mesmo fuso nos dois lados, para a comparação de datas não ser distorcida; e nada é gravado.
  for (const cliente of [local, nuvem]) {
    await cliente.query("SET TIME ZONE 'UTC'");
    await cliente.query('SET default_transaction_read_only = on');
  }

  const tabelas = (await local.query(
    `SELECT tablename AS t FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE 'sincronizacao%' ORDER BY 1`
  )).rows.map((linha) => linha.t);

  const diferentes = [];
  for (const tabela of tabelas) {
    const chave = (await local.query(
      `SELECT string_agg(quote_ident(a.attname), ',' ORDER BY array_position(k.conkey, a.attnum)) AS c
       FROM pg_constraint k JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = ANY (k.conkey)
       WHERE k.conrelid = $1::regclass AND k.contype = 'p'`, [`"${tabela}"`]
    )).rows[0].c;
    const existeNaNuvem = (await nuvem.query('SELECT to_regclass($1) AS r', [`"${tabela}"`])).rows[0].r;
    if (!existeNaNuvem) { diferentes.push({ tabela, local: '?', nuvem: 'tabela ausente' }); continue; }
    const sql = `SELECT count(*) AS n, md5(coalesce(string_agg(x::text, ',' ORDER BY ${chave}), '')) AS h FROM "${tabela}" x`;
    const a = (await local.query(sql)).rows[0];
    const b = (await nuvem.query(sql)).rows[0];
    if (a.n !== b.n || a.h !== b.h) diferentes.push({ tabela, local: a.n, nuvem: b.n, mesmaContagem: a.n === b.n });
  }

  let pendentes = null;
  try {
    pendentes = (await local.query('SELECT count(*) AS n FROM "sincronizacaoFila" WHERE "enviadoEm" IS NULL')).rows[0].n;
  } catch { /* o mecanismo ainda não foi instalado */ }

  console.log(`Tabelas comparadas: ${tabelas.length} | idênticas: ${tabelas.length - diferentes.length} | diferentes: ${diferentes.length}`);
  for (const d of diferentes) {
    const detalhe = d.mesmaContagem ? 'mesma quantidade de linhas, mas conteúdo diferente' : `local ${d.local} linha(s) x nuvem ${d.nuvem}`;
    console.log(`  - ${d.tabela}: ${detalhe}`);
  }
  if (pendentes !== null) console.log(`Mudanças ainda na fila para enviar: ${pendentes}`);
  if (diferentes.length && pendentes > 0) {
    console.log('Há mudanças na fila: espere o próximo ciclo (padrão 15 s) e rode de novo.');
  }
  await local.end();
  await nuvem.end();
  process.exit(diferentes.length ? 1 : 0);
}

main().catch((erro) => {
  console.error('Não foi possível conferir:', erro.message);
  process.exit(2);
});
