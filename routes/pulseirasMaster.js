// routes/pulseirasMaster.js - pulseiras do estoque do master e o envio delas aos buffets
// Montada em /api/master/pulseiras. Só o master acessa. Regras: utils/pulseiraTransferencia.js
const express = require('express');
const router = express.Router();
const { query, allQuery, queryOne, withTransaction } = require('../database');
const { verifyToken, requireRole } = require('../utils/middleware');
const { STATUS, lerCodigos, listaDeParametros, registrarMovimento } = require('../utils/pulseiraTransferencia');

router.use(verifyToken, requireRole('master'));

const nomeDoMaster = (req) => req.user?.email || 'master';

// Estoque do master: o que está com ele e o que já enviou a um buffet e espera o aceite
router.get('/', async (req, res) => {
  try {
    const linhas = await allQuery(
      `SELECT p.codigo, p.statusTransferencia, p.empresaDestinoId, d.nome AS empresaDestinoNome, p.enviadoEm, p.criadoEm
       FROM pulseira p
       LEFT JOIN empresa d ON d.empresaId = p.empresaDestinoId
       WHERE p.empresaId = @master AND p.statusTransferencia IN (@estoque, @pendente)
       ORDER BY p.criadoEm DESC, p.codigo`,
      { master: req.user.empresaId, estoque: STATUS.ESTOQUE, pendente: STATUS.PENDENTE }
    );
    res.json(linhas);
  } catch (err) {
    console.error('❌ [MASTER-PULSEIRAS] Erro ao listar:', err);
    res.status(500).json({ error: err.message });
  }
});

// Põe pulseiras no estoque (lidas no leitor ou digitadas). Aceita { codigos: [...] } ou { codigos: "a b c" }.
router.post('/', async (req, res) => {
  try {
    const lidos = lerCodigos(req.body?.codigos);
    if (lidos.erro) return res.status(400).json({ error: lidos.erro });
    if (lidos.codigos.length === 0) return res.status(400).json({ error: 'Informe ao menos uma pulseira' });

    const master = req.user.empresaId;
    const adicionadas = [];
    const jaNoEstoque = [];
    await withTransaction(async (tx) => {
      for (const codigo of lidos.codigos) {
        const existente = await tx.queryOne('SELECT codigo FROM pulseira WHERE empresaId = @master AND codigo = @codigo', { master, codigo });
        if (existente) { jaNoEstoque.push(codigo); continue; }
        await tx.query(
          `INSERT INTO pulseira (codigo, status, empresaId, statusTransferencia, criadoEm)
           VALUES (@codigo, 'disponivel', @master, @estoque, now())`,
          { codigo, master, estoque: STATUS.ESTOQUE }
        );
        await registrarMovimento(tx, { codigo, tipo: 'cadastrada', empresaOrigemId: master, porNome: nomeDoMaster(req) });
        adicionadas.push(codigo);
      }
    });

    // Aviso: o mesmo código já existe em algum buffet (o aceite avisa se for o do buffet de destino)
    let jaComBuffet = [];
    if (adicionadas.length > 0) {
      const { marcadores, params } = listaDeParametros(adicionadas);
      jaComBuffet = (await allQuery(
        `SELECT DISTINCT codigo FROM pulseira WHERE empresaId <> @master AND codigo IN (${marcadores})`,
        { master, ...params }
      )).map((linha) => linha.codigo);
    }

    res.status(201).json({ adicionadas, jaNoEstoque, invalidos: lidos.invalidos, jaComBuffet });
  } catch (err) {
    console.error('❌ [MASTER-PULSEIRAS] Erro ao cadastrar:', err);
    res.status(500).json({ error: err.message });
  }
});

// Envia pulseiras do estoque a um buffet; elas ficam pendentes até o admin dele aceitar.
router.post('/enviar', async (req, res) => {
  try {
    const lidos = lerCodigos(req.body?.codigos);
    if (lidos.erro) return res.status(400).json({ error: lidos.erro });
    if (lidos.codigos.length === 0) return res.status(400).json({ error: 'Escolha ao menos uma pulseira' });

    const destino = String(req.body?.empresaId || '').trim();
    if (!destino) return res.status(400).json({ error: 'Informe o buffet (empresaId) de destino' });
    if (destino === req.user.empresaId) return res.status(400).json({ error: 'Escolha um buffet, não o master' });
    const empresa = await queryOne(
      `SELECT empresaId, nome FROM empresa WHERE empresaId = @destino AND LOWER(COALESCE(plano, '')) <> 'family'`,
      { destino }
    );
    if (!empresa) return res.status(404).json({ error: 'Buffet de destino não encontrado' });

    const master = req.user.empresaId;
    const { marcadores, params } = listaDeParametros(lidos.codigos);
    const enviadas = await withTransaction(async (tx) => {
      // A condição no WHERE evita enviar duas vezes se dois pedidos chegarem juntos
      const r = await tx.query(
        `UPDATE pulseira SET statusTransferencia = @pendente, empresaDestinoId = @destino, enviadoEm = now()
         WHERE empresaId = @master AND statusTransferencia = @estoque AND codigo IN (${marcadores})
         RETURNING codigo`,
        { master, destino, pendente: STATUS.PENDENTE, estoque: STATUS.ESTOQUE, ...params }
      );
      const codigos = (r.recordset || []).map((linha) => linha.codigo);
      for (const codigo of codigos) {
        await registrarMovimento(tx, { codigo, tipo: 'enviada', empresaOrigemId: master, empresaDestinoId: destino, porNome: nomeDoMaster(req) });
      }
      return codigos;
    });

    const ignoradas = lidos.codigos.filter((codigo) => !enviadas.includes(codigo));
    console.log(`📤 [MASTER-PULSEIRAS] ${enviadas.length} pulseira(s) enviada(s) para "${empresa.nome}"`);
    res.json({ enviadas, ignoradas, empresaNome: empresa.nome });
  } catch (err) {
    console.error('❌ [MASTER-PULSEIRAS] Erro ao enviar:', err);
    res.status(500).json({ error: err.message });
  }
});

