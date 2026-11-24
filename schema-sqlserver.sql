-- =====================================================================
-- Pulyn - estrutura do banco para SQL Server (ex.: tryasp.net / SmarterASP.NET)
-- Gerado em 2026-11-11T19:26:16.941Z a partir do banco "AdvPulyn" (PostgreSQL).
-- Só estrutura (tabelas, chaves, índices). Sem dados, sem gatilhos de sincronização.
-- Rode em um banco vazio. Não precisa de USE nem de GO.
-- =====================================================================
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;

-- ============================ TABELAS ============================
CREATE TABLE dbo.[amostraUhf] (
  [balde] datetimeoffset(3) NOT NULL,
  [antenaId] nvarchar(36) NOT NULL,
  [codigo] nvarchar(24) NOT NULL,
  [empresaId] nvarchar(36) NOT NULL,
  [n] int NOT NULL,
  [ciclos] int NOT NULL,
  [rssiMed] decimal(38,10) NOT NULL,
  [rssiMax] decimal(38,10) NOT NULL,
  [vistoEm] datetimeoffset(3) NULL,
  CONSTRAINT [amostraUhf_pkey] PRIMARY KEY ([balde], [antenaId], [codigo])
);

CREATE TABLE dbo.[antenaUhf] (
  [antenaId] nvarchar(36) NOT NULL,
  [leitorId] nvarchar(36) NOT NULL,
  [porta] int NOT NULL,
  [nome] nvarchar(100) NULL,
  [mapaX] decimal(38,10) NULL,
  [mapaY] decimal(38,10) NULL,
  [direcaoGraus] decimal(38,10) NULL,
  [raioMetros] decimal(38,10) NOT NULL DEFAULT 1.2,
  [rssi1m] decimal(38,10) NULL,
  [expoente] decimal(38,10) NOT NULL DEFAULT 4,
  [ativa] bit NOT NULL DEFAULT 1,
  CONSTRAINT [antenaUhf_pkey] PRIMARY KEY ([antenaId]),
  CONSTRAINT [antenaUhf_porta_check] CHECK (((porta >= 1) AND (porta <= 4))),
  CONSTRAINT [antenaUhf_leitorId_porta_key] UNIQUE ([leitorId], [porta])
);

CREATE TABLE dbo.[bonusVencedorJogo] (
  [id] nvarchar(36) NOT NULL,
  [empresaId] nvarchar(36) NULL,
  [eventoId] nvarchar(36) NOT NULL,
  [partidaId] nvarchar(36) NOT NULL,
  [tipoJogo] nvarchar(50) NOT NULL,
  [timeId] nvarchar(36) NOT NULL,
  [pontosPorMembro] int NOT NULL DEFAULT 0,
  [membrosPremiados] int NOT NULL DEFAULT 0,
  [criadoEm] datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT [game_winner_bonuses_pkey] PRIMARY KEY ([id])
);

CREATE TABLE dbo.[brincadeira] (
  [brincadeiraId] nvarchar(36) NOT NULL,
  [nome] nvarchar(100) NOT NULL,
  [descricao] nvarchar(500) NULL,
  [regras] nvarchar(max) NULL,
  [tipo] nvarchar(20) NULL DEFAULT N'team',
  [duracao] int NULL DEFAULT 30,
  [status] nvarchar(20) NULL DEFAULT N'active',
  [pontosPadrao] int NULL DEFAULT 10,
  [criadoEm] datetimeoffset(3) NULL DEFAULT SYSDATETIMEOFFSET(),
  [empresaId] nvarchar(36) NULL,
  [tipoJogo] nvarchar(50) NULL DEFAULT N'standard',
  [checkpoints] nvarchar(max) NULL,
  [eventoId] nvarchar(max) NULL,
  [configuracaoJogo] nvarchar(max) NULL,
  CONSTRAINT [brincadeiras_pkey] PRIMARY KEY ([brincadeiraId])
);

CREATE TABLE dbo.[brincadeiraParalela] (
  [id] nvarchar(36) NOT NULL,
  [empresaId] nvarchar(36) NOT NULL,
  [eventoId] nvarchar(36) NOT NULL,
  [checkpointId] nvarchar(36) NOT NULL,
  [status] nvarchar(20) NOT NULL DEFAULT N'active',
  [premios] nvarchar(100) NOT NULL DEFAULT N'50,40,30',
  [iniciadoPor] nvarchar(36) NULL,
  [iniciadoEm] datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  [finalizadoEm] datetimeoffset(3) NULL,
  [motivoFim] nvarchar(30) NULL,
  [nomeObjeto] nvarchar(100) NULL,
  CONSTRAINT [brincadeiraParalela_pkey] PRIMARY KEY ([id])
);

CREATE TABLE dbo.[cacaTesourPartida] (
  [partidaId] nvarchar(36) NOT NULL,
  [eventoId] nvarchar(36) NOT NULL,
  [brincadeiraId] nvarchar(36) NOT NULL,
  [status] nvarchar(20) NOT NULL,
  [numeroRonda] int NOT NULL,
  [checkpointAlvoId] nvarchar(36) NULL,
  [checkpointsCompletadosIds] nvarchar(max) NULL,
  [iniciadoEm] datetimeoffset(3) NOT NULL,
  [rondaIniciadaEm] datetimeoffset(3) NOT NULL,
  [finalizadoEm] datetimeoffset(3) NULL,
  [timeInicialId] nvarchar(36) NULL,
  [timeVezId] nvarchar(36) NULL,
  [vezDisponvelEm] datetimeoffset(3) NULL,
  [checkpointsUsadosIds] nvarchar(max) NULL,
  CONSTRAINT [caca_tesouro_partidas_pkey] PRIMARY KEY ([partidaId])
);

CREATE TABLE dbo.[cacaTesourScan] (
  [scanId] nvarchar(36) NOT NULL,
  [partidaId] nvarchar(36) NOT NULL,
  [eventoId] nvarchar(36) NOT NULL,
  [brincadeiraId] nvarchar(36) NOT NULL,
  [numeroRonda] int NOT NULL,
  [checkpointId] nvarchar(36) NOT NULL,
  [criancaId] nvarchar(36) NOT NULL,
  [timeId] nvarchar(36) NOT NULL,
  [uid] nvarchar(100) NOT NULL,
  [leroEm] datetimeoffset(3) NOT NULL,
  CONSTRAINT [caca_tesouro_scans_pkey] PRIMARY KEY ([scanId]),
  CONSTRAINT [UQ_caca_tesouro_scan_crianca] UNIQUE ([partidaId], [numeroRonda], [criancaId])
);

CREATE TABLE dbo.[cacaTesourTempo] (
  [tempoId] nvarchar(36) NOT NULL,
  [partidaId] nvarchar(36) NOT NULL,
  [eventoId] nvarchar(36) NOT NULL,
  [timeId] nvarchar(36) NOT NULL,
  [iniciadoEm] datetimeoffset(3) NULL,
  [concluidoEm] datetimeoffset(3) NULL,
  [duracaoMs] bigint NULL,
  CONSTRAINT [cacaTesourTempo_pkey] PRIMARY KEY ([tempoId])
);

CREATE TABLE dbo.[chamadoSuport] (
  [ticketId] nvarchar(36) NOT NULL,
  [empresaId] nvarchar(36) NULL,
  [cliente] nvarchar(255) NOT NULL,
  [assunto] nvarchar(255) NOT NULL,
  [status] nvarchar(20) NOT NULL DEFAULT N'aberto',
  [prioridade] nvarchar(20) NOT NULL DEFAULT N'media',
  [descricao] nvarchar(max) NULL,
  [atribuidoPara] nvarchar(255) NULL,
  [criadoEm] datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  [atualizadoEm] datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT [support_tickets_pkey] PRIMARY KEY ([ticketId])
);

CREATE TABLE dbo.[cliente] (
  [clienteId] nvarchar(36) NOT NULL,
  [nome] nvarchar(100) NOT NULL,
  [cidade] nvarchar(100) NULL,
  [estado] nvarchar(2) NULL,
  [email] nvarchar(100) NOT NULL,
  [telefone] nvarchar(20) NULL,
  [plano] nvarchar(20) NULL DEFAULT N'starter',
  [status] nvarchar(20) NULL DEFAULT N'active',
  [eventosRealizados] int NULL DEFAULT 0,
  [ultimoAcesso] datetimeoffset(3) NULL,
  [criadoEm] datetimeoffset(3) NULL DEFAULT SYSDATETIMEOFFSET(),
  [empresaId] nvarchar(36) NULL,
  [endereco] nvarchar(255) NULL,
  [frequenciaBackup] nvarchar(20) NULL DEFAULT N'daily',
  [logoDados] nvarchar(max) NULL,
  [logoNome] nvarchar(255) NULL,
  [logoTipo] nvarchar(100) NULL,
  CONSTRAINT [clientes_pkey] PRIMARY KEY ([clienteId])
);

