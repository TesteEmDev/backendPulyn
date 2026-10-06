-- ============================================================
-- PULYN - DADOS DE TESTE PARA DESENVOLVIMENTO
-- ============================================================
-- Execute este script para popular banco com dados iniciais
-- psql -U postgres -d pulyn_dev -f seed-dev-data.sql
-- ============================================================

-- DESABILITAR CONSTRAINTS TEMPORARIAMENTE
SET session_replication_role = 'replica';

-- ============================================================
-- 1. EMPRESAS (BUFFETS)
-- ============================================================
INSERT INTO empresas (id, name, plan, status, created_at, updated_at)
VALUES
  ('empresa-dev-001', 'Buffet Teste Dev', 'professional', 'active', NOW(), NOW()),
  ('empresa-dev-002', 'Salão Festa Dev', 'starter', 'active', NOW(), NOW())
ON CONFLICT DO NOTHING;

-- ============================================================
-- 2. LOGINS (USUÁRIOS)
-- ============================================================
INSERT INTO logins (
  id, email, name, role, empresa_id,
  password_hash, status, created_at, updated_at
)
VALUES
  -- Master (pode tudo)
  ('user-master-001', 'master@pulyn.local', 'Master Admin', 'master', NULL,
   '$2b$10$fakehash', 'active', NOW(), NOW()),

  -- Admin da empresa 1
  ('user-admin-001', 'admin@buffet-dev.local', 'Admin Buffet', 'admin', 'empresa-dev-001',
   '$2b$10$fakehash', 'active', NOW(), NOW()),

  -- Recepção
  ('user-reception-001', 'recepcao@buffet-dev.local', 'Recepção', 'reception', 'empresa-dev-001',
   '$2b$10$fakehash', 'active', NOW(), NOW()),

  -- Game Master
  ('user-gamemaster-001', 'gamemaster@buffet-dev.local', 'Game Master', 'game_master', 'empresa-dev-001',
   '$2b$10$fakehash', 'active', NOW(), NOW()),

  -- Display (telão)
  ('user-display-001', 'display@buffet-dev.local', 'Telão', 'display', 'empresa-dev-001',
   '$2b$10$fakehash', 'active', NOW(), NOW()),

  -- Kiosk (entrada)
  ('user-kiosk-001', 'kiosk@buffet-dev.local', 'Kiosk Entrada', 'kiosk', 'empresa-dev-001',
   '$2b$10$fakehash', 'active', NOW(), NOW())
ON CONFLICT DO NOTHING;

-- ============================================================
-- 3. EVENTOS (FESTAS)
-- ============================================================
INSERT INTO eventos (
  id, name, date, time, duration,
  empresa_id, status, enable_display, enable_location,
  created_at, updated_at
)
VALUES
  ('evento-dev-001', 'Festa de Aniversário - João', '2026-10-15', '14:00:00', 120,
   'empresa-dev-001', 'scheduled', true, true, NOW(), NOW()),
  ('evento-dev-002', 'Festa Infantil - Maria', '2026-10-20', '15:00:00', 150,
   'empresa-dev-001', 'scheduled', true, true, NOW(), NOW()),
  ('evento-dev-003', 'Evento Teste - Rápido', '2026-10-05', '18:00:00', 60,
   'empresa-dev-001', 'scheduled', true, true, NOW(), NOW())
ON CONFLICT DO NOTHING;

-- ============================================================
-- 4. TIMES (EQUIPES)
-- ============================================================
INSERT INTO times (
  id, name, color, evento_id, empresa_id,
  points, status, created_at, updated_at
)
VALUES
  ('time-dev-red', 'Time Vermelho', '#FF0000', 'evento-dev-001', 'empresa-dev-001',
   0, 'active', NOW(), NOW()),
  ('time-dev-blue', 'Time Azul', '#0000FF', 'evento-dev-001', 'empresa-dev-001',
   0, 'active', NOW(), NOW()),
  ('time-dev-green', 'Time Verde', '#00AA00', 'evento-dev-001', 'empresa-dev-001',
   0, 'active', NOW(), NOW()),
  ('time-dev-yellow', 'Time Amarelo', '#FFAA00', 'evento-dev-001', 'empresa-dev-001',
   0, 'active', NOW(), NOW()),

  -- Times para segundo evento
  ('time-dev-2-red', 'Time Vermelho', '#FF0000', 'evento-dev-002', 'empresa-dev-001',
   0, 'active', NOW(), NOW()),
  ('time-dev-2-blue', 'Time Azul', '#0000FF', 'evento-dev-002', 'empresa-dev-001',
   0, 'active', NOW(), NOW())
