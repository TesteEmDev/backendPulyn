// migrations/addTerritoryOwnerCriancaId.js - Add territorioDonosCriancaId for INDIVIDUAL mode
const { query } = require('../database');

async function addTerritoryOwnerCriancaIdColumn() {
  try {
    console.log('🔄 [MIGRATION] Adicionando coluna territorioDonosCriancaId...');

    // PostgreSQL - Adicionar coluna se não existir
    await query(`
      ALTER TABLE "pontoVerificacao"
      ADD COLUMN IF NOT EXISTS "territorioDonosCriancaId" varchar(36)
    `);

    console.log('✅ Coluna territorioDonosCriancaId adicionada (ou já existe)');

    // Adicionar foreign key constraint se não existir
    await query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK__pontoverif__owner_crianca') THEN
          ALTER TABLE "pontoVerificacao"
          ADD CONSTRAINT "FK__pontoverif__owner_crianca"
          FOREIGN KEY ("territorioDonosCriancaId") REFERENCES "crianca" ("criancaId");
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
