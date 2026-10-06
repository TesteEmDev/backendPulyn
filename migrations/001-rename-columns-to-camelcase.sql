-- ========================================
-- Migração: Renomear colunas para camelCase
-- ========================================
-- Esta migração converte todas as colunas de snake_case para camelCase
-- Também remove tabelas não utilizadas
-- Data: 2026-10-06

-- 1. REMOVER TABELAS NÃO UTILIZADAS
DROP TABLE IF EXISTS "staff" CASCADE;

-- 2. RENOMEAR COLUNAS EM TODAS AS TABELAS

-- ===== brincadeiras =====
ALTER TABLE "brincadeiras"
RENAME COLUMN "created_at" TO "criadoEm";

ALTER TABLE "brincadeiras"
RENAME COLUMN "default_points" TO "pontosPadrao";

ALTER TABLE "brincadeiras"
RENAME COLUMN "game_type" TO "tipoJogo";

ALTER TABLE "brincadeiras"
RENAME COLUMN "empresa_id" TO "empresaId";

ALTER TABLE "brincadeiras"
RENAME COLUMN "evento_id" TO "eventoId";

-- ===== caca_tesouro_partidas =====
ALTER TABLE "caca_tesouro_partidas"
RENAME COLUMN "evento_id" TO "eventoId";

ALTER TABLE "caca_tesouro_partidas"
RENAME COLUMN "brincadeira_id" TO "brincadeiraId";

ALTER TABLE "caca_tesouro_partidas"
RENAME COLUMN "round_number" TO "numeroRonda";

ALTER TABLE "caca_tesouro_partidas"
RENAME COLUMN "target_checkpoint_id" TO "checkpointAlvoId";

ALTER TABLE "caca_tesouro_partidas"
RENAME COLUMN "completed_checkpoint_ids" TO "checkpointsCompletadosIds";

ALTER TABLE "caca_tesouro_partidas"
RENAME COLUMN "started_at" TO "iniciadoEm";

ALTER TABLE "caca_tesouro_partidas"
RENAME COLUMN "round_started_at" TO "rondaIniciadaEm";

ALTER TABLE "caca_tesouro_partidas"
RENAME COLUMN "finished_at" TO "finalizadoEm";

ALTER TABLE "caca_tesouro_partidas"
RENAME COLUMN "starting_team_id" TO "timeInicialId";

ALTER TABLE "caca_tesouro_partidas"
RENAME COLUMN "turn_team_id" TO "timeVezId";

ALTER TABLE "caca_tesouro_partidas"
RENAME COLUMN "turn_available_at" TO "vezDisponvelEm";

-- ===== caca_tesouro_scans =====
ALTER TABLE "caca_tesouro_scans"
RENAME COLUMN "partida_id" TO "partidaId";

ALTER TABLE "caca_tesouro_scans"
RENAME COLUMN "evento_id" TO "eventoId";

ALTER TABLE "caca_tesouro_scans"
RENAME COLUMN "brincadeira_id" TO "brincadeiraId";

ALTER TABLE "caca_tesouro_scans"
RENAME COLUMN "round_number" TO "numeroRonda";

ALTER TABLE "caca_tesouro_scans"
RENAME COLUMN "checkpoint_id" TO "checkpointId";

ALTER TABLE "caca_tesouro_scans"
RENAME COLUMN "crianca_id" TO "criancaId";

ALTER TABLE "caca_tesouro_scans"
RENAME COLUMN "time_id" TO "timeId";

ALTER TABLE "caca_tesouro_scans"
RENAME COLUMN "scanned_at" TO "leroEm";

-- ===== caca_tesouro_tempos =====
ALTER TABLE "caca_tesouro_tempos"
RENAME COLUMN "partida_id" TO "partidaId";

ALTER TABLE "caca_tesouro_tempos"
RENAME COLUMN "evento_id" TO "eventoId";

ALTER TABLE "caca_tesouro_tempos"
RENAME COLUMN "time_id" TO "timeId";

ALTER TABLE "caca_tesouro_tempos"
RENAME COLUMN "started_at" TO "iniciadoEm";

