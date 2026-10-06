// migrations/clienteUnidade.js - Dados da unidade na tabela cliente
//
// A tela de Configurações do admin grava o cadastro do buffet em `cliente` (e não em
// `settings`). Para isso a tabela ganha o vínculo com a empresa e as colunas que faltavam
// (endereço, backup e a logo da unidade).
const { query, DB_DRIVER } = require('../database');

async function ensureClienteUnidadeSchema() {
  const isPostgres = DB_DRIVER === 'postgres' || DB_DRIVER === 'postgresql';
  if (!isPostgres) {
    console.warn('⚠️ Migração clienteUnidade: só implementada para PostgreSQL; adicione empresa_id, address e backup_frequency em cliente manualmente.');
    return;
  }

  await query('ALTER TABLE cliente ADD COLUMN IF NOT EXISTS empresa_id varchar(36)');
  await query('ALTER TABLE cliente ADD COLUMN IF NOT EXISTS address varchar(255)');
  await query("ALTER TABLE cliente ADD COLUMN IF NOT EXISTS backup_frequency varchar(20) DEFAULT 'daily'");
  // Logo/foto da unidade, guardada como data URL (mesmo modelo da planta do evento).
  await query('ALTER TABLE cliente ADD COLUMN IF NOT EXISTS logo_data text');
  await query('ALTER TABLE cliente ADD COLUMN IF NOT EXISTS logo_name varchar(255)');
  await query('ALTER TABLE cliente ADD COLUMN IF NOT EXISTS logo_type varchar(100)');
  // Uma empresa tem no máximo um cadastro em cliente (linhas legadas sem empresa ficam livres).
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_cliente_empresa_id
    ON cliente (empresa_id) WHERE empresa_id IS NOT NULL
  `);
}

module.exports = { ensureClienteUnidadeSchema };
