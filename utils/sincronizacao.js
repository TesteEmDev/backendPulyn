// utils/sincronizacao.js - sincroniza o banco local com a nuvem (local -> nuvem, a nuvem é cópia).
//
// Como funciona: gatilhos do Postgres gravam em "sincronizacaoFila" toda alteração (ver
// migrations/018-sincronizacao-fila.sql). A cada ciclo, este módulo lê a fila, busca o ESTADO
// ATUAL de cada linha no banco local e grava (ou apaga) a mesma linha na nuvem. Como o que vai é
// sempre o estado atual, repetir um envio não duplica nada e várias alterações da mesma linha
// viram um único envio.
//
// Ligar: SYNC_ENABLED=1 e SYNC_NUVEM_URL=postgresql://... no .env (nunca no código).

const fs = require('fs');
const path = require('path');
const {
  dividirEmLotes,
  linhasPorComando,
  agruparFila,
  particionarPorTabela,
  montarSelectPorChave,
  montarDelete,
  montarUpsert,
  atrasoTentativaMs,
  ordenarTabelas,
  ehErroDeConexao,
} = require('./sincronizacaoSql');

const TABELAS_DO_MECANISMO = new Set(['sincronizacaoFila', 'sincronizacaoEstado']);

// Mensagem legível: erros de rede do Node vêm como AggregateError, sem texto próprio.
function descreverErro(erro) {
  if (!erro) return 'erro desconhecido';
  const interno = Array.isArray(erro.errors) && erro.errors[0];
  const base = erro.message || (interno && (interno.message || interno.code)) || erro.code || String(erro);
  return erro.code && !String(base).includes(erro.code) ? `${erro.code}: ${base}` : String(base);
}

