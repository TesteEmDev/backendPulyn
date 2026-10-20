// routes/uhf.js - Leitores UHF (Chainway UR4), antenas e mapa de calor
//
// POST /lote é chamado pelo firmware do leitor (sem JWT): ele se identifica com X-Module-Id + a chave do leitor,
// em "Authorization: Bearer <chave>" (como o firmware original) ou em X-Device-Key. O middleware de /api deixa
// /uhf/lote passar sem validar JWT, como faz com /leituras.
// O resto é para o painel (admin/master configuram; recreacionista vê o mapa; família só o agregado e o próprio filho).
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();
const { query, queryOne, allQuery, withTransaction } = require('../database');
const { verifyToken, requireRole, isMaster } = require('../utils/middleware');
const {
  validarLote, baldeDe, momentoDoLote, gerarChave, hashChave, chaveConfere, codigoDoEpc, epcDoCodigo,
  CICLO_MS, CICLOS_POR_LOTE, PORTAS,
} = require('../utils/uhfLote');
const { ajustarCalibracao } = require('../utils/uhfPosicao');
const {
  montarMapa, invalidarMapa, buscarAntenas, buscarPulseiras, buscarCiclos, chaveCiclos, LEITOR_ONLINE_MS,
} = require('../utils/uhfMapa');

const ADMIN = ['admin', 'master'];
const VER_MAPA = ['admin', 'master', 'game_master'];
const RETENCAO_DIAS = 7;

function resolveEmpresaId(req) {
  if (isMaster(req) && req.query.empresaId) return String(req.query.empresaId);
  return req.user.empresaId;
}

function erroHttp(mensagem, status) {
  return Object.assign(new Error(mensagem), { statusCode: status });
}

function responderErro(res, err, contexto) {
  if (!err.statusCode || err.statusCode >= 500) console.error(`❌ [UHF] ${contexto}:`, err);
  res.status(err.statusCode || 500).json({ error: err.message });
}

const numeroOuNull = (valor) => (valor === null || valor === '' || valor === undefined ? null : Number(valor));

function moduleIdValido(valor) {
  const id = String(valor || '').trim();
  if (!/^[A-Za-z0-9_-]{1,16}$/.test(id)) throw erroHttp('O ID do módulo deve ter de 1 a 16 letras, números, - ou _', 400);
  return id;
}

function configDoLeitor(leitor) {
  return { cicloMs: CICLO_MS, janelaCiclos: CICLOS_POR_LOTE, potenciaDbm: Number(leitor.potenciaDbm), rssiMin: Number(leitor.rssiMin) };
}

// ---------- firmware ----------

// Último balde avisado por empresa (nesta instância), para avisar o painel quando uma janela fecha.
const ultimoBaldePorEmpresa = new Map();
let ultimaLimpeza = 0;

async function limparAntigos() {
  if (Date.now() - ultimaLimpeza < 60 * 60 * 1000) return;
  ultimaLimpeza = Date.now();
  const limite = new Date(Date.now() - RETENCAO_DIAS * 24 * 60 * 60 * 1000);
  try {
    await query('DELETE FROM amostraUhf WHERE balde < @limite', { limite });
    await query('DELETE FROM loteUhf WHERE recebidoEm < @limite', { limite });
  } catch (err) {
    console.error('❌ [UHF] Erro ao apagar amostras antigas:', err.message);
  }
}

