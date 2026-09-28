-- =====================================================
-- 🎮 SCRIPT: Configurar Jogo Ativo para Evento "rtrt"
-- =====================================================

-- 📋 PASSO 1: Ver o evento "rtrt" e sua empresa
SELECT 
  id,
  name,
  empresa_id,
  status,
  active_brincadeira_id,
  active_game_type
FROM eventos 
WHERE name = 'rtrt' 
LIMIT 1;

-- 📋 PASSO 2: Ver brincadeiras existentes na empresa
SELECT 
  id,
  name,
  game_type,
  tipo,
  status
FROM brincadeiras 
WHERE empresa_id = (SELECT empresa_id FROM eventos WHERE name = 'rtrt' LIMIT 1)
LIMIT 10;

-- =====================================================
-- ✅ OPÇÃO A: Criar nova brincadeira "Captura de Territórios"
-- =====================================================
BEGIN;

-- Criar brincadeira
INSERT INTO brincadeiras (
  id,
  name, 
  description, 
  type, 
  game_type,
  status,
  default_points,
  empresa_id,
  duration
)
VALUES (
  gen_random_uuid()::varchar(36),
  'Captura de Territórios',
  'Jogo de captura de territórios em tempo real - Avatar se move quando criança passa pulseira no checkpoint',
  'team',
  'standard',
  'active',
  10,
  (SELECT empresa_id FROM eventos WHERE name = 'rtrt' LIMIT 1),
  120
)
ON CONFLICT DO NOTHING;

-- Atualizar evento para usar esta brincadeira
UPDATE eventos
SET 
  active_brincadeira_id = (
    SELECT id FROM brincadeiras 
    WHERE name = 'Captura de Territórios'
    AND empresa_id = (SELECT empresa_id FROM eventos WHERE name = 'rtrt' LIMIT 1)
    ORDER BY created_at DESC
    LIMIT 1
  ),
  active_game_type = 'standard',
  status = 'active'
WHERE name = 'rtrt';

COMMIT;

-- =====================================================
-- ✅ OPÇÃO B: Usar brincadeira existente
-- =====================================================
-- Descomente e execute se preferir usar uma brincadeira existente
-- Substitua 'NOME_DA_BRINCADEIRA' pelo nome real
/*
BEGIN;
UPDATE eventos
SET 
  active_brincadeira_id = (
    SELECT id FROM brincadeiras 
    WHERE name = 'NOME_DA_BRINCADEIRA'
    AND empresa_id = (SELECT empresa_id FROM eventos WHERE name = 'rtrt' LIMIT 1)
    LIMIT 1
  ),
  active_game_type = 'standard',
  status = 'active'
WHERE name = 'rtrt';
COMMIT;
*/

-- =====================================================
-- ✅ VERIFICAR O RESULTADO
-- =====================================================
SELECT 
  e.id as evento_id,
  e.name as evento_name,
  e.empresa_id,
  e.status as evento_status,
  e.active_brincadeira_id,
  e.active_game_type,
  b.id as brincadeira_id,
  b.name as brincadeira_name,
  b.game_type,
  b.description,
  b.default_points
FROM eventos e
LEFT JOIN brincadeiras b ON b.id = e.active_brincadeira_id
WHERE e.name = 'rtrt';
