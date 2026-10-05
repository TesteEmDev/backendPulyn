// migrations/clienteUnidade.js - Dados da unidade na tabela clientes
//
// A tela de Configurações do admin grava o cadastro do buffet em `clientes` (e não em
// `settings`). Para isso a tabela ganha o vínculo com a empresa e as colunas que faltavam.
const { query, DB_DRIVER } = require('../database');

async function ensureClienteUnidadeSchema() {
  const isPostgres = DB_DRIVER === 'postgres' || DB_DRIVER === 'postgresql';
  if (!isPostgres) {
    console.warn('⚠️ Migração clienteUnidade: só implementada para PostgreSQL; adicione empresa_id, address e backup_frequency em clientes manualmente.');
    return;
  }

  await query('ALTER TABLE clientes ADD COLUMN IF NOT EXISTS empresa_id varchar(36)');
  await query('ALTER TABLE clientes ADD COLUMN IF NOT EXISTS address varchar(255)');
  await query("ALTER TABLE clientes ADD COLUMN IF NOT EXISTS backup_frequency varchar(20) DEFAULT 'daily'");
  // Uma empresa tem no máximo um cadastro em clientes (linhas legadas sem empresa ficam livres).
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_clientes_empresa_id
    ON clientes (empresa_id) WHERE empresa_id IS NOT NULL
  `);
}

module.exports = { ensureClienteUnidadeSchema };
