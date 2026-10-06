# Nomenclatura do banco

O banco segue o padrão **português, singular e camelCase**: tabela `crianca`, coluna `criadoEm`, chave estrangeira `eventoId`.

- A fonte única dos nomes é [`schema/nomenclatura.js`](schema/nomenclatura.js). Este arquivo é gerado a partir dele.
- [`migrations/nomenclatura.js`](migrations/nomenclatura.js) roda no início de toda subida do backend e renomeia, sem perder dados, o que ainda estiver com o nome antigo (inclusive tabelas duplicadas vazias recriadas por migrações antigas).
- `postgres-schema.sql` (esquema inicial de um banco novo) ainda tem os nomes antigos; na primeira subida do backend a migração de nomenclatura converte tudo.
- O suporte a SQL Server foi deixado para trás nesta mudança: o SQL do backend usa os nomes novos e a migração de nomenclatura só existe para PostgreSQL.
- No SQL do backend os nomes camelCase são escritos sem aspas (`SELECT c.criancaId FROM crianca c`); o `database.js` põe as aspas que o PostgreSQL exige.
- A API continua devolvendo as mesmas chaves de sempre (`crianca_id`, `name`, `created_at`...), então o frontend não muda. O `database.js` converte cada coluna lida direto de uma tabela para a chave da API (coluna `criancaId` → chave `crianca_id`). Colunas com apelido (`AS ...`) e cálculos mantêm o apelido do SQL.
- Para criar uma tabela ou coluna nova: escreva o nome já no padrão, inclua-o em `schema/nomenclatura.js` (com o nome que a API deve expor) e rode `npm test`.

Nomes que já estavam definidos à mão no banco foram mantidos como estão, mesmo com erro de digitação: `cacaTesourPartida`, `cacaTesourScan`, `chamadoSuport`, `vezDisponvelEm`, `leroEm`, `expiramEm`, `territorioDonosCriancaId`.

## Tabelas

| Tabela | Nome antigo |
|---|---|
| `brincadeira` | `brincadeiras` |
| `cacaTesourPartida` | `caca_tesouro_partidas` |
| `cacaTesourScan` | `caca_tesouro_scans` |
| `cacaTesourTempo` | `caca_tesouro_tempos` |
| `etiquetaCheckpoint` | `checkpoint_tags` |
| `pontoVerificacao` | `checkpoints` |
| `cliente` | `clientes` |
| `conquista` | `conquistas` |
| `criancaConquista` | `crianca_conquistas` |
| `crianca` | `criancas` |
| `empresa` | `empresas` |
| `eventoBrincadeira` | `evento_brincadeiras` |
| `chamadoSuport` | `support_tickets` |
| `evento` | `eventos` |
| `leitura` | `leituras` |
| `login` | `logins` |
| `conviteFamilia` | `family_invites` |
| `vinculoFamiliar` | `family_child_links` |
| `codigoVinculoFamiliar` | `family_linking_codes` |
| `log` | `logs` |
| `mensagemDisplay` | `mensagens_display` |
| `pontuacao` | `pontuacoes` |
| `pulseira` | `pulseiras` |
| `configuracao` | `settings` |
| `time` | `times` |
| `zona` | `zonas` |
| `sessaoJogo` | `game_sessions` |
| `pontuacaoJogo` | `game_scores` |
| `pontuacaoJogoHistorico` | `game_scores_history` |
| `bonusVencedorJogo` | `game_winner_bonuses` |
| `estadoJogoEvento` | `event_game_state` |
| `controleEventoEmpresa` | `empresa_event_control` |
| `monsterCacaPartida` | `monster_hunt_partidas` |
| `monsterCacaLeitura` | `monster_hunt_scans` |
| `monsterCacaEstadoTime` | `monster_hunt_team_states` |
| `zonaConquistaPartidaTime` | `zone_conquest_team_partidas` |
| `zonaConquistaTempoTime` | `zone_conquest_team_tempos` |
| `zonaConquistaLeituraTime` | `zone_conquest_team_scans` |
| `zonaConquistaPartidaIndividual` | `zone_conquest_individual_partidas` |
| `zonaConquistaEstadoParticipanteIndividual` | `zone_conquest_individual_participant_states` |
| `zonaConquistaLeituraIndividual` | `zone_conquest_individual_scans` |
| `zonaConquistaProtecaoCheckpointIndividual` | `zone_conquest_individual_checkpoint_protection` |
| `zonaConquistaEstadoCheckpoint` | `zone_conquest_checkpoint_states` |
| `zonaConquistaEstadoZona` | `zone_conquest_zone_states` |
| `brincadeiraParalela` | `parallel_games` |
| `vencedorBrincadeiraParalela` | `parallel_game_winners` |
| `objetoBrincadeiraParalela` | `parallel_objects` |

