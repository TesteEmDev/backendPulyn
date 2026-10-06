-- ========================================
-- Migração: Renomear Tabelas para camelCase
-- ========================================
-- Renomeia todas as tabelas com underscores para camelCase
-- Data: 2026-10-06

-- ===== Renomear Tabelas =====

-- caca_tesouro_partidas → cacaTesourPartidas
ALTER TABLE "caca_tesouro_partidas" RENAME TO "cacaTesourPartidas";

-- caca_tesouro_scans → cacaTesourScans
ALTER TABLE "caca_tesouro_scans" RENAME TO "cacaTesourScans";

-- caca_tesouro_tempos → cacaTesourTempos
ALTER TABLE "caca_tesouro_tempos" RENAME TO "cacaTesourTempos";

-- checkpoint_tags → checkpointTags
ALTER TABLE "checkpoint_tags" RENAME TO "checkpointTags";

-- crianca_conquistas → criancaConquistas
ALTER TABLE "crianca_conquistas" RENAME TO "criancaConquistas";

-- evento_brincadeiras → eventoBrincadeiras
ALTER TABLE "evento_brincadeiras" RENAME TO "eventoBrincadeiras";

-- support_tickets → supportTickets
ALTER TABLE "support_tickets" RENAME TO "supportTickets";

-- family_invites → familyInvites
ALTER TABLE "family_invites" RENAME TO "familyInvites";

-- family_child_links → familyChildLinks
ALTER TABLE "family_child_links" RENAME TO "familyChildLinks";

-- mensagens_display → mensagensDisplay
ALTER TABLE "mensagens_display" RENAME TO "mensagensDisplay";

-- ===== Renomear Índices (se existirem) =====

-- Tentar renomear índices (alguns podem não existir)
DO $$ BEGIN
  ALTER INDEX IF EXISTS "uq_family_invites_token_hash" RENAME TO "uqFamilyInvitesTokenHash";
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER INDEX IF EXISTS "uq_family_child_link" RENAME TO "uqFamilyChildLink";
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ========================================
-- Fim da Migração
-- ========================================
-- Próximos passos:
-- 1. Atualizar todas as queries SQL que referenciam essas tabelas
-- 2. Atualizar modelos e serviços do backend/frontend
-- 3. Testar em ambiente local
