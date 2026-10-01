// routes/empresa.js - Dados do próprio buffet (empresa do usuário logado)
const express = require('express');
const router = express.Router();
const { query, queryOne } = require('../database');
const { verifyToken, requireRole } = require('../utils/middleware');
const { normalizeCnpj, isValidCnpj, formatCnpj } = require('../utils/cnpj');

router.use(verifyToken, requireRole('admin'));

function toResponse(empresa) {
  return {
    id: empresa.id,
    name: empresa.nome,
    cnpj: empresa.cnpj ? formatCnpj(empresa.cnpj) : '',
    city: empresa.cidade || '',
    state: empresa.estado || '',
    phone: empresa.telefone || '',
  };
}

router.get('/me', async (req, res) => {
  try {
    const empresa = await queryOne(
      'SELECT id, nome, cnpj, cidade, estado, telefone FROM empresas WHERE id = @id',
      { id: req.user.empresa_id }
    );
    if (!empresa) return res.status(404).json({ error: 'Empresa não encontrada' });
    res.json(toResponse(empresa));
  } catch (err) {
    console.error('❌ Erro ao buscar dados da empresa:', err);
    res.status(500).json({ error: err.message });
  }
});

// Atualiza o CNPJ do buffet. Valor vazio remove o CNPJ.
router.put('/me', async (req, res) => {
  try {
    const raw = req.body?.cnpj;
    const digits = normalizeCnpj(raw);
    let cnpj = null;

    if (digits) {
      if (!isValidCnpj(digits)) {
        return res.status(400).json({ error: 'CNPJ inválido. Confira os 14 dígitos.' });
      }
      const duplicate = await queryOne(
        'SELECT id FROM empresas WHERE cnpj = @cnpj AND id <> @id',
        { cnpj: digits, id: req.user.empresa_id }
      );
      if (duplicate) {
        return res.status(409).json({ error: 'Este CNPJ já está cadastrado em outro buffet.' });
      }
      cnpj = digits;
    }

    const result = await query(
      'UPDATE empresas SET cnpj = @cnpj, data_atualizacao = GETDATE() WHERE id = @id',
      { cnpj, id: req.user.empresa_id }
    );
    if (!Number(result?.rowsAffected?.[0] || 0)) {
      return res.status(404).json({ error: 'Empresa não encontrada' });
    }

    res.json({ updated: true, cnpj: cnpj ? formatCnpj(cnpj) : '' });
  } catch (err) {
    console.error('❌ Erro ao atualizar dados da empresa:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
