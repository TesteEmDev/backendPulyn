// Corrige texto com acentos corrompidos ("HerÃ³is" -> "Heróis") em TODAS as tabelas do banco.
//
// Esse problema aparece quando um dump em UTF-8 é restaurado com a codificação do cliente errada
// (cp1252 em vez de UTF-8): cada byte do acento vira um caractere próprio e o texto é regravado em UTF-8.
// O script desfaz essa dupla codificação, valor por valor, e só mexe no que voltar a ser UTF-8 válido.
//
// Uso (a partir da pasta backendPulyn):
//   node debug/corrigir-acentos.js            -> só mostra o que seria corrigido (não altera nada)
//   node debug/corrigir-acentos.js --aplicar  -> corrige; antes salva os valores atuais em backups-acentos/
//
// Para restaurar um dump sem corromper de novo, use: PGCLIENTENCODING=UTF8 psql ... -f arquivo.sql

const fs = require('fs');
const path = require('path');
const { connectDB, closeDB } = require('../database');

const APLICAR = process.argv.includes('--aplicar');
const SCHEMA = (process.argv.find(arg => arg.startsWith('--schema=')) || '--schema=public').split('=')[1];

// Caracteres que o cp1252 usa nas posições 0x80-0x9F (o resto coincide com latin1).
const CP1252 = {
  0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…', 0x86: '†', 0x87: '‡', 0x88: 'ˆ', 0x89: '‰',
  0x8A: 'Š', 0x8B: '‹', 0x8C: 'Œ', 0x8E: 'Ž', 0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•',
  0x96: '–', 0x97: '—', 0x98: '˜', 0x99: '™', 0x9A: 'š', 0x9B: '›', 0x9C: 'œ', 0x9E: 'ž', 0x9F: 'Ÿ',
};
const BYTE_DO_CARACTERE = new Map(Object.entries(CP1252).map(([byte, ch]) => [ch, Number(byte)]));
const DECODIFICADOR = new TextDecoder('utf-8', { fatal: true });

// Devolve o texto corrigido, ou null se o valor não estiver corrompido (ou não puder ser desfeito com segurança).
function reparar(valor) {
  if (typeof valor !== 'string' || !/[ÃÂâð]/.test(valor)) return null;
  const bytes = [];
  for (const ch of valor) {
    const codigo = ch.codePointAt(0);
    if (codigo < 256) bytes.push(codigo);
    else if (BYTE_DO_CARACTERE.has(ch)) bytes.push(BYTE_DO_CARACTERE.get(ch));
    else return null; // tem caractere que não veio de cp1252: provavelmente é texto legítimo
  }
  let corrigido;
  try {
    corrigido = DECODIFICADOR.decode(Buffer.from(bytes));
  } catch {
    return null; // não forma UTF-8 válido: deixa como está
  }
  return corrigido !== valor ? corrigido : null;
}

const aspas = nome => `"${String(nome).replace(/"/g, '""')}"`;

async function listarColunas(pool) {
  const { rows } = await pool.query(
    `SELECT c.table_name AS tabela, c.column_name AS coluna, c.data_type AS tipo
       FROM information_schema.columns c
       JOIN information_schema.tables t
         ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
      WHERE c.table_schema = $1
        AND c.data_type IN ('text', 'character varying', 'character', 'json', 'jsonb')
        AND c.is_generated = 'NEVER'
      ORDER BY c.table_name, c.ordinal_position`,
    [SCHEMA]
  );
  const porTabela = new Map();
  for (const { tabela, coluna, tipo } of rows) {
    if (!porTabela.has(tabela)) porTabela.set(tabela, []);
    porTabela.get(tabela).push({ coluna, tipo });
  }
  return porTabela;
}

async function chavePrimaria(pool, tabela) {
  const { rows } = await pool.query(
    `SELECT a.attname AS coluna
       FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
      WHERE i.indisprimary AND i.indrelid = $1::regclass
      ORDER BY array_position(i.indkey::int2[], a.attnum)`,
    [`${aspas(SCHEMA)}.${aspas(tabela)}`]
  );
  return rows.map(r => r.coluna);
}