## Colunas

### `brincadeira`

| Coluna | Chave na API (nome antigo) |
|---|---|
| `brincadeiraId` | `id` |
| `nome` | `name` |
| `descricao` | `description` |
| `regras` | `rules` |
| `tipo` | `type` |
| `duracao` | `duration` |
| `status` | `status` |
| `pontosPadrao` | `default_points` |
| `criadoEm` | `created_at` |
| `empresaId` | `empresa_id` |
| `tipoJogo` | `game_type` |
| `checkpoints` | `checkpoints` |
| `eventoId` | `evento_id` |

### `cacaTesourPartida`

| Coluna | Chave na API (nome antigo) |
|---|---|
| `partidaId` | `id` |
| `eventoId` | `evento_id` |
| `brincadeiraId` | `brincadeira_id` |
| `status` | `status` |
| `numeroRonda` | `round_number` |
| `checkpointAlvoId` | `target_checkpoint_id` |
| `checkpointsCompletadosIds` | `completed_checkpoint_ids` |
| `iniciadoEm` | `started_at` |
| `rondaIniciadaEm` | `round_started_at` |
| `finalizadoEm` | `finished_at` |
| `timeInicialId` | `starting_team_id` |
| `timeVezId` | `turn_team_id` |
| `vezDisponvelEm` | `turn_available_at` |

### `cacaTesourScan`

| Coluna | Chave na API (nome antigo) |
|---|---|
| `scanId` | `id` |
| `partidaId` | `partida_id` |
| `eventoId` | `evento_id` |
| `brincadeiraId` | `brincadeira_id` |
| `numeroRonda` | `round_number` |
| `checkpointId` | `checkpoint_id` |
| `criancaId` | `crianca_id` |
| `timeId` | `time_id` |
| `uid` | `uid` |
| `leroEm` | `scanned_at` |

### `cacaTesourTempo`

| Coluna | Chave na API (nome antigo) |
|---|---|
| `tempoId` | `id` |
| `partidaId` | `partida_id` |
| `eventoId` | `evento_id` |
| `timeId` | `time_id` |
| `iniciadoEm` | `started_at` |
| `concluidoEm` | `completed_at` |
| `duracaoMs` | `elapsed_ms` |

### `etiquetaCheckpoint`

| Coluna | Chave na API (nome antigo) |
|---|---|
| `tagId` | `id` |
| `checkpointId` | `checkpoint_id` |
| `tagUid` | `tag_uid` |
| `criadoEm` | `created_at` |

### `pontoVerificacao`

| Coluna | Chave na API (nome antigo) |
|---|---|
| `checkpointId` | `id` |
| `eventoId` | `evento_id` |
| `nome` | `name` |
| `tipo` | `type` |
| `proposito` | `checkpoint_purpose` |
| `ip` | `ip` |
| `zona` | `zone` |
| `mapaX` | `map_x` |
| `mapaY` | `map_y` |
| `corLed` | `led_color` |
| `pontos` | `points` |
| `status` | `status` |
| `territorioDonoTimeId` | `territory_owner_time_id` |
| `territorioDonosCriancaId` | `territory_owner_crianca_id` |
| `territorioTravadoAte` | `territory_locked_until` |
| `territorioCooldownAte` | `territory_cooldown_until` |
| `ultimoConquistadoEm` | `last_conquered_at` |
| `criadoEm` | `created_at` |
| `empresaId` | `empresa_id` |
| `tagsAutorizadas` | `authorized_tags` |
| `ultimoVisto` | `last_seen` |
| `localizacao` | `location` |

### `cliente`