ON CONFLICT DO NOTHING;

-- ============================================================
-- 5. CHECKPOINTS (TERRITORIOS/SCANNERS)
-- ============================================================
INSERT INTO checkpoints (
  id, name, evento_id, empresa_id,
  status, checkpoint_purpose, map_x, map_y,
  created_at, updated_at
)
VALUES
  -- Checkpoints do evento 1
  ('checkpoint-dev-01', 'Entrada', 'evento-dev-001', 'empresa-dev-001',
   'online', 'reception', 0, 0, NOW(), NOW()),
  ('checkpoint-dev-02', 'Brinquedo 1', 'evento-dev-001', 'empresa-dev-001',
   'online', 'game', 100, 100, NOW(), NOW()),
  ('checkpoint-dev-03', 'Brinquedo 2', 'evento-dev-001', 'empresa-dev-001',
   'online', 'game', 200, 100, NOW(), NOW()),
  ('checkpoint-dev-04', 'Brinquedo 3', 'evento-dev-001', 'empresa-dev-001',
   'online', 'game', 300, 100, NOW(), NOW()),
  ('checkpoint-dev-05', 'Brinquedo 4', 'evento-dev-001', 'empresa-dev-001',
   'online', 'game', 400, 100, NOW(), NOW()),
  ('checkpoint-dev-06', 'Arena', 'evento-dev-001', 'empresa-dev-001',
   'online', 'game', 250, 300, NOW(), NOW()),

  -- Checkpoints do evento 2
  ('checkpoint-dev-21', 'Entrada', 'evento-dev-002', 'empresa-dev-001',
   'online', 'reception', 0, 0, NOW(), NOW()),
  ('checkpoint-dev-22', 'Piscina de Bolas', 'evento-dev-002', 'empresa-dev-001',
   'online', 'game', 100, 150, NOW(), NOW()),
  ('checkpoint-dev-23', 'Escorregador', 'evento-dev-002', 'empresa-dev-001',
   'online', 'game', 300, 150, NOW(), NOW())
ON CONFLICT DO NOTHING;

-- ============================================================
-- 6. PULSEIRAS (NFC WEARABLES)
-- ============================================================
INSERT INTO pulseiras (
  id, code, empresa_id, status, created_at, updated_at
)
VALUES
  ('bracelet-dev-001', 'NFC001', 'empresa-dev-001', 'disponivel', NOW(), NOW()),
  ('bracelet-dev-002', 'NFC002', 'empresa-dev-001', 'disponivel', NOW(), NOW()),
  ('bracelet-dev-003', 'NFC003', 'empresa-dev-001', 'disponivel', NOW(), NOW()),
  ('bracelet-dev-004', 'NFC004', 'empresa-dev-001', 'disponivel', NOW(), NOW()),
  ('bracelet-dev-005', 'NFC005', 'empresa-dev-001', 'disponivel', NOW(), NOW()),
  ('bracelet-dev-006', 'NFC006', 'empresa-dev-001', 'disponivel', NOW(), NOW()),
  ('bracelet-dev-007', 'NFC007', 'empresa-dev-001', 'disponivel', NOW(), NOW()),
  ('bracelet-dev-008', 'NFC008', 'empresa-dev-001', 'disponivel', NOW(), NOW())
ON CONFLICT DO NOTHING;

