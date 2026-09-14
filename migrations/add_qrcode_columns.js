/**
 * Migração: Adicionar coluna qrcode às tabelas criancas e family_child_links
 * Data: 2026-09-14
 */

const { query, DB_DRIVER } = require('../database');

async function up() {
  console.log('🔄 Iniciando migração: Adicionar coluna qrcode...\n');

  try {
    if (DB_DRIVER === 'mssql') {
      // SQL Server
      console.log('  → SQL Server: Adicionando coluna qrcode à tabela criancas...');
      try {
        await query(`ALTER TABLE criancas ADD qrcode VARCHAR(50) NULL;`);
        console.log('  ✅ Coluna qrcode adicionada à tabela criancas');
      } catch (err) {
        if (err.message.includes('already exists') || err.message.includes('coluna já existe')) {
          console.log('  ⚠️  Coluna qrcode já existe em criancas');
        } else {
          throw err;
        }
      }

      console.log('  → SQL Server: Adicionando coluna qrcode à tabela family_child_links...');
      try {
        await query(`ALTER TABLE family_child_links ADD qrcode VARCHAR(50) NULL;`);
        console.log('  ✅ Coluna qrcode adicionada à tabela family_child_links');
      } catch (err) {
        if (err.message.includes('already exists') || err.message.includes('coluna já existe')) {
          console.log('  ⚠️  Coluna qrcode já existe em family_child_links');
        } else {
          throw err;
        }
      }

      console.log('  → SQL Server: Criando índices...');
      try {
        await query(`CREATE INDEX idx_criancas_qrcode ON criancas(qrcode);`);
        console.log('  ✅ Índice criado em criancas.qrcode');
      } catch (err) {
        if (err.message.includes('already exists') || err.message.includes('já existe')) {
          console.log('  ⚠️  Índice já existe em criancas.qrcode');
        } else {
          throw err;
        }
      }

      try {
        await query(`CREATE INDEX idx_family_child_links_qrcode ON family_child_links(qrcode);`);
        console.log('  ✅ Índice criado em family_child_links.qrcode');
      } catch (err) {
        if (err.message.includes('already exists') || err.message.includes('já existe')) {
          console.log('  ⚠️  Índice já existe em family_child_links.qrcode');
        } else {
          throw err;
        }
      }
    } else if (DB_DRIVER === 'postgres' || DB_DRIVER === 'postgresql') {
      // PostgreSQL
      console.log('  → PostgreSQL: Adicionando coluna qrcode à tabela criancas...');
      try {
        await query(`ALTER TABLE criancas ADD COLUMN qrcode VARCHAR(50) NULL;`);
        console.log('  ✅ Coluna qrcode adicionada à tabela criancas');
      } catch (err) {
        if (err.message.includes('already exists') || err.message.includes('já existe')) {
          console.log('  ⚠️  Coluna qrcode já existe em criancas');
        } else {
          throw err;
        }
      }

      console.log('  → PostgreSQL: Adicionando coluna qrcode à tabela family_child_links...');
      try {
        await query(`ALTER TABLE family_child_links ADD COLUMN qrcode VARCHAR(50) NULL;`);
        console.log('  ✅ Coluna qrcode adicionada à tabela family_child_links');
      } catch (err) {
        if (err.message.includes('already exists') || err.message.includes('já existe')) {
          console.log('  ⚠️  Coluna qrcode já existe em family_child_links');
        } else {
          throw err;
        }
      }

      console.log('  → PostgreSQL: Criando índices...');
      try {
        await query(`CREATE INDEX idx_criancas_qrcode ON criancas(qrcode);`);
        console.log('  ✅ Índice criado em criancas.qrcode');
      } catch (err) {
        if (err.message.includes('already exists') || err.message.includes('já existe')) {
          console.log('  ⚠️  Índice já existe em criancas.qrcode');
        } else {
          throw err;
        }
      }

      try {
        await query(`CREATE INDEX idx_family_child_links_qrcode ON family_child_links(qrcode);`);
        console.log('  ✅ Índice criado em family_child_links.qrcode');
      } catch (err) {
        if (err.message.includes('already exists') || err.message.includes('já existe')) {
          console.log('  ⚠️  Índice já existe em family_child_links.qrcode');
        } else {
          throw err;
        }
      }
    }

    console.log('\n✅ Migração concluída com sucesso!');
    return true;
  } catch (err) {
    console.error('\n❌ Erro durante migração:', err.message);
    throw err;
  }
}

async function down() {
  console.log('🔄 Revertendo migração: Remover coluna qrcode...\n');

  try {
    if (DB_DRIVER === 'mssql') {
      console.log('  → SQL Server: Removendo coluna qrcode de criancas...');
      try {
        await query(`ALTER TABLE criancas DROP COLUMN qrcode;`);
        console.log('  ✅ Coluna qrcode removida de criancas');
      } catch (err) {
        console.log('  ⚠️  Erro ao remover:', err.message);
      }

      console.log('  → SQL Server: Removendo coluna qrcode de family_child_links...');
      try {
        await query(`ALTER TABLE family_child_links DROP COLUMN qrcode;`);
        console.log('  ✅ Coluna qrcode removida de family_child_links');
      } catch (err) {
        console.log('  ⚠️  Erro ao remover:', err.message);
      }
    } else if (DB_DRIVER === 'postgres' || DB_DRIVER === 'postgresql') {
      console.log('  → PostgreSQL: Removendo coluna qrcode de criancas...');
      try {
        await query(`ALTER TABLE criancas DROP COLUMN qrcode;`);
        console.log('  ✅ Coluna qrcode removida de criancas');
      } catch (err) {
        console.log('  ⚠️  Erro ao remover:', err.message);
      }

      console.log('  → PostgreSQL: Removendo coluna qrcode de family_child_links...');
      try {
        await query(`ALTER TABLE family_child_links DROP COLUMN qrcode;`);
        console.log('  ✅ Coluna qrcode removida de family_child_links');
      } catch (err) {
        console.log('  ⚠️  Erro ao remover:', err.message);
      }
    }

    console.log('\n✅ Rollback concluído com sucesso!');
    return true;
  } catch (err) {
    console.error('\n❌ Erro durante rollback:', err.message);
    throw err;
  }
}

module.exports = { up, down };