| Coluna | Chave na API (nome antigo) |
|---|---|
| `clienteId` | `id` |
| `nome` | `name` |
| `cidade` | `city` |
| `estado` | `state` |
| `email` | `email` |
| `telefone` | `phone` |
| `plano` | `plano` |
| `status` | `status` |
| `eventosRealizados` | `events_done` |
| `ultimoAcesso` | `last_access` |
| `criadoEm` | `created_at` |
| `empresaId` | `empresa_id` |
| `endereco` | `address` |
| `frequenciaBackup` | `backup_frequency` |
| `logoDados` | `logo_data` |
| `logoNome` | `logo_name` |
| `logoTipo` | `logo_type` |

### `conquista`

| Coluna | Chave na API (nome antigo) |
|---|---|
| `conquistaId` | `id` |
| `nome` | `name` |
| `descricao` | `description` |
| `icone` | `icon` |
| `cor` | `color` |
| `tipoRequerido` | `required_type` |
| `valorRequerido` | `required_value` |
| `pontosBonus` | `points_bonus` |
| `criadoEm` | `created_at` |

### `criancaConquista`

| Coluna | Chave na API (nome antigo) |
|---|---|
| `criancaId` | `crianca_id` |
| `conquistaId` | `conquista_id` |
| `desbloqueadoEm` | `unlocked_at` |

### `crianca`

| Coluna | Chave na API (nome antigo) |
|---|---|
| `criancaId` | `id` |
| `eventoId` | `evento_id` |
| `timeId` | `time_id` |
| `nome` | `name` |
| `apelido` | `nickname` |
| `idade` | `age` |
| `avatar` | `avatar` |
| `codigoPulseira` | `bracelet_code` |
| `pontos` | `scores` |
| `status` | `status` |
| `criadoEm` | `created_at` |
| `empresaId` | `empresa_id` |
| `codigoQr` | `qrcode` |
| `ultimaPulseira` | `last_bracelet_code` |

### `empresa`

| Coluna | Chave na API (nome antigo) |
|---|---|
| `empresaId` | `id` |
| `nome` | `nome` |
| `cidade` | `cidade` |
| `estado` | `estado` |
| `telefone` | `telefone` |
| `plano` | `plano` |
| `status` | `status` |
| `dataCriacao` | `data_criacao` |
| `dataAtualizacao` | `data_atualizacao` |
| `latitude` | `latitude` |
| `longitude` | `longitude` |
| `cnpj` | `cnpj` |
| `dadosPlanoPiso` | `floor_plan_data` |
| `nomePlanoPiso` | `floor_plan_name` |
| `tipoPlanoPiso` | `floor_plan_type` |
| `dadosZonas` | `zones_data` |

### `eventoBrincadeira`

| Coluna | Chave na API (nome antigo) |
|---|---|
| `eventoId` | `evento_id` |
| `brincadeiraId` | `brincadeira_id` |
| `ordem` | `ordem` |
| `multiplicadorPontos` | `points_multiplier` |
| `criadoEm` | `created_at` |

### `chamadoSuport`

| Coluna | Chave na API (nome antigo) |
|---|---|
| `ticketId` | `id` |
| `empresaId` | `empresa_id` |
| `cliente` | `client` |
| `assunto` | `subject` |
| `status` | `status` |
| `prioridade` | `priority` |
| `descricao` | `description` |
| `atribuidoPara` | `assignee` |
| `criadoEm` | `created_at` |
| `atualizadoEm` | `updated_at` |

### `evento`

| Coluna | Chave na API (nome antigo) |
|---|---|
| `eventoId` | `id` |
| `clienteId` | `cliente_id` |
| `nome` | `name` |
| `descricao` | `description` |
| `data` | `date` |
| `hora` | `time` |
| `duracao` | `duration` |
| `status` | `status` |
| `exibirDisplay` | `enable_display` |
| `exibirLocalizacao` | `enable_location` |
| `criadoEm` | `created_at` |
| `empresaId` | `empresa_id` |
| `tipoJogoAtivo` | `active_game_type` |
| `brincadeiraAtivaId` | `active_brincadeira_id` |
| `dadosPlanoPiso` | `floor_plan_data` |
| `nomePlanoPiso` | `floor_plan_name` |
| `tipoPlanoPiso` | `floor_plan_type` |
| `dadosZonas` | `zones_data` |
| `nomeResponsavel` | `responsible_name` |
| `iniciadoEm` | `started_at` |
| `finalizadoEm` | `ended_at` |
| `autoInicio` | `auto_start` |
| `autoFim` | `auto_end` |

