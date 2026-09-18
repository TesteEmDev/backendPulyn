-- migrations/020_create_zone_conquest_tables.sql
-- Criar tabelas para Zone Conquest TEAM e INDIVIDUAL com persistência em BD

-- =============================================================================
-- ZONE CONQUEST TEAM (baseado em Treasure Hunt)
-- =============================================================================

-- Partida/Sessão do Zone Conquest TEAM
CREATE TABLE IF NOT EXISTS zone_conquest_team_partidas (
  id VARCHAR(36) PRIMARY KEY,
  empresa_id VARCHAR(36) NOT NULL,
  evento_id VARCHAR(36) NOT NULL,
  brincadeira_id VARCHAR(36) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active', -- 'active', 'finished'
  round_number INT NOT NULL DEFAULT 1,
  current_team_id VARCHAR(36) NULL, -- Equipe que controla agora
  started_at DATETIME2 NOT NULL DEFAULT GETDATE(),
  finished_at DATETIME2 NULL,
  created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
  updated_at DATETIME2 NOT NULL DEFAULT GETDATE(),
  
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (evento_id) REFERENCES eventos(id),
  FOREIGN KEY (brincadeira_id) REFERENCES brincadeiras(id),
  FOREIGN KEY (current_team_id) REFERENCES times(id),
  INDEX idx_evento_id (evento_id),
  INDEX idx_status (status)
);

-- Cronômetro/Progresso por equipe (como em Treasure Hunt)
CREATE TABLE IF NOT EXISTS zone_conquest_team_tempos (
  id VARCHAR(36) PRIMARY KEY,
  partida_id VARCHAR(36) NOT NULL,
  empresa_id VARCHAR(36) NOT NULL,
  evento_id VARCHAR(36) NOT NULL,
  time_id VARCHAR(36) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active', -- 'active', 'completed', 'finished'
  zones_dominated INT NOT NULL DEFAULT 0, -- Quantas zonas já dominou
  checkpoints_read INT NOT NULL DEFAULT 0,
  total_points DECIMAL(10, 2) NOT NULL DEFAULT 0,
  started_at DATETIME2 NULL, -- Quando começou (NULL se não começou)
  completed_at DATETIME2 NULL, -- Quando completou todas as zonas
  elapsed_ms INT NULL, -- Tempo em ms do início ao fim
  created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
  updated_at DATETIME2 NOT NULL DEFAULT GETDATE(),
  
  FOREIGN KEY (partida_id) REFERENCES zone_conquest_team_partidas(id),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (evento_id) REFERENCES eventos(id),
  FOREIGN KEY (time_id) REFERENCES times(id),
  INDEX idx_partida_id (partida_id),
  INDEX idx_time_id (time_id),
  CONSTRAINT uq_team_tempo UNIQUE (partida_id, time_id)
);

-- Histórico de leituras por rodada (como em Treasure Hunt)
CREATE TABLE IF NOT EXISTS zone_conquest_team_scans (
  id VARCHAR(36) PRIMARY KEY,
  partida_id VARCHAR(36) NOT NULL,
  empresa_id VARCHAR(36) NOT NULL,
  evento_id VARCHAR(36) NOT NULL,
  brincadeira_id VARCHAR(36) NOT NULL,
  round_number INT NOT NULL,
  checkpoint_id VARCHAR(36) NOT NULL,
  crianca_id VARCHAR(36) NOT NULL,
  time_id VARCHAR(36) NOT NULL,
  uid VARCHAR(50) NOT NULL,
  leitura_id VARCHAR(36) NULL, -- Referência para tabela leituras
  points_awarded DECIMAL(10, 2) NOT NULL DEFAULT 0,
  version INT NOT NULL DEFAULT 0,
  scanned_at DATETIME2 NOT NULL,
  created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
  
  FOREIGN KEY (partida_id) REFERENCES zone_conquest_team_partidas(id),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (evento_id) REFERENCES eventos(id),
  FOREIGN KEY (brincadeira_id) REFERENCES brincadeiras(id),
  FOREIGN KEY (checkpoint_id) REFERENCES checkpoints(id),
  FOREIGN KEY (crianca_id) REFERENCES criancas(id),
  FOREIGN KEY (time_id) REFERENCES times(id),
  INDEX idx_partida_round (partida_id, round_number),
  INDEX idx_checkpoint_id (checkpoint_id),
  -- Previne que mesma criança leia 2x na mesma rodada (como em Treasure Hunt)
  CONSTRAINT uq_team_scan UNIQUE (partida_id, round_number, crianca_id)
);

