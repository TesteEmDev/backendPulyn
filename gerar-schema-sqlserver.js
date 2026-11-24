// Gera o script T-SQL (SQL Server) com todas as tabelas, chaves e índices do banco Postgres local.
// Uso:  node gerar-schema-sqlserver.js [arquivo-de-saida]
// Lê a conexão do .env (DB_DRIVER=postgres). Não copia dados, só a estrutura.
// Fora do script (de propósito): gatilhos e funções da sincronização nuvem<->buffet (são PL/pgSQL).
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { Client } = require('pg');

const saida = process.argv[2] || path.join(__dirname, 'schema-sqlserver.sql');
const q = (id) => `[${String(id).replace(/]/g, ']]')}]`;
const avisos = [];

const colunasDeChave = new Set(); // tabela.coluna usadas em PK/único/índice (nvarchar(max) não pode ser chave)

function tipoSql(c) {
  switch (c.data_type) {
    case 'character varying':
      if (c.character_maximum_length) return `nvarchar(${c.character_maximum_length})`;
      return colunasDeChave.has(`${c.table_name}.${c.column_name}`) ? 'nvarchar(450)' : 'nvarchar(max)';
    case 'character': return `nchar(${c.character_maximum_length || 1})`;
    case 'text': case 'jsonb': case 'json': return colunasDeChave.has(`${c.table_name}.${c.column_name}`) ? 'nvarchar(450)' : 'nvarchar(max)';
    case 'integer': return 'int';
    case 'bigint': return 'bigint';
    case 'smallint': return 'smallint';
    case 'numeric': return c.numeric_precision ? `decimal(${c.numeric_precision},${c.numeric_scale || 0})` : 'decimal(38,10)';
    case 'double precision': return 'float';
    case 'real': return 'real';
    case 'boolean': return 'bit';
    case 'timestamp with time zone': return 'datetimeoffset(3)';
    case 'timestamp without time zone': return 'datetime2(3)';
    case 'date': return 'date';
    case 'time without time zone': return 'time(3)';
    case 'uuid': return 'uniqueidentifier';
    default: avisos.push(`Tipo sem conversão: ${c.table_name}.${c.column_name} (${c.data_type})`); return 'nvarchar(max)';
  }
}

function padraoSql(c, tipo) {
  const d = c.column_default;
  if (d == null) return null;
  if (/^nextval\(/i.test(d)) return null; // vira IDENTITY
  if (/^(now\(\)|CURRENT_TIMESTAMP)$/i.test(d)) return tipo.startsWith('datetimeoffset') ? 'SYSDATETIMEOFFSET()' : 'SYSDATETIME()';
  if (/^gen_random_uuid\(\)$/i.test(d)) return 'NEWID()';
  if (d === 'true') return '1';
  if (d === 'false') return '0';
  if (/^-?\d+(\.\d+)?$/.test(d)) return d;
  const m = d.match(/^'((?:[^']|'')*)'::[\w\s]+$/);
  if (m) {
    if (/^-?\d+(\.\d+)?$/.test(m[1]) && /int|decimal|float|real/.test(tipo)) return m[1];
    return `N'${m[1]}'`;
  }
  avisos.push(`Padrão sem conversão (ignorado): ${c.table_name}.${c.column_name} = ${d}`);
  return null;
}

// Converte expressão do Postgres (predicado de índice parcial) para T-SQL
function exprSql(e) {
  return e
    .replace(/::(text|character varying|bpchar)/g, '')
    .replace(/"([^"]+)"/g, (_, n) => q(n))
    .replace(/\(\(([^()]+)\)\)/g, '($1)');
}

