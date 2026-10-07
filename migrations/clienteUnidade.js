// migrations/clienteUnidade.js - Dados da unidade na tabela cliente
//
// A tela de Configurações do admin grava o cadastro do buffet em `cliente` (e não em
// `settings`). Para isso a tabela ganha o vínculo com a empresa e as colunas que faltavam
// (endereço, backup e a logo da unidade).
const { query, DB_DRIVER } = require('../database');

async function ensureClienteUnidadeSchema() {
  const isPostgres = DB_DRIVER === 'postgres' || DB_DRIVER === 'postgresql';
  if (!isPostgres) {
    console.warn('⚠️ Migração clienteUnidade: só implementada para PostgreSQL; adicione empresaId, address e frequenciaBackup em cliente manualmente.');
    return;
  }

  await query('ALTER TABLE cliente ADD COLUMN IF NOT EXISTS empresaId varchar(36)');
  await query('ALTER TABLE cliente ADD COLUMN IF NOT EXISTS endereco varchar(255)');
  await query("ALTER TABLE cliente ADD COLUMN IF NOT EXISTS frequenciaBackup varchar(20) DEFAULT 'daily'");
  // Logo/foto da unidade, guardada como data URL (mesmo modelo da planta do evento).
  await query('ALTER TABLE cliente ADD COLUMN IF NOT EXISTS logoDados text');
  await query('ALTER TABLE cliente ADD COLUMN IF NOT EXISTS logoNome varchar(255)');
  await query('ALTER TABLE cliente ADD COLUMN IF NOT EXISTS logoTipo varchar(100)');
  // Uma empresa tem no máximo um cadastro em cliente (linhas legadas sem empresa ficam livres).
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_cliente_empresa_id
    ON cliente (empresaId) WHERE "empresaId" IS NOT NULL
  `);
}

module.exports = { ensureClienteUnidadeSchema };