### `leitura`

| Coluna | Chave na API (nome antigo) |
|---|---|
| `leituraId` | `id` |
| `checkpointId` | `checkpoint_id` |
| `criancaId` | `crianca_id` |
| `uid` | `uid` |
| `brincadeiraId` | `brincadeira_id` |
| `autorizado` | `authorized` |
| `pontosAtribuidos` | `points_awarded` |
| `forcaSinal` | `signal_strength` |
| `criadoEm` | `created_at` |
| `empresaId` | `empresa_id` |
| `sessaoId` | `session_id` |

### `login`

| Coluna | Chave na API (nome antigo) |
|---|---|
| `loginId` | `id` |
| `empresaId` | `empresa_id` |
| `email` | `email` |
| `senha` | `password` |
| `status` | `status` |
| `ultimoAcesso` | `ultimo_acesso` |
| `dataCriacao` | `data_criacao` |
| `dataAtualizacao` | `data_atualizacao` |
| `perfil` | `role` |
| `nomeFamilia` | `family_name` |

### `conviteFamilia`

| Coluna | Chave na API (nome antigo) |
|---|---|
| `conviteId` | `id` |
| `empresaId` | `empresa_id` |
| `eventoId` | `evento_id` |
| `criancaId` | `crianca_id` |
| `email` | `email` |
| `hashToken` | `token_hash` |
| `status` | `status` |
| `expiramEm` | `expires_at` |
| `usadoEm` | `used_at` |
| `criadoPor` | `created_by` |
| `criadoEm` | `created_at` |

### `vinculoFamiliar`

| Coluna | Chave na API (nome antigo) |
|---|---|
| `vinculoId` | `id` |
| `loginId` | `login_id` |
| `criancaId` | `crianca_id` |
| `empresaId` | `empresa_id` |
| `relacionamento` | `relationship` |
| `status` | `status` |
| `aprovadoPor` | `approved_by` |
| `aprovadoEm` | `approved_at` |
| `rejeitadoEm` | `rejected_at` |
| `criadoEm` | `created_at` |

### `codigoVinculoFamiliar`

| Coluna | Chave na API (nome antigo) |
|---|---|
| `id` | `id` |
| `criancaId` | `crianca_id` |
| `eventoId` | `evento_id` |
| `empresaId` | `empresa_id` |
| `valorQrCode` | `qr_code_value` |
| `urlRastreio` | `tracking_url` |
| `status` | `status` |
| `criadoEm` | `created_at` |
| `expiraEm` | `expires_at` |
| `usadoEm` | `used_at` |
| `usadoPorLoginId` | `used_by_login_id` |

### `log`

| Coluna | Chave na API (nome antigo) |
|---|---|
| `logId` | `id` |
| `tipo` | `tipo` |
| `clienteId` | `cliente_id` |
| `eventoId` | `evento_id` |
| `mensagem` | `message` |
| `detalhes` | `details` |
| `criadoEm` | `created_at` |
| `empresaId` | `empresa_id` |

### `mensagemDisplay`

| Coluna | Chave na API (nome antigo) |
|---|---|
| `mensagemId` | `id` |
| `eventoId` | `evento_id` |
| `texto` | `text` |
| `tipo` | `type` |
| `remetente` | `sender` |
| `enviadoEm` | `sent_at` |

### `pontuacao`

| Coluna | Chave na API (nome antigo) |
|---|---|
| `pontuacaoId` | `id` |
| `eventoId` | `evento_id` |
| `criancaId` | `crianca_id` |
| `brincadeiraId` | `brincadeira_id` |
| `checkpointId` | `checkpoint_id` |
| `pontos` | `points` |
| `leituraId` | `leitura_id` |
| `criadoEm` | `created_at` |
| `empresaId` | `empresa_id` |

### `pulseira`

| Coluna | Chave na API (nome antigo) |
|---|---|
| `codigo` | `code` |
| `status` | `status` |
| `criancaId` | `crianca_id` |
| `criadoEm` | `created_at` |
| `empresaId` | `empresa_id` |

### `configuracao`