CREATE TABLE dbo.[codigoEmail] (
  [loginId] nvarchar(36) NOT NULL,
  [tipo] nvarchar(20) NOT NULL,
  [codigoHash] nvarchar(255) NOT NULL,
  [expiraEm] datetimeoffset(3) NOT NULL,
  [tentativas] int NOT NULL DEFAULT 0,
  [criadoEm] datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT [codigoEmail_pkey] PRIMARY KEY ([loginId], [tipo])
);

CREATE TABLE dbo.[codigoVinculoFamiliar] (
  [id] uniqueidentifier NOT NULL DEFAULT NEWID(),
  [criancaId] nvarchar(36) NOT NULL,
  [eventoId] nvarchar(36) NOT NULL,
  [empresaId] nvarchar(36) NOT NULL,
  [valorQrCode] nvarchar(50) NOT NULL,
  [urlRastreio] nvarchar(500) NOT NULL,
  [status] nvarchar(20) NULL DEFAULT N'active',
  [criadoEm] datetime2(3) NULL DEFAULT SYSDATETIME(),
  [expiraEm] datetime2(3) NOT NULL,
  [usadoEm] datetime2(3) NULL,
  [usadoPorLoginId] nvarchar(36) NULL,
  CONSTRAINT [codigoVinculoFamiliar_pkey] PRIMARY KEY ([id]),
  CONSTRAINT [codigoVinculoFamiliar_valorQrCode_key] UNIQUE ([valorQrCode])
);

CREATE TABLE dbo.[configuracao] (
  [configuracaoId] int IDENTITY(1,1) NOT NULL,
  [chave] nvarchar(100) NOT NULL,
  [valor] nvarchar(max) NULL,
  [atualizadoEm] datetimeoffset(3) NULL DEFAULT SYSDATETIMEOFFSET(),
  [empresaId] nvarchar(450) NULL,
  CONSTRAINT [settings_pkey] PRIMARY KEY ([configuracaoId])
);

CREATE TABLE dbo.[conquista] (
  [conquistaId] nvarchar(36) NOT NULL,
  [nome] nvarchar(100) NOT NULL,
  [descricao] nvarchar(500) NULL,
  [icone] nvarchar(50) NULL,
  [cor] nvarchar(20) NULL,
  [tipoRequerido] nvarchar(50) NULL,
  [valorRequerido] int NULL,
  [pontosBonus] int NULL DEFAULT 0,
  [criadoEm] datetimeoffset(3) NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT [conquistas_pkey] PRIMARY KEY ([conquistaId])
);

CREATE TABLE dbo.[controleEventoEmpresa] (
  [empresaId] nvarchar(36) NOT NULL,
  [eventoId] nvarchar(36) NULL,
  [atualizadoEm] datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT [empresa_event_control_pkey] PRIMARY KEY ([empresaId])
);

CREATE TABLE dbo.[conviteFamilia] (
  [conviteId] nvarchar(36) NOT NULL,
  [empresaId] nvarchar(36) NOT NULL,
  [eventoId] nvarchar(36) NOT NULL,
  [criancaId] nvarchar(36) NULL,
  [email] nvarchar(255) NULL,
  [hashToken] nvarchar(128) NOT NULL,
  [status] nvarchar(20) NOT NULL DEFAULT N'pending',
  [expiramEm] datetimeoffset(3) NOT NULL,
  [usadoEm] datetimeoffset(3) NULL,
  [criadoPor] nvarchar(36) NULL,
  [criadoEm] datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT [conviteFamilia_pkey] PRIMARY KEY ([conviteId])
);

CREATE TABLE dbo.[crianca] (
  [criancaId] nvarchar(36) NOT NULL,
  [eventoId] nvarchar(36) NOT NULL,
  [timeId] nvarchar(36) NULL,
  [nome] nvarchar(100) NOT NULL,
  [apelido] nvarchar(100) NULL,
  [idade] int NULL,
  [avatar] nvarchar(64) NULL DEFAULT N'??',
  [codigoPulseira] nvarchar(50) NULL,
  [pontos] int NULL DEFAULT 0,
  [status] nvarchar(20) NULL DEFAULT N'active',
  [criadoEm] datetimeoffset(3) NULL DEFAULT SYSDATETIMEOFFSET(),
  [empresaId] nvarchar(36) NULL,
  [codigoQr] nvarchar(450) NULL,
  [ultimaPulseira] nvarchar(50) NULL,
  [perfilCriancaId] nvarchar(36) NULL,
  [numeroJogador] int NULL,
  [cor] nvarchar(20) NULL,
  [dataNascimento] date NULL,
  CONSTRAINT [criancas_pkey] PRIMARY KEY ([criancaId])
);

CREATE TABLE dbo.[criancaConquista] (
  [criancaId] nvarchar(36) NOT NULL,
  [conquistaId] nvarchar(36) NOT NULL,
  [desbloqueadoEm] datetimeoffset(3) NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT [crianca_conquistas_pkey] PRIMARY KEY ([criancaId], [conquistaId])
);

CREATE TABLE dbo.[empresa] (
  [empresaId] nvarchar(36) NOT NULL,
  [nome] nvarchar(255) NOT NULL,
  [cidade] nvarchar(100) NULL,
  [estado] nvarchar(2) NULL,
  [telefone] nvarchar(20) NULL,
  [plano] nvarchar(50) NULL DEFAULT N'starter',
  [status] nvarchar(50) NULL DEFAULT N'active',
  [dataCriacao] datetimeoffset(3) NULL DEFAULT SYSDATETIMEOFFSET(),
  [dataAtualizacao] datetimeoffset(3) NULL DEFAULT SYSDATETIMEOFFSET(),
  [latitude] float NULL,
  [longitude] float NULL,
  [cnpj] nvarchar(14) NULL,
  [dadosPlanoPiso] nvarchar(max) NULL,
  [nomePlanoPiso] nvarchar(255) NULL,
  [tipoPlanoPiso] nvarchar(100) NULL,
  [dadosZonas] nvarchar(max) NULL,
  [codigo] nvarchar(12) NULL,
  [mapaMetrosPorUnidade] decimal(38,10) NULL,
  CONSTRAINT [empresas_pkey] PRIMARY KEY ([empresaId])
);

CREATE TABLE dbo.[estadoJogoEvento] (
  [eventoId] nvarchar(36) NOT NULL,
  [empresaId] nvarchar(36) NOT NULL,
  [modo] nvarchar(20) NOT NULL DEFAULT N'idle',
  [tipoJogo] nvarchar(50) NOT NULL DEFAULT N'none',
  [brincadeiraId] nvarchar(36) NULL,
  [nomeBrincadeira] nvarchar(255) NULL,
  [iniciadoEm] datetimeoffset(3) NULL,
  [paradoEm] datetimeoffset(3) NULL,
  [atualizadoEm] datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT [event_game_state_pkey] PRIMARY KEY ([eventoId])
);

CREATE TABLE dbo.[etiquetaCheckpoint] (
  [tagId] int IDENTITY(1,1) NOT NULL,
  [checkpointId] nvarchar(36) NOT NULL,
  [tagUid] nvarchar(50) NOT NULL,
  [criadoEm] datetimeoffset(3) NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT [checkpoint_tags_pkey] PRIMARY KEY ([tagId]),
  CONSTRAINT [UQ_checkpoint_tag] UNIQUE ([checkpointId], [tagUid])
);