-- =============================================================================
-- ZONE CONQUEST INDIVIDUAL (baseado em Monster Hunt com versionning)
-- =============================================================================

-- Partida/Sessão do Zone Conquest INDIVIDUAL
CREATE TABLE IF NOT EXISTS zone_conquest_individual_partidas (
  id VARCHAR(36) PRIMARY KEY,
  empresa_id VARCHAR(36) NOT NULL,
  evento_id VARCHAR(36) NOT NULL,
  brincadeira_id VARCHAR(36) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active', -- 'active', 'completed', 'finished'
  version INT NOT NULL DEFAULT 0, -- Versionning para optimistic locking
  started_at DATETIME2 NOT NULL DEFAULT GETDATE(),
  finished_at DATETIME2 NULL,
  created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
  updated_at DATETIME2 NOT NULL DEFAULT GETDATE(),
  
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (evento_id) REFERENCES eventos(id),
  FOREIGN KEY (brincadeira_id) REFERENCES brincadeiras(id),
  INDEX idx_evento_id (evento_id),
  INDEX idx_status (status)
);

-- Estado por participante (como monster_hunt_team_states)
CREATE TABLE IF NOT EXISTS zone_conquest_individual_participant_states (
  id VARCHAR(36) PRIMARY KEY,
  partida_id VARCHAR(36) NOT NULL,
  empresa_id VARCHAR(36) NOT NULL,
  evento_id VARCHAR(36) NOT NULL,
  crianca_id VARCHAR(36) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active', -- 'active', 'finished'
  checkpoints_read INT NOT NULL DEFAULT 0,
  total_points DECIMAL(10, 2) NOT NULL DEFAULT 0,
  ranking INT NULL,
  version INT NOT NULL DEFAULT 0, -- Versionning para optimistic locking
  started_at DATETIME2 NOT NULL DEFAULT GETDATE(),
  finished_at DATETIME2 NULL,
  created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
  updated_at DATETIME2 NOT NULL DEFAULT GETDATE(),
  
  FOREIGN KEY (partida_id) REFERENCES zone_conquest_individual_partidas(id),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (evento_id) REFERENCES eventos(id),
  FOREIGN KEY (crianca_id) REFERENCES criancas(id),
  INDEX idx_partida_id (partida_id),
  INDEX idx_crianca_id (crianca_id),
  -- 1 estado por participante
  CONSTRAINT uq_individual_participant UNIQUE (partida_id, crianca_id)
);

-- Histórico de leituras (como monster_hunt_scans)
CREATE TABLE IF NOT EXISTS zone_conquest_individual_scans (
  id VARCHAR(36) PRIMARY KEY,
  partida_id VARCHAR(36) NOT NULL,
  empresa_id VARCHAR(36) NOT NULL,
  evento_id VARCHAR(36) NOT NULL,
  brincadeira_id VARCHAR(36) NOT NULL,
  checkpoint_id VARCHAR(36) NOT NULL,
  crianca_id VARCHAR(36) NOT NULL,
  uid VARCHAR(50) NOT NULL,
  leitura_id VARCHAR(36) NOT NULL, -- Sempre tem leitura associada
  points_awarded DECIMAL(10, 2) NOT NULL DEFAULT 0,
  is_protected_scan BIT NOT NULL DEFAULT 0, -- Leitura bloqueada por proteção?
  is_restricted_scan BIT NOT NULL DEFAULT 0, -- Leitura bloqueada por restrição?
  version INT NOT NULL DEFAULT 0,
  scanned_at DATETIME2 NOT NULL,
  created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
  
  FOREIGN KEY (partida_id) REFERENCES zone_conquest_individual_partidas(id),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (evento_id) REFERENCES eventos(id),
  FOREIGN KEY (brincadeira_id) REFERENCES brincadeiras(id),
  FOREIGN KEY (checkpoint_id) REFERENCES checkpoints(id),
  FOREIGN KEY (crianca_id) REFERENCES criancas(id),
  INDEX idx_partida_id (partida_id),
  INDEX idx_checkpoint_id (checkpoint_id),
  -- Previne processamento 2x da mesma leitura (como em Monster Hunt)
  CONSTRAINT uq_individual_leitura UNIQUE (leitura_id)
);

