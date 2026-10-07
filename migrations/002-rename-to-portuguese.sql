-- ========================================
-- Migração: Renomear para Português Completo
-- ========================================
-- Renomeia todas as colunas "id" para [nomeId]
-- Renomeia campos em inglês para português
-- Data: 2026-10-06

-- ===== brincadeiras =====
ALTER TABLE "brincadeiras" RENAME COLUMN "id" TO "brincadeiraId";
ALTER TABLE "brincadeiras" RENAME COLUMN "name" TO "nome";
ALTER TABLE "brincadeiras" RENAME COLUMN "description" TO "descricao";
ALTER TABLE "brincadeiras" RENAME COLUMN "rules" TO "regras";
ALTER TABLE "brincadeiras" RENAME COLUMN "type" TO "tipo";
ALTER TABLE "brincadeiras" RENAME COLUMN "duration" TO "duracao";
ALTER TABLE "brincadeiras" RENAME COLUMN "status" TO "status";
ALTER TABLE "brincadeiras" RENAME COLUMN "pontosPadrao" TO "pontosPadrao";
ALTER TABLE "brincadeiras" RENAME COLUMN "criadoEm" TO "criadoEm";
ALTER TABLE "brincadeiras" RENAME COLUMN "tipoJogo" TO "tipoJogo";

-- ===== caca_tesouro_partidas =====
ALTER TABLE "caca_tesouro_partidas" RENAME COLUMN "id" TO "partidaId";
ALTER TABLE "caca_tesouro_partidas" RENAME COLUMN "status" TO "status";

-- ===== caca_tesouro_scans =====
ALTER TABLE "caca_tesouro_scans" RENAME COLUMN "id" TO "scanId";

-- ===== caca_tesouro_tempos =====
ALTER TABLE "caca_tesouro_tempos" RENAME COLUMN "id" TO "tempoId";

-- ===== checkpoint_tags =====
ALTER TABLE "checkpoint_tags" RENAME COLUMN "id" TO "tagId";

-- ===== checkpoints =====
ALTER TABLE "checkpoints" RENAME COLUMN "id" TO "checkpointId";
ALTER TABLE "checkpoints" RENAME COLUMN "name" TO "nome";
ALTER TABLE "checkpoints" RENAME COLUMN "type" TO "tipo";
ALTER TABLE "checkpoints" RENAME COLUMN "ip" TO "ip";
ALTER TABLE "checkpoints" RENAME COLUMN "zone" TO "zona";
ALTER TABLE "checkpoints" RENAME COLUMN "propositoCheckpoint" TO "proposito";
ALTER TABLE "checkpoints" RENAME COLUMN "status" TO "status";

-- ===== clientes =====
ALTER TABLE "clientes" RENAME COLUMN "id" TO "clienteId";
ALTER TABLE "clientes" RENAME COLUMN "name" TO "nome";
ALTER TABLE "clientes" RENAME COLUMN "city" TO "cidade";
ALTER TABLE "clientes" RENAME COLUMN "state" TO "estado";
ALTER TABLE "clientes" RENAME COLUMN "email" TO "email";
ALTER TABLE "clientes" RENAME COLUMN "phone" TO "telefone";
ALTER TABLE "clientes" RENAME COLUMN "plano" TO "plano";
ALTER TABLE "clientes" RENAME COLUMN "status" TO "status";
ALTER TABLE "clientes" RENAME COLUMN "eventosRealizados" TO "eventosRealizados";

-- ===== conquistas =====
ALTER TABLE "conquistas" RENAME COLUMN "id" TO "conquistaId";
ALTER TABLE "conquistas" RENAME COLUMN "name" TO "nome";
ALTER TABLE "conquistas" RENAME COLUMN "description" TO "descricao";
ALTER TABLE "conquistas" RENAME COLUMN "icon" TO "icone";
ALTER TABLE "conquistas" RENAME COLUMN "color" TO "cor";
ALTER TABLE "conquistas" RENAME COLUMN "tipoRequerido" TO "tipoRequerido";
ALTER TABLE "conquistas" RENAME COLUMN "valorRequerido" TO "valorRequerido";