CREATE TABLE dbo.[evento] (
  [eventoId] nvarchar(36) NOT NULL,
  [clienteId] nvarchar(36) NULL,
  [nome] nvarchar(100) NOT NULL,
  [descricao] nvarchar(500) NULL,
  [data] date NOT NULL,
  [hora] time(3) NULL,
  [duracao] int NULL DEFAULT 120,
  [status] nvarchar(20) NULL DEFAULT N'scheduled',
  [exibirDisplay] int NULL DEFAULT 1,
  [exibirLocalizacao] int NULL DEFAULT 0,
  [criadoEm] datetimeoffset(3) NULL DEFAULT SYSDATETIMEOFFSET(),
  [empresaId] nvarchar(36) NULL,
  [tipoJogoAtivo] nvarchar(50) NULL DEFAULT N'none',
  [brincadeiraAtivaId] nvarchar(36) NULL,
  [dadosPlanoPiso] nvarchar(max) NULL,
  [nomePlanoPiso] nvarchar(255) NULL,
  [tipoPlanoPiso] nvarchar(100) NULL,
  [dadosZonas] nvarchar(max) NULL,
  [nomeResponsavel] nvarchar(150) NULL,
  [iniciadoEm] datetimeoffset(3) NULL,
  [finalizadoEm] datetimeoffset(3) NULL,
  [autoInicio] int NULL DEFAULT 0,
  [autoFim] int NULL DEFAULT 0,
  [codigoConvite] nvarchar(8) NULL,
  CONSTRAINT [eventos_pkey] PRIMARY KEY ([eventoId])
);

CREATE TABLE dbo.[eventoBrincadeira] (
  [eventoId] nvarchar(36) NOT NULL,
  [brincadeiraId] nvarchar(36) NOT NULL,
  [ordem] int NULL DEFAULT 0,
  [multiplicadorPontos] int NULL DEFAULT 1,
  [criadoEm] datetimeoffset(3) NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT [evento_brincadeiras_pkey] PRIMARY KEY ([eventoId], [brincadeiraId])
);

CREATE TABLE dbo.[familiaEvento] (
  [familiaEventoId] nvarchar(36) NOT NULL,
  [loginId] nvarchar(36) NOT NULL,
  [eventoId] nvarchar(36) NOT NULL,
  [empresaId] nvarchar(36) NULL,
  [conviteId] nvarchar(36) NULL,
  [criadoEm] datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT [familiaEvento_pkey] PRIMARY KEY ([familiaEventoId])
);

CREATE TABLE dbo.[leitorUhf] (
  [leitorId] nvarchar(36) NOT NULL,
  [empresaId] nvarchar(36) NOT NULL,
  [moduleId] nvarchar(16) NOT NULL,
  [nome] nvarchar(100) NOT NULL,
  [chaveHash] nvarchar(64) NOT NULL,
  [potenciaDbm] int NOT NULL DEFAULT 25,
  [rssiMin] int NOT NULL DEFAULT -75,
  [ativo] bit NOT NULL DEFAULT 1,
  [ultimoLoteEm] datetimeoffset(3) NULL,
  [ultimoSeq] bigint NOT NULL DEFAULT 0,
  [fw] nvarchar(20) NULL,
  [ultimasPortas] nvarchar(20) NULL,
  [criadoEm] datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT [leitorUhf_pkey] PRIMARY KEY ([leitorId]),
  CONSTRAINT [leitorUhf_empresaId_moduleId_key] UNIQUE ([empresaId], [moduleId])
);

CREATE TABLE dbo.[leitura] (
  [leituraId] nvarchar(36) NOT NULL,
  [checkpointId] nvarchar(36) NOT NULL,
  [criancaId] nvarchar(36) NULL,
  [uid] nvarchar(50) NOT NULL,
  [brincadeiraId] nvarchar(max) NULL,
  [autorizado] int NULL DEFAULT 0,
  [pontosAtribuidos] int NULL DEFAULT 0,
  [forcaSinal] int NULL,
  [criadoEm] datetimeoffset(3) NULL DEFAULT SYSDATETIMEOFFSET(),
  [empresaId] nvarchar(36) NULL,
  [sessaoId] nvarchar(36) NULL,
  CONSTRAINT [leituras_pkey] PRIMARY KEY ([leituraId])
);

CREATE TABLE dbo.[log] (
  [logId] int IDENTITY(1,1) NOT NULL,
  [tipo] nvarchar(20) NOT NULL,
  [clienteId] nvarchar(36) NULL,
  [eventoId] nvarchar(36) NULL,
  [mensagem] nvarchar(500) NOT NULL,
  [detalhes] nvarchar(max) NULL,
  [criadoEm] datetimeoffset(3) NULL DEFAULT SYSDATETIMEOFFSET(),
  [empresaId] nvarchar(36) NULL,
  CONSTRAINT [logs_pkey] PRIMARY KEY ([logId])
);

CREATE TABLE dbo.[login] (
  [loginId] nvarchar(36) NOT NULL,
  [empresaId] nvarchar(36) NOT NULL,
  [email] nvarchar(255) NOT NULL,
  [senha] nvarchar(255) NOT NULL,
  [status] nvarchar(50) NULL DEFAULT N'active',
  [ultimoAcesso] datetimeoffset(3) NULL,
  [dataCriacao] datetimeoffset(3) NULL DEFAULT SYSDATETIMEOFFSET(),
  [dataAtualizacao] datetimeoffset(3) NULL DEFAULT SYSDATETIMEOFFSET(),
  [perfil] nvarchar(50) NULL DEFAULT N'admin',
  [nomeFamilia] nvarchar(255) NULL,
  [perfisExtras] nvarchar(max) NULL,
  [telefone] nvarchar(20) NULL,
  [tokenVersao] int NOT NULL DEFAULT 0,
  [emailConfirmadoEm] datetimeoffset(3) NULL,
  CONSTRAINT [logins_pkey] PRIMARY KEY ([loginId]),
  CONSTRAINT [UQ__logins__AB6E61641C935B6A] UNIQUE ([email])
);

CREATE TABLE dbo.[loteUhf] (
  [leitorId] nvarchar(36) NOT NULL,
  [seq] bigint NOT NULL,
  [recebidoEm] datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  [balde] datetimeoffset(3) NOT NULL,
  [total] int NOT NULL,
  [ciclos] int NULL,
  CONSTRAINT [loteUhf_pkey] PRIMARY KEY ([leitorId], [seq])
);

CREATE TABLE dbo.[mensagemDisplay] (
  [mensagemId] nvarchar(36) NOT NULL,
  [eventoId] nvarchar(36) NOT NULL,
  [texto] nvarchar(500) NOT NULL,
  [tipo] nvarchar(20) NULL DEFAULT N'custom',
  [remetente] nvarchar(100) NULL,
  [enviadoEm] datetimeoffset(3) NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT [mensagens_display_pkey] PRIMARY KEY ([mensagemId])
);

CREATE TABLE dbo.[monsterCacaEstadoTime] (
  [id] nvarchar(36) NOT NULL,
  [partidaId] nvarchar(36) NOT NULL,
  [empresaId] nvarchar(36) NOT NULL,
  [eventoId] nvarchar(36) NOT NULL,
  [timeId] nvarchar(36) NOT NULL,
  [vida] int NOT NULL DEFAULT 500,
  [vidaMaxima] int NOT NULL DEFAULT 500,
  [status] nvarchar(20) NOT NULL DEFAULT N'active',
  [versao] int NOT NULL DEFAULT 0,
  [derrotadoEm] datetimeoffset(3) NULL,
  [vitoriaEm] datetimeoffset(3) NULL,
  [criadoEm] datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT [monster_hunt_team_states_pkey] PRIMARY KEY ([id])
);

CREATE TABLE dbo.[monsterCacaLeitura] (
  [id] nvarchar(36) NOT NULL,
  [partidaId] nvarchar(36) NOT NULL,
  [empresaId] nvarchar(36) NOT NULL,
  [eventoId] nvarchar(36) NOT NULL,
  [brincadeiraId] nvarchar(36) NULL,
  [checkpointId] nvarchar(36) NOT NULL,
  [criancaId] nvarchar(36) NOT NULL,
  [timeId] nvarchar(36) NULL,
  [uid] nvarchar(255) NULL,
  [leituraId] nvarchar(36) NULL,
  [tipoAtaque] nvarchar(30) NOT NULL,
  [dano] int NOT NULL DEFAULT 0,
  [vidaMonstroApos] int NOT NULL,
  [monstroDerrotado] bit NOT NULL DEFAULT 0,
  [versao] int NOT NULL DEFAULT 0,
  [lidoEm] datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT [monster_hunt_scans_pkey] PRIMARY KEY ([id])
);

