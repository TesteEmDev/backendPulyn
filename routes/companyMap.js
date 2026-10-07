// routes/companyMap.js - Planta baixa e zonas do mapa, por buffet (empresa).
//
// A planta/zonas representam o espaço físico do buffet e não mudam de um
// evento para outro, por isso ficam ligadas à empresa, não ao evento. Só os
// pontoVerificacao (routes/pontoVerificacao.js) continuam por evento, já que cada
// festa pode ligar/posicionar pontoVerificacao diferentes.
const express = require('express');
const router = express.Router();
const { query, queryOne } = require('../database');
const { verifyToken, requireRole, isMaster } = require('../utils/middleware');

function resolveEmpresaId(req) {
  if (isMaster(req) && req.query.empresaId) return String(req.query.empresaId);
  return req.user.empresaId;
}

router.get('/floor-plan', verifyToken, async (req, res) => {
  try {
    const empresaId = resolveEmpresaId(req);
    const empresa = await queryOne(
      'SELECT empresaId, dadosPlanoPiso, nomePlanoPiso, tipoPlanoPiso FROM empresa WHERE empresaId = @id',
      { id: empresaId }
    );

    if (!empresa) {
      return res.status(404).json({ error: 'Empresa não encontrada' });
    }

    res.json({
      empresaId: empresa.empresaId,
      floorPlan: empresa.dadosPlanoPiso
        ? {
            dataUrl: empresa.dadosPlanoPiso,
            name: empresa.nomePlanoPiso,
            type: empresa.tipoPlanoPiso,
          }
        : null,
    });
  } catch (err) {
    console.error('❌ Erro ao carregar planta do buffet:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/floor-plan', verifyToken, requireRole('admin', 'master'), async (req, res) => {
  try {
    const { dataUrl, nome, type } = req.body || {};
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
      return res.status(400).json({ error: 'A planta deve ser enviada como uma imagem válida' });
    }
    if (dataUrl.length > 9 * 1024 * 1024) {
      return res.status(413).json({ error: 'A planta é muito grande. Reduza o tamanho da imagem e tente novamente.' });
    }

    const empresaId = resolveEmpresaId(req);
    await query(
      `UPDATE empresa
       SET dadosPlanoPiso = @dataUrl,
           nomePlanoPiso = @nome,
           tipoPlanoPiso = @type
       WHERE empresaId = @id`,
      {
        dataUrl,
        nome: String(nome || 'planta-do-buffet').slice(0, 255),
        type: String(type || 'image/jpeg').slice(0, 100),
        id: empresaId,
      }
    );

    res.json({ success: true, empresaId });
  } catch (err) {
    console.error('❌ Erro ao salvar planta do buffet:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/floor-plan', verifyToken, requireRole('admin', 'master'), async (req, res) => {
  try {
    const empresaId = resolveEmpresaId(req);
    await query(
      `UPDATE empresa
       SET dadosPlanoPiso = NULL,
           nomePlanoPiso = NULL,
           tipoPlanoPiso = NULL
       WHERE empresaId = @id`,
      { id: empresaId }
    );
    res.json({ success: true, empresaId });
  } catch (err) {
    console.error('❌ Erro ao remover planta do buffet:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/zones', verifyToken, async (req, res) => {
  try {
    const empresaId = resolveEmpresaId(req);
    const empresa = await queryOne('SELECT dadosZonas FROM empresa WHERE empresaId = @id', { id: empresaId });

    if (!empresa || !empresa.dadosZonas) {
      return res.json([]);
    }

    try {
      res.json(JSON.parse(empresa.dadosZonas));
    } catch (e) {
      console.error('❌ Erro ao parsear zonas do buffet:', e);
      res.json([]);
    }
  } catch (err) {
    console.error('❌ Erro ao carregar zonas do buffet:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/zones', verifyToken, requireRole('admin', 'master'), async (req, res) => {
  try {
    const { zones } = req.body;
    if (!Array.isArray(zones)) {
      return res.status(400).json({ error: 'Zonas deve ser um array' });
    }

    const empresaId = resolveEmpresaId(req);
    await query('UPDATE empresa SET dadosZonas = @dadosZonas WHERE empresaId = @id', {
      dadosZonas: JSON.stringify(zones),
      id: empresaId,
    });

    res.json({ success: true, zones });
  } catch (err) {
    console.error('❌ Erro ao salvar zonas do buffet:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
