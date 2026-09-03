const { query, DB_DRIVER } = require('../database');

async function ensureAvatarSchema() {
  const isPostgres = DB_DRIVER === 'postgres' || DB_DRIVER === 'postgresql';

  if (isPostgres) {
    await query('ALTER TABLE criancas ALTER COLUMN avatar TYPE varchar(64)');
    return;
  }

  await query(`
    IF COL_LENGTH('dbo.criancas', 'avatar') IS NOT NULL
    BEGIN
      ALTER TABLE dbo.criancas ALTER COLUMN avatar NVARCHAR(64) NULL
    END
  `);
}

module.exports = { ensureAvatarSchema };
