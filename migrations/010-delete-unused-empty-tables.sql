-- Migration: Delete unused and empty tables
-- These tables are not referenced in any backend code and contain no data
-- They were likely intended for caching (which should use Redis/localStorage, not DB tables)

DROP TABLE IF EXISTS "bonusVencedorJogo";
DROP TABLE IF EXISTS "cacaTesourTempos";
DROP TABLE IF EXISTS "empresaEventoControle";
DROP TABLE IF EXISTS "estadoJogoEvento";
DROP TABLE IF EXISTS "monsterCacaEstadosTime";
DROP TABLE IF EXISTS "zonasConquistaEstadosCheckpoint";
DROP TABLE IF EXISTS "zonasConquistaEstadosParticipanteIndividual";
DROP TABLE IF EXISTS "zonasConquistaEstadosZona";
DROP TABLE IF EXISTS "zonasEquipesEstadosTime";
DROP TABLE IF EXISTS "zonasEquipesPartidas";
DROP TABLE IF EXISTS "zonasEquipesScans";
