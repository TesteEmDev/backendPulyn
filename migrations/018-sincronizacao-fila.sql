-- ========================================
-- Migração: fila de sincronização com a nuvem
-- ========================================
-- O banco local registra, por gatilho, toda inserção, alteração e exclusão feita nas
-- tabelas. O processo de sincronização (utils/sincronizacao.js) lê essa fila e envia o
-- estado atual de cada linha para a nuvem. A fila continua enchendo mesmo sem internet.
--
-- Idempotente: pode rodar mais de uma vez. Para cobrir tabelas criadas depois, rode
--   SELECT * FROM "sincronizacaoInstalarGatilhos"();
--
-- Limitações conhecidas
--  - TRUNCATE não é registrado (use DELETE).
--  - Tabela sem chave primária não é sincronizada (a função acima informa quais).

CREATE TABLE IF NOT EXISTS "sincronizacaoFila" (
  "filaId" bigserial PRIMARY KEY,
  "tabela" text NOT NULL,
  "operacao" char(1) NOT NULL CHECK ("operacao" IN ('I', 'U', 'D')),
  "chave" jsonb NOT NULL,
  "criadoEm" timestamptz NOT NULL DEFAULT now(),
  "enviadoEm" timestamptz,
  "tentativas" integer NOT NULL DEFAULT 0,
  "proximaTentativaEm" timestamptz NOT NULL DEFAULT now(),
  "erro" text
);

CREATE INDEX IF NOT EXISTS "sincronizacaoFilaPendente"
  ON "sincronizacaoFila" ("filaId") WHERE "enviadoEm" IS NULL;

CREATE INDEX IF NOT EXISTS "sincronizacaoFilaEnviadoEm"
  ON "sincronizacaoFila" ("enviadoEm") WHERE "enviadoEm" IS NOT NULL;

-- Empresa a que a alteração pertence. Na nuvem é ela que o buffet usa para puxar só as próprias alterações.
ALTER TABLE "sincronizacaoFila" ADD COLUMN IF NOT EXISTS "empresaId" text;

CREATE INDEX IF NOT EXISTS "sincronizacaoFilaEmpresa"
  ON "sincronizacaoFila" ("empresaId", "filaId");

-- Estado do sincronizador (carga inicial, último envio etc.)
CREATE TABLE IF NOT EXISTS "sincronizacaoEstado" (
  "chave" text PRIMARY KEY,
  "valor" text,
  "atualizadoEm" timestamptz NOT NULL DEFAULT now()
);

-- Gatilho genérico: grava a chave primária da linha afetada. Os nomes das colunas da
-- chave chegam como argumentos do gatilho (definidos em sincronizacaoInstalarGatilhos).
CREATE OR REPLACE FUNCTION "sincronizacaoRegistrar"() RETURNS trigger AS $$
DECLARE
  nova jsonb;
  antiga jsonb;
  chaveNova jsonb := '{}'::jsonb;
  chaveAntiga jsonb := '{}'::jsonb;
  i integer;
  empresaAntiga text;
  empresaNova text;
BEGIN
  -- Alteração que o próprio sincronizador está aplicando (envio ou puxada): não volta para a fila.
  IF current_setting('pulyn.sync_ignorar', true) = 'on' THEN RETURN NULL; END IF;

  IF TG_OP <> 'INSERT' THEN antiga := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN nova := to_jsonb(NEW); END IF;

  FOR i IN 0 .. TG_NARGS - 1 LOOP
    IF antiga IS NOT NULL THEN
      chaveAntiga := chaveAntiga || jsonb_build_object(TG_ARGV[i], antiga -> TG_ARGV[i]);
    END IF;
    IF nova IS NOT NULL THEN
      chaveNova := chaveNova || jsonb_build_object(TG_ARGV[i], nova -> TG_ARGV[i]);
    END IF;
  END LOOP;

  -- Empresa da linha: a tabela `empresas` se liga pelo próprio id; as outras pela coluna empresaId (ou empresa_id).
  IF TG_TABLE_NAME = 'empresas' THEN
    empresaAntiga := chaveAntiga ->> 'id';
    empresaNova := chaveNova ->> 'id';
  ELSE
    empresaAntiga := COALESCE(antiga ->> 'empresaId', antiga ->> 'empresa_id');
    empresaNova := COALESCE(nova ->> 'empresaId', nova ->> 'empresa_id');
  END IF;

  IF TG_OP = 'DELETE' THEN
    INSERT INTO "sincronizacaoFila" ("tabela", "operacao", "chave", "empresaId") VALUES (TG_TABLE_NAME, 'D', chaveAntiga, empresaAntiga);
  ELSE
    -- Mudança da própria chave primária: a linha antiga some na nuvem e a nova aparece.
    IF TG_OP = 'UPDATE' AND chaveAntiga <> chaveNova THEN
      INSERT INTO "sincronizacaoFila" ("tabela", "operacao", "chave", "empresaId") VALUES (TG_TABLE_NAME, 'D', chaveAntiga, empresaAntiga);
    END IF;
    INSERT INTO "sincronizacaoFila" ("tabela", "operacao", "chave", "empresaId")
      VALUES (TG_TABLE_NAME, left(TG_OP, 1), chaveNova, empresaNova);
  END IF;

  RETURN NULL;
END
$$ LANGUAGE plpgsql;

-- Instala (ou reinstala) o gatilho em todas as tabelas do schema public, exceto as do próprio
-- mecanismo. Devolve a situação de cada tabela.
CREATE OR REPLACE FUNCTION "sincronizacaoInstalarGatilhos"()
RETURNS TABLE ("tabela" text, "situacao" text) AS $$
DECLARE
  t record;
  colunasChave text[];
BEGIN
  FOR t IN
    SELECT c.oid, c.relname::text AS nome
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname NOT IN ('sincronizacaoFila', 'sincronizacaoEstado')
    ORDER BY c.relname
  LOOP
    SELECT array_agg(a.attname::text ORDER BY array_position(k.conkey, a.attnum))
      INTO colunasChave
    FROM pg_constraint k
    JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = ANY (k.conkey)
    WHERE k.conrelid = t.oid AND k.contype = 'p';

    IF colunasChave IS NULL THEN
      tabela := t.nome; situacao := 'SEM CHAVE PRIMARIA: nao sincroniza';
      RETURN NEXT;
      CONTINUE;
    END IF;

    EXECUTE format('DROP TRIGGER IF EXISTS "sincronizacaoGatilho" ON %I', t.nome);
    EXECUTE format(
      'CREATE TRIGGER "sincronizacaoGatilho" AFTER INSERT OR UPDATE OR DELETE ON %I '
      || 'FOR EACH ROW EXECUTE FUNCTION "sincronizacaoRegistrar"(%s)',
      t.nome,
      (SELECT string_agg(quote_literal(coluna), ', ') FROM unnest(colunasChave) AS coluna)
    );
    tabela := t.nome; situacao := 'ok';
    RETURN NEXT;
  END LOOP;
END
$$ LANGUAGE plpgsql;

SELECT * FROM "sincronizacaoInstalarGatilhos"();
