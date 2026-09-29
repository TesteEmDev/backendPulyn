// routes/logs.js - Sistema de Logs
const express = require('express');
const router = express.Router();
const { query, allQuery } = require('../database');
const { verifyToken, isMaster } = require('../utils/middleware');

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
    const empresa_id = req.user.empresa_id;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);

    const [clientRows, ticketRows, checkpointRows] = await Promise.all([
      allQuery(`
        SELECT id, nome as empresa_nome, data_criacao
        FROM empresas
        WHERE nome <> 'Master Admin' ${master ? '' : 'AND id = @empresa_id'}
      `, { empresa_id }),
      allQuery(`
        SELECT id, client as empresa_nome, subject, status, created_at
        FROM support_tickets
        WHERE 1=1 ${master ? '' : 'AND empresa_id = @empresa_id'}
      `, { empresa_id }),
      allQuery(`
        SELECT c.id, c.name, c.zone, c.last_seen, emp.nome as empresa_nome
        FROM checkpoints c
        LEFT JOIN empresas emp ON c.empresa_id = emp.id
        WHERE c.status = 'offline'
          AND LOWER(COALESCE(c.checkpoint_purpose, 'game')) <> 'reception'
          ${master ? '' : 'AND c.empresa_id = @empresa_id'}
      `, { empresa_id }),
    ]);

    const logs = [
      ...clientRows.map((c) => ({
        id: `client-${c.id}`,
        timestamp: c.data_criacao,
        client: c.empresa_nome,
        type: 'info',
        message: `Cliente cadastrado: ${c.empresa_nome}`,
        details: '',
      })),
      ...ticketRows.map((t) => ({
        id: `ticket-${t.id}`,
        timestamp: t.created_at,
        client: t.empresa_nome,
        type: t.status === 'resolvido' ? 'info' : 'warning',
        message: `Ticket de suporte: ${t.subject}`,
        details: `Status: ${t.status}`,
      })),
      ...checkpointRows.map((cp) => ({
        id: `checkpoint-${cp.id}`,
        timestamp: cp.last_seen,
        client: cp.empresa_nome || 'Sem empresa',
        type: 'error',
        message: `Checkpoint "${cp.name || cp.id}" está offline`,
        details: cp.zone ? `Zona: ${cp.zone}` : '',
      })),
    ]
      .filter((entry) => entry.timestamp)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);

    console.log(`✅ ${logs.length} logs carregados${master ? ' (master)' : ` para empresa ${empresa_id}`}`);
    res.json(logs);
  } catch (err) {
    console.error('❌ Erro ao montar logs:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/', verifyToken, async (req, res) => {
  try {
    const { tipo, cliente_id, evento_id, message, details } = req.body;
    const empresa_id = req.user.empresa_id;
    
    await query(
      `INSERT INTO logs (tipo, cliente_id, evento_id, message, details, empresa_id) 
       VALUES (@tipo, @cliente_id, @evento_id, @message, @details, @empresa_id)`,
      { tipo, cliente_id, evento_id, message, details, empresa_id }
    );
    
    console.log(`✅ Log registrado para empresa ${empresa_id}`);
    res.json({ ok: true });
  } catch (err) {
    console.error('❌ Erro ao registrar log:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
