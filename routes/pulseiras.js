const express = require('express');
const router = express.Router();
const { query, queryOne, allQuery } = require('../database');
const { verifyToken, isMaster } = require('../utils/middleware');
const { normalizeUid, uidSqlExpression } = require('../utils/uid');

// Listar pulseiras
router.get('/', verifyToken, async (req, res) => {
  try {
    const empresaId = req.user.empresaId;
    
    let pulseiras;
    if (isMaster(req)) {
      // Master vê todas as pulseiras (exceto as da Master Admin)
      pulseiras = await allQuery(`
        SELECT p.code, p.status, p.criancaId, c.name as crianca_name, p.empresaId
        FROM pulseiras p
        LEFT JOIN criancas c ON p.criancaId = c.id
        LEFT JOIN empresas e ON p.empresaId = e.id
        WHERE e.nome != 'Master Admin'
        ORDER BY p.code
      `);
    } else {
      pulseiras = await allQuery(`
        SELECT p.code, p.status, p.criancaId, c.name as crianca_name, p.empresaId
        FROM pulseiras p
        LEFT JOIN criancas c ON p.criancaId = c.id
        WHERE p.empresaId = @empresaId
        ORDER BY p.code
      `, { empresaId });
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
    const empresaId = req.user.empresaId;
    const codeUpper = normalizeUid(code);
    
    if (!codeUpper) {
      return res.status(400).json({ error: 'Código da pulseira é obrigatório' });
    }
    
    const existing = await queryOne(
      `SELECT code FROM pulseiras WHERE ${uidSqlExpression('code')} = @code`,
      { code: codeUpper }
    );
    if (existing) {
      return res.status(400).json({ error: 'Pulseira já cadastrada!' });
    }
    
    await query('INSERT INTO pulseiras (code, status, empresaId, criadoEm) VALUES (@code, @status, @empresaId, GETDATE())', 
      { code: codeUpper, status: 'disponivel', empresaId });
    
    res.json({ code: codeUpper, status: 'disponivel', empresaId, criancaId: null, crianca_name: null });
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
    const empresaId = req.user.empresaId;
    const allowedStatuses = ['disponivel', 'em_uso', 'perdida', 'bloqueada'];
    const allowedRoles = ['admin', 'reception', 'game_master'];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ error: 'Status de pulseira inválido' });
    }
    if (!isMaster(req) && !allowedRoles.includes(req.user?.role)) {
      return res.status(403).json({ error: 'Acesso negado para alterar pulseiras' });
    }
    
    // Verificar que a pulseira pertence à empresa (ou master)
    const normalizedCode = normalizeUid(code);
    const pulseira = await queryOne(
      `SELECT empresaId, criancaId FROM pulseiras WHERE ${uidSqlExpression('code')} = @code`,
      { code: normalizedCode }
    );
    
    if (!pulseira) {
      return res.status(404).json({ error: 'Pulseira não encontrada' });
    }
    
    // Master pode atualizar qualquer pulseira
    if (!isMaster(req) && pulseira.empresaId !== empresaId) {
      return res.status(403).json({ error: 'Acesso negado: pulseira não pertence a esta empresa' });
    }
    
    if (status !== 'em_uso' && pulseira.criancaId) {
      await query(
        `UPDATE criancas SET codigoPulseira = NULL
         WHERE id = @criancaId AND empresaId = @empresaId`,
        { criancaId: pulseira.criancaId, empresaId: pulseira.empresaId }
      );
    }

    await query(
      `UPDATE pulseiras SET status = @status,
       criancaId = @criancaId
       WHERE ${uidSqlExpression('code')} = @code
       AND empresaId = @empresaId`,
      {
        code: normalizedCode,
        status,
        criancaId: status === 'em_uso' ? pulseira.criancaId : null,
        empresaId: pulseira.empresaId,
      }
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
// A validação real acontece em /api/leituras (que valida empresaId + crianca)
router.post('/detectar', async (req, res) => {
  try {
    const { code, checkpointId, timestamp } = req.body;
    console.log(`\n📖 [PULSEIRAS-DETECTAR] POST recebido: code=${code}, checkpointId=${checkpointId}`);
    
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