CREATE TABLE dbo.[monsterCacaPartida] (
  [id] nvarchar(36) NOT NULL,
  [empresaId] nvarchar(36) NOT NULL,
  [eventoId] nvarchar(36) NOT NULL,
  [brincadeiraId] nvarchar(36) NULL,
  [status] nvarchar(20) NOT NULL DEFAULT N'active',
  [vida] int NOT NULL DEFAULT 100,
  [vidaMaxima] int NOT NULL DEFAULT 100,
  [danoNormal] int NOT NULL DEFAULT 10,
  [danoCheckpointEspecial] int NOT NULL DEFAULT 30,
  [danoAtaqueEspecial] int NOT NULL DEFAULT 50,
  [checkpointEspecialId] nvarchar(36) NULL,
  [timeVencedorId] nvarchar(36) NULL,
  [versao] int NOT NULL DEFAULT 0,
  [iniciadoEm] datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  [finalizadoEm] datetimeoffset(3) NULL,
  [criadoEm] datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT [monsterCacaPartida_pkey] PRIMARY KEY ([id])
);

CREATE TABLE dbo.[objetoBrincadeiraParalela] (
  [id] nvarchar(36) NOT NULL,
  [empresaId] nvarchar(36) NOT NULL,
  [nome] nvarchar(80) NOT NULL,
  [status] nvarchar(10) NOT NULL DEFAULT N'active',
  [criadoEm] datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT [objetoBrincadeiraParalela_pkey] PRIMARY KEY ([id])
);

CREATE TABLE dbo.[partidaBomba] (
  [partidaId] nvarchar(36) NOT NULL,
  [eventoId] nvarchar(36) NOT NULL,
  [empresaId] nvarchar(36) NOT NULL,
  [brincadeiraId] nvarchar(36) NULL,
  [status] nvarchar(20) NOT NULL DEFAULT N'em_andamento',
  [timeAId] nvarchar(36) NULL,
  [timeBId] nvarchar(36) NULL,
  [timeTrInicialId] nvarchar(36) NULL,
  [vitoriasA] int NOT NULL DEFAULT 0,
  [vitoriasB] int NOT NULL DEFAULT 0,
  [vitoriasParaVencer] int NOT NULL DEFAULT 10,
  [roundsPorLado] int NOT NULL DEFAULT 5,
  [duracaoRoundSeg] int NOT NULL DEFAULT 360,
  [plantarMs] int NOT NULL DEFAULT 6000,
  [desarmarMs] int NOT NULL DEFAULT 12500,
  [bombaSeg] int NOT NULL DEFAULT 150,
  [vencedorTimeId] nvarchar(36) NULL,
  [iniciadoEm] datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  [finalizadoEm] datetimeoffset(3) NULL,
  [locaisIds] nvarchar(max) NULL,
  CONSTRAINT [partidaBomba_pkey] PRIMARY KEY ([partidaId])
);

CREATE TABLE dbo.[partidaRefem] (
  [partidaId] nvarchar(36) NOT NULL,
  [eventoId] nvarchar(36) NOT NULL,
  [empresaId] nvarchar(36) NOT NULL,
  [brincadeiraId] nvarchar(36) NULL,
  [status] nvarchar(20) NOT NULL DEFAULT N'em_andamento',
  [timeAId] nvarchar(36) NULL,
  [timeBId] nvarchar(36) NULL,
  [timeTrInicialId] nvarchar(36) NULL,
  [vitoriasA] int NOT NULL DEFAULT 0,
  [vitoriasB] int NOT NULL DEFAULT 0,
  [vitoriasParaVencer] int NOT NULL DEFAULT 5,
  [roundsPorLado] int NOT NULL DEFAULT 3,
  [duracaoRoundSeg] int NOT NULL DEFAULT 300,
  [protecaoSeg] int NOT NULL DEFAULT 10,
  [sequenciaIds] nvarchar(max) NULL,
  [vencedorTimeId] nvarchar(36) NULL,
  [iniciadoEm] datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  [finalizadoEm] datetimeoffset(3) NULL,
  CONSTRAINT [partidaRefem_pkey] PRIMARY KEY ([partidaId])
);

CREATE TABLE dbo.[perfilCrianca] (
  [perfilCriancaId] nvarchar(36) NOT NULL,
  [empresaId] nvarchar(36) NOT NULL,
  [nome] nvarchar(100) NOT NULL,
  [apelido] nvarchar(100) NULL,
  [idade] int NULL,
  [avatar] nvarchar(100) NULL,
  [ultimoEventoId] nvarchar(36) NULL,
  [criadoEm] datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  [atualizadoEm] datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  [dataNascimento] date NULL,
  CONSTRAINT [perfilCrianca_pkey] PRIMARY KEY ([perfilCriancaId])
);

CREATE TABLE dbo.[perfilVinculoFamiliar] (
  [vinculoId] nvarchar(36) NOT NULL,
  [loginId] nvarchar(36) NOT NULL,
  [perfilCriancaId] nvarchar(36) NOT NULL,
  [empresaId] nvarchar(36) NOT NULL,
  [relacionamento] nvarchar(50) NOT NULL DEFAULT N'responsável',
  [criadoEm] datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT [perfilVinculoFamiliar_pkey] PRIMARY KEY ([vinculoId])
);

CREATE TABLE dbo.[pontoVerificacao] (
  [checkpointId] AS ISNULL(CAST([id] AS nvarchar(36)), N'') PERSISTED NOT NULL,
  [eventoId] nvarchar(36) NULL,
  [nome] nvarchar(100) NOT NULL,
  [tipo] nvarchar(20) NULL DEFAULT N'NFC',
  [ip] nvarchar(15) NULL,
  [zona] nvarchar(100) NULL,
  [corLed] nvarchar(20) NULL DEFAULT N'#00FF00',
  [pontos] int NULL DEFAULT 10,
  [status] nvarchar(20) NULL DEFAULT N'offline',
  [territorioDonoTimeId] nvarchar(36) NULL,
  [territorioTravadoAte] datetimeoffset(3) NULL,
  [territorioCooldownAte] datetimeoffset(3) NULL,
  [ultimoConquistadoEm] datetimeoffset(3) NULL,
  [criadoEm] datetimeoffset(3) NULL DEFAULT SYSDATETIMEOFFSET(),
  [empresaId] nvarchar(36) NULL,
  [tagsAutorizadas] nvarchar(max) NULL,
  [ultimoVisto] datetimeoffset(3) NULL DEFAULT SYSDATETIMEOFFSET(),
  [localizacao] nvarchar(100) NULL,
  [proposito] nvarchar(20) NULL DEFAULT N'game',
  [mapaX] int NULL,
  [mapaY] int NULL,
  [territorioDonosCriancaId] nvarchar(36) NULL,
  [codigo] nvarchar(60) NULL,
  [id] int IDENTITY(1,1) NOT NULL,
  [numCheck] nvarchar(40) NULL,
  [macAddress] nvarchar(17) NULL,
  [statusTransferencia] nvarchar(10) NOT NULL DEFAULT N'aceito',
  [empresaDestinoId] nvarchar(36) NULL,
  [transferidoEm] datetimeoffset(3) NULL,
  CONSTRAINT [checkpoints_pkey] PRIMARY KEY ([checkpointId])
);

CREATE TABLE dbo.[pontuacao] (
  [pontuacaoId] nvarchar(36) NOT NULL,
  [eventoId] nvarchar(36) NOT NULL,
  [criancaId] nvarchar(36) NOT NULL,
  [brincadeiraId] nvarchar(max) NULL,
  [checkpointId] nvarchar(36) NOT NULL,
  [pontos] int NOT NULL,
  [leituraId] nvarchar(36) NULL,
  [criadoEm] datetimeoffset(3) NULL DEFAULT SYSDATETIMEOFFSET(),
  [empresaId] nvarchar(36) NULL,
  CONSTRAINT [pontuacoes_pkey] PRIMARY KEY ([pontuacaoId])
);

CREATE TABLE dbo.[pulseira] (
  [codigo] nvarchar(50) NOT NULL,
  [status] nvarchar(20) NULL DEFAULT N'disponivel',
  [criancaId] nvarchar(36) NULL,
  [criadoEm] datetimeoffset(3) NULL DEFAULT SYSDATETIMEOFFSET(),
  [empresaId] nvarchar(36) NOT NULL,
  [epc] nvarchar(24) NULL,
  CONSTRAINT [pulseira_pkey] PRIMARY KEY ([empresaId], [codigo])
);

