-- Check row count in unused tables
SELECT
  schemaname,
  tablename,
  n_live_tup as "linhas"
FROM pg_stat_user_tables
WHERE tablename IN (
  'bonusVencedorJogo',
  'cacaTesourTempos',
  'empresaEventoControle',
  'estadoJogoEvento',
  'monsterCacaEstadosTime',
  'zonasConquistaEstadosCheckpoint',
  'zonasConquistaEstadosParticipanteIndividual',
  'zonasConquistaEstadosZona',
  'zonasEquipesEstadosTime',
  'zonasEquipesPartidas',
  'zonasEquipesScans'
)
ORDER BY n_live_tup DESC;
