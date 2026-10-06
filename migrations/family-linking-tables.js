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
        CREATE TABLE [codigoVinculoFamiliar] (
          [id] UNIQUEIDENTIFIER PRIMARY KEY,
          [criancaId] UNIQUEIDENTIFIER NOT NULL,
          [eventoId] UNIQUEIDENTIFIER NOT NULL,
          [empresaId] UNIQUEIDENTIFIER NOT NULL,
          [valorQrCode] VARCHAR(50) NOT NULL UNIQUE,
          [urlRastreio] VARCHAR(500) NOT NULL,
          [status] VARCHAR(20) DEFAULT 'active',  -- active, used, expired
          [criadoEm] DATETIME2 DEFAULT GETDATE(),
          [expiraEm] DATETIME2 NOT NULL,
          [usadoEm] DATETIME2 NULL,
          [usadoPorLoginId] UNIQUEIDENTIFIER NULL,
          CONSTRAINT FK_flc_crianca FOREIGN KEY (criancaId) REFERENCES [crianca](criancaId),
          CONSTRAINT FK_flc_evento FOREIGN KEY (eventoId) REFERENCES [evento](eventoId),
          CONSTRAINT FK_flc_empresa FOREIGN KEY (empresaId) REFERENCES [empresa](empresaId),
          CONSTRAINT FK_flc_login FOREIGN KEY (usadoPorLoginId) REFERENCES [login](loginId)
        )
        CREATE INDEX idx_flc_qr_code ON [codigoVinculoFamiliar]([valorQrCode])
        CREATE INDEX idx_flc_status ON [codigoVinculoFamiliar]([status])
        CREATE INDEX idx_flc_crianca ON [codigoVinculoFamiliar]([criancaId])
        PRINT '✅ Tabela family_linking_codes criada'
      END
      ELSE
        PRINT '⏭️ Tabela family_linking_codes já existe'
    `);

    // Tabela 2: Links entre pais/responsáveis e crianças
    await query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='family_child_links' AND xtype='U')
      BEGIN
        CREATE TABLE [vinculoFamiliar] (
          [vinculoId] UNIQUEIDENTIFIER PRIMARY KEY,
          [family_login_id] UNIQUEIDENTIFIER NOT NULL,
          [criancaId] UNIQUEIDENTIFIER NOT NULL,
          [empresaId] UNIQUEIDENTIFIER NOT NULL,
          [relacionamento] VARCHAR(50) DEFAULT 'parent',  -- parent, guardian, relative
          [status] VARCHAR(20) DEFAULT 'active',  -- active, pending, inactive
          [linked_at] DATETIME2 DEFAULT GETDATE(),
          [unlinked_at] DATETIME2 NULL,
          [notes] VARCHAR(500) NULL,
          CONSTRAINT FK_fcl_login FOREIGN KEY (family_login_id) REFERENCES [login](loginId),
          CONSTRAINT FK_fcl_crianca FOREIGN KEY (criancaId) REFERENCES [crianca](criancaId),
          CONSTRAINT FK_fcl_empresa FOREIGN KEY (empresaId) REFERENCES [empresa](empresaId),
          CONSTRAINT UQ_fcl_family_child UNIQUE (family_login_id, criancaId)
        )
        CREATE INDEX idx_fcl_family ON [vinculoFamiliar]([family_login_id])
        CREATE INDEX idx_fcl_crianca ON [vinculoFamiliar]([criancaId])
        CREATE INDEX idx_fcl_status ON [vinculoFamiliar]([status])
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
    await query('DROP TABLE IF EXISTS [vinculoFamiliar]');
    await query('DROP TABLE IF EXISTS [codigoVinculoFamiliar]');
    console.log('✅ Migração revertida com sucesso!');
    return true;
  } catch (error) {
    console.error('❌ Erro ao reverter migração:', error.message);
    throw error;
  }
}

module.exports = { up, down };
