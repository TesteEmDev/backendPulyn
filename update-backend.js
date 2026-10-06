#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Mapa de conversões snake_case → camelCase
const conversions = {
  // Foreign Keys
  cliente_id: 'clienteId',
  evento_id: 'eventoId',
  brincadeira_id: 'brincadeiraId',
  crianca_id: 'criancaId',
  time_id: 'timeId',
  empresa_id: 'empresaId',
  checkpoint_id: 'checkpointId',
  leitura_id: 'leituraId',
  partida_id: 'partidaId',
  tag_uid: 'tagUid',
  login_id: 'loginId',
  conquista_id: 'conquistaId',

  // Timestamps
  created_at: 'criadoEm',
  updated_at: 'atualizadoEm',
  started_at: 'iniciadoEm',
  finished_at: 'finalizadoEm',
  completed_at: 'completadoEm',
  scanned_at: 'leroEm',
  sent_at: 'enviadoEm',
  expires_at: 'expiramEm',
  used_at: 'usadoEm',
  approved_at: 'aprovadoEm',
  rejected_at: 'rejeitadoEm',
  last_access: 'ultimoAcesso',
  ultimo_acesso: 'ultimoAcesso',
  last_seen: 'ultimoVisto',
  last_conquered_at: 'ultimoConquistadoEm',

  // Dates
  data_criacao: 'dataCriacao',
  data_atualizacao: 'dataAtualizacao',

  // Other fields
  family_name: 'nomeFamilia',
  default_points: 'pontosPadrao',
  game_type: 'tipoJogo',
  round_number: 'numeroRonda',
  target_checkpoint_id: 'checkpointAlvoId',
  completed_checkpoint_ids: 'checkpointsCompletadosIds',
  starting_team_id: 'timeInicialId',
  turn_team_id: 'timeVezId',
  turn_available_at: 'vezDisponvelEm',
  checkpoint_purpose: 'propositoCheckpoint',
  map_x: 'mapaX',
  map_y: 'mapaY',
  led_color: 'corLed',
  territory_owner_time_id: 'territorioDonoTimeId',
  territory_owner_crianca_id: 'territorioDonosCriancaId',
  territory_locked_until: 'territorioTravadoAte',
  territory_cooldown_until: 'territorioCooldownAte',
  authorized_tags: 'tagsAutorizadas',
  events_done: 'eventosRealizados',
  required_type: 'tipoRequerido',
  required_value: 'valorRequerido',
  points_bonus: 'pontosBonus',
  bracelet_code: 'codigoPulseira',
  points_awarded: 'pontosAtribuidos',
  signal_strength: 'forcaSinal',
  points_multiplier: 'multiplicadorPontos',
  enable_display: 'exibirDisplay',
  enable_location: 'exibirLocalizacao',
  active_game_type: 'tipoJogoAtivo',
  active_brincadeira_id: 'brincadeiraAtivaId',
  floor_plan_data: 'dadosPlanoPiso',
  floor_plan_name: 'nomePlanoPiso',
  floor_plan_type: 'tipoPlanoPiso',
  responsible_name: 'nomeResponsavel',
  ended_at: 'finalizadoEm',
  auto_start: 'autoInicio',
  auto_end: 'autoFim',
  round_started_at: 'rondaIniciadaEm',
  elapsed_ms: 'msDecorridos',
  created_by: 'criadoPor',
  approved_by: 'aprovadoPor',
  token_hash: 'hashToken',
  setting_key: 'chave',
  setting_value: 'valor',
};

// Padrões de regex para encontrar e substituir
const patterns = [
  // Padrão: ['column_name'] ou ['column_name']:
  { regex: /\['([^']+)'\]/g, replace: (match, col) => conversions[col] ? `['${conversions[col]}']` : match },

  // Padrão: "column_name" ou "column_name":
  { regex: /"([^"]+)"/g, replace: (match, col) => conversions[col] ? `"${conversions[col]}"` : match },

  // Padrão: @columnName
  { regex: /@([a-zA-Z_]+)/g, replace: (match, col) => {
    const camel = col.charAt(0).toLowerCase() + col.slice(1).replace(/_([a-z])/g, g => g[1].toUpperCase());
    return `@${camel}`;
  }},
];

function updateFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf-8');
    let originalContent = content;

    // Aplicar substituições
    Object.entries(conversions).forEach(([snake, camel]) => {
      // Substituir em strings SQL
      const sqlPattern = new RegExp(`\\b${snake}\\b`, 'g');
      content = content.replace(sqlPattern, camel);
    });

    // Se houve mudanças, salvar
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

  console.log('🔄 Atualizando arquivos de rota...\n');

  const files = fs.readdirSync(routesDir).filter(f => f.endsWith('.js'));
  let updated = 0;

  files.forEach(file => {
    const filePath = path.join(routesDir, file);
    if (updateFile(filePath)) {
      console.log(`✅ ${file}`);
      updated++;
    } else {
      console.log(`⏭️  ${file}`);
    }
  });

  console.log(`\n✅ Atualização concluída! ${updated} arquivo(s) modificado(s).`);
}

main();