CREATE TABLE dbo.[roundBomba] (
  [roundId] nvarchar(36) NOT NULL,
  [partidaId] nvarchar(36) NOT NULL,
  [numero] int NOT NULL,
  [timeTrId] nvarchar(36) NOT NULL,
  [timeCtId] nvarchar(36) NOT NULL,
  [status] nvarchar(20) NOT NULL DEFAULT N'aguardando',
  [portadorCriancaId] nvarchar(36) NULL,
  [portadorNumero] int NULL,
  [iniciadoEm] datetimeoffset(3) NULL,
  [plantadaEm] datetimeoffset(3) NULL,
  [localCheckpointId] nvarchar(36) NULL,
  [plantadaPorCriancaId] nvarchar(36) NULL,
  [desarmadaPorCriancaId] nvarchar(36) NULL,
  [vencedorTimeId] nvarchar(36) NULL,
  [motivo] nvarchar(30) NULL,
  [finalizadoEm] datetimeoffset(3) NULL,
  [criadoEm] datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT [roundBomba_pkey] PRIMARY KEY ([roundId])
);

CREATE TABLE dbo.[roundRefem] (
  [roundId] nvarchar(36) NOT NULL,
  [partidaId] nvarchar(36) NOT NULL,
  [numero] int NOT NULL,
  [timeTrId] nvarchar(36) NOT NULL,
  [timeCtId] nvarchar(36) NOT NULL,
  [status] nvarchar(20) NOT NULL DEFAULT N'aguardando',
  [refemCriancaId] nvarchar(36) NULL,
  [refemNumero] int NULL,
  [posicao] int NOT NULL DEFAULT 0,
  [recuperacoes] int NOT NULL DEFAULT 0,
  [ultimoAvancoEm] datetimeoffset(3) NULL,
  [iniciadoEm] datetimeoffset(3) NULL,
  [vencedorTimeId] nvarchar(36) NULL,
  [motivo] nvarchar(30) NULL,
  [finalizadoEm] datetimeoffset(3) NULL,
  [criadoEm] datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT [roundRefem_pkey] PRIMARY KEY ([roundId])
);

CREATE TABLE dbo.[sessaoJogo] (
  [id] nvarchar(36) NOT NULL,
  [eventoId] nvarchar(36) NOT NULL,
  [brincadeiraId] nvarchar(36) NOT NULL,
  [tipoJogo] nvarchar(50) NOT NULL,
  [modo] nvarchar(20) NULL,
  [status] nvarchar(20) NOT NULL DEFAULT N'active',
  [iniciadoEm] datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  [finalizadoEm] datetimeoffset(3) NULL,
  [criadoEm] datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  [atualizadoEm] datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT [game_sessions_pkey] PRIMARY KEY ([id])
);

CREATE TABLE dbo.[sincronizacaoEstado] (
  [chave] nvarchar(450) NOT NULL,
  [valor] nvarchar(max) NULL,
  [atualizadoEm] datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT [sincronizacaoEstado_pkey] PRIMARY KEY ([chave])
);

CREATE TABLE dbo.[sincronizacaoFila] (
  [filaId] bigint IDENTITY(1,1) NOT NULL,
  [tabela] nvarchar(max) NOT NULL,
  [operacao] nchar(1) NOT NULL,
  [chave] nvarchar(max) NOT NULL,
  [criadoEm] datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  [enviadoEm] datetimeoffset(3) NULL,
  [tentativas] int NOT NULL DEFAULT 0,
  [proximaTentativaEm] datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  [erro] nvarchar(max) NULL,
  CONSTRAINT [sincronizacaoFila_pkey] PRIMARY KEY ([filaId]),
  CONSTRAINT [sincronizacaoFila_operacao_check] CHECK ((operacao IN ('I', 'U', 'D')))
);

CREATE TABLE dbo.[time] (
  [timeId] nvarchar(36) NOT NULL,
  [eventoId] nvarchar(36) NULL,
  [nome] nvarchar(50) NOT NULL,
  [cor] nvarchar(20) NOT NULL,
  [pontos] int NULL DEFAULT 0,
  [criadoEm] datetimeoffset(3) NULL DEFAULT SYSDATETIMEOFFSET(),
  [empresaId] nvarchar(36) NULL,
  CONSTRAINT [times_pkey] PRIMARY KEY ([timeId])
);

CREATE TABLE dbo.[vencedorBrincadeiraParalela] (
  [id] nvarchar(36) NOT NULL,
  [paralelaId] nvarchar(36) NOT NULL,
  [empresaId] nvarchar(36) NOT NULL,
  [eventoId] nvarchar(36) NOT NULL,
  [criancaId] nvarchar(36) NOT NULL,
  [timeId] nvarchar(36) NULL,
  [posicao] int NOT NULL,
  [pontos] int NOT NULL,
  [leituraId] nvarchar(36) NULL,
  [venceuEm] datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT [vencedorBrincadeiraParalela_pkey] PRIMARY KEY ([id])
);

CREATE TABLE dbo.[vinculoFamiliar] (
  [vinculoId] nvarchar(36) NOT NULL,
  [loginId] nvarchar(36) NOT NULL,
  [criancaId] nvarchar(36) NOT NULL,
  [empresaId] nvarchar(36) NOT NULL,
  [relacionamento] nvarchar(50) NOT NULL DEFAULT N'responsÃ¡vel',
  [status] nvarchar(20) NOT NULL DEFAULT N'pending',
  [aprovadoPor] nvarchar(36) NULL,
  [aprovadoEm] datetimeoffset(3) NULL,
  [rejeitadoEm] datetimeoffset(3) NULL,
  [criadoEm] datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  [perfilCriancaId] nvarchar(36) NULL,
  CONSTRAINT [vinculoFamiliar_pkey] PRIMARY KEY ([vinculoId])
);

CREATE TABLE dbo.[zona] (
  [zonaId] nvarchar(36) NOT NULL,
  [eventoId] nvarchar(36) NOT NULL,
  [nome] nvarchar(100) NOT NULL,
  [cor] nvarchar(20) NOT NULL,
  [x] int NOT NULL,
  [y] int NOT NULL,
  [largura] int NOT NULL,
  [altura] int NOT NULL,
  [criadoEm] datetimeoffset(3) NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT [zonas_pkey] PRIMARY KEY ([zonaId])
);

CREATE TABLE dbo.[zonaConquistaEstadoCheckpoint] (
  [id] nvarchar(36) NOT NULL,
  [partidaId] nvarchar(36) NOT NULL,
  [empresaId] nvarchar(36) NOT NULL,
  [eventoId] nvarchar(36) NOT NULL,
  [checkpointId] nvarchar(36) NOT NULL,
  [donoAtualId] nvarchar(36) NULL,
  [tipoDono] nvarchar(20) NOT NULL DEFAULT N'team',
  [protegidoAte] datetimeoffset(3) NULL,
  [ultimoConquistadoEm] datetimeoffset(3) NULL,
  [totalConquistas] int NOT NULL DEFAULT 0,
  [criadoEm] datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  [atualizadoEm] datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT [zone_conquest_checkpoint_states_pkey] PRIMARY KEY ([id])
);

CREATE TABLE dbo.[zonaConquistaEstadoParticipanteIndividual] (
  [id] nvarchar(36) NOT NULL,
  [partidaId] nvarchar(36) NOT NULL,
  [empresaId] nvarchar(36) NOT NULL,
  [eventoId] nvarchar(36) NOT NULL,
  [criancaId] nvarchar(36) NOT NULL,
  [status] nvarchar(20) NOT NULL DEFAULT N'active',
  [checkpointsLidos] int NOT NULL DEFAULT 0,
  [pontosTotais] decimal(10,2) NOT NULL DEFAULT 0,
  [ranking] int NULL,
  [versao] int NOT NULL DEFAULT 0,
  [iniciadoEm] datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  [finalizadoEm] datetimeoffset(3) NULL,
  [criadoEm] datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  [atualizadoEm] datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  [cor] nvarchar(50) NULL,
  CONSTRAINT [zone_conquest_individual_participant_states_pkey] PRIMARY KEY ([id])
);

