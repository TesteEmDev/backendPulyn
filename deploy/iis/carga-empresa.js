// carga-empresa.js - instalacao de um buffet que recebe os dados da NUVEM (so os da empresa dele).
// Roda pelo instalador (02-banco-producao.ps1 / instalar-tudo.ps1); nao precisa ser chamado a mao.
//
// Variaveis de ambiente:
//   SYNC_NUVEM_URL    conexao do usuario do buffet na nuvem (gerada por debug/preparar-acesso-buffet-nuvem.js)
//   SYNC_EMPRESA_ID   id da empresa
//   SYNC_NUVEM_SSL    padrao true
//   DATABASE_URL      banco local (so no modo de carga)
//
// Modos:
//   node carga-empresa.js --conferir   so confere a conexao com a nuvem e se a empresa existe (nao mexe em nada)
//   node carga-empresa.js              prepara a fila de sincronizacao no banco local, copia da nuvem tudo o que e da empresa e
//                                      confere o resultado. O banco local precisa ter a estrutura (banco-base.sql) e estar vazio.
// Termina com codigo 1 e uma mensagem em portugues se algo falhar. A conexao (que tem senha) nunca e mostrada.
const fs = require('fs');
const path = require('path');
const pg = require('pg');
const { criarSincronizador, tiposSemPerdaDePrecisao, descreverErro } = require('../../utils/sincronizacao');
const { colunaDeEmpresa } = require('../../utils/sincronizacaoSql');

const nuvemUrl = String(process.env.SYNC_NUVEM_URL || '').trim();
const empresaId = String(process.env.SYNC_EMPRESA_ID || '').trim();
const sslNuvem = String(process.env.SYNC_NUVEM_SSL || 'true').toLowerCase() !== 'false';
const soConferir = process.argv.includes('--conferir');

class Falha extends Error {}