function criarSincronizador({
  local,
  nuvem,
  lote = 500,
  intervaloMs = 15000,
  retencaoDias = 7,
  log = console,
  agora = () => new Date(),
} = {}) {
  if (!local || !nuvem) throw new Error('criarSincronizador precisa de local e nuvem');

  let esquemaCache = null;
  let esquemaEm = 0;
  let temporizador = null;
  let emExecucao = null;
  let preparado = false;
  const estado = {
    habilitado: true,
    ultimoCicloEm: null,
    ultimoEnvioEm: null,
    ultimoErro: null,
    ultimoErroEm: null,
    enviadasDesdeAInicializacao: 0,
    tabelasComProblema: {},
  };

  // ---------- esquema ----------
  async function lerEsquemaLocal() {
    const colunas = await local.query(`
      SELECT table_name AS tabela, array_agg(column_name::text ORDER BY ordinal_position) AS colunas
      FROM information_schema.columns
      WHERE table_schema = 'public'
      GROUP BY table_name`);
    const chaves = await local.query(`
      SELECT c.relname::text AS tabela,
             array_agg(a.attname::text ORDER BY array_position(k.conkey, a.attnum)) AS chave
      FROM pg_constraint k
      JOIN pg_class c ON c.oid = k.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = ANY (k.conkey)
      WHERE k.contype = 'p' AND n.nspname = 'public'
      GROUP BY c.relname`);
    const dependencias = await local.query(`
      SELECT f.relname::text AS filho, p.relname::text AS pai
      FROM pg_constraint k
      JOIN pg_class f ON f.oid = k.conrelid
      JOIN pg_class p ON p.oid = k.confrelid
      JOIN pg_namespace n ON n.oid = f.relnamespace
      WHERE k.contype = 'f' AND n.nspname = 'public'`);
    const colunasChave = {};
    for (const linha of chaves.rows) colunasChave[linha.tabela] = linha.chave;
    const colunasPorTabela = {};
    for (const linha of colunas.rows) colunasPorTabela[linha.tabela] = linha.colunas;
    const tabelas = Object.keys(colunasChave).filter((tabela) => !TABELAS_DO_MECANISMO.has(tabela));
    return {
      tabelas,
      colunasChave,
      colunasPorTabela,
      ordem: ordenarTabelas(tabelas, dependencias.rows),
    };
  }

  async function esquema() {
    if (esquemaCache && agora().getTime() - esquemaEm < 60000) return esquemaCache;
    esquemaCache = await lerEsquemaLocal();
    esquemaEm = agora().getTime();
    return esquemaCache;
  }

  // A nuvem precisa ter a mesma tabela e todas as colunas que o local envia.
  async function conferirNuvem(sch) {
    const resposta = await nuvem.query(`
      SELECT table_name AS tabela, array_agg(column_name::text) AS colunas
      FROM information_schema.columns WHERE table_schema = 'public' GROUP BY table_name`);
    const naNuvem = {};
    for (const linha of resposta.rows) naNuvem[linha.tabela] = new Set(linha.colunas);
    // O upsert precisa de um índice único exatamente nas colunas da chave primária local.
    const unicos = await nuvem.query(`
      SELECT c.relname::text AS tabela,
             array_agg(a.attname::text ORDER BY array_position(i.indkey::int2[], a.attnum)) AS chave
      FROM pg_index i
      JOIN pg_class c ON c.oid = i.indrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey::int2[])
      WHERE i.indisunique AND i.indpred IS NULL AND i.indexprs IS NULL AND n.nspname = 'public'
      GROUP BY c.relname, i.indexrelid`);
    const indicesUnicos = {};
    for (const linha of unicos.rows) (indicesUnicos[linha.tabela] ||= []).push([...linha.chave].sort().join('|'));
    const problemas = {};
    for (const tabela of sch.tabelas) {
      if (!naNuvem[tabela]) { problemas[tabela] = 'a tabela não existe na nuvem'; continue; }
      const faltando = sch.colunasPorTabela[tabela].filter((coluna) => !naNuvem[tabela].has(coluna));
      if (faltando.length) { problemas[tabela] = `colunas ausentes na nuvem: ${faltando.join(', ')}`; continue; }
      const chaveLocal = [...sch.colunasChave[tabela]].sort().join('|');
      if (!(indicesUnicos[tabela] || []).includes(chaveLocal)) {
        problemas[tabela] = `a nuvem não tem chave primária ou índice único em (${sch.colunasChave[tabela].join(', ')})`;
      }
    }
    estado.tabelasComProblema = problemas;
    return problemas;
  }

  // ---------- estado persistido ----------
  async function lerEstado(chave) {
    const r = await local.query('SELECT "valor" FROM "sincronizacaoEstado" WHERE "chave" = $1', [chave]);
    return r.rows[0] ? r.rows[0].valor : null;
  }
  async function gravarEstado(chave, valor) {
    await local.query(
      `INSERT INTO "sincronizacaoEstado" ("chave", "valor", "atualizadoEm") VALUES ($1, $2, now())
       ON CONFLICT ("chave") DO UPDATE SET "valor" = EXCLUDED."valor", "atualizadoEm" = now()`,
      [chave, valor]
    );
  }

  // ---------- preparação ----------
  async function preparar() {
    if (preparado) return;
    const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '018-sincronizacao-fila.sql'), 'utf8');
    await local.query(sql);
    preparado = true;
  }

  // ---------- gravação na nuvem ----------
  async function executarNaNuvem(trabalho) {
    const cliente = await nuvem.connect();
    try {
      await cliente.query('BEGIN');
      await trabalho(cliente);
      await cliente.query('COMMIT');
    } catch (erro) {
      try { await cliente.query('ROLLBACK'); } catch { /* conexão já caiu */ }
      throw erro;
    } finally {
      cliente.release();
    }
  }

  async function gravarLinhas(cliente, tabela, colunas, colunasChave, linhas) {
    for (const parte of dividirEmLotes(linhas, linhasPorComando(colunas.length))) {
      const comando = montarUpsert({ tabela, colunas, colunasChave, linhas: parte });
      await cliente.query(comando.text, comando.values);
    }
  }

  // Envia um conjunto de grupos (já agrupados), na ordem. Lança em caso de falha.
  async function enviarGrupos(grupos, sch) {
    const blocos = particionarPorTabela(grupos);
    // Estado atual de cada linha, lido do banco local (fora da transação da nuvem).
    const lidos = [];
    for (const bloco of blocos) {
      const colunasChave = sch.colunasChave[bloco.tabela];
      const existentes = new Map();
      for (const parte of dividirEmLotes(bloco.grupos, 500)) {
        const consulta = montarSelectPorChave({ tabela: bloco.tabela, colunas: colunasChave, chaves: parte.map((g) => g.valores) });
        const r = await local.query(consulta.text, consulta.values);
        for (const linha of r.rows) existentes.set(JSON.stringify(colunasChave.map((c) => String(linha[c]))), linha);
      }
      lidos.push({ bloco, existentes, colunasChave });
    }

    await executarNaNuvem(async (cliente) => {
      for (const { bloco, existentes, colunasChave } of lidos) {
        const colunas = sch.colunasPorTabela[bloco.tabela];
        const paraGravar = [];
        const paraApagar = [];
        for (const grupo of bloco.grupos) {
          const linha = existentes.get(JSON.stringify(grupo.valores));
          if (linha) paraGravar.push(linha); else paraApagar.push(grupo.valores);
        }
        if (paraGravar.length) await gravarLinhas(cliente, bloco.tabela, colunas, colunasChave, paraGravar);
        for (const parte of dividirEmLotes(paraApagar, 500)) {
          const comando = montarDelete({ tabela: bloco.tabela, colunas: colunasChave, chaves: parte });
          await cliente.query(comando.text, comando.values);
        }
      }
    });
  }

  async function marcarEnviados(ids) {
    for (const parte of dividirEmLotes(ids, 5000)) {
      await local.query('UPDATE "sincronizacaoFila" SET "enviadoEm" = now(), "erro" = NULL WHERE "filaId" = ANY($1::bigint[])', [parte]);
    }
  }

  async function marcarFalha(grupo, erro) {
    const tentativas = grupo.tentativas + 1;
    const proxima = new Date(agora().getTime() + atrasoTentativaMs(tentativas));
    await local.query(
      `UPDATE "sincronizacaoFila"
       SET "tentativas" = $2, "proximaTentativaEm" = $3, "erro" = $4
       WHERE "filaId" = ANY($1::bigint[])`,
      [grupo.ids, tentativas, proxima, descreverErro(erro).slice(0, 500)]
    );
  }

  // ---------- carga inicial ----------
  async function cargaInicial() {
    const sch = await esquema();
    const problemas = await conferirNuvem(sch);
    // A carga é controlada POR TABELA: uma tabela com problema na nuvem é copiada depois que o
    // problema for corrigido, sem repetir as que já foram.
    const jaCarregadas = await local.query(`SELECT "chave" FROM "sincronizacaoEstado" WHERE "chave" LIKE 'carga:%'`);
    const carregadas = new Set(jaCarregadas.rows.map((linha) => linha.chave.slice('carga:'.length)));
    const faltam = sch.ordem.filter((tabela) => !carregadas.has(tabela) && !problemas[tabela]);
    if (!faltam.length) {
      if (sch.ordem.every((tabela) => carregadas.has(tabela)) && !(await lerEstado('cargaInicialEm'))) {
        await gravarEstado('cargaInicialEm', agora().toISOString());
      }
      return 0;
    }
    const marca = await local.query('SELECT COALESCE(MAX("filaId"), 0) AS maximo FROM "sincronizacaoFila"');
    const limite = marca.rows[0].maximo;
    let total = 0;
    for (const tabela of faltam) {
      const colunas = sch.colunasPorTabela[tabela];
      const colunasChave = sch.colunasChave[tabela];
      const ordem = colunasChave.map((c) => `"${c.replace(/"/g, '""')}"`).join(', ');
      const tamanho = Math.min(lote, linhasPorComando(colunas.length));
      for (let deslocamento = 0; ; deslocamento += tamanho) {
        const r = await local.query(`SELECT * FROM "${tabela}" ORDER BY ${ordem} LIMIT ${tamanho} OFFSET ${deslocamento}`);
        if (!r.rows.length) break;
        await executarNaNuvem((cliente) => gravarLinhas(cliente, tabela, colunas, colunasChave, r.rows));
        total += r.rows.length;
        if (r.rows.length < tamanho) break;
      }
      // O que mudou nessa tabela ANTES da carga já foi copiado por ela; o que mudou durante continua na fila.
      await local.query(
        'UPDATE "sincronizacaoFila" SET "enviadoEm" = now() WHERE "filaId" <= $1 AND "tabela" = $2 AND "enviadoEm" IS NULL',
        [limite, tabela]
      );
      await gravarEstado(`carga:${tabela}`, agora().toISOString());
      carregadas.add(tabela);
    }
    if (sch.ordem.every((tabela) => carregadas.has(tabela))) await gravarEstado('cargaInicialEm', agora().toISOString());
    const semCarga = sch.ordem.filter((tabela) => !carregadas.has(tabela));
    log.info(`[sincronização] carga inicial: ${total} linha(s) copiadas`
      + (semCarga.length ? `; aguardando correção na nuvem: ${semCarga.join(', ')}.` : '.'));
    return total;
  }

  // ---------- ciclo ----------
  async function processarFila() {
    const sch = await esquema();
    let enviadasNoCiclo = 0;
    for (;;) {
      const pendentes = await local.query(
        `SELECT "filaId", "tabela", "chave", "tentativas" FROM "sincronizacaoFila"
         WHERE "enviadoEm" IS NULL AND "proximaTentativaEm" <= now()
         ORDER BY "filaId" LIMIT $1`, [lote]);
      if (!pendentes.rows.length) break;

      const ignoradas = [];
      const sincronizaveis = pendentes.rows.filter((entrada) => {
        if (sch.colunasChave[entrada.tabela] && !estado.tabelasComProblema[entrada.tabela]) return true;
        ignoradas.push(entrada);
        return false;
      });
      for (const entrada of ignoradas) {
        const motivo = estado.tabelasComProblema[entrada.tabela] || 'tabela desconhecida ou sem chave primária';
        await marcarFalha({ ids: [entrada.filaId], tentativas: entrada.tentativas }, new Error(motivo));
      }
      if (!sincronizaveis.length) {
        if (ignoradas.length === pendentes.rows.length) break; // nada que dê para enviar agora
        continue;
      }

      const grupos = agruparFila(sincronizaveis, sch.colunasChave);
      try {
        await enviarGrupos(grupos, sch);
        await marcarEnviados(grupos.flatMap((g) => g.ids));
        enviadasNoCiclo += grupos.length;
      } catch (erroDoLote) {
        if (ehErroDeConexao(erroDoLote)) throw erroDoLote;
        // Isola a linha problemática: tenta uma a uma; as boas seguem, a ruim fica com erro e atraso.
        log.warn(`[sincronização] lote falhou (${erroDoLote.message}); reenviando linha a linha.`);
        for (const grupo of grupos) {
          try {
            await enviarGrupos([grupo], sch);
            await marcarEnviados(grupo.ids);
            enviadasNoCiclo += 1;
          } catch (erro) {
            if (ehErroDeConexao(erro)) throw erro;
            await marcarFalha(grupo, erro);
            log.error(`[sincronização] ${grupo.tabela} ${JSON.stringify(grupo.valores)}: ${erro.message}`);
          }
        }
      }
    }
    return enviadasNoCiclo;
  }

  async function limparAntigos() {
    await local.query(
      `DELETE FROM "sincronizacaoFila" WHERE "enviadoEm" IS NOT NULL AND "enviadoEm" < now() - ($1 || ' days')::interval`,
      [String(retencaoDias)]
    );
  }

  async function ciclo() {
    estado.ultimoCicloEm = agora().toISOString();
    try {
      await preparar();
      const sch = await esquema();
      await conferirNuvem(sch);
      await cargaInicial();
      const enviadas = await processarFila();
      if (enviadas) { estado.ultimoEnvioEm = agora().toISOString(); estado.enviadasDesdeAInicializacao += enviadas; }
      await limparAntigos();
      estado.ultimoErro = null;
      return { ok: true, enviadas };
    } catch (erro) {
      estado.ultimoErro = descreverErro(erro);
      estado.ultimoErroEm = agora().toISOString();
      log.warn(`[sincronização] ciclo interrompido: ${estado.ultimoErro}`);
      return { ok: false, erro: estado.ultimoErro };
    }
  }

  function executarAgora() {
    if (!emExecucao) emExecucao = ciclo().finally(() => { emExecucao = null; });
    return emExecucao;
  }

  function iniciar() {
    if (temporizador) return;
    log.info(`[sincronização] ligada: ciclo a cada ${intervaloMs} ms, lote de ${lote}.`);
    executarAgora();
    temporizador = setInterval(executarAgora, intervaloMs);
    if (temporizador.unref) temporizador.unref();
  }

  async function parar() {
    if (temporizador) { clearInterval(temporizador); temporizador = null; }
    if (emExecucao) await emExecucao;
  }

  async function status() {
    let fila = { pendentes: 0, comErro: 0, maisAntigoEm: null };
    let cargaInicialEm = null;
    try {
      await preparar();
      const r = await local.query(
        `SELECT count(*) FILTER (WHERE "enviadoEm" IS NULL) AS pendentes,
                count(*) FILTER (WHERE "enviadoEm" IS NULL AND "tentativas" > 0) AS "comErro",
                min("criadoEm") FILTER (WHERE "enviadoEm" IS NULL) AS "maisAntigoEm",
                max("enviadoEm") AS "ultimoEnvioEm"
         FROM "sincronizacaoFila"`);
      const linha = r.rows[0];
      fila = { pendentes: Number(linha.pendentes), comErro: Number(linha.comErro), maisAntigoEm: linha.maisAntigoEm };
      if (linha.ultimoEnvioEm && !estado.ultimoEnvioEm) estado.ultimoEnvioEm = new Date(linha.ultimoEnvioEm).toISOString();
      cargaInicialEm = await lerEstado('cargaInicialEm');
    } catch (erro) {
      estado.ultimoErro = estado.ultimoErro || String(erro.message || erro);
    }
    return { ...estado, ...fila, cargaInicialEm, rodando: Boolean(temporizador) };
  }

  return { executarAgora, iniciar, parar, status, cargaInicial, esquema, lerEstado, _estado: estado };
}

