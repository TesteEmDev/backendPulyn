// schema/nomenclatura.js - fonte única da nomenclatura do banco.
//
// Padrão do banco: português, singular e camelCase (ex.: tabela `crianca`, coluna `criadoEm`).
// Cada tabela traz o nome antigo (inglês/plural/snake_case, usado na API e no frontend) e o nome novo.
// - A migração (migrations/nomenclatura.js) usa o mapa para renomear o que ainda estiver com o nome antigo.
// - O database.js usa o mapa para devolver cada linha com as chaves que a API sempre expôs,
//   assim o frontend continua recebendo o mesmo JSON (`crianca_id`, `name`, `created_at`...).
//
// Obs.: alguns nomes foram definidos à mão no banco (ex.: `cacaTesourPartida`, `leroEm`, `expiramEm`) e foram mantidos como estão.

const TABELAS = {
  brincadeiras: ['brincadeira', {
    id: 'brincadeiraId', name: 'nome', description: 'descricao', rules: 'regras', type: 'tipo', duration: 'duracao',
    status: 'status', default_points: 'pontosPadrao', created_at: 'criadoEm', empresa_id: 'empresaId',
    game_type: 'tipoJogo', checkpoints: 'checkpoints', evento_id: 'eventoId'
  }],
  caca_tesouro_partidas: ['cacaTesourPartida', {
    id: 'partidaId', evento_id: 'eventoId', brincadeira_id: 'brincadeiraId', status: 'status', round_number: 'numeroRonda',
    target_checkpoint_id: 'checkpointAlvoId', completed_checkpoint_ids: 'checkpointsCompletadosIds', started_at: 'iniciadoEm',
    round_started_at: 'rondaIniciadaEm', finished_at: 'finalizadoEm', starting_team_id: 'timeInicialId',
    turn_team_id: 'timeVezId', turn_available_at: 'vezDisponvelEm'
  }],
  caca_tesouro_scans: ['cacaTesourScan', {
    id: 'scanId', partida_id: 'partidaId', evento_id: 'eventoId', brincadeira_id: 'brincadeiraId', round_number: 'numeroRonda',
    checkpoint_id: 'checkpointId', crianca_id: 'criancaId', time_id: 'timeId', uid: 'uid', scanned_at: 'leroEm'
  }],
  caca_tesouro_tempos: ['cacaTesourTempo', {
    id: 'tempoId', partida_id: 'partidaId', evento_id: 'eventoId', time_id: 'timeId', started_at: 'iniciadoEm',
    completed_at: 'concluidoEm', elapsed_ms: 'duracaoMs'
  }],
  checkpoint_tags: ['etiquetaCheckpoint', {
    id: 'tagId', checkpoint_id: 'checkpointId', tag_uid: 'tagUid', created_at: 'criadoEm'
  }],
  checkpoints: ['pontoVerificacao', {
    id: 'checkpointId', evento_id: 'eventoId', name: 'nome', type: 'tipo', checkpoint_purpose: 'proposito', ip: 'ip',
    zone: 'zona', map_x: 'mapaX', map_y: 'mapaY', led_color: 'corLed', points: 'pontos', status: 'status',
    territory_owner_time_id: 'territorioDonoTimeId', territory_owner_crianca_id: 'territorioDonosCriancaId',
    territory_locked_until: 'territorioTravadoAte', territory_cooldown_until: 'territorioCooldownAte',
    last_conquered_at: 'ultimoConquistadoEm', created_at: 'criadoEm', empresa_id: 'empresaId',
    authorized_tags: 'tagsAutorizadas', last_seen: 'ultimoVisto', location: 'localizacao'
  }],
  clientes: ['cliente', {
    id: 'clienteId', name: 'nome', city: 'cidade', state: 'estado', email: 'email', phone: 'telefone', plano: 'plano',
    status: 'status', events_done: 'eventosRealizados', last_access: 'ultimoAcesso', created_at: 'criadoEm',
    empresa_id: 'empresaId', address: 'endereco', backup_frequency: 'frequenciaBackup', logo_data: 'logoDados',
    logo_name: 'logoNome', logo_type: 'logoTipo'
  }],
  conquistas: ['conquista', {
    id: 'conquistaId', name: 'nome', description: 'descricao', icon: 'icone', color: 'cor', required_type: 'tipoRequerido',
    required_value: 'valorRequerido', points_bonus: 'pontosBonus', created_at: 'criadoEm'
  }],
  crianca_conquistas: ['criancaConquista', {
    crianca_id: 'criancaId', conquista_id: 'conquistaId', unlocked_at: 'desbloqueadoEm'
  }],
  criancas: ['crianca', {
    id: 'criancaId', evento_id: 'eventoId', time_id: 'timeId', name: 'nome', nickname: 'apelido', age: 'idade',
    avatar: 'avatar', bracelet_code: 'codigoPulseira', scores: 'pontos', status: 'status', created_at: 'criadoEm',
    empresa_id: 'empresaId', qrcode: 'codigoQr', last_bracelet_code: 'ultimaPulseira'
  }, { qr_code: 'codigoQr' }],
  empresas: ['empresa', {
    id: 'empresaId', nome: 'nome', cidade: 'cidade', estado: 'estado', telefone: 'telefone', plano: 'plano', status: 'status',
    data_criacao: 'dataCriacao', data_atualizacao: 'dataAtualizacao', latitude: 'latitude', longitude: 'longitude',
    cnpj: 'cnpj', floor_plan_data: 'dadosPlanoPiso', floor_plan_name: 'nomePlanoPiso', floor_plan_type: 'tipoPlanoPiso',
    zones_data: 'dadosZonas'
  }],
  evento_brincadeiras: ['eventoBrincadeira', {
    evento_id: 'eventoId', brincadeira_id: 'brincadeiraId', ordem: 'ordem', points_multiplier: 'multiplicadorPontos',
    created_at: 'criadoEm'
  }],
  support_tickets: ['chamadoSuport', {
    id: 'ticketId', empresa_id: 'empresaId', client: 'cliente', subject: 'assunto', status: 'status', priority: 'prioridade',
    description: 'descricao', assignee: 'atribuidoPara', created_at: 'criadoEm', updated_at: 'atualizadoEm'
  }],
  eventos: ['evento', {
    id: 'eventoId', cliente_id: 'clienteId', name: 'nome', description: 'descricao', date: 'data', time: 'hora',
    duration: 'duracao', status: 'status', enable_display: 'exibirDisplay', enable_location: 'exibirLocalizacao',
    created_at: 'criadoEm', empresa_id: 'empresaId', active_game_type: 'tipoJogoAtivo',
    active_brincadeira_id: 'brincadeiraAtivaId', floor_plan_data: 'dadosPlanoPiso', floor_plan_name: 'nomePlanoPiso',
    floor_plan_type: 'tipoPlanoPiso', zones_data: 'dadosZonas', responsible_name: 'nomeResponsavel',
    started_at: 'iniciadoEm', ended_at: 'finalizadoEm', auto_start: 'autoInicio', auto_end: 'autoFim'
  }],
  leituras: ['leitura', {
    id: 'leituraId', checkpoint_id: 'checkpointId', crianca_id: 'criancaId', uid: 'uid', brincadeira_id: 'brincadeiraId',
    authorized: 'autorizado', points_awarded: 'pontosAtribuidos', signal_strength: 'forcaSinal', created_at: 'criadoEm',
    empresa_id: 'empresaId', session_id: 'sessaoId'
  }],
  logins: ['login', {
    id: 'loginId', empresa_id: 'empresaId', email: 'email', password: 'senha', status: 'status',
    ultimo_acesso: 'ultimoAcesso', data_criacao: 'dataCriacao', data_atualizacao: 'dataAtualizacao', role: 'perfil',
    family_name: 'nomeFamilia'
  }],
  family_invites: ['conviteFamilia', {
    id: 'conviteId', empresa_id: 'empresaId', evento_id: 'eventoId', crianca_id: 'criancaId', email: 'email',
    token_hash: 'hashToken', status: 'status', expires_at: 'expiramEm', used_at: 'usadoEm', created_by: 'criadoPor',
    created_at: 'criadoEm'
  }],
  family_child_links: ['vinculoFamiliar', {
    id: 'vinculoId', login_id: 'loginId', crianca_id: 'criancaId', empresa_id: 'empresaId', relationship: 'relacionamento',
    status: 'status', approved_by: 'aprovadoPor', approved_at: 'aprovadoEm', rejected_at: 'rejeitadoEm',
    created_at: 'criadoEm'
  }],
  family_linking_codes: ['codigoVinculoFamiliar', {
    id: 'id', crianca_id: 'criancaId', evento_id: 'eventoId', empresa_id: 'empresaId', qr_code_value: 'valorQrCode',
    tracking_url: 'urlRastreio', status: 'status', created_at: 'criadoEm', expires_at: 'expiraEm', used_at: 'usadoEm',
    used_by_login_id: 'usadoPorLoginId'
  }],
  logs: ['log', {
    id: 'logId', tipo: 'tipo', cliente_id: 'clienteId', evento_id: 'eventoId', message: 'mensagem', details: 'detalhes',
    created_at: 'criadoEm', empresa_id: 'empresaId'
  }],
  mensagens_display: ['mensagemDisplay', {
    id: 'mensagemId', evento_id: 'eventoId', text: 'texto', type: 'tipo', sender: 'remetente', sent_at: 'enviadoEm'
  }],
  pontuacoes: ['pontuacao', {
    id: 'pontuacaoId', evento_id: 'eventoId', crianca_id: 'criancaId', brincadeira_id: 'brincadeiraId',
    checkpoint_id: 'checkpointId', points: 'pontos', leitura_id: 'leituraId', created_at: 'criadoEm', empresa_id: 'empresaId'
  }],
  pulseiras: ['pulseira', {
    code: 'codigo', status: 'status', crianca_id: 'criancaId', created_at: 'criadoEm', empresa_id: 'empresaId'
  }],
  settings: ['configuracao', {
    id: 'configuracaoId', setting_key: 'chave', setting_value: 'valor', updated_at: 'atualizadoEm', empresa_id: 'empresaId'
  }, { settingId: 'configuracaoId' }],
  times: ['time', {
    id: 'timeId', evento_id: 'eventoId', name: 'nome', color: 'cor', points: 'pontos', created_at: 'criadoEm',
    empresa_id: 'empresaId'
  }],
  zonas: ['zona', {
    id: 'zonaId', evento_id: 'eventoId', name: 'nome', color: 'cor', x: 'x', y: 'y', width: 'largura', height: 'altura',
    created_at: 'criadoEm'
  }],
  game_sessions: ['sessaoJogo', {
    id: 'id', evento_id: 'eventoId', brincadeira_id: 'brincadeiraId', game_type: 'tipoJogo', mode: 'modo', status: 'status',
    started_at: 'iniciadoEm', finished_at: 'finalizadoEm', created_at: 'criadoEm', updated_at: 'atualizadoEm'
  }, {}, ['sessoesJogo']],
  game_scores: ['pontuacaoJogo', {
    id: 'id', empresa_id: 'empresaId', evento_id: 'eventoId', time_id: 'timeId', game_type: 'tipoJogo',
    round_number: 'numeroRonda', points: 'pontos', bonus_points: 'pontosBonus', total_points: 'pontosTotais',
    created_at: 'criadoEm', updated_at: 'atualizadoEm'
  }],
  game_scores_history: ['pontuacaoJogoHistorico', {
    id: 'id', empresa_id: 'empresaId', evento_id: 'eventoId', time_id: 'timeId', game_type: 'tipoJogo',
    round_number: 'numeroRonda', action: 'acao', points_earned: 'pontosGanhos', bonus_earned: 'bonusGanho',
    total_before: 'totalAntes', total_after: 'totalDepois', details: 'detalhes', created_at: 'criadoEm'
  }],
  game_winner_bonuses: ['bonusVencedorJogo', {
    id: 'id', empresa_id: 'empresaId', evento_id: 'eventoId', partida_id: 'partidaId', game_type: 'tipoJogo',
    time_id: 'timeId', points_per_member: 'pontosPorMembro', members_awarded: 'membrosPremiados', created_at: 'criadoEm'
  }],
  event_game_state: ['estadoJogoEvento', {
    evento_id: 'eventoId', empresa_id: 'empresaId', mode: 'modo', game_type: 'tipoJogo', game_id: 'brincadeiraId',
    game_name: 'nomeBrincadeira', started_at: 'iniciadoEm', stopped_at: 'paradoEm', updated_at: 'atualizadoEm'
  }],
  empresa_event_control: ['controleEventoEmpresa', {
    empresa_id: 'empresaId', evento_id: 'eventoId', updated_at: 'atualizadoEm'
  }],
  monster_hunt_partidas: ['monsterCacaPartida', {
    id: 'id', empresa_id: 'empresaId', evento_id: 'eventoId', brincadeira_id: 'brincadeiraId', status: 'status', hp: 'vida',
    max_hp: 'vidaMaxima', normal_damage: 'danoNormal', special_checkpoint_damage: 'danoCheckpointEspecial',
    special_attack_damage: 'danoAtaqueEspecial', special_checkpoint_id: 'checkpointEspecialId',
    winner_time_id: 'timeVencedorId', version: 'versao', started_at: 'iniciadoEm', finished_at: 'finalizadoEm',
    created_at: 'criadoEm'
  }],
  monster_hunt_scans: ['monsterCacaLeitura', {
    id: 'id', partida_id: 'partidaId', empresa_id: 'empresaId', evento_id: 'eventoId', brincadeira_id: 'brincadeiraId',
    checkpoint_id: 'checkpointId', crianca_id: 'criancaId', time_id: 'timeId', uid: 'uid', leitura_id: 'leituraId',
    attack_type: 'tipoAtaque', damage: 'dano', monster_hp_after: 'vidaMonstroApos', monster_defeated: 'monstroDerrotado',
    version: 'versao', scanned_at: 'lidoEm'
  }],
  monster_hunt_team_states: ['monsterCacaEstadoTime', {
    id: 'id', partida_id: 'partidaId', empresa_id: 'empresaId', evento_id: 'eventoId', time_id: 'timeId', hp: 'vida',
    max_hp: 'vidaMaxima', status: 'status', version: 'versao', defeated_at: 'derrotadoEm', victory_at: 'vitoriaEm',
    created_at: 'criadoEm'
  }],
  zone_conquest_team_partidas: ['zonaConquistaPartidaTime', {
    id: 'id', empresa_id: 'empresaId', evento_id: 'eventoId', brincadeira_id: 'brincadeiraId', status: 'status',
    round_number: 'numeroRonda', current_team_id: 'timeAtualId', started_at: 'iniciadoEm', finished_at: 'finalizadoEm',
    created_at: 'criadoEm', updated_at: 'atualizadoEm'
  }],
  zone_conquest_team_tempos: ['zonaConquistaTempoTime', {
    id: 'id', partida_id: 'partidaId', empresa_id: 'empresaId', evento_id: 'eventoId', time_id: 'timeId', status: 'status',
    zones_dominated: 'zonasDominadas', checkpoints_read: 'checkpointsLidos', total_points: 'pontosTotais',
    started_at: 'iniciadoEm', completed_at: 'concluidoEm', elapsed_ms: 'duracaoMs', created_at: 'criadoEm',
    updated_at: 'atualizadoEm'
  }],
  zone_conquest_team_scans: ['zonaConquistaLeituraTime', {
    id: 'id', partida_id: 'partidaId', empresa_id: 'empresaId', evento_id: 'eventoId', brincadeira_id: 'brincadeiraId',
    round_number: 'numeroRonda', checkpoint_id: 'checkpointId', crianca_id: 'criancaId', time_id: 'timeId', uid: 'uid',
    leitura_id: 'leituraId', points_awarded: 'pontosAtribuidos', scanned_at: 'lidoEm', created_at: 'criadoEm'
  }],
  zone_conquest_individual_partidas: ['zonaConquistaPartidaIndividual', {
    id: 'id', empresa_id: 'empresaId', evento_id: 'eventoId', brincadeira_id: 'brincadeiraId', status: 'status',
    version: 'versao', started_at: 'iniciadoEm', finished_at: 'finalizadoEm', created_at: 'criadoEm',
    updated_at: 'atualizadoEm'
  }],
  zone_conquest_individual_participant_states: ['zonaConquistaEstadoParticipanteIndividual', {
    id: 'id', partida_id: 'partidaId', empresa_id: 'empresaId', evento_id: 'eventoId', crianca_id: 'criancaId',
    status: 'status', checkpoints_read: 'checkpointsLidos', total_points: 'pontosTotais', ranking: 'ranking',
    version: 'versao', started_at: 'iniciadoEm', finished_at: 'finalizadoEm', created_at: 'criadoEm',
    updated_at: 'atualizadoEm', color: 'cor'
  }],
  zone_conquest_individual_scans: ['zonaConquistaLeituraIndividual', {
    id: 'id', partida_id: 'partidaId', empresa_id: 'empresaId', evento_id: 'eventoId', brincadeira_id: 'brincadeiraId',
    checkpoint_id: 'checkpointId', crianca_id: 'criancaId', uid: 'uid', leitura_id: 'leituraId',
    points_awarded: 'pontosAtribuidos', version: 'versao', scanned_at: 'lidoEm', created_at: 'criadoEm'
  }],
  zone_conquest_individual_checkpoint_protection: ['zonaConquistaProtecaoCheckpointIndividual', {
    id: 'id', partida_id: 'partidaId', checkpoint_id: 'checkpointId', crianca_id: 'criancaId',
    protection_until: 'protegidoAte', created_at: 'criadoEm'
  }],
  zone_conquest_checkpoint_states: ['zonaConquistaEstadoCheckpoint', {
    id: 'id', partida_id: 'partidaId', empresa_id: 'empresaId', evento_id: 'eventoId', checkpoint_id: 'checkpointId',
    current_owner_id: 'donoAtualId', owner_type: 'tipoDono', protected_until: 'protegidoAte',
    last_conquered_at: 'ultimoConquistadoEm', conquest_count: 'totalConquistas', created_at: 'criadoEm',
    updated_at: 'atualizadoEm'
  }],
  zone_conquest_zone_states: ['zonaConquistaEstadoZona', {
    id: 'id', partida_id: 'partidaId', empresa_id: 'empresaId', evento_id: 'eventoId', zone_id: 'zonaId',
    current_owner_id: 'donoAtualId', owner_type: 'tipoDono', is_disputed: 'disputada', checkpoints_count: 'totalCheckpoints',
    checkpoints_owned: 'checkpointsConquistados', last_updated_at: 'ultimaAtualizacaoEm', created_at: 'criadoEm',
    updated_at: 'atualizadoEm'
  }],
  parallel_games: ['brincadeiraParalela', {
    id: 'id', empresa_id: 'empresaId', evento_id: 'eventoId', checkpoint_id: 'checkpointId', status: 'status',
    prizes: 'premios', started_by: 'iniciadoPor', started_at: 'iniciadoEm', finished_at: 'finalizadoEm',
    finish_reason: 'motivoFim', object_name: 'nomeObjeto'
  }],
  parallel_game_winners: ['vencedorBrincadeiraParalela', {
    id: 'id', parallel_id: 'paralelaId', empresa_id: 'empresaId', evento_id: 'eventoId', crianca_id: 'criancaId',
    time_id: 'timeId', position: 'posicao', points: 'pontos', leitura_id: 'leituraId', won_at: 'venceuEm'
  }],
  parallel_objects: ['objetoBrincadeiraParalela', {
    id: 'id', empresa_id: 'empresaId', name: 'nome', status: 'status', created_at: 'criadoEm'
  }]
};

