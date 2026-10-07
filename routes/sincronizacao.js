// routes/sincronizacao.js - estado e execução manual da sincronização com a nuvem.
const express = require('express');
const router = express.Router();
const { verifyToken, requireRole } = require('../utils/middleware');
const { obterSincronizador, sincronizacaoHabilitada } = require('../utils/sincronizacao');

router.use(verifyToken);

function motivoDesligada() {
  if (!sincronizacaoHabilitada()) return 'Sincronização desligada: defina SYNC_ENABLED=1 no .env.';
  if (!process.env.SYNC_NUVEM_URL) return 'Sincronização sem destino: defina SYNC_NUVEM_URL no .env.';
  return 'Sincronização indisponível.';
}

// GET /api/sincronizacao/status - quanto falta enviar, último envio, último erro.
router.get('/status', requireRole('admin', 'master'), async (req, res) => {
  try {
    const sincronizador = obterSincronizador();
    if (!sincronizador) return res.json({ habilitado: false, motivo: motivoDesligada() });
    res.json({ habilitado: true, ...(await sincronizador.status()) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sincronizacao/executar - dispara um ciclo agora, sem esperar o próximo intervalo.
router.post('/executar', requireRole('master'), async (req, res) => {
  try {
    const sincronizador = obterSincronizador();
    if (!sincronizador) return res.status(409).json({ error: motivoDesligada() });
    const resultado = await sincronizador.executarAgora();
    res.json({ ...resultado, status: await sincronizador.status() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