ALTER TABLE "caca_tesouro_tempos"
RENAME COLUMN "completed_at" TO "completadoEm";

ALTER TABLE "caca_tesouro_tempos"
RENAME COLUMN "elapsed_ms" TO "msDecorridos";

-- ===== checkpoint_tags =====
ALTER TABLE "checkpoint_tags"
RENAME COLUMN "checkpoint_id" TO "checkpointId";

ALTER TABLE "checkpoint_tags"
RENAME COLUMN "tag_uid" TO "tagUid";

ALTER TABLE "checkpoint_tags"
RENAME COLUMN "created_at" TO "criadoEm";

-- ===== checkpoints =====
ALTER TABLE "checkpoints"
RENAME COLUMN "evento_id" TO "eventoId";

ALTER TABLE "checkpoints"
RENAME COLUMN "checkpoint_purpose" TO "propositoCheckpoint";

ALTER TABLE "checkpoints"
RENAME COLUMN "map_x" TO "mapaX";

ALTER TABLE "checkpoints"
RENAME COLUMN "map_y" TO "mapaY";

ALTER TABLE "checkpoints"
RENAME COLUMN "led_color" TO "corLed";

ALTER TABLE "checkpoints"
RENAME COLUMN "territory_owner_time_id" TO "territorioDonoTimeId";

ALTER TABLE "checkpoints"
RENAME COLUMN "territory_owner_crianca_id" TO "territorioDonosCriancaId";

ALTER TABLE "checkpoints"
RENAME COLUMN "territory_locked_until" TO "territorioTravadoAte";

ALTER TABLE "checkpoints"
RENAME COLUMN "territory_cooldown_until" TO "territorioCooldownAte";

ALTER TABLE "checkpoints"
RENAME COLUMN "last_conquered_at" TO "ultimoConquistadoEm";

ALTER TABLE "checkpoints"
RENAME COLUMN "created_at" TO "criadoEm";

ALTER TABLE "checkpoints"
RENAME COLUMN "empresa_id" TO "empresaId";

ALTER TABLE "checkpoints"
RENAME COLUMN "authorized_tags" TO "tagsAutorizadas";

ALTER TABLE "checkpoints"
RENAME COLUMN "last_seen" TO "ultimoVisto";

-- ===== clientes =====
ALTER TABLE "clientes"
RENAME COLUMN "created_at" TO "criadoEm";

ALTER TABLE "clientes"
RENAME COLUMN "last_access" TO "ultimoAcesso";

ALTER TABLE "clientes"
RENAME COLUMN "events_done" TO "eventosRealizados";

-- ===== conquistas =====
ALTER TABLE "conquistas"
RENAME COLUMN "created_at" TO "criadoEm";

ALTER TABLE "conquistas"
RENAME COLUMN "required_type" TO "tipoRequerido";

ALTER TABLE "conquistas"
RENAME COLUMN "required_value" TO "valorRequerido";

ALTER TABLE "conquistas"
RENAME COLUMN "points_bonus" TO "pontosBonus";

-- ===== crianca_conquistas =====
ALTER TABLE "crianca_conquistas"
RENAME COLUMN "crianca_id" TO "criancaId";

ALTER TABLE "crianca_conquistas"
RENAME COLUMN "conquista_id" TO "conquistaId";

ALTER TABLE "crianca_conquistas"
RENAME COLUMN "unlocked_at" TO "desbloqueadoEm";

-- ===== criancas =====
ALTER TABLE "criancas"
RENAME COLUMN "evento_id" TO "eventoId";

ALTER TABLE "criancas"
RENAME COLUMN "time_id" TO "timeId";

ALTER TABLE "criancas"
RENAME COLUMN "bracelet_code" TO "codigoPulseira";

ALTER TABLE "criancas"
RENAME COLUMN "created_at" TO "criadoEm";

ALTER TABLE "criancas"
RENAME COLUMN "empresa_id" TO "empresaId";

-- ===== empresas =====
ALTER TABLE "empresas"
RENAME COLUMN "data_criacao" TO "dataCriacao";

