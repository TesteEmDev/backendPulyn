#!/usr/bin/env node

/**
 * 🎮 Script para configurar jogo ativo no evento "rtrt"
 * 
 * Uso:
 *   node test-setup-game.js
 */

const axios = require('axios');

// ⚙️ Configuração
const API_BASE = 'http://localhost:3001/api';
const ADMIN_EMAIL = 'admin@default.com';
const ADMIN_PASSWORD = 'admin123';
const EVENTO_NAME = 'rtrt';

async function main() {
  try {
    console.log('🎮 === CONFIGURADOR DE JOGO ATIVO ===\n');

    // 1️⃣ Login como admin
    console.log('1️⃣ Realizando login como admin...');
    const loginRes = await axios.post(`${API_BASE}/auth/login`, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });

    const token = loginRes.data.token;
    console.log(`   ✅ Login sucesso! Token: ${token.substring(0, 20)}...\n`);

    // 2️⃣ Buscar evento "rtrt"
    console.log('2️⃣ Buscando evento "rtrt"...');
    const eventsRes = await axios.get(`${API_BASE}/eventos`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const evento = eventsRes.data.find(e => e.name === EVENTO_NAME);
    if (!evento) {
      console.error(`   ❌ Evento "${EVENTO_NAME}" não encontrado!`);
      console.log(`   📋 Eventos disponíveis:`);
      eventsRes.data.forEach(e => console.log(`      - ${e.name} (${e.id})`));
      process.exit(1);
    }

    console.log(`   ✅ Evento encontrado: ${evento.name} (${evento.id})\n`);

    // 3️⃣ Configurar jogo ativo
    console.log('3️⃣ Configurando jogo ativo...');
    const setupRes = await axios.post(
      `${API_BASE}/eventos/${evento.id}/setup-active-game`,
      {},
      { headers: { Authorization: `Bearer ${token}` } }
    );

    console.log(`   ✅ Jogo configurado!`);
    console.log(`   📋 Resultado:\n`);
    console.log(`      Evento: ${setupRes.data.evento.name}`);
    console.log(`      Brincadeira: ${setupRes.data.brincadeira.name}`);
    console.log(`      Tipo: ${setupRes.data.brincadeira.game_type}\n`);

    // 4️⃣ Verificar resultado
    console.log('4️⃣ Verificando resultado...');
    const checkRes = await axios.get(
      `${API_BASE}/eventos/${evento.id}/active-game`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    console.log(`   ✅ Status atual:\n`);
    console.log(`      Game Type: ${checkRes.data.game_type}`);
    console.log(`      Game Name: ${checkRes.data.game_name}`);
    console.log(`      Status: ${checkRes.data.status}\n`);

    console.log('🎉 === SUCESSO! Jogo ativo configurado ===\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ ERRO:', error.response?.data || error.message);
    process.exit(1);
  }
}

main();
