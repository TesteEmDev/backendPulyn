// routes/telao.js - Link do telão (admin)
//
// O telão abre sem login em /telao/<código> (a entrada fica em POST /api/auth/telao). Aqui o admin do buffet
// vê o código e pode trocá-lo.
const express = require('express');
const router = express.Router();
const { query, queryOne } = require('../database');
const { verifyToken, requireRole, isMaster } = require('../utils/middleware');
const { gerarCodigoTelao } = require('../utils/codigoTelao');

const ADMIN = ['admin', 'master'];

function resolveEmpresaId(req) {
  if (isMaster(req) && req.query.empresaId) return String(req.query.empresaId);
  return req.user.empresaId;
}

// Código atual; cria na primeira consulta.
router.get('/codigo', verifyToken, requireRole(ADMIN), async (req, res) => {
  try {
    const empresaId = resolveEmpresaId(req);
    const empresa = await queryOne('SELECT empresaId, codigoTelao FROM empresa WHERE empresaId = @empresaId', { empresaId });
    if (!empresa) return res.status(404).json({ error: 'Buffet não encontrado' });
    if (empresa.codigoTelao) return res.json({ codigo: empresa.codigoTelao });

    const codigo = gerarCodigoTelao();
    // WHERE ... IS NULL: se dois pedidos chegarem juntos, o segundo não troca o código que o primeiro gravou
    await query('UPDATE empresa SET codigoTelao = @codigo WHERE empresaId = @empresaId AND codigoTelao IS NULL', { codigo, empresaId });
    const gravada = await queryOne('SELECT codigoTelao FROM empresa WHERE empresaId = @empresaId', { empresaId });
    res.json({ codigo: gravada?.codigoTelao ?? codigo });
  } catch (err) {
    console.error('❌ [TELAO] Erro ao buscar o código:', err);
    res.status(500).json({ error: 'Erro ao buscar o código do telão' });
  }
});

// Troca o código: o link antigo deixa de entrar (telões já abertos seguem até o token deles vencer).
router.post('/codigo/renovar', verifyToken, requireRole(ADMIN), async (req, res) => {
  try {
    const empresaId = resolveEmpresaId(req);
    const codigo = gerarCodigoTelao();
    const resultado = await query('UPDATE empresa SET codigoTelao = @codigo WHERE empresaId = @empresaId', { codigo, empresaId });
    if (!Number(resultado?.rowsAffected?.[0] || 0)) return res.status(404).json({ error: 'Buffet não encontrado' });
    res.json({ codigo });
  } catch (err) {
    console.error('❌ [TELAO] Erro ao renovar o código:', err);
    res.status(500).json({ error: 'Erro ao gerar um novo código do telão' });
  }
});

module.exports = router;