-- Estado de proteção de checkpoint (transitório, pode ser em memória ou aqui)
CREATE TABLE IF NOT EXISTS zone_conquest_individual_checkpoint_protection (
  id VARCHAR(36) PRIMARY KEY,
  partida_id VARCHAR(36) NOT NULL,
  checkpoint_id VARCHAR(36) NOT NULL,
  current_owner_crianca_id VARCHAR(36) NOT NULL,
  protected_until DATETIME2 NOT NULL, -- Quando a proteção expira
  created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
  
  FOREIGN KEY (partida_id) REFERENCES zone_conquest_individual_partidas(id),
  FOREIGN KEY (checkpoint_id) REFERENCES checkpoints(id),
  FOREIGN KEY (current_owner_crianca_id) REFERENCES criancas(id),
  INDEX idx_partida_checkpoint (partida_id, checkpoint_id),
  -- 1 proteção por checkpoint por partida
  CONSTRAINT uq_protection UNIQUE (partida_id, checkpoint_id)
);

-- =============================================================================
-- Índices e Constraints Adicionais
-- =============================================================================

-- Índices para performance de queries comuns
CREATE INDEX IF NOT EXISTS idx_team_partidas_evento ON zone_conquest_team_partidas(evento_id, status);
CREATE INDEX IF NOT EXISTS idx_individual_partidas_evento ON zone_conquest_individual_partidas(evento_id, status);

-- Constraints para integridade
ALTER TABLE zone_conquest_team_partidas ADD CONSTRAINT ck_team_status 
  CHECK (status IN ('active', 'finished'));

ALTER TABLE zone_conquest_team_tempos ADD CONSTRAINT ck_team_tempo_status 
  CHECK (status IN ('active', 'completed', 'finished'));

ALTER TABLE zone_conquest_individual_partidas ADD CONSTRAINT ck_individual_status 
  CHECK (status IN ('active', 'completed', 'finished'));

ALTER TABLE zone_conquest_individual_participant_states ADD CONSTRAINT ck_individual_participant_status 
  CHECK (status IN ('active', 'finished'));

-- =============================================================================
-- Stored Procedures para Operações Comuns
-- =============================================================================

-- Procedure para obter partida ativa TEAM
CREATE OR ALTER PROCEDURE sp_GetActiveZoneConquestTeamGame
  @evento_id VARCHAR(36)
AS
BEGIN
  SELECT TOP 1 * 
  FROM zone_conquest_team_partidas
  WHERE LOWER(evento_id) = LOWER(@evento_id)
    AND status = 'active'
  ORDER BY started_at DESC;
END;

-- Procedure para obter partida ativa INDIVIDUAL
CREATE OR ALTER PROCEDURE sp_GetActiveZoneConquestIndividualGame
  @evento_id VARCHAR(36)
AS
BEGIN
  SELECT TOP 1 * 
  FROM zone_conquest_individual_partidas
  WHERE LOWER(evento_id) = LOWER(@evento_id)
    AND status = 'active'
  ORDER BY started_at DESC;
END;

-- Procedure para obter ranking INDIVIDUAL
CREATE OR ALTER PROCEDURE sp_GetZoneConquestIndividualRanking
  @partida_id VARCHAR(36)
AS
BEGIN
  SELECT 
    crianca_id,
    total_points,
    checkpoints_read,
    ROW_NUMBER() OVER (ORDER BY total_points DESC) AS ranking,
    status
  FROM zone_conquest_individual_participant_states
  WHERE partida_id = @partida_id
  ORDER BY total_points DESC;
END;

PRINT '✅ Tabelas de Zone Conquest criadas com sucesso!';
