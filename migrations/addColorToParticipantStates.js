// migrations/addColorToParticipantStates.js - Add color field for INDIVIDUAL mode participants
const { query } = require('../database');

async function addColorToParticipantStates() {
  try {
    console.log('🔄 [MIGRATION] Adicionando coluna color aos participant states...');

    // PostgreSQL - Adicionar coluna se não existir
    await query(`
      ALTER TABLE "zonaConquistaEstadoParticipanteIndividual"
      ADD COLUMN IF NOT EXISTS "cor" varchar(50)
    `);

    console.log('✅ Coluna color adicionada (ou já existe)');

    return { success: true, message: 'Migration concluída com sucesso' };
  } catch (err) {
    console.error('❌ Erro ao executar migration:', err);
    throw err;
  }
}

module.exports = { addColorToParticipantStates };
