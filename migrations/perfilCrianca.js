// migrations/perfilCrianca.js - Cadastro permanente da criança
//
// Antes, cada evento criava uma criança nova (crianca = uma linha por evento). Agora existe o perfil da criança,
// salvo uma vez só (nome, apelido, idade, avatar) e que só guarda uma referência ao ÚLTIMO evento em que ela esteve.
// A linha de `crianca` continua sendo a participação dela naquele evento (time, pulseira e pontos do evento) e passa a
// apontar para o perfil em crianca.perfilCriancaId. Os pontos totais são a soma das participações (nunca ficam
// guardados à parte, para não sair de sincronia com as dezenas de lugares que somam pontos).
const { query, queryOne, DB_DRIVER } = require('../database');

async function ensurePerfilCriancaSchema() {
  const isPostgres = DB_DRIVER === 'postgres' || DB_DRIVER === 'postgresql';

  if (isPostgres) {
    await query(`
      CREATE TABLE IF NOT EXISTS perfilCrianca (
        perfilCriancaId varchar(36) PRIMARY KEY,
        empresaId varchar(36) NOT NULL,
        nome varchar(100) NOT NULL,
        apelido varchar(100),
        idade integer,
        avatar varchar(100),
        ultimoEventoId varchar(36) REFERENCES evento(eventoId) ON DELETE SET NULL,
        criadoEm timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        atualizadoEm timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await query('CREATE INDEX IF NOT EXISTS idx_perfilcrianca_empresa ON perfilCrianca (empresaId)');
    await query('ALTER TABLE crianca ADD COLUMN IF NOT EXISTS perfilCriancaId varchar(36) REFERENCES perfilCrianca(perfilCriancaId) ON DELETE SET NULL');
    await query('CREATE INDEX IF NOT EXISTS idx_crianca_perfil ON crianca (perfilCriancaId)');
  } else {
    await query(`
      IF OBJECT_ID('dbo.perfilCrianca', 'U') IS NULL
      BEGIN
        CREATE TABLE perfilCrianca (
          perfilCriancaId NVARCHAR(36) NOT NULL PRIMARY KEY,
          empresaId NVARCHAR(36) NOT NULL,
          nome NVARCHAR(100) NOT NULL,
          apelido NVARCHAR(100) NULL,
          idade INT NULL,
          avatar NVARCHAR(100) NULL,
          ultimoEventoId NVARCHAR(36) NULL,
          criadoEm DATETIME2 NOT NULL DEFAULT GETDATE(),
          atualizadoEm DATETIME2 NOT NULL DEFAULT GETDATE()
        )
      END
    `);
    const column = await queryOne(`
      SELECT 1 AS found FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'crianca' AND COLUMN_NAME = 'perfilCriancaId'
    `);
    if (!column) await query('ALTER TABLE crianca ADD perfilCriancaId NVARCHAR(36) NULL');
  }

  // Quem já estava cadastrado ganha um perfil próprio (usa o mesmo id da criança, então a migração é repetível).
  // Cadastros antigos de eventos diferentes não têm como ser ligados entre si; cada um vira um perfil.
  await query(`
    INSERT INTO perfilCrianca (perfilCriancaId, empresaId, nome, apelido, idade, avatar, ultimoEventoId)
    SELECT c.criancaId, c.empresaId, c.nome, c.apelido, c.idade, c.avatar, c.eventoId
    FROM crianca c
    WHERE c.perfilCriancaId IS NULL
      AND c.empresaId IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM perfilCrianca p WHERE p.perfilCriancaId = c.criancaId)
  `);
  await query(`
    UPDATE crianca SET perfilCriancaId = criancaId
    WHERE perfilCriancaId IS NULL
      AND EXISTS (SELECT 1 FROM perfilCrianca p WHERE p.perfilCriancaId = crianca.criancaId)
  `);
}

module.exports = { ensurePerfilCriancaSchema };
