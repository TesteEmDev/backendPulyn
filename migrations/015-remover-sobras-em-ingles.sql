-- ========================================
-- Migração: remover sobras em inglês do banco
-- ========================================
-- 1. Remove as tabelas family_invites e family_child_links. Eram cópias vazias
--    de conviteFamilia e vinculoFamiliar, recriadas por engano pelo código
--    antigo depois da renomeação para português.
-- 2. Remove índices duplicados (uq_family_*) criados por cima de uqFamily*.
-- 3. Renomeia constraints e índices que ainda carregam nomes em inglês.
-- Idempotente: pode rodar mais de uma vez.

BEGIN;

-- 1. Tabelas em inglês (só se estiverem vazias)
DO $$
BEGIN
  IF to_regclass('public.family_invites') IS NOT NULL THEN
    IF (SELECT count(*) FROM family_invites) > 0 THEN
      RAISE EXCEPTION 'family_invites tem dados; confira antes de remover';
    END IF;
    DROP TABLE family_invites;
  END IF;

  IF to_regclass('public.family_child_links') IS NOT NULL THEN
    IF (SELECT count(*) FROM family_child_links) > 0 THEN
      RAISE EXCEPTION 'family_child_links tem dados; confira antes de remover';
    END IF;
    DROP TABLE family_child_links;
  END IF;
END $$;

-- 2 e 3. Índices únicos equivalentes. Versões diferentes do código criaram, ao longo do tempo,
-- até três índices únicos iguais em cada tabela. Fica um só, com o nome em português que o
-- código usa hoje (criado por renomeação, se ainda não existir), e os equivalentes são removidos.
DO $$
BEGIN
  IF to_regclass('public."uqConviteFamiliaHashToken"') IS NULL THEN
    IF to_regclass('public."uqFamilyInvitesTokenHash"') IS NOT NULL THEN
      ALTER INDEX "uqFamilyInvitesTokenHash" RENAME TO "uqConviteFamiliaHashToken";
    ELSIF to_regclass('public.uq_family_invites_token_hash') IS NOT NULL THEN
      ALTER INDEX uq_family_invites_token_hash RENAME TO "uqConviteFamiliaHashToken";
    END IF;
  END IF;
  IF to_regclass('public."uqConviteFamiliaHashToken"') IS NOT NULL THEN
    DROP INDEX IF EXISTS "uqFamilyInvitesTokenHash";
    DROP INDEX IF EXISTS uq_family_invites_token_hash;
  END IF;

  IF to_regclass('public."uqVinculoFamiliarLoginCrianca"') IS NULL THEN
    IF to_regclass('public."uqFamilyChildLink"') IS NOT NULL THEN
      ALTER INDEX "uqFamilyChildLink" RENAME TO "uqVinculoFamiliarLoginCrianca";
    ELSIF to_regclass('public.uq_family_child_link') IS NOT NULL THEN
      ALTER INDEX uq_family_child_link RENAME TO "uqVinculoFamiliarLoginCrianca";
    END IF;
  END IF;
  IF to_regclass('public."uqVinculoFamiliarLoginCrianca"') IS NOT NULL THEN
    DROP INDEX IF EXISTS "uqFamilyChildLink";
    DROP INDEX IF EXISTS uq_family_child_link;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'family_child_links_pkey' AND conrelid = '"vinculoFamiliar"'::regclass) THEN
    ALTER TABLE "vinculoFamiliar" RENAME CONSTRAINT family_child_links_pkey TO "vinculoFamiliar_pkey";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'family_invites_pkey' AND conrelid = '"conviteFamilia"'::regclass) THEN
    ALTER TABLE "conviteFamilia" RENAME CONSTRAINT family_invites_pkey TO "conviteFamilia_pkey";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'family_linking_codes_pkey' AND conrelid = '"codigoVinculoFamiliar"'::regclass) THEN
    ALTER TABLE "codigoVinculoFamiliar" RENAME CONSTRAINT family_linking_codes_pkey TO "codigoVinculoFamiliar_pkey";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'family_linking_codes_qr_code_value_key' AND conrelid = '"codigoVinculoFamiliar"'::regclass) THEN
    ALTER TABLE "codigoVinculoFamiliar" RENAME CONSTRAINT family_linking_codes_qr_code_value_key TO "codigoVinculoFamiliar_valorQrCode_key";
  END IF;
END $$;

COMMIT;
