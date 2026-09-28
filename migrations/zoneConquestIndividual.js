// migrations/zoneConquestIndividual.js - Tabelas para Zone Conquest modo INDIVIDUAL
const { query } = require('../database');

async function ensureZoneConquestIndividualSchema() {
  try {
    // PostgreSQL
    await query(`
      -- Tabela 1: Partidas individuais
      CREATE TABLE IF NOT EXISTS "zone_conquest_individual_partidas" (
        "id" varchar(36) PRIMARY KEY,
        "evento_id" varchar(36) NOT NULL,
        "empresa_id" varchar(36) NOT NULL,
        "brincadeira_id" varchar(36) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'active',
        "started_at" timestamptz,
        "finished_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS "idx_zcip_evento" ON "zone_conquest_individual_partidas"("evento_id");
      CREATE INDEX IF NOT EXISTS "idx_zcip_status" ON "zone_conquest_individual_partidas"("status");

      -- Tabela 2: Estados dos participantes
      CREATE TABLE IF NOT EXISTS "zone_conquest_individual_participant_states" (
        "id" varchar(36) PRIMARY KEY,
        "partida_id" varchar(36) NOT NULL REFERENCES "zone_conquest_individual_partidas"("id"),
        "empresa_id" varchar(36) NOT NULL,
        "evento_id" varchar(36) NOT NULL,
        "crianca_id" varchar(36) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'active',
        "checkpoints_read" integer DEFAULT 0,
        "total_points" decimal(10, 2) DEFAULT 0,
        "ranking" integer,
        "version" integer DEFAULT 0,
        "started_at" timestamptz,
        "finished_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS "idx_zcips_partida" ON "zone_conquest_individual_participant_states"("partida_id");
      CREATE INDEX IF NOT EXISTS "idx_zcips_crianca" ON "zone_conquest_individual_participant_states"("crianca_id");

      -- Tabela 3: Scans/leituras individuais
      CREATE TABLE IF NOT EXISTS "zone_conquest_individual_scans" (
        "id" varchar(36) PRIMARY KEY,
        "partida_id" varchar(36) NOT NULL REFERENCES "zone_conquest_individual_partidas"("id"),
        "empresa_id" varchar(36) NOT NULL,
        "evento_id" varchar(36) NOT NULL,
        "brincadeira_id" varchar(36) NOT NULL,
        "checkpoint_id" varchar(36) NOT NULL,
        "crianca_id" varchar(36) NOT NULL,
        "uid" varchar(50) NOT NULL,
        "leitura_id" varchar(36) NOT NULL UNIQUE,
        "points_awarded" decimal(10, 2),
        "version" integer DEFAULT 0,
        "scanned_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS "idx_zcis_partida" ON "zone_conquest_individual_scans"("partida_id");
      CREATE INDEX IF NOT EXISTS "idx_zcis_crianca" ON "zone_conquest_individual_scans"("crianca_id");
      CREATE INDEX IF NOT EXISTS "idx_zcis_leitura" ON "zone_conquest_individual_scans"("leitura_id");
    `);
    
    console.log('✅ Schema de zone_conquest_individual verificado (PostgreSQL)');
  } catch (err) {
    // SQL Server fallback
    try {
      await query(`
        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='zone_conquest_individual_partidas' AND xtype='U')
        CREATE TABLE [zone_conquest_individual_partidas] (
          [id] VARCHAR(36) PRIMARY KEY,
          [evento_id] VARCHAR(36) NOT NULL,
          [empresa_id] VARCHAR(36) NOT NULL,
          [brincadeira_id] VARCHAR(36) NOT NULL,
          [status] VARCHAR(20) NOT NULL DEFAULT 'active',
          [started_at] DATETIME2,
          [finished_at] DATETIME2,
          [created_at] DATETIME2 NOT NULL DEFAULT GETDATE(),
          [updated_at] DATETIME2 NOT NULL DEFAULT GETDATE()
        );

        IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='idx_zcip_evento')
          CREATE INDEX idx_zcip_evento ON [zone_conquest_individual_partidas]([evento_id]);
        IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='idx_zcip_status')
          CREATE INDEX idx_zcip_status ON [zone_conquest_individual_partidas]([status]);

        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='zone_conquest_individual_participant_states' AND xtype='U')
        CREATE TABLE [zone_conquest_individual_participant_states] (
          [id] VARCHAR(36) PRIMARY KEY,
          [partida_id] VARCHAR(36) NOT NULL FOREIGN KEY REFERENCES [zone_conquest_individual_partidas]([id]),
          [empresa_id] VARCHAR(36) NOT NULL,
          [evento_id] VARCHAR(36) NOT NULL,
          [crianca_id] VARCHAR(36) NOT NULL,
          [status] VARCHAR(20) NOT NULL DEFAULT 'active',
          [checkpoints_read] INT DEFAULT 0,
          [total_points] DECIMAL(10, 2) DEFAULT 0,
          [ranking] INT,
          [version] INT DEFAULT 0,
          [started_at] DATETIME2,
          [finished_at] DATETIME2,
          [created_at] DATETIME2 NOT NULL DEFAULT GETDATE(),
          [updated_at] DATETIME2 NOT NULL DEFAULT GETDATE()
        );

        IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='idx_zcips_partida')
          CREATE INDEX idx_zcips_partida ON [zone_conquest_individual_participant_states]([partida_id]);
        IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='idx_zcips_crianca')
          CREATE INDEX idx_zcips_crianca ON [zone_conquest_individual_participant_states]([crianca_id]);

        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='zone_conquest_individual_scans' AND xtype='U')
        CREATE TABLE [zone_conquest_individual_scans] (
          [id] VARCHAR(36) PRIMARY KEY,
          [partida_id] VARCHAR(36) NOT NULL FOREIGN KEY REFERENCES [zone_conquest_individual_partidas]([id]),
          [empresa_id] VARCHAR(36) NOT NULL,
          [evento_id] VARCHAR(36) NOT NULL,
          [brincadeira_id] VARCHAR(36) NOT NULL,
          [checkpoint_id] VARCHAR(36) NOT NULL,
          [crianca_id] VARCHAR(36) NOT NULL,
          [uid] VARCHAR(50) NOT NULL,
          [leitura_id] VARCHAR(36) NOT NULL UNIQUE,
          [points_awarded] DECIMAL(10, 2),
          [version] INT DEFAULT 0,
          [scanned_at] DATETIME2,
          [created_at] DATETIME2 NOT NULL DEFAULT GETDATE()
        );

        IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='idx_zcis_partida')
          CREATE INDEX idx_zcis_partida ON [zone_conquest_individual_scans]([partida_id]);
        IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='idx_zcis_crianca')
          CREATE INDEX idx_zcis_crianca ON [zone_conquest_individual_scans]([crianca_id]);
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
