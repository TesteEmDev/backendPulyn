const express = require('express');
const router = express.Router();
const { verifyToken, requireRole } = require('../utils/middleware');
const { getActiveEvent, setActiveEvent } = require('../utils/eventControl');

const VIEW_ROLES = ['admin', 'reception', 'game_master', 'display', 'master', 'kiosk', 'score_kiosk'];

router.use(verifyToken, requireRole(VIEW_ROLES));

router.get('/active', async (req, res) => {
  try {
    const event = await getActiveEvent(req.user.empresa_id);
    res.json({ event });
  } catch (error) {
    console.error('❌ Event control: erro ao carregar evento ativo:', error.message);
    res.status(500).json({ error: 'Não foi possível carregar o evento selecionado' });
  }
});

router.put('/active', requireRole('reception'), async (req, res) => {
  try {
    const eventId = req.body?.eventId ? String(req.body.eventId).trim() : null;
    const result = await setActiveEvent(req.user.empresa_id, eventId);
    if (result.error) return res.status(result.status).json({ error: result.error });

    const payload = {
      eventoId: result.event?.id || null,
      eventName: result.event?.name || null,
      eventStatus: result.event?.status || null,
      updatedAt: new Date().toISOString(),
    };
    if (global.broadcastToCompany) global.broadcastToCompany(req.user.empresa_id, { type: 'EVENT_SELECTED', payload });
    res.json({ event: result.event || null });
  } catch (error) {
    console.error('❌ Event control: erro ao selecionar evento:', error.message);
    res.status(500).json({ error: 'Não foi possível salvar o evento selecionado' });
  }
});

module.exports = router;
