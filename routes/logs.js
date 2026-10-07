// routes/log.js - Sistema de Logs
const express = require('express');
const router = express.Router();
const { query, allQuery } = require('../database');
const { verifyToken, isMaster } = require('../utils/middleware');
const { listPlatformClients } = require('../utils/platformClients');

// A tabela `log` existe mas nada no sistema nunca escreveu nela de verdade
// (nenhuma rota chama POST /api/log em produção) — por isso a tela de Logs
// sempre aparecia vazia. Em vez de exigir instrumentar o app inteiro antes
// de ter qualquer log, este endpoint sintetiza um feed real a partir de
// evento que já acontecem e já são reais: cliente cadastrados, tickets de
// suporte e pontoVerificacao que caíram offline. O POST abaixo continua
// disponível para quem quiser registrar log próprios no futuro.
router.get('/', verifyToken, async (req, res) => {
  try {
    const master = isMaster(req);
    const empresaId = req.user.empresaId;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);

    const [clientRows, ticketRows, checkpointRows] = await Promise.all([
      master
        ? listPlatformClients().then((list) =>
            list.map((c) => ({ id: c.id, empresa_nome: c.nome, dataCriacao: c.createdAt })))
        : allQuery(`
            SELECT empresaId, nome as empresa_nome, dataCriacao
            FROM empresa
            WHERE nome <> 'Master Admin' AND empresaId = @empresaId
          `, { empresaId }),
      allQuery(`
        SELECT ticketId, cliente as empresa_nome, assunto, status, criadoEm
        FROM chamadoSuport
        WHERE 1=1 ${master ? '' : 'AND empresaId = @empresaId'}
      `, { empresaId }),
      allQuery(`
        SELECT c.checkpointId, c.nome, c.zona, c.ultimoVisto, emp.nome as empresa_nome
        FROM pontoVerificacao c
        LEFT JOIN empresa emp ON c.empresaId = emp.empresaId
        WHERE c.status = 'offline'
          AND LOWER(COALESCE(c.proposito, 'game')) <> 'reception'
          ${master ? '' : 'AND c.empresaId = @empresaId'}
      `, { empresaId }),
    ]);

    const log = [
      ...clientRows.map((c) => ({
        id: `cliente-${c.id}`,
        timestamp: c.dataCriacao,
        cliente: c.empresa_nome,
        type: 'info',
        message: `Cliente cadastrado: ${c.empresa_nome}`,
        details: '',
      })),
      ...ticketRows.map((t) => ({
        id: `ticket-${t.id}`,
        timestamp: t.criadoEm,
        cliente: t.empresa_nome,
        type: t.status === 'resolvido' ? 'info' : 'warning',
        message: `Ticket de suporte: ${t.subject}`,
        details: `Status: ${t.status}`,
      })),
      ...checkpointRows.map((cp) => ({
        id: `checkpoint-${cp.checkpointId}`,
        timestamp: cp.ultimoVisto,
        cliente: cp.empresa_nome || 'Sem empresa',
        type: 'error',
        message: `Checkpoint "${cp.nome || cp.checkpointId}" está offline`,
        details: cp.zona ? `Zona: ${cp.zona}` : '',
      })),
    ]
      .filter((entry) => entry.timestamp)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);

    console.log(`✅ ${log.length} log carregados${master ? ' (master)' : ` para empresa ${empresaId}`}`);
    res.json(log);
  } catch (err) {
    console.error('❌ Erro ao montar log:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/', verifyToken, async (req, res) => {
  try {
    const { tipo, clienteId, eventoId, message, details } = req.body;
    const empresaId = req.user.empresaId;
    
    await query(
      `INSERT INTO log (tipo, clienteId, eventoId, mensagem, detalhes, empresaId) 
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