// ---------- instância ligada pelo ambiente ----------
let instancia = null;

function tiposSemPerdaDePrecisao(pg) {
  // Datas e horas viajam como texto para não perder os microssegundos que o Postgres guarda.
  const comoTexto = new Set([1082, 1083, 1114, 1184, 1266]);
  return { getTypeParser: (oid, formato) => (comoTexto.has(oid) ? (valor) => valor : pg.types.getTypeParser(oid, formato)) };
}

function sincronizacaoHabilitada() {
  return /^(1|true|sim)$/i.test(String(process.env.SYNC_ENABLED || ''));
}

function obterSincronizador() {
  if (instancia) return instancia;
  if (!sincronizacaoHabilitada()) return null;
  const urlNuvem = process.env.SYNC_NUVEM_URL;
  if (!urlNuvem) {
    console.warn('[sincronização] SYNC_ENABLED está ligado, mas SYNC_NUVEM_URL não foi definido; sincronização desativada.');
    return null;
  }
  const pg = require('pg');
  const types = tiposSemPerdaDePrecisao(pg);
  const urlLocal = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  const sslLocal = String(process.env.DB_SSL || 'true').toLowerCase() !== 'false';
  const sslNuvem = String(process.env.SYNC_NUVEM_SSL || 'true').toLowerCase() !== 'false';
  const local = new pg.Pool({
    ...(urlLocal ? { connectionString: urlLocal } : {
      host: process.env.PGHOST || 'localhost', port: Number(process.env.PGPORT || 5432),
      database: process.env.PGDATABASE || 'postgres', user: process.env.PGUSER || 'postgres', password: process.env.PGPASSWORD,
    }),
    ssl: sslLocal ? { rejectUnauthorized: false } : false,
    max: 3, types, application_name: 'pulyn-sync-local',
  });
  const nuvem = new pg.Pool({
    connectionString: urlNuvem,
    ssl: sslNuvem ? { rejectUnauthorized: false } : false,
    max: 3, types, connectionTimeoutMillis: 10000, application_name: 'pulyn-sync',
  });
  local.on('error', (erro) => console.warn('[sincronização] conexão local:', erro.message));
  nuvem.on('error', (erro) => console.warn('[sincronização] conexão com a nuvem:', erro.message));
  instancia = criarSincronizador({
    local, nuvem,
    lote: Number(process.env.SYNC_LOTE || 500),
    intervaloMs: Number(process.env.SYNC_INTERVALO_MS || 15000),
    retencaoDias: Number(process.env.SYNC_RETENCAO_DIAS || 7),
  });
  instancia._pools = { local, nuvem };
  return instancia;
}

async function pararSincronizacao() {
  if (!instancia) return;
  await instancia.parar();
  if (instancia._pools) await Promise.allSettled([instancia._pools.local.end(), instancia._pools.nuvem.end()]);
  instancia = null;
}

module.exports = { descreverErro, criarSincronizador, obterSincronizador, pararSincronizacao, sincronizacaoHabilitada, tiposSemPerdaDePrecisao };