-- ===== crianca_conquistas =====
-- (sem id, chave composta)

-- ===== criancas =====
ALTER TABLE "criancas" RENAME COLUMN "id" TO "criancaId";
ALTER TABLE "criancas" RENAME COLUMN "name" TO "nome";
ALTER TABLE "criancas" RENAME COLUMN "nickname" TO "apelido";
ALTER TABLE "criancas" RENAME COLUMN "age" TO "idade";
ALTER TABLE "criancas" RENAME COLUMN "avatar" TO "avatar";
ALTER TABLE "criancas" RENAME COLUMN "codigoPulseira" TO "codigoPulseira";
ALTER TABLE "criancas" RENAME COLUMN "scores" TO "pontos";
ALTER TABLE "criancas" RENAME COLUMN "status" TO "status";

-- ===== empresas =====
ALTER TABLE "empresas" RENAME COLUMN "id" TO "empresaId";
ALTER TABLE "empresas" RENAME COLUMN "nome" TO "nome";
ALTER TABLE "empresas" RENAME COLUMN "cidade" TO "cidade";
ALTER TABLE "empresas" RENAME COLUMN "estado" TO "estado";
ALTER TABLE "empresas" RENAME COLUMN "telefone" TO "telefone";
ALTER TABLE "empresas" RENAME COLUMN "plano" TO "plano";
ALTER TABLE "empresas" RENAME COLUMN "status" TO "status";
ALTER TABLE "empresas" RENAME COLUMN "cnpj" TO "cnpj";
ALTER TABLE "empresas" RENAME COLUMN "latitude" TO "latitude";
ALTER TABLE "empresas" RENAME COLUMN "longitude" TO "longitude";

-- ===== evento_brincadeiras =====
-- (sem id próprio, chave composta)

-- ===== support_tickets =====
ALTER TABLE "support_tickets" RENAME COLUMN "id" TO "ticketId";
ALTER TABLE "support_tickets" RENAME COLUMN "client" TO "cliente";
ALTER TABLE "support_tickets" RENAME COLUMN "subject" TO "assunto";
ALTER TABLE "support_tickets" RENAME COLUMN "status" TO "status";
ALTER TABLE "support_tickets" RENAME COLUMN "priority" TO "prioridade";
ALTER TABLE "support_tickets" RENAME COLUMN "description" TO "descricao";
ALTER TABLE "support_tickets" RENAME COLUMN "assignee" TO "atribuidoPara";

-- ===== eventos =====
ALTER TABLE "eventos" RENAME COLUMN "id" TO "eventoId";
ALTER TABLE "eventos" RENAME COLUMN "name" TO "nome";
ALTER TABLE "eventos" RENAME COLUMN "description" TO "descricao";
ALTER TABLE "eventos" RENAME COLUMN "date" TO "data";
ALTER TABLE "eventos" RENAME COLUMN "time" TO "hora";
ALTER TABLE "eventos" RENAME COLUMN "duration" TO "duracao";
ALTER TABLE "eventos" RENAME COLUMN "status" TO "status";
ALTER TABLE "eventos" RENAME COLUMN "exibirDisplay" TO "exibirDisplay";
ALTER TABLE "eventos" RENAME COLUMN "exibirLocalizacao" TO "exibirLocalizacao";
ALTER TABLE "eventos" RENAME COLUMN "tipoJogoAtivo" TO "tipoJogoAtivo";
ALTER TABLE "eventos" RENAME COLUMN "nomeResponsavel" TO "nomeResponsavel";

-- ===== leituras =====
ALTER TABLE "leituras" RENAME COLUMN "id" TO "leituraId";
ALTER TABLE "leituras" RENAME COLUMN "uid" TO "uid";
ALTER TABLE "leituras" RENAME COLUMN "authorized" TO "autorizado";
ALTER TABLE "leituras" RENAME COLUMN "pontosAtribuidos" TO "pontosAtribuidos";
ALTER TABLE "leituras" RENAME COLUMN "forcaSinal" TO "forcaSinal";

