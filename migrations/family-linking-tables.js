/**
 * Migração: Criar tabelas de vinculação familiar (family linking)
 * Permite que pais/responsáveis se vinculem às crianças via QR Code
 */

const { query } = require('../database');

async function up() {
  console.log('📦 Iniciando migração: family-linking-tables...');

  try {
    // Tabela 1: Códigos QR para vinculação
    await query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='family_linking_codes' AND xtype='U')
      BEGIN
        CREATE TABLE [family_linking_codes] (
          [id] UNIQUEIDENTIFIER PRIMARY KEY,
          [crianca_id] UNIQUEIDENTIFIER NOT NULL,
          [evento_id] UNIQUEIDENTIFIER NOT NULL,
          [empresa_id] UNIQUEIDENTIFIER NOT NULL,
          [qr_code_value] VARCHAR(50) NOT NULL UNIQUE,
          [tracking_url] VARCHAR(500) NOT NULL,
          [status] VARCHAR(20) DEFAULT 'active',  -- active, used, expired
          [created_at] DATETIME2 DEFAULT GETDATE(),
          [expires_at] DATETIME2 NOT NULL,
          [used_at] DATETIME2 NULL,
          [used_by_login_id] UNIQUEIDENTIFIER NULL,
          CONSTRAINT FK_flc_crianca FOREIGN KEY (crianca_id) REFERENCES [criancas](id),
          CONSTRAINT FK_flc_evento FOREIGN KEY (evento_id) REFERENCES [eventos](id),
          CONSTRAINT FK_flc_empresa FOREIGN KEY (empresa_id) REFERENCES [empresas](id),
          CONSTRAINT FK_flc_login FOREIGN KEY (used_by_login_id) REFERENCES [logins](id)
        )
        CREATE INDEX idx_flc_qr_code ON [family_linking_codes]([qr_code_value])
        CREATE INDEX idx_flc_status ON [family_linking_codes]([status])
        CREATE INDEX idx_flc_crianca ON [family_linking_codes]([crianca_id])
        PRINT '✅ Tabela family_linking_codes criada'
      END
      ELSE
        PRINT '⏭️ Tabela family_linking_codes já existe'
    `);

    // Tabela 2: Links entre pais/responsáveis e crianças
    await query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='family_child_links' AND xtype='U')
      BEGIN
        CREATE TABLE [family_child_links] (
          [id] UNIQUEIDENTIFIER PRIMARY KEY,
          [family_login_id] UNIQUEIDENTIFIER NOT NULL,
          [crianca_id] UNIQUEIDENTIFIER NOT NULL,
          [empresa_id] UNIQUEIDENTIFIER NOT NULL,
          [relationship] VARCHAR(50) DEFAULT 'parent',  -- parent, guardian, relative
          [status] VARCHAR(20) DEFAULT 'active',  -- active, pending, inactive
          [linked_at] DATETIME2 DEFAULT GETDATE(),
          [unlinked_at] DATETIME2 NULL,
          [notes] VARCHAR(500) NULL,
          CONSTRAINT FK_fcl_login FOREIGN KEY (family_login_id) REFERENCES [logins](id),
          CONSTRAINT FK_fcl_crianca FOREIGN KEY (crianca_id) REFERENCES [criancas](id),
          CONSTRAINT FK_fcl_empresa FOREIGN KEY (empresa_id) REFERENCES [empresas](id),
          CONSTRAINT UQ_fcl_family_child UNIQUE (family_login_id, crianca_id)
        )
        CREATE INDEX idx_fcl_family ON [family_child_links]([family_login_id])
        CREATE INDEX idx_fcl_crianca ON [family_child_links]([crianca_id])
        CREATE INDEX idx_fcl_status ON [family_child_links]([status])
        PRINT '✅ Tabela family_child_links criada'
      END
      ELSE
        PRINT '⏭️ Tabela family_child_links já existe'
    `);

    console.log('✅ Migração concluída com sucesso!');
    return true;

  } catch (error) {
    console.error('❌ Erro na migração:', error.message);
    throw error;
  }
}

async function down() {
  console.log('🔄 Revertendo migração: family-linking-tables...');

  try {
    await query('DROP TABLE IF EXISTS [family_child_links]');
    await query('DROP TABLE IF EXISTS [family_linking_codes]');
    console.log('✅ Migração revertida com sucesso!');
    return true;
  } catch (error) {
    console.error('❌ Erro ao reverter migração:', error.message);
    throw error;
  }
}

module.exports = { up, down };
