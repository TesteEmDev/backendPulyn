-- ========================================
-- Migração: remover tabelas zone_conquest_individual_* em inglês
-- ========================================
-- migrations/zoneConquestIndividual.js ainda criava estas três tabelas com nome
-- em inglês, duplicando zonaConquistaPartidaIndividual,
-- zonaConquistaEstadoParticipanteIndividual e zonaConquistaLeituraIndividual.
-- O código foi corrigido; esta migração remove as cópias que já tinham sido
-- criadas. Só remove se estiverem vazias. Idempotente.

BEGIN;

DO $$
DECLARE
  tabela text;
  linhas bigint;
BEGIN
  FOREACH tabela IN ARRAY ARRAY[
    'zone_conquest_individual_scans',
    'zone_conquest_individual_participant_states',
    'zone_conquest_individual_partidas'
  ]
  LOOP
    IF to_regclass(format('public.%I', tabela)) IS NOT NULL THEN
      EXECUTE format('SELECT count(*) FROM %I', tabela) INTO linhas;
      IF linhas > 0 THEN
        RAISE EXCEPTION '% tem % linha(s); confira antes de remover', tabela, linhas;
      END IF;
      EXECUTE format('DROP TABLE %I', tabela);
      RAISE NOTICE '% removida', tabela;
    END IF;
  END LOOP;
END $$;

COMMIT;
