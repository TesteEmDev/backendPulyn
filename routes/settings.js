// routes/settings.js - Configurações
const express = require('express');
const router = express.Router();
const { query, queryOne, allQuery } = require('../database');
const { verifyToken, isMaster } = require('../utils/middleware');

router.get('/', verifyToken, async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    
    // ✅ Master pode ver configs de qualquer empresa, usuário regular vê apenas a sua
    const settings = await allQuery(
      'SELECT setting_key, setting_value, empresa_id FROM settings WHERE empresa_id = @empresa_id OR @is_master = 1',
      { empresa_id, is_master: isMaster(req) ? 1 : 0 }
    );
    
    res.json(settings || []);
  } catch (err) {
    console.error('❌ Erro ao buscar configurações:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:key', verifyToken, async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    
    const setting = await queryOne(
      'SELECT * FROM settings WHERE setting_key = @key AND (empresa_id = @empresa_id OR @is_master = 1)',
      { key: req.params.key, empresa_id, is_master: isMaster(req) ? 1 : 0 }
    );

    if (!setting) {
      return res.status(404).json({ error: 'Configuração não encontrada' });
    }

    res.json(setting);
  } catch (err) {
    console.error('❌ Erro ao buscar configuração:', err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/:key', verifyToken, async (req, res) => {
  try {
    const { value } = req.body;
    const { key } = req.params;
    const empresa_id = req.user.empresa_id;

    // ✅ Validar permissão
    const setting = await queryOne(
      'SELECT empresa_id FROM settings WHERE setting_key = @key',
      { key }
    );

    if (!setting) {
      return res.status(404).json({ error: 'Configuração não encontrada' });
    }

    if (!isMaster(req) && setting.empresa_id !== empresa_id) {
      return res.status(403).json({ error: 'Acesso negado: configuração não pertence a esta empresa' });
    }

    await query(
      'UPDATE settings SET setting_value = @value WHERE setting_key = @key AND empresa_id = @empresa_id',
      { value, key, empresa_id: setting.empresa_id }
    );

    res.json({ success: true, message: 'Configuração atualizada com sucesso' });
  } catch (err) {
    console.error('❌ Erro ao atualizar configuração:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/', verifyToken, async (req, res) => {
  try {
    const settings = req.body;
    const empresa_id = req.user.empresa_id;

    for (const [key, value] of Object.entries(settings)) {
      // ✅ Validar permissão para cada configuração
      const setting = await queryOne(
        'SELECT empresa_id FROM settings WHERE setting_key = @key',
        { key }
      );

      if (setting && !isMaster(req) && setting.empresa_id !== empresa_id) {
        return res.status(403).json({ error: `Acesso negado: configuração ${key} não pertence a esta empresa` });
      }

      await query(
        'UPDATE settings SET setting_value = @value WHERE setting_key = @key',
        { value, key }
      );
    }

    res.json({ success: true, message: 'Configurações atualizadas com sucesso' });
  } catch (err) {
    console.error('❌ Erro ao atualizar configurações:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
