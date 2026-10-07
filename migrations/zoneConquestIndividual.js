// migrations/zoneConquestIndividual.js - Tabelas para Zone Conquest modo INDIVIDUAL
const { query } = require('../database');

async function ensureZoneConquestIndividualSchema() {
  try {
    // PostgreSQL
    await query(`
      -- Tabela 1: Partidas individuais
      CREATE TABLE IF NOT EXISTS "zonaConquistaPartidaIndividual" (
        "id" varchar(36) PRIMARY KEY,
        "eventoId" varchar(36) NOT NULL,
        "empresaId" varchar(36) NOT NULL,
        "brincadeiraId" varchar(36) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'active',
        "iniciadoEm" timestamptz,
        "finalizadoEm" timestamptz,
        "criadoEm" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "atualizadoEm" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS "idx_zcip_evento" ON "zonaConquistaPartidaIndividual"("eventoId");
      CREATE INDEX IF NOT EXISTS "idx_zcip_status" ON "zonaConquistaPartidaIndividual"("status");

      -- Tabela 2: Estados dos participantes
      CREATE TABLE IF NOT EXISTS "zonaConquistaEstadoParticipanteIndividual" (
        "id" varchar(36) PRIMARY KEY,
        "partidaId" varchar(36) NOT NULL REFERENCES "zonaConquistaPartidaIndividual"("id"),
        "empresaId" varchar(36) NOT NULL,
        "eventoId" varchar(36) NOT NULL,
        "criancaId" varchar(36) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'active',
        "checkpointsLidos" integer DEFAULT 0,
        "pontosTotais" decimal(10, 2) DEFAULT 0,
        "ranking" integer,
        "versao" integer DEFAULT 0,
        "iniciadoEm" timestamptz,
        "finalizadoEm" timestamptz,
        "criadoEm" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "atualizadoEm" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS "idx_zcips_partida" ON "zonaConquistaEstadoParticipanteIndividual"("partidaId");
      CREATE INDEX IF NOT EXISTS "idx_zcips_crianca" ON "zonaConquistaEstadoParticipanteIndividual"("criancaId");

      -- Tabela 3: Scans/leituras individuais
      CREATE TABLE IF NOT EXISTS "zonaConquistaLeituraIndividual" (
        "id" varchar(36) PRIMARY KEY,
        "partidaId" varchar(36) NOT NULL REFERENCES "zonaConquistaPartidaIndividual"("id"),
        "empresaId" varchar(36) NOT NULL,
        "eventoId" varchar(36) NOT NULL,
        "brincadeiraId" varchar(36) NOT NULL,
        "checkpointId" varchar(36) NOT NULL,
        "criancaId" varchar(36) NOT NULL,
        "uid" varchar(50) NOT NULL,
        "leituraId" varchar(36) NOT NULL UNIQUE,
        "pontosAtribuidos" decimal(10, 2),
        "versao" integer DEFAULT 0,
        "lidoEm" timestamptz,
        "criadoEm" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS "idx_zcis_partida" ON "zonaConquistaLeituraIndividual"("partidaId");
      CREATE INDEX IF NOT EXISTS "idx_zcis_crianca" ON "zonaConquistaLeituraIndividual"("criancaId");
      CREATE INDEX IF NOT EXISTS "idx_zcis_leitura" ON "zonaConquistaLeituraIndividual"("leituraId");
    `);
    
    console.log('✅ Schema de zone_conquest_individual verificado (PostgreSQL)');
  } catch (err) {
    // SQL Server fallback
    try {
      await query(`
        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='zone_conquest_individual_partidas' AND xtype='U')
        CREATE TABLE [zone_conquest_individual_partidas] (
          [id] VARCHAR(36) PRIMARY KEY,
          [eventoId] VARCHAR(36) NOT NULL,
          [empresaId] VARCHAR(36) NOT NULL,
          [brincadeiraId] VARCHAR(36) NOT NULL,
          [status] VARCHAR(20) NOT NULL DEFAULT 'active',
          [iniciadoEm] DATETIME2,
          [finalizadoEm] DATETIME2,
          [created_at] DATETIME2 NOT NULL DEFAULT GETDATE(),
          [updated_at] DATETIME2 NOT NULL DEFAULT GETDATE()
        );

        IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='idx_zcip_evento')
          CREATE INDEX idx_zcip_evento ON [zone_conquest_individual_partidas]([eventoId]);
        IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='idx_zcip_status')
          CREATE INDEX idx_zcip_status ON [zone_conquest_individual_partidas]([status]);

        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='zone_conquest_individual_participant_states' AND xtype='U')
        CREATE TABLE [zone_conquest_individual_participant_states] (
          [id] VARCHAR(36) PRIMARY KEY,
          [partidaId] VARCHAR(36) NOT NULL FOREIGN KEY REFERENCES [zone_conquest_individual_partidas]([id]),
          [empresaId] VARCHAR(36) NOT NULL,
          [eventoId] VARCHAR(36) NOT NULL,
          [criancaId] VARCHAR(36) NOT NULL,
          [status] VARCHAR(20) NOT NULL DEFAULT 'active',
          [checkpointsLidos] INT DEFAULT 0,
          [pontosTotais] DECIMAL(10, 2) DEFAULT 0,
          [ranking] INT,
          [version] INT DEFAULT 0,
          [iniciadoEm] DATETIME2,
          [finalizadoEm] DATETIME2,
          [created_at] DATETIME2 NOT NULL DEFAULT GETDATE(),
          [updated_at] DATETIME2 NOT NULL DEFAULT GETDATE()
        );

        IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='idx_zcips_partida')
          CREATE INDEX idx_zcips_partida ON [zone_conquest_individual_participant_states]([partidaId]);
        IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='idx_zcips_crianca')
          CREATE INDEX idx_zcips_crianca ON [zone_conquest_individual_participant_states]([criancaId]);

        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='zone_conquest_individual_scans' AND xtype='U')
        CREATE TABLE [zone_conquest_individual_scans] (
          [id] VARCHAR(36) PRIMARY KEY,
          [partidaId] VARCHAR(36) NOT NULL FOREIGN KEY REFERENCES [zone_conquest_individual_partidas]([id]),
          [empresaId] VARCHAR(36) NOT NULL,
          [eventoId] VARCHAR(36) NOT NULL,
          [brincadeiraId] VARCHAR(36) NOT NULL,
          [checkpointId] VARCHAR(36) NOT NULL,
          [criancaId] VARCHAR(36) NOT NULL,
          [uid] VARCHAR(50) NOT NULL,
          [leitura_id] VARCHAR(36) NOT NULL UNIQUE,
          [points_awarded] DECIMAL(10, 2),
          [version] INT DEFAULT 0,
          [scanned_at] DATETIME2,
          [created_at] DATETIME2 NOT NULL DEFAULT GETDATE()
        );

        IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='idx_zcis_partida')
          CREATE INDEX idx_zcis_partida ON [zone_conquest_individual_scans]([partidaId]);
        IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='idx_zcis_crianca')
          CREATE INDEX idx_zcis_crianca ON [zone_conquest_individual_scans]([criancaId]);
        IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='idx_zcis_leitura')
          CREATE INDEX idx_zcis_leitura ON [zone_conquest_individual_scans]([leitura_id]);
      `);
      
      console.log('✅ Schema de zone_conquest_individual verificado (SQL Server)');
    } catch (sqlErr) {
      console.error('❌ Erro ao criar zone_conquest_individual:', sqlErr.message);
      throw sqlErr;
    }
  }
}

module.exports = { ensureZoneConquestIndividualSchema };
