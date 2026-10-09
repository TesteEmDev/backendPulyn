// migrations/zoneConquest.js - Criar tabelas para Zone Conquest TEAM e INDIVIDUAL

const { query, DB_DRIVER } = require('../database');

// Garante que uma leitura não pontue duas vezes. Se o banco já tiver leituras repetidas (dados antigos),
// o índice não pode ser criado: avisa e segue, em vez de impedir o servidor de subir.
async function createReadingIndex(indexName, tableName) {
  try {
    await query(`CREATE UNIQUE INDEX IF NOT EXISTS ${indexName} ON ${tableName} (leituraId) WHERE leituraId IS NOT NULL`);
  } catch (err) {
    if (err.code !== '23505') throw err;
    console.warn(`⚠️ ${tableName}: há leituras repetidas, o índice ${indexName} não foi criado. Remova as duplicatas (migrations/016-remover-dados-duplicados.sql) para ativá-lo.`);
  }
}

async function ensureZoneConquestSchema() {
  const isPostgres = DB_DRIVER === 'postgres' || DB_DRIVER === 'postgresql';

  if (isPostgres) {
    // ========================================================================
    // ZONE CONQUEST TEAM (baseado em Treasure Hunt)
    // ========================================================================

    await query(`
      CREATE TABLE IF NOT EXISTS zonaConquistaPartidaTime (
        id varchar(36) PRIMARY KEY,
        empresaId varchar(36) NOT NULL,
        eventoId varchar(36) NOT NULL,
        brincadeiraId varchar(36) NOT NULL,
        status varchar(20) NOT NULL DEFAULT 'active',
        numeroRonda integer NOT NULL DEFAULT 1,
        timeAtualId varchar(36) NULL,
        iniciadoEm timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        finalizadoEm timestamptz NULL,
        criadoEm timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        atualizadoEm timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Zona - Domínio total: a equipe que dominou todas as zonas (a partida termina na hora).
    await query('ALTER TABLE zonaConquistaPartidaTime ADD COLUMN IF NOT EXISTS vencedorTimeId varchar(36) NULL');

    await query(`
      CREATE TABLE IF NOT EXISTS zonaConquistaTempoTime (
        id varchar(36) PRIMARY KEY,
        partidaId varchar(36) NOT NULL,
        empresaId varchar(36) NOT NULL,
        eventoId varchar(36) NOT NULL,
        timeId varchar(36) NOT NULL,
        status varchar(20) NOT NULL DEFAULT 'active',
        zonasDominadas integer NOT NULL DEFAULT 0,
        checkpointsLidos integer NOT NULL DEFAULT 0,
        pontosTotais numeric(10, 2) NOT NULL DEFAULT 0,
        iniciadoEm timestamptz NULL,
        concluidoEm timestamptz NULL,
        duracaoMs integer NULL,
        criadoEm timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        atualizadoEm timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS zonaConquistaLeituraTime (
        id varchar(36) PRIMARY KEY,
        partidaId varchar(36) NOT NULL,
        empresaId varchar(36) NOT NULL,
        eventoId varchar(36) NOT NULL,
        brincadeiraId varchar(36) NOT NULL,
        numeroRonda integer NOT NULL,
        checkpointId varchar(36) NOT NULL,
        criancaId varchar(36) NOT NULL,
        timeId varchar(36) NOT NULL,
        uid varchar(255),
        leituraId varchar(36),
        pontosAtribuidos numeric(10, 2) NOT NULL DEFAULT 0,
        lidoEm timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        criadoEm timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ========================================================================
    // ZONE CONQUEST INDIVIDUAL (baseado em Monster Hunt com versionning)
    // ========================================================================

    await query(`
      CREATE TABLE IF NOT EXISTS zonaConquistaPartidaIndividual (
        id varchar(36) PRIMARY KEY,
        empresaId varchar(36) NOT NULL,
        eventoId varchar(36) NOT NULL,
        brincadeiraId varchar(36) NOT NULL,
        status varchar(20) NOT NULL DEFAULT 'active',
        versao integer NOT NULL DEFAULT 0,
        iniciadoEm timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        finalizadoEm timestamptz NULL,
        criadoEm timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        atualizadoEm timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS zonaConquistaEstadoParticipanteIndividual (
        id varchar(36) PRIMARY KEY,
        partidaId varchar(36) NOT NULL,
        empresaId varchar(36) NOT NULL,
        eventoId varchar(36) NOT NULL,
        criancaId varchar(36) NOT NULL,
        status varchar(20) NOT NULL DEFAULT 'active',
        checkpointsLidos integer NOT NULL DEFAULT 0,
        pontosTotais numeric(10, 2) NOT NULL DEFAULT 0,
        ranking integer NULL,
        versao integer NOT NULL DEFAULT 0,
        iniciadoEm timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        finalizadoEm timestamptz NULL,
        criadoEm timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        atualizadoEm timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS zonaConquistaLeituraIndividual (
        id varchar(36) PRIMARY KEY,
        partidaId varchar(36) NOT NULL,
        empresaId varchar(36) NOT NULL,
        eventoId varchar(36) NOT NULL,
        brincadeiraId varchar(36) NOT NULL,
        checkpointId varchar(36) NOT NULL,
        criancaId varchar(36) NOT NULL,
        uid varchar(255),
        leituraId varchar(36),
        pontosAtribuidos numeric(10, 2) NOT NULL DEFAULT 0,
        versao integer NOT NULL DEFAULT 0,
        lidoEm timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        criadoEm timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS zonaConquistaProtecaoCheckpointIndividual (
        id varchar(36) PRIMARY KEY,
        partidaId varchar(36) NOT NULL,
        checkpointId varchar(36) NOT NULL,
        criancaId varchar(36) NOT NULL,
        protegidoAte timestamptz NOT NULL,
        criadoEm timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ========================================================================
    // ÍNDICES
    // ========================================================================

    // TEAM indices
    await query('CREATE INDEX IF NOT EXISTS idx_zone_team_partidas_evento ON zonaConquistaPartidaTime (eventoId, status)');
    await query('CREATE INDEX IF NOT EXISTS idx_zone_team_tempos_partida ON zonaConquistaTempoTime (partidaId, timeId)');
    await createReadingIndex('uq_zone_team_scan_reading', 'zonaConquistaLeituraTime');
    await query('CREATE INDEX IF NOT EXISTS idx_zone_team_scans_partida ON zonaConquistaLeituraTime (partidaId, numeroRonda)');

    // INDIVIDUAL indices
    await query('CREATE INDEX IF NOT EXISTS idx_zone_individual_partidas_evento ON zonaConquistaPartidaIndividual (eventoId, status)');
    await query('CREATE INDEX IF NOT EXISTS idx_zone_individual_states_partida ON zonaConquistaEstadoParticipanteIndividual (partidaId, criancaId)');
    await createReadingIndex('uq_zone_individual_scan_reading', 'zonaConquistaLeituraIndividual');
    await query('CREATE INDEX IF NOT EXISTS idx_zone_individual_scans_partida ON zonaConquistaLeituraIndividual (partidaId, criancaId)');
    await query('CREATE INDEX IF NOT EXISTS idx_zone_individual_protection_checkpoint ON zonaConquistaProtecaoCheckpointIndividual (checkpointId, protegidoAte)');

    // ========================================================================
    // CHECKPOINT & ZONE STATE TRACKING (novo para ambos os modos)
    // ========================================================================

    await query(`
      CREATE TABLE IF NOT EXISTS zonaConquistaEstadoCheckpoint (
        id varchar(36) PRIMARY KEY,
        partidaId varchar(36) NOT NULL,
        empresaId varchar(36) NOT NULL,
        eventoId varchar(36) NOT NULL,
        checkpointId varchar(36) NOT NULL,
        donoAtualId varchar(36) NULL,
        tipoDono varchar(20) NOT NULL DEFAULT 'team',
        protegidoAte timestamptz NULL,
        ultimoConquistadoEm timestamptz NULL,
        totalConquistas integer NOT NULL DEFAULT 0,
        criadoEm timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        atualizadoEm timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS zonaConquistaEstadoZona (
        id varchar(36) PRIMARY KEY,
        partidaId varchar(36) NOT NULL,
        empresaId varchar(36) NOT NULL,
        eventoId varchar(36) NOT NULL,
        zonaId varchar(36) NOT NULL,
        donoAtualId varchar(36) NULL,
        tipoDono varchar(20) NOT NULL DEFAULT 'team',
        disputada boolean NOT NULL DEFAULT false,
        totalCheckpoints integer NOT NULL DEFAULT 0,
        checkpointsConquistados integer NOT NULL DEFAULT 0,
        ultimaAtualizacaoEm timestamptz NULL,
        criadoEm timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        atualizadoEm timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // STATE TRACKING indices
    await query('CREATE INDEX IF NOT EXISTS idx_zone_checkpoint_state_partida ON zonaConquistaEstadoCheckpoint (partidaId, checkpointId)');
    await query('CREATE INDEX IF NOT EXISTS idx_zone_checkpoint_state_owner ON zonaConquistaEstadoCheckpoint (partidaId, donoAtualId)');
    await query('CREATE INDEX IF NOT EXISTS idx_zone_zone_state_partida ON zonaConquistaEstadoZona (partidaId, zonaId)');
    await query('CREATE INDEX IF NOT EXISTS idx_zone_zone_state_owner ON zonaConquistaEstadoZona (partidaId, donoAtualId)');

    return;
  }

  // ========================================================================
  // SQL SERVER
  // ========================================================================

  // ZONE CONQUEST TEAM
  await query(`
    IF OBJECT_ID('dbo.zone_conquest_team_partidas', 'U') IS NULL
    BEGIN
      CREATE TABLE zone_conquest_team_partidas (
        id NVARCHAR(36) NOT NULL PRIMARY KEY,
        empresaId NVARCHAR(36) NOT NULL,
        eventoId NVARCHAR(36) NOT NULL,
        brincadeiraId NVARCHAR(36) NOT NULL,
        status NVARCHAR(20) NOT NULL DEFAULT 'active',
        numeroRonda INT NOT NULL DEFAULT 1,
        timeAtualId NVARCHAR(36) NULL,
        iniciadoEm DATETIME2 NOT NULL DEFAULT GETDATE(),
        finalizadoEm DATETIME2 NULL,
        created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        updated_at DATETIME2 NOT NULL DEFAULT GETDATE()
      )
    END
  `);

  await query(`
    IF OBJECT_ID('dbo.zone_conquest_team_tempos', 'U') IS NULL
    BEGIN
      CREATE TABLE zone_conquest_team_tempos (
        id NVARCHAR(36) NOT NULL PRIMARY KEY,
        partidaId NVARCHAR(36) NOT NULL,
        empresaId NVARCHAR(36) NOT NULL,
        eventoId NVARCHAR(36) NOT NULL,
        timeId NVARCHAR(36) NOT NULL,
        status NVARCHAR(20) NOT NULL DEFAULT 'active',
        zonasDominadas INT NOT NULL DEFAULT 0,
        checkpointsLidos INT NOT NULL DEFAULT 0,
        pontosTotais NUMERIC(10, 2) NOT NULL DEFAULT 0,
        iniciadoEm DATETIME2 NULL,
        concluidoEm DATETIME2 NULL,
        duracaoMs INT NULL,
        created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        updated_at DATETIME2 NOT NULL DEFAULT GETDATE()
      )
    END
  `);

  await query(`
    IF OBJECT_ID('dbo.zone_conquest_team_scans', 'U') IS NULL
    BEGIN
      CREATE TABLE zone_conquest_team_scans (
        id NVARCHAR(36) NOT NULL PRIMARY KEY,
        partidaId NVARCHAR(36) NOT NULL,
        empresaId NVARCHAR(36) NOT NULL,
        eventoId NVARCHAR(36) NOT NULL,
        brincadeiraId NVARCHAR(36) NOT NULL,
        numeroRonda INT NOT NULL,
        checkpointId NVARCHAR(36) NOT NULL,
        criancaId NVARCHAR(36) NOT NULL,
        timeId NVARCHAR(36) NOT NULL,
        uid NVARCHAR(255) NULL,
        leitura_id NVARCHAR(36) NULL,
        points_awarded NUMERIC(10, 2) NOT NULL DEFAULT 0,
        scanned_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        created_at DATETIME2 NOT NULL DEFAULT GETDATE()
      )
    END
  `);

  // ZONE CONQUEST INDIVIDUAL
  await query(`
    IF OBJECT_ID('dbo.zone_conquest_individual_partidas', 'U') IS NULL
    BEGIN
      CREATE TABLE zone_conquest_individual_partidas (
        id NVARCHAR(36) NOT NULL PRIMARY KEY,
        empresaId NVARCHAR(36) NOT NULL,
        eventoId NVARCHAR(36) NOT NULL,
        brincadeiraId NVARCHAR(36) NOT NULL,
        status NVARCHAR(20) NOT NULL DEFAULT 'active',
        version INT NOT NULL DEFAULT 0,
        iniciadoEm DATETIME2 NOT NULL DEFAULT GETDATE(),
        finalizadoEm DATETIME2 NULL,
        created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        updated_at DATETIME2 NOT NULL DEFAULT GETDATE()
      )
    END
  `);

  await query(`
    IF OBJECT_ID('dbo.zone_conquest_individual_participant_states', 'U') IS NULL
    BEGIN
      CREATE TABLE zone_conquest_individual_participant_states (
        id NVARCHAR(36) NOT NULL PRIMARY KEY,
        partidaId NVARCHAR(36) NOT NULL,
        empresaId NVARCHAR(36) NOT NULL,
        eventoId NVARCHAR(36) NOT NULL,
        criancaId NVARCHAR(36) NOT NULL,
        status NVARCHAR(20) NOT NULL DEFAULT 'active',
        checkpointsLidos INT NOT NULL DEFAULT 0,
        pontosTotais NUMERIC(10, 2) NOT NULL DEFAULT 0,
        ranking INT NULL,
        version INT NOT NULL DEFAULT 0,
        iniciadoEm DATETIME2 NOT NULL DEFAULT GETDATE(),
        finalizadoEm DATETIME2 NULL,
        created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        updated_at DATETIME2 NOT NULL DEFAULT GETDATE()
      )
    END
  `);

  await query(`
    IF OBJECT_ID('dbo.zone_conquest_individual_scans', 'U') IS NULL
    BEGIN
      CREATE TABLE zone_conquest_individual_scans (
        id NVARCHAR(36) NOT NULL PRIMARY KEY,
        partidaId NVARCHAR(36) NOT NULL,
        empresaId NVARCHAR(36) NOT NULL,
        eventoId NVARCHAR(36) NOT NULL,
        brincadeiraId NVARCHAR(36) NOT NULL,
        checkpointId NVARCHAR(36) NOT NULL,
        criancaId NVARCHAR(36) NOT NULL,
        uid NVARCHAR(255) NULL,
        leitura_id NVARCHAR(36) NULL,
        points_awarded NUMERIC(10, 2) NOT NULL DEFAULT 0,
        version INT NOT NULL DEFAULT 0,
        scanned_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        created_at DATETIME2 NOT NULL DEFAULT GETDATE()
      )
    END
  `);

  await query(`
    IF OBJECT_ID('dbo.zone_conquest_individual_checkpoint_protection', 'U') IS NULL
    BEGIN
      CREATE TABLE zone_conquest_individual_checkpoint_protection (
        id NVARCHAR(36) NOT NULL PRIMARY KEY,
        partidaId NVARCHAR(36) NOT NULL,
        checkpointId NVARCHAR(36) NOT NULL,
        criancaId NVARCHAR(36) NOT NULL,
        protection_until DATETIME2 NOT NULL,
        created_at DATETIME2 NOT NULL DEFAULT GETDATE()
      )
    END
  `);

  // ========================================================================
  // SQL SERVER INDICES
  // ========================================================================

  // TEAM indices
  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_zone_team_partidas_evento' AND object_id = OBJECT_ID('dbo.zone_conquest_team_partidas'))
      CREATE INDEX idx_zone_team_partidas_evento ON zone_conquest_team_partidas (eventoId, status)
  `);

  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_zone_team_tempos_partida' AND object_id = OBJECT_ID('dbo.zone_conquest_team_tempos'))
      CREATE INDEX idx_zone_team_tempos_partida ON zone_conquest_team_tempos (partidaId, timeId)
  `);

  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'uq_zone_team_scan_reading' AND object_id = OBJECT_ID('dbo.zone_conquest_team_scans'))
      CREATE UNIQUE INDEX uq_zone_team_scan_reading ON zone_conquest_team_scans (leitura_id) WHERE "leituraId" IS NOT NULL
  `);

  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_zone_team_scans_partida' AND object_id = OBJECT_ID('dbo.zone_conquest_team_scans'))
      CREATE INDEX idx_zone_team_scans_partida ON zone_conquest_team_scans (partidaId, numeroRonda)
  `);

  // INDIVIDUAL indices
  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_zone_individual_partidas_evento' AND object_id = OBJECT_ID('dbo.zone_conquest_individual_partidas'))
      CREATE INDEX idx_zone_individual_partidas_evento ON zone_conquest_individual_partidas (eventoId, status)
  `);

  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_zone_individual_states_partida' AND object_id = OBJECT_ID('dbo.zone_conquest_individual_participant_states'))
      CREATE INDEX idx_zone_individual_states_partida ON zone_conquest_individual_participant_states (partidaId, criancaId)
  `);

  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'uq_zone_individual_scan_reading' AND object_id = OBJECT_ID('dbo.zone_conquest_individual_scans'))
      CREATE UNIQUE INDEX uq_zone_individual_scan_reading ON zone_conquest_individual_scans (leitura_id) WHERE "leituraId" IS NOT NULL
  `);

  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_zone_individual_scans_partida' AND object_id = OBJECT_ID('dbo.zone_conquest_individual_scans'))
      CREATE INDEX idx_zone_individual_scans_partida ON zone_conquest_individual_scans (partidaId, criancaId)
  `);

  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_zone_individual_protection_checkpoint' AND object_id = OBJECT_ID('dbo.zone_conquest_individual_checkpoint_protection'))
      CREATE INDEX idx_zone_individual_protection_checkpoint ON zone_conquest_individual_checkpoint_protection (checkpointId, protection_until)
  `);

  // ========================================================================
  // CHECKPOINT & ZONE STATE TRACKING (novo para ambos os modos)
  // ========================================================================

  await query(`
    IF OBJECT_ID('dbo.zone_conquest_checkpoint_states', 'U') IS NULL
    BEGIN
      CREATE TABLE zone_conquest_checkpoint_states (
        id NVARCHAR(36) NOT NULL PRIMARY KEY,
        partidaId NVARCHAR(36) NOT NULL,
        empresaId NVARCHAR(36) NOT NULL,
        eventoId NVARCHAR(36) NOT NULL,
        checkpointId NVARCHAR(36) NOT NULL,
        donoAtualId NVARCHAR(36) NULL,
        owner_type NVARCHAR(20) NOT NULL DEFAULT 'team',
        protegidoAte DATETIME2 NULL,
        ultimoConquistadoEm DATETIME2 NULL,
        totalConquistas INT NOT NULL DEFAULT 0,
        created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        updated_at DATETIME2 NOT NULL DEFAULT GETDATE()
      )
    END
  `);

  await query(`
    IF OBJECT_ID('dbo.zone_conquest_zone_states', 'U') IS NULL
    BEGIN
      CREATE TABLE zone_conquest_zone_states (
        id NVARCHAR(36) NOT NULL PRIMARY KEY,
        partidaId NVARCHAR(36) NOT NULL,
        empresaId NVARCHAR(36) NOT NULL,
        eventoId NVARCHAR(36) NOT NULL,
        zone_id NVARCHAR(36) NOT NULL,
        donoAtualId NVARCHAR(36) NULL,
        owner_type NVARCHAR(20) NOT NULL DEFAULT 'team',
        disputada BIT NOT NULL DEFAULT 0,
        totalCheckpoints INT NOT NULL DEFAULT 0,
        checkpointsConquistados INT NOT NULL DEFAULT 0,
        ultimaAtualizacaoEm DATETIME2 NULL,
        created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        updated_at DATETIME2 NOT NULL DEFAULT GETDATE()
      )
    END
  `);

  // STATE TRACKING indices
  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_zone_checkpoint_state_partida' AND object_id = OBJECT_ID('dbo.zone_conquest_checkpoint_states'))
      CREATE INDEX idx_zone_checkpoint_state_partida ON zone_conquest_checkpoint_states (partidaId, checkpointId)
  `);

  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_zone_checkpoint_state_owner' AND object_id = OBJECT_ID('dbo.zone_conquest_checkpoint_states'))
      CREATE INDEX idx_zone_checkpoint_state_owner ON zone_conquest_checkpoint_states (partidaId, donoAtualId)
  `);

  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_zone_zone_state_partida' AND object_id = OBJECT_ID('dbo.zone_conquest_zone_states'))
      CREATE INDEX idx_zone_zone_state_partida ON zone_conquest_zone_states (partidaId, zone_id)
  `);

  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_zone_zone_state_owner' AND object_id = OBJECT_ID('dbo.zone_conquest_zone_states'))
      CREATE INDEX idx_zone_zone_state_owner ON zone_conquest_zone_states (partidaId, donoAtualId)
  `);
}

module.exports = { ensureZoneConquestSchema };
