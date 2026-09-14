/**
 * Script para verificar e criar colunas qrcode
 */

const { connectDB, query, closeDB } = require('./database');

async function checkColumns() {
  try {
    console.log('🔍 Verificando colunas qrcode no banco de dados...\n');

    await connectDB();

    // Verificar coluna criancas.qrcode
    console.log('📋 Verificando tabela "criancas"...');
    const criancasResult = await query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'criancas' AND column_name = 'qrcode'
      ) as exists;
    `);
    
    const criancasHasQR = criancasResult.recordset[0].exists;
    if (criancasHasQR) {
      console.log('✅ Coluna "qrcode" existe em "criancas"\n');
    } else {
      console.log('❌ Coluna "qrcode" NÃO existe em "criancas"');
      console.log('   Executando migração...\n');
      
      try {
        await query(`ALTER TABLE criancas ADD COLUMN qrcode VARCHAR(50) NULL;`);
        console.log('✅ Coluna "qrcode" adicionada a "criancas"\n');
      } catch (err) {
        console.error('❌ Erro ao adicionar coluna:', err.message, '\n');
      }
    }

    // Verificar coluna family_child_links.qrcode
    console.log('📋 Verificando tabela "family_child_links"...');
    const familyResult = await query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'family_child_links' AND column_name = 'qrcode'
      ) as exists;
    `);
    
    const familyHasQR = familyResult.recordset[0].exists;
    if (familyHasQR) {
      console.log('✅ Coluna "qrcode" existe em "family_child_links"\n');
    } else {
      console.log('❌ Coluna "qrcode" NÃO existe em "family_child_links"');
      console.log('   Executando migração...\n');
      
      try {
        await query(`ALTER TABLE family_child_links ADD COLUMN qrcode VARCHAR(50) NULL;`);
        console.log('✅ Coluna "qrcode" adicionada a "family_child_links"\n');
      } catch (err) {
        console.error('❌ Erro ao adicionar coluna:', err.message, '\n');
      }
    }

    console.log('✅ Verificação concluída!');
    console.log('\nAgora você pode usar os endpoints de QR Code:');
    console.log('  POST   /criancas/:crianca_id/generate-qrcode');
    console.log('  GET    /criancas/:crianca_id/qrcode-image');
    console.log('  POST   /criancas/eventos/:evento_id/generate-qrcodes-batch');

  } catch (err) {
    console.error('❌ Erro:', err.message);
  } finally {
    await closeDB();
  }
}

checkColumns();
