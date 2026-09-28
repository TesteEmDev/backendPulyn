// migrations/addTerritoryOwnerCriancaId.js - Add territory_owner_crianca_id for INDIVIDUAL mode
const { query } = require('../database');

async function addTerritoryOwnerCriancaIdColumn() {
  try {
    console.log('🔄 [MIGRATION] Adicionando coluna territory_owner_crianca_id...');

    // PostgreSQL - Adicionar coluna se não existir
    await query(`
      ALTER TABLE "checkpoints"
      ADD COLUMN IF NOT EXISTS "territory_owner_crianca_id" varchar(36)
    `);

    console.log('✅ Coluna territory_owner_crianca_id adicionada (ou já existe)');

    // Adicionar foreign key constraint se não existir
    await query(`
      DO $$ BEGIN 
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK__checkpoin__owner_crianca') THEN
          ALTER TABLE "checkpoints" 
          ADD CONSTRAINT "FK__checkpoin__owner_crianca" 
          FOREIGN KEY ("territory_owner_crianca_id") REFERENCES "criancas" ("id");
        END IF; 
      END $$
    `);

    console.log('✅ Foreign key constraint adicionada (ou já existe)');

    return { success: true, message: 'Migration concluída com sucesso' };
  } catch (err) {
    console.error('❌ Erro ao executar migration:', err);
    throw err;
  }
}

module.exports = { addTerritoryOwnerCriancaIdColumn };
