// routes/pulseirasRecebimento.js - o admin do buffet aceita, recusa e devolve as pulseiras enviadas pelo master
// Montada em /api/pulseiras/recebimento (antes de /api/pulseiras). Regras: utils/pulseiraTransferencia.js
const express = require('express');
const router = express.Router();
const { query, allQuery, queryOne, withTransaction } = require('../database');
const { verifyToken, requireRole } = require('../utils/middleware');
const { STATUS, lerCodigos, listaDeParametros, registrarMovimento } = require('../utils/pulseiraTransferencia');

router.use(verifyToken, requireRole('admin'));

const nomeDoBuffet = (req) => req.user?.empresa_nome || req.user?.email || 'buffet';

function codigosDoPedido(req, res) {
  const lidos = lerCodigos(req.body?.codigos);
  if (lidos.erro || lidos.codigos.length === 0) {
    res.status(400).json({ error: lidos.erro || 'Escolha ao menos uma pulseira' });
    return null;
  }
  return lidos.codigos;
}

// Enviadas a este buffet que esperam o aceite
router.get('/pendentes', async (req, res) => {
  try {
    res.json(await allQuery(
      `SELECT codigo, enviadoEm FROM pulseira
       WHERE empresaDestinoId = @empresaId AND statusTransferencia = @pendente
       ORDER BY enviadoEm DESC, codigo`,
      { empresaId: req.user.empresaId, pendente: STATUS.PENDENTE }
    ));
  } catch (err) {
    console.error('❌ [PULSEIRAS-RECEBIMENTO] Erro ao listar pendentes:', err);
    res.status(500).json({ error: err.message });
  }
});

// Pulseiras que vieram do master e já são do buffet, com a situação de cada uma (só as livres podem ser devolvidas)
router.get('/recebidas', async (req, res) => {
  try {
    res.json(await allQuery(
      `SELECT p.codigo, p.status, p.recebidoDoMasterEm, (p.criancaId IS NOT NULL) AS "emUso"
       FROM pulseira p
       WHERE p.empresaId = @empresaId AND p.recebidoDoMasterEm IS NOT NULL
       ORDER BY p.recebidoDoMasterEm DESC, p.codigo`,
      { empresaId: req.user.empresaId }
    ));
  } catch (err) {
    console.error('❌ [PULSEIRAS-RECEBIMENTO] Erro ao listar recebidas:', err);
    res.status(500).json({ error: err.message });
  }
});

// Aceita: a pulseira passa a ser do buffet (livre para uso). Se o buffet já tinha o mesmo código cadastrado, a cópia do
// master é descartada e a que o buffet já tem fica marcada como recebida.
router.post('/aceitar', async (req, res) => {
  try {
    const codigos = codigosDoPedido(req, res);
    if (!codigos) return;
    const empresaId = req.user.empresaId;

    const aceitas = [];
    await withTransaction(async (tx) => {
      for (const codigo of codigos) {
        const pendente = await tx.queryOne(
          `SELECT empresaId FROM pulseira WHERE empresaDestinoId = @empresaId AND statusTransferencia = @pendente AND codigo = @codigo`,
          { empresaId, pendente: STATUS.PENDENTE, codigo }
        );
        if (!pendente) continue;
        const doBuffet = await tx.queryOne('SELECT codigo FROM pulseira WHERE empresaId = @empresaId AND codigo = @codigo', { empresaId, codigo });
        if (doBuffet) {
          await tx.query('DELETE FROM pulseira WHERE empresaId = @master AND codigo = @codigo', { master: pendente.empresaId, codigo });
          await tx.query('UPDATE pulseira SET recebidoDoMasterEm = COALESCE(recebidoDoMasterEm, now()) WHERE empresaId = @empresaId AND codigo = @codigo', { empresaId, codigo });
        } else {
          await tx.query(
            `UPDATE pulseira
             SET empresaId = @empresaId, status = 'disponivel', criancaId = NULL, statusTransferencia = @aceito,
                 empresaDestinoId = NULL, recebidoDoMasterEm = now()
             WHERE empresaId = @master AND codigo = @codigo`,
            { empresaId, aceito: STATUS.ACEITO, master: pendente.empresaId, codigo }
          );
        }
        await registrarMovimento(tx, { codigo, tipo: 'aceita', empresaOrigemId: pendente.empresaId, empresaDestinoId: empresaId, porNome: nomeDoBuffet(req) });
        aceitas.push(codigo);
      }
    });
    console.log(`📥 [PULSEIRAS-RECEBIMENTO] Buffet ${empresaId} aceitou ${aceitas.length} pulseira(s)`);
    res.json({ aceitas, ignoradas: codigos.filter((c) => !aceitas.includes(c)) });
  } catch (err) {
    console.error('❌ [PULSEIRAS-RECEBIMENTO] Erro ao aceitar:', err);
    res.status(500).json({ error: err.message });
  }
});

