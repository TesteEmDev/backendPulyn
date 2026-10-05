// routes/empresa.js - Dados do próprio buffet (empresa do usuário logado)
//
// O cadastro da unidade (nome, e-mail, telefone, endereço e frequência de backup) fica na
// tabela `clientes`; o CNPJ fica em `empresas`. Ver utils/unitProfileStore.js.
const express = require('express');
const router = express.Router();
const database = require('../database');
const { verifyToken, requireRole } = require('../utils/middleware');
const { normalizeCnpj, isValidCnpj } = require('../utils/cnpj');
const { parseUnitProfile } = require('../utils/unitProfile');
const { loadUnitProfile, saveUnitProfile } = require('../utils/unitProfileStore');

router.use(verifyToken, requireRole('admin'));

router.get('/me', async (req, res) => {
  try {
    const profile = await loadUnitProfile(database, req.user.empresa_id);
    if (!profile) return res.status(404).json({ error: 'Empresa não encontrada' });
    res.json(profile);
  } catch (err) {
    console.error('❌ Erro ao buscar dados da empresa:', err);
    res.status(500).json({ error: err.message });
  }
});

// Atualiza só os campos enviados. cnpj vazio remove o CNPJ; cnpj ausente não mexe nele.
router.put('/me', async (req, res) => {
  try {
    const parsed = parseUnitProfile(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });

    let cnpj;
    if (req.body && 'cnpj' in req.body) {
      const digits = normalizeCnpj(req.body.cnpj);
      if (digits && !isValidCnpj(digits)) {
        return res.status(400).json({ error: 'CNPJ inválido. Confira os 14 dígitos.' });
      }
      if (digits) {
        const duplicate = await database.queryOne(
          'SELECT id FROM empresas WHERE cnpj = @cnpj AND id <> @id',
          { cnpj: digits, id: req.user.empresa_id }
        );
        if (duplicate) return res.status(409).json({ error: 'Este CNPJ já está cadastrado em outro buffet.' });
      }
      cnpj = digits || null;
    }

    if (Object.keys(parsed.values).length === 0 && cnpj === undefined) {
      return res.status(400).json({ error: 'Nenhum dado para atualizar' });
    }

    const profile = await database.withTransaction(() =>
      saveUnitProfile(database, req.user.empresa_id, parsed.values, { cnpj, fallbackEmail: req.user.email })
    );
    if (!profile) return res.status(404).json({ error: 'Empresa não encontrada' });

    res.json({ updated: true, ...profile });
  } catch (err) {
    console.error('❌ Erro ao atualizar dados da empresa:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
