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
    const empresa_id = req.user.empresa_id;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);

    const [clientRows, ticketRows, checkpointRows] = await Promise.all([
      master
        ? listPlatformClients().then((list) =>
            list.map((c) => ({ id: c.id, empresa_nome: c.name, data_criacao: c.createdAt })))
        : allQuery(`
            SELECT empresaId, nome as empresa_nome, dataCriacao
            FROM empresa
            WHERE nome <> 'Master Admin' AND empresaId = @empresa_id
          `, { empresa_id }),
      allQuery(`
        SELECT ticketId, cliente as empresa_nome, assunto, status, criadoEm
        FROM chamadoSuport
        WHERE 1=1 ${master ? '' : 'AND empresaId = @empresa_id'}
      `, { empresa_id }),
      allQuery(`
        SELECT c.checkpointId, c.nome, c.zona, c.ultimoVisto, emp.nome as empresa_nome
        FROM pontoVerificacao c
        LEFT JOIN empresa emp ON c.empresaId = emp.empresaId
        WHERE c.status = 'offline'
          AND LOWER(COALESCE(c.proposito, 'game')) <> 'reception'
          ${master ? '' : 'AND c.empresaId = @empresa_id'}
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
      `INSERT INTO log (tipo, clienteId, eventoId, mensagem, detalhes, empresaId) 
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