router.post('/lote', async (req, res) => {
  try {
    const moduleId = String(req.get('X-Module-Id') || '').trim();
    const bearer = String(req.get('Authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1];
    const chave = String(req.get('X-Device-Key') || bearer || '').trim();
    if (!moduleId || !chave) return res.status(401).json({ error: 'X-Module-Id e a chave do leitor (Authorization: Bearer) são obrigatórios' });

    const candidatos = await allQuery('SELECT * FROM leitorUhf WHERE moduleId = @moduleId', { moduleId });
    if (candidatos.length === 0) return res.status(404).json({ error: 'Leitor não cadastrado' });
    const leitor = candidatos.find((l) => chaveConfere(chave, l.chaveHash));
    if (!leitor) return res.status(401).json({ error: 'Chave do leitor inválida' });
    if (!leitor.ativo) return res.status(403).json({ error: 'Leitor desativado' });

    const lote = validarLote(req.body, { rssiMin: Number(leitor.rssiMin) });
    if (lote.erro) return res.status(lote.status || 400).json({ error: lote.erro });

    const agora = new Date();
    const balde = baldeDe(momentoDoLote(req.body.fimEm, agora));
    const antenas = await allQuery('SELECT antenaId, porta, ativa FROM antenaUhf WHERE leitorId = @leitorId', { leitorId: leitor.leitorId });
    const antenaPorPorta = new Map(antenas.filter((a) => a.ativa).map((a) => [Number(a.porta), a.antenaId]));
    const leituras = lote.leituras.filter((l) => antenaPorPorta.has(l.porta));
    const semAntena = lote.leituras.length - leituras.length;

    const duplicado = await withTransaction(async (tx) => {
      const novo = await tx.query(
        `INSERT INTO loteUhf (leitorId, seq, recebidoEm, balde, total, ciclos) VALUES (@leitorId, @seq, @agora, @balde, @total, @ciclos)
         ON CONFLICT (leitorId, seq) DO NOTHING`,
        { leitorId: leitor.leitorId, seq: lote.seq, agora, balde, total: leituras.length, ciclos: lote.ciclos }
      );
      if (!Number(novo?.rowsAffected?.[0] || 0)) return true;

      if (leituras.length) {
        const params = { balde, empresaId: leitor.empresaId, agora };
        const valores = leituras.map((l, i) => {
          Object.assign(params, {
            [`a${i}`]: antenaPorPorta.get(l.porta), [`c${i}`]: l.codigo, [`n${i}`]: l.n,
            [`m${i}`]: l.rssiMed, [`x${i}`]: l.rssiMax,
          });
          return `(@balde, @a${i}, @c${i}, @empresaId, @n${i}, ${lote.ciclos}, @m${i}, @x${i}, @agora)`;
        });
        // Vários lotes do mesmo leitor na mesma janela: soma n e os ciclos e faz a média do RSSI ponderada por n.
        await tx.query(
          `INSERT INTO amostraUhf (balde, antenaId, codigo, empresaId, n, ciclos, rssiMed, rssiMax, vistoEm)
           VALUES ${valores.join(', ')}
           ON CONFLICT (balde, antenaId, codigo) DO UPDATE SET
             rssiMed = (amostraUhf.rssiMed * amostraUhf.n + EXCLUDED.rssiMed * EXCLUDED.n) / (amostraUhf.n + EXCLUDED.n),
             n = amostraUhf.n + EXCLUDED.n,
             ciclos = amostraUhf.ciclos + EXCLUDED.ciclos,
             rssiMax = GREATEST(amostraUhf.rssiMax, EXCLUDED.rssiMax),
             vistoEm = GREATEST(amostraUhf.vistoEm, EXCLUDED.vistoEm)`,
          params
        );
      }
      return false;
    });

    await query(
      `UPDATE leitorUhf SET ultimoLoteEm = @agora, ultimoSeq = GREATEST(ultimoSeq, @seq), fw = @fw, ultimasPortas = @portas
       WHERE leitorId = @leitorId`,
      { agora, seq: lote.seq, fw: String(req.body.fw || '').slice(0, 20) || null, portas: lote.portas.join(',') || null, leitorId: leitor.leitorId }
    );

    if (!duplicado) {
      invalidarMapa(leitor.empresaId);
      const chaveEmpresa = String(leitor.empresaId).toLowerCase();
      const anterior = ultimoBaldePorEmpresa.get(chaveEmpresa);
      if (anterior !== undefined && balde.getTime() > anterior && typeof global.broadcastToCompany === 'function') {
        global.broadcastToCompany(leitor.empresaId, {
          type: 'UHF_MAPA_ATUALIZADO', payload: { empresaId: leitor.empresaId, balde: new Date(anterior).toISOString() },
        });
      }
      if (anterior === undefined || balde.getTime() > anterior) ultimoBaldePorEmpresa.set(chaveEmpresa, balde.getTime());
      limparAntigos();
    }

    res.json({
      ok: true, seq: lote.seq, duplicado, aceitas: duplicado ? 0 : leituras.length,
      ignoradas: lote.ignoradas + semAntena, config: configDoLeitor(leitor),
      agoraMs: Date.now(),   // o leitor acerta o relógio por aqui e manda o fimEm dos próximos lotes
    });
  } catch (err) {
    responderErro(res, err, 'Erro ao receber lote');
  }
});

// ---------- leitores e antenas (admin) ----------

async function listarLeitores(empresaId) {
  const [leitores, antenas] = await Promise.all([
    allQuery(
      `SELECT leitorId, moduleId, nome, potenciaDbm, rssiMin, ativo, ultimoLoteEm, ultimoSeq, fw, ultimasPortas, criadoEm
         FROM leitorUhf WHERE empresaId = @empresaId ORDER BY nome`,
      { empresaId }
    ),
    allQuery(
      `SELECT a.*, (SELECT MAX(s.balde) FROM amostraUhf s WHERE s.antenaId = a.antenaId AND s.balde > @recente) AS ultimaAmostraEm
         FROM antenaUhf a JOIN leitorUhf l ON l.leitorId = a.leitorId
        WHERE l.empresaId = @empresaId ORDER BY a.porta`,
      { empresaId, recente: new Date(Date.now() - 5 * 60 * 1000) }
    ),
  ]);
  const agora = Date.now();
  return leitores.map((l) => ({
    ...l,
    online: Boolean(l.ultimoLoteEm) && agora - new Date(l.ultimoLoteEm).getTime() <= LEITOR_ONLINE_MS,
    antenas: antenas.filter((a) => a.leitorId === l.leitorId).map(formatarAntena),
  }));
}

function formatarAntena(a) {
  return {
    antenaId: a.antenaId, leitorId: a.leitorId, porta: Number(a.porta), nome: a.nome,
    mapaX: numeroOuNull(a.mapaX), mapaY: numeroOuNull(a.mapaY), direcaoGraus: numeroOuNull(a.direcaoGraus),
    raioMetros: Number(a.raioMetros), rssi1m: numeroOuNull(a.rssi1m), expoente: Number(a.expoente), ativa: Boolean(a.ativa),
    ultimaAmostraEm: a.ultimaAmostraEm || null,
  };
}

async function buscarLeitorDaEmpresa(leitorId, empresaId) {
  const leitor = await queryOne('SELECT * FROM leitorUhf WHERE leitorId = @leitorId AND empresaId = @empresaId', { leitorId, empresaId });
  if (!leitor) throw erroHttp('Leitor não encontrado', 404);
  return leitor;
}

async function buscarAntenaDaEmpresa(antenaId, empresaId) {
  const antena = await queryOne(
    `SELECT a.* FROM antenaUhf a JOIN leitorUhf l ON l.leitorId = a.leitorId
      WHERE a.antenaId = @antenaId AND l.empresaId = @empresaId`,
    { antenaId, empresaId }
  );
  if (!antena) throw erroHttp('Antena não encontrada', 404);
  return antena;
}

function lerPotencia(valor, atual) {
  if (valor === undefined) return atual;
  const potencia = Number(valor);
  if (!Number.isInteger(potencia) || potencia < 5 || potencia > 30) throw erroHttp('Potência deve ser de 5 a 30 dBm', 400);
  return potencia;
}

function lerRssiMin(valor, atual) {
  if (valor === undefined) return atual;
  const rssi = Number(valor);
  if (!Number.isInteger(rssi) || rssi < -100 || rssi > -20) throw erroHttp('RSSI mínimo deve ser de -100 a -20 dBm', 400);
  return rssi;
}

// Configuração completa: escala da planta + leitores com antenas.
router.get('/config', verifyToken, requireRole(...VER_MAPA), async (req, res) => {
  try {
    const empresaId = resolveEmpresaId(req);
    const empresa = await queryOne('SELECT mapaMetrosPorUnidade FROM empresa WHERE empresaId = @empresaId', { empresaId });
    res.json({ escalaMetrosPorUnidade: numeroOuNull(empresa?.mapaMetrosPorUnidade), leitores: await listarLeitores(empresaId) });
  } catch (err) {
    responderErro(res, err, 'Erro ao carregar configuração');
  }
});

router.put('/escala', verifyToken, requireRole(...ADMIN), async (req, res) => {
  try {
    const escala = Number(req.body?.metrosPorUnidade);
    if (!Number.isFinite(escala) || escala <= 0 || escala > 10) throw erroHttp('Escala inválida (metros por unidade da planta)', 400);
    const empresaId = resolveEmpresaId(req);
    await query('UPDATE empresa SET mapaMetrosPorUnidade = @escala WHERE empresaId = @empresaId', { escala, empresaId });
    invalidarMapa(empresaId);
    res.json({ ok: true, escalaMetrosPorUnidade: escala });
  } catch (err) {
    responderErro(res, err, 'Erro ao salvar escala');
  }
});

// Cria o leitor com as 4 antenas. A chave só aparece nesta resposta (no banco fica só o hash).
router.post('/leitores', verifyToken, requireRole(...ADMIN), async (req, res) => {
  try {
    const empresaId = resolveEmpresaId(req);
    const moduleId = moduleIdValido(req.body?.moduleId);
    const nome = String(req.body?.nome || '').trim().slice(0, 100) || `Leitor ${moduleId}`;
    const potenciaDbm = lerPotencia(req.body?.potenciaDbm, 25);
    const rssiMin = lerRssiMin(req.body?.rssiMin, -75);

    const existente = await queryOne('SELECT leitorId FROM leitorUhf WHERE empresaId = @empresaId AND moduleId = @moduleId', { empresaId, moduleId });
    if (existente) throw erroHttp('Já existe um leitor com esse ID de módulo', 409);

    const chave = gerarChave();
    const leitorId = uuidv4();
    await withTransaction(async (tx) => {
      await tx.query(
        `INSERT INTO leitorUhf (leitorId, empresaId, moduleId, nome, chaveHash, potenciaDbm, rssiMin)
         VALUES (@leitorId, @empresaId, @moduleId, @nome, @chaveHash, @potenciaDbm, @rssiMin)`,
        { leitorId, empresaId, moduleId, nome, chaveHash: hashChave(chave), potenciaDbm, rssiMin }
      );
      for (const porta of PORTAS) {
        await tx.query(
          'INSERT INTO antenaUhf (antenaId, leitorId, porta, nome) VALUES (@antenaId, @leitorId, @porta, @nome)',
          { antenaId: uuidv4(), leitorId, porta, nome: `${nome} · antena ${porta}` }
        );
      }
    });

    const leitor = (await listarLeitores(empresaId)).find((l) => l.leitorId === leitorId);
    res.status(201).json({ leitor, chave });
  } catch (err) {
    responderErro(res, err, 'Erro ao criar leitor');
  }
});

router.put('/leitores/:id', verifyToken, requireRole(...ADMIN), async (req, res) => {
  try {
    const empresaId = resolveEmpresaId(req);
    const atual = await buscarLeitorDaEmpresa(req.params.id, empresaId);
    const corpo = req.body || {};
    const moduleId = corpo.moduleId === undefined ? atual.moduleId : moduleIdValido(corpo.moduleId);
    if (moduleId !== atual.moduleId) {
      const repetido = await queryOne(
        'SELECT leitorId FROM leitorUhf WHERE empresaId = @empresaId AND moduleId = @moduleId AND leitorId <> @leitorId',
        { empresaId, moduleId, leitorId: atual.leitorId }
      );
      if (repetido) throw erroHttp('Já existe um leitor com esse ID de módulo', 409);
    }
    await query(
      `UPDATE leitorUhf SET moduleId = @moduleId, nome = @nome, potenciaDbm = @potenciaDbm, rssiMin = @rssiMin, ativo = @ativo
       WHERE leitorId = @leitorId`,
      {
        leitorId: atual.leitorId, moduleId,
        nome: corpo.nome === undefined ? atual.nome : (String(corpo.nome).trim().slice(0, 100) || atual.nome),
        potenciaDbm: lerPotencia(corpo.potenciaDbm, atual.potenciaDbm),
        rssiMin: lerRssiMin(corpo.rssiMin, atual.rssiMin),
        ativo: corpo.ativo === undefined ? atual.ativo : Boolean(corpo.ativo),
      }
    );
    invalidarMapa(empresaId);
    res.json((await listarLeitores(empresaId)).find((l) => l.leitorId === atual.leitorId));
  } catch (err) {
    responderErro(res, err, 'Erro ao atualizar leitor');
  }
});

router.post('/leitores/:id/chave', verifyToken, requireRole(...ADMIN), async (req, res) => {
  try {
    const empresaId = resolveEmpresaId(req);
    const leitor = await buscarLeitorDaEmpresa(req.params.id, empresaId);
    const chave = gerarChave();
    await query('UPDATE leitorUhf SET chaveHash = @chaveHash WHERE leitorId = @leitorId', { chaveHash: hashChave(chave), leitorId: leitor.leitorId });
    res.json({ chave });
  } catch (err) {
    responderErro(res, err, 'Erro ao gerar chave');
  }
});

router.delete('/leitores/:id', verifyToken, requireRole(...ADMIN), async (req, res) => {
  try {
    const empresaId = resolveEmpresaId(req);
    const leitor = await buscarLeitorDaEmpresa(req.params.id, empresaId);
    await query('DELETE FROM leitorUhf WHERE leitorId = @leitorId', { leitorId: leitor.leitorId });
    invalidarMapa(empresaId);
    res.json({ ok: true });
  } catch (err) {
    responderErro(res, err, 'Erro ao remover leitor');
  }
});

// Posição, direção, raio e nome da antena. `mapaX`/`mapaY` null tiram a antena do mapa.
router.put('/antenas/:id', verifyToken, requireRole(...ADMIN), async (req, res) => {
  try {
    const empresaId = resolveEmpresaId(req);
    const atual = await buscarAntenaDaEmpresa(req.params.id, empresaId);
    const corpo = req.body || {};
    const campo = (nome) => (corpo[nome] === undefined ? numeroOuNull(atual[nome]) : numeroOuNull(corpo[nome]));

    const mapaX = campo('mapaX');
    const mapaY = campo('mapaY');
    if ((mapaX === null) !== (mapaY === null)) throw erroHttp('Informe mapaX e mapaY juntos', 400);
    if (mapaX !== null && (!Number.isFinite(mapaX) || !Number.isFinite(mapaY) || mapaX < 0 || mapaX > 450 || mapaY < 0 || mapaY > 320)) {
      throw erroHttp('Posição fora da planta (0-450 x 0-320)', 400);
    }
    let direcaoGraus = campo('direcaoGraus');
    if (direcaoGraus !== null) {
      if (!Number.isFinite(direcaoGraus)) throw erroHttp('Direção inválida', 400);
      direcaoGraus = ((direcaoGraus % 360) + 360) % 360;
    }
    const raioMetros = campo('raioMetros');
    if (!Number.isFinite(raioMetros) || raioMetros < 0.2 || raioMetros > 15) throw erroHttp('Raio deve ser de 0,2 a 15 m', 400);

    await query(
      `UPDATE antenaUhf SET nome = @nome, mapaX = @mapaX, mapaY = @mapaY, direcaoGraus = @direcaoGraus,
              raioMetros = @raioMetros, ativa = @ativa
        WHERE antenaId = @antenaId`,
      {
        antenaId: atual.antenaId, mapaX, mapaY, direcaoGraus, raioMetros,
        nome: corpo.nome === undefined ? atual.nome : String(corpo.nome || '').trim().slice(0, 100) || null,
        ativa: corpo.ativa === undefined ? atual.ativa : Boolean(corpo.ativa),
      }
    );
    invalidarMapa(empresaId);
    res.json(formatarAntena(await queryOne('SELECT * FROM antenaUhf WHERE antenaId = @antenaId', { antenaId: atual.antenaId })));
  } catch (err) {
    responderErro(res, err, 'Erro ao atualizar antena');
  }
});

// Leitura mais recente de cada pulseira nesta antena (último minuto), para a calibração ao vivo.
router.get('/antenas/:id/leituras', verifyToken, requireRole(...ADMIN), async (req, res) => {
  try {
    const empresaId = resolveEmpresaId(req);
    const antena = await buscarAntenaDaEmpresa(req.params.id, empresaId);
    const desde = new Date(Date.now() - 60 * 1000);
    const [leituras, ciclos] = await Promise.all([
      allQuery(
        `SELECT balde, codigo, n, ciclos, rssiMed, rssiMax FROM amostraUhf
          WHERE antenaId = @antenaId AND balde > @desde ORDER BY balde DESC, rssiMed DESC LIMIT 20`,
        { antenaId: antena.antenaId, desde }
      ),
      buscarCiclos(empresaId, desde, new Date()),
    ]);
    res.json(leituras.map((l) => ({
      ...l, n: Number(l.n), rssiMed: Number(l.rssiMed), rssiMax: Number(l.rssiMax),
      ciclos: Math.max(Number(l.ciclos), ciclos.get(chaveCiclos(antena.leitorId, l.balde)) || 0),
    })));
  } catch (err) {
    responderErro(res, err, 'Erro ao buscar leituras da antena');
  }
});

// Calibração: { medicoes: [{ distancia, rssi }] } com pelo menos 2 distâncias diferentes. { limpar: true } desfaz.
router.post('/antenas/:id/calibrar', verifyToken, requireRole(...ADMIN), async (req, res) => {
  try {
    const empresaId = resolveEmpresaId(req);
    const antena = await buscarAntenaDaEmpresa(req.params.id, empresaId);
    let resultado = { rssi1m: null, expoente: 4 };
    if (!req.body?.limpar) {
      resultado = ajustarCalibracao(req.body?.medicoes);
      if (!resultado) throw erroHttp('Medições insuficientes: use pelo menos 2 distâncias e o sinal precisa cair com a distância', 400);
    }
    await query('UPDATE antenaUhf SET rssi1m = @rssi1m, expoente = @expoente WHERE antenaId = @antenaId', { ...resultado, antenaId: antena.antenaId });
    invalidarMapa(empresaId);
    res.json(resultado);
  } catch (err) {
    responderErro(res, err, 'Erro ao calibrar antena');
  }
});

// ---------- vínculo pulseira <-> EPC ----------

// Tags lidas pelos leitores nos últimos 2 minutos (uma por tag, a mais recente primeiro), com a pulseira já vinculada.
router.get('/tags-vistas', verifyToken, requireRole(...ADMIN), async (req, res) => {
  try {
    const empresaId = resolveEmpresaId(req);
    const [amostras, antenas, pulseiras] = await Promise.all([
      allQuery(
        `SELECT COALESCE(vistoEm, balde) AS balde, antenaId, codigo, n, rssiMax FROM amostraUhf
          WHERE empresaId = @empresaId AND balde > @desde`,
        { empresaId, desde: new Date(Date.now() - 2 * 60 * 1000) }
      ),
      buscarAntenas(empresaId),
      buscarPulseiras(empresaId),
    ]);
    const nomeDaAntena = new Map(antenas.map((a) => [String(a.antenaId).toLowerCase(), a.nome || `${a.leitorNome} · porta ${a.porta}`]));
    const porTag = new Map();
    for (const s of amostras) {
      const atual = porTag.get(s.codigo) || { tag: s.codigo, ultimaVez: s.balde, rssiMax: -Infinity, n: 0, antenas: new Set() };
      if (new Date(s.balde) > new Date(atual.ultimaVez)) atual.ultimaVez = s.balde;
      atual.rssiMax = Math.max(atual.rssiMax, Number(s.rssiMax));
      atual.n += Number(s.n);
      atual.antenas.add(nomeDaAntena.get(String(s.antenaId).toLowerCase()) || 'antena removida');
      porTag.set(s.codigo, atual);
    }
    const tags = [...porTag.values()]
      .sort((a, b) => new Date(b.ultimaVez) - new Date(a.ultimaVez) || b.rssiMax - a.rssiMax)
      .slice(0, 50)
      .map((t) => {
        const pulseira = pulseiras.get(t.tag);
        return {
          tag: t.tag, epc: epcDoCodigo(t.tag), ultimaVez: new Date(t.ultimaVez).toISOString(), rssiMax: t.rssiMax, n: t.n,
          antenas: [...t.antenas],
          pulseira: pulseira ? { codigo: pulseira.codigo, nome: pulseira.apelido || pulseira.nome || null } : null,
        };
      });
    res.json(tags);
  } catch (err) {
    responderErro(res, err, 'Erro ao buscar tags vistas');
  }
});

router.get('/pulseiras', verifyToken, requireRole(...ADMIN), async (req, res) => {
  try {
    const linhas = await allQuery(
      `SELECT p.codigo, p.epc, p.status, c.nome, c.apelido
         FROM pulseira p LEFT JOIN crianca c ON c.criancaId = p.criancaId
        WHERE p.empresaId = @empresaId
        ORDER BY p.codigo`,
      { empresaId: resolveEmpresaId(req) }
    );
    res.json(linhas.map((l) => ({ codigo: l.codigo, epc: l.epc || null, status: l.status, crianca: l.apelido || l.nome || null })));
  } catch (err) {
    responderErro(res, err, 'Erro ao listar pulseiras');
  }
});

// { epc: 'ABCABC000000000000000010' } vincula; { epc: null } desvincula.
router.put('/pulseiras/:codigo/epc', verifyToken, requireRole(...ADMIN), async (req, res) => {
  try {
    const empresaId = resolveEmpresaId(req);
    const pulseira = await queryOne(
      'SELECT codigo FROM pulseira WHERE empresaId = @empresaId AND UPPER(codigo) = UPPER(@codigo)',
      { empresaId, codigo: String(req.params.codigo || '') }
    );
    if (!pulseira) throw erroHttp('Pulseira não encontrada', 404);

    let epc = null;
    if (req.body?.epc) {
      epc = epcDoCodigo(req.body.epc);
      if (!epc || !codigoDoEpc(epc)) throw erroHttp('EPC inválido: use até 24 caracteres hexadecimais (0-9, A-F)', 400);
      const outra = await queryOne(
        'SELECT codigo FROM pulseira WHERE empresaId = @empresaId AND epc = @epc AND codigo <> @codigo',
        { empresaId, epc, codigo: pulseira.codigo }
      );
      if (outra) throw erroHttp(`Este EPC já está vinculado à pulseira ${outra.codigo}`, 409);
    }

    await query('UPDATE pulseira SET epc = @epc WHERE empresaId = @empresaId AND codigo = @codigo', { epc, empresaId, codigo: pulseira.codigo });
    invalidarMapa(empresaId);
    res.json({ codigo: pulseira.codigo, epc });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Este EPC já está vinculado a outra pulseira' });
    responderErro(res, err, 'Erro ao vincular EPC');
  }
});

// ---------- mapa ----------

function opcoesDoMapa(req) {
  const modo = req.query.modo === '5min' ? '5min' : 'agora';
  return { modo, balde: req.query.balde || undefined, eventoId: req.query.eventoId || undefined, timeId: req.query.timeId || undefined };
}

router.get('/mapa-calor', verifyToken, requireRole(...VER_MAPA), async (req, res) => {
  try {
    res.json(await montarMapa(resolveEmpresaId(req), opcoesDoMapa(req)));
  } catch (err) {
    responderErro(res, err, 'Erro ao montar mapa de calor');
  }
});

// ---------- família (app dos pais) ----------

// Crianças aprovadas para este responsável, com o buffet de cada uma. Não filtra pela empresa do login: a conta
// criada pelo cadastro aberto tem uma "empresa" própria, diferente da do buffet (utils/empresaFamilia.js).
async function criancasDoResponsavel(req) {
  return allQuery(
    `SELECT v.criancaId, v.empresaId, c.eventoId FROM vinculoFamiliar v JOIN crianca c ON c.criancaId = v.criancaId
      WHERE v.loginId = @loginId AND v.status = 'approved'`,
    { loginId: req.user.id }
  );
}

// Mapa anônimo: só regiões com pelo menos 3 pulseiras, sem posições individuais nem antenas.
router.get('/familia/agregado', verifyToken, requireRole('family'), async (req, res) => {
  try {
    const criancas = await criancasDoResponsavel(req);
    const eventoId = req.query.eventoId || criancas[0]?.eventoId;
    const doEvento = eventoId && criancas.find((c) => String(c.eventoId).toLowerCase() === String(eventoId).toLowerCase());
    if (!doEvento) return res.status(403).json({ error: 'Nenhuma criança sua está neste evento' });
    const mapa = await montarMapa(doEvento.empresaId, { modo: 'agora', eventoId });
    res.json({ geradoEm: mapa.geradoEm, balde: mapa.balde, proximaAtualizacaoEm: mapa.proximaAtualizacaoEm, largura: mapa.largura, altura: mapa.altura, regioes: mapa.regioes });
  } catch (err) {
    responderErro(res, err, 'Erro ao montar mapa da família');
  }
});

// Posição e calor do próprio filho (só com vínculo aprovado). O calor considera só a pulseira dele:
// ?modo=agora (último minuto, suavizado) ou ?modo=5min (por onde ele andou nos últimos 5 minutos).
router.get('/familia/crianca/:criancaId', verifyToken, requireRole('family'), async (req, res) => {
  try {
    const criancas = await criancasDoResponsavel(req);
    const vinculo = criancas.find((c) => String(c.criancaId).toLowerCase() === String(req.params.criancaId).toLowerCase());
    if (!vinculo) return res.status(403).json({ error: 'Criança não vinculada a você' });
    const modo = req.query.modo === '5min' ? '5min' : 'agora';
    const mapa = await montarMapa(vinculo.empresaId, { modo, eventoId: vinculo.eventoId, criancaId: vinculo.criancaId });
    const posicao = mapa.criancas.find((c) => String(c.criancaId).toLowerCase() === String(vinculo.criancaId).toLowerCase());
    res.json({
      geradoEm: mapa.geradoEm, balde: mapa.balde, modo, proximaAtualizacaoEm: mapa.proximaAtualizacaoEm, largura: mapa.largura, altura: mapa.altura,
      celulaUnidades: mapa.celulaUnidades, valorMax: mapa.valorMax, celulas: mapa.celulas,
      posicao: posicao ? { x: posicao.x, y: posicao.y, metodo: posicao.metodo, confianca: posicao.confianca } : null,
    });
  } catch (err) {
    responderErro(res, err, 'Erro ao buscar posição da criança');
  }
});

module.exports = router;