| Coluna | Chave na API (nome antigo) |
|---|---|
| `configuracaoId` | `id` |
| `chave` | `setting_key` |
| `valor` | `setting_value` |
| `atualizadoEm` | `updated_at` |
| `empresaId` | `empresa_id` |

### `time`

| Coluna | Chave na API (nome antigo) |
|---|---|
| `timeId` | `id` |
| `eventoId` | `evento_id` |
| `nome` | `name` |
| `cor` | `color` |
| `pontos` | `points` |
| `criadoEm` | `created_at` |
| `empresaId` | `empresa_id` |

### `zona`

| Coluna | Chave na API (nome antigo) |
|---|---|
| `zonaId` | `id` |
| `eventoId` | `evento_id` |
| `nome` | `name` |
| `cor` | `color` |
| `x` | `x` |
| `y` | `y` |
| `largura` | `width` |
| `altura` | `height` |
| `criadoEm` | `created_at` |

### `sessaoJogo`

| Coluna | Chave na API (nome antigo) |
|---|---|
| `id` | `id` |
| `eventoId` | `evento_id` |
| `brincadeiraId` | `brincadeira_id` |
| `tipoJogo` | `game_type` |
| `modo` | `mode` |
| `status` | `status` |
| `iniciadoEm` | `started_at` |
| `finalizadoEm` | `finished_at` |
| `criadoEm` | `created_at` |
| `atualizadoEm` | `updated_at` |

### `pontuacaoJogo`

| Coluna | Chave na API (nome antigo) |
|---|---|
| `id` | `id` |
| `empresaId` | `empresa_id` |
| `eventoId` | `evento_id` |
| `timeId` | `time_id` |
| `tipoJogo` | `game_type` |
| `numeroRonda` | `round_number` |
| `pontos` | `points` |
| `pontosBonus` | `bonus_points` |
| `pontosTotais` | `total_points` |
| `criadoEm` | `created_at` |
| `atualizadoEm` | `updated_at` |

### `pontuacaoJogoHistorico`

| Coluna | Chave na API (nome antigo) |
|---|---|
| `id` | `id` |
| `empresaId` | `empresa_id` |
| `eventoId` | `evento_id` |
| `timeId` | `time_id` |
| `tipoJogo` | `game_type` |
| `numeroRonda` | `round_number` |
| `acao` | `action` |
| `pontosGanhos` | `points_earned` |
| `bonusGanho` | `bonus_earned` |
| `totalAntes` | `total_before` |
| `totalDepois` | `total_after` |
| `detalhes` | `details` |
| `criadoEm` | `created_at` |

### `bonusVencedorJogo`

| Coluna | Chave na API (nome antigo) |
|---|---|
| `id` | `id` |
| `empresaId` | `empresa_id` |
| `eventoId` | `evento_id` |
| `partidaId` | `partida_id` |
| `tipoJogo` | `game_type` |
| `timeId` | `time_id` |
| `pontosPorMembro` | `points_per_member` |
| `membrosPremiados` | `members_awarded` |
| `criadoEm` | `created_at` |

### `estadoJogoEvento`

| Coluna | Chave na API (nome antigo) |
|---|---|
| `eventoId` | `evento_id` |
| `empresaId` | `empresa_id` |
| `modo` | `mode` |
| `tipoJogo` | `game_type` |
| `brincadeiraId` | `game_id` |
| `nomeBrincadeira` | `game_name` |
| `iniciadoEm` | `started_at` |
| `paradoEm` | `stopped_at` |
| `atualizadoEm` | `updated_at` |

### `controleEventoEmpresa`

| Coluna | Chave na API (nome antigo) |
|---|---|
| `empresaId` | `empresa_id` |
| `eventoId` | `evento_id` |
| `atualizadoEm` | `updated_at` |

### `monsterCacaPartida`

| Coluna | Chave na API (nome antigo) |
|---|---|
| `id` | `id` |
| `empresaId` | `empresa_id` |
| `eventoId` | `evento_id` |
| `brincadeiraId` | `brincadeira_id` |
| `status` | `status` |
| `vida` | `hp` |
| `vidaMaxima` | `max_hp` |
| `danoNormal` | `normal_damage` |
| `danoCheckpointEspecial` | `special_checkpoint_damage` |
| `danoAtaqueEspecial` | `special_attack_damage` |
| `checkpointEspecialId` | `special_checkpoint_id` |
| `timeVencedorId` | `winner_time_id` |
| `versao` | `version` |
| `iniciadoEm` | `started_at` |
| `finalizadoEm` | `finished_at` |
| `criadoEm` | `created_at` |

