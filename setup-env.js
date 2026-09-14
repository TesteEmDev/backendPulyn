#!/usr/bin/env node

/**
 * Script para configurar arquivo .env.local baseado em .env.example
 * Uso: node setup-env.js
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ENV_EXAMPLE = path.join(__dirname, '.env.example');
const ENV_LOCAL = path.join(__dirname, '.env.local');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise(resolve => {
    rl.question(prompt, resolve);
  });
}

async function setupEnv() {
  console.log('\n🚀 Configurador de Ambiente - Pulyn Backend\n');

  // Verificar se arquivo já existe
  if (fs.existsSync(ENV_LOCAL)) {
    const overwrite = await question('❓ .env.local já existe. Deseja sobrescrever? (s/n): ');
    if (overwrite.toLowerCase() !== 's') {
      console.log('❌ Operação cancelada.');
      rl.close();
      return;
    }
  }

  console.log('\n📋 Escolha seu banco de dados:\n');
  console.log('1) PostgreSQL/Supabase (recomendado)');
  console.log('2) SQL Server Local\n');

  const dbChoice = await question('Opção (1 ou 2): ');

  let envContent = '';

  if (dbChoice === '1') {
    console.log('\n🔐 PostgreSQL/Supabase\n');
    
    const dbUrl = await question('📍 DATABASE_URL: ');
    const jwtSecret = await question('🔑 JWT_SECRET (deixe em branco para gerar): ');
    const frontendUrl = await question('🌐 FRONTEND_URL (default: http://localhost:5173): ') || 'http://localhost:5173';

    const jwt = jwtSecret || require('crypto').randomBytes(32).toString('hex');

    envContent = `# ⚠️ ARQUIVO DE DESENVOLVIMENTO LOCAL
# Nunca fazer commit de credenciais reais!

NODE_ENV=development
PORT=3001
JWT_SECRET=${jwt}

DB_DRIVER=postgres
DATABASE_URL=${dbUrl}
DB_TIMEOUT=30000

FRONTEND_URL=${frontendUrl}
`;

    console.log('\n✅ JWT_SECRET gerado:', jwt);

  } else if (dbChoice === '2') {
    console.log('\n🏠 SQL Server Local\n');

    const server = await question('🖥️  DB_SERVER (default: localhost): ') || 'localhost';
    const dbName = await question('📦 DB_NAME (default: PulynDB): ') || 'PulynDB';
    const dbUser = await question('👤 DB_USER (default: sa): ') || 'sa';
    const dbPassword = await question('🔒 DB_PASSWORD (default: 123456): ') || '123456';
    const jwtSecret = await question('🔑 JWT_SECRET (deixe em branco para gerar): ');
    const frontendUrl = await question('🌐 FRONTEND_URL (default: http://localhost:5173): ') || 'http://localhost:5173';

    const jwt = jwtSecret || require('crypto').randomBytes(32).toString('hex');

    envContent = `# ⚠️ ARQUIVO DE DESENVOLVIMENTO LOCAL
# Nunca fazer commit de credenciais reais!

NODE_ENV=development
PORT=3001
JWT_SECRET=${jwt}

DB_DRIVER=sqlserver
DB_SERVER=${server}
DB_NAME=${dbName}
DB_USER=${dbUser}
DB_PASSWORD=${dbPassword}
DB_TIMEOUT=30000

FRONTEND_URL=${frontendUrl}
`;

    console.log('\n✅ JWT_SECRET gerado:', jwt);

  } else {
    console.log('❌ Opção inválida.');
    rl.close();
    return;
  }

  // Salvar arquivo
  fs.writeFileSync(ENV_LOCAL, envContent);
  console.log('\n✅ Arquivo .env.local criado com sucesso!\n');
  console.log('📂 Localização:', ENV_LOCAL);
  console.log('\n🚀 Próximos passos:');
  console.log('   1. npm install');
  console.log('   2. npm run test-' + (dbChoice === '1' ? 'postgres' : 'connection'));
  console.log('   3. npm run dev\n');

  rl.close();
}

setupEnv().catch(err => {
  console.error('❌ Erro:', err);
  rl.close();
  process.exit(1);
});
