-- ========================================
-- Migração: Renomear Tabelas para Português
-- ========================================
-- Renomeia tabelas em inglês para português
-- Mantém camelCase
-- Data: 2026-10-06

-- ===== Renomear Tabelas =====

-- checkpoints → pontoVerificacao
ALTER TABLE "checkpoints" RENAME TO "pontoVerificacao";

-- logins → acessos
ALTER TABLE "logins" RENAME TO "acessos";

-- logs → registros
ALTER TABLE "registros" RENAME TO "registros";
-- Se já existe registros, pular
-- ALTER TABLE "logs" RENAME TO "registros";

-- settings → configuracoes
ALTER TABLE "settings" RENAME TO "configuracoes";

-- support_tickets → chamadosSuport
ALTER TABLE "supportTickets" RENAME TO "chamadosSuport";

-- family_invites → conviteFamilia
ALTER TABLE "familyInvites" RENAME TO "conviteFamilia";

-- family_child_links → vinculoFamiliar
ALTER TABLE "familyChildLinks" RENAME TO "vinculoFamiliar";

-- ========================================
-- Fim da Migração
-- ========================================
-- Próximos passos:
-- 1. Atualizar todas as queries SQL que referenciam essas tabelas
-- 2. Atualizar modelos e serviços do backend/frontend
-- 3. Testar em ambiente local
