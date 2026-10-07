-- ============================================================
-- PULYN - CRIAR USUARIO MASTER
-- ============================================================
-- Execute isso no pgAdmin Query Tool

-- 1. Criar primeira empresa (Buffet de teste)
INSERT INTO empresas (id, name, plan, status, created_at, updated_at)
VALUES ('empresa-001', 'Buffet Teste', 'professional', 'active', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- 2. Criar usuario MASTER (super admin) - usa empresa-001 como fallback
INSERT INTO logins (id, email, password, role, empresa_id, status, family_name, data_criacao, data_atualizacao)
VALUES ('master-001', 'master@pulyn.com', 'temp123', 'master', 'empresa-001', 'active', 'Master', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- 3. Criar admin da empresa
INSERT INTO logins (id, email, password, role, empresa_id, status, family_name, data_criacao, data_atualizacao)
VALUES ('admin-001', 'admin@buffet.com', 'temp123', 'admin', 'empresa-001', 'active', 'Admin Buffet', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- 4. Verificar dados inseridos
SELECT '=== USUARIOS CRIADOS ===' as info;
SELECT id, email, family_name, role, empresa_id FROM logins WHERE role IN ('master', 'admin');

SELECT '=== EMPRESAS CRIADAS ===' as info;
SELECT id, name, plan FROM empresas;

SELECT '=== RESULTADO ===' as info;
SELECT COUNT(*) as total_logins FROM logins;
SELECT COUNT(*) as total_empresas FROM empresas;
