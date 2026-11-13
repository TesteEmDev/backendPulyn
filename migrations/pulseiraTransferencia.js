const { query } = require('../database');

// Pulseiras enviadas pelo master aos buffets, no mesmo espírito dos checkpoints:
//   estoque  -> está com o master (pulseira.empresaId = empresa do master), esperando para ser enviada
//   pendente -> enviada a um buffet (empresaDestinoId), esperando o admin aceitar; continua com o master até lá
//   aceito   -> é do buffet (empresaId = buffet). É o estado de todas as pulseiras de antes.
// pulseiraMovimento guarda cada passo (cadastrada, enviada, aceita, recusada, devolvida) para o master ver os totais.
async function ensurePulseiraTransferenciaSchema() {
  await query(`ALTER TABLE pulseira ADD COLUMN IF NOT EXISTS statusTransferencia varchar(20) NOT NULL DEFAULT 'aceito'`);
  await query('ALTER TABLE pulseira ADD COLUMN IF NOT EXISTS empresaDestinoId varchar(36)');
  await query('ALTER TABLE pulseira ADD COLUMN IF NOT EXISTS enviadoEm timestamptz');
  // Preenchido nas pulseiras que vieram do master: só estas podem ser devolvidas a ele
  await query('ALTER TABLE pulseira ADD COLUMN IF NOT EXISTS recebidoDoMasterEm timestamptz');
  await query(`
    CREATE TABLE IF NOT EXISTS pulseiraMovimento (
      id varchar(36) PRIMARY KEY,
      codigo varchar(64) NOT NULL,
      tipo varchar(20) NOT NULL,
      empresaOrigemId varchar(36),
      empresaDestinoId varchar(36),
      porNome varchar(120),
      criadoEm timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await query('CREATE INDEX IF NOT EXISTS idx_pulseira_movimento_destino ON pulseiraMovimento (empresaDestinoId, tipo)');
  await query('CREATE INDEX IF NOT EXISTS idx_pulseira_movimento_criado ON pulseiraMovimento (criadoEm DESC)');
}

module.exports = { ensurePulseiraTransferenciaSchema };
