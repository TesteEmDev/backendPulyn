#!/usr/bin/env node
/**
 * Script para iniciar o backend localmente com limpeza automática de porta
 * Usage: node start-local.js
 */

const { spawn } = require('child_process');
const net = require('net');
const os = require('os');

const PORT = Number(process.env.PORT || 3001);
const MAX_WAIT_TIME = 10000; // 10 segundos

/**
 * Verifica se a porta está em uso
 */
function isPortInUse(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(true));
    server.once('listening', () => {
      server.close();
      resolve(false);
    });
    server.listen(port, '0.0.0.0');
  });
}

/**
 * Aguarda a porta ficar livre
 */
async function waitForPortFree(port, maxWait = MAX_WAIT_TIME) {
  const startTime = Date.now();
  while (Date.now() - startTime < maxWait) {
    const inUse = await isPortInUse(port);
    if (!inUse) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return false;
}

/**
 * Mata todos os processos node em Windows
 */
function killNodeProcesses() {
  return new Promise((resolve) => {
    console.log('🔪 Matando processos node anteriores...');
    const platform = os.platform();

    if (platform === 'win32') {
      spawn('taskkill', ['/IM', 'node.exe', '/F'], {
        stdio: 'ignore',
        shell: true
      }).on('exit', () => {
        setTimeout(resolve, 2000); // Aguarda 2s para liberar a porta
      });
    } else {
      spawn('pkill', ['-f', 'node'], {
        stdio: 'ignore'
      }).on('exit', () => {
        setTimeout(resolve, 2000);
      });
    }
  });
}

/**
 * Inicia o backend
 */
function startBackend() {
  console.log(`\n✅ Porta ${PORT} liberada, iniciando backend...\n`);

  const backend = spawn('node', ['index.js'], {
    cwd: __dirname,
    stdio: 'inherit',
    shell: true
  });

  backend.on('exit', (code) => {
    if (code !== 0) {
      console.error(`\n❌ Backend saiu com código ${code}`);
      process.exit(code);
    }
  });

  backend.on('error', (err) => {
    console.error('❌ Erro ao iniciar backend:', err);
    process.exit(1);
  });
}

/**
 * Função principal
 */
async function main() {
  try {
    console.log(`📡 Verificando porta ${PORT}...\n`);

    // Verifica se a porta está em uso
    const inUse = await isPortInUse(PORT);

    if (inUse) {
      console.log(`⚠️  Porta ${PORT} está em uso. Limpando...\n`);
      await killNodeProcesses();

      // Aguarda a porta ficar livre
      console.log(`⏳ Aguardando porta ${PORT} ficar livre...`);
      const freed = await waitForPortFree(PORT);

      if (!freed) {
        console.error(`\n❌ Timeout: A porta ${PORT} continua ocupada após ${MAX_WAIT_TIME}ms`);
        console.error('   Tente:');
        console.error(`   1. Fechar manualmente os processos usando a porta ${PORT}`);
        console.error(`   2. Usar uma porta diferente: PORT=3002 node start-local.js`);
        process.exit(1);
      }
    } else {
      console.log(`✅ Porta ${PORT} livre\n`);
    }

    // Inicia o backend
    startBackend();

  } catch (err) {
    console.error('❌ Erro durante inicialização:', err);
    process.exit(1);
  }
}

main();