ALTER TABLE "empresas"
RENAME COLUMN "data_atualizacao" TO "dataAtualizacao";

-- ===== evento_brincadeiras =====
ALTER TABLE "evento_brincadeiras"
RENAME COLUMN "evento_id" TO "eventoId";

ALTER TABLE "evento_brincadeiras"
RENAME COLUMN "brincadeira_id" TO "brincadeiraId";

ALTER TABLE "evento_brincadeiras"
RENAME COLUMN "points_multiplier" TO "multiplicadorPontos";

ALTER TABLE "evento_brincadeiras"
RENAME COLUMN "created_at" TO "criadoEm";

-- ===== support_tickets =====
ALTER TABLE "support_tickets"
RENAME COLUMN "empresa_id" TO "empresaId";

ALTER TABLE "support_tickets"
RENAME COLUMN "created_at" TO "criadoEm";

ALTER TABLE "support_tickets"
RENAME COLUMN "updated_at" TO "atualizadoEm";

-- ===== eventos =====
ALTER TABLE "eventos"
RENAME COLUMN "cliente_id" TO "clienteId";

ALTER TABLE "eventos"
RENAME COLUMN "empresa_id" TO "empresaId";

ALTER TABLE "eventos"
RENAME COLUMN "created_at" TO "criadoEm";

ALTER TABLE "eventos"
RENAME COLUMN "enable_display" TO "exibirDisplay";

ALTER TABLE "eventos"
RENAME COLUMN "enable_location" TO "exibirLocalizacao";

ALTER TABLE "eventos"
RENAME COLUMN "active_game_type" TO "tipoJogoAtivo";

ALTER TABLE "eventos"
RENAME COLUMN "active_brincadeira_id" TO "brincadeiraAtivaId";

ALTER TABLE "eventos"
RENAME COLUMN "floor_plan_data" TO "dadosPlanoPiso";

ALTER TABLE "eventos"
RENAME COLUMN "floor_plan_name" TO "nomePlanoPiso";

ALTER TABLE "eventos"
RENAME COLUMN "floor_plan_type" TO "tipoPlanoPiso";

ALTER TABLE "eventos"
RENAME COLUMN "responsible_name" TO "nomeResponsavel";

ALTER TABLE "eventos"
RENAME COLUMN "started_at" TO "iniciadoEm";

ALTER TABLE "eventos"
RENAME COLUMN "ended_at" TO "finalizadoEm";

ALTER TABLE "eventos"
RENAME COLUMN "auto_start" TO "autoInicio";

ALTER TABLE "eventos"
RENAME COLUMN "auto_end" TO "autoFim";

-- ===== leituras =====
ALTER TABLE "leituras"
RENAME COLUMN "checkpoint_id" TO "checkpointId";

ALTER TABLE "leituras"
RENAME COLUMN "crianca_id" TO "criancaId";

ALTER TABLE "leituras"
RENAME COLUMN "brincadeira_id" TO "brincadeiraId";

ALTER TABLE "leituras"
RENAME COLUMN "points_awarded" TO "pontosAtribuidos";

ALTER TABLE "leituras"
RENAME COLUMN "signal_strength" TO "forcaSinal";

ALTER TABLE "leituras"
RENAME COLUMN "created_at" TO "criadoEm";

ALTER TABLE "leituras"
RENAME COLUMN "empresa_id" TO "empresaId";

-- ===== logins =====
ALTER TABLE "logins"
RENAME COLUMN "empresa_id" TO "empresaId";

ALTER TABLE "logins"
RENAME COLUMN "ultimo_acesso" TO "ultimoAcesso";

ALTER TABLE "logins"
RENAME COLUMN "data_criacao" TO "dataCriacao";

ALTER TABLE "logins"
RENAME COLUMN "family_name" TO "nomeFamilia";

-- ===== family_invites =====
ALTER TABLE "family_invites"
RENAME COLUMN "empresa_id" TO "empresaId";

ALTER TABLE "family_invites"
RENAME COLUMN "evento_id" TO "eventoId";

ALTER TABLE "family_invites"
RENAME COLUMN "crianca_id" TO "criancaId";

