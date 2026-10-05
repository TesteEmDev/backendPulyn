// migrations/settingsPerCompany.js - Configurações por empresa (buffet)
//
// A tabela settings nasceu com UNIQUE(setting_key) global: só podia existir uma linha
// por chave no sistema inteiro. Como cada buffet tem suas próprias configurações, a
// unicidade passa a ser por (empresa_id, setting_key). As linhas antigas, sem empresa,
// ficam como estão (são o seed original e deixam de ser lidas/alteradas pelas rotas).
const { query, allQuery, DB_DRIVER } = require('../database');

async function ensureSettingsPerCompanySchema() {
  const isPostgres = DB_DRIVER === 'postgres' || DB_DRIVER === 'postgresql';
  if (!isPostgres) {
    console.warn('⚠️ Migração settingsPerCompany: só implementada para PostgreSQL; ajuste o índice único de settings manualmente.');
    return;
  }

  await query('ALTER TABLE settings ADD COLUMN IF NOT EXISTS empresa_id text');

  // Remove a unicidade antiga, só de setting_key, qualquer que seja o nome da constraint.
  const oldConstraints = await allQuery(`
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'settings'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) = 'UNIQUE (setting_key)'
  `);
  for (const { conname } of oldConstraints) {
    await query(`ALTER TABLE settings DROP CONSTRAINT "${conname}"`);
    console.log(`✅ settings: constraint ${conname} (setting_key único global) removida`);
  }

  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_settings_empresa_key
    ON settings ((COALESCE(empresa_id, '')), setting_key)
  `);
}

module.exports = { ensureSettingsPerCompanySchema };
