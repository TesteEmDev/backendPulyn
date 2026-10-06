-- Quick seed para dados básicos
INSERT INTO empresas (id, name, plan, status, created_at, updated_at)
VALUES ('empresa-001', 'Buffet Teste', 'professional', 'active', NOW(), NOW())
ON CONFLICT DO NOTHING;

INSERT INTO logins (id, email, name, role, empresa_id, status, created_at, updated_at)
VALUES
  ('user-admin', 'admin@teste.com', 'Admin', 'admin', 'empresa-001', 'active', NOW(), NOW()),
  ('user-master', 'master@pulyn.com', 'Master', 'master', NULL, 'active', NOW(), NOW())
ON CONFLICT DO NOTHING;

INSERT INTO eventos (id, name, date, time, duration, empresa_id, status, enable_display, enable_location, created_at, updated_at)
VALUES ('evento-001', 'Festa Teste', CURRENT_DATE, '14:00:00', 120, 'empresa-001', 'scheduled', true, true, NOW(), NOW())
ON CONFLICT DO NOTHING;

INSERT INTO times (id, name, color, evento_id, empresa_id, points, status, created_at, updated_at)
VALUES
  ('time-1', 'Time Vermelho', '#FF0000', 'evento-001', 'empresa-001', 0, 'active', NOW(), NOW()),
  ('time-2', 'Time Azul', '#0000FF', 'evento-001', 'empresa-001', 0, 'active', NOW(), NOW()),
  ('time-3', 'Time Verde', '#00AA00', 'evento-001', 'empresa-001', 0, 'active', NOW(), NOW())
ON CONFLICT DO NOTHING;

INSERT INTO checkpoints (id, name, evento_id, empresa_id, status, checkpoint_purpose, created_at, updated_at)
VALUES
  ('cp-1', 'Entrada', 'evento-001', 'empresa-001', 'online', 'reception', NOW(), NOW()),
  ('cp-2', 'Brinquedo 1', 'evento-001', 'empresa-001', 'online', 'game', NOW(), NOW()),
  ('cp-3', 'Brinquedo 2', 'evento-001', 'empresa-001', 'online', 'game', NOW(), NOW()),
  ('cp-4', 'Arena', 'evento-001', 'empresa-001', 'online', 'game', NOW(), NOW())
ON CONFLICT DO NOTHING;

INSERT INTO pulseiras (id, code, empresa_id, status, created_at, updated_at)
VALUES
  ('bracelet-1', 'NFC001', 'empresa-001', 'disponivel', NOW(), NOW()),
  ('bracelet-2', 'NFC002', 'empresa-001', 'disponivel', NOW(), NOW()),
  ('bracelet-3', 'NFC003', 'empresa-001', 'disponivel', NOW(), NOW()),
  ('bracelet-4', 'NFC004', 'empresa-001', 'disponivel', NOW(), NOW())
ON CONFLICT DO NOTHING;

INSERT INTO criancas (id, name, nickname, age, evento_id, time_id, empresa_id, pulseira_id, status, scores, created_at, updated_at)
VALUES
  ('child-1', 'João Silva', 'João', 7, 'evento-001', 'time-1', 'empresa-001', 'bracelet-1', 'active', 0, NOW(), NOW()),
  ('child-2', 'Maria Santos', 'Maria', 8, 'evento-001', 'time-2', 'empresa-001', 'bracelet-2', 'active', 0, NOW(), NOW()),
  ('child-3', 'Pedro Costa', 'Pedro', 7, 'evento-001', 'time-3', 'empresa-001', 'bracelet-3', 'active', 0, NOW(), NOW()),
  ('child-4', 'Ana Oliveira', 'Ana', 9, 'evento-001', 'time-1', 'empresa-001', 'bracelet-4', 'active', 0, NOW(), NOW())
ON CONFLICT DO NOTHING;

INSERT INTO brincadeiras (id, name, type, evento_id, empresa_id, duration, status, created_at, updated_at)
VALUES
  ('game-1', 'Caça ao Tesouro', 'treasure', 'evento-001', 'empresa-001', 30, 'active', NOW(), NOW()),
  ('game-2', 'Zone Conquest', 'zone_conquest', 'evento-001', 'empresa-001', 40, 'active', NOW(), NOW())
ON CONFLICT DO NOTHING;

SELECT 'Dados inseridos com sucesso!' as result;
