// migrations/nomenclatura.js - padroniza o banco em português, singular e camelCase.
//
// Renomeia as tabelas e colunas que ainda estão com o nome antigo (ex.: `criancas.bracelet_code` ->
// `crianca.codigoPulseira`), sem perder dados. É idempotente: roda no início de toda subida do backend e
// só mexe no que ainda estiver fora do padrão. Precisa rodar ANTES das demais migrações, que já usam os nomes novos.
//
// Quando a mesma tabela existe com o nome antigo e com o novo (as migrações antigas recriavam a tabela vazia
// depois de um rename feito à mão), vale a que tem dados; se as duas tiverem dados, a migração para sem apagar nada.
const { withTransaction, recarregarCatalogo, DB_DRIVER } = require('../database');
const { ESQUEMA } = require('../schema/nomenclatura');

const aspas = nome => `"${String(nome).replace(/"/g, '""')}"`;

async function listarTabelas(tx) {
  const linhas = await tx.allQuery("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'");
  return new Set(linhas.map(linha => linha.table_name));
}

async function listarColunas(tx, tabela) {
  const linhas = await tx.allQuery(
    "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = @tabela",
    { tabela }
  );
  return new Set(linhas.map(linha => linha.column_name));
}

async function contarLinhas(tx, tabela) {
  const linha = await tx.queryOne(`SELECT COUNT(*)::int AS total FROM ${aspas(tabela)}`);
  return linha.total;
}

// Deixa a tabela com o nome novo. Devolve o que foi feito (para o log).
async function resolverTabela(tx, item, tabelas, relatorio) {
  const antigos = [...item.tabelasExtras, item.antigo].filter(nome => nome !== item.novo && tabelas.has(nome));

  for (const antigo of antigos) {
    if (!tabelas.has(item.novo)) {
      await tx.query(`ALTER TABLE ${aspas(antigo)} RENAME TO ${aspas(item.novo)}`);
      tabelas.delete(antigo);
      tabelas.add(item.novo);
      relatorio.push(`tabela ${antigo} -> ${item.novo}`);
      continue;
    }

    const [dadosAntigo, dadosNovo] = [await contarLinhas(tx, antigo), await contarLinhas(tx, item.novo)];
    if (dadosAntigo === 0) {
      await tx.query(`DROP TABLE ${aspas(antigo)} CASCADE`);
      tabelas.delete(antigo);
      relatorio.push(`tabela ${antigo} (vazia, duplicada de ${item.novo}) removida`);
    } else if (dadosNovo === 0) {
      await tx.query(`DROP TABLE ${aspas(item.novo)} CASCADE`);
      await tx.query(`ALTER TABLE ${aspas(antigo)} RENAME TO ${aspas(item.novo)}`);
      tabelas.delete(antigo);
      relatorio.push(`tabela ${antigo} -> ${item.novo} (a vazia ${item.novo} foi substituída)`);
    } else {
      throw new Error(`As tabelas ${antigo} (${dadosAntigo} linhas) e ${item.novo} (${dadosNovo} linhas) têm dados; unifique à mão antes de subir o backend.`);
    }
  }
}

async function resolverColunas(tx, item, relatorio) {
  const colunas = await listarColunas(tx, item.novo);
  const pares = [...Object.entries(item.colunas), ...Object.entries(item.colunasExtras)];

  for (const [antiga, nova] of pares) {
    if (antiga === nova || !colunas.has(antiga)) continue;

    if (!colunas.has(nova)) {
      await tx.query(`ALTER TABLE ${aspas(item.novo)} RENAME COLUMN ${aspas(antiga)} TO ${aspas(nova)}`);
      colunas.delete(antiga);
      colunas.add(nova);
      relatorio.push(`${item.novo}.${antiga} -> ${nova}`);
      continue;
    }

    // As duas existem (a antiga foi recriada por uma migração antiga): aproveita o que só existir nela e remove.
    await tx.query(`UPDATE ${aspas(item.novo)} SET ${aspas(nova)} = ${aspas(antiga)} WHERE ${aspas(nova)} IS NULL AND ${aspas(antiga)} IS NOT NULL`);
    await tx.query(`ALTER TABLE ${aspas(item.novo)} DROP COLUMN ${aspas(antiga)}`);
    colunas.delete(antiga);
    relatorio.push(`${item.novo}.${antiga} (duplicada de ${nova}) removida`);
  }
}

async function aplicarNomenclatura(tx) {
  const feito = [];
  const tabelas = await listarTabelas(tx);

  for (const item of ESQUEMA) {
    await resolverTabela(tx, item, tabelas, feito);
    if (tabelas.has(item.novo)) await resolverColunas(tx, item, feito);
  }
  return feito;
}

async function ensureNomenclaturaSchema() {
  const isPostgres = DB_DRIVER === 'postgres' || DB_DRIVER === 'postgresql';
  if (!isPostgres) {
    console.warn('⚠️ Migração nomenclatura: só implementada para PostgreSQL.');
    return [];
  }

  const relatorio = await withTransaction(tx => aplicarNomenclatura(tx));

  if (relatorio.length > 0) {
    await recarregarCatalogo();
    console.log(`✅ Nomenclatura do banco padronizada (${relatorio.length} ajuste(s)):`);
    relatorio.forEach(linha => console.log(`   - ${linha}`));
  }
  return relatorio;
}

module.exports = { ensureNomenclaturaSchema, aplicarNomenclatura };