CREATE TABLE dbo.[zonaConquistaEstadoZona] (
  [id] nvarchar(36) NOT NULL,
  [partidaId] nvarchar(36) NOT NULL,
  [empresaId] nvarchar(36) NOT NULL,
  [eventoId] nvarchar(36) NOT NULL,
  [zonaId] nvarchar(36) NOT NULL,
  [donoAtualId] nvarchar(36) NULL,
  [tipoDono] nvarchar(20) NOT NULL DEFAULT N'team',
  [disputada] bit NOT NULL DEFAULT 0,
  [totalCheckpoints] int NOT NULL DEFAULT 0,
  [checkpointsConquistados] int NOT NULL DEFAULT 0,
  [ultimaAtualizacaoEm] datetimeoffset(3) NULL,
  [criadoEm] datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  [atualizadoEm] datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT [zone_conquest_zone_states_pkey] PRIMARY KEY ([id])
);

CREATE TABLE dbo.[zonaConquistaLeituraIndividual] (
  [id] nvarchar(36) NOT NULL,
  [partidaId] nvarchar(36) NOT NULL,
  [empresaId] nvarchar(36) NOT NULL,
  [eventoId] nvarchar(36) NOT NULL,
  [brincadeiraId] nvarchar(36) NOT NULL,
  [checkpointId] nvarchar(36) NOT NULL,
  [criancaId] nvarchar(36) NOT NULL,
  [uid] nvarchar(255) NULL,
  [leituraId] nvarchar(36) NULL,
  [pontosAtribuidos] decimal(10,2) NOT NULL DEFAULT 0,
  [versao] int NOT NULL DEFAULT 0,
  [lidoEm] datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  [criadoEm] datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT [zonaConquistaLeituraIndividual_pkey] PRIMARY KEY ([id])
);

CREATE TABLE dbo.[zonaConquistaLeituraTime] (
  [id] nvarchar(36) NOT NULL,
  [partidaId] nvarchar(36) NOT NULL,
  [empresaId] nvarchar(36) NOT NULL,
  [eventoId] nvarchar(36) NOT NULL,
  [brincadeiraId] nvarchar(36) NOT NULL,
  [numeroRonda] int NOT NULL,
  [checkpointId] nvarchar(36) NOT NULL,
  [criancaId] nvarchar(36) NOT NULL,
  [timeId] nvarchar(36) NOT NULL,
  [uid] nvarchar(255) NULL,
  [leituraId] nvarchar(36) NULL,
  [pontosAtribuidos] decimal(10,2) NOT NULL DEFAULT 0,
  [lidoEm] datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  [criadoEm] datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT [zonaConquistaLeituraTime_pkey] PRIMARY KEY ([id])
);

CREATE TABLE dbo.[zonaConquistaPartidaIndividual] (
  [id] nvarchar(36) NOT NULL,
  [empresaId] nvarchar(36) NOT NULL,
  [eventoId] nvarchar(36) NOT NULL,
  [brincadeiraId] nvarchar(36) NOT NULL,
  [status] nvarchar(20) NOT NULL DEFAULT N'active',
  [versao] int NOT NULL DEFAULT 0,
  [iniciadoEm] datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  [finalizadoEm] datetimeoffset(3) NULL,
  [criadoEm] datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  [atualizadoEm] datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT [zonaConquistaPartidaIndividual_pkey] PRIMARY KEY ([id])
);

CREATE TABLE dbo.[zonaConquistaPartidaTime] (
  [id] nvarchar(36) NOT NULL,
  [empresaId] nvarchar(36) NOT NULL,
  [eventoId] nvarchar(36) NOT NULL,
  [brincadeiraId] nvarchar(36) NOT NULL,
  [status] nvarchar(20) NOT NULL DEFAULT N'active',
  [numeroRonda] int NOT NULL DEFAULT 1,
  [timeAtualId] nvarchar(36) NULL,
  [iniciadoEm] datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  [finalizadoEm] datetimeoffset(3) NULL,
  [criadoEm] datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  [atualizadoEm] datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  [vencedorTimeId] nvarchar(36) NULL,
  CONSTRAINT [zonaConquistaPartidaTime_pkey] PRIMARY KEY ([id])
);

CREATE TABLE dbo.[zonaConquistaProtecaoCheckpointIndividual] (
  [id] nvarchar(36) NOT NULL,
  [partidaId] nvarchar(36) NOT NULL,
  [checkpointId] nvarchar(36) NOT NULL,
  [criancaId] nvarchar(36) NOT NULL,
  [protegidoAte] datetimeoffset(3) NOT NULL,
  [criadoEm] datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT [zone_conquest_individual_checkpoint_protection_pkey] PRIMARY KEY ([id])
);

CREATE TABLE dbo.[zonaConquistaTempoTime] (
  [id] nvarchar(36) NOT NULL,
  [partidaId] nvarchar(36) NOT NULL,
  [empresaId] nvarchar(36) NOT NULL,
  [eventoId] nvarchar(36) NOT NULL,
  [timeId] nvarchar(36) NOT NULL,
  [status] nvarchar(20) NOT NULL DEFAULT N'active',
  [zonasDominadas] int NOT NULL DEFAULT 0,
  [checkpointsLidos] int NOT NULL DEFAULT 0,
  [pontosTotais] decimal(10,2) NOT NULL DEFAULT 0,
  [iniciadoEm] datetimeoffset(3) NULL,
  [concluidoEm] datetimeoffset(3) NULL,
  [duracaoMs] int NULL,
  [criadoEm] datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  [atualizadoEm] datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT [zonaConquistaTempoTime_pkey] PRIMARY KEY ([id])
);

