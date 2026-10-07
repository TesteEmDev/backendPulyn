-- Migration: Rename all tables from plural to singular
-- Better naming convention and consistency

ALTER TABLE brincadeiras RENAME TO brincadeira;
ALTER TABLE cacaTesourPartidas RENAME TO cacaTesourPartida;
ALTER TABLE cacaTesourScans RENAME TO cacaTesourScan;
ALTER TABLE chamadosSuport RENAME TO chamadoSuport;
ALTER TABLE clientes RENAME TO cliente;
ALTER TABLE codigosVinculoFamiliar RENAME TO codigoVinculoFamiliar;
ALTER TABLE configuracoes RENAME TO configuracao;
ALTER TABLE conquistas RENAME TO conquista;
ALTER TABLE conviteFamilia RENAME TO conviteFamilia; -- stays as is
ALTER TABLE criancaConquistas RENAME TO criancaConquista;
ALTER TABLE criancas RENAME TO crianca;
ALTER TABLE etiquetasCheckpoint RENAME TO etiquetaCheckpoint;
ALTER TABLE eventoBrincadeiras RENAME TO eventoBrincadeira;
ALTER TABLE eventos RENAME TO evento;
ALTER TABLE leituras RENAME TO leitura;
ALTER TABLE logs RENAME TO log;
ALTER TABLE mensagensDisplay RENAME TO mensagemDisplay;
ALTER TABLE monsterCacaLeituras RENAME TO monsterCacaLeitura;
ALTER TABLE monsterCacaPartidas RENAME TO monsterCacaPartida;
ALTER TABLE pontoVerificacao RENAME TO pontoVerificacao; -- stays as is
ALTER TABLE pontuacoes RENAME TO pontuacao;
ALTER TABLE pulseiras RENAME TO pulseira;
ALTER TABLE sessoesJogo RENAME TO sessaoJogo;
ALTER TABLE times RENAME TO time;
ALTER TABLE vinculoFamiliar RENAME TO vinculoFamiliar; -- stays as is
ALTER TABLE zonas RENAME TO zona;
ALTER TABLE zonasConquistaLeituraIndividual RENAME TO zonaConquistaLeituraIndividual;
ALTER TABLE zonasConquistaLeituraTime RENAME TO zonaConquistaLeituraTime;
ALTER TABLE zonasConquistaPartidaIndividual RENAME TO zonaConquistaPartidaIndividual;
ALTER TABLE zonasConquistaPartidaTime RENAME TO zonaConquistaPartidaTime;
ALTER TABLE zonasConquistaProtecaoCheckpointIndividual RENAME TO zonaConquistaProtecaoCheckpointIndividual;
ALTER TABLE zonasConquistaTempoTime RENAME TO zonaConquistaTempoTime;
