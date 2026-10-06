-- Migration: Rename lowercase tables to proper camelCase with quotes

-- Rename empresaeventocontrole to empresaEventoControle
ALTER TABLE IF EXISTS empresaeventocontrole RENAME TO "empresaEventoControle";

-- Rename eventogamestate to eventoGameState
ALTER TABLE IF EXISTS eventogamestate RENAME TO "eventoGameState";

-- Rename familylinkingcodes to familyLinkingCodes
ALTER TABLE IF EXISTS familylinkingcodes RENAME TO "familyLinkingCodes";

-- Rename gamesessions to gameSessions
ALTER TABLE IF EXISTS gamesessions RENAME TO "gameSessions";

-- Rename gamewinnerbonuses to gameWinnerBonuses
ALTER TABLE IF EXISTS gamewinnerbonuses RENAME TO "gameWinnerBonuses";

-- Rename monsterhuntpartidas to monsterHuntPartidas
ALTER TABLE IF EXISTS monsterhuntpartidas RENAME TO "monsterHuntPartidas";

-- Rename monsterhuntscans to monsterHuntScans
ALTER TABLE IF EXISTS monsterhuntscans RENAME TO "monsterHuntScans";

-- Rename monsterhuntteamstates to monsterHuntTeamStates
ALTER TABLE IF EXISTS monsterhuntteamstates RENAME TO "monsterHuntTeamStates";

-- Rename zonas_equipes tables
ALTER TABLE IF EXISTS zonasequipespartidas RENAME TO "zonasEquipesPartidas";
ALTER TABLE IF EXISTS zonasequipesscans RENAME TO "zonasEquipesScans";
ALTER TABLE IF EXISTS zonasEquipesteamsstates RENAME TO "zonasEquipesTeamsStates";

-- Rename zone_conquest tables
ALTER TABLE IF EXISTS zoneconquestcheckpointstates RENAME TO "zoneConquestCheckpointStates";
ALTER TABLE IF EXISTS zoneconquestindividualcheckpointprotection RENAME TO "zoneConquestIndividualCheckpointProtection";
ALTER TABLE IF EXISTS zoneconquestindividualparticipantstates RENAME TO "zoneConquestIndividualParticipantStates";
ALTER TABLE IF EXISTS zoneconquestindividualpartidas RENAME TO "zoneConquestIndividualPartidas";
ALTER TABLE IF EXISTS zoneconquestindividualscans RENAME TO "zoneConquestIndividualScans";
ALTER TABLE IF EXISTS zoneconquestteampartidas RENAME TO "zoneConquestTeamPartidas";
ALTER TABLE IF EXISTS zoneconquestteamscans RENAME TO "zoneConquestTeamScans";
ALTER TABLE IF EXISTS zoneconquestteamtempos RENAME TO "zoneConquestTeamTempos";
ALTER TABLE IF EXISTS zoneconquestzonestates RENAME TO "zoneConquestZoneStates";

-- Also rename other tables that may be lowercase
ALTER TABLE IF EXISTS acessos RENAME TO "acessos"; -- already correct
ALTER TABLE IF EXISTS brincadeiras RENAME TO "brincadeiras"; -- already correct
ALTER TABLE IF EXISTS criancas RENAME TO "criancas"; -- already correct
ALTER TABLE IF EXISTS empresas RENAME TO "empresas"; -- already correct
ALTER TABLE IF EXISTS eventos RENAME TO "eventos"; -- already correct
ALTER TABLE IF EXISTS pontoVerificacao RENAME TO "pontoVerificacao"; -- already correct
ALTER TABLE IF EXISTS times RENAME TO "times"; -- already correct
ALTER TABLE IF EXISTS zonas RENAME TO "zonas"; -- already correct