-- ===================== ÍNDICES ÚNICOS / COMUNS =====================
CREATE UNIQUE INDEX [criancas_qr_code_key] ON dbo.[crianca] ([codigoQr]) WHERE [codigoQr] IS NOT NULL;
CREATE INDEX [idx_amostrauhf_empresa_balde] ON dbo.[amostraUhf] ([empresaId], [balde]);
CREATE INDEX [idx_game_winner_bonuses_evento] ON dbo.[bonusVencedorJogo] ([eventoId]);
CREATE UNIQUE INDEX [uq_game_winner_bonus_partida] ON dbo.[bonusVencedorJogo] ([partidaId], [tipoJogo]);
CREATE INDEX [idx_brincadeira_paralela_evento] ON dbo.[brincadeiraParalela] ([eventoId], [iniciadoEm]);
CREATE UNIQUE INDEX [uq_brincadeira_paralela_ativa_evento] ON dbo.[brincadeiraParalela] ([eventoId]) WHERE ((status) = 'active');
CREATE UNIQUE INDEX [uq_caca_tesouro_tempo_equipe] ON dbo.[cacaTesourTempo] ([partidaId], [timeId]);
CREATE UNIQUE INDEX [uq_cliente_empresa_id] ON dbo.[cliente] ([empresaId]) WHERE ([empresaId] IS NOT NULL);
-- uq_clientes_empresa_id: igual a outro índice acima (omitido)
CREATE INDEX [idx_flc_crianca] ON dbo.[codigoVinculoFamiliar] ([criancaId]);
CREATE INDEX [idx_flc_empresa] ON dbo.[codigoVinculoFamiliar] ([empresaId]);
CREATE INDEX [idx_flc_qr_code] ON dbo.[codigoVinculoFamiliar] ([valorQrCode]);
CREATE INDEX [idx_flc_status] ON dbo.[codigoVinculoFamiliar] ([status]);
CREATE UNIQUE INDEX [uq_settings_empresa_key] ON dbo.[configuracao] ([empresaId], [chave]);
CREATE UNIQUE INDEX [uqConviteFamiliaHashToken] ON dbo.[conviteFamilia] ([hashToken]);
CREATE INDEX [idx_crianca_perfil] ON dbo.[crianca] ([perfilCriancaId]);
CREATE UNIQUE INDEX [uq_empresa_codigo] ON dbo.[empresa] ([codigo]) WHERE (codigo IS NOT NULL);
CREATE INDEX [idx_event_game_state_empresa] ON dbo.[estadoJogoEvento] ([empresaId]);
CREATE UNIQUE INDEX [uqEventoCodigoConvite] ON dbo.[evento] ([codigoConvite]) WHERE [codigoConvite] IS NOT NULL;
CREATE UNIQUE INDEX [uqFamiliaEventoLoginEvento] ON dbo.[familiaEvento] ([loginId], [eventoId]);
CREATE INDEX [idx_leitura_session_id] ON dbo.[leitura] ([sessaoId]);
-- idx_leituras_session_id: igual a outro índice acima (omitido)
CREATE INDEX [idx_loteuhf_leitor_balde] ON dbo.[loteUhf] ([leitorId], [balde]);
CREATE INDEX [idx_loteuhf_recebido] ON dbo.[loteUhf] ([recebidoEm]);
CREATE INDEX [idx_monster_hunt_team_states_evento] ON dbo.[monsterCacaEstadoTime] ([empresaId], [eventoId], [partidaId]);
CREATE UNIQUE INDEX [uq_monster_hunt_team_state] ON dbo.[monsterCacaEstadoTime] ([partidaId], [timeId]);
CREATE INDEX [idx_monster_hunt_scans_checkpoint] ON dbo.[monsterCacaLeitura] ([partidaId], [checkpointId], [lidoEm]);
CREATE INDEX [idx_monster_hunt_scans_evento] ON dbo.[monsterCacaLeitura] ([empresaId], [eventoId], [partidaId]);
CREATE UNIQUE INDEX [uq_monster_hunt_scan_reading] ON dbo.[monsterCacaLeitura] ([leituraId]) WHERE ([leituraId] IS NOT NULL);
CREATE INDEX [idx_monster_hunt_partidas_evento] ON dbo.[monsterCacaPartida] ([empresaId], [eventoId], [status]);
CREATE UNIQUE INDEX [uq_objeto_brincadeira_paralela_nome] ON dbo.[objetoBrincadeiraParalela] ([empresaId], [nome]) WHERE ((status) = 'active');
CREATE INDEX [idx_partidabomba_evento] ON dbo.[partidaBomba] ([eventoId], [status]);
CREATE INDEX [idx_partidarefem_evento] ON dbo.[partidaRefem] ([eventoId], [status]);
CREATE INDEX [idx_perfilcrianca_empresa] ON dbo.[perfilCrianca] ([empresaId]);
CREATE UNIQUE INDEX [uqPerfilVinculoFamiliar] ON dbo.[perfilVinculoFamiliar] ([loginId], [perfilCriancaId]);
CREATE UNIQUE INDEX [uq_pontoverificacao_empresa_codigo] ON dbo.[pontoVerificacao] ([empresaId], [codigo]) WHERE [empresaId] IS NOT NULL AND [codigo] IS NOT NULL;
CREATE UNIQUE INDEX [uq_pontoverificacao_empresa_numcheck] ON dbo.[pontoVerificacao] ([empresaId], [numCheck]) WHERE ([numCheck] IS NOT NULL) AND [empresaId] IS NOT NULL;
CREATE UNIQUE INDEX [uq_pontoverificacao_id] ON dbo.[pontoVerificacao] ([id]);
CREATE UNIQUE INDEX [uq_pontoverificacao_mac] ON dbo.[pontoVerificacao] ([macAddress]) WHERE ([macAddress] IS NOT NULL);
CREATE UNIQUE INDEX [ux_pulseira_empresa_epc] ON dbo.[pulseira] ([empresaId], [epc]) WHERE (epc IS NOT NULL);
CREATE INDEX [idx_roundbomba_partida] ON dbo.[roundBomba] ([partidaId], [numero]);
CREATE INDEX [idx_roundbomba_status] ON dbo.[roundBomba] ([status]);
CREATE INDEX [idx_roundrefem_partida] ON dbo.[roundRefem] ([partidaId], [numero]);
CREATE INDEX [idx_roundrefem_status] ON dbo.[roundRefem] ([status]);
CREATE INDEX [idx_game_sessions_brincadeira] ON dbo.[sessaoJogo] ([brincadeiraId]);
CREATE INDEX [idx_game_sessions_evento] ON dbo.[sessaoJogo] ([eventoId]);
CREATE INDEX [idx_game_sessions_status] ON dbo.[sessaoJogo] ([status]);
CREATE INDEX [sincronizacaoFilaEnviadoEm] ON dbo.[sincronizacaoFila] ([enviadoEm]) WHERE ([enviadoEm] IS NOT NULL);
CREATE INDEX [sincronizacaoFilaPendente] ON dbo.[sincronizacaoFila] ([filaId]) WHERE ([enviadoEm] IS NULL);
CREATE UNIQUE INDEX [uq_vencedor_paralela_crianca] ON dbo.[vencedorBrincadeiraParalela] ([paralelaId], [criancaId]);
CREATE UNIQUE INDEX [uq_vencedor_paralela_posicao] ON dbo.[vencedorBrincadeiraParalela] ([paralelaId], [posicao]);
CREATE INDEX [ixVinculoFamiliarPerfil] ON dbo.[vinculoFamiliar] ([perfilCriancaId]);
CREATE UNIQUE INDEX [uqVinculoFamiliarLoginCrianca] ON dbo.[vinculoFamiliar] ([loginId], [criancaId]);
CREATE INDEX [idx_zone_checkpoint_state_owner] ON dbo.[zonaConquistaEstadoCheckpoint] ([partidaId], [donoAtualId]);
CREATE INDEX [idx_zone_checkpoint_state_partida] ON dbo.[zonaConquistaEstadoCheckpoint] ([partidaId], [checkpointId]);
CREATE INDEX [idx_zcips_crianca] ON dbo.[zonaConquistaEstadoParticipanteIndividual] ([criancaId]);
CREATE INDEX [idx_zcips_partida] ON dbo.[zonaConquistaEstadoParticipanteIndividual] ([partidaId]);
CREATE INDEX [idx_zone_individual_states_partida] ON dbo.[zonaConquistaEstadoParticipanteIndividual] ([partidaId], [criancaId]);
CREATE INDEX [idx_zone_zone_state_owner] ON dbo.[zonaConquistaEstadoZona] ([partidaId], [donoAtualId]);
CREATE INDEX [idx_zone_zone_state_partida] ON dbo.[zonaConquistaEstadoZona] ([partidaId], [zonaId]);
CREATE INDEX [idx_zcis_crianca] ON dbo.[zonaConquistaLeituraIndividual] ([criancaId]);
CREATE INDEX [idx_zcis_leitura] ON dbo.[zonaConquistaLeituraIndividual] ([leituraId]);
CREATE INDEX [idx_zcis_partida] ON dbo.[zonaConquistaLeituraIndividual] ([partidaId]);
CREATE INDEX [idx_zone_individual_scans_partida] ON dbo.[zonaConquistaLeituraIndividual] ([partidaId], [criancaId]);
CREATE UNIQUE INDEX [uq_zone_individual_scan_reading] ON dbo.[zonaConquistaLeituraIndividual] ([leituraId]) WHERE ([leituraId] IS NOT NULL);
CREATE INDEX [idx_zone_team_scans_partida] ON dbo.[zonaConquistaLeituraTime] ([partidaId], [numeroRonda]);
CREATE UNIQUE INDEX [uq_zone_team_scan_reading] ON dbo.[zonaConquistaLeituraTime] ([leituraId]) WHERE ([leituraId] IS NOT NULL);
CREATE INDEX [idx_zcip_evento] ON dbo.[zonaConquistaPartidaIndividual] ([eventoId]);
CREATE INDEX [idx_zcip_status] ON dbo.[zonaConquistaPartidaIndividual] ([status]);
CREATE INDEX [idx_zone_individual_partidas_evento] ON dbo.[zonaConquistaPartidaIndividual] ([eventoId], [status]);
CREATE INDEX [idx_zone_team_partidas_evento] ON dbo.[zonaConquistaPartidaTime] ([eventoId], [status]);
CREATE INDEX [idx_zone_individual_protection_checkpoint] ON dbo.[zonaConquistaProtecaoCheckpointIndividual] ([checkpointId], [protegidoAte]);
CREATE INDEX [idx_zone_team_tempos_partida] ON dbo.[zonaConquistaTempoTime] ([partidaId], [timeId]);

