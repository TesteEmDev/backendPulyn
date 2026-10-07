#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Mapa de conversões para nomes em português
const conversions = {
  // IDs em camelCase português
  brincadeiraId: 'brincadeiraId',
  eventoId: 'eventoId',
  criancaId: 'criancaId',
  timeId: 'timeId',
  empresaId: 'empresaId',
  checkpointId: 'checkpointId',
  leituraId: 'leituraId',
  clienteId: 'clienteId',
  loginId: 'loginId',
  conquistaId: 'conquistaId',

  // Campos em português
  'name:': 'nome:',
  "'name'": "'nome'",
  '"name"': '"nome"',
  'description:': 'descricao:',
  "'description'": "'descricao'",
  '"description"': '"descricao"',
  'type:': 'tipo:',
  "'type'": "'tipo'",
  '"type"': '"tipo"',
  'status:': 'status:',
  'duration:': 'duracao:',
  "'duration'": "'duracao'",
  '"duration"': '"duracao"',
  'email:': 'email:',
  'password:': 'senha:',
  "'password'": "'senha'",
  '"password"': '"senha"',
  'role:': 'perfil:',
  "'role'": "'perfil'",
  '"role"': '"perfil"',
  'phone:': 'telefone:',
  "'phone'": "'telefone'",
  '"phone"': '"telefone"',
  'city:': 'cidade:',
  "'city'": "'cidade'",
  '"city"': '"cidade"',
  'state:': 'estado:',
  "'state'": "'estado'",
  '"state"': '"estado"',
  'points:': 'pontos:',
  "'points'": "'pontos'",
  '"points"': '"pontos"',
  'color:': 'cor:',
  "'color'": "'cor'",
  '"color"': '"cor"',
  'rules:': 'regras:',
  "'rules'": "'regras'",
  '"rules"': '"regras"',
  'nickname:': 'apelido:',
  "'nickname'": "'apelido'",
  '"nickname"': '"apelido"',
  'age:': 'idade:',
  "'age'": "'idade'",
  '"age"': '"idade"',
  'avatar:': 'avatar:',
  'zone:': 'zona:',
  "'zone'": "'zona'",
  '"zone"': '"zona"',
  'ip:': 'ip:',
};

function updateFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf-8');
    let originalContent = content;

    // Aplicar substituições
    Object.entries(conversions).forEach(([english, portuguese]) => {
      const regex = new RegExp('\\b' + english.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'g');
      content = content.replace(regex, portuguese);
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

function main() {
  const routesDir = path.join(__dirname, 'routes');

  console.log('🇧🇷 Atualizando arquivos para português...\n');

  const files = fs.readdirSync(routesDir).filter(f => f.endsWith('.js'));
  let updated = 0;

  files.forEach(file => {
    const filePath = path.join(routesDir, file);
    if (updateFile(filePath)) {
      console.log(`✅ ${file}`);
      updated++;
    }
  });

  // Atualizar index.js também
  if (updateFile(path.join(__dirname, 'index.js'))) {
    console.log(`✅ index.js`);
    updated++;
  }

  console.log(`\n✅ Atualização concluída! ${updated} arquivo(s) modificado(s).`);
}

main();
