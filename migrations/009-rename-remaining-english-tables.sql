-- Migration: Translate remaining English words in table names

-- checkpointTags → etiquetasCheckpoint
ALTER TABLE IF EXISTS "checkpointTags" RENAME TO "etiquetasCheckpoint";

-- familyLinkingCodes → codigosVinculoFamiliar
ALTER TABLE IF EXISTS "familyLinkingCodes" RENAME TO "codigosVinculoFamiliar";

-- gameSessions → sessoesJogo
ALTER TABLE IF EXISTS "gameSessions" RENAME TO "sessoesJogo";

-- gameWinnerBonuses → bonusVencedorJogo
ALTER TABLE IF EXISTS "gameWinnerBonuses" RENAME TO "bonusVencedorJogo";

-- eventoGameState → estadoJogoEvento
ALTER TABLE IF EXISTS "eventoGameState" RENAME TO "estadoJogoEvento";

-- monsterHuntPartidas → monsterCacaPartidas
ALTER TABLE IF EXISTS "monsterHuntPartidas" RENAME TO "monsterCacaPartidas";

-- monsterHuntScans → monsterCacaLeituras
ALTER TABLE IF EXISTS "monsterHuntScans" RENAME TO "monsterCacaLeituras";

-- monsterHuntTeamStates → monsterCacaEstadosTime
ALTER TABLE IF EXISTS "monsterHuntTeamStates" RENAME TO "monsterCacaEstadosTime";

-- zonasEquipesTeamsStates → zonasEquipesEstadosTime
ALTER TABLE IF EXISTS "zonasEquipesTeamsStates" RENAME TO "zonasEquipesEstadosTime";