ALTER TABLE "family_invites"
RENAME COLUMN "token_hash" TO "hashToken";

ALTER TABLE "family_invites"
RENAME COLUMN "expires_at" TO "expiramEm";

ALTER TABLE "family_invites"
RENAME COLUMN "used_at" TO "usadoEm";

ALTER TABLE "family_invites"
RENAME COLUMN "created_by" TO "criadoPor";

ALTER TABLE "family_invites"
RENAME COLUMN "created_at" TO "criadoEm";

-- ===== family_child_links =====
ALTER TABLE "family_child_links"
RENAME COLUMN "login_id" TO "loginId";

ALTER TABLE "family_child_links"
RENAME COLUMN "crianca_id" TO "criancaId";

ALTER TABLE "family_child_links"
RENAME COLUMN "empresa_id" TO "empresaId";

ALTER TABLE "family_child_links"
RENAME COLUMN "approved_by" TO "aprovadoPor";

ALTER TABLE "family_child_links"
RENAME COLUMN "approved_at" TO "aprovadoEm";

ALTER TABLE "family_child_links"
RENAME COLUMN "rejected_at" TO "rejeitadoEm";

ALTER TABLE "family_child_links"
RENAME COLUMN "created_at" TO "criadoEm";

-- ===== logs =====
ALTER TABLE "logs"
RENAME COLUMN "cliente_id" TO "clienteId";

ALTER TABLE "logs"
RENAME COLUMN "evento_id" TO "eventoId";

ALTER TABLE "logs"
RENAME COLUMN "created_at" TO "criadoEm";

ALTER TABLE "logs"
RENAME COLUMN "empresa_id" TO "empresaId";

-- ===== mensagens_display =====
ALTER TABLE "mensagens_display"
RENAME COLUMN "evento_id" TO "eventoId";

ALTER TABLE "mensagens_display"
RENAME COLUMN "sent_at" TO "enviadoEm";

-- ===== pontuacoes =====
ALTER TABLE "pontuacoes"
RENAME COLUMN "evento_id" TO "eventoId";

ALTER TABLE "pontuacoes"
RENAME COLUMN "crianca_id" TO "criancaId";

ALTER TABLE "pontuacoes"
RENAME COLUMN "brincadeira_id" TO "brincadeiraId";

ALTER TABLE "pontuacoes"
RENAME COLUMN "checkpoint_id" TO "checkpointId";

ALTER TABLE "pontuacoes"
RENAME COLUMN "leitura_id" TO "leituraId";

ALTER TABLE "pontuacoes"
RENAME COLUMN "created_at" TO "criadoEm";

ALTER TABLE "pontuacoes"
RENAME COLUMN "empresa_id" TO "empresaId";

-- ===== pulseiras =====
ALTER TABLE "pulseiras"
RENAME COLUMN "crianca_id" TO "criancaId";

ALTER TABLE "pulseiras"
RENAME COLUMN "created_at" TO "criadoEm";

ALTER TABLE "pulseiras"
RENAME COLUMN "empresa_id" TO "empresaId";

-- ===== settings =====
ALTER TABLE "settings"
RENAME COLUMN "setting_key" TO "chave";

ALTER TABLE "settings"
RENAME COLUMN "setting_value" TO "valor";

ALTER TABLE "settings"
RENAME COLUMN "updated_at" TO "atualizadoEm";

ALTER TABLE "settings"
RENAME COLUMN "empresa_id" TO "empresaId";

-- ===== times =====
ALTER TABLE "times"
RENAME COLUMN "evento_id" TO "eventoId";

ALTER TABLE "times"
RENAME COLUMN "created_at" TO "criadoEm";

ALTER TABLE "times"
RENAME COLUMN "empresa_id" TO "empresaId";

-- ===== zonas =====
ALTER TABLE "zonas"
RENAME COLUMN "evento_id" TO "eventoId";

ALTER TABLE "zonas"
RENAME COLUMN "created_at" TO "criadoEm";

-- ========================================
-- Fim da Migração
-- ========================================
-- Execute isto no PostgreSQL com cautela
-- Faça backup antes de executar!
