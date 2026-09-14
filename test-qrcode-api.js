/**
 * Script de teste para os endpoints de QR Code
 */

const http = require('http');

const BASE_URL = 'http://localhost:3000';
const TOKEN = process.env.TEST_TOKEN || 'seu_token_jwt_aqui';
const CRIANCA_ID = process.env.TEST_CRIANCA_ID || '550e8400-e29b-41d4-a716-446655440000';

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const options = {
      hostname: url.hostname,
      port: url.port || 3000,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
    };

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const parsedData = JSON.parse(data);
          resolve({
            statusCode: res.statusCode,
            body: parsedData,
          });
        } catch (err) {
          resolve({
            statusCode: res.statusCode,
            body: data,
          });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runTests() {
  console.log('\n🚀 Iniciando testes de QR Code API\n');

  try {
    // Test 1: Gerar QR Code
    console.log('Test 1: POST /criancas/:crianca_id/generate-qrcode');
    const generateResponse = await makeRequest(
      'POST',
      `/criancas/${CRIANCA_ID}/generate-qrcode`
    );

    if (generateResponse.statusCode === 200) {
      console.log('✅ Sucesso!');
      console.log(`   QR Code: ${generateResponse.body.qrCode}`);
    } else {
      console.log(`❌ Erro (${generateResponse.statusCode}):`, generateResponse.body);
    }

    // Test 2: Obter Imagem
    console.log('\nTest 2: GET /criancas/:crianca_id/qrcode-image');
    const imageResponse = await makeRequest(
      'GET',
      `/criancas/${CRIANCA_ID}/qrcode-image`
    );

    if (imageResponse.statusCode === 200) {
      console.log('✅ Sucesso! Imagem obtida.');
    } else {
      console.log(`❌ Erro (${imageResponse.statusCode})`);
    }

    console.log('\n✅ Testes concluídos!\n');
  } catch (err) {
    console.error(`\n❌ Erro ao executar testes: ${err.message}\n`);
  }
}

runTests();
