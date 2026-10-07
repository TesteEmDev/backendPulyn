#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Mapa de conversões
const conversions = {
  // Nomes
  '"name"': '"nome"',
  "'name'": "'nome'",
  "family_name": "nomeFamilia",
  "responsible_name": "nomeResponsavel",
  "sender": "remetente",
  "client": "cliente",
  "assignee": "atribuidoPara",

  // Descrição
  '"description"': '"descricao"',
  "'description'": "'descricao'",

  // Tipo/Status/Perfil
  '"type"': '"tipo"',
  "'type'": "'tipo'",
  '"role"': '"perfil"',
  "'role'": "'perfil'",
  '"status"': '"status"',
  '"priority"': '"prioridade"',
  "'priority'": "'prioridade'",

  // Localização
  '"city"': '"cidade"',
  "'city'": "'cidade'",
  '"state"': '"estado"',
  "'state'": "'estado'",
  '"zone"': '"zona"',
  "'zone'": "'zona'",
  '"location"': '"localizacao"',
  "'location'": "'localizacao'",

  // Contato
  '"email"': '"email"',
  "'email'": "'email'",
  '"phone"': '"telefone"',
  "'phone'": "'telefone'",
  '"password"': '"senha"',
  "'password'": "'senha'",
  "password": "senha",

  // Dados
  '"points"': '"pontos"',
  "'points'": "'pontos'",
  '"scores"': '"pontos"',
  "'scores'": "'pontos'",
  '"plan"': '"plano"',
  "'plan'": "'plano'",
  '"avatar"': '"avatar"',
  "'avatar'": "'avatar'",

  // Brincadeira
  '"rules"': '"regras"',
  "'rules'": "'regras'",
  "default_points": "pontosPadrao",
  "game_type": "tipoJogo",

  // Criança
  '"nickname"': '"apelido"',
  "'nickname'": "'apelido'",
  '"age"': '"idade"',
  "'age'": "'idade'",
  "bracelet_code": "codigoPulseira",

  // Checkpoint
  "checkpoint_purpose": "proposito",
  "map_x": "mapaX",
  "map_y": "mapaY",
  "led_color": "corLed",
  "territory_owner_time_id": "territorioDonoTimeId",
  "territory_owner_crianca_id": "territorioDonosCriancaId",
  "territory_locked_until": "territorioTravadoAte",
  "territory_cooldown_until": "territorioCooldownAte",
  "authorized_tags": "tagsAutorizadas",

  // Evento
  "enable_display": "exibirDisplay",
  "enable_location": "exibirLocalizacao",
  "active_game_type": "tipoJogoAtivo",
  "active_brincadeira_id": "brincadeiraAtivaId",
  "floor_plan_data": "dadosPlanoPiso",
  "floor_plan_name": "nomePlanoPiso",
  "floor_plan_type": "tipoPlanoPiso",
  "auto_start": "autoInicio",
  "auto_end": "autoFim",

  // Leitura
  '"authorized"': '"autorizado"',
  "'authorized'": "'autorizado'",
  "authorized": "autorizado",
  "points_awarded": "pontosAtribuidos",
  "signal_strength": "forcaSinal",

  // Pontos
  "points_multiplier": "multiplicadorPontos",
  "required_type": "tipoRequerido",
  "required_value": "valorRequerido",
  "points_bonus": "pontosBonus",

  // Outras
  '"color"': '"cor"',
  "'color'": "'cor'",
  '"code"': '"codigo"',
  "'code'": "'codigo'",
  "code": "codigo",
  '"subject"': '"assunto"',
  "'subject'": "'assunto'",
  '"message"': '"mensagem"',
  "'message'": "'mensagem'",
  '"details"': '"detalhes"',
  "'details'": "'detalhes'",
  '"text"': '"texto"',
  "'text'": "'texto'",
  "text": "texto",
  '"cnpj"': '"cnpj"',
  "'cnpj'": "'cnpj'",
  '"relationship"': '"relacionamento"',
  "'relationship'": "'relacionamento'",
  "relationship": "relacionamento",
  "setting_key": "chave",
  "setting_value": "valor",
  "token_hash": "hashToken",

  // Tempos
  "round_number": "numeroRonda",
  "target_checkpoint_id": "checkpointAlvoId",
  "completed_checkpoint_ids": "checkpointsCompletadosIds",
  "starting_team_id": "timeInicialId",
  "turn_team_id": "timeVezId",
  "turn_available_at": "vezDisponvelEm",
  "round_started_at": "rondaIniciadaEm",
  "elapsed_ms": "msDecorridos",
  "events_done": "eventosRealizados",
  "created_by": "criadoPor",
  "approved_by": "aprovadoPor",
  "approved_at": "aprovadoEm",
  "rejected_at": "rejeitadoEm",
  "expires_at": "expiramEm",
  "used_at": "usadoEm",
  "data_criacao": "dataCriacao",
  "data_atualizacao": "dataAtualizacao",
};

function updateFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf-8');
    let originalContent = content;

    // Aplicar substituições em ordem de tamanho (maior primeiro para evitar conflitos)
    const sortedKeys = Object.keys(conversions).sort((a, b) => b.length - a.length);

    sortedKeys.forEach(english => {
      const portuguese = conversions[english];
      // Usar word boundary quando possível
      const pattern = /['"{}[\]()]/g.test(english)
        ? new RegExp(english.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
        : new RegExp('\\b' + english + '\\b', 'g');

      content = content.replace(pattern, portuguese);
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

function findAndUpdateFiles(dir, extensions = ['.js']) {
  const files = fs.readdirSync(dir);
  let updated = 0;

  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
      updated += findAndUpdateFiles(filePath, extensions);
    } else if (extensions.some(ext => file.endsWith(ext))) {
      if (updateFile(filePath)) {
        console.log(`✅ ${path.relative(process.cwd(), filePath)}`);
        updated++;
      }
    }
  });

  return updated;
}

function main() {
  console.log('🇧🇷 Refatorando para português completo...\n');

  // Atualizar routes
  console.log('📝 Atualizando rotas...');
  const routesUpdated = findAndUpdateFiles(path.join(__dirname, 'routes'), ['.js']);

  // Atualizar index.js
  console.log('\n📝 Atualizando index.js...');
  const indexUpdated = updateFile(path.join(__dirname, 'index.js')) ? 1 : 0;

  console.log(`\n✅ Refatoração completa!`);
  console.log(`   ${routesUpdated} arquivo(s) de rota atualizado(s)`);
  console.log(`   ${indexUpdated} arquivo(s) principal atualizado(s)`);
  console.log(`   Total: ${routesUpdated + indexUpdated} arquivo(s)`);
}

main();
