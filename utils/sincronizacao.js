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
  colunaDeEmpresa,
  podeEnviarDaEmpresa,
  aspas,
} = require('./sincronizacaoSql');

const TABELAS_DO_MECANISMO = new Set(['sincronizacaoFila', 'sincronizacaoEstado']);
// Até onde já se puxou da nuvem (filaId da fila da nuvem), guardado no banco local.
const CURSOR_PUXADA = 'puxarCursor';
// Data de criação da última alteração puxada: a checagem de retenção compara com ela.
const CURSOR_PUXADA_EM = 'puxarCursorEm';

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
  empresaId = null,
  margemNuvemSegundos = 60,
  recarga = false,
  log = console,
  agora = () => new Date(),
} = {}) {
  if (!local || !nuvem) throw new Error('criarSincronizador precisa de local e nuvem');

  // Com empresaId, só sobe o que é desta empresa. Tabela sem vínculo com empresa é avisada uma vez e fica de fora.
  const tabelasSemEmpresaAvisadas = new Set();
  const avisarSemEmpresa = (tabela) => {
    if (tabelasSemEmpresaAvisadas.has(tabela)) return;
    tabelasSemEmpresaAvisadas.add(tabela);
    log.warn(`[sincronização] ${tabela} não tem ligação com a empresa; não sobe enquanto SYNC_EMPRESA_ID estiver definido.`);
  };

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
    recebidasDesdeAInicializacao: 0,
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
      // O que o envio grava não volta para a fila da nuvem: senão a própria empresa o puxaria de volta.
      await cliente.query("SELECT set_config('pulyn.sync_ignorar', 'on', true)");
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
          if (!podeEnviarDaEmpresa({ tabela: bloco.tabela, colunas, linha, empresaId })) {
            if (empresaId && !colunaDeEmpresa(bloco.tabela, colunas)) avisarSemEmpresa(bloco.tabela);
            continue;
          }
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
      try {
        const colunas = sch.colunasPorTabela[tabela];
        const colunasChave = sch.colunasChave[tabela];
        const ordem = colunasChave.map((c) => `"${c.replace(/"/g, '""')}"`).join(', ');
        const tamanho = Math.min(lote, linhasPorComando(colunas.length));
        // Sem ligação com a empresa, a tabela não é copiada (o laço nem começa). Com ela, só sobe a empresa desta instalação.
        const semVinculo = Boolean(empresaId) && !colunaDeEmpresa(tabela, colunas);
        if (semVinculo) avisarSemEmpresa(tabela);
        for (let deslocamento = 0; !semVinculo; deslocamento += tamanho) {
          const r = await local.query(`SELECT * FROM "${tabela}" ORDER BY ${ordem} LIMIT ${tamanho} OFFSET ${deslocamento}`);
          if (!r.rows.length) break;
          const enviar = r.rows.filter((linha) => podeEnviarDaEmpresa({ tabela, colunas, linha, empresaId }));
          if (enviar.length) await executarNaNuvem((cliente) => gravarLinhas(cliente, tabela, colunas, colunasChave, enviar));
          total += enviar.length;
          if (r.rows.length < tamanho) break;
        }
        // O que mudou nessa tabela ANTES da carga já foi copiado por ela; o que mudou durante continua na fila.
        await local.query(
          'UPDATE "sincronizacaoFila" SET "enviadoEm" = now() WHERE "filaId" <= $1 AND "tabela" = $2 AND "enviadoEm" IS NULL',
          [limite, tabela]
        );
        await gravarEstado(`carga:${tabela}`, agora().toISOString());
        carregadas.add(tabela);
      } catch (erro) {
        if (ehErroDeConexao(erro)) throw erro;
        // Uma carga que falha (ex.: chave estrangeira para uma linha que ainda não está na nuvem) não pode
        // travar a fila: o ciclo segue, a fila envia o que falta e a carga é tentada de novo no próximo ciclo.
        log.warn(`[sincronização] carga inicial de ${tabela} adiada: ${descreverErro(erro)}`);
      }
    }
    if (sch.ordem.every((tabela) => carregadas.has(tabela))) await gravarEstado('cargaInicialEm', agora().toISOString());
    const semCarga = sch.ordem.filter((tabela) => !carregadas.has(tabela));
    log.info(`[sincronização] carga inicial: ${total} linha(s) copiadas`
      + (semCarga.length ? `; aguardando correção na nuvem: ${semCarga.join(', ')}.` : '.'));
    return total;
  }

  // ---------- nuvem -> local ----------
  // Chaves de uma tabela que têm alteração local ainda não enviada (texto, para comparar).
  async function chavesComAlteracaoLocal(tabela, colunasChave) {
    const r = await local.query('SELECT "chave" FROM "sincronizacaoFila" WHERE "enviadoEm" IS NULL AND "tabela" = $1', [tabela]);
    return new Set(r.rows.map((linha) => JSON.stringify(colunasChave.map((c) => String(linha.chave[c])))));
  }

  // Refaz a empresa inteira a partir da nuvem, para quando a retenção já apagou alterações deste buffet. Grava o que a
  // nuvem tem, apaga aqui o que ela não tem mais, e pula linhas com alteração local ainda não enviada. Marca o cursor
  // na última alteração já confirmada (com a margem), e o puxar() segue dali.
  async function recarregar(sch) {
    const marca = (await nuvem.query(
      `SELECT "filaId", "criadoEm" FROM "sincronizacaoFila"
       WHERE "empresaId" = $1 AND "criadoEm" < now() - make_interval(secs => $2)
       ORDER BY "filaId" DESC LIMIT 1`,
      [empresaId, margemNuvemSegundos]
    )).rows[0];

    const porTabela = new Map();
    for (const tabela of sch.ordem) {
      const colunas = sch.colunasPorTabela[tabela];
      const colunasChave = sch.colunasChave[tabela];
      const colunaEmp = colunaDeEmpresa(tabela, colunas);
      if (!colunaEmp) continue;
      const linhas = new Map();
      for (let deslocamento = 0; ; deslocamento += 1000) {
        const r = await nuvem.query(
          `SELECT * FROM ${aspas(tabela)} WHERE ${aspas(colunaEmp)} = $1
           ORDER BY ${colunasChave.map(aspas).join(', ')} LIMIT 1000 OFFSET $2`,
          [empresaId, deslocamento]
        );
        for (const linha of r.rows) linhas.set(JSON.stringify(colunasChave.map((c) => String(linha[c]))), linha);
        if (r.rows.length < 1000) break;
      }
      porTabela.set(tabela, { colunas, colunasChave, colunaEmp, linhas, pendentes: await chavesComAlteracaoLocal(tabela, colunasChave) });
    }

    const cliente = await local.connect();
    try {
      await cliente.query('BEGIN');
      await cliente.query("SELECT set_config('pulyn.sync_ignorar', 'on', true)");
      // Apaga aqui o que a nuvem não tem mais (filhos antes dos pais).
      for (const tabela of [...sch.ordem].reverse()) {
        const d = porTabela.get(tabela);
        if (!d) continue;
        const locais = await cliente.query(
          `SELECT ${d.colunasChave.map(aspas).join(', ')} FROM ${aspas(tabela)} WHERE ${aspas(d.colunaEmp)} = $1`,
          [empresaId]
        );
        const apagar = locais.rows
          .map((l) => d.colunasChave.map((c) => l[c]))
          .filter((valores) => {
            const texto = JSON.stringify(valores.map(String));
            return !d.linhas.has(texto) && !d.pendentes.has(texto);
          });
        for (const parte of dividirEmLotes(apagar, 500)) {
          const comando = montarDelete({ tabela, colunas: d.colunasChave, chaves: parte });
          await cliente.query(comando.text, comando.values);
        }
      }
      // Grava o que a nuvem tem (pais antes dos filhos), sem mexer nas linhas com alteração local pendente.
      for (const tabela of sch.ordem) {
        const d = porTabela.get(tabela);
        if (!d) continue;
        const gravar = [...d.linhas.entries()].filter(([texto]) => !d.pendentes.has(texto)).map(([, linha]) => linha);
        if (gravar.length) await gravarLinhas(cliente, tabela, d.colunas, d.colunasChave, gravar);
      }
      await cliente.query(
        `INSERT INTO "sincronizacaoEstado" ("chave", "valor", "atualizadoEm") VALUES ($1, $2, now()), ($3, $4, now())
         ON CONFLICT ("chave") DO UPDATE SET "valor" = EXCLUDED."valor", "atualizadoEm" = now()`,
        [CURSOR_PUXADA, marca ? String(marca.filaId) : '0', CURSOR_PUXADA_EM, marca ? String(marca.criadoEm) : null]
      );
      await cliente.query('COMMIT');
    } catch (erro) {
      try { await cliente.query('ROLLBACK'); } catch { /* conexão já caiu */ }
      throw erro;
    } finally {
      cliente.release();
    }
  }

  // Traz da nuvem as alterações desta empresa, na ordem em que aconteceram lá (filaId da fila da nuvem). Uma linha com
  // alteração local ainda não enviada fica como está aqui: o envio depois leva a versão local para a nuvem.
  // Tudo de um lote entra numa transação local que também avança o cursor, então nada se perde se cair no meio.
  async function puxar(sch) {
    if (!empresaId) return 0;
    // Se a retenção da nuvem já apagou alterações depois do ponto do buffet, elas nunca mais chegam: ou refaz a empresa
    // a partir da nuvem (só com a recarga ligada), ou para e avisa.
    const cursorInicial = (await lerEstado(CURSOR_PUXADA)) || '0';
    if (Number(cursorInicial) > 0) {
      const ultimaEm = await lerEstado(CURSOR_PUXADA_EM);
      const perdeu = (await nuvem.query('SELECT "sincronizacaoPerdeuAlteracoesDesde"($1) AS perdeu', [ultimaEm])).rows[0].perdeu;
      if (perdeu) {
        if (!recarga) throw new Error(`a retenção da nuvem apagou alterações depois do ponto ${cursorInicial}; ligue SYNC_RECARGA=1 para refazer a empresa`);
        log.warn(`[sincronização] recarga: refazendo a empresa a partir da nuvem (ponto ${cursorInicial} perdido)`);
        await recarregar(sch);
      }
    }
    let total = 0;
    for (;;) {
      const cursor = (await lerEstado(CURSOR_PUXADA)) || '0';
      // Só alterações com mais de `margemNuvemSegundos`: uma transação que gravou antes pode ainda não ter sido confirmada,
      // e avançar o cursor por cima dela faria a alteração se perder.
      const r = await nuvem.query(
        `SELECT "filaId", "tabela", "chave", "criadoEm" FROM "sincronizacaoFila"
         WHERE "filaId" > $1 AND "empresaId" = $2 AND "criadoEm" < now() - make_interval(secs => $3)
         ORDER BY "filaId" LIMIT $4`,
        [cursor, empresaId, margemNuvemSegundos, lote]
      );
      if (!r.rows.length) break;
      const ultimoFilaId = r.rows[r.rows.length - 1].filaId;
      const ultimaEm = r.rows[r.rows.length - 1].criadoEm;

      // Chaves mudadas por tabela (só o que o esquema local conhece).
      const mudadas = new Map();
      for (const linha of r.rows) {
        const colunasChave = sch.colunasChave[linha.tabela];
        if (!colunasChave || TABELAS_DO_MECANISMO.has(linha.tabela)) continue;
        if (!mudadas.has(linha.tabela)) mudadas.set(linha.tabela, new Map());
        const valores = colunasChave.map((c) => linha.chave[c]);
        mudadas.get(linha.tabela).set(JSON.stringify(valores.map(String)), valores);
      }

      // Estado atual de cada chave na nuvem: o que ainda pertence à empresa é gravado; o resto é apagado aqui.
      const planos = [];
      for (const tabela of sch.ordem) {
        const chaves = mudadas.get(tabela);
        if (!chaves) continue;
        const colunasChave = sch.colunasChave[tabela];
        const colunas = sch.colunasPorTabela[tabela];
        const comAlteracaoLocal = await chavesComAlteracaoLocal(tabela, colunasChave);
        const emNuvem = [...chaves.entries()].filter(([texto]) => !comAlteracaoLocal.has(texto)).map(([, valores]) => valores);
        const atuais = new Map();
        for (const parte of dividirEmLotes(emNuvem, 500)) {
          const consulta = montarSelectPorChave({ tabela, colunas: colunasChave, chaves: parte });
          const atual = await nuvem.query(consulta.text, consulta.values);
          for (const linha of atual.rows) atuais.set(JSON.stringify(colunasChave.map((c) => String(linha[c]))), linha);
        }
        const gravar = [];
        const apagar = [];
        for (const valores of emNuvem) {
          const linha = atuais.get(JSON.stringify(valores.map(String)));
          if (linha && podeEnviarDaEmpresa({ tabela, colunas, linha, empresaId })) gravar.push(linha); else apagar.push(valores);
        }
        planos.push({ tabela, colunas, colunasChave, gravar, apagar });
      }

      const cliente = await local.connect();
      try {
        await cliente.query('BEGIN');
        // Aplicar o que veio da nuvem não pode voltar para a fila de envio.
        await cliente.query("SELECT set_config('pulyn.sync_ignorar', 'on', true)");
        // Apaga os filhos antes dos pais; grava os pais antes dos filhos.
        for (const plano of [...planos].reverse()) {
          for (const parte of dividirEmLotes(plano.apagar, 500)) {
            const comando = montarDelete({ tabela: plano.tabela, colunas: plano.colunasChave, chaves: parte });
            await cliente.query(comando.text, comando.values);
          }
        }
        for (const plano of planos) {
          if (plano.gravar.length) await gravarLinhas(cliente, plano.tabela, plano.colunas, plano.colunasChave, plano.gravar);
        }
        await cliente.query(
          `INSERT INTO "sincronizacaoEstado" ("chave", "valor", "atualizadoEm") VALUES ($1, $2, now()), ($3, $4, now())
           ON CONFLICT ("chave") DO UPDATE SET "valor" = EXCLUDED."valor", "atualizadoEm" = now()`,
          [CURSOR_PUXADA, String(ultimoFilaId), CURSOR_PUXADA_EM, String(ultimaEm)]
        );
        await cliente.query('COMMIT');
      } catch (erro) {
        try { await cliente.query('ROLLBACK'); } catch { /* conexão já caiu */ }
        throw erro;
      } finally {
        cliente.release();
      }
      total += r.rows.length;
      if (r.rows.length < lote) break;
    }
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
      const recebidas = await puxar(sch);
      if (recebidas) estado.recebidasDesdeAInicializacao += recebidas;
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

  return {
    executarAgora, iniciar, parar, status, cargaInicial, esquema, lerEstado,
    puxarDaNuvem: async () => puxar(await esquema()),
    recarregarAgora: async () => recarregar(await esquema()),
    _estado: estado,
  };
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
    empresaId: process.env.SYNC_EMPRESA_ID || null,
    margemNuvemSegundos: Number(process.env.SYNC_MARGEM_SEGUNDOS || 60),
    recarga: process.env.SYNC_RECARGA === '1',
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