-- ============================================================
-- 7. CRIANÇAS (PARTICIPANTES)
-- ============================================================
INSERT INTO criancas (
  id, name, nickname, age, evento_id, time_id, empresa_id,
  pulseira_id, status, scores, created_at, updated_at
)
VALUES
  -- Evento 1 - Time Vermelho
  ('child-dev-001', 'João Silva', 'João', 7, 'evento-dev-001', 'time-dev-red', 'empresa-dev-001',
   'bracelet-dev-001', 'active', 0, NOW(), NOW()),
  ('child-dev-002', 'Pedro Costa', 'Pedro', 8, 'evento-dev-001', 'time-dev-red', 'empresa-dev-001',
   'bracelet-dev-002', 'active', 0, NOW(), NOW()),

  -- Evento 1 - Time Azul
  ('child-dev-003', 'Maria Santos', 'Maria', 7, 'evento-dev-001', 'time-dev-blue', 'empresa-dev-001',
   'bracelet-dev-003', 'active', 0, NOW(), NOW()),
  ('child-dev-004', 'Ana Oliveira', 'Ana', 8, 'evento-dev-001', 'time-dev-blue', 'empresa-dev-001',
   'bracelet-dev-004', 'active', 0, NOW(), NOW()),

  -- Evento 1 - Time Verde
  ('child-dev-005', 'Carlos Ferreira', 'Carlos', 9, 'evento-dev-001', 'time-dev-green', 'empresa-dev-001',
   'bracelet-dev-005', 'active', 0, NOW(), NOW()),

  -- Evento 1 - Time Amarelo
  ('child-dev-006', 'Beatriz Rocha', 'Bia', 7, 'evento-dev-001', 'time-dev-yellow', 'empresa-dev-001',
   'bracelet-dev-006', 'active', 0, NOW(), NOW()),
  ('child-dev-007', 'Lucas Martins', 'Lucas', 9, 'evento-dev-001', 'time-dev-yellow', 'empresa-dev-001',
   'bracelet-dev-007', 'active', 0, NOW(), NOW()),

  -- Evento 2 - Time Vermelho
  ('child-dev-201', 'Thiago Alves', 'Thiago', 8, 'evento-dev-002', 'time-dev-2-red', 'empresa-dev-001',
   'bracelet-dev-008', 'active', 0, NOW(), NOW())
ON CONFLICT DO NOTHING;

-- ============================================================
-- 8. BRINCADEIRAS (JOGOS/ATIVIDADES)
-- ============================================================
INSERT INTO brincadeiras (
  id, name, type, evento_id, empresa_id,
  duration, description, status, created_at, updated_at
)
VALUES
  ('game-dev-treasure-1', 'Caça ao Tesouro', 'treasure', 'evento-dev-001', 'empresa-dev-001',
   30, 'Encontre o tesouro escondido!', 'active', NOW(), NOW()),
  ('game-dev-monster-1', 'Caça ao Monstro', 'monster', 'evento-dev-001', 'empresa-dev-001',
   25, 'Derrote o monstro em equipe!', 'active', NOW(), NOW()),
  ('game-dev-zone-1', 'Conquista de Zonas', 'zone_conquest', 'evento-dev-001', 'empresa-dev-001',
   40, 'Conquiste os territórios!', 'active', NOW(), NOW()),

  ('game-dev-treasure-2', 'Caça ao Tesouro', 'treasure', 'evento-dev-002', 'empresa-dev-001',
   30, 'Encontre o tesouro!', 'active', NOW(), NOW()),
  ('game-dev-zone-2', 'Conquista Individual', 'individual', 'evento-dev-002', 'empresa-dev-001',
   45, 'Cada um por si!', 'active', NOW(), NOW())
ON CONFLICT DO NOTHING;

-- ============================================================
-- 9. LEITURAS (HISTÓRICO DE SCANS - Opcional, dados de exemplo)
-- ============================================================
-- INSERT INTO leituras (
--   id, checkpoint_id, pulseira_id, crianca_id, evento_id, empresa_id,
--   timestamp, points_awarded, created_at
-- )
-- VALUES ...
-- (Comentado - será preenchido durante testes)

-- ============================================================
-- REABILITAR CONSTRAINTS
-- ============================================================
SET session_replication_role = 'default';

-- ============================================================
-- RESUMO
-- ============================================================
\echo ''
\echo '✅ Dados de teste inseridos com sucesso!'
\echo ''
\echo '📊 Resumo:'
SELECT COUNT(*) as "Empresas" FROM empresas;
SELECT COUNT(*) as "Usuários" FROM logins;
SELECT COUNT(*) as "Eventos" FROM eventos;
SELECT COUNT(*) as "Times" FROM times;
SELECT COUNT(*) as "Checkpoints" FROM checkpoints;
SELECT COUNT(*) as "Pulseiras" FROM pulseiras;
SELECT COUNT(*) as "Crianças" FROM criancas;
SELECT COUNT(*) as "Jogos" FROM brincadeiras;
\echo ''
\echo '🎮 Acesse:'
\echo '   Frontend: http://localhost:5173'
\echo '   Backend: http://localhost:3001/api'
\echo ''
