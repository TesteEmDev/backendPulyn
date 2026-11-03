-- ========================================
-- Migração (só para a NUVEM): acesso por buffet
-- ========================================
-- Cada buffet entra na nuvem com um usuário próprio. Esse usuário só enxerga e altera as linhas da empresa dele
-- (Row Level Security). Quem é dono das tabelas (o acesso de administração) não passa pelas regras.
-- Quem liga o usuário à empresa é a tabela "sincronizacaoAcesso", preenchida por debug/criar-usuario-buffet-nuvem.js.
--
-- Idempotente. Rodar DEPOIS do migrations/018-sincronizacao-fila.sql.

CREATE TABLE IF NOT EXISTS "sincronizacaoAcesso" (
  "usuario" text PRIMARY KEY,
  "empresaId" text NOT NULL
);

ALTER TABLE "sincronizacaoAcesso" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "acessoProprio" ON "sincronizacaoAcesso";
CREATE POLICY "acessoProprio" ON "sincronizacaoAcesso" FOR SELECT USING ("usuario" = session_user);

-- Empresas que o usuário logado pode ver. SECURITY DEFINER: a consulta roda com o dono, senão a própria regra
-- de acesso se bloquearia. session_user é quem fez a conexão (dentro da função, current_user seria o dono).
CREATE OR REPLACE FUNCTION "sincronizacaoEmpresasDoUsuario"() RETURNS SETOF text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT "empresaId" FROM "sincronizacaoAcesso" WHERE "usuario" = session_user
$$;

-- Regras por tabela. Tabela com coluna de empresa: o usuário vê e altera só a sua. A tabela `empresas` se liga pelo
-- id. Tabela sem vínculo com empresa: fica fechada para usuário de buffet (ninguém vê nada por ela).
DO $$
DECLARE
  t record;
  colunaEmpresa text;
BEGIN
  FOR t IN
    SELECT c.relname::text AS nome
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> 'sincronizacaoAcesso'
  LOOP
    colunaEmpresa := CASE
      WHEN t.nome = 'empresas' THEN 'id'
      ELSE (SELECT a.attname::text FROM pg_attribute a
            WHERE a.attrelid = format('public.%I', t.nome)::regclass
              AND a.attname IN ('empresaId', 'empresa_id') AND NOT a.attisdropped
            ORDER BY CASE a.attname WHEN 'empresaId' THEN 1 ELSE 2 END LIMIT 1)
    END;

    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t.nome);
    EXECUTE format('DROP POLICY IF EXISTS "buffetVeSuaEmpresa" ON %I', t.nome);
    IF colunaEmpresa IS NOT NULL THEN
      EXECUTE format(
        'CREATE POLICY "buffetVeSuaEmpresa" ON %I FOR ALL '
        || 'USING (%I IN (SELECT "sincronizacaoEmpresasDoUsuario"())) '
        || 'WITH CHECK (%I IN (SELECT "sincronizacaoEmpresasDoUsuario"()))',
        t.nome, colunaEmpresa, colunaEmpresa
      );
    END IF;
  END LOOP;
END
$$;

-- Diz se a retenção já apagou alterações posteriores ao último ponto que o buffet puxou (criadoEm dessa alteração).
-- A retenção apaga do mais antigo para o mais novo: se a alteração mais antiga que restou é posterior ao ponto do
-- buffet, então houve perda. Só devolve verdadeiro ou falso, sem dados.
CREATE OR REPLACE FUNCTION "sincronizacaoPerdeuAlteracoesDesde"(ultima timestamptz) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN ultima IS NULL THEN false
    ELSE COALESCE((SELECT min("criadoEm") > ultima FROM "sincronizacaoFila"), true) END
$$;

-- Limpeza da fila da nuvem: apaga o que tem mais de N dias. Roda como dono (agendada no Supabase).
-- Um buffet que ficar mais tempo sem conectar que a retenção perde alterações; o sincronizador avisa (ver puxar()).
CREATE OR REPLACE FUNCTION "sincronizacaoLimparFila"(dias integer DEFAULT 60) RETURNS bigint
LANGUAGE sql AS $$
  WITH apagadas AS (
    DELETE FROM "sincronizacaoFila" WHERE "criadoEm" < now() - make_interval(days => dias) RETURNING 1
  )
  SELECT count(*) FROM apagadas
$$;
