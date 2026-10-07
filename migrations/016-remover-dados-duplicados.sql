-- ========================================
-- Migração: remover linhas duplicadas e adicionar chave primária
-- ========================================
-- Seis tabelas ficaram com todas as linhas em dobro (a restauração do backup
-- inseriu os dados duas vezes em tabelas sem chave primária). Esta migração
-- mantém uma cópia de cada linha idêntica e cria a chave primária "id" que o
-- DDL do código já previa.
-- Idempotente: se não houver duplicatas e já houver chave primária, não faz nada.
-- Se alguma linha repetir o "id" com valores diferentes, a criação da chave
-- primária falha e a transação inteira é desfeita.

BEGIN;

DO $$
DECLARE
  tabela text;
  removidas bigint;
BEGIN
  FOREACH tabela IN ARRAY ARRAY[
    'zonaConquistaPartidaTime',
    'zonaConquistaLeituraIndividual',
    'zonaConquistaLeituraTime',
    'monsterCacaPartida',
    'zonaConquistaPartidaIndividual',
    'zonaConquistaTempoTime'
  ]
  LOOP
    IF to_regclass(format('public.%I', tabela)) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format(
      'DELETE FROM %1$I a USING %1$I b WHERE a.ctid < b.ctid AND a::text = b::text',
      tabela
    );
    GET DIAGNOSTICS removidas = ROW_COUNT;
    RAISE NOTICE '% : % linha(s) duplicada(s) removida(s)', tabela, removidas;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = to_regclass(format('public.%I', tabela)) AND contype = 'p'
    ) THEN
      EXECUTE format('ALTER TABLE %I ADD PRIMARY KEY (id)', tabela);
      RAISE NOTICE '% : chave primária (id) criada', tabela;
    END IF;
  END LOOP;
END $$;

COMMIT;