### `monsterCacaLeitura`

| Coluna | Chave na API (nome antigo) |
|---|---|
| `id` | `id` |
| `partidaId` | `partida_id` |
| `empresaId` | `empresa_id` |
| `eventoId` | `evento_id` |
| `brincadeiraId` | `brincadeira_id` |
| `checkpointId` | `checkpoint_id` |
| `criancaId` | `crianca_id` |
| `timeId` | `time_id` |
| `uid` | `uid` |
| `leituraId` | `leitura_id` |
| `tipoAtaque` | `attack_type` |
| `dano` | `damage` |
| `vidaMonstroApos` | `monster_hp_after` |
| `monstroDerrotado` | `monster_defeated` |
| `versao` | `version` |
| `lidoEm` | `scanned_at` |

### `monsterCacaEstadoTime`

| Coluna | Chave na API (nome antigo) |
|---|---|
| `id` | `id` |
| `partidaId` | `partida_id` |
| `empresaId` | `empresa_id` |
| `eventoId` | `evento_id` |
| `timeId` | `time_id` |
| `vida` | `hp` |
| `vidaMaxima` | `max_hp` |
| `status` | `status` |
| `versao` | `version` |
| `derrotadoEm` | `defeated_at` |
| `vitoriaEm` | `victory_at` |
| `criadoEm` | `created_at` |

### `zonaConquistaPartidaTime`

| Coluna | Chave na API (nome antigo) |
|---|---|
| `id` | `id` |
| `empresaId` | `empresa_id` |
| `eventoId` | `evento_id` |
| `brincadeiraId` | `brincadeira_id` |
| `status` | `status` |
| `numeroRonda` | `round_number` |
| `timeAtualId` | `current_team_id` |
| `iniciadoEm` | `started_at` |
| `finalizadoEm` | `finished_at` |
| `criadoEm` | `created_at` |
| `atualizadoEm` | `updated_at` |

### `zonaConquistaTempoTime`

| Coluna | Chave na API (nome antigo) |
|---|---|
| `id` | `id` |
| `partidaId` | `partida_id` |
| `empresaId` | `empresa_id` |
| `eventoId` | `evento_id` |
| `timeId` | `time_id` |
| `status` | `status` |
| `zonasDominadas` | `zones_dominated` |
| `checkpointsLidos` | `checkpoints_read` |
| `pontosTotais` | `total_points` |
| `iniciadoEm` | `started_at` |
| `concluidoEm` | `completed_at` |
| `duracaoMs` | `elapsed_ms` |
| `criadoEm` | `created_at` |
| `atualizadoEm` | `updated_at` |

### `zonaConquistaLeituraTime`

| Coluna | Chave na API (nome antigo) |
|---|---|
| `id` | `id` |
| `partidaId` | `partida_id` |
| `empresaId` | `empresa_id` |
| `eventoId` | `evento_id` |
| `brincadeiraId` | `brincadeira_id` |
| `numeroRonda` | `round_number` |
| `checkpointId` | `checkpoint_id` |
| `criancaId` | `crianca_id` |
| `timeId` | `time_id` |
| `uid` | `uid` |
| `leituraId` | `leitura_id` |
| `pontosAtribuidos` | `points_awarded` |
| `lidoEm` | `scanned_at` |
| `criadoEm` | `created_at` |

### `zonaConquistaPartidaIndividual`

| Coluna | Chave na API (nome antigo) |
|---|---|
| `id` | `id` |
| `empresaId` | `empresa_id` |
| `eventoId` | `evento_id` |
| `brincadeiraId` | `brincadeira_id` |
| `status` | `status` |
| `versao` | `version` |
| `iniciadoEm` | `started_at` |
| `finalizadoEm` | `finished_at` |
| `criadoEm` | `created_at` |
| `atualizadoEm` | `updated_at` |

### `zonaConquistaEstadoParticipanteIndividual`

