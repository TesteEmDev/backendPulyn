-- Migration: Rename remaining snake_case tables to camelCase/Portuguese

-- Rename empresa_event_control to empresaEventoControle
ALTER TABLE IF EXISTS empresa_event_control RENAME TO empresaEventoControle;

-- Rename event_game_state to eventoGameState
ALTER TABLE IF EXISTS event_game_state RENAME TO eventoGameState;

-- Rename family_linking_codes to familyLinkingCodes
ALTER TABLE IF EXISTS family_linking_codes RENAME TO familyLinkingCodes;

-- Rename game_sessions to gameSessions
ALTER TABLE IF EXISTS game_sessions RENAME TO gameSessions;

-- Rename game_winner_bonuses to gameWinnerBonuses
ALTER TABLE IF EXISTS game_winner_bonuses RENAME TO gameWinnerBonuses;

-- Rename monster_hunt tables
ALTER TABLE IF EXISTS monster_hunt_partidas RENAME TO monsterHuntPartidas;
ALTER TABLE IF EXISTS monster_hunt_scans RENAME TO monsterHuntScans;
ALTER TABLE IF EXISTS monster_hunt_team_states RENAME TO monsterHuntTeamStates;

-- Rename zone_conquest tables
ALTER TABLE IF EXISTS zone_conquest_checkpoint_states RENAME TO zoneConquestCheckpointStates;
ALTER TABLE IF EXISTS zone_conquest_individual_checkpoint_protection RENAME TO zoneConquestIndividualCheckpointProtection;
ALTER TABLE IF EXISTS zone_conquest_individual_participant_states RENAME TO zoneConquestIndividualParticipantStates;
ALTER TABLE IF EXISTS zone_conquest_individual_partidas RENAME TO zoneConquestIndividualPartidas;
ALTER TABLE IF EXISTS zone_conquest_individual_scans RENAME TO zoneConquestIndividualScans;
ALTER TABLE IF EXISTS zone_conquest_team_partidas RENAME TO zoneConquestTeamPartidas;
ALTER TABLE IF EXISTS zone_conquest_team_scans RENAME TO zoneConquestTeamScans;
ALTER TABLE IF EXISTS zone_conquest_team_tempos RENAME TO zoneConquestTeamTempos;
ALTER TABLE IF EXISTS zone_conquest_zone_states RENAME TO zoneConquestZoneStates;

-- Rename zonas_equipes tables
ALTER TABLE IF EXISTS zonas_equipes_partidas RENAME TO zonasEquipesPartidas;
ALTER TABLE IF EXISTS zonas_equipes_scans RENAME TO zonasEquipesScans;
ALTER TABLE IF EXISTS zonas_equipes_teams_states RENAME TO zonasEquipesTeamsStates;
