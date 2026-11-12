-- banco-base.sql - estrutura do banco do Pulyn, SEM DADOS. Gerado por gerar-banco-base.ps1 em 2026-11-12 16:41.
-- Nao edite a mao: gere de novo. As migracoes do backend completam o que faltar quando o servico sobe.
--
-- PostgreSQL database dump
--


-- Dumped from database version 18.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: atualizacaoRegistrar(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public."atualizacaoRegistrar"() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      NEW."atualizadoEm" := now();
      RETURN NEW;
    END
    $$;


--
-- Name: fn_pontoverificacao_chave(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_pontoverificacao_chave() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF NEW."checkpointId" IS NULL OR NEW."checkpointId" = '' THEN
        NEW."checkpointId" := NEW."id"::text;
      END IF;
      RETURN NEW;
    END;
    $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: amostraUhf; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."amostraUhf" (
    balde timestamp with time zone NOT NULL,
    "antenaId" character varying(36) NOT NULL,
    codigo character varying(24) NOT NULL,
    "empresaId" character varying(36) NOT NULL,
    n integer NOT NULL,
    ciclos integer NOT NULL,
    "rssiMed" numeric NOT NULL,
    "rssiMax" numeric NOT NULL,
    "vistoEm" timestamp with time zone
);


--
-- Name: antenaUhf; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."antenaUhf" (
    "antenaId" character varying(36) NOT NULL,
    "leitorId" character varying(36) NOT NULL,
    porta integer NOT NULL,
    nome character varying(100),
    "mapaX" numeric,
    "mapaY" numeric,
    "direcaoGraus" numeric,
    "raioMetros" numeric DEFAULT 1.2 NOT NULL,
    rssi1m numeric,
    expoente numeric DEFAULT 4 NOT NULL,
    ativa boolean DEFAULT true NOT NULL,
    CONSTRAINT "antenaUhf_porta_check" CHECK (((porta >= 1) AND (porta <= 4)))
);


--
-- Name: bonusVencedorJogo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."bonusVencedorJogo" (
    id character varying(36) NOT NULL,
    "empresaId" character varying(36),
    "eventoId" character varying(36) NOT NULL,
    "partidaId" character varying(36) NOT NULL,
    "tipoJogo" character varying(50) NOT NULL,
    "timeId" character varying(36) NOT NULL,
    "pontosPorMembro" integer DEFAULT 0 NOT NULL,
    "membrosPremiados" integer DEFAULT 0 NOT NULL,
    "criadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "atualizadoEm" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: brincadeira; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brincadeira (
    "brincadeiraId" character varying(36) NOT NULL,
    nome character varying(100) NOT NULL,
    descricao character varying(500),
    regras text,
    tipo character varying(20) DEFAULT 'team'::character varying,
    duracao integer DEFAULT 30,
    status character varying(20) DEFAULT 'active'::character varying,
    "pontosPadrao" integer DEFAULT 10,
    "criadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "empresaId" character varying(36),
    "tipoJogo" character varying(50) DEFAULT 'standard'::character varying,
    checkpoints text,
    "eventoId" text,
    "configuracaoJogo" text,
    "atualizadoEm" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: brincadeiraParalela; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."brincadeiraParalela" (
    id character varying(36) NOT NULL,
    "empresaId" character varying(36) NOT NULL,
    "eventoId" character varying(36) NOT NULL,
    "checkpointId" character varying(36) NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    premios character varying(100) DEFAULT '50,40,30'::character varying NOT NULL,
    "iniciadoPor" character varying(36),
    "iniciadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "finalizadoEm" timestamp with time zone,
    "motivoFim" character varying(30),
    "nomeObjeto" character varying(100),
    "criadoEm" timestamp with time zone DEFAULT now() NOT NULL,
    "atualizadoEm" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cacaTesourPartida; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."cacaTesourPartida" (
    "partidaId" character varying(36) NOT NULL,
    "eventoId" character varying(36) NOT NULL,
    "brincadeiraId" character varying(36) NOT NULL,
    status character varying(20) NOT NULL,
    "numeroRonda" integer NOT NULL,
    "checkpointAlvoId" character varying(36),
    "checkpointsCompletadosIds" text,
    "iniciadoEm" timestamp with time zone NOT NULL,
    "rondaIniciadaEm" timestamp with time zone NOT NULL,
    "finalizadoEm" timestamp with time zone,
    "timeInicialId" character varying(36),
    "timeVezId" character varying(36),
    "vezDisponvelEm" timestamp with time zone,
    "criadoEm" timestamp with time zone DEFAULT now() NOT NULL,
    "atualizadoEm" timestamp with time zone DEFAULT now() NOT NULL,
    "checkpointsUsadosIds" text,
    "checkpointFinalId" text
);


--
-- Name: cacaTesourScan; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."cacaTesourScan" (
    "scanId" character varying(36) NOT NULL,
    "partidaId" character varying(36) NOT NULL,
    "eventoId" character varying(36) NOT NULL,
    "brincadeiraId" character varying(36) NOT NULL,
    "numeroRonda" integer NOT NULL,
    "checkpointId" character varying(36) NOT NULL,
    "criancaId" character varying(36) NOT NULL,
    "timeId" character varying(36) NOT NULL,
    uid character varying(100) NOT NULL,
    "leroEm" timestamp with time zone NOT NULL,
    "criadoEm" timestamp with time zone DEFAULT now() NOT NULL,
    "atualizadoEm" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cacaTesourTempo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."cacaTesourTempo" (
    "tempoId" character varying(36) NOT NULL,
    "partidaId" character varying(36) NOT NULL,
    "eventoId" character varying(36) NOT NULL,
    "timeId" character varying(36) NOT NULL,
    "iniciadoEm" timestamp with time zone,
    "concluidoEm" timestamp with time zone,
    "duracaoMs" bigint,
    "criadoEm" timestamp with time zone DEFAULT now() NOT NULL,
    "atualizadoEm" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: chamadoSuport; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."chamadoSuport" (
    "ticketId" character varying(36) NOT NULL,
    "empresaId" character varying(36),
    cliente character varying(255) NOT NULL,
    assunto character varying(255) NOT NULL,
    status character varying(20) DEFAULT 'aberto'::character varying NOT NULL,
    prioridade character varying(20) DEFAULT 'media'::character varying NOT NULL,
    descricao text,
    "atribuidoPara" character varying(255),
    "criadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "atualizadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "tipoChamado" character varying(20) DEFAULT 'chamado'::character varying NOT NULL,
    itens text
);


--
-- Name: etiquetaCheckpoint; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."etiquetaCheckpoint" (
    "tagId" integer NOT NULL,
    "checkpointId" character varying(36) NOT NULL,
    "tagUid" character varying(50) NOT NULL,
    "criadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: checkpoint_tags_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."etiquetaCheckpoint" ALTER COLUMN "tagId" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.checkpoint_tags_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: cliente; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cliente (
    "clienteId" character varying(36) NOT NULL,
    nome character varying(100) NOT NULL,
    cidade character varying(100),
    estado character varying(2),
    email character varying(100) NOT NULL,
    telefone character varying(20),
    plano character varying(20) DEFAULT 'starter'::character varying,
    status character varying(20) DEFAULT 'active'::character varying,
    "eventosRealizados" integer DEFAULT 0,
    "ultimoAcesso" timestamp with time zone,
    "criadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "empresaId" character varying(36),
    endereco character varying(255),
    "frequenciaBackup" character varying(20) DEFAULT 'daily'::character varying,
    "logoDados" text,
    "logoNome" character varying(255),
    "logoTipo" character varying(100),
    "atualizadoEm" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: codigoEmail; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."codigoEmail" (
    "loginId" character varying(36) NOT NULL,
    tipo character varying(20) NOT NULL,
    "codigoHash" character varying(255) NOT NULL,
    "expiraEm" timestamp with time zone NOT NULL,
    tentativas integer DEFAULT 0 NOT NULL,
    "criadoEm" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: codigoVinculoFamiliar; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."codigoVinculoFamiliar" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "criancaId" character varying(36) NOT NULL,
    "eventoId" character varying(36) NOT NULL,
    "empresaId" character varying(36) NOT NULL,
    "valorQrCode" character varying(50) NOT NULL,
    "urlRastreio" character varying(500) NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying,
    "criadoEm" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    "expiraEm" timestamp without time zone NOT NULL,
    "usadoEm" timestamp without time zone,
    "usadoPorLoginId" character varying(36),
    "atualizadoEm" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: configuracao; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.configuracao (
    "configuracaoId" integer NOT NULL,
    chave character varying(100) NOT NULL,
    valor text,
    "atualizadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "empresaId" text,
    "criadoEm" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: configuracao_configuracaoId_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.configuracao ALTER COLUMN "configuracaoId" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."configuracao_configuracaoId_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: conquista; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conquista (
    "conquistaId" character varying(36) NOT NULL,
    nome character varying(100) NOT NULL,
    descricao character varying(500),
    icone character varying(50),
    cor character varying(20),
    "tipoRequerido" character varying(50),
    "valorRequerido" integer,
    "pontosBonus" integer DEFAULT 0,
    "criadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: controleEventoEmpresa; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."controleEventoEmpresa" (
    "empresaId" character varying(36) NOT NULL,
    "eventoId" character varying(36),
    "atualizadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "criadoEm" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: conviteFamilia; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."conviteFamilia" (
    "conviteId" character varying(36) NOT NULL,
    "empresaId" character varying(36) NOT NULL,
    "eventoId" character varying(36) NOT NULL,
    "criancaId" character varying(36),
    email character varying(255),
    "hashToken" character varying(128) NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    "expiramEm" timestamp with time zone NOT NULL,
    "usadoEm" timestamp with time zone,
    "criadoPor" character varying(36),
    "criadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "atualizadoEm" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crianca; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crianca (
    "criancaId" character varying(36) NOT NULL,
    "eventoId" character varying(36) NOT NULL,
    "timeId" character varying(36),
    nome character varying(100) NOT NULL,
    apelido character varying(100),
    idade integer,
    avatar character varying(64) DEFAULT '??'::character varying,
    "codigoPulseira" character varying(50),
    pontos integer DEFAULT 0,
    status character varying(20) DEFAULT 'active'::character varying,
    "criadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "empresaId" character varying(36),
    "codigoQr" character varying,
    "ultimaPulseira" character varying(50),
    "perfilCriancaId" character varying(36),
    "numeroJogador" integer,
    "atualizadoEm" timestamp with time zone DEFAULT now() NOT NULL,
    cor character varying(20),
    "dataNascimento" date
);


--
-- Name: criancaConquista; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."criancaConquista" (
    "criancaId" character varying(36) NOT NULL,
    "conquistaId" character varying(36) NOT NULL,
    "desbloqueadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "criadoEm" timestamp with time zone DEFAULT now() NOT NULL,
    "atualizadoEm" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: empresa; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.empresa (
    "empresaId" character varying(36) NOT NULL,
    nome character varying(255) NOT NULL,
    cidade character varying(100),
    estado character varying(2),
    telefone character varying(20),
    plano character varying(50) DEFAULT 'starter'::character varying,
    status character varying(50) DEFAULT 'active'::character varying,
    "dataCriacao" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "dataAtualizacao" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    latitude double precision,
    longitude double precision,
    cnpj character varying(14),
    "dadosPlanoPiso" text,
    "nomePlanoPiso" character varying(255),
    "tipoPlanoPiso" character varying(100),
    "dadosZonas" text,
    codigo character varying(12),
    "criadoEm" timestamp with time zone DEFAULT now() NOT NULL,
    "atualizadoEm" timestamp with time zone DEFAULT now() NOT NULL,
    "mapaMetrosPorUnidade" numeric,
    "codigoTelao" character varying(40)
);


--
-- Name: estadoJogoEvento; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."estadoJogoEvento" (
    "eventoId" character varying(36) NOT NULL,
    "empresaId" character varying(36) NOT NULL,
    modo character varying(20) DEFAULT 'idle'::character varying NOT NULL,
    "tipoJogo" character varying(50) DEFAULT 'none'::character varying NOT NULL,
    "brincadeiraId" character varying(36),
    "nomeBrincadeira" character varying(255),
    "iniciadoEm" timestamp with time zone,
    "paradoEm" timestamp with time zone,
    "atualizadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "criadoEm" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: evento; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.evento (
    "eventoId" character varying(36) NOT NULL,
    "clienteId" character varying(36),
    nome character varying(100) NOT NULL,
    descricao character varying(500),
    data date NOT NULL,
    hora time without time zone,
    duracao integer DEFAULT 120,
    status character varying(20) DEFAULT 'scheduled'::character varying,
    "exibirDisplay" integer DEFAULT 1,
    "exibirLocalizacao" integer DEFAULT 0,
    "criadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "empresaId" character varying(36),
    "tipoJogoAtivo" character varying(50) DEFAULT 'none'::character varying,
    "brincadeiraAtivaId" character varying(36),
    "dadosPlanoPiso" text,
    "nomePlanoPiso" character varying(255),
    "tipoPlanoPiso" character varying(100),
    "dadosZonas" text,
    "nomeResponsavel" character varying(150),
    "iniciadoEm" timestamp with time zone,
    "finalizadoEm" timestamp with time zone,
    "autoInicio" integer DEFAULT 0,
    "autoFim" integer DEFAULT 0,
    "atualizadoEm" timestamp with time zone DEFAULT now() NOT NULL,
    "codigoConvite" character varying(8)
);


--
-- Name: eventoBrincadeira; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."eventoBrincadeira" (
    "eventoId" character varying(36) NOT NULL,
    "brincadeiraId" character varying(36) NOT NULL,
    ordem integer DEFAULT 0,
    "multiplicadorPontos" integer DEFAULT 1,
    "criadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: eventoCheckpoint; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."eventoCheckpoint" (
    id character varying(36) NOT NULL,
    "empresaId" character varying(36),
    "eventoId" character varying(36) NOT NULL,
    "checkpointId" character varying(36) NOT NULL,
    "numCheck" integer,
    nome character varying(255),
    "usadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: familiaEvento; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."familiaEvento" (
    "familiaEventoId" character varying(36) NOT NULL,
    "loginId" character varying(36) NOT NULL,
    "eventoId" character varying(36) NOT NULL,
    "empresaId" character varying(36),
    "conviteId" character varying(36),
    "criadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: leitorUhf; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."leitorUhf" (
    "leitorId" character varying(36) NOT NULL,
    "empresaId" character varying(36) NOT NULL,
    "moduleId" character varying(16) NOT NULL,
    nome character varying(100) NOT NULL,
    "chaveHash" character varying(64) NOT NULL,
    "potenciaDbm" integer DEFAULT 25 NOT NULL,
    "rssiMin" integer DEFAULT '-75'::integer NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    "ultimoLoteEm" timestamp with time zone,
    "ultimoSeq" bigint DEFAULT 0 NOT NULL,
    fw character varying(20),
    "ultimasPortas" character varying(20),
    "criadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: leitura; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leitura (
    "leituraId" character varying(36) NOT NULL,
    "checkpointId" character varying(36) NOT NULL,
    "criancaId" character varying(36),
    uid character varying(50) NOT NULL,
    "brincadeiraId" text,
    autorizado integer DEFAULT 0,
    "pontosAtribuidos" integer DEFAULT 0,
    "forcaSinal" integer,
    "criadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "empresaId" character varying(36),
    "sessaoId" character varying(36),
    "atualizadoEm" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.log (
    "logId" integer NOT NULL,
    tipo character varying(20) NOT NULL,
    "clienteId" character varying(36),
    "eventoId" character varying(36),
    mensagem character varying(500) NOT NULL,
    detalhes text,
    "criadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "empresaId" character varying(36),
    "atualizadoEm" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: login; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.login (
    "loginId" character varying(36) NOT NULL,
    "empresaId" character varying(36) NOT NULL,
    email character varying(255) NOT NULL,
    senha character varying(255) NOT NULL,
    status character varying(50) DEFAULT 'active'::character varying,
    "ultimoAcesso" timestamp with time zone,
    "dataCriacao" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "dataAtualizacao" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    perfil character varying(50) DEFAULT 'admin'::character varying,
    "nomeFamilia" character varying(255),
    "criadoEm" timestamp with time zone DEFAULT now() NOT NULL,
    "atualizadoEm" timestamp with time zone DEFAULT now() NOT NULL,
    "perfisExtras" text,
    telefone character varying(20),
    "tokenVersao" integer DEFAULT 0 NOT NULL,
    "emailConfirmadoEm" timestamp with time zone,
    "senhaTemporaria" boolean DEFAULT false NOT NULL
);


--
-- Name: logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.log ALTER COLUMN "logId" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: loteUhf; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."loteUhf" (
    "leitorId" character varying(36) NOT NULL,
    seq bigint NOT NULL,
    "recebidoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    balde timestamp with time zone NOT NULL,
    total integer NOT NULL,
    ciclos integer
);


--
-- Name: mensagemDisplay; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."mensagemDisplay" (
    "mensagemId" character varying(36) NOT NULL,
    "eventoId" character varying(36) NOT NULL,
    texto character varying(500) NOT NULL,
    tipo character varying(20) DEFAULT 'custom'::character varying,
    remetente character varying(100),
    "enviadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "criadoEm" timestamp with time zone DEFAULT now() NOT NULL,
    "atualizadoEm" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: monsterCacaEstadoTime; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."monsterCacaEstadoTime" (
    id character varying(36) NOT NULL,
    "partidaId" character varying(36) NOT NULL,
    "empresaId" character varying(36) NOT NULL,
    "eventoId" character varying(36) NOT NULL,
    "timeId" character varying(36) NOT NULL,
    vida integer DEFAULT 500 NOT NULL,
    "vidaMaxima" integer DEFAULT 500 NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    versao integer DEFAULT 0 NOT NULL,
    "derrotadoEm" timestamp with time zone,
    "vitoriaEm" timestamp with time zone,
    "criadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "atualizadoEm" timestamp with time zone DEFAULT now() NOT NULL,
    "monstroTipo" character varying(20),
    "monstroCor" character varying(20)
);


--
-- Name: monsterCacaLeitura; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."monsterCacaLeitura" (
    id character varying(36) NOT NULL,
    "partidaId" character varying(36) NOT NULL,
    "empresaId" character varying(36) NOT NULL,
    "eventoId" character varying(36) NOT NULL,
    "brincadeiraId" character varying(36),
    "checkpointId" character varying(36) NOT NULL,
    "criancaId" character varying(36) NOT NULL,
    "timeId" character varying(36),
    uid character varying(255),
    "leituraId" character varying(36),
    "tipoAtaque" character varying(30) NOT NULL,
    dano integer DEFAULT 0 NOT NULL,
    "vidaMonstroApos" integer NOT NULL,
    "monstroDerrotado" boolean DEFAULT false NOT NULL,
    versao integer DEFAULT 0 NOT NULL,
    "lidoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "criadoEm" timestamp with time zone DEFAULT now() NOT NULL,
    "atualizadoEm" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: monsterCacaPartida; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."monsterCacaPartida" (
    id character varying(36) NOT NULL,
    "empresaId" character varying(36) NOT NULL,
    "eventoId" character varying(36) NOT NULL,
    "brincadeiraId" character varying(36),
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    vida integer DEFAULT 100 NOT NULL,
    "vidaMaxima" integer DEFAULT 100 NOT NULL,
    "danoNormal" integer DEFAULT 10 NOT NULL,
    "danoCheckpointEspecial" integer DEFAULT 30 NOT NULL,
    "danoAtaqueEspecial" integer DEFAULT 50 NOT NULL,
    "checkpointEspecialId" character varying(36),
    "timeVencedorId" character varying(36),
    versao integer DEFAULT 0 NOT NULL,
    "iniciadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "finalizadoEm" timestamp with time zone,
    "criadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "atualizadoEm" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: objetoBrincadeiraParalela; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."objetoBrincadeiraParalela" (
    id character varying(36) NOT NULL,
    "empresaId" character varying(36) NOT NULL,
    nome character varying(80) NOT NULL,
    status character varying(10) DEFAULT 'active'::character varying NOT NULL,
    "criadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "atualizadoEm" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: partidaBomba; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."partidaBomba" (
    "partidaId" character varying(36) NOT NULL,
    "eventoId" character varying(36) NOT NULL,
    "empresaId" character varying(36) NOT NULL,
    "brincadeiraId" character varying(36),
    status character varying(20) DEFAULT 'em_andamento'::character varying NOT NULL,
    "timeAId" character varying(36),
    "timeBId" character varying(36),
    "timeTrInicialId" character varying(36),
    "vitoriasA" integer DEFAULT 0 NOT NULL,
    "vitoriasB" integer DEFAULT 0 NOT NULL,
    "vitoriasParaVencer" integer DEFAULT 10 NOT NULL,
    "roundsPorLado" integer DEFAULT 5 NOT NULL,
    "duracaoRoundSeg" integer DEFAULT 360 NOT NULL,
    "plantarMs" integer DEFAULT 6000 NOT NULL,
    "desarmarMs" integer DEFAULT 12500 NOT NULL,
    "bombaSeg" integer DEFAULT 150 NOT NULL,
    "vencedorTimeId" character varying(36),
    "iniciadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "finalizadoEm" timestamp with time zone,
    "locaisIds" text,
    "criadoEm" timestamp with time zone DEFAULT now() NOT NULL,
    "atualizadoEm" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: partidaRefem; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."partidaRefem" (
    "partidaId" character varying(36) NOT NULL,
    "eventoId" character varying(36) NOT NULL,
    "empresaId" character varying(36) NOT NULL,
    "brincadeiraId" character varying(36),
    status character varying(20) DEFAULT 'em_andamento'::character varying NOT NULL,
    "timeAId" character varying(36),
    "timeBId" character varying(36),
    "timeTrInicialId" character varying(36),
    "vitoriasA" integer DEFAULT 0 NOT NULL,
    "vitoriasB" integer DEFAULT 0 NOT NULL,
    "vitoriasParaVencer" integer DEFAULT 5 NOT NULL,
    "roundsPorLado" integer DEFAULT 3 NOT NULL,
    "duracaoRoundSeg" integer DEFAULT 300 NOT NULL,
    "protecaoSeg" integer DEFAULT 10 NOT NULL,
    "sequenciaIds" text,
    "vencedorTimeId" character varying(36),
    "iniciadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "finalizadoEm" timestamp with time zone,
    "criadoEm" timestamp with time zone DEFAULT now() NOT NULL,
    "atualizadoEm" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: perfilCrianca; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."perfilCrianca" (
    "perfilCriancaId" character varying(36) NOT NULL,
    "empresaId" character varying(36) NOT NULL,
    nome character varying(100) NOT NULL,
    apelido character varying(100),
    idade integer,
    avatar character varying(100),
    "ultimoEventoId" character varying(36),
    "criadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "atualizadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "dataNascimento" date,
    "nomeResponsavel" character varying(200),
    "parentescoResponsavel" character varying(50)
);


--
-- Name: perfilVinculoFamiliar; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."perfilVinculoFamiliar" (
    "vinculoId" character varying(36) NOT NULL,
    "loginId" character varying(36) NOT NULL,
    "perfilCriancaId" character varying(36) NOT NULL,
    "empresaId" character varying(36) NOT NULL,
    relacionamento character varying(50) DEFAULT 'responsável'::character varying NOT NULL,
    "criadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: pontoVerificacao; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."pontoVerificacao" (
    "checkpointId" character varying(36) NOT NULL,
    "eventoId" character varying(36),
    nome character varying(100) NOT NULL,
    tipo character varying(20) DEFAULT 'NFC'::character varying,
    ip character varying(15),
    zona character varying(100),
    "corLed" character varying(20) DEFAULT '#00FF00'::character varying,
    pontos integer DEFAULT 10,
    status character varying(20) DEFAULT 'offline'::character varying,
    "territorioDonoTimeId" character varying(36),
    "territorioTravadoAte" timestamp with time zone,
    "territorioCooldownAte" timestamp with time zone,
    "ultimoConquistadoEm" timestamp with time zone,
    "criadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "empresaId" character varying(36),
    "tagsAutorizadas" text,
    "ultimoVisto" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    localizacao character varying(100),
    proposito character varying(20) DEFAULT 'game'::character varying,
    "mapaX" integer,
    "mapaY" integer,
    "territorioDonosCriancaId" character varying(36),
    codigo character varying(60),
    "atualizadoEm" timestamp with time zone DEFAULT now() NOT NULL,
    id integer NOT NULL,
    "numCheck" character varying(40),
    "macAddress" character varying(17),
    "statusTransferencia" character varying(10) DEFAULT 'aceito'::character varying NOT NULL,
    "empresaDestinoId" character varying(36),
    "transferidoEm" timestamp with time zone,
    "devolvidoEm" timestamp with time zone,
    "devolvidoMotivo" character varying(20),
    "devolvidoPorNome" character varying(200),
    epc character varying(32),
    CONSTRAINT ck_pontoverificacao_chave_igual_id CHECK ((("checkpointId")::text = (id)::text))
);


--
-- Name: pontoVerificacao_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."pontoVerificacao" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."pontoVerificacao_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: pontuacao; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pontuacao (
    "pontuacaoId" character varying(36) NOT NULL,
    "eventoId" character varying(36) NOT NULL,
    "criancaId" character varying(36) NOT NULL,
    "brincadeiraId" text,
    "checkpointId" character varying(36) NOT NULL,
    pontos integer NOT NULL,
    "leituraId" character varying(36),
    "criadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "empresaId" character varying(36),
    "atualizadoEm" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pulseira; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pulseira (
    codigo character varying(50) NOT NULL,
    status character varying(20) DEFAULT 'disponivel'::character varying,
    "criancaId" character varying(36),
    "criadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "empresaId" character varying(36) NOT NULL,
    "atualizadoEm" timestamp with time zone DEFAULT now() NOT NULL,
    epc character varying(24),
    "statusTransferencia" character varying(20) DEFAULT 'aceito'::character varying NOT NULL,
    "empresaDestinoId" character varying(36),
    "enviadoEm" timestamp with time zone,
    "recebidoDoMasterEm" timestamp with time zone
);


--
-- Name: pulseiraMovimento; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."pulseiraMovimento" (
    id character varying(36) NOT NULL,
    codigo character varying(64) NOT NULL,
    tipo character varying(20) NOT NULL,
    "empresaOrigemId" character varying(36),
    "empresaDestinoId" character varying(36),
    "porNome" character varying(120),
    "criadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: roundBomba; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."roundBomba" (
    "roundId" character varying(36) NOT NULL,
    "partidaId" character varying(36) NOT NULL,
    numero integer NOT NULL,
    "timeTrId" character varying(36) NOT NULL,
    "timeCtId" character varying(36) NOT NULL,
    status character varying(20) DEFAULT 'aguardando'::character varying NOT NULL,
    "portadorCriancaId" character varying(36),
    "portadorNumero" integer,
    "iniciadoEm" timestamp with time zone,
    "plantadaEm" timestamp with time zone,
    "localCheckpointId" character varying(36),
    "plantadaPorCriancaId" character varying(36),
    "desarmadaPorCriancaId" character varying(36),
    "vencedorTimeId" character varying(36),
    motivo character varying(30),
    "finalizadoEm" timestamp with time zone,
    "criadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "atualizadoEm" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: roundRefem; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."roundRefem" (
    "roundId" character varying(36) NOT NULL,
    "partidaId" character varying(36) NOT NULL,
    numero integer NOT NULL,
    "timeTrId" character varying(36) NOT NULL,
    "timeCtId" character varying(36) NOT NULL,
    status character varying(20) DEFAULT 'aguardando'::character varying NOT NULL,
    "refemCriancaId" character varying(36),
    "refemNumero" integer,
    posicao integer DEFAULT 0 NOT NULL,
    recuperacoes integer DEFAULT 0 NOT NULL,
    "ultimoAvancoEm" timestamp with time zone,
    "iniciadoEm" timestamp with time zone,
    "vencedorTimeId" character varying(36),
    motivo character varying(30),
    "finalizadoEm" timestamp with time zone,
    "criadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "atualizadoEm" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sessaoJogo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."sessaoJogo" (
    id character varying(36) NOT NULL,
    "eventoId" character varying(36) NOT NULL,
    "brincadeiraId" character varying(36) NOT NULL,
    "tipoJogo" character varying(50) NOT NULL,
    modo character varying(20),
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    "iniciadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "finalizadoEm" timestamp with time zone,
    "criadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "atualizadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: sincronizacaoHistorico; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."sincronizacaoHistorico" (
    "historicoId" bigint NOT NULL,
    "iniciadoEm" timestamp with time zone NOT NULL,
    "finalizadoEm" timestamp with time zone DEFAULT now() NOT NULL,
    sucesso boolean NOT NULL,
    "linhasEnviadas" integer DEFAULT 0 NOT NULL,
    "linhasComErro" integer DEFAULT 0 NOT NULL,
    "tabelasComProblema" text,
    erro text
);


--
-- Name: sincronizacaoHistorico_historicoId_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."sincronizacaoHistorico_historicoId_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sincronizacaoHistorico_historicoId_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."sincronizacaoHistorico_historicoId_seq" OWNED BY public."sincronizacaoHistorico"."historicoId";


--
-- Name: time; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."time" (
    "timeId" character varying(36) NOT NULL,
    "eventoId" character varying(36),
    nome character varying(50) NOT NULL,
    cor character varying(20) NOT NULL,
    pontos integer DEFAULT 0,
    "criadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "empresaId" character varying(36),
    "atualizadoEm" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: vencedorBrincadeiraParalela; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."vencedorBrincadeiraParalela" (
    id character varying(36) NOT NULL,
    "paralelaId" character varying(36) NOT NULL,
    "empresaId" character varying(36) NOT NULL,
    "eventoId" character varying(36) NOT NULL,
    "criancaId" character varying(36) NOT NULL,
    "timeId" character varying(36),
    posicao integer NOT NULL,
    pontos integer NOT NULL,
    "leituraId" character varying(36),
    "venceuEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "criadoEm" timestamp with time zone DEFAULT now() NOT NULL,
    "atualizadoEm" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: vinculoFamiliar; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."vinculoFamiliar" (
    "vinculoId" character varying(36) NOT NULL,
    "loginId" character varying(36) NOT NULL,
    "criancaId" character varying(36) NOT NULL,
    "empresaId" character varying(36) NOT NULL,
    relacionamento character varying(50) DEFAULT 'responsÃ¡vel'::character varying NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    "aprovadoPor" character varying(36),
    "aprovadoEm" timestamp with time zone,
    "rejeitadoEm" timestamp with time zone,
    "criadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "atualizadoEm" timestamp with time zone DEFAULT now() NOT NULL,
    "perfilCriancaId" character varying(36)
);


--
-- Name: zona; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.zona (
    "zonaId" character varying(36) NOT NULL,
    "eventoId" character varying(36) NOT NULL,
    nome character varying(100) NOT NULL,
    cor character varying(20) NOT NULL,
    x integer NOT NULL,
    y integer NOT NULL,
    largura integer NOT NULL,
    altura integer NOT NULL,
    "criadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: zonaConquistaEstadoCheckpoint; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."zonaConquistaEstadoCheckpoint" (
    id character varying(36) NOT NULL,
    "partidaId" character varying(36) NOT NULL,
    "empresaId" character varying(36) NOT NULL,
    "eventoId" character varying(36) NOT NULL,
    "checkpointId" character varying(36) NOT NULL,
    "donoAtualId" character varying(36),
    "tipoDono" character varying(20) DEFAULT 'team'::character varying NOT NULL,
    "protegidoAte" timestamp with time zone,
    "ultimoConquistadoEm" timestamp with time zone,
    "totalConquistas" integer DEFAULT 0 NOT NULL,
    "criadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "atualizadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: zonaConquistaEstadoParticipanteIndividual; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."zonaConquistaEstadoParticipanteIndividual" (
    id character varying(36) NOT NULL,
    "partidaId" character varying(36) NOT NULL,
    "empresaId" character varying(36) NOT NULL,
    "eventoId" character varying(36) NOT NULL,
    "criancaId" character varying(36) NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    "checkpointsLidos" integer DEFAULT 0 CONSTRAINT "zonaConquistaEstadoParticipanteIndivi_checkpointsLidos_not_null" NOT NULL,
    "pontosTotais" numeric(10,2) DEFAULT 0 NOT NULL,
    ranking integer,
    versao integer DEFAULT 0 NOT NULL,
    "iniciadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "finalizadoEm" timestamp with time zone,
    "criadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "atualizadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    cor character varying(50)
);


--
-- Name: zonaConquistaEstadoZona; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."zonaConquistaEstadoZona" (
    id character varying(36) NOT NULL,
    "partidaId" character varying(36) NOT NULL,
    "empresaId" character varying(36) NOT NULL,
    "eventoId" character varying(36) NOT NULL,
    "zonaId" character varying(36) NOT NULL,
    "donoAtualId" character varying(36),
    "tipoDono" character varying(20) DEFAULT 'team'::character varying NOT NULL,
    disputada boolean DEFAULT false NOT NULL,
    "totalCheckpoints" integer DEFAULT 0 NOT NULL,
    "checkpointsConquistados" integer DEFAULT 0 NOT NULL,
    "ultimaAtualizacaoEm" timestamp with time zone,
    "criadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "atualizadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: zonaConquistaLeituraIndividual; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."zonaConquistaLeituraIndividual" (
    id character varying(36) NOT NULL,
    "partidaId" character varying(36) NOT NULL,
    "empresaId" character varying(36) NOT NULL,
    "eventoId" character varying(36) NOT NULL,
    "brincadeiraId" character varying(36) NOT NULL,
    "checkpointId" character varying(36) NOT NULL,
    "criancaId" character varying(36) NOT NULL,
    uid character varying(255),
    "leituraId" character varying(36),
    "pontosAtribuidos" numeric(10,2) DEFAULT 0 NOT NULL,
    versao integer DEFAULT 0 NOT NULL,
    "lidoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "criadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "atualizadoEm" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: zonaConquistaLeituraTime; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."zonaConquistaLeituraTime" (
    id character varying(36) NOT NULL,
    "partidaId" character varying(36) NOT NULL,
    "empresaId" character varying(36) NOT NULL,
    "eventoId" character varying(36) NOT NULL,
    "brincadeiraId" character varying(36) NOT NULL,
    "numeroRonda" integer NOT NULL,
    "checkpointId" character varying(36) NOT NULL,
    "criancaId" character varying(36) NOT NULL,
    "timeId" character varying(36) NOT NULL,
    uid character varying(255),
    "leituraId" character varying(36),
    "pontosAtribuidos" numeric(10,2) DEFAULT 0 NOT NULL,
    "lidoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "criadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "atualizadoEm" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: zonaConquistaPartidaIndividual; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."zonaConquistaPartidaIndividual" (
    id character varying(36) NOT NULL,
    "empresaId" character varying(36) NOT NULL,
    "eventoId" character varying(36) NOT NULL,
    "brincadeiraId" character varying(36) NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    versao integer DEFAULT 0 NOT NULL,
    "iniciadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "finalizadoEm" timestamp with time zone,
    "criadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "atualizadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: zonaConquistaPartidaTime; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."zonaConquistaPartidaTime" (
    id character varying(36) NOT NULL,
    "empresaId" character varying(36) NOT NULL,
    "eventoId" character varying(36) NOT NULL,
    "brincadeiraId" character varying(36) NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    "numeroRonda" integer DEFAULT 1 NOT NULL,
    "timeAtualId" character varying(36),
    "iniciadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "finalizadoEm" timestamp with time zone,
    "criadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "atualizadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "vencedorTimeId" character varying(36)
);


--
-- Name: zonaConquistaProtecaoCheckpointIndividual; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."zonaConquistaProtecaoCheckpointIndividual" (
    id character varying(36) NOT NULL,
    "partidaId" character varying(36) NOT NULL,
    "checkpointId" character varying(36) NOT NULL,
    "criancaId" character varying(36) NOT NULL,
    "protegidoAte" timestamp with time zone NOT NULL,
    "criadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "atualizadoEm" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: zonaConquistaTempoTime; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."zonaConquistaTempoTime" (
    id character varying(36) NOT NULL,
    "partidaId" character varying(36) NOT NULL,
    "empresaId" character varying(36) NOT NULL,
    "eventoId" character varying(36) NOT NULL,
    "timeId" character varying(36) NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    "zonasDominadas" integer DEFAULT 0 NOT NULL,
    "checkpointsLidos" integer DEFAULT 0 NOT NULL,
    "pontosTotais" numeric(10,2) DEFAULT 0 NOT NULL,
    "iniciadoEm" timestamp with time zone,
    "concluidoEm" timestamp with time zone,
    "duracaoMs" integer,
    "criadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "atualizadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: sincronizacaoHistorico historicoId; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."sincronizacaoHistorico" ALTER COLUMN "historicoId" SET DEFAULT nextval('public."sincronizacaoHistorico_historicoId_seq"'::regclass);


--
-- Name: login UQ__logins__AB6E61641C935B6A; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login
    ADD CONSTRAINT "UQ__logins__AB6E61641C935B6A" UNIQUE (email);


--
-- Name: cacaTesourScan UQ_caca_tesouro_scan_crianca; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."cacaTesourScan"
    ADD CONSTRAINT "UQ_caca_tesouro_scan_crianca" UNIQUE ("partidaId", "numeroRonda", "criancaId");


--
-- Name: etiquetaCheckpoint UQ_checkpoint_tag; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."etiquetaCheckpoint"
    ADD CONSTRAINT "UQ_checkpoint_tag" UNIQUE ("checkpointId", "tagUid");


--
-- Name: amostraUhf amostraUhf_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."amostraUhf"
    ADD CONSTRAINT "amostraUhf_pkey" PRIMARY KEY (balde, "antenaId", codigo);


--
-- Name: antenaUhf antenaUhf_leitorId_porta_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."antenaUhf"
    ADD CONSTRAINT "antenaUhf_leitorId_porta_key" UNIQUE ("leitorId", porta);


--
-- Name: antenaUhf antenaUhf_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."antenaUhf"
    ADD CONSTRAINT "antenaUhf_pkey" PRIMARY KEY ("antenaId");


--
-- Name: brincadeiraParalela brincadeiraParalela_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."brincadeiraParalela"
    ADD CONSTRAINT "brincadeiraParalela_pkey" PRIMARY KEY (id);


--
-- Name: brincadeira brincadeiras_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brincadeira
    ADD CONSTRAINT brincadeiras_pkey PRIMARY KEY ("brincadeiraId");


--
-- Name: cacaTesourTempo cacaTesourTempo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."cacaTesourTempo"
    ADD CONSTRAINT "cacaTesourTempo_pkey" PRIMARY KEY ("tempoId");


--
-- Name: cacaTesourPartida caca_tesouro_partidas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."cacaTesourPartida"
    ADD CONSTRAINT caca_tesouro_partidas_pkey PRIMARY KEY ("partidaId");


--
-- Name: cacaTesourScan caca_tesouro_scans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."cacaTesourScan"
    ADD CONSTRAINT caca_tesouro_scans_pkey PRIMARY KEY ("scanId");


--
-- Name: etiquetaCheckpoint checkpoint_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."etiquetaCheckpoint"
    ADD CONSTRAINT checkpoint_tags_pkey PRIMARY KEY ("tagId");


--
-- Name: pontoVerificacao checkpoints_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."pontoVerificacao"
    ADD CONSTRAINT checkpoints_pkey PRIMARY KEY ("checkpointId");


--
-- Name: cliente clientes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cliente
    ADD CONSTRAINT clientes_pkey PRIMARY KEY ("clienteId");


--
-- Name: codigoEmail codigoEmail_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."codigoEmail"
    ADD CONSTRAINT "codigoEmail_pkey" PRIMARY KEY ("loginId", tipo);


--
-- Name: codigoVinculoFamiliar codigoVinculoFamiliar_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."codigoVinculoFamiliar"
    ADD CONSTRAINT "codigoVinculoFamiliar_pkey" PRIMARY KEY (id);


--
-- Name: codigoVinculoFamiliar codigoVinculoFamiliar_valorQrCode_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."codigoVinculoFamiliar"
    ADD CONSTRAINT "codigoVinculoFamiliar_valorQrCode_key" UNIQUE ("valorQrCode");


--
-- Name: conquista conquistas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conquista
    ADD CONSTRAINT conquistas_pkey PRIMARY KEY ("conquistaId");


--
-- Name: conviteFamilia conviteFamilia_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."conviteFamilia"
    ADD CONSTRAINT "conviteFamilia_pkey" PRIMARY KEY ("conviteId");


--
-- Name: criancaConquista crianca_conquistas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."criancaConquista"
    ADD CONSTRAINT crianca_conquistas_pkey PRIMARY KEY ("criancaId", "conquistaId");


--
-- Name: crianca criancas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crianca
    ADD CONSTRAINT criancas_pkey PRIMARY KEY ("criancaId");


--
-- Name: crianca criancas_qr_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crianca
    ADD CONSTRAINT criancas_qr_code_key UNIQUE ("codigoQr");


--
-- Name: controleEventoEmpresa empresa_event_control_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."controleEventoEmpresa"
    ADD CONSTRAINT empresa_event_control_pkey PRIMARY KEY ("empresaId");


--
-- Name: empresa empresas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresa
    ADD CONSTRAINT empresas_pkey PRIMARY KEY ("empresaId");


--
-- Name: estadoJogoEvento event_game_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."estadoJogoEvento"
    ADD CONSTRAINT event_game_state_pkey PRIMARY KEY ("eventoId");


--
-- Name: eventoCheckpoint eventoCheckpoint_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."eventoCheckpoint"
    ADD CONSTRAINT "eventoCheckpoint_pkey" PRIMARY KEY (id);


--
-- Name: eventoBrincadeira evento_brincadeiras_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."eventoBrincadeira"
    ADD CONSTRAINT evento_brincadeiras_pkey PRIMARY KEY ("eventoId", "brincadeiraId");


--
-- Name: evento eventos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evento
    ADD CONSTRAINT eventos_pkey PRIMARY KEY ("eventoId");


--
-- Name: familiaEvento familiaEvento_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."familiaEvento"
    ADD CONSTRAINT "familiaEvento_pkey" PRIMARY KEY ("familiaEventoId");


--
-- Name: sessaoJogo game_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."sessaoJogo"
    ADD CONSTRAINT game_sessions_pkey PRIMARY KEY (id);


--
-- Name: bonusVencedorJogo game_winner_bonuses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."bonusVencedorJogo"
    ADD CONSTRAINT game_winner_bonuses_pkey PRIMARY KEY (id);


--
-- Name: leitorUhf leitorUhf_empresaId_moduleId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."leitorUhf"
    ADD CONSTRAINT "leitorUhf_empresaId_moduleId_key" UNIQUE ("empresaId", "moduleId");


--
-- Name: leitorUhf leitorUhf_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."leitorUhf"
    ADD CONSTRAINT "leitorUhf_pkey" PRIMARY KEY ("leitorId");


--
-- Name: leitura leituras_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leitura
    ADD CONSTRAINT leituras_pkey PRIMARY KEY ("leituraId");


--
-- Name: login logins_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login
    ADD CONSTRAINT logins_email_key UNIQUE (email);


--
-- Name: login logins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login
    ADD CONSTRAINT logins_pkey PRIMARY KEY ("loginId");


--
-- Name: log logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.log
    ADD CONSTRAINT logs_pkey PRIMARY KEY ("logId");


--
-- Name: loteUhf loteUhf_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."loteUhf"
    ADD CONSTRAINT "loteUhf_pkey" PRIMARY KEY ("leitorId", seq);


--
-- Name: mensagemDisplay mensagens_display_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."mensagemDisplay"
    ADD CONSTRAINT mensagens_display_pkey PRIMARY KEY ("mensagemId");


--
-- Name: monsterCacaPartida monsterCacaPartida_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."monsterCacaPartida"
    ADD CONSTRAINT "monsterCacaPartida_pkey" PRIMARY KEY (id);


--
-- Name: monsterCacaLeitura monster_hunt_scans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."monsterCacaLeitura"
    ADD CONSTRAINT monster_hunt_scans_pkey PRIMARY KEY (id);


--
-- Name: monsterCacaEstadoTime monster_hunt_team_states_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."monsterCacaEstadoTime"
    ADD CONSTRAINT monster_hunt_team_states_pkey PRIMARY KEY (id);


--
-- Name: objetoBrincadeiraParalela objetoBrincadeiraParalela_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."objetoBrincadeiraParalela"
    ADD CONSTRAINT "objetoBrincadeiraParalela_pkey" PRIMARY KEY (id);


--
-- Name: partidaBomba partidaBomba_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."partidaBomba"
    ADD CONSTRAINT "partidaBomba_pkey" PRIMARY KEY ("partidaId");


--
-- Name: partidaRefem partidaRefem_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."partidaRefem"
    ADD CONSTRAINT "partidaRefem_pkey" PRIMARY KEY ("partidaId");


--
-- Name: perfilCrianca perfilCrianca_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."perfilCrianca"
    ADD CONSTRAINT "perfilCrianca_pkey" PRIMARY KEY ("perfilCriancaId");


--
-- Name: perfilVinculoFamiliar perfilVinculoFamiliar_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."perfilVinculoFamiliar"
    ADD CONSTRAINT "perfilVinculoFamiliar_pkey" PRIMARY KEY ("vinculoId");


--
-- Name: pontuacao pontuacoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pontuacao
    ADD CONSTRAINT pontuacoes_pkey PRIMARY KEY ("pontuacaoId");


--
-- Name: pulseiraMovimento pulseiraMovimento_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."pulseiraMovimento"
    ADD CONSTRAINT "pulseiraMovimento_pkey" PRIMARY KEY (id);


--
-- Name: pulseira pulseira_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pulseira
    ADD CONSTRAINT pulseira_pkey PRIMARY KEY ("empresaId", codigo);


--
-- Name: roundBomba roundBomba_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."roundBomba"
    ADD CONSTRAINT "roundBomba_pkey" PRIMARY KEY ("roundId");


--
-- Name: roundRefem roundRefem_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."roundRefem"
    ADD CONSTRAINT "roundRefem_pkey" PRIMARY KEY ("roundId");


--
-- Name: configuracao settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.configuracao
    ADD CONSTRAINT settings_pkey PRIMARY KEY ("configuracaoId");


--
-- Name: sincronizacaoHistorico sincronizacaoHistorico_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."sincronizacaoHistorico"
    ADD CONSTRAINT "sincronizacaoHistorico_pkey" PRIMARY KEY ("historicoId");


--
-- Name: chamadoSuport support_tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."chamadoSuport"
    ADD CONSTRAINT support_tickets_pkey PRIMARY KEY ("ticketId");


--
-- Name: time times_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."time"
    ADD CONSTRAINT times_pkey PRIMARY KEY ("timeId");


--
-- Name: cacaTesourScan uq_caca_tesouro_scan_crianca; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."cacaTesourScan"
    ADD CONSTRAINT uq_caca_tesouro_scan_crianca UNIQUE ("partidaId", "numeroRonda", "criancaId");


--
-- Name: etiquetaCheckpoint uq_checkpoint_tag; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."etiquetaCheckpoint"
    ADD CONSTRAINT uq_checkpoint_tag UNIQUE ("checkpointId", "tagUid");


--
-- Name: vencedorBrincadeiraParalela vencedorBrincadeiraParalela_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."vencedorBrincadeiraParalela"
    ADD CONSTRAINT "vencedorBrincadeiraParalela_pkey" PRIMARY KEY (id);


--
-- Name: vinculoFamiliar vinculoFamiliar_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."vinculoFamiliar"
    ADD CONSTRAINT "vinculoFamiliar_pkey" PRIMARY KEY ("vinculoId");


--
-- Name: zonaConquistaLeituraIndividual zonaConquistaLeituraIndividual_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."zonaConquistaLeituraIndividual"
    ADD CONSTRAINT "zonaConquistaLeituraIndividual_pkey" PRIMARY KEY (id);


--
-- Name: zonaConquistaLeituraTime zonaConquistaLeituraTime_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."zonaConquistaLeituraTime"
    ADD CONSTRAINT "zonaConquistaLeituraTime_pkey" PRIMARY KEY (id);


--
-- Name: zonaConquistaPartidaIndividual zonaConquistaPartidaIndividual_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."zonaConquistaPartidaIndividual"
    ADD CONSTRAINT "zonaConquistaPartidaIndividual_pkey" PRIMARY KEY (id);


--
-- Name: zonaConquistaPartidaTime zonaConquistaPartidaTime_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."zonaConquistaPartidaTime"
    ADD CONSTRAINT "zonaConquistaPartidaTime_pkey" PRIMARY KEY (id);


--
-- Name: zonaConquistaTempoTime zonaConquistaTempoTime_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."zonaConquistaTempoTime"
    ADD CONSTRAINT "zonaConquistaTempoTime_pkey" PRIMARY KEY (id);


--
-- Name: zona zonas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zona
    ADD CONSTRAINT zonas_pkey PRIMARY KEY ("zonaId");


--
-- Name: zonaConquistaEstadoCheckpoint zone_conquest_checkpoint_states_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."zonaConquistaEstadoCheckpoint"
    ADD CONSTRAINT zone_conquest_checkpoint_states_pkey PRIMARY KEY (id);


--
-- Name: zonaConquistaProtecaoCheckpointIndividual zone_conquest_individual_checkpoint_protection_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."zonaConquistaProtecaoCheckpointIndividual"
    ADD CONSTRAINT zone_conquest_individual_checkpoint_protection_pkey PRIMARY KEY (id);


--
-- Name: zonaConquistaEstadoParticipanteIndividual zone_conquest_individual_participant_states_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."zonaConquistaEstadoParticipanteIndividual"
    ADD CONSTRAINT zone_conquest_individual_participant_states_pkey PRIMARY KEY (id);


--
-- Name: zonaConquistaEstadoZona zone_conquest_zone_states_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."zonaConquistaEstadoZona"
    ADD CONSTRAINT zone_conquest_zone_states_pkey PRIMARY KEY (id);


--
-- Name: idx_amostrauhf_empresa_balde; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_amostrauhf_empresa_balde ON public."amostraUhf" USING btree ("empresaId", balde);


--
-- Name: idx_brincadeira_paralela_evento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_brincadeira_paralela_evento ON public."brincadeiraParalela" USING btree ("eventoId", "iniciadoEm");


--
-- Name: idx_crianca_perfil; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crianca_perfil ON public.crianca USING btree ("perfilCriancaId");


--
-- Name: idx_event_game_state_empresa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_game_state_empresa ON public."estadoJogoEvento" USING btree ("empresaId");


--
-- Name: idx_evento_checkpoint_checkpoint; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_evento_checkpoint_checkpoint ON public."eventoCheckpoint" USING btree ("checkpointId");


--
-- Name: idx_flc_crianca; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_flc_crianca ON public."codigoVinculoFamiliar" USING btree ("criancaId");


--
-- Name: idx_flc_empresa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_flc_empresa ON public."codigoVinculoFamiliar" USING btree ("empresaId");


--
-- Name: idx_flc_qr_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_flc_qr_code ON public."codigoVinculoFamiliar" USING btree ("valorQrCode");


--
-- Name: idx_flc_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_flc_status ON public."codigoVinculoFamiliar" USING btree (status);


--
-- Name: idx_game_sessions_brincadeira; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_game_sessions_brincadeira ON public."sessaoJogo" USING btree ("brincadeiraId");


--
-- Name: idx_game_sessions_evento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_game_sessions_evento ON public."sessaoJogo" USING btree ("eventoId");


--
-- Name: idx_game_sessions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_game_sessions_status ON public."sessaoJogo" USING btree (status);


--
-- Name: idx_game_winner_bonuses_evento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_game_winner_bonuses_evento ON public."bonusVencedorJogo" USING btree ("eventoId");


--
-- Name: idx_leitura_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leitura_session_id ON public.leitura USING btree ("sessaoId");


--
-- Name: idx_loteuhf_leitor_balde; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_loteuhf_leitor_balde ON public."loteUhf" USING btree ("leitorId", balde);


--
-- Name: idx_loteuhf_recebido; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_loteuhf_recebido ON public."loteUhf" USING btree ("recebidoEm");


--
-- Name: idx_monster_hunt_partidas_evento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_monster_hunt_partidas_evento ON public."monsterCacaPartida" USING btree ("empresaId", "eventoId", status);


--
-- Name: idx_monster_hunt_scans_checkpoint; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_monster_hunt_scans_checkpoint ON public."monsterCacaLeitura" USING btree ("partidaId", "checkpointId", "lidoEm");


--
-- Name: idx_monster_hunt_scans_evento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_monster_hunt_scans_evento ON public."monsterCacaLeitura" USING btree ("empresaId", "eventoId", "partidaId");


--
-- Name: idx_monster_hunt_team_states_evento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_monster_hunt_team_states_evento ON public."monsterCacaEstadoTime" USING btree ("empresaId", "eventoId", "partidaId");


--
-- Name: idx_partidabomba_evento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_partidabomba_evento ON public."partidaBomba" USING btree ("eventoId", status);


--
-- Name: idx_partidarefem_evento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_partidarefem_evento ON public."partidaRefem" USING btree ("eventoId", status);


--
-- Name: idx_perfilcrianca_empresa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_perfilcrianca_empresa ON public."perfilCrianca" USING btree ("empresaId");


--
-- Name: idx_pulseira_movimento_criado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pulseira_movimento_criado ON public."pulseiraMovimento" USING btree ("criadoEm" DESC);


--
-- Name: idx_pulseira_movimento_destino; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pulseira_movimento_destino ON public."pulseiraMovimento" USING btree ("empresaDestinoId", tipo);


--
-- Name: idx_roundbomba_partida; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_roundbomba_partida ON public."roundBomba" USING btree ("partidaId", numero);


--
-- Name: idx_roundbomba_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_roundbomba_status ON public."roundBomba" USING btree (status);


--
-- Name: idx_roundrefem_partida; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_roundrefem_partida ON public."roundRefem" USING btree ("partidaId", numero);


--
-- Name: idx_roundrefem_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_roundrefem_status ON public."roundRefem" USING btree (status);


--
-- Name: idx_zcip_evento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zcip_evento ON public."zonaConquistaPartidaIndividual" USING btree ("eventoId");


--
-- Name: idx_zcip_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zcip_status ON public."zonaConquistaPartidaIndividual" USING btree (status);


--
-- Name: idx_zcips_crianca; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zcips_crianca ON public."zonaConquistaEstadoParticipanteIndividual" USING btree ("criancaId");


--
-- Name: idx_zcips_partida; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zcips_partida ON public."zonaConquistaEstadoParticipanteIndividual" USING btree ("partidaId");


--
-- Name: idx_zcis_crianca; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zcis_crianca ON public."zonaConquistaLeituraIndividual" USING btree ("criancaId");


--
-- Name: idx_zcis_leitura; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zcis_leitura ON public."zonaConquistaLeituraIndividual" USING btree ("leituraId");


--
-- Name: idx_zcis_partida; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zcis_partida ON public."zonaConquistaLeituraIndividual" USING btree ("partidaId");


--
-- Name: idx_zone_checkpoint_state_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zone_checkpoint_state_owner ON public."zonaConquistaEstadoCheckpoint" USING btree ("partidaId", "donoAtualId");


--
-- Name: idx_zone_checkpoint_state_partida; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zone_checkpoint_state_partida ON public."zonaConquistaEstadoCheckpoint" USING btree ("partidaId", "checkpointId");


--
-- Name: idx_zone_individual_partidas_evento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zone_individual_partidas_evento ON public."zonaConquistaPartidaIndividual" USING btree ("eventoId", status);


--
-- Name: idx_zone_individual_protection_checkpoint; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zone_individual_protection_checkpoint ON public."zonaConquistaProtecaoCheckpointIndividual" USING btree ("checkpointId", "protegidoAte");


--
-- Name: idx_zone_individual_scans_partida; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zone_individual_scans_partida ON public."zonaConquistaLeituraIndividual" USING btree ("partidaId", "criancaId");


--
-- Name: idx_zone_individual_states_partida; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zone_individual_states_partida ON public."zonaConquistaEstadoParticipanteIndividual" USING btree ("partidaId", "criancaId");


--
-- Name: idx_zone_team_partidas_evento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zone_team_partidas_evento ON public."zonaConquistaPartidaTime" USING btree ("eventoId", status);


--
-- Name: idx_zone_team_scans_partida; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zone_team_scans_partida ON public."zonaConquistaLeituraTime" USING btree ("partidaId", "numeroRonda");


--
-- Name: idx_zone_team_tempos_partida; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zone_team_tempos_partida ON public."zonaConquistaTempoTime" USING btree ("partidaId", "timeId");


--
-- Name: idx_zone_zone_state_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zone_zone_state_owner ON public."zonaConquistaEstadoZona" USING btree ("partidaId", "donoAtualId");


--
-- Name: idx_zone_zone_state_partida; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zone_zone_state_partida ON public."zonaConquistaEstadoZona" USING btree ("partidaId", "zonaId");


--
-- Name: ixVinculoFamiliarPerfil; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ixVinculoFamiliarPerfil" ON public."vinculoFamiliar" USING btree ("perfilCriancaId");


--
-- Name: sincronizacaoHistoricoIniciadoEm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "sincronizacaoHistoricoIniciadoEm" ON public."sincronizacaoHistorico" USING btree ("iniciadoEm");


--
-- Name: uqConviteFamiliaHashToken; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uqConviteFamiliaHashToken" ON public."conviteFamilia" USING btree ("hashToken");


--
-- Name: uqEventoCodigoConvite; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uqEventoCodigoConvite" ON public.evento USING btree ("codigoConvite");


--
-- Name: uqFamiliaEventoLoginEvento; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uqFamiliaEventoLoginEvento" ON public."familiaEvento" USING btree ("loginId", "eventoId");


--
-- Name: uqPerfilVinculoFamiliar; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uqPerfilVinculoFamiliar" ON public."perfilVinculoFamiliar" USING btree ("loginId", "perfilCriancaId");


--
-- Name: uqVinculoFamiliarLoginCrianca; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uqVinculoFamiliarLoginCrianca" ON public."vinculoFamiliar" USING btree ("loginId", "criancaId");


--
-- Name: uq_brincadeira_paralela_ativa_evento; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_brincadeira_paralela_ativa_evento ON public."brincadeiraParalela" USING btree ("eventoId") WHERE ((status)::text = 'active'::text);


--
-- Name: uq_caca_tesouro_tempo_equipe; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_caca_tesouro_tempo_equipe ON public."cacaTesourTempo" USING btree ("partidaId", "timeId");


--
-- Name: uq_cliente_empresa_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_cliente_empresa_id ON public.cliente USING btree ("empresaId") WHERE ("empresaId" IS NOT NULL);


--
-- Name: uq_empresa_codigo; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_empresa_codigo ON public.empresa USING btree (lower((codigo)::text)) WHERE (codigo IS NOT NULL);


--
-- Name: uq_evento_checkpoint; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_evento_checkpoint ON public."eventoCheckpoint" USING btree ("eventoId", "checkpointId");


--
-- Name: uq_game_winner_bonus_partida; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_game_winner_bonus_partida ON public."bonusVencedorJogo" USING btree ("partidaId", "tipoJogo");


--
-- Name: uq_monster_hunt_scan_reading; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_monster_hunt_scan_reading ON public."monsterCacaLeitura" USING btree ("leituraId") WHERE ("leituraId" IS NOT NULL);


--
-- Name: uq_monster_hunt_team_state; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_monster_hunt_team_state ON public."monsterCacaEstadoTime" USING btree ("partidaId", "timeId");


--
-- Name: uq_objeto_brincadeira_paralela_nome; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_objeto_brincadeira_paralela_nome ON public."objetoBrincadeiraParalela" USING btree ("empresaId", lower((nome)::text)) WHERE ((status)::text = 'active'::text);


--
-- Name: uq_pontoverificacao_empresa_codigo; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_pontoverificacao_empresa_codigo ON public."pontoVerificacao" USING btree ("empresaId", lower((codigo)::text));


--
-- Name: uq_pontoverificacao_empresa_numcheck; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_pontoverificacao_empresa_numcheck ON public."pontoVerificacao" USING btree ("empresaId", lower(("numCheck")::text)) WHERE ("numCheck" IS NOT NULL);


--
-- Name: uq_pontoverificacao_epc; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_pontoverificacao_epc ON public."pontoVerificacao" USING btree (epc) WHERE (epc IS NOT NULL);


--
-- Name: uq_pontoverificacao_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_pontoverificacao_id ON public."pontoVerificacao" USING btree (id);


--
-- Name: uq_pontoverificacao_mac; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_pontoverificacao_mac ON public."pontoVerificacao" USING btree ("macAddress") WHERE ("macAddress" IS NOT NULL);


--
-- Name: uq_settings_empresa_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_settings_empresa_key ON public.configuracao USING btree (COALESCE("empresaId", ''::text), chave);


--
-- Name: uq_vencedor_paralela_crianca; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_vencedor_paralela_crianca ON public."vencedorBrincadeiraParalela" USING btree ("paralelaId", "criancaId");


--
-- Name: uq_vencedor_paralela_posicao; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_vencedor_paralela_posicao ON public."vencedorBrincadeiraParalela" USING btree ("paralelaId", posicao);


--
-- Name: uq_zone_individual_scan_reading; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_zone_individual_scan_reading ON public."zonaConquistaLeituraIndividual" USING btree ("leituraId") WHERE ("leituraId" IS NOT NULL);


--
-- Name: uq_zone_team_scan_reading; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_zone_team_scan_reading ON public."zonaConquistaLeituraTime" USING btree ("leituraId") WHERE ("leituraId" IS NOT NULL);


--
-- Name: ux_empresa_codigotelao; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_empresa_codigotelao ON public.empresa USING btree ("codigoTelao") WHERE ("codigoTelao" IS NOT NULL);


--
-- Name: ux_pulseira_empresa_epc; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_pulseira_empresa_epc ON public.pulseira USING btree ("empresaId", epc) WHERE (epc IS NOT NULL);


--
-- Name: bonusVencedorJogo atualizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "atualizacaoGatilho" BEFORE UPDATE ON public."bonusVencedorJogo" FOR EACH ROW EXECUTE FUNCTION public."atualizacaoRegistrar"();


--
-- Name: brincadeira atualizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "atualizacaoGatilho" BEFORE UPDATE ON public.brincadeira FOR EACH ROW EXECUTE FUNCTION public."atualizacaoRegistrar"();


--
-- Name: brincadeiraParalela atualizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "atualizacaoGatilho" BEFORE UPDATE ON public."brincadeiraParalela" FOR EACH ROW EXECUTE FUNCTION public."atualizacaoRegistrar"();


--
-- Name: cacaTesourPartida atualizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "atualizacaoGatilho" BEFORE UPDATE ON public."cacaTesourPartida" FOR EACH ROW EXECUTE FUNCTION public."atualizacaoRegistrar"();


--
-- Name: cacaTesourScan atualizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "atualizacaoGatilho" BEFORE UPDATE ON public."cacaTesourScan" FOR EACH ROW EXECUTE FUNCTION public."atualizacaoRegistrar"();


--
-- Name: cacaTesourTempo atualizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "atualizacaoGatilho" BEFORE UPDATE ON public."cacaTesourTempo" FOR EACH ROW EXECUTE FUNCTION public."atualizacaoRegistrar"();


--
-- Name: chamadoSuport atualizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "atualizacaoGatilho" BEFORE UPDATE ON public."chamadoSuport" FOR EACH ROW EXECUTE FUNCTION public."atualizacaoRegistrar"();


--
-- Name: cliente atualizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "atualizacaoGatilho" BEFORE UPDATE ON public.cliente FOR EACH ROW EXECUTE FUNCTION public."atualizacaoRegistrar"();


--
-- Name: codigoVinculoFamiliar atualizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "atualizacaoGatilho" BEFORE UPDATE ON public."codigoVinculoFamiliar" FOR EACH ROW EXECUTE FUNCTION public."atualizacaoRegistrar"();


--
-- Name: configuracao atualizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "atualizacaoGatilho" BEFORE UPDATE ON public.configuracao FOR EACH ROW EXECUTE FUNCTION public."atualizacaoRegistrar"();


--
-- Name: conquista atualizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "atualizacaoGatilho" BEFORE UPDATE ON public.conquista FOR EACH ROW EXECUTE FUNCTION public."atualizacaoRegistrar"();


--
-- Name: controleEventoEmpresa atualizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "atualizacaoGatilho" BEFORE UPDATE ON public."controleEventoEmpresa" FOR EACH ROW EXECUTE FUNCTION public."atualizacaoRegistrar"();


--
-- Name: conviteFamilia atualizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "atualizacaoGatilho" BEFORE UPDATE ON public."conviteFamilia" FOR EACH ROW EXECUTE FUNCTION public."atualizacaoRegistrar"();


--
-- Name: crianca atualizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "atualizacaoGatilho" BEFORE UPDATE ON public.crianca FOR EACH ROW EXECUTE FUNCTION public."atualizacaoRegistrar"();


--
-- Name: criancaConquista atualizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "atualizacaoGatilho" BEFORE UPDATE ON public."criancaConquista" FOR EACH ROW EXECUTE FUNCTION public."atualizacaoRegistrar"();


--
-- Name: empresa atualizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "atualizacaoGatilho" BEFORE UPDATE ON public.empresa FOR EACH ROW EXECUTE FUNCTION public."atualizacaoRegistrar"();


--
-- Name: estadoJogoEvento atualizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "atualizacaoGatilho" BEFORE UPDATE ON public."estadoJogoEvento" FOR EACH ROW EXECUTE FUNCTION public."atualizacaoRegistrar"();


--
-- Name: etiquetaCheckpoint atualizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "atualizacaoGatilho" BEFORE UPDATE ON public."etiquetaCheckpoint" FOR EACH ROW EXECUTE FUNCTION public."atualizacaoRegistrar"();


--
-- Name: evento atualizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "atualizacaoGatilho" BEFORE UPDATE ON public.evento FOR EACH ROW EXECUTE FUNCTION public."atualizacaoRegistrar"();


--
-- Name: eventoBrincadeira atualizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "atualizacaoGatilho" BEFORE UPDATE ON public."eventoBrincadeira" FOR EACH ROW EXECUTE FUNCTION public."atualizacaoRegistrar"();


--
-- Name: leitura atualizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "atualizacaoGatilho" BEFORE UPDATE ON public.leitura FOR EACH ROW EXECUTE FUNCTION public."atualizacaoRegistrar"();


--
-- Name: log atualizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "atualizacaoGatilho" BEFORE UPDATE ON public.log FOR EACH ROW EXECUTE FUNCTION public."atualizacaoRegistrar"();


--
-- Name: login atualizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "atualizacaoGatilho" BEFORE UPDATE ON public.login FOR EACH ROW EXECUTE FUNCTION public."atualizacaoRegistrar"();


--
-- Name: mensagemDisplay atualizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "atualizacaoGatilho" BEFORE UPDATE ON public."mensagemDisplay" FOR EACH ROW EXECUTE FUNCTION public."atualizacaoRegistrar"();


--
-- Name: monsterCacaEstadoTime atualizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "atualizacaoGatilho" BEFORE UPDATE ON public."monsterCacaEstadoTime" FOR EACH ROW EXECUTE FUNCTION public."atualizacaoRegistrar"();


--
-- Name: monsterCacaLeitura atualizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "atualizacaoGatilho" BEFORE UPDATE ON public."monsterCacaLeitura" FOR EACH ROW EXECUTE FUNCTION public."atualizacaoRegistrar"();


--
-- Name: monsterCacaPartida atualizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "atualizacaoGatilho" BEFORE UPDATE ON public."monsterCacaPartida" FOR EACH ROW EXECUTE FUNCTION public."atualizacaoRegistrar"();


--
-- Name: objetoBrincadeiraParalela atualizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "atualizacaoGatilho" BEFORE UPDATE ON public."objetoBrincadeiraParalela" FOR EACH ROW EXECUTE FUNCTION public."atualizacaoRegistrar"();


--
-- Name: partidaBomba atualizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "atualizacaoGatilho" BEFORE UPDATE ON public."partidaBomba" FOR EACH ROW EXECUTE FUNCTION public."atualizacaoRegistrar"();


--
-- Name: partidaRefem atualizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "atualizacaoGatilho" BEFORE UPDATE ON public."partidaRefem" FOR EACH ROW EXECUTE FUNCTION public."atualizacaoRegistrar"();


--
-- Name: perfilCrianca atualizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "atualizacaoGatilho" BEFORE UPDATE ON public."perfilCrianca" FOR EACH ROW EXECUTE FUNCTION public."atualizacaoRegistrar"();


--
-- Name: pontoVerificacao atualizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "atualizacaoGatilho" BEFORE UPDATE ON public."pontoVerificacao" FOR EACH ROW EXECUTE FUNCTION public."atualizacaoRegistrar"();


--
-- Name: pontuacao atualizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "atualizacaoGatilho" BEFORE UPDATE ON public.pontuacao FOR EACH ROW EXECUTE FUNCTION public."atualizacaoRegistrar"();


--
-- Name: pulseira atualizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "atualizacaoGatilho" BEFORE UPDATE ON public.pulseira FOR EACH ROW EXECUTE FUNCTION public."atualizacaoRegistrar"();


--
-- Name: roundBomba atualizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "atualizacaoGatilho" BEFORE UPDATE ON public."roundBomba" FOR EACH ROW EXECUTE FUNCTION public."atualizacaoRegistrar"();


--
-- Name: roundRefem atualizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "atualizacaoGatilho" BEFORE UPDATE ON public."roundRefem" FOR EACH ROW EXECUTE FUNCTION public."atualizacaoRegistrar"();


--
-- Name: sessaoJogo atualizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "atualizacaoGatilho" BEFORE UPDATE ON public."sessaoJogo" FOR EACH ROW EXECUTE FUNCTION public."atualizacaoRegistrar"();


--
-- Name: time atualizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "atualizacaoGatilho" BEFORE UPDATE ON public."time" FOR EACH ROW EXECUTE FUNCTION public."atualizacaoRegistrar"();


--
-- Name: vencedorBrincadeiraParalela atualizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "atualizacaoGatilho" BEFORE UPDATE ON public."vencedorBrincadeiraParalela" FOR EACH ROW EXECUTE FUNCTION public."atualizacaoRegistrar"();


--
-- Name: vinculoFamiliar atualizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "atualizacaoGatilho" BEFORE UPDATE ON public."vinculoFamiliar" FOR EACH ROW EXECUTE FUNCTION public."atualizacaoRegistrar"();


--
-- Name: zona atualizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "atualizacaoGatilho" BEFORE UPDATE ON public.zona FOR EACH ROW EXECUTE FUNCTION public."atualizacaoRegistrar"();


--
-- Name: zonaConquistaEstadoCheckpoint atualizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "atualizacaoGatilho" BEFORE UPDATE ON public."zonaConquistaEstadoCheckpoint" FOR EACH ROW EXECUTE FUNCTION public."atualizacaoRegistrar"();


--
-- Name: zonaConquistaEstadoParticipanteIndividual atualizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "atualizacaoGatilho" BEFORE UPDATE ON public."zonaConquistaEstadoParticipanteIndividual" FOR EACH ROW EXECUTE FUNCTION public."atualizacaoRegistrar"();


--
-- Name: zonaConquistaEstadoZona atualizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "atualizacaoGatilho" BEFORE UPDATE ON public."zonaConquistaEstadoZona" FOR EACH ROW EXECUTE FUNCTION public."atualizacaoRegistrar"();


--
-- Name: zonaConquistaLeituraIndividual atualizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "atualizacaoGatilho" BEFORE UPDATE ON public."zonaConquistaLeituraIndividual" FOR EACH ROW EXECUTE FUNCTION public."atualizacaoRegistrar"();


--
-- Name: zonaConquistaLeituraTime atualizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "atualizacaoGatilho" BEFORE UPDATE ON public."zonaConquistaLeituraTime" FOR EACH ROW EXECUTE FUNCTION public."atualizacaoRegistrar"();


--
-- Name: zonaConquistaPartidaIndividual atualizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "atualizacaoGatilho" BEFORE UPDATE ON public."zonaConquistaPartidaIndividual" FOR EACH ROW EXECUTE FUNCTION public."atualizacaoRegistrar"();


--
-- Name: zonaConquistaPartidaTime atualizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "atualizacaoGatilho" BEFORE UPDATE ON public."zonaConquistaPartidaTime" FOR EACH ROW EXECUTE FUNCTION public."atualizacaoRegistrar"();


--
-- Name: zonaConquistaProtecaoCheckpointIndividual atualizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "atualizacaoGatilho" BEFORE UPDATE ON public."zonaConquistaProtecaoCheckpointIndividual" FOR EACH ROW EXECUTE FUNCTION public."atualizacaoRegistrar"();


--
-- Name: zonaConquistaTempoTime atualizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "atualizacaoGatilho" BEFORE UPDATE ON public."zonaConquistaTempoTime" FOR EACH ROW EXECUTE FUNCTION public."atualizacaoRegistrar"();


--
-- Name: pontoVerificacao trg_pontoverificacao_chave; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pontoverificacao_chave BEFORE INSERT ON public."pontoVerificacao" FOR EACH ROW EXECUTE FUNCTION public.fn_pontoverificacao_chave();


--
-- Name: etiquetaCheckpoint FK__checkpoin__check__01142BA1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."etiquetaCheckpoint"
    ADD CONSTRAINT "FK__checkpoin__check__01142BA1" FOREIGN KEY ("checkpointId") REFERENCES public."pontoVerificacao"("checkpointId") ON UPDATE CASCADE;


--
-- Name: pontoVerificacao FK__checkpoin__event__7B5B524B; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."pontoVerificacao"
    ADD CONSTRAINT "FK__checkpoin__event__7B5B524B" FOREIGN KEY ("eventoId") REFERENCES public.evento("eventoId");


--
-- Name: pontoVerificacao FK__checkpoin__owner_crianca; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."pontoVerificacao"
    ADD CONSTRAINT "FK__checkpoin__owner_crianca" FOREIGN KEY ("territorioDonosCriancaId") REFERENCES public.crianca("criancaId");


--
-- Name: pontoVerificacao FK__checkpoin__terri__7C4F7684; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."pontoVerificacao"
    ADD CONSTRAINT "FK__checkpoin__terri__7C4F7684" FOREIGN KEY ("territorioDonoTimeId") REFERENCES public."time"("timeId");


--
-- Name: criancaConquista FK__crianca_c__conqu__17F790F9; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."criancaConquista"
    ADD CONSTRAINT "FK__crianca_c__conqu__17F790F9" FOREIGN KEY ("conquistaId") REFERENCES public.conquista("conquistaId");


--
-- Name: criancaConquista FK__crianca_c__crian__17036CC0; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."criancaConquista"
    ADD CONSTRAINT "FK__crianca_c__crian__17036CC0" FOREIGN KEY ("criancaId") REFERENCES public.crianca("criancaId");


--
-- Name: crianca FK__criancas__evento__6E01572D; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crianca
    ADD CONSTRAINT "FK__criancas__evento__6E01572D" FOREIGN KEY ("eventoId") REFERENCES public.evento("eventoId");


--
-- Name: crianca FK__criancas__time_i__6EF57B66; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crianca
    ADD CONSTRAINT "FK__criancas__time_i__6EF57B66" FOREIGN KEY ("timeId") REFERENCES public."time"("timeId");


--
-- Name: eventoBrincadeira FK__evento_br__brinc__619B8048; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."eventoBrincadeira"
    ADD CONSTRAINT "FK__evento_br__brinc__619B8048" FOREIGN KEY ("brincadeiraId") REFERENCES public.brincadeira("brincadeiraId");


--
-- Name: eventoBrincadeira FK__evento_br__event__60A75C0F; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."eventoBrincadeira"
    ADD CONSTRAINT "FK__evento_br__event__60A75C0F" FOREIGN KEY ("eventoId") REFERENCES public.evento("eventoId");


--
-- Name: evento FK__eventos__cliente__5441852A; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evento
    ADD CONSTRAINT "FK__eventos__cliente__5441852A" FOREIGN KEY ("clienteId") REFERENCES public.cliente("clienteId");


--
-- Name: leitura FK__leituras__checkp__06CD04F7; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leitura
    ADD CONSTRAINT "FK__leituras__checkp__06CD04F7" FOREIGN KEY ("checkpointId") REFERENCES public."pontoVerificacao"("checkpointId") ON UPDATE CASCADE;


--
-- Name: leitura FK__leituras__crianc__07C12930; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leitura
    ADD CONSTRAINT "FK__leituras__crianc__07C12930" FOREIGN KEY ("criancaId") REFERENCES public.crianca("criancaId");


--
-- Name: login FK__logins__empresa___6BE40491; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login
    ADD CONSTRAINT "FK__logins__empresa___6BE40491" FOREIGN KEY ("empresaId") REFERENCES public.empresa("empresaId");


--
-- Name: log FK__logs__cliente_id__208CD6FA; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.log
    ADD CONSTRAINT "FK__logs__cliente_id__208CD6FA" FOREIGN KEY ("clienteId") REFERENCES public.cliente("clienteId");


--
-- Name: log FK__logs__evento_id__2180FB33; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.log
    ADD CONSTRAINT "FK__logs__evento_id__2180FB33" FOREIGN KEY ("eventoId") REFERENCES public.evento("eventoId");


--
-- Name: mensagemDisplay FK__mensagens__event__1CBC4616; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."mensagemDisplay"
    ADD CONSTRAINT "FK__mensagens__event__1CBC4616" FOREIGN KEY ("eventoId") REFERENCES public.evento("eventoId");


--
-- Name: pontoVerificacao FK__pontoverif__owner_crianca; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."pontoVerificacao"
    ADD CONSTRAINT "FK__pontoverif__owner_crianca" FOREIGN KEY ("territorioDonosCriancaId") REFERENCES public.crianca("criancaId");


--
-- Name: pontuacao FK__pontuacoe__check__0F624AF8; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pontuacao
    ADD CONSTRAINT "FK__pontuacoe__check__0F624AF8" FOREIGN KEY ("checkpointId") REFERENCES public."pontoVerificacao"("checkpointId") ON UPDATE CASCADE;


--
-- Name: pontuacao FK__pontuacoe__crian__0D7A0286; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pontuacao
    ADD CONSTRAINT "FK__pontuacoe__crian__0D7A0286" FOREIGN KEY ("criancaId") REFERENCES public.crianca("criancaId");


--
-- Name: pontuacao FK__pontuacoe__event__0C85DE4D; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pontuacao
    ADD CONSTRAINT "FK__pontuacoe__event__0C85DE4D" FOREIGN KEY ("eventoId") REFERENCES public.evento("eventoId");


--
-- Name: pulseira FK__pulseiras__crian__73BA3083; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pulseira
    ADD CONSTRAINT "FK__pulseiras__crian__73BA3083" FOREIGN KEY ("criancaId") REFERENCES public.crianca("criancaId");


--
-- Name: time FK__times__evento_id__66603565; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."time"
    ADD CONSTRAINT "FK__times__evento_id__66603565" FOREIGN KEY ("eventoId") REFERENCES public.evento("eventoId");


--
-- Name: zona FK__zonas__evento_id__25518C17; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zona
    ADD CONSTRAINT "FK__zonas__evento_id__25518C17" FOREIGN KEY ("eventoId") REFERENCES public.evento("eventoId");


--
-- Name: brincadeira FK_brincadeiras_empresas; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brincadeira
    ADD CONSTRAINT "FK_brincadeiras_empresas" FOREIGN KEY ("empresaId") REFERENCES public.empresa("empresaId");


--
-- Name: pontoVerificacao FK_checkpoints_empresas; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."pontoVerificacao"
    ADD CONSTRAINT "FK_checkpoints_empresas" FOREIGN KEY ("empresaId") REFERENCES public.empresa("empresaId");


--
-- Name: crianca FK_criancas_empresas; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crianca
    ADD CONSTRAINT "FK_criancas_empresas" FOREIGN KEY ("empresaId") REFERENCES public.empresa("empresaId");


--
-- Name: evento FK_eventos_empresas; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evento
    ADD CONSTRAINT "FK_eventos_empresas" FOREIGN KEY ("empresaId") REFERENCES public.empresa("empresaId");


--
-- Name: leitura FK_leituras_empresas; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leitura
    ADD CONSTRAINT "FK_leituras_empresas" FOREIGN KEY ("empresaId") REFERENCES public.empresa("empresaId");


--
-- Name: pontuacao FK_pontuacoes_empresas; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pontuacao
    ADD CONSTRAINT "FK_pontuacoes_empresas" FOREIGN KEY ("empresaId") REFERENCES public.empresa("empresaId");


--
-- Name: pulseira FK_pulseiras_empresas; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pulseira
    ADD CONSTRAINT "FK_pulseiras_empresas" FOREIGN KEY ("empresaId") REFERENCES public.empresa("empresaId");


--
-- Name: time FK_times_empresas; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."time"
    ADD CONSTRAINT "FK_times_empresas" FOREIGN KEY ("empresaId") REFERENCES public.empresa("empresaId");


--
-- Name: amostraUhf amostraUhf_antenaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."amostraUhf"
    ADD CONSTRAINT "amostraUhf_antenaId_fkey" FOREIGN KEY ("antenaId") REFERENCES public."antenaUhf"("antenaId") ON DELETE CASCADE;


--
-- Name: antenaUhf antenaUhf_leitorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."antenaUhf"
    ADD CONSTRAINT "antenaUhf_leitorId_fkey" FOREIGN KEY ("leitorId") REFERENCES public."leitorUhf"("leitorId") ON DELETE CASCADE;


--
-- Name: crianca crianca_perfilCriancaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crianca
    ADD CONSTRAINT "crianca_perfilCriancaId_fkey" FOREIGN KEY ("perfilCriancaId") REFERENCES public."perfilCrianca"("perfilCriancaId") ON DELETE SET NULL;


--
-- Name: codigoVinculoFamiliar family_linking_codes_crianca_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."codigoVinculoFamiliar"
    ADD CONSTRAINT family_linking_codes_crianca_id_fkey FOREIGN KEY ("criancaId") REFERENCES public.crianca("criancaId");


--
-- Name: codigoVinculoFamiliar family_linking_codes_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."codigoVinculoFamiliar"
    ADD CONSTRAINT family_linking_codes_empresa_id_fkey FOREIGN KEY ("empresaId") REFERENCES public.empresa("empresaId");


--
-- Name: codigoVinculoFamiliar family_linking_codes_evento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."codigoVinculoFamiliar"
    ADD CONSTRAINT family_linking_codes_evento_id_fkey FOREIGN KEY ("eventoId") REFERENCES public.evento("eventoId");


--
-- Name: codigoVinculoFamiliar family_linking_codes_used_by_login_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."codigoVinculoFamiliar"
    ADD CONSTRAINT family_linking_codes_used_by_login_id_fkey FOREIGN KEY ("usadoPorLoginId") REFERENCES public.login("loginId");


--
-- Name: brincadeira fk_brincadeiras_empresas; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brincadeira
    ADD CONSTRAINT fk_brincadeiras_empresas FOREIGN KEY ("empresaId") REFERENCES public.empresa("empresaId");


--
-- Name: etiquetaCheckpoint fk_checkpoint_tags_checkpoint; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."etiquetaCheckpoint"
    ADD CONSTRAINT fk_checkpoint_tags_checkpoint FOREIGN KEY ("checkpointId") REFERENCES public."pontoVerificacao"("checkpointId") ON UPDATE CASCADE;


--
-- Name: pontoVerificacao fk_checkpoints_empresas; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."pontoVerificacao"
    ADD CONSTRAINT fk_checkpoints_empresas FOREIGN KEY ("empresaId") REFERENCES public.empresa("empresaId");


--
-- Name: pontoVerificacao fk_checkpoints_evento; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."pontoVerificacao"
    ADD CONSTRAINT fk_checkpoints_evento FOREIGN KEY ("eventoId") REFERENCES public.evento("eventoId");


--
-- Name: pontoVerificacao fk_checkpoints_owner_crianca; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."pontoVerificacao"
    ADD CONSTRAINT fk_checkpoints_owner_crianca FOREIGN KEY ("territorioDonosCriancaId") REFERENCES public.crianca("criancaId");


--
-- Name: pontoVerificacao fk_checkpoints_owner_time; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."pontoVerificacao"
    ADD CONSTRAINT fk_checkpoints_owner_time FOREIGN KEY ("territorioDonoTimeId") REFERENCES public."time"("timeId");


--
-- Name: criancaConquista fk_crianca_conquistas_conquista; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."criancaConquista"
    ADD CONSTRAINT fk_crianca_conquistas_conquista FOREIGN KEY ("conquistaId") REFERENCES public.conquista("conquistaId");


--
-- Name: criancaConquista fk_crianca_conquistas_crianca; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."criancaConquista"
    ADD CONSTRAINT fk_crianca_conquistas_crianca FOREIGN KEY ("criancaId") REFERENCES public.crianca("criancaId");


--
-- Name: crianca fk_criancas_empresas; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crianca
    ADD CONSTRAINT fk_criancas_empresas FOREIGN KEY ("empresaId") REFERENCES public.empresa("empresaId");


--
-- Name: crianca fk_criancas_evento; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crianca
    ADD CONSTRAINT fk_criancas_evento FOREIGN KEY ("eventoId") REFERENCES public.evento("eventoId");


--
-- Name: crianca fk_criancas_time; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crianca
    ADD CONSTRAINT fk_criancas_time FOREIGN KEY ("timeId") REFERENCES public."time"("timeId");


--
-- Name: eventoBrincadeira fk_evento_brincadeiras_brincadeira; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."eventoBrincadeira"
    ADD CONSTRAINT fk_evento_brincadeiras_brincadeira FOREIGN KEY ("brincadeiraId") REFERENCES public.brincadeira("brincadeiraId");


--
-- Name: eventoBrincadeira fk_evento_brincadeiras_evento; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."eventoBrincadeira"
    ADD CONSTRAINT fk_evento_brincadeiras_evento FOREIGN KEY ("eventoId") REFERENCES public.evento("eventoId");


--
-- Name: evento fk_eventos_cliente; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evento
    ADD CONSTRAINT fk_eventos_cliente FOREIGN KEY ("clienteId") REFERENCES public.cliente("clienteId");


--
-- Name: evento fk_eventos_empresas; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evento
    ADD CONSTRAINT fk_eventos_empresas FOREIGN KEY ("empresaId") REFERENCES public.empresa("empresaId");


--
-- Name: leitura fk_leituras_checkpoint; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leitura
    ADD CONSTRAINT fk_leituras_checkpoint FOREIGN KEY ("checkpointId") REFERENCES public."pontoVerificacao"("checkpointId") ON UPDATE CASCADE;


--
-- Name: leitura fk_leituras_crianca; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leitura
    ADD CONSTRAINT fk_leituras_crianca FOREIGN KEY ("criancaId") REFERENCES public.crianca("criancaId");


--
-- Name: leitura fk_leituras_empresas; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leitura
    ADD CONSTRAINT fk_leituras_empresas FOREIGN KEY ("empresaId") REFERENCES public.empresa("empresaId");


--
-- Name: login fk_logins_empresa; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login
    ADD CONSTRAINT fk_logins_empresa FOREIGN KEY ("empresaId") REFERENCES public.empresa("empresaId");


--
-- Name: log fk_logs_cliente; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.log
    ADD CONSTRAINT fk_logs_cliente FOREIGN KEY ("clienteId") REFERENCES public.cliente("clienteId");


--
-- Name: log fk_logs_evento; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.log
    ADD CONSTRAINT fk_logs_evento FOREIGN KEY ("eventoId") REFERENCES public.evento("eventoId");


--
-- Name: mensagemDisplay fk_mensagens_display_evento; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."mensagemDisplay"
    ADD CONSTRAINT fk_mensagens_display_evento FOREIGN KEY ("eventoId") REFERENCES public.evento("eventoId");


--
-- Name: pontuacao fk_pontuacoes_checkpoint; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pontuacao
    ADD CONSTRAINT fk_pontuacoes_checkpoint FOREIGN KEY ("checkpointId") REFERENCES public."pontoVerificacao"("checkpointId") ON UPDATE CASCADE;


--
-- Name: pontuacao fk_pontuacoes_crianca; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pontuacao
    ADD CONSTRAINT fk_pontuacoes_crianca FOREIGN KEY ("criancaId") REFERENCES public.crianca("criancaId");


--
-- Name: pontuacao fk_pontuacoes_empresas; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pontuacao
    ADD CONSTRAINT fk_pontuacoes_empresas FOREIGN KEY ("empresaId") REFERENCES public.empresa("empresaId");


--
-- Name: pontuacao fk_pontuacoes_evento; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pontuacao
    ADD CONSTRAINT fk_pontuacoes_evento FOREIGN KEY ("eventoId") REFERENCES public.evento("eventoId");


--
-- Name: pulseira fk_pulseiras_crianca; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pulseira
    ADD CONSTRAINT fk_pulseiras_crianca FOREIGN KEY ("criancaId") REFERENCES public.crianca("criancaId");


--
-- Name: pulseira fk_pulseiras_empresas; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pulseira
    ADD CONSTRAINT fk_pulseiras_empresas FOREIGN KEY ("empresaId") REFERENCES public.empresa("empresaId");


--
-- Name: time fk_times_empresas; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."time"
    ADD CONSTRAINT fk_times_empresas FOREIGN KEY ("empresaId") REFERENCES public.empresa("empresaId");


--
-- Name: time fk_times_evento; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."time"
    ADD CONSTRAINT fk_times_evento FOREIGN KEY ("eventoId") REFERENCES public.evento("eventoId");


--
-- Name: zona fk_zonas_evento; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zona
    ADD CONSTRAINT fk_zonas_evento FOREIGN KEY ("eventoId") REFERENCES public.evento("eventoId");


--
-- Name: loteUhf loteUhf_leitorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."loteUhf"
    ADD CONSTRAINT "loteUhf_leitorId_fkey" FOREIGN KEY ("leitorId") REFERENCES public."leitorUhf"("leitorId") ON DELETE CASCADE;


--
-- Name: partidaBomba partidaBomba_eventoId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."partidaBomba"
    ADD CONSTRAINT "partidaBomba_eventoId_fkey" FOREIGN KEY ("eventoId") REFERENCES public.evento("eventoId") ON DELETE CASCADE;


--
-- Name: partidaRefem partidaRefem_eventoId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."partidaRefem"
    ADD CONSTRAINT "partidaRefem_eventoId_fkey" FOREIGN KEY ("eventoId") REFERENCES public.evento("eventoId") ON DELETE CASCADE;


--
-- Name: perfilCrianca perfilCrianca_ultimoEventoId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."perfilCrianca"
    ADD CONSTRAINT "perfilCrianca_ultimoEventoId_fkey" FOREIGN KEY ("ultimoEventoId") REFERENCES public.evento("eventoId") ON DELETE SET NULL;


--
-- Name: roundBomba roundBomba_partidaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."roundBomba"
    ADD CONSTRAINT "roundBomba_partidaId_fkey" FOREIGN KEY ("partidaId") REFERENCES public."partidaBomba"("partidaId") ON DELETE CASCADE;


--
-- Name: roundRefem roundRefem_partidaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."roundRefem"
    ADD CONSTRAINT "roundRefem_partidaId_fkey" FOREIGN KEY ("partidaId") REFERENCES public."partidaRefem"("partidaId") ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--


