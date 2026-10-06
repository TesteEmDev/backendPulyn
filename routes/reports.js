// routes/reports.js - Relatório geral do buffet (todos os eventos)
const express = require('express');
const router = express.Router();
const { allQuery } = require('../database');
const { verifyToken, isMaster, requireRole } = require('../utils/middleware');
const { summarizeEvents } = require('../utils/reportOverview');

router.use(verifyToken, requireRole('admin', 'master'));

// Master pode consultar outra empresa com ?empresa_id=; o admin vê sempre a própria.
function resolveEmpresaId(req) {
  const requested = req.query?.empresa_id;
  return isMaster(req) && requested ? String(requested) : req.user.empresa_id;
}

router.get('/overview', async (req, res) => {
  try {
    const empresaId = resolveEmpresaId(req);
    if (!empresaId) return res.status(400).json({ error: 'Empresa não identificada' });
    const params = { empresaId };

    const [eventRows, topParticipants, topTeams, topCheckpoints, topGames] = await Promise.all([
      allQuery(`
        SELECT e.id, e.name, CAST(e.date AS VARCHAR(10)) AS date, e.status,
          (SELECT COUNT(*) FROM criancas c WHERE c.evento_id = e.id) AS participants,
          (SELECT COALESCE(SUM(c.scores), 0) FROM criancas c WHERE c.evento_id = e.id) AS total_points,
          (SELECT COUNT(*) FROM times t WHERE t.evento_id = e.id) AS teams,
          (SELECT COUNT(*) FROM pontuacoes p WHERE p.evento_id = e.id) AS scorings
        FROM eventos e
        WHERE e.empresa_id = @empresaId
        ORDER BY e.date DESC, e.created_at DESC
      `, params),
      allQuery(`
        SELECT TOP 10 c.id, c.name, c.nickname, c.age, c.scores,
          COALESCE(c.bracelet_code, c.last_bracelet_code) AS bracelet_code,
          e.name AS event_name, t.name AS team_name, t.color AS team_color
        FROM criancas c
        JOIN eventos e ON e.id = c.evento_id
        LEFT JOIN times t ON t.id = c.time_id
        WHERE e.empresa_id = @empresaId AND c.status = 'active'
        ORDER BY c.scores DESC
      `, params),
      allQuery(`
        SELECT TOP 5 t.id, t.name, t.color, t.points, e.name AS event_name
        FROM times t
        JOIN eventos e ON e.id = t.evento_id
        WHERE e.empresa_id = @empresaId
        ORDER BY t.points DESC
      `, params),
      allQuery(`
        SELECT TOP 5 cp.id, cp.name, cp.zone, e.name AS event_name, COUNT(p.id) AS readings
        FROM pontuacoes p
        JOIN checkpoints cp ON cp.id = p.checkpoint_id
        JOIN eventos e ON e.id = p.evento_id
        WHERE e.empresa_id = @empresaId
        GROUP BY cp.id, cp.name, cp.zone, e.name
        ORDER BY readings DESC
      `, params),
      allQuery(`
        SELECT TOP 5 b.id, b.name, COUNT(p.id) AS plays
        FROM pontuacoes p
        JOIN brincadeiras b ON b.id = CAST(p.brincadeira_id AS VARCHAR(36))
        JOIN eventos e ON e.id = p.evento_id
        WHERE e.empresa_id = @empresaId
        GROUP BY b.id, b.name
        ORDER BY plays DESC
      `, params),
    ]);

    const summary = summarizeEvents(eventRows);
    res.json({
      ...summary,
      topParticipants: topParticipants.map((c) => ({
        id: c.id, name: c.name, nickname: c.nickname || '', age: c.age,
        scores: Number(c.scores) || 0, braceletCode: c.bracelet_code || '', eventName: c.event_name, teamName: c.team_name || '', teamColor: c.team_color || '',
      })),
      topTeams: topTeams.map((t) => ({
        id: t.id, name: t.name, color: t.color, points: Number(t.points) || 0, eventName: t.event_name,
      })),
      topCheckpoints: topCheckpoints.map((c) => ({
        id: c.id, name: c.name, zone: c.zone || '', eventName: c.event_name, readings: Number(c.readings) || 0,
      })),
      topGames: topGames.map((g) => ({ id: g.id, name: g.name, plays: Number(g.plays) || 0 })),
    });
  } catch (err) {
    console.error('❌ Erro ao gerar relatório geral:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