| Coluna | Chave na API (nome antigo) |
|---|---|
| `id` | `id` |
| `partidaId` | `partida_id` |
| `empresaId` | `empresa_id` |
| `eventoId` | `evento_id` |
| `criancaId` | `crianca_id` |
| `status` | `status` |
| `checkpointsLidos` | `checkpoints_read` |
| `pontosTotais` | `total_points` |
| `ranking` | `ranking` |
| `versao` | `version` |
| `iniciadoEm` | `started_at` |
| `finalizadoEm` | `finished_at` |
| `criadoEm` | `created_at` |
| `atualizadoEm` | `updated_at` |
| `cor` | `color` |

### `zonaConquistaLeituraIndividual`

| Coluna | Chave na API (nome antigo) |
|---|---|
| `id` | `id` |
| `partidaId` | `partida_id` |
| `empresaId` | `empresa_id` |
| `eventoId` | `evento_id` |
| `brincadeiraId` | `brincadeira_id` |
| `checkpointId` | `checkpoint_id` |
| `criancaId` | `crianca_id` |
| `uid` | `uid` |
| `leituraId` | `leitura_id` |
| `pontosAtribuidos` | `points_awarded` |
| `versao` | `version` |
| `lidoEm` | `scanned_at` |
| `criadoEm` | `created_at` |

### `zonaConquistaProtecaoCheckpointIndividual`

| Coluna | Chave na API (nome antigo) |
|---|---|
| `id` | `id` |
| `partidaId` | `partida_id` |
| `checkpointId` | `checkpoint_id` |
| `criancaId` | `crianca_id` |
| `protegidoAte` | `protection_until` |
| `criadoEm` | `created_at` |

### `zonaConquistaEstadoCheckpoint`

| Coluna | Chave na API (nome antigo) |
|---|---|
| `id` | `id` |
| `partidaId` | `partida_id` |
| `empresaId` | `empresa_id` |
| `eventoId` | `evento_id` |
| `checkpointId` | `checkpoint_id` |
| `donoAtualId` | `current_owner_id` |
| `tipoDono` | `owner_type` |
| `protegidoAte` | `protected_until` |
| `ultimoConquistadoEm` | `last_conquered_at` |
| `totalConquistas` | `conquest_count` |
| `criadoEm` | `created_at` |
| `atualizadoEm` | `updated_at` |

### `zonaConquistaEstadoZona`

| Coluna | Chave na API (nome antigo) |
|---|---|
| `id` | `id` |
| `partidaId` | `partida_id` |
| `empresaId` | `empresa_id` |
| `eventoId` | `evento_id` |
| `zonaId` | `zone_id` |
| `donoAtualId` | `current_owner_id` |
| `tipoDono` | `owner_type` |
| `disputada` | `is_disputed` |
| `totalCheckpoints` | `checkpoints_count` |
| `checkpointsConquistados` | `checkpoints_owned` |
| `ultimaAtualizacaoEm` | `last_updated_at` |
| `criadoEm` | `created_at` |
| `atualizadoEm` | `updated_at` |

### `brincadeiraParalela`

| Coluna | Chave na API (nome antigo) |
|---|---|
| `id` | `id` |
| `empresaId` | `empresa_id` |
| `eventoId` | `evento_id` |
| `checkpointId` | `checkpoint_id` |
| `status` | `status` |
| `premios` | `prizes` |
| `iniciadoPor` | `started_by` |
| `iniciadoEm` | `started_at` |
| `finalizadoEm` | `finished_at` |
| `motivoFim` | `finish_reason` |
| `nomeObjeto` | `object_name` |

### `vencedorBrincadeiraParalela`

| Coluna | Chave na API (nome antigo) |
|---|---|
| `id` | `id` |
| `paralelaId` | `parallel_id` |
| `empresaId` | `empresa_id` |
| `eventoId` | `evento_id` |
| `criancaId` | `crianca_id` |
| `timeId` | `time_id` |
| `posicao` | `position` |
| `pontos` | `points` |
| `leituraId` | `leitura_id` |
| `venceuEm` | `won_at` |

### `objetoBrincadeiraParalela`

| Coluna | Chave na API (nome antigo) |
|---|---|
| `id` | `id` |
| `empresaId` | `empresa_id` |
| `nome` | `name` |
| `status` | `status` |
| `criadoEm` | `created_at` |