function conferirEntrada() {
  if (!empresaId) throw new Falha('Falta o ID da empresa.');
  if (!/^[^\s"']+$/.test(empresaId)) throw new Falha('O ID da empresa nao pode ter espacos nem aspas.');
  if (!/^postgres(ql)?:\/\//i.test(nuvemUrl)) throw new Falha('A conexao da nuvem precisa comecar com postgresql://');
}

function novaPool(connectionString, ssl, nome) {
  const pool = new pg.Pool({
    connectionString, ssl: ssl ? { rejectUnauthorized: false } : false,
    max: 3, types: tiposSemPerdaDePrecisao(pg), connectionTimeoutMillis: 15000, application_name: nome,
  });
  pool.on('error', () => { /* uma queda de conexao e tratada onde a consulta falha */ });
  return pool;
}

function servidorDaNuvem() {
  try { return new URL(nuvemUrl).hostname; } catch { return '(endereco invalido)'; }
}

// Usuario da conexao, sem a senha e sem o sufixo do pooler do Supabase (usuario.<referencia>).
function usuarioDaConexao() {
  try { return decodeURIComponent(new URL(nuvemUrl).username).split('.')[0].toLowerCase(); } catch { return ''; }
}

// Confere a conexao e a empresa. Devolve o que a nuvem tem dela.
async function conferirNuvem(nuvem) {
  let empresa;
  try {
    empresa = await nuvem.query('SELECT "empresaId", "nome" FROM "empresa" WHERE "empresaId" = $1', [empresaId]);
  } catch (erro) {
    throw new Falha('Nao consegui ler a nuvem (' + servidorDaNuvem() + '): ' + descreverErro(erro) +
      '. Confira a conexao, a internet e se o usuario do buffet foi preparado na nuvem.');
  }
  if (!empresa.rows.length) {
    // Cada buffet tem o proprio usuario na nuvem (buffet_<8 primeiros do id>, criado por debug/preparar-acesso-buffet-nuvem.js),
    // e o RLS esconde dele as outras empresas: a conexao de outro buffet "nao enxerga" esta empresa.
    const usuario = usuarioDaConexao();
    const esperado = 'buffet_' + empresaId.replace(/-/g, '').slice(0, 8).toLowerCase();
    let dica = ' Cada buffet tem a propria conexao da nuvem (criada com debug/preparar-acesso-buffet-nuvem.js para esta empresa);' +
      ' a conexao de outro buffet nao enxerga esta empresa.';
    if (/^buffet_/.test(usuario) && usuario !== esperado) {
      dica = ' A conexao informada e do usuario "' + usuario + '", e o desta empresa seria "' + esperado + '": parece a conexao de' +
        ' outro buffet. Crie a conexao deste com debug/preparar-acesso-buffet-nuvem.js (EMPRESA_ID=' + empresaId + ').';
    }
    throw new Falha('A nuvem nao tem a empresa "' + empresaId + '" ou o usuario dessa conexao nao tem acesso a ela.' + dica);
  }
  const fila = await nuvem.query(`SELECT to_regclass('public."sincronizacaoFila"') AS fila`);
  if (!fila.rows[0].fila) throw new Falha('A nuvem ainda nao tem a fila de sincronizacao (migracao 018 + 021).');
  return { nome: empresa.rows[0].nome };
}

async function main() {
  conferirEntrada();
  const nuvem = novaPool(nuvemUrl, sslNuvem, 'pulyn-instalador');
  try {
    const dados = await conferirNuvem(nuvem);
    console.log('Nuvem: ' + servidorDaNuvem() + ' | empresa: ' + (dados.nome || empresaId) + ' (' + empresaId + ')');
    if (soConferir) { console.log('Conexao com a nuvem conferida.'); return; }

    const urlLocal = process.env.DATABASE_URL;
    if (!urlLocal) throw new Falha('Falta DATABASE_URL (banco local).');
    const local = novaPool(urlLocal, false, 'pulyn-instalador-local');
    try {
      // 1. fila e gatilhos de sincronizacao no banco local (o backend faria isto ao iniciar; a carga precisa antes).
      await local.query(fs.readFileSync(path.join(__dirname, '..', '..', 'migrations', '018-sincronizacao-fila.sql'), 'utf8'));

      const sync = criarSincronizador({ local, nuvem, empresaId, log: { warn: console.warn, info: console.log, error: console.error } });
      const sch = await sync.esquema();
      const semEmpresa = sch.tabelas.filter((t) => !colunaDeEmpresa(t, sch.colunasPorTabela[t]));

      // 2. a nuvem precisa ter as mesmas tabelas e colunas, senao a copia sairia incompleta
      const naNuvem = await nuvem.query(`SELECT table_name AS tabela, array_agg(column_name::text) AS colunas
        FROM information_schema.columns WHERE table_schema = 'public' GROUP BY table_name`);
      const colunasNuvem = new Map(naNuvem.rows.map((l) => [l.tabela, new Set(l.colunas)]));
      const diferencas = [];
      for (const tabela of sch.tabelas.filter((t) => !semEmpresa.includes(t))) {
        const c = colunasNuvem.get(tabela);
        if (!c) { diferencas.push(tabela + ' (nao existe na nuvem)'); continue; }
        const faltando = sch.colunasPorTabela[tabela].filter((col) => !c.has(col));
        if (faltando.length) diferencas.push(tabela + ' (faltam na nuvem: ' + faltando.join(', ') + ')');
      }
      if (diferencas.length) {
        throw new Falha('A nuvem esta com a estrutura diferente deste instalador: ' + diferencas.join('; ') +
          '. Atualize a nuvem (migracoes) ou gere o instalador com o banco-base.sql atual.');
      }

      // 3. copia da nuvem tudo o que e desta empresa
      console.log('Copiando da nuvem os dados da empresa (pode levar alguns minutos)...');
      await sync.recarregarAgora();

      // 4. confere: mesma quantidade de linhas, tabela por tabela
      const erros = [];
      let total = 0;
      for (const tabela of sch.tabelas.filter((t) => !semEmpresa.includes(t))) {
        const col = colunaDeEmpresa(tabela, sch.colunasPorTabela[tabela]);
        const aqui = await local.query('SELECT count(*)::int AS c FROM "' + tabela + '" WHERE "' + col + '" = $1', [empresaId]);
        const la = await nuvem.query('SELECT count(*)::int AS c FROM "' + tabela + '" WHERE "' + col + '" = $1', [empresaId]);
        total += aqui.rows[0].c;
        if (aqui.rows[0].c !== la.rows[0].c) erros.push(tabela + ': ' + aqui.rows[0].c + ' aqui, ' + la.rows[0].c + ' na nuvem');
      }
      if (erros.length) throw new Falha('A copia ficou incompleta: ' + erros.join('; '));
      console.log('Copia conferida: ' + total + ' linha(s) em ' + (sch.tabelas.length - semEmpresa.length) + ' tabelas, igual a nuvem.');

      // 5. o banco local ja e igual a nuvem: o backend nao precisa reenviar tudo na primeira vez que ligar
      for (const tabela of sch.ordem) {
        await local.query(`INSERT INTO "sincronizacaoEstado" ("chave", "valor", "atualizadoEm") VALUES ($1, now()::text, now())
          ON CONFLICT ("chave") DO UPDATE SET "valor" = EXCLUDED."valor", "atualizadoEm" = now()`, ['carga:' + tabela]);
      }
      await local.query(`INSERT INTO "sincronizacaoEstado" ("chave", "valor", "atualizadoEm") VALUES ('cargaInicialEm', now()::text, now())
        ON CONFLICT ("chave") DO UPDATE SET "valor" = EXCLUDED."valor", "atualizadoEm" = now()`);

      if (semEmpresa.length) {
        console.warn('Atencao: estas ' + semEmpresa.length + ' tabelas nao tem ligacao direta com a empresa e, com a empresa definida, ' +
          'a sincronizacao atual nao as copia: ' + semEmpresa.join(', '));
      }
    } finally {
      await local.end().catch(() => {});
    }
  } finally {
    await nuvem.end().catch(() => {});
  }
}

main().catch((erro) => {
  console.error('ERRO: ' + (erro instanceof Falha ? erro.message : descreverErro(erro)));
  process.exitCode = 1;
});
