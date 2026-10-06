// routes/configuracoes.js - Configurações por empresa (buffet)
//
// Cada buffet guarda as próprias configurações em linhas (empresaId, chave).
// As linhas antigas sem empresaId (seed original) não são lidas nem alteradas aqui.
const express = require('express');
const router = express.Router();
const { allQuery, withTransaction } = require('../database');
const { verifyToken, isMaster, requireRole } = require('../utils/middleware');
const { parseSettingsPayload, KEY_PATTERN } = require('../utils/settingsRules');

const WRITE_ROLES = ['admin', 'master'];

// Empresa alvo: a do token; o master pode consultar/alterar outra com ?empresaId=.
function resolveEmpresaId(req) {
  const requested = req.query?.empresaId;
  return isMaster(req) && requested ? String(requested) : req.user.empresaId;
}

// Atualiza a linha da empresa e cria se ainda não existir.
async function upsertSettings(tx, empresaId, entries) {
  for (const [key, value] of entries) {
    const updated = await tx.query(
      `UPDATE configuracoes SET valor = @value, atualizadoEm = CURRENT_TIMESTAMP
       WHERE chave = @key AND empresaId = @empresaId`,
      { value, key, empresaId }
    );
    if ((updated.rowsAffected?.[0] || 0) === 0) {
      await tx.query(
        `INSERT INTO configuracoes (chave, valor, empresaId)
         VALUES (@key, @value, @empresaId)`,
        { key, value, empresaId }
      );
    }
  }
}

router.get('/', verifyToken, async (req, res) => {
  try {
    const empresaId = resolveEmpresaId(req);
    if (!empresaId) return res.status(400).json({ error: 'Empresa não identificada' });
    const configuracoes = await allQuery(
      'SELECT chave, valor, empresaId FROM configuracoes WHERE empresaId = @empresaId ORDER BY chave',
      { empresaId }
    );
    res.json(configuracoes || []);
  } catch (err) {
    console.error('❌ Erro ao buscar configurações:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:key', verifyToken, async (req, res) => {
  try {
    const empresaId = resolveEmpresaId(req);
    if (!empresaId) return res.status(400).json({ error: 'Empresa não identificada' });
    const rows = await allQuery(
      'SELECT chave, valor, empresaId FROM configuracoes WHERE chave = @key AND empresaId = @empresaId',
      { key: req.params.key, empresaId }
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Configuração não encontrada' });
    res.json(rows[0]);
  } catch (err) {
    console.error('❌ Erro ao buscar configuração:', err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/:key', verifyToken, requireRole(WRITE_ROLES), async (req, res) => {
  try {
    const empresaId = resolveEmpresaId(req);
    if (!empresaId) return res.status(400).json({ error: 'Empresa não identificada' });
    if (!KEY_PATTERN.test(req.params.key)) return res.status(400).json({ error: 'Nome de configuração inválido' });

    const parsed = parseSettingsPayload({ [req.params.key]: req.body?.value ?? '' });
    if (parsed.error) return res.status(400).json({ error: parsed.error });

    await withTransaction(tx => upsertSettings(tx, empresaId, parsed.entries));
    res.json({ success: true, message: 'Configuração atualizada com sucesso' });
  } catch (err) {
    console.error('❌ Erro ao atualizar configuração:', err);
    res.status(500).json({ error: err.message });
  }
});

// Salva várias configurações de uma vez, tudo ou nada.
router.post('/', verifyToken, requireRole(WRITE_ROLES), async (req, res) => {
  try {
    const empresaId = resolveEmpresaId(req);
    if (!empresaId) return res.status(400).json({ error: 'Empresa não identificada' });

    const parsed = parseSettingsPayload(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });

    await withTransaction(tx => upsertSettings(tx, empresaId, parsed.entries));
    res.json({ success: true, message: 'Configurações atualizadas com sucesso' });
  } catch (err) {
    console.error('❌ Erro ao atualizar configurações:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