-- ========================= CHAVES ESTRANGEIRAS =========================
ALTER TABLE dbo.[amostraUhf] ADD CONSTRAINT [amostraUhf_antenaId_fkey] FOREIGN KEY ([antenaId]) REFERENCES dbo.[antenaUhf] ([antenaId]) ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE dbo.[antenaUhf] ADD CONSTRAINT [antenaUhf_leitorId_fkey] FOREIGN KEY ([leitorId]) REFERENCES dbo.[leitorUhf] ([leitorId]) ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE dbo.[brincadeira] ADD CONSTRAINT [FK_brincadeiras_empresas] FOREIGN KEY ([empresaId]) REFERENCES dbo.[empresa] ([empresaId]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE dbo.[codigoVinculoFamiliar] ADD CONSTRAINT [family_linking_codes_crianca_id_fkey] FOREIGN KEY ([criancaId]) REFERENCES dbo.[crianca] ([criancaId]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE dbo.[codigoVinculoFamiliar] ADD CONSTRAINT [family_linking_codes_empresa_id_fkey] FOREIGN KEY ([empresaId]) REFERENCES dbo.[empresa] ([empresaId]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE dbo.[codigoVinculoFamiliar] ADD CONSTRAINT [family_linking_codes_evento_id_fkey] FOREIGN KEY ([eventoId]) REFERENCES dbo.[evento] ([eventoId]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE dbo.[codigoVinculoFamiliar] ADD CONSTRAINT [family_linking_codes_used_by_login_id_fkey] FOREIGN KEY ([usadoPorLoginId]) REFERENCES dbo.[login] ([loginId]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE dbo.[crianca] ADD CONSTRAINT [FK__criancas__evento__6E01572D] FOREIGN KEY ([eventoId]) REFERENCES dbo.[evento] ([eventoId]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE dbo.[crianca] ADD CONSTRAINT [FK__criancas__time_i__6EF57B66] FOREIGN KEY ([timeId]) REFERENCES dbo.[time] ([timeId]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE dbo.[crianca] ADD CONSTRAINT [FK_criancas_empresas] FOREIGN KEY ([empresaId]) REFERENCES dbo.[empresa] ([empresaId]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE dbo.[crianca] ADD CONSTRAINT [crianca_perfilCriancaId_fkey] FOREIGN KEY ([perfilCriancaId]) REFERENCES dbo.[perfilCrianca] ([perfilCriancaId]) ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE dbo.[criancaConquista] ADD CONSTRAINT [FK__crianca_c__conqu__17F790F9] FOREIGN KEY ([conquistaId]) REFERENCES dbo.[conquista] ([conquistaId]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE dbo.[criancaConquista] ADD CONSTRAINT [FK__crianca_c__crian__17036CC0] FOREIGN KEY ([criancaId]) REFERENCES dbo.[crianca] ([criancaId]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE dbo.[etiquetaCheckpoint] ADD CONSTRAINT [FK__checkpoin__check__01142BA1] FOREIGN KEY ([checkpointId]) REFERENCES dbo.[pontoVerificacao] ([checkpointId]) ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE dbo.[evento] ADD CONSTRAINT [FK__eventos__cliente__5441852A] FOREIGN KEY ([clienteId]) REFERENCES dbo.[cliente] ([clienteId]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE dbo.[evento] ADD CONSTRAINT [FK_eventos_empresas] FOREIGN KEY ([empresaId]) REFERENCES dbo.[empresa] ([empresaId]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE dbo.[eventoBrincadeira] ADD CONSTRAINT [FK__evento_br__brinc__619B8048] FOREIGN KEY ([brincadeiraId]) REFERENCES dbo.[brincadeira] ([brincadeiraId]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE dbo.[eventoBrincadeira] ADD CONSTRAINT [FK__evento_br__event__60A75C0F] FOREIGN KEY ([eventoId]) REFERENCES dbo.[evento] ([eventoId]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE dbo.[leitura] ADD CONSTRAINT [FK__leituras__checkp__06CD04F7] FOREIGN KEY ([checkpointId]) REFERENCES dbo.[pontoVerificacao] ([checkpointId]) ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE dbo.[leitura] ADD CONSTRAINT [FK__leituras__crianc__07C12930] FOREIGN KEY ([criancaId]) REFERENCES dbo.[crianca] ([criancaId]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE dbo.[leitura] ADD CONSTRAINT [FK_leituras_empresas] FOREIGN KEY ([empresaId]) REFERENCES dbo.[empresa] ([empresaId]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE dbo.[log] ADD CONSTRAINT [FK__logs__cliente_id__208CD6FA] FOREIGN KEY ([clienteId]) REFERENCES dbo.[cliente] ([clienteId]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE dbo.[log] ADD CONSTRAINT [FK__logs__evento_id__2180FB33] FOREIGN KEY ([eventoId]) REFERENCES dbo.[evento] ([eventoId]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE dbo.[login] ADD CONSTRAINT [FK__logins__empresa___6BE40491] FOREIGN KEY ([empresaId]) REFERENCES dbo.[empresa] ([empresaId]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE dbo.[loteUhf] ADD CONSTRAINT [loteUhf_leitorId_fkey] FOREIGN KEY ([leitorId]) REFERENCES dbo.[leitorUhf] ([leitorId]) ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE dbo.[mensagemDisplay] ADD CONSTRAINT [FK__mensagens__event__1CBC4616] FOREIGN KEY ([eventoId]) REFERENCES dbo.[evento] ([eventoId]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE dbo.[partidaBomba] ADD CONSTRAINT [partidaBomba_eventoId_fkey] FOREIGN KEY ([eventoId]) REFERENCES dbo.[evento] ([eventoId]) ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE dbo.[partidaRefem] ADD CONSTRAINT [partidaRefem_eventoId_fkey] FOREIGN KEY ([eventoId]) REFERENCES dbo.[evento] ([eventoId]) ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE dbo.[perfilCrianca] ADD CONSTRAINT [perfilCrianca_ultimoEventoId_fkey] FOREIGN KEY ([ultimoEventoId]) REFERENCES dbo.[evento] ([eventoId]) ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE dbo.[pontoVerificacao] ADD CONSTRAINT [FK__checkpoin__event__7B5B524B] FOREIGN KEY ([eventoId]) REFERENCES dbo.[evento] ([eventoId]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE dbo.[pontoVerificacao] ADD CONSTRAINT [FK__checkpoin__owner_crianca] FOREIGN KEY ([territorioDonosCriancaId]) REFERENCES dbo.[crianca] ([criancaId]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE dbo.[pontoVerificacao] ADD CONSTRAINT [FK__checkpoin__terri__7C4F7684] FOREIGN KEY ([territorioDonoTimeId]) REFERENCES dbo.[time] ([timeId]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE dbo.[pontoVerificacao] ADD CONSTRAINT [FK_checkpoints_empresas] FOREIGN KEY ([empresaId]) REFERENCES dbo.[empresa] ([empresaId]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE dbo.[pontuacao] ADD CONSTRAINT [FK__pontuacoe__check__0F624AF8] FOREIGN KEY ([checkpointId]) REFERENCES dbo.[pontoVerificacao] ([checkpointId]) ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE dbo.[pontuacao] ADD CONSTRAINT [FK__pontuacoe__crian__0D7A0286] FOREIGN KEY ([criancaId]) REFERENCES dbo.[crianca] ([criancaId]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE dbo.[pontuacao] ADD CONSTRAINT [FK__pontuacoe__event__0C85DE4D] FOREIGN KEY ([eventoId]) REFERENCES dbo.[evento] ([eventoId]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE dbo.[pontuacao] ADD CONSTRAINT [FK_pontuacoes_empresas] FOREIGN KEY ([empresaId]) REFERENCES dbo.[empresa] ([empresaId]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE dbo.[pulseira] ADD CONSTRAINT [FK__pulseiras__crian__73BA3083] FOREIGN KEY ([criancaId]) REFERENCES dbo.[crianca] ([criancaId]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE dbo.[pulseira] ADD CONSTRAINT [FK_pulseiras_empresas] FOREIGN KEY ([empresaId]) REFERENCES dbo.[empresa] ([empresaId]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE dbo.[roundBomba] ADD CONSTRAINT [roundBomba_partidaId_fkey] FOREIGN KEY ([partidaId]) REFERENCES dbo.[partidaBomba] ([partidaId]) ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE dbo.[roundRefem] ADD CONSTRAINT [roundRefem_partidaId_fkey] FOREIGN KEY ([partidaId]) REFERENCES dbo.[partidaRefem] ([partidaId]) ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE dbo.[time] ADD CONSTRAINT [FK__times__evento_id__66603565] FOREIGN KEY ([eventoId]) REFERENCES dbo.[evento] ([eventoId]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE dbo.[time] ADD CONSTRAINT [FK_times_empresas] FOREIGN KEY ([empresaId]) REFERENCES dbo.[empresa] ([empresaId]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE dbo.[zona] ADD CONSTRAINT [FK__zonas__evento_id__25518C17] FOREIGN KEY ([eventoId]) REFERENCES dbo.[evento] ([eventoId]) ON DELETE NO ACTION ON UPDATE NO ACTION;