// Cancela o envio de pulseiras que o buffet ainda não aceitou: voltam ao estoque.
router.post('/cancelar-envio', async (req, res) => {
  try {
    const lidos = lerCodigos(req.body?.codigos);
    if (lidos.erro || lidos.codigos.length === 0) return res.status(400).json({ error: lidos.erro || 'Escolha ao menos uma pulseira' });
    const { marcadores, params } = listaDeParametros(lidos.codigos);
    const r = await query(
      `UPDATE pulseira SET statusTransferencia = @estoque, empresaDestinoId = NULL, enviadoEm = NULL
       WHERE empresaId = @master AND statusTransferencia = @pendente AND codigo IN (${marcadores})
       RETURNING codigo`,
      { master: req.user.empresaId, estoque: STATUS.ESTOQUE, pendente: STATUS.PENDENTE, ...params }
    );
    res.json({ canceladas: (r.recordset || []).map((linha) => linha.codigo) });
  } catch (err) {
    console.error('❌ [MASTER-PULSEIRAS] Erro ao cancelar envio:', err);
    res.status(500).json({ error: err.message });
  }
});

// Tira do estoque pulseiras que ainda não foram enviadas (ex.: lida por engano).
router.post('/remover', async (req, res) => {
  try {
    const lidos = lerCodigos(req.body?.codigos);
    if (lidos.erro || lidos.codigos.length === 0) return res.status(400).json({ error: lidos.erro || 'Escolha ao menos uma pulseira' });
    const { marcadores, params } = listaDeParametros(lidos.codigos);
    const r = await query(
      `DELETE FROM pulseira WHERE empresaId = @master AND statusTransferencia = @estoque AND codigo IN (${marcadores}) RETURNING codigo`,
      { master: req.user.empresaId, estoque: STATUS.ESTOQUE, ...params }
    );
    res.json({ removidas: (r.recordset || []).map((linha) => linha.codigo) });
  } catch (err) {
    console.error('❌ [MASTER-PULSEIRAS] Erro ao remover:', err);
    res.status(500).json({ error: err.message });
  }
});

// Totais de envios por buffet (a partir do histórico) e o que está com cada um agora
router.get('/resumo', async (req, res) => {
  try {
    const master = req.user.empresaId;
    const buffets = await allQuery(
      `SELECT e.empresaId, e.nome,
              COUNT(*) FILTER (WHERE m.tipo = 'enviada') AS enviadas,
              COUNT(*) FILTER (WHERE m.tipo = 'aceita') AS aceitas,
              COUNT(*) FILTER (WHERE m.tipo = 'recusada') AS recusadas,
              COUNT(*) FILTER (WHERE m.tipo = 'devolvida') AS devolvidas,
              (SELECT COUNT(*) FROM pulseira p WHERE p.empresaDestinoId = e.empresaId AND p.statusTransferencia = @pendente) AS pendentes,
              (SELECT COUNT(*) FROM pulseira p WHERE p.empresaId = e.empresaId AND p.recebidoDoMasterEm IS NOT NULL) AS "emPosse"
       FROM pulseiraMovimento m
       JOIN empresa e ON e.empresaId = CASE WHEN m.tipo = 'devolvida' THEN m.empresaOrigemId ELSE m.empresaDestinoId END
       WHERE m.tipo <> 'cadastrada'
       GROUP BY e.empresaId, e.nome
       ORDER BY e.nome`,
      { pendente: STATUS.PENDENTE }
    );
    const estoque = await queryOne(
      `SELECT COUNT(*) FILTER (WHERE statusTransferencia = @estoque) AS estoque,
              COUNT(*) FILTER (WHERE statusTransferencia = @pendente) AS pendentes
       FROM pulseira WHERE empresaId = @master`,
      { master, estoque: STATUS.ESTOQUE, pendente: STATUS.PENDENTE }
    );
    const numeros = (linha) => Object.fromEntries(Object.entries(linha).map(([chave, valor]) => [chave, typeof valor === 'string' && /^\d+$/.test(valor) ? Number(valor) : valor]));
    res.json({
      estoque: Number(estoque?.estoque || 0),
      pendentes: Number(estoque?.pendentes || 0),
      buffets: buffets.map(numeros),
    });
  } catch (err) {
    console.error('❌ [MASTER-PULSEIRAS] Erro no resumo:', err);
    res.status(500).json({ error: err.message });
  }
});

// Últimos passos (envios, aceites, recusas, devoluções)
router.get('/historico', async (req, res) => {
  try {
    const limite = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 100, 1), 500);
    res.json(await allQuery(
      `SELECT m.codigo, m.tipo, m.criadoEm, m.porNome,
              CASE WHEN m.tipo = 'devolvida' THEN o.nome ELSE d.nome END AS buffetNome
       FROM pulseiraMovimento m
       LEFT JOIN empresa o ON o.empresaId = m.empresaOrigemId
       LEFT JOIN empresa d ON d.empresaId = m.empresaDestinoId
       WHERE m.tipo <> 'cadastrada'
       ORDER BY m.criadoEm DESC
       LIMIT ${limite}`
    ));
  } catch (err) {
    console.error('❌ [MASTER-PULSEIRAS] Erro no histórico:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
