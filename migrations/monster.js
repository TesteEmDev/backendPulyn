const { query, DB_DRIVER } = require('../database');

async function ensureMonsterHuntSchema() {
  const isPostgres = DB_DRIVER === 'postgres' || DB_DRIVER === 'postgresql';

  if (isPostgres) {
    await query(`
      CREATE TABLE IF NOT EXISTS monsterCacaPartida (
        id varchar(36) PRIMARY KEY,
        empresaId varchar(36) NOT NULL,
        eventoId varchar(36) NOT NULL,
        brincadeiraId varchar(36),
        status varchar(20) NOT NULL DEFAULT 'active',
        vida integer NOT NULL DEFAULT 500,
        vidaMaxima integer NOT NULL DEFAULT 500,
        danoNormal integer NOT NULL DEFAULT 10,
        danoCheckpointEspecial integer NOT NULL DEFAULT 30,
        danoAtaqueEspecial integer NOT NULL DEFAULT 50,
        checkpointEspecialId varchar(36),
        timeVencedorId varchar(36),
        versao integer NOT NULL DEFAULT 0,
        iniciadoEm timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        finalizadoEm timestamptz,
        criadoEm timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS monsterCacaEstadoTime (
        id varchar(36) PRIMARY KEY,
        partidaId varchar(36) NOT NULL,
        empresaId varchar(36) NOT NULL,
        eventoId varchar(36) NOT NULL,
        timeId varchar(36) NOT NULL,
        vida integer NOT NULL DEFAULT 500,
        vidaMaxima integer NOT NULL DEFAULT 500,
        status varchar(20) NOT NULL DEFAULT 'active',
        versao integer NOT NULL DEFAULT 0,
        derrotadoEm timestamptz,
        vitoriaEm timestamptz,
        criadoEm timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await query('CREATE UNIQUE INDEX IF NOT EXISTS uq_monster_hunt_team_state ON monsterCacaEstadoTime (partidaId, timeId)');
    await query('CREATE INDEX IF NOT EXISTS idx_monster_hunt_team_states_evento ON monsterCacaEstadoTime (empresaId, eventoId, partidaId)');
    await query(`
      CREATE TABLE IF NOT EXISTS monsterCacaLeitura (
        id varchar(36) PRIMARY KEY,
        partidaId varchar(36) NOT NULL,
        empresaId varchar(36) NOT NULL,
        eventoId varchar(36) NOT NULL,
        brincadeiraId varchar(36),
        checkpointId varchar(36) NOT NULL,
        criancaId varchar(36) NOT NULL,
        timeId varchar(36),
        uid varchar(255),
        leituraId varchar(36),
        tipoAtaque varchar(30) NOT NULL,
        dano integer NOT NULL DEFAULT 0,
        vidaMonstroApos integer NOT NULL,
        monstroDerrotado boolean NOT NULL DEFAULT false,
        versao integer NOT NULL DEFAULT 0,
        lidoEm timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await query('ALTER TABLE monsterCacaLeitura DROP CONSTRAINT IF EXISTS "UQ_monster_hunt_scan_child"');
    await query('DROP INDEX IF EXISTS uq_monster_hunt_scan_child');
    await query('CREATE INDEX IF NOT EXISTS idx_monster_hunt_scans_checkpoint ON monsterCacaLeitura (partidaId, checkpointId, lidoEm)');
    await query('CREATE UNIQUE INDEX IF NOT EXISTS uq_monster_hunt_scan_reading ON monsterCacaLeitura (leituraId) WHERE leituraId IS NOT NULL');
    await query('CREATE INDEX IF NOT EXISTS idx_monster_hunt_partidas_evento ON monsterCacaPartida (empresaId, eventoId, status)');
    await query('CREATE INDEX IF NOT EXISTS idx_monster_hunt_scans_evento ON monsterCacaLeitura (empresaId, eventoId, partidaId)');
    return;
  }

  await query(`
    IF OBJECT_ID('dbo.monster_hunt_partidas', 'U') IS NULL
    BEGIN
      CREATE TABLE monsterCacaPartida (
        id NVARCHAR(36) NOT NULL PRIMARY KEY,
        empresaId NVARCHAR(36) NOT NULL,
        eventoId NVARCHAR(36) NOT NULL,
        brincadeiraId NVARCHAR(36) NULL,
        status NVARCHAR(20) NOT NULL DEFAULT 'active',
        vida INT NOT NULL DEFAULT 500,
        vidaMaxima INT NOT NULL DEFAULT 500,
        danoNormal INT NOT NULL DEFAULT 10,
        danoCheckpointEspecial INT NOT NULL DEFAULT 30,
        danoAtaqueEspecial INT NOT NULL DEFAULT 50,
        checkpointEspecialId NVARCHAR(36) NULL,
        timeVencedorId NVARCHAR(36) NULL,
        versao INT NOT NULL DEFAULT 0,
        iniciadoEm DATETIME2 NOT NULL DEFAULT GETDATE(),
        finalizadoEm DATETIME2 NULL,
        criadoEm DATETIME2 NOT NULL DEFAULT GETDATE()
      )
    END
  `);
  await query(`
    IF OBJECT_ID('dbo.monster_hunt_team_states', 'U') IS NULL
    BEGIN
      CREATE TABLE monsterCacaEstadoTime (
        id NVARCHAR(36) NOT NULL PRIMARY KEY,
        partidaId NVARCHAR(36) NOT NULL,
        empresaId NVARCHAR(36) NOT NULL,
        eventoId NVARCHAR(36) NOT NULL,
        timeId NVARCHAR(36) NOT NULL,
        vida INT NOT NULL DEFAULT 500,
        vidaMaxima INT NOT NULL DEFAULT 500,
        status NVARCHAR(20) NOT NULL DEFAULT 'active',
        versao INT NOT NULL DEFAULT 0,
        derrotadoEm DATETIME2 NULL,
        vitoriaEm DATETIME2 NULL,
        criadoEm DATETIME2 NOT NULL DEFAULT GETDATE()
      )
    END
  `);
  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'uq_monster_hunt_team_state' AND object_id = OBJECT_ID('dbo.monster_hunt_team_states'))
      CREATE UNIQUE INDEX uq_monster_hunt_team_state ON monsterCacaEstadoTime (partidaId, timeId)
  `);
  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_monster_hunt_team_states_evento' AND object_id = OBJECT_ID('dbo.monster_hunt_team_states'))
      CREATE INDEX idx_monster_hunt_team_states_evento ON monsterCacaEstadoTime (empresaId, eventoId, partidaId)
  `);
  await query(`
    IF OBJECT_ID('dbo.monster_hunt_scans', 'U') IS NULL
    BEGIN
      CREATE TABLE monsterCacaLeitura (
        id NVARCHAR(36) NOT NULL PRIMARY KEY,
        partidaId NVARCHAR(36) NOT NULL,
        empresaId NVARCHAR(36) NOT NULL,
        eventoId NVARCHAR(36) NOT NULL,
        brincadeiraId NVARCHAR(36) NULL,
        checkpointId NVARCHAR(36) NOT NULL,
        criancaId NVARCHAR(36) NOT NULL,
        timeId NVARCHAR(36) NULL,
        uid NVARCHAR(255) NULL,
        leituraId NVARCHAR(36) NULL,
        tipoAtaque NVARCHAR(30) NOT NULL,
        dano INT NOT NULL DEFAULT 0,
        vidaMonstroApos INT NOT NULL,
        monstroDerrotado BIT NOT NULL DEFAULT 0,
        versao INT NOT NULL DEFAULT 0,
        lidoEm DATETIME2 NOT NULL DEFAULT GETDATE()
      )
    END
  `);
  await query(`
    IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'uq_monster_hunt_scan_child' AND parent_object_id = OBJECT_ID('dbo.monster_hunt_scans'))
      ALTER TABLE monsterCacaLeitura DROP CONSTRAINT uq_monster_hunt_scan_child
  `);
  await query(`
    IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'uq_monster_hunt_scan_child' AND object_id = OBJECT_ID('dbo.monster_hunt_scans'))
      DROP INDEX uq_monster_hunt_scan_child ON monsterCacaLeitura
  `);
  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_monster_hunt_scans_checkpoint' AND object_id = OBJECT_ID('dbo.monster_hunt_scans'))
      CREATE INDEX idx_monster_hunt_scans_checkpoint ON monsterCacaLeitura (partidaId, checkpointId, lidoEm)
  `);
  await query(`
    IF EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = 'uq_monster_hunt_scan_reading'
        AND object_id = OBJECT_ID('dbo.monster_hunt_scans')
        AND filter_definition IS NULL
    )
      DROP INDEX uq_monster_hunt_scan_reading ON monsterCacaLeitura
  `);
  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'uq_monster_hunt_scan_reading' AND object_id = OBJECT_ID('dbo.monster_hunt_scans'))
      CREATE UNIQUE INDEX uq_monster_hunt_scan_reading ON monsterCacaLeitura (leituraId) WHERE leituraId IS NOT NULL
  `);
  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_monster_hunt_partidas_evento' AND object_id = OBJECT_ID('dbo.monster_hunt_partidas'))
      CREATE INDEX idx_monster_hunt_partidas_evento ON monsterCacaPartida (empresaId, eventoId, status)
  `);
  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_monster_hunt_scans_evento' AND object_id = OBJECT_ID('dbo.monster_hunt_scans'))
      CREATE INDEX idx_monster_hunt_scans_evento ON monsterCacaLeitura (empresaId, eventoId, partidaId)
  `);
}

module.exports = { ensureMonsterHuntSchema };