-- ===== logins =====
ALTER TABLE "logins" RENAME COLUMN "id" TO "loginId";
ALTER TABLE "logins" RENAME COLUMN "email" TO "email";
ALTER TABLE "logins" RENAME COLUMN "password" TO "senha";
ALTER TABLE "logins" RENAME COLUMN "status" TO "status";
ALTER TABLE "logins" RENAME COLUMN "ultimoAcesso" TO "ultimoAcesso";
ALTER TABLE "logins" RENAME COLUMN "dataCriacao" TO "dataCriacao";
ALTER TABLE "logins" RENAME COLUMN "role" TO "perfil";
ALTER TABLE "logins" RENAME COLUMN "nomeFamilia" TO "nomeFamilia";

-- ===== family_invites =====
ALTER TABLE "family_invites" RENAME COLUMN "id" TO "conviteId";
ALTER TABLE "family_invites" RENAME COLUMN "email" TO "email";
ALTER TABLE "family_invites" RENAME COLUMN "hashToken" TO "hashToken";
ALTER TABLE "family_invites" RENAME COLUMN "status" TO "status";
ALTER TABLE "family_invites" RENAME COLUMN "expiramEm" TO "expiramEm";
ALTER TABLE "family_invites" RENAME COLUMN "usadoEm" TO "usadoEm";
ALTER TABLE "family_invites" RENAME COLUMN "criadoPor" TO "criadoPor";
ALTER TABLE "family_invites" RENAME COLUMN "criadoEm" TO "criadoEm";

-- ===== family_child_links =====
ALTER TABLE "family_child_links" RENAME COLUMN "id" TO "vinculoId";
ALTER TABLE "family_child_links" RENAME COLUMN "relationship" TO "relacionamento";
ALTER TABLE "family_child_links" RENAME COLUMN "status" TO "status";
ALTER TABLE "family_child_links" RENAME COLUMN "aprovadoPor" TO "aprovadoPor";
ALTER TABLE "family_child_links" RENAME COLUMN "aprovadoEm" TO "aprovadoEm";
ALTER TABLE "family_child_links" RENAME COLUMN "rejeitadoEm" TO "rejeitadoEm";

-- ===== logs =====
ALTER TABLE "logs" RENAME COLUMN "id" TO "logId";
ALTER TABLE "logs" RENAME COLUMN "tipo" TO "tipo";
ALTER TABLE "logs" RENAME COLUMN "message" TO "mensagem";
ALTER TABLE "logs" RENAME COLUMN "details" TO "detalhes";

-- ===== mensagens_display =====
ALTER TABLE "mensagens_display" RENAME COLUMN "id" TO "mensagemId";
ALTER TABLE "mensagens_display" RENAME COLUMN "text" TO "texto";
ALTER TABLE "mensagens_display" RENAME COLUMN "type" TO "tipo";
ALTER TABLE "mensagens_display" RENAME COLUMN "sender" TO "remetente";

-- ===== pontuacoes =====
ALTER TABLE "pontuacoes" RENAME COLUMN "id" TO "pontuacaoId";
ALTER TABLE "pontuacoes" RENAME COLUMN "points" TO "pontos";

-- ===== pulseiras =====
ALTER TABLE "pulseiras" RENAME COLUMN "code" TO "codigo";
ALTER TABLE "pulseiras" RENAME COLUMN "status" TO "status";

-- ===== settings =====
ALTER TABLE "settings" RENAME COLUMN "id" TO "settingId";
ALTER TABLE "settings" RENAME COLUMN "chave" TO "chave";
ALTER TABLE "settings" RENAME COLUMN "valor" TO "valor";

-- ===== times =====
ALTER TABLE "times" RENAME COLUMN "id" TO "timeId";
ALTER TABLE "times" RENAME COLUMN "name" TO "nome";
ALTER TABLE "times" RENAME COLUMN "color" TO "cor";
ALTER TABLE "times" RENAME COLUMN "points" TO "pontos";

-- ===== zonas =====
ALTER TABLE "zonas" RENAME COLUMN "id" TO "zonaId";
ALTER TABLE "zonas" RENAME COLUMN "name" TO "nome";
ALTER TABLE "zonas" RENAME COLUMN "color" TO "cor";

-- ========================================
-- Fim da Migração
-- ========================================
