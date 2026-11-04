// migrations/cadastroFamilia.js - telefone do responsável e data de nascimento da criança
//
// login.telefone: número do responsável (com DDD), para o buffet entrar em contato se algo acontecer com a criança.
// perfilCrianca.dataNascimento: data de nascimento; a idade é calculada a partir dela quando existir.
const { query, DB_DRIVER } = require('../database');

async function ensureCadastroFamiliaSchema() {
  const isPostgres = DB_DRIVER === 'postgres' || DB_DRIVER === 'postgresql';
  if (!isPostgres) return;
  await query('ALTER TABLE login ADD COLUMN IF NOT EXISTS telefone varchar(20)');
  await query('ALTER TABLE perfilCrianca ADD COLUMN IF NOT EXISTS dataNascimento date');
}

module.exports = { ensureCadastroFamiliaSchema };