// Recusa o que ainda não aceitou: volta ao estoque do master.
router.post('/recusar', async (req, res) => {
  try {
    const codigos = codigosDoPedido(req, res);
    if (!codigos) return;
    const empresaId = req.user.empresaId;
    const { marcadores, params } = listaDeParametros(codigos);

    const recusadas = await withTransaction(async (tx) => {
      const r = await tx.query(
        `UPDATE pulseira SET statusTransferencia = @estoque, empresaDestinoId = NULL, enviadoEm = NULL
         WHERE empresaDestinoId = @empresaId AND statusTransferencia = @pendente AND codigo IN (${marcadores})
         RETURNING codigo, empresaId`,
        { empresaId, estoque: STATUS.ESTOQUE, pendente: STATUS.PENDENTE, ...params }
      );
      const linhas = r.recordset || [];
      for (const linha of linhas) {
        await registrarMovimento(tx, { codigo: linha.codigo, tipo: 'recusada', empresaOrigemId: linha.empresaid ?? linha.empresaId, empresaDestinoId: empresaId, porNome: nomeDoBuffet(req) });
      }
      return linhas.map((linha) => linha.codigo);
    });
    res.json({ recusadas });
  } catch (err) {
    console.error('❌ [PULSEIRAS-RECEBIMENTO] Erro ao recusar:', err);
    res.status(500).json({ error: err.message });
  }
});

// Devolve ao master pulseiras que vieram dele e ninguém está usando. Se o master já tem o código no estoque, só some a do buffet.
router.post('/devolver', async (req, res) => {
  try {
    const codigos = codigosDoPedido(req, res);
    if (!codigos) return;
    const empresaId = req.user.empresaId;
    const master = await queryOne(`SELECT empresaId FROM login WHERE perfil = 'master' AND status = 'active' LIMIT 1`);
    if (!master) return res.status(500).json({ error: 'Conta do master não encontrada' });

    const devolvidas = [];
    await withTransaction(async (tx) => {
      for (const codigo of codigos) {
        const minha = await tx.queryOne(
          `SELECT codigo FROM pulseira
           WHERE empresaId = @empresaId AND codigo = @codigo AND criancaId IS NULL AND status = 'disponivel'`,
          { empresaId, codigo }
        );
        if (!minha) continue;
        const noEstoque = await tx.queryOne('SELECT codigo FROM pulseira WHERE empresaId = @master AND codigo = @codigo', { master: master.empresaId, codigo });
        if (noEstoque) {
          await tx.query('DELETE FROM pulseira WHERE empresaId = @empresaId AND codigo = @codigo', { empresaId, codigo });
          await tx.query(
            `UPDATE pulseira SET statusTransferencia = @estoque, empresaDestinoId = NULL, enviadoEm = NULL WHERE empresaId = @master AND codigo = @codigo`,
            { estoque: STATUS.ESTOQUE, master: master.empresaId, codigo }
          );
        } else {
          await tx.query(
            `UPDATE pulseira
             SET empresaId = @master, statusTransferencia = @estoque, empresaDestinoId = NULL, enviadoEm = NULL, recebidoDoMasterEm = NULL, epc = NULL
             WHERE empresaId = @empresaId AND codigo = @codigo`,
            { master: master.empresaId, estoque: STATUS.ESTOQUE, empresaId, codigo }
          );
        }
        await registrarMovimento(tx, { codigo, tipo: 'devolvida', empresaOrigemId: empresaId, empresaDestinoId: master.empresaId, porNome: nomeDoBuffet(req) });
        devolvidas.push(codigo);
      }
    });
    console.log(`↩️ [PULSEIRAS-RECEBIMENTO] Buffet ${empresaId} devolveu ${devolvidas.length} pulseira(s)`);
    res.json({ devolvidas, ignoradas: codigos.filter((c) => !devolvidas.includes(c)) });
  } catch (err) {
    console.error('❌ [PULSEIRAS-RECEBIMENTO] Erro ao devolver:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
