// routes/logs.js - Sistema de Logs
const express = require('express');
const router = express.Router();
const { query, allQuery } = require('../database');
const { verifyToken, isMaster } = require('../utils/middleware');
const { listPlatformClients } = require('../utils/platformClients');

// A tabela `logs` existe mas nada no sistema nunca escreveu nela de verdade
// (nenhuma rota chama POST /api/logs em produção) — por isso a tela de Logs
// sempre aparecia vazia. Em vez de exigir instrumentar o app inteiro antes
// de ter qualquer log, este endpoint sintetiza um feed real a partir de
// eventos que já acontecem e já são reais: clientes cadastrados, tickets de
// suporte e checkpoints que caíram offline. O POST abaixo continua
// disponível para quem quiser registrar logs próprios no futuro.
router.get('/', verifyToken, async (req, res) => {
  try {
    const master = isMaster(req);
    const empresaId = req.user.empresaId;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);

    const [clientRows, ticketRows, checkpointRows] = await Promise.all([
      master
        ? listPlatformClients().then((list) =>
            list.map((c) => ({ id: c.id, empresa_nome: c.name, dataCriacao: c.createdAt })))
        : allQuery(`
            SELECT id, nome as empresa_nome, dataCriacao
            FROM empresas
            WHERE nome <> 'Master Admin' AND id = @empresaId
          `, { empresaId }),
      allQuery(`
        SELECT id, client as empresa_nome, subject, status, criadoEm
        FROM support_tickets
        WHERE 1=1 ${master ? '' : 'AND empresaId = @empresaId'}
      `, { empresaId }),
      allQuery(`
        SELECT c.id, c.name, c.zone, c.ultimoVisto, emp.nome as empresa_nome
        FROM checkpoints c
        LEFT JOIN empresas emp ON c.empresaId = emp.id
        WHERE c.status = 'offline'
          AND LOWER(COALESCE(c.propositoCheckpoint, 'game')) <> 'reception'
          ${master ? '' : 'AND c.empresaId = @empresaId'}
      `, { empresaId }),
    ]);

    const logs = [
      ...clientRows.map((c) => ({
        id: `client-${c.id}`,
        timestamp: c.dataCriacao,
        client: c.empresa_nome,
        type: 'info',
        message: `Cliente cadastrado: ${c.empresa_nome}`,
        details: '',
      })),
      ...ticketRows.map((t) => ({
        id: `ticket-${t.id}`,
        timestamp: t.criadoEm,
        client: t.empresa_nome,
        type: t.status === 'resolvido' ? 'info' : 'warning',
        message: `Ticket de suporte: ${t.subject}`,
        details: `Status: ${t.status}`,
      })),
      ...checkpointRows.map((cp) => ({
        id: `checkpoint-${cp.id}`,
        timestamp: cp.ultimoVisto,
        client: cp.empresa_nome || 'Sem empresa',
        type: 'error',
        message: `Checkpoint "${cp.name || cp.id}" está offline`,
        details: cp.zone ? `Zona: ${cp.zone}` : '',
      })),
    ]
      .filter((entry) => entry.timestamp)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);

    console.log(`✅ ${logs.length} logs carregados${master ? ' (master)' : ` para empresa ${empresaId}`}`);
    res.json(logs);
  } catch (err) {
    console.error('❌ Erro ao montar logs:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/', verifyToken, async (req, res) => {
  try {
    const { tipo, clienteId, eventoId, message, details } = req.body;
    const empresaId = req.user.empresaId;
    
    await query(
      `INSERT INTO logs (tipo, clienteId, eventoId, message, details, empresaId) 
       VALUES (@tipo, @clienteId, @eventoId, @message, @details, @empresaId)`,
      { tipo, clienteId, eventoId, message, details, empresaId }
    );
    
    console.log(`✅ Log registrado para empresa ${empresaId}`);
    res.json({ ok: true });
  } catch (err) {
    console.error('❌ Erro ao registrar log:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
