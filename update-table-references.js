#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Mapa de tabelas: snake_case → camelCase
const tableConversions = {
  'caca_tesouro_partidas': 'cacaTesourPartidas',
  'caca_tesouro_scans': 'cacaTesourScans',
  'caca_tesouro_tempos': 'cacaTesourTempos',
  'checkpoint_tags': 'checkpointTags',
  'crianca_conquistas': 'criancaConquistas',
  'evento_brincadeiras': 'eventoBrincadeiras',
  'support_tickets': 'supportTickets',
  'family_invites': 'familyInvites',
  'family_child_links': 'familyChildLinks',
  'mensagens_display': 'mensagensDisplay',
};

function updateFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf-8');
    let originalContent = content;

    // Substituir referências às tabelas em queries SQL
    Object.entries(tableConversions).forEach(([snakeCase, camelCase]) => {
      // Padrão: "nome_tabela" (em queries)
      const doubleQuotePattern = new RegExp(`"${snakeCase}"`, 'g');
      content = content.replace(doubleQuotePattern, `"${camelCase}"`);

      // Padrão: 'nome_tabela' (em strings)
      const singleQuotePattern = new RegExp(`'${snakeCase}'`, 'g');
      content = content.replace(singleQuotePattern, `'${camelCase}'`);

      // Padrão: nome_tabela (sem quotes)
      const noQuotePattern = new RegExp(`\\b${snakeCase}\\b`, 'g');
      content = content.replace(noQuotePattern, camelCase);
    });

    if (content !== originalContent) {
      fs.writeFileSync(filePath, content, 'utf-8');
      return true;
    }
    return false;
  } catch (error) {
    console.error(`Erro ao processar ${filePath}:`, error.message);
    return false;
  }
}

function findAndUpdateFiles(dir) {
  const files = fs.readdirSync(dir);
  let updated = 0;

  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
      updated += findAndUpdateFiles(filePath);
    } else if (file.endsWith('.js')) {
      if (updateFile(filePath)) {
        console.log(`✅ ${path.relative(process.cwd(), filePath)}`);
        updated++;
      }
    }
  });

  return updated;
}

function main() {
  console.log('🔄 Atualizando referências a tabelas...\n');

  const routesUpdated = findAndUpdateFiles(path.join(__dirname, 'routes'));

  // Atualizar index.js
  console.log('\n📝 Atualizando index.js...');
  const indexUpdated = updateFile(path.join(__dirname, 'index.js')) ? 1 : 0;

  console.log(`\n✅ Atualização completa!`);
  console.log(`   ${routesUpdated} arquivo(s) de rota atualizado(s)`);
  console.log(`   ${indexUpdated} arquivo(s) principal atualizado(s)`);
  console.log(`   Total: ${routesUpdated + indexUpdated} arquivo(s)`);
}

main();
