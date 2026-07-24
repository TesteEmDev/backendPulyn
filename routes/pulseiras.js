const express = require('express');
const router = express.Router();
const { query, queryOne, allQuery } = require('../database');
const { verifyToken, isMaster } = require('../utils/middleware');
const { normalizeUid, uidSqlExpression } = require('../utils/uid');

// Listar pulseiras
router.get('/', verifyToken, async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    
    let pulseiras;
    if (isMaster(req)) {
      // Master vê todas as pulseiras (exceto as da Master Admin)
      pulseiras = await allQuery(`
        SELECT p.code, p.status, p.crianca_id, c.name as crianca_name, p.empresa_id
        FROM pulseiras p
        LEFT JOIN criancas c ON p.crianca_id = c.id
        LEFT JOIN empresas e ON p.empresa_id = e.id
        WHERE e.nome != 'Master Admin'
        ORDER BY p.code
      `);
    } else {
      pulseiras = await allQuery(`
        SELECT p.code, p.status, p.crianca_id, c.name as crianca_name, p.empresa_id
        FROM pulseiras p
        LEFT JOIN criancas c ON p.crianca_id = c.id
        WHERE p.empresa_id = @empresa_id
        ORDER BY p.code
      `, { empresa_id });
    }
    
    console.log(`📋 Carregadas ${pulseiras.length} pulseiras para empresa ${empresa_id}`);
    if (pulseiras.length > 0) {
      console.log(`   Códigos: ${pulseiras.map(p => p.code).join(', ')}`);
    }
    res.json(pulseiras);
  } catch (err) {
    console.error('❌ Erro ao carregar pulseiras:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Cadastrar pulseira
router.post('/', verifyToken, async (req, res) => {
  try {
    const { code } = req.body;
    const empresa_id = req.user.empresa_id;
    const codeUpper = normalizeUid(code);
    
    if (!codeUpper) {
      return res.status(400).json({ error: 'Código da pulseira é obrigatório' });
    }
    
    // 🔴 Debug: Mostrar o que está sendo cadastrado
    console.log(`📝 Cadastrando pulseira: "${codeUpper}" (original: "${code}") para empresa ${empresa_id}`);
    
    const existing = await queryOne(
      `SELECT code FROM pulseiras WHERE ${uidSqlExpression('code')} = @code`,
      { code: codeUpper }
    );
    if (existing) {
      console.log(`❌ Pulseira já existe: ${existing.code}`);
      return res.status(400).json({ error: 'Pulseira já cadastrada!' });
    }
    
    await query('INSERT INTO pulseiras (code, status, empresa_id, created_at) VALUES (@code, @status, @empresa_id, GETDATE())', 
      { code: codeUpper, status: 'disponivel', empresa_id });
    
    console.log(`✅ Pulseira ${codeUpper} cadastrada com sucesso para empresa ${empresa_id}`);
    res.json({ code: codeUpper, status: 'disponivel', empresa_id, crianca_id: null, crianca_name: null });
  } catch (err) {
    console.error('❌ Erro ao cadastrar pulseira:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Atualizar status da pulseira
router.put('/:code/status', verifyToken, async (req, res) => {
  try {
    const { code } = req.params;
    const { status } = req.body;
    const empresa_id = req.user.empresa_id;
    
    // Verificar que a pulseira pertence à empresa (ou master)
    const normalizedCode = normalizeUid(code);
    const pulseira = await queryOne(
      `SELECT empresa_id FROM pulseiras WHERE ${uidSqlExpression('code')} = @code`,
      { code: normalizedCode }
    );
    
    if (!pulseira) {
      return res.status(404).json({ error: 'Pulseira não encontrada' });
    }
    
    // Master pode atualizar qualquer pulseira
    if (!isMaster(req) && pulseira.empresa_id !== empresa_id) {
      return res.status(403).json({ error: 'Acesso negado: pulseira não pertence a esta empresa' });
    }
    
    await query(
      `UPDATE pulseiras SET status = @status 
       WHERE ${uidSqlExpression('code')} = @code 
       AND empresa_id = @empresa_id`, 
      { code: normalizedCode, status, empresa_id: pulseira.empresa_id }
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== DETECÇÃO DE PULSEIRA (Arduino/Checkpoint) ====================

// Endpoint para receber detecção de pulseira do Arduino (durante check-in)
// O Arduino envia o código da pulseira detectada
// Nota: Este endpoint pode ser chamado pelo Arduino sem autenticação, pois é parte do fluxo de leitura de checkpoint
// A validação real acontece em /api/leituras (que valida empresa_id + crianca)
router.post('/detectar', async (req, res) => {
  try {
    const { code, checkpointId, timestamp } = req.body;
    
    if (!code) {
      return res.status(400).json({ error: 'Código da pulseira é obrigatório' });
    }
    
    const normalizedCode = normalizeUid(code);
    if (!normalizedCode) {
      return res.status(400).json({ error: 'Código da pulseira inválido' });
    }
    
    console.log(`📡 Pulseira detectada no Arduino: ${normalizedCode} (Checkpoint: ${checkpointId})`);
    
    // Broadcast para o frontend atualizar o input
    if (global.broadcast) {
      global.broadcast({
        type: 'BRACELET_DETECTED',
        payload: {
          code: normalizedCode,
          braceletCode: normalizedCode,
          timestamp: timestamp || new Date().toISOString(),
          checkpointId
        }
      });
    }
    
    res.json({
      success: true,
      message: 'Código da pulseira detectado e enviado para o frontend',
      code: normalizedCode
    });
    
  } catch (err) {
    console.error('❌ Erro ao detectar pulseira:', err);
    res.status(500).json({ 
      success: false,
      error: err.message 
    });
  }
});

module.exports = router;