async function processarTabela(pool, tabela, colunas, relatorio, aplicar) {
  const pk = await chavePrimaria(pool, tabela);
  const selecionar = colunas.map(c => `${aspas(c.coluna)}::text AS ${aspas(c.coluna)}`).join(', ');
  const suspeito = colunas.map(c => `${aspas(c.coluna)}::text ~ '[ÃÂâð]'`).join(' OR ');
  const alvo = `${aspas(SCHEMA)}.${aspas(tabela)}`;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT ctid::text AS _ctid, ${selecionar}${pk.length ? ', ' + pk.map(aspas).join(', ') : ''}
         FROM ${alvo} WHERE ${suspeito} FOR UPDATE`
    );

    for (const linha of rows) {
      const mudancas = {};
      for (const { coluna } of colunas) {
        const novo = reparar(linha[coluna]);
        if (novo !== null) mudancas[coluna] = { antes: linha[coluna], depois: novo };
      }
      if (!Object.keys(mudancas).length) continue;

      const identificacao = pk.length ? Object.fromEntries(pk.map(c => [c, linha[c]])) : { ctid: linha._ctid };
      relatorio.push({ tabela, identificacao, mudancas });

      if (aplicar) {
        const tipos = new Map(colunas.map(c => [c.coluna, c.tipo]));
        const nomes = Object.keys(mudancas);
        const sets = nomes.map((n, i) => `${aspas(n)} = $${i + 1}${/^jsonb?$/.test(tipos.get(n)) ? '::' + tipos.get(n) : ''}`);
        const valores = nomes.map(n => mudancas[n].depois);
        const onde = pk.length
          ? pk.map((c, i) => `${aspas(c)} = $${nomes.length + i + 1}`).join(' AND ')
          : `ctid = $${nomes.length + 1}::tid`;
        const chaves = pk.length ? pk.map(c => linha[c]) : [linha._ctid];
        await client.query(`UPDATE ${alvo} SET ${sets.join(', ')} WHERE ${onde}`, [...valores, ...chaves]);
      }
    }
    await client.query('COMMIT');
  } catch (erro) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(`❌ ${tabela}: ${erro.message} (tabela ignorada)`);
  } finally {
    client.release();
  }
}

function resumo(texto) {
  const limpo = String(texto).replace(/\s+/g, ' ');
  return limpo.length > 60 ? `${limpo.slice(0, 60)}…` : limpo;
}

async function main() {
  console.log(`🔎 Procurando acentos corrompidos no schema "${SCHEMA}" (${APLICAR ? 'MODO APLICAR' : 'simulação, nada será alterado'})...`);
  const pool = await connectDB();
  const tabelas = await listarColunas(pool);
  const relatorio = [];

  // 1ª passada: só levanta o que está corrompido (nada é gravado).
  for (const [tabela, colunas] of tabelas) {
    await processarTabela(pool, tabela, colunas, relatorio, false);
  }

  if (!relatorio.length) {
    console.log('✅ Nenhum texto corrompido encontrado.');
    return;
  }

  const contagem = {};
  for (const item of relatorio) {
    contagem[item.tabela] = (contagem[item.tabela] || 0) + 1;
    for (const [coluna, { antes, depois }] of Object.entries(item.mudancas)) {
      console.log(`  ${item.tabela}.${coluna}: "${resumo(antes)}" -> "${resumo(depois)}"`);
    }
  }
  console.log('\n📋 Linhas por tabela:', contagem);
  console.log(`Total: ${relatorio.length} linha(s).`);

  if (APLICAR) {
    // O backup é gravado ANTES de qualquer UPDATE.
    const pasta = path.join(__dirname, '..', 'backups-acentos');
    fs.mkdirSync(pasta, { recursive: true });
    const arquivo = path.join(pasta, `acentos-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(arquivo, JSON.stringify(relatorio, null, 2), 'utf8');
    console.log(`💾 Valores anteriores guardados em ${arquivo}`);
    for (const [tabela, colunas] of tabelas) {
      await processarTabela(pool, tabela, colunas, [], true);
    }
    console.log('✅ Corrigido.');
  } else {
    console.log('\nNada foi alterado. Para corrigir de verdade: node debug/corrigir-acentos.js --aplicar');
  }
}

main()
  .catch(erro => {
    console.error('❌ Erro:', erro.message);
    process.exitCode = 1;
  })
  .finally(() => closeDB().catch(() => {}));