(async () => {
  const cs = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  const ssl = String(process.env.DB_SSL || 'true').toLowerCase() !== 'false' ? { rejectUnauthorized: false } : false;
  const cli = new Client(cs ? { connectionString: cs, ssl } : {
    host: process.env.PGHOST, port: process.env.PGPORT, database: process.env.PGDATABASE,
    user: process.env.PGUSER, password: process.env.PGPASSWORD, ssl,
  });
  await cli.connect();
  const rows = async (sql) => (await cli.query(sql)).rows;

  const tabelas = (await rows(`select table_name from information_schema.tables
    where table_schema='public' and table_type='BASE TABLE' order by table_name`)).map((r) => r.table_name);
  const colunas = await rows(`select table_name, column_name, data_type, character_maximum_length, numeric_precision,
      numeric_scale, is_nullable, column_default, is_identity
    from information_schema.columns where table_schema='public' order by table_name, ordinal_position`);

  const cons = await rows(`select c.conname, c.contype, t.relname tabela,
      (select array_agg(a.attname::text order by k.ord) from unnest(c.conkey) with ordinality k(attnum, ord)
         join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.attnum) cols,
      ft.relname ftabela,
      (select array_agg(a.attname::text order by k.ord) from unnest(c.confkey) with ordinality k(attnum, ord)
         join pg_attribute a on a.attrelid=c.confrelid and a.attnum=k.attnum) fcols,
      c.confdeltype, c.confupdtype, pg_get_constraintdef(c.oid) def
    from pg_constraint c join pg_class t on t.oid=c.conrelid left join pg_class ft on ft.oid=c.confrelid
    where c.connamespace='public'::regnamespace and c.contype in ('p','u','f','c') order by t.relname, c.contype, c.conname`);

  const idx = await rows(`select i.relname idxname, t.relname tabela, x.indisunique,
      am.amname, pg_get_expr(x.indpred, x.indrelid) pred, x.indnkeyatts, x.indnatts,
      (select array_agg(pg_get_indexdef(x.indexrelid, n, true) order by n) from generate_series(1, x.indnatts) n) defs,
      x.indoption::text opts
    from pg_index x join pg_class i on i.oid=x.indexrelid join pg_class t on t.oid=x.indrelid
    join pg_am am on am.oid=i.relam
    where t.relnamespace='public'::regnamespace and not x.indisprimary
      and not exists (select 1 from pg_constraint c where c.conindid=x.indexrelid and c.contype in ('p','u'))
    order by t.relname, i.relname`);

  for (const c of cons) if (c.contype === 'p' || c.contype === 'u') c.cols.forEach((n) => colunasDeChave.add(`${c.tabela}.${n}`));
  for (const i of idx) i.defs.forEach((d) => (d.match(/[A-Za-z_]\w*|"[^"]+"/g) || []).forEach((n) => colunasDeChave.add(`${i.tabela}.${n.replace(/"/g, '')}`)));

  // únicos repetidos na mesma tabela/colunas (o Postgres aceita, o SQL Server reclama): fica só o primeiro
  const unicosVistos = new Set();
  for (const c of cons) {
    if (c.contype !== 'u') continue;
    const k = `${c.tabela}|${c.cols.join(',').toLowerCase()}`;
    if (unicosVistos.has(k)) { c.duplicado = true; avisos.push(`Único repetido omitido: ${c.conname} em ${c.tabela}`); } else unicosVistos.add(k);
  }

  const porTabela = {};
  for (const c of colunas) (porTabela[c.table_name] ||= []).push(c);
  const nulaveis = new Set(colunas.filter((c) => c.is_nullable === 'YES').map((c) => `${c.table_name}.${c.column_name}`));

  const out = [];
  out.push(`-- =====================================================================`);
  out.push(`-- Pulyn - estrutura do banco para SQL Server (ex.: tryasp.net / SmarterASP.NET)`);
  out.push(`-- Gerado em ${new Date().toISOString()} a partir do banco "${(await rows('select current_database() d'))[0].d}" (PostgreSQL).`);
  out.push(`-- Só estrutura (tabelas, chaves, índices). Sem dados, sem gatilhos de sincronização.`);
  out.push(`-- Rode em um banco vazio. Não precisa de USE nem de GO.`);
  out.push(`-- =====================================================================`);
  out.push(`SET ANSI_NULLS ON;`);
  out.push(`SET QUOTED_IDENTIFIER ON;`);
  out.push('');

  out.push(`-- ============================ TABELAS ============================`);
  const nomesPk = new Set();
  for (const t of tabelas) {
    const linhas = [];
    for (const c of porTabela[t]) {
      // Equivale ao gatilho fn_pontoverificacao_chave do Postgres (checkpointId = id): no SQL Server o id automático
      // só existe depois do INSERT e a coluna é chave primária, então ela vira coluna calculada gravada (sempre igual ao id).
      if (t === 'pontoVerificacao' && c.column_name === 'checkpointId') {
        linhas.push(`  ${q('checkpointId')} AS ISNULL(CAST(${q('id')} AS nvarchar(36)), N'') PERSISTED NOT NULL`);
        continue;
      }
      const tipo = tipoSql(c);
      const ident = c.is_identity === 'YES' || /^nextval\(/i.test(c.column_default || '');
      const pad = padraoSql(c, tipo);
      linhas.push(`  ${q(c.column_name)} ${tipo}${ident ? ' IDENTITY(1,1)' : ''} ${c.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}${pad ? ` DEFAULT ${pad}` : ''}`);
    }
    const cs1 = cons.filter((c) => c.tabela === t);
    for (const c of cs1.filter((x) => x.contype === 'p')) {
      if (nomesPk.has(c.conname)) avisos.push(`Nome de PK repetido: ${c.conname}`);
      nomesPk.add(c.conname);
      linhas.push(`  CONSTRAINT ${q(c.conname)} PRIMARY KEY (${c.cols.map(q).join(', ')})`);
    }
    for (const c of cs1.filter((x) => x.contype === 'c')) {
      if (t === 'pontoVerificacao' && c.conname === 'ck_pontoverificacao_chave_igual_id') continue; // já garantido pela coluna calculada
      const m = c.def.match(/^CHECK \((.*)\)$/s);
      let e = exprSql(m[1]).replace(/= ANY \(ARRAY\[(.*)\]\)/, (_, l) => `IN (${l.replace(/::bpchar/g, '').replace(/'/g, "'")})`);
      e = e.replace(/::bpchar/g, '');
      linhas.push(`  CONSTRAINT ${q(c.conname)} CHECK (${e})`);
    }
    // únicos sem coluna anulável viram UNIQUE; com coluna anulável viram índice filtrado (Postgres aceita vários NULL, SQL Server não)
    for (const c of cs1.filter((x) => x.contype === 'u' && !x.duplicado)) {
      if (c.cols.some((col) => nulaveis.has(`${t}.${col}`))) continue;
      linhas.push(`  CONSTRAINT ${q(c.conname)} UNIQUE (${c.cols.map(q).join(', ')})`);
    }
    out.push(`CREATE TABLE dbo.${q(t)} (\n${linhas.join(',\n')}\n);`);
    out.push('');
  }

  out.push(`-- ===================== ÍNDICES ÚNICOS / COMUNS =====================`);
  const vistos = new Set();
  for (const c of cons.filter((x) => x.contype === 'u' && !x.duplicado)) {
    const nul = c.cols.filter((col) => nulaveis.has(`${c.tabela}.${col}`));
    if (!nul.length) continue;
    out.push(`CREATE UNIQUE INDEX ${q(c.conname)} ON dbo.${q(c.tabela)} (${c.cols.map(q).join(', ')}) WHERE ${nul.map((n) => `${q(n)} IS NOT NULL`).join(' AND ')};`);
  }
  for (const i of idx) {
    if (i.amname !== 'btree') { avisos.push(`Índice ${i.idxname} (${i.amname}) ignorado`); continue; }
    const nk = Number(i.indnkeyatts);
    const opts = i.opts.split(' ').map(Number);
    let cols = [];
    const chaveNula = []; // colunas anuláveis da chave (o COALESCE já trata o nulo como valor, então não entra)
    let pulado = false;
    i.defs.slice(0, nk).forEach((d, n) => {
      let e = d;
      // lower(col::text) ou lower("Col"::text): o SQL Server já compara sem diferenciar maiúsculas, basta o índice na coluna
      const lower = e.match(/^lower\(\(?(.+?)\)?::text\)$/);
      const coalesce = e.match(/^COALESCE\((.+), ''::text\)$/);
      if (lower) e = lower[1];
      else if (coalesce) e = coalesce[1];
      e = e.replace(/^"(.*)"$/, '$1');
      if (!coalesce && nulaveis.has(`${i.tabela}.${e}`)) chaveNula.push(e);
      if (!/^[\w]+$/.test(e)) { avisos.push(`Índice ${i.idxname}: expressão "${d}" ignorada`); pulado = true; return; }
      cols.push(`${q(e)}${opts[n] & 1 ? ' DESC' : ''}`);
    });
    if (pulado) continue;
    const incl = i.defs.slice(nk).map((d) => q(d.replace(/^"(.*)"$/, '$1')));
    // Único com coluna anulável: o Postgres aceita várias linhas com NULL, o SQL Server não. Filtra para manter o comportamento.
    const predicados = [];
    if (i.pred) predicados.push(exprSql(i.pred));
    if (i.indisunique) for (const n of chaveNula) if (!(i.pred || '').includes(n)) predicados.push(`${q(n)} IS NOT NULL`);
    const where = predicados.length ? ` WHERE ${predicados.join(' AND ')}` : '';
    const chave = `${i.tabela}|${i.indisunique}|${cols.join(',')}|${where}`;
    if (vistos.has(chave)) { out.push(`-- ${i.idxname}: igual a outro índice acima (omitido)`); continue; }
    vistos.add(chave);
    out.push(`CREATE ${i.indisunique ? 'UNIQUE ' : ''}INDEX ${q(i.idxname)} ON dbo.${q(i.tabela)} (${cols.join(', ')})${incl.length ? ` INCLUDE (${incl.join(', ')})` : ''}${where};`);
  }
  out.push('');

  out.push(`-- ========================= CHAVES ESTRANGEIRAS =========================`);
  const acao = { a: 'NO ACTION', r: 'NO ACTION', c: 'CASCADE', n: 'SET NULL', d: 'SET DEFAULT' };
  const fksVistas = new Set();
  for (const c of cons.filter((x) => x.contype === 'f')) {
    // FK repetida (mesma tabela, colunas e destino): fica só a primeira
    const k = `${c.tabela}|${c.cols.join(',')}|${c.ftabela}|${c.fcols.join(',')}|${c.confdeltype}${c.confupdtype}`.toLowerCase();
    if (fksVistas.has(k)) { avisos.push(`FK repetida omitida: ${c.conname} em ${c.tabela}`); continue; }
    fksVistas.add(k);
    out.push(`ALTER TABLE dbo.${q(c.tabela)} ADD CONSTRAINT ${q(c.conname)} FOREIGN KEY (${c.cols.map(q).join(', ')}) REFERENCES dbo.${q(c.ftabela)} (${c.fcols.map(q).join(', ')}) ON DELETE ${acao[c.confdeltype]} ON UPDATE ${acao[c.confupdtype]};`);
  }
  out.push('');
  await cli.end();

  fs.writeFileSync(saida, out.join('\n'), 'utf8');
  console.log(`OK: ${tabelas.length} tabelas -> ${saida}`);
  avisos.forEach((a) => console.log('AVISO:', a));
})().catch((e) => { console.error('ERRO', e.message); process.exit(1); });
