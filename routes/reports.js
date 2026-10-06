// routes/reports.js - Relatório geral do buffet (todos os eventos)
const express = require('express');
const router = express.Router();
const { allQuery } = require('../database');
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
        SELECT e.id, e.nome, CAST(e.data AS VARCHAR(10)) AS date, e.status,
          (SELECT COUNT(*) FROM criancas c WHERE c.eventoId = e.id) AS participants,
          (SELECT COALESCE(SUM(c.scores), 0) FROM criancas c WHERE c.eventoId = e.id) AS total_points,
          (SELECT COUNT(*) FROM times t WHERE t.eventoId = e.id) AS teams,
          (SELECT COUNT(*) FROM pontuacoes p WHERE p.eventoId = e.id) AS scorings
        FROM eventos e
        WHERE e.empresaId = @empresaId
        ORDER BY e.data DESC, e.criadoEm DESC
      `, params),
      allQuery(`
        SELECT TOP 10 c.id, c.nome, c.nicknome, c.age, c.scores,
          e.nome AS event_nome, t.nome AS team_nome, t.cor AS team_color
        FROM criancas c
        JOIN eventos e ON e.id = c.eventoId
        LEFT JOIN times t ON t.id = c.timeId
        WHERE e.empresaId = @empresaId AND c.status = 'active'
        ORDER BY c.scores DESC
      `, params),
      allQuery(`
        SELECT TOP 5 t.id, t.nome, t.cor, t.points, e.nome AS event_name
        FROM times t
        JOIN eventos e ON e.id = t.eventoId
        WHERE e.empresaId = @empresaId
        ORDER BY t.points DESC
      `, params),
      allQuery(`
        SELECT TOP 5 cp.id, cp.nome, cp.zone, e.nome AS event_nome, COUNT(p.id) AS readings
        FROM pontuacoes p
        JOIN pontoVerificacao cp ON cp.id = p.checkpointId
        JOIN eventos e ON e.id = p.eventoId
        WHERE e.empresaId = @empresaId
        GROUP BY cp.id, cp.nome, cp.zone, e.nome
        ORDER BY readings DESC
      `, params),
      allQuery(`
        SELECT TOP 5 b.id, b.nome, COUNT(p.id) AS plays
        FROM pontuacoes p
        JOIN brincadeiras b ON b.id = CAST(p.brincadeiraId AS VARCHAR(36))
        JOIN eventos e ON e.id = p.eventoId
        WHERE e.empresaId = @empresaId
        GROUP BY b.id, b.nome
        ORDER BY plays DESC
      `, params),
    ]);

    const summary = summarizeEvents(eventRows);
    res.json({
      ...summary,
      topParticipants: topParticipants.map((c) => ({
        id: c.id, name: c.nome, nickname: c.nickname || '', age: c.age,
        scores: Number(c.scores) || 0, eventName: c.event_nome, teamName: c.team_name || '', teamColor: c.team_color || '',
      })),
      topTeams: topTeams.map((t) => ({
        id: t.id, name: t.nome, color: t.cor, points: Number(t.points) || 0, eventName: t.event_nome,
      })),
      topCheckpoints: topCheckpoints.map((c) => ({
        id: c.id, name: c.nome, zone: c.zone || '', eventName: c.event_nome, readings: Number(c.readings) || 0,
      })),
      topGames: topGames.map((g) => ({ id: g.id, name: g.nome, plays: Number(g.plays) || 0 })),
    });
  } catch (err) {
    console.error('❌ Erro ao gerar relatório geral:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
