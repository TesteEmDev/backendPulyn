// routes/reports.js - Relatório geral do buffet (todos os evento)
const express = require('express');
const router = express.Router();
const { allQuery, queryOne } = require('../database');
const { verifyToken, isMaster, requireRole } = require('../utils/middleware');
const { summarizeEvents } = require('../utils/reportOverview');

router.use(verifyToken, requireRole('admin', 'master'));

// Master pode consultar outra empresa com ?empresaId=; o admin vê sempre a própria.
function resolveEmpresaId(req) {
  const requested = req.query?.empresaId;
  return isMaster(req) && requested ? String(requested) : req.user.empresaId;
}

router.get('/overview', async (req, res) => {
  try {
    const empresaId = resolveEmpresaId(req);
    if (!empresaId) return res.status(400).json({ error: 'Empresa não identificada' });
    const params = { empresaId };

    const [eventRows, topParticipants, topTeams, topCheckpoints, topGames] = await Promise.all([
      allQuery(`
        SELECT e.eventoId, e.nome, CAST(e.data AS VARCHAR(10)) AS date, e.status,
          (SELECT COUNT(*) FROM crianca c WHERE c.eventoId = e.eventoId) AS participants,
          (SELECT COALESCE(SUM(c.pontos), 0) FROM crianca c WHERE c.eventoId = e.eventoId) AS pontosTotais,
          (SELECT COUNT(*) FROM "time" t WHERE t.eventoId = e.eventoId) AS teams,
          (SELECT COUNT(*) FROM pontuacao p WHERE p.eventoId = e.eventoId) AS scorings
        FROM evento e
        WHERE e.empresaId = @empresaId
        ORDER BY e.data DESC, e.criadoEm DESC
      `, params),
      allQuery(`
        SELECT TOP 10 c.criancaId, c.nome, c.apelido, c.idade, c.pontos,
          COALESCE(c.codigoPulseira, c.ultimaPulseira) AS bracelet_code,
          e.nome AS event_nome, t.nome AS team_nome, t.cor AS team_color
        FROM crianca c
        JOIN evento e ON e.eventoId = c.eventoId
        LEFT JOIN "time" t ON t.timeId = c.timeId
        WHERE e.empresaId = @empresaId AND c.status = 'active'
        ORDER BY c.pontos DESC
      `, params),
      allQuery(`
        SELECT TOP 5 t.timeId, t.nome, t.cor, t.pontos, e.nome AS event_name
        FROM "time" t
        JOIN evento e ON e.eventoId = t.eventoId
        WHERE e.empresaId = @empresaId
        ORDER BY t.pontos DESC
      `, params),
      allQuery(`
        SELECT TOP 5 cp.checkpointId, cp.nome, cp.zona, e.nome AS event_nome, COUNT(p.pontuacaoId) AS readings
        FROM pontuacao p
        JOIN pontoVerificacao cp ON cp.checkpointId = p.checkpointId
        JOIN evento e ON e.eventoId = p.eventoId
        WHERE e.empresaId = @empresaId
        GROUP BY cp.checkpointId, cp.nome, cp.zona, e.nome
        ORDER BY readings DESC
      `, params),
      allQuery(`
        SELECT TOP 5 b.brincadeiraId, b.nome, COUNT(p.pontuacaoId) AS plays
        FROM pontuacao p
        JOIN brincadeira b ON b.brincadeiraId = CAST(p.brincadeiraId AS VARCHAR(36))
        JOIN evento e ON e.eventoId = p.eventoId
        WHERE e.empresaId = @empresaId
        GROUP BY b.brincadeiraId, b.nome
        ORDER BY plays DESC
      `, params),
    ]);

    const summary = summarizeEvents(eventRows);
    res.json({
      ...summary,
      topParticipants: topParticipants.map((c) => ({
        id: c.criancaId, name: c.nome, nickname: c.apelido || '', age: c.idade,
        scores: Number(c.pontos) || 0, eventName: c.event_nome, teamName: c.team_nome || '', teamColor: c.team_color || '',
      })),
      topTeams: topTeams.map((t) => ({
        id: t.timeId, name: t.nome, color: t.cor, points: Number(t.pontos) || 0, eventName: t.event_name,
      })),
      topCheckpoints: topCheckpoints.map((c) => ({
        id: c.checkpointId, name: c.nome, zone: c.zona || '', eventName: c.event_nome, readings: Number(c.readings) || 0,
      })),
      topGames: topGames.map((g) => ({ id: g.brincadeiraId, name: g.nome, plays: Number(g.plays) || 0 })),
    });
  } catch (err) {
    console.error('❌ Erro ao gerar relatório geral:', err);
    res.status(500).json({ error: err.message });
  }
});

// Engajamento por zona de UM evento, calculado das leituras reais dos checkpoints (tabela leitura).
// Zonas sem nenhuma leitura continuam na lista (com zero) para o admin ver onde ninguém passou.
router.get('/evento/:eventoId/zonas', async (req, res) => {
  try {
    const empresaId = resolveEmpresaId(req);
    if (!empresaId) return res.status(400).json({ error: 'Empresa não identificada' });
    const eventoId = String(req.params.eventoId || '').trim();

    const evento = await queryOne(
      'SELECT eventoId FROM evento WHERE eventoId = @eventoId AND empresaId = @empresaId',
      { eventoId, empresaId }
    );
    if (!evento) return res.status(404).json({ error: 'Evento não encontrado' });

    const rows = await allQuery(`
      SELECT COALESCE(NULLIF(TRIM(cp.zona), ''), 'Sem zona') AS zona,
        COUNT(DISTINCT cp.checkpointId) AS checkpoints,
        COUNT(l.leituraId) AS leituras,
        COUNT(DISTINCT l.criancaId) AS participantes,
        COALESCE(SUM(l.pontosAtribuidos), 0) AS pontos
      FROM pontoVerificacao cp
      LEFT JOIN leitura l ON l.checkpointId = cp.checkpointId AND l.criancaId IS NOT NULL
      WHERE cp.eventoId = @eventoId
        AND cp.empresaId = @empresaId
        AND LOWER(COALESCE(cp.proposito, 'game')) <> 'reception'
      GROUP BY COALESCE(NULLIF(TRIM(cp.zona), ''), 'Sem zona')
      ORDER BY leituras DESC, zona
    `, { eventoId: evento.eventoId, empresaId });

    res.json(rows.map((row) => ({
      zona: row.zona,
      checkpoints: Number(row.checkpoints) || 0,
      leituras: Number(row.leituras) || 0,
      participantes: Number(row.participantes) || 0,
      pontos: Number(row.pontos) || 0,
    })));
  } catch (err) {
    console.error('❌ Erro ao calcular engajamento por zona:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
