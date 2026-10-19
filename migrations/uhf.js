// migrations/uhf.js - Leitores UHF (Chainway UR4) e mapa de calor
//
// leitorUhf:  um UR4 da empresa. O firmware se identifica pelo moduleId + chave (só o hash fica no banco).
// antenaUhf:  as 4 portas de cada leitor, com a posição na planta (mesmo espaço 450 x 320 dos checkpoints).
// loteUhf:    cada lote recebido (leitor + seq), para não gravar o mesmo lote duas vezes, com os ciclos que ele cobre.
// amostraUhf: resumo de uma pulseira numa antena numa janela de 20 s (balde). Fica 7 dias.
// empresa.mapaMetrosPorUnidade: escala da planta, para os cálculos em metros.
// pulseira.epc: EPC gravado na tag UHF da pulseira (24 hex), vinculado na tela /admin/uhf.
const { query, DB_DRIVER } = require('../database');

async function ensureUhfSchema() {
  const isPostgres = DB_DRIVER === 'postgres' || DB_DRIVER === 'postgresql';
  if (!isPostgres) return;   // só o PostgreSQL/Supabase usa os leitores UHF

  await query('ALTER TABLE empresa ADD COLUMN IF NOT EXISTS mapaMetrosPorUnidade numeric');
  await query('ALTER TABLE pulseira ADD COLUMN IF NOT EXISTS epc varchar(24)');
  await query('CREATE UNIQUE INDEX IF NOT EXISTS ux_pulseira_empresa_epc ON pulseira (empresaId, epc) WHERE epc IS NOT NULL');

  await query(`
    CREATE TABLE IF NOT EXISTS leitorUhf (
      leitorId varchar(36) PRIMARY KEY,
      empresaId varchar(36) NOT NULL,
      moduleId varchar(16) NOT NULL,
      nome varchar(100) NOT NULL,
      chaveHash varchar(64) NOT NULL,
      potenciaDbm integer NOT NULL DEFAULT 25,
      rssiMin integer NOT NULL DEFAULT -75,
      ativo boolean NOT NULL DEFAULT true,
      ultimoLoteEm timestamptz,
      ultimoSeq bigint NOT NULL DEFAULT 0,
      fw varchar(20),
      ultimasPortas varchar(20),
      criadoEm timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (empresaId, moduleId)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS antenaUhf (
      antenaId varchar(36) PRIMARY KEY,
      leitorId varchar(36) NOT NULL REFERENCES leitorUhf(leitorId) ON DELETE CASCADE,
      porta integer NOT NULL CHECK (porta BETWEEN 1 AND 4),
      nome varchar(100),
      mapaX numeric,
      mapaY numeric,
      direcaoGraus numeric,
      raioMetros numeric NOT NULL DEFAULT 1.2,
      rssi1m numeric,
      expoente numeric NOT NULL DEFAULT 4,
      ativa boolean NOT NULL DEFAULT true,
      UNIQUE (leitorId, porta)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS loteUhf (
      leitorId varchar(36) NOT NULL REFERENCES leitorUhf(leitorId) ON DELETE CASCADE,
      seq bigint NOT NULL,
      recebidoEm timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      balde timestamptz NOT NULL,
      total integer NOT NULL,
      PRIMARY KEY (leitorId, seq)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS amostraUhf (
      balde timestamptz NOT NULL,
      antenaId varchar(36) NOT NULL REFERENCES antenaUhf(antenaId) ON DELETE CASCADE,
      codigo varchar(24) NOT NULL,
      empresaId varchar(36) NOT NULL,
      n integer NOT NULL,
      ciclos integer NOT NULL,
      rssiMed numeric NOT NULL,
      rssiMax numeric NOT NULL,
      PRIMARY KEY (balde, antenaId, codigo)
    )
  `);
  await query('CREATE INDEX IF NOT EXISTS idx_amostrauhf_empresa_balde ON amostraUhf (empresaId, balde)');
  await query('CREATE INDEX IF NOT EXISTS idx_loteuhf_recebido ON loteUhf (recebidoEm)');

  // Lotes de 0,5 s: o total de ciclos da janela vem da soma dos lotes do leitor (a amostra só soma os lotes em que a
  // pulseira apareceu). vistoEm = último lote em que a pulseira foi lida, para as telas ao vivo.
  await query('ALTER TABLE loteUhf ADD COLUMN IF NOT EXISTS ciclos integer');
  await query('CREATE INDEX IF NOT EXISTS idx_loteuhf_leitor_balde ON loteUhf (leitorId, balde)');
  await query('ALTER TABLE amostraUhf ADD COLUMN IF NOT EXISTS vistoEm timestamptz');
}

module.exports = { ensureUhfSchema };