// Normaliza a estrutura: { antigo, novo, colunas, colunasExtras, tabelasExtras }.
const ESQUEMA = Object.entries(TABELAS).map(([antigo, [novo, colunas, colunasExtras = {}, tabelasExtras = []]]) => ({
  antigo,
  novo,
  colunas,
  // nomes antigos alternativos que já apareceram no banco (ex.: `qr_code`, `settingId`) e também viram `colunas[x]`.
  colunasExtras,
  // nomes alternativos da tabela já usados no banco (ex.: `sessoesJogo`, escrita no plural).
  tabelasExtras
}));

const PORTA_DE_NOME_NOVO = new Map(ESQUEMA.map(item => [item.novo, item]));
const PORTA_DE_NOME_ANTIGO = new Map(ESQUEMA.map(item => [item.antigo, item]));

// Para cada tabela nova, o mapa coluna nova -> chave que a API devolve.
function mapaChavesDaApi(nomeTabelaNova) {
  const item = PORTA_DE_NOME_NOVO.get(nomeTabelaNova);
  if (!item) return null;
  const mapa = new Map();
  for (const [antiga, nova] of Object.entries(item.colunas)) {
    if (!mapa.has(nova)) mapa.set(nova, antiga);
  }
  return mapa;
}

module.exports = { ESQUEMA, TABELAS, PORTA_DE_NOME_NOVO, PORTA_DE_NOME_ANTIGO, mapaChavesDaApi };
