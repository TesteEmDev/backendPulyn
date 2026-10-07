const express = require('express');
const router = express.Router();
const { query, queryOne, allQuery } = require('../database');
const { verifyToken, isMaster } = require('../utils/middleware');
const { normalizeUid, uidSqlExpression } = require('../utils/uid');

// Listar pulseira
router.get('/', verifyToken, async (req, res) => {
  try {
    const empresaId = req.user.empresaId;
    
    let pulseira;
    if (isMaster(req)) {
      // Master vê todas as pulseira (exceto as da Master Admin)
      pulseira = await allQuery(`
        SELECT p.codigo, p.status, p.criancaId, c.nome as crianca_nome, p.empresaId
        FROM pulseira p
        LEFT JOIN crianca c ON p.criancaId = c.criancaId
        LEFT JOIN empresa e ON p.empresaId = e.empresaId
        WHERE e.nome != 'Master Admin'
        ORDER BY p.codigo
      `);
    } else {
      pulseira = await allQuery(`
        SELECT p.codigo, p.status, p.criancaId, c.nome as crianca_nome, p.empresaId
        FROM pulseira p
        LEFT JOIN crianca c ON p.criancaId = c.criancaId
        WHERE p.empresaId = @empresaId
        ORDER BY p.codigo
      `, { empresaId });
    }
    
    res.json(pulseira);
  } catch (err) {
    console.error('❌ Erro ao carregar pulseira:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Cadastrar pulseira
router.post('/', verifyToken, async (req, res) => {
  try {
    const { codigo } = req.body;
    const empresaId = req.user.empresaId;
    const codeUpper = normalizeUid(codigo);
    
    if (!codeUpper) {
      return res.status(400).json({ error: 'Código da pulseira é obrigatório' });
    }
    
    const existing = await queryOne(
      `SELECT codigo FROM pulseira WHERE ${uidSqlExpression('codigo')} = @codigo`,
      { codigo: codeUpper }
    );
    if (existing) {
      return res.status(400).json({ error: 'Pulseira já cadastrada!' });
    }
    
    await query('INSERT INTO pulseira (codigo, status, empresaId, criadoEm) VALUES (@codigo, @status, @empresaId, GETDATE())', 
      { codigo: codeUpper, status: 'disponivel', empresaId });
    
    res.json({ codigo: codeUpper, status: 'disponivel', empresaId, criancaId: null, crianca_name: null });
  } catch (err) {
    console.error('❌ Erro ao cadastrar pulseira:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Atualizar status da pulseira
router.put('/:codigo/status', verifyToken, async (req, res) => {
  try {
    const { codigo } = req.params;
    const { status } = req.body;
    const empresaId = req.user.empresaId;
    const allowedStatuses = ['disponivel', 'em_uso', 'perdida', 'bloqueada'];
    const allowedRoles = ['admin', 'reception', 'game_master'];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ error: 'Status de pulseira inválido' });
    }
    if (!isMaster(req) && !allowedRoles.includes(req.user?.perfil)) {
      return res.status(403).json({ error: 'Acesso negado para alterar pulseira' });
    }
    
    // Verificar que a pulseira pertence à empresa (ou master)
    const normalizedCode = normalizeUid(codigo);
    const pulseira = await queryOne(
      `SELECT empresaId, criancaId FROM pulseira WHERE ${uidSqlExpression('codigo')} = @codigo`,
      { codigo: normalizedCode }
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
        `UPDATE crianca SET codigoPulseira = NULL
         WHERE criancaId = @criancaId AND empresaId = @empresaId`,
        { criancaId: pulseira.criancaId, empresaId: pulseira.empresaId }
      );
    }

    await query(
      `UPDATE pulseira SET status = @status,
       criancaId = @criancaId
       WHERE ${uidSqlExpression('codigo')} = @codigo
       AND empresaId = @empresaId`,
      {
        codigo: normalizedCode,
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
// A validação real acontece em /api/leitura (que valida empresaId + crianca)
router.post('/detectar', async (req, res) => {
  try {
    const { codigo, checkpointId, timestamp } = req.body;
    console.log(`\n📖 [PULSEIRAS-DETECTAR] POST recebido: codigo=${codigo}, checkpointId=${checkpointId}`);
    
    if (!codigo) {
      return res.status(400).json({ error: 'Código da pulseira é obrigatório' });
    }
    
    const normalizedCode = normalizeUid(codigo);
    if (!normalizedCode) {
      return res.status(400).json({ error: 'Código da pulseira inválido' });
    }
    
    console.log(`📡 Pulseira detectada no Arduino: ${normalizedCode} (Checkpoint: ${checkpointId})`);
    
    // Broadcast para o frontend atualizar o input
    if (global.broadcast) {
      global.broadcast({
        type: 'BRACELET_DETECTED',
        payload: {
          codigo: normalizedCode,
          braceletCode: normalizedCode,
          timestamp: timestamp || new Date().toISOString(),
          checkpointId
        }
      });
    }
    
    res.json({
      success: true,
      message: 'Código da pulseira detectado e enviado para o frontend',
      codigo: normalizedCode
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
