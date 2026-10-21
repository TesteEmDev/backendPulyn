-- ========================================
-- Migração: leitores UHF (Chainway UR4) e mapa de calor
-- ========================================
-- Mesmo esquema que o backend cria ao subir (migrations/uhf.js, ensureUhfSchema), para rodar à mão
-- no PostgreSQL/Supabase de produção.
--
-- Tabelas alteradas:
--   empresa.mapaMetrosPorUnidade  escala da planta, para os cálculos em metros
--   pulseira.epc                  EPC gravado na tag UHF da pulseira (24 hex), único por empresa
-- Tabelas criadas:
--   leitorUhf   um UR4 da empresa (o firmware se identifica pelo moduleId + chave; só o hash fica no banco)
--   antenaUhf   as 4 portas de cada leitor, com a posição na planta (450 x 320, igual aos checkpoints)
--   loteUhf     cada lote recebido (leitor + seq), para não gravar o mesmo lote duas vezes
--   amostraUhf  uma pulseira numa antena numa janela de 5 s (balde); fica 7 dias
--
-- Idempotente: pode rodar mais de uma vez.

BEGIN;

-- ---------- Tabelas alteradas ----------

ALTER TABLE "empresa" ADD COLUMN IF NOT EXISTS "mapaMetrosPorUnidade" numeric;

ALTER TABLE "pulseira" ADD COLUMN IF NOT EXISTS "epc" varchar(24);
CREATE UNIQUE INDEX IF NOT EXISTS "ux_pulseira_empresa_epc" ON "pulseira" ("empresaId", "epc") WHERE "epc" IS NOT NULL;

-- ---------- Tabelas criadas ----------

CREATE TABLE IF NOT EXISTS "leitorUhf" (
  "leitorId" varchar(36) PRIMARY KEY,
  "empresaId" varchar(36) NOT NULL,
  "moduleId" varchar(16) NOT NULL,
  "nome" varchar(100) NOT NULL,
  "chaveHash" varchar(64) NOT NULL,
  "potenciaDbm" integer NOT NULL DEFAULT 25,
  "rssiMin" integer NOT NULL DEFAULT -75,
  "ativo" boolean NOT NULL DEFAULT true,
  "ultimoLoteEm" timestamptz,
  "ultimoSeq" bigint NOT NULL DEFAULT 0,
  "fw" varchar(20),
  "ultimasPortas" varchar(20),
  "criadoEm" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("empresaId", "moduleId")
);

CREATE TABLE IF NOT EXISTS "antenaUhf" (
  "antenaId" varchar(36) PRIMARY KEY,
  "leitorId" varchar(36) NOT NULL REFERENCES "leitorUhf" ("leitorId") ON DELETE CASCADE,
  "porta" integer NOT NULL CHECK ("porta" BETWEEN 1 AND 4),
  "nome" varchar(100),
  "mapaX" numeric,
  "mapaY" numeric,
  "direcaoGraus" numeric,
  "raioMetros" numeric NOT NULL DEFAULT 1.2,
  "rssi1m" numeric,
  "expoente" numeric NOT NULL DEFAULT 4,
  "ativa" boolean NOT NULL DEFAULT true,
  UNIQUE ("leitorId", "porta")
);

CREATE TABLE IF NOT EXISTS "loteUhf" (
  "leitorId" varchar(36) NOT NULL REFERENCES "leitorUhf" ("leitorId") ON DELETE CASCADE,
  "seq" bigint NOT NULL,
  "recebidoEm" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "balde" timestamptz NOT NULL,
  "total" integer NOT NULL,
  "ciclos" integer,   -- ciclos de leitura do lote (o total da janela é a soma dos lotes do leitor)
  PRIMARY KEY ("leitorId", "seq")
);

CREATE TABLE IF NOT EXISTS "amostraUhf" (
  "balde" timestamptz NOT NULL,
  "antenaId" varchar(36) NOT NULL REFERENCES "antenaUhf" ("antenaId") ON DELETE CASCADE,
  "codigo" varchar(24) NOT NULL,
  "empresaId" varchar(36) NOT NULL,
  "n" integer NOT NULL,
  "ciclos" integer NOT NULL,
  "rssiMed" numeric NOT NULL,
  "rssiMax" numeric NOT NULL,
  "vistoEm" timestamptz,   -- último lote em que a pulseira foi lida, para as telas ao vivo
  PRIMARY KEY ("balde", "antenaId", "codigo")
);

-- Colunas que entraram depois da primeira versão: só fazem algo se as tabelas já existiam sem elas
ALTER TABLE "loteUhf" ADD COLUMN IF NOT EXISTS "ciclos" integer;
ALTER TABLE "amostraUhf" ADD COLUMN IF NOT EXISTS "vistoEm" timestamptz;

CREATE INDEX IF NOT EXISTS "idx_amostrauhf_empresa_balde" ON "amostraUhf" ("empresaId", "balde");
CREATE INDEX IF NOT EXISTS "idx_loteuhf_recebido" ON "loteUhf" ("recebidoEm");
CREATE INDEX IF NOT EXISTS "idx_loteuhf_leitor_balde" ON "loteUhf" ("leitorId", "balde");

COMMIT;
