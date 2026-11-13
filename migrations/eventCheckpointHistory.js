const { query } = require('../database');

// Quais checkpoints cada evento usou. Os checkpoints são do buffet e passam por vários eventos: quando o evento
// termina (ou o checkpoint muda de evento) eles saem do evento, e esta tabela guarda o histórico para a tela de
// eventos e para os relatórios. Guarda o nome e o número da época (o checkpoint pode ser renomeado depois).
async function ensureEventCheckpointHistorySchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS eventoCheckpoint (
      id varchar(36) PRIMARY KEY,
      empresaId varchar(36),
      eventoId varchar(36) NOT NULL,
      checkpointId varchar(36) NOT NULL,
      numCheck varchar(50),
      nome varchar(255),
      usadoEm timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await query('CREATE UNIQUE INDEX IF NOT EXISTS uq_evento_checkpoint ON eventoCheckpoint (eventoId, checkpointId)');
  await query('CREATE INDEX IF NOT EXISTS idx_evento_checkpoint_checkpoint ON eventoCheckpoint (checkpointId)');
}

module.exports = { ensureEventCheckpointHistorySchema };
