/**
 * Script de Teste: Family Linking via QR Code
 * Testa todo o fluxo: geração → validação → listagem → performance
 */

const http = require('http');

const API_URL = 'http://localhost:3001';
const RECEPTION_EMAIL = 'reception@buffet.com';
const RECEPTION_PASS = 'senha123';
const FAMILY_EMAIL = 'pai@email.com';
const FAMILY_PASS = 'senha123';

let receptionToken = null;
let familyToken = null;
let qrCode = null;
let childId = null;
let eventId = null;

// ============ HELPERS ============

function makeRequest(method, path, data = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, data: parsed });
        } catch {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

// ============ TESTES ============

async function test(name, fn) {
  try {
    console.log(`\n📝 ${name}...`);
    await fn();
    console.log(`✅ ${name} - OK`);
    return true;
  } catch (error) {
    console.error(`❌ ${name} - ERRO: ${error.message}`);
    return false;
  }
}

async function run() {
  console.log('\n🚀 Iniciando testes de Family Linking...\n');

  let passed = 0;
  let failed = 0;

  // 1. Buscar dados necessários
  if (await test('Buscar uma criança de teste', async () => {
    const res = await makeRequest('GET', '/api/criancas');
    if (res.status !== 200 || !res.data.criancas || res.data.criancas.length === 0) {
      throw new Error('Nenhuma criança encontrada');
    }
    const crianca = res.data.criancas[0];
    childId = crianca.id;
    eventId = crianca.evento_id;
    console.log(`   Criança: ${crianca.nickname} (${childId})`);
    console.log(`   Evento: ${eventId}`);
  })) passed++; else failed++;

  // 2. Login como recepcionista
  if (await test('Login como Recepcionista', async () => {
    const res = await makeRequest('POST', '/api/auth/login', {
      email: RECEPTION_EMAIL,
      password: RECEPTION_PASS,
    });
    if (res.status !== 200 || !res.data.token) {
      throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
    }
    receptionToken = res.data.token;
    console.log(`   Token: ${receptionToken.substring(0, 20)}...`);
  })) passed++; else failed++;

  // 3. Gerar QR Code
  if (await test('Gerar QR Code', async () => {
    const res = await makeRequest(
      'POST',
      '/api/family/qrcode/generate',
      {
        criancaId: childId,
        eventoId: eventId,
      },
      receptionToken
    );
    if (res.status !== 200 || !res.data.qrCode) {
      throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
    }
    qrCode = res.data.qrCode;
    console.log(`   Código: ${qrCode}`);
    console.log(`   Criança: ${res.data.crianca.nickname}`);
    console.log(`   Imagem: ${res.data.qrCodeImage.substring(0, 50)}...`);
  })) passed++; else failed++;

  // 4. Login como Pais
  if (await test('Login como Pais/Responsável', async () => {
    const res = await makeRequest('POST', '/api/auth/login', {
      email: FAMILY_EMAIL,
      password: FAMILY_PASS,
    });
    if (res.status !== 200 || !res.data.token) {
      throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
    }
    familyToken = res.data.token;
    console.log(`   Token: ${familyToken.substring(0, 20)}...`);
  })) passed++; else failed++;

  // 5. Validar QR Code
  if (await test('Validar QR Code (Vincular Criança)', async () => {
    const res = await makeRequest(
      'POST',
      '/api/family/qrcode/validate',
      { qrCodeValue: qrCode },
      familyToken
    );
    if (res.status !== 200 || !res.data.success) {
      throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
    }
    console.log(`   Sucesso! Criança vinculada: ${res.data.linkedChild.nickname}`);
  })) passed++; else failed++;

  // 6. Tentar validar mesmo QR Code novamente (deve falhar)
  if (await test('Validar QR Code Novamente (Deve Falhar)', async () => {
    const res = await makeRequest(
      'POST',
      '/api/family/qrcode/validate',
      { qrCodeValue: qrCode },
      familyToken
    );
    if (res.status === 400 && res.data.code === 'ALREADY_LINKED') {
      console.log(`   ✓ Erro esperado: ${res.data.error}`);
    } else {
      throw new Error(`Status ${res.status}: Comportamento inesperado`);
    }
  })) passed++; else failed++;

  // 7. Listar crianças vinculadas
  if (await test('Listar Crianças Vinculadas', async () => {
    const res = await makeRequest(
      'GET',
      '/api/family/children',
      null,
      familyToken
    );
    if (res.status !== 200 || !Array.isArray(res.data.children)) {
      throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
    }
    console.log(`   Total de crianças: ${res.data.children.length}`);
    if (res.data.children.length > 0) {
      res.data.children.forEach((child, i) => {
        console.log(`   [${i + 1}] ${child.nickname} (${child.age} anos) - Time: ${child.time_name}`);
      });
    }
  })) passed++; else failed++;

  // 8. Buscar performance de criança
  if (await test('Buscar Performance de Criança', async () => {
    const res = await makeRequest(
      'GET',
      `/api/family/children/${childId}/performance`,
      null,
      familyToken
    );
    if (res.status !== 200 || !res.data.crianca) {
      throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
    }
    console.log(`   Nome: ${res.data.crianca.nickname}`);
    console.log(`   Pontuação Total: ${res.data.crianca.totalScore}`);
    console.log(`   Time: ${res.data.crianca.team.name}`);
    console.log(`   Histórico: ${res.data.scoreHistory.length} registros`);
  })) passed++; else failed++;

  // 9. Desvinc ular criança
  if (await test('Desvinc ular Criança', async () => {
    const res = await makeRequest(
      'DELETE',
      `/api/family/children/${childId}/unlink`,
      null,
      familyToken
    );
    if (res.status !== 200 || !res.data.success) {
      throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
    }
    console.log(`   Sucesso! ${res.data.message}`);
  })) passed++; else failed++;

  // 10. Verificar que criança foi removida
  if (await test('Verificar Criança Removida', async () => {
    const res = await makeRequest(
      'GET',
      '/api/family/children',
      null,
      familyToken
    );
    if (res.status !== 200) {
      throw new Error(`Status ${res.status}`);
    }
    const ainda = res.data.children.find(c => c.crianca_id === childId);
    if (ainda) {
      throw new Error('Criança ainda aparece na lista!');
    }
    console.log(`   ✓ Criança removida da lista`);
  })) passed++; else failed++;

  // ============ RESUMO ============

  console.log(`\n${'='.repeat(50)}`);
  console.log(`📊 RESULTADO: ${passed} ✅ / ${failed} ❌`);
  console.log(`${'='.repeat(50)}\n`);

  if (failed === 0) {
    console.log('🎉 TODOS OS TESTES PASSARAM!\n');
    process.exit(0);
  } else {
    console.log(`⚠️  ${failed} teste(s) falharam\n`);
    process.exit(1);
  }
}

// Executar
run().catch((error) => {
  console.error('❌ Erro geral:', error);
  process.exit(1);
});
