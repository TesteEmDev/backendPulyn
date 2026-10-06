-- ========================================
-- Migração: Renomear IDs para [nomeId]
-- ========================================
-- Renomeia todas as colunas "id" para [nomeId]
-- Apenas mudanças de ID + campos ainda em inglês
-- Data: 2026-10-06

-- ===== brincadeiras =====
ALTER TABLE "brincadeiras" RENAME COLUMN "id" TO "brincadeiraId";

-- ===== caca_tesouro_partidas =====
ALTER TABLE "caca_tesouro_partidas" RENAME COLUMN "id" TO "partidaId";

-- ===== caca_tesouro_scans =====
ALTER TABLE "caca_tesouro_scans" RENAME COLUMN "id" TO "scanId";

-- ===== caca_tesouro_tempos =====
ALTER TABLE "caca_tesouro_tempos" RENAME COLUMN "id" TO "tempoId";

-- ===== checkpoint_tags =====
ALTER TABLE "checkpoint_tags" RENAME COLUMN "id" TO "tagId";

-- ===== checkpoints =====
ALTER TABLE "checkpoints" RENAME COLUMN "id" TO "checkpointId";

-- ===== clientes =====
ALTER TABLE "clientes" RENAME COLUMN "id" TO "clienteId";

-- ===== conquistas =====
ALTER TABLE "conquistas" RENAME COLUMN "id" TO "conquistaId";

-- ===== criancas =====
ALTER TABLE "criancas" RENAME COLUMN "id" TO "criancaId";

-- ===== empresas =====
ALTER TABLE "empresas" RENAME COLUMN "id" TO "empresaId";

-- ===== support_tickets =====
ALTER TABLE "support_tickets" RENAME COLUMN "id" TO "ticketId";

-- ===== eventos =====
ALTER TABLE "eventos" RENAME COLUMN "id" TO "eventoId";

-- ===== leituras =====
ALTER TABLE "leituras" RENAME COLUMN "id" TO "leituraId";

-- ===== logins =====
ALTER TABLE "logins" RENAME COLUMN "id" TO "loginId";
ALTER TABLE "logins" RENAME COLUMN "password" TO "senha";
ALTER TABLE "logins" RENAME COLUMN "role" TO "perfil";

-- ===== family_invites =====
ALTER TABLE "family_invites" RENAME COLUMN "id" TO "conviteId";

-- ===== family_child_links =====
ALTER TABLE "family_child_links" RENAME COLUMN "id" TO "vinculoId";

-- ===== logs =====
ALTER TABLE "logs" RENAME COLUMN "id" TO "logId";

-- ===== mensagens_display =====
ALTER TABLE "mensagens_display" RENAME COLUMN "id" TO "mensagemId";

-- ===== pontuacoes =====
ALTER TABLE "pontuacoes" RENAME COLUMN "id" TO "pontuacaoId";

-- ===== pulseiras =====
ALTER TABLE "pulseiras" RENAME COLUMN "code" TO "codigo";

-- ===== settings =====
ALTER TABLE "settings" RENAME COLUMN "id" TO "settingId";

-- ===== times =====
ALTER TABLE "times" RENAME COLUMN "id" TO "timeId";

-- ===== zonas =====
ALTER TABLE "zonas" RENAME COLUMN "id" TO "zonaId";

-- ========================================
-- Fim da Migração
-- ========================================
