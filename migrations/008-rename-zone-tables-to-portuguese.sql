-- Migration: Rename zone_conquest tables to Portuguese

-- Rename zoneConquestCheckpointStates to zonasConquistaEstadosCheckpoint
ALTER TABLE IF EXISTS "zoneConquestCheckpointStates" RENAME TO "zonasConquistaEstadosCheckpoint";

-- Rename zoneConquestIndividualCheckpointProtection to zonasConquistaProtecaoCheckpointIndividual
ALTER TABLE IF EXISTS "zoneConquestIndividualCheckpointProtection" RENAME TO "zonasConquistaProtecaoCheckpointIndividual";

-- Rename zoneConquestIndividualParticipantStates to zonasConquistaEstadosParticipanteIndividual
ALTER TABLE IF EXISTS "zoneConquestIndividualParticipantStates" RENAME TO "zonasConquistaEstadosParticipanteIndividual";

-- Rename zoneConquestIndividualPartidas to zonasConquistaPartidaIndividual
ALTER TABLE IF EXISTS "zoneConquestIndividualPartidas" RENAME TO "zonasConquistaPartidaIndividual";

-- Rename zoneConquestIndividualScans to zonasConquistaLeituraIndividual
ALTER TABLE IF EXISTS "zoneConquestIndividualScans" RENAME TO "zonasConquistaLeituraIndividual";

-- Rename zoneConquestTeamPartidas to zonasConquistaPartidaTime
ALTER TABLE IF EXISTS "zoneConquestTeamPartidas" RENAME TO "zonasConquistaPartidaTime";

-- Rename zoneConquestTeamScans to zonasConquistaLeituraTime
ALTER TABLE IF EXISTS "zoneConquestTeamScans" RENAME TO "zonasConquistaLeituraTime";

-- Rename zoneConquestTeamTempos to zonasConquistaTempoTime
ALTER TABLE IF EXISTS "zoneConquestTeamTempos" RENAME TO "zonasConquistaTempoTime";

-- Rename zoneConquestZoneStates to zonasConquistaEstadosZona
ALTER TABLE IF EXISTS "zoneConquestZoneStates" RENAME TO "zonasConquistaEstadosZona";
