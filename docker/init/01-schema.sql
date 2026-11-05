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
-- Name: sincronizacaoEmpresasDoUsuario(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public."sincronizacaoEmpresasDoUsuario"() RETURNS SETOF text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT "empresaId" FROM "sincronizacaoAcesso" WHERE "usuario" = session_user
$$;


--
-- Name: sincronizacaoInstalarGatilhos(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public."sincronizacaoInstalarGatilhos"() RETURNS TABLE(tabela text, situacao text)
    LANGUAGE plpgsql
    AS $$
DECLARE
  t record;
  colunasChave text[];
BEGIN
  FOR t IN
    SELECT c.oid, c.relname::text AS nome
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname NOT IN ('sincronizacaoFila', 'sincronizacaoEstado')
    ORDER BY c.relname
  LOOP
    SELECT array_agg(a.attname::text ORDER BY array_position(k.conkey, a.attnum))
      INTO colunasChave
    FROM pg_constraint k
    JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = ANY (k.conkey)
    WHERE k.conrelid = t.oid AND k.contype = 'p';

    IF colunasChave IS NULL THEN
      tabela := t.nome; situacao := 'SEM CHAVE PRIMARIA: nao sincroniza';
      RETURN NEXT;
      CONTINUE;
    END IF;

    EXECUTE format('DROP TRIGGER IF EXISTS "sincronizacaoGatilho" ON %I', t.nome);
    EXECUTE format(
      'CREATE TRIGGER "sincronizacaoGatilho" AFTER INSERT OR UPDATE OR DELETE ON %I '
      || 'FOR EACH ROW EXECUTE FUNCTION "sincronizacaoRegistrar"(%s)',
      t.nome,
      (SELECT string_agg(quote_literal(coluna), ', ') FROM unnest(colunasChave) AS coluna)
    );
    tabela := t.nome; situacao := 'ok';
    RETURN NEXT;
  END LOOP;
END
$$;


--
-- Name: sincronizacaoLimparFila(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public."sincronizacaoLimparFila"(dias integer DEFAULT 60) RETURNS bigint
    LANGUAGE sql
    AS $$
  WITH apagadas AS (
    DELETE FROM "sincronizacaoFila" WHERE "criadoEm" < now() - make_interval(days => dias) RETURNING 1
  )
  SELECT count(*) FROM apagadas
$$;


--
-- Name: sincronizacaoMenorFilaId(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public."sincronizacaoMenorFilaId"() RETURNS bigint
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT min("filaId") FROM "sincronizacaoFila"
$$;


--
-- Name: sincronizacaoPerdeuAlteracoesDesde(timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public."sincronizacaoPerdeuAlteracoesDesde"(ultima timestamp with time zone) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT CASE WHEN ultima IS NULL THEN false
    ELSE COALESCE((SELECT min("criadoEm") > ultima FROM "sincronizacaoFila"), true) END
$$;


--
-- Name: sincronizacaoRegistrar(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public."sincronizacaoRegistrar"() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  nova jsonb;
  antiga jsonb;
  chaveNova jsonb := '{}'::jsonb;
  chaveAntiga jsonb := '{}'::jsonb;
  i integer;
  empresaAntiga text;
  empresaNova text;
BEGIN
  -- Alteração que o próprio sincronizador está aplicando (envio ou puxada): não volta para a fila.
  IF current_setting('pulyn.sync_ignorar', true) = 'on' THEN RETURN NULL; END IF;

  IF TG_OP <> 'INSERT' THEN antiga := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN nova := to_jsonb(NEW); END IF;

  FOR i IN 0 .. TG_NARGS - 1 LOOP
    IF antiga IS NOT NULL THEN
      chaveAntiga := chaveAntiga || jsonb_build_object(TG_ARGV[i], antiga -> TG_ARGV[i]);
    END IF;
    IF nova IS NOT NULL THEN
      chaveNova := chaveNova || jsonb_build_object(TG_ARGV[i], nova -> TG_ARGV[i]);
    END IF;
  END LOOP;

  -- Empresa da linha: a tabela `empresas` se liga pelo próprio id; as outras pela coluna empresaId (ou empresa_id).
  IF TG_TABLE_NAME = 'empresas' THEN
    empresaAntiga := chaveAntiga ->> 'id';
    empresaNova := chaveNova ->> 'id';
  ELSE
    empresaAntiga := COALESCE(antiga ->> 'empresaId', antiga ->> 'empresa_id');
    empresaNova := COALESCE(nova ->> 'empresaId', nova ->> 'empresa_id');
  END IF;

  IF TG_OP = 'DELETE' THEN
    INSERT INTO "sincronizacaoFila" ("tabela", "operacao", "chave", "empresaId") VALUES (TG_TABLE_NAME, 'D', chaveAntiga, empresaAntiga);
  ELSE
    -- Mudança da própria chave primária: a linha antiga some na nuvem e a nova aparece.
    IF TG_OP = 'UPDATE' AND chaveAntiga <> chaveNova THEN
      INSERT INTO "sincronizacaoFila" ("tabela", "operacao", "chave", "empresaId") VALUES (TG_TABLE_NAME, 'D', chaveAntiga, empresaAntiga);
    END IF;
    INSERT INTO "sincronizacaoFila" ("tabela", "operacao", "chave", "empresaId")
      VALUES (TG_TABLE_NAME, left(TG_OP, 1), chaveNova, empresaNova);
  END IF;

  RETURN NULL;
END
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
    "criadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
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
    "configuracaoJogo" text
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
    "nomeObjeto" character varying(100)
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
    "vezDisponvelEm" timestamp with time zone
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
    "leroEm" timestamp with time zone NOT NULL
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
    "duracaoMs" bigint
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
    "atualizadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: etiquetaCheckpoint; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."etiquetaCheckpoint" (
    "tagId" integer NOT NULL,
    "checkpointId" character varying(36) NOT NULL,
    "tagUid" character varying(50) NOT NULL,
    "criadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
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
    "logoTipo" character varying(100)
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
    "usadoPorLoginId" character varying(36)
);


--
-- Name: configuracao; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.configuracao (
    "configuracaoId" integer NOT NULL,
    chave character varying(100) NOT NULL,
    valor text,
    "atualizadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "empresaId" text
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
    "criadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: controleEventoEmpresa; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."controleEventoEmpresa" (
    "empresaId" character varying(36) NOT NULL,
    "eventoId" character varying(36),
    "atualizadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
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
    "criadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
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
    "numeroJogador" integer
);


--
-- Name: criancaConquista; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."criancaConquista" (
    "criancaId" character varying(36) NOT NULL,
    "conquistaId" character varying(36) NOT NULL,
    "desbloqueadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
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
    "mapaMetrosPorUnidade" numeric
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
    "atualizadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
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
    "autoFim" integer DEFAULT 0
);


--
-- Name: eventoBrincadeira; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."eventoBrincadeira" (
    "eventoId" character varying(36) NOT NULL,
    "brincadeiraId" character varying(36) NOT NULL,
    ordem integer DEFAULT 0,
    "multiplicadorPontos" integer DEFAULT 1,
    "criadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
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
    "sessaoId" character varying(36)
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
    "empresaId" character varying(36)
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
    "perfisExtras" text
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
    "enviadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
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
    "criadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
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
    "lidoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
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
    "criadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: objetoBrincadeiraParalela; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."objetoBrincadeiraParalela" (
    id character varying(36) NOT NULL,
    "empresaId" character varying(36) NOT NULL,
    nome character varying(80) NOT NULL,
    status character varying(10) DEFAULT 'active'::character varying NOT NULL,
    "criadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
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
    "locaisIds" text
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
    "finalizadoEm" timestamp with time zone
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
    "atualizadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: pontoVerificacao; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."pontoVerificacao" (
    "checkpointId" character varying(36) NOT NULL,
    "eventoId" character varying(36) NOT NULL,
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
    codigo character varying(60)
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
    "empresaId" character varying(36)
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
    epc character varying(24)
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
    "criadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
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
    "criadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
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
-- Name: sincronizacaoAcesso; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."sincronizacaoAcesso" (
    usuario text NOT NULL,
    "empresaId" text NOT NULL
);


--
-- Name: sincronizacaoEstado; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."sincronizacaoEstado" (
    chave text NOT NULL,
    valor text,
    "atualizadoEm" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sincronizacaoFila; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."sincronizacaoFila" (
    "filaId" bigint NOT NULL,
    tabela text NOT NULL,
    operacao character(1) NOT NULL,
    chave jsonb NOT NULL,
    "criadoEm" timestamp with time zone DEFAULT now() NOT NULL,
    "enviadoEm" timestamp with time zone,
    tentativas integer DEFAULT 0 NOT NULL,
    "proximaTentativaEm" timestamp with time zone DEFAULT now() NOT NULL,
    erro text,
    "empresaId" text,
    CONSTRAINT "sincronizacaoFila_operacao_check" CHECK ((operacao = ANY (ARRAY['I'::bpchar, 'U'::bpchar, 'D'::bpchar])))
);


--
-- Name: sincronizacaoFila_filaId_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."sincronizacaoFila_filaId_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sincronizacaoFila_filaId_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."sincronizacaoFila_filaId_seq" OWNED BY public."sincronizacaoFila"."filaId";


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
    "empresaId" character varying(36)
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
    "venceuEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
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
    "criadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
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
    "criadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
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
    "criadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
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
    "criadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
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
    "criadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
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
-- Name: sincronizacaoFila filaId; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."sincronizacaoFila" ALTER COLUMN "filaId" SET DEFAULT nextval('public."sincronizacaoFila_filaId_seq"'::regclass);


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
-- Name: pontuacao pontuacoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pontuacao
    ADD CONSTRAINT pontuacoes_pkey PRIMARY KEY ("pontuacaoId");


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
-- Name: sincronizacaoAcesso sincronizacaoAcesso_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."sincronizacaoAcesso"
    ADD CONSTRAINT "sincronizacaoAcesso_pkey" PRIMARY KEY (usuario);


--
-- Name: sincronizacaoEstado sincronizacaoEstado_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."sincronizacaoEstado"
    ADD CONSTRAINT "sincronizacaoEstado_pkey" PRIMARY KEY (chave);


--
-- Name: sincronizacaoFila sincronizacaoFila_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."sincronizacaoFila"
    ADD CONSTRAINT "sincronizacaoFila_pkey" PRIMARY KEY ("filaId");


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
-- Name: idx_leituras_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leituras_session_id ON public.leitura USING btree ("sessaoId");


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
-- Name: sincronizacaoFilaEmpresa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "sincronizacaoFilaEmpresa" ON public."sincronizacaoFila" USING btree ("empresaId", "filaId");


--
-- Name: sincronizacaoFilaEnviadoEm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "sincronizacaoFilaEnviadoEm" ON public."sincronizacaoFila" USING btree ("enviadoEm") WHERE ("enviadoEm" IS NOT NULL);


--
-- Name: sincronizacaoFilaPendente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "sincronizacaoFilaPendente" ON public."sincronizacaoFila" USING btree ("filaId") WHERE ("enviadoEm" IS NULL);


--
-- Name: uqConviteFamiliaHashToken; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uqConviteFamiliaHashToken" ON public."conviteFamilia" USING btree ("hashToken");


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
-- Name: uq_clientes_empresa_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_clientes_empresa_id ON public.cliente USING btree ("empresaId") WHERE ("empresaId" IS NOT NULL);


--
-- Name: uq_empresa_codigo; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_empresa_codigo ON public.empresa USING btree (lower((codigo)::text)) WHERE (codigo IS NOT NULL);


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
-- Name: ux_pulseira_empresa_epc; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_pulseira_empresa_epc ON public.pulseira USING btree ("empresaId", epc) WHERE (epc IS NOT NULL);


--
-- Name: amostraUhf sincronizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "sincronizacaoGatilho" AFTER INSERT OR DELETE OR UPDATE ON public."amostraUhf" FOR EACH ROW EXECUTE FUNCTION public."sincronizacaoRegistrar"('balde', 'antenaId', 'codigo');


--
-- Name: antenaUhf sincronizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "sincronizacaoGatilho" AFTER INSERT OR DELETE OR UPDATE ON public."antenaUhf" FOR EACH ROW EXECUTE FUNCTION public."sincronizacaoRegistrar"('antenaId');


--
-- Name: bonusVencedorJogo sincronizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "sincronizacaoGatilho" AFTER INSERT OR DELETE OR UPDATE ON public."bonusVencedorJogo" FOR EACH ROW EXECUTE FUNCTION public."sincronizacaoRegistrar"('id');


--
-- Name: brincadeira sincronizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "sincronizacaoGatilho" AFTER INSERT OR DELETE OR UPDATE ON public.brincadeira FOR EACH ROW EXECUTE FUNCTION public."sincronizacaoRegistrar"('brincadeiraId');


--
-- Name: brincadeiraParalela sincronizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "sincronizacaoGatilho" AFTER INSERT OR DELETE OR UPDATE ON public."brincadeiraParalela" FOR EACH ROW EXECUTE FUNCTION public."sincronizacaoRegistrar"('id');


--
-- Name: cacaTesourPartida sincronizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "sincronizacaoGatilho" AFTER INSERT OR DELETE OR UPDATE ON public."cacaTesourPartida" FOR EACH ROW EXECUTE FUNCTION public."sincronizacaoRegistrar"('partidaId');


--
-- Name: cacaTesourScan sincronizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "sincronizacaoGatilho" AFTER INSERT OR DELETE OR UPDATE ON public."cacaTesourScan" FOR EACH ROW EXECUTE FUNCTION public."sincronizacaoRegistrar"('scanId');


--
-- Name: cacaTesourTempo sincronizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "sincronizacaoGatilho" AFTER INSERT OR DELETE OR UPDATE ON public."cacaTesourTempo" FOR EACH ROW EXECUTE FUNCTION public."sincronizacaoRegistrar"('tempoId');


--
-- Name: chamadoSuport sincronizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "sincronizacaoGatilho" AFTER INSERT OR DELETE OR UPDATE ON public."chamadoSuport" FOR EACH ROW EXECUTE FUNCTION public."sincronizacaoRegistrar"('ticketId');


--
-- Name: cliente sincronizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "sincronizacaoGatilho" AFTER INSERT OR DELETE OR UPDATE ON public.cliente FOR EACH ROW EXECUTE FUNCTION public."sincronizacaoRegistrar"('clienteId');


--
-- Name: codigoVinculoFamiliar sincronizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "sincronizacaoGatilho" AFTER INSERT OR DELETE OR UPDATE ON public."codigoVinculoFamiliar" FOR EACH ROW EXECUTE FUNCTION public."sincronizacaoRegistrar"('id');


--
-- Name: configuracao sincronizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "sincronizacaoGatilho" AFTER INSERT OR DELETE OR UPDATE ON public.configuracao FOR EACH ROW EXECUTE FUNCTION public."sincronizacaoRegistrar"('configuracaoId');


--
-- Name: conquista sincronizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "sincronizacaoGatilho" AFTER INSERT OR DELETE OR UPDATE ON public.conquista FOR EACH ROW EXECUTE FUNCTION public."sincronizacaoRegistrar"('conquistaId');


--
-- Name: controleEventoEmpresa sincronizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "sincronizacaoGatilho" AFTER INSERT OR DELETE OR UPDATE ON public."controleEventoEmpresa" FOR EACH ROW EXECUTE FUNCTION public."sincronizacaoRegistrar"('empresaId');


--
-- Name: conviteFamilia sincronizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "sincronizacaoGatilho" AFTER INSERT OR DELETE OR UPDATE ON public."conviteFamilia" FOR EACH ROW EXECUTE FUNCTION public."sincronizacaoRegistrar"('conviteId');


--
-- Name: crianca sincronizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "sincronizacaoGatilho" AFTER INSERT OR DELETE OR UPDATE ON public.crianca FOR EACH ROW EXECUTE FUNCTION public."sincronizacaoRegistrar"('criancaId');


--
-- Name: criancaConquista sincronizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "sincronizacaoGatilho" AFTER INSERT OR DELETE OR UPDATE ON public."criancaConquista" FOR EACH ROW EXECUTE FUNCTION public."sincronizacaoRegistrar"('criancaId', 'conquistaId');


--
-- Name: empresa sincronizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "sincronizacaoGatilho" AFTER INSERT OR DELETE OR UPDATE ON public.empresa FOR EACH ROW EXECUTE FUNCTION public."sincronizacaoRegistrar"('empresaId');


--
-- Name: estadoJogoEvento sincronizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "sincronizacaoGatilho" AFTER INSERT OR DELETE OR UPDATE ON public."estadoJogoEvento" FOR EACH ROW EXECUTE FUNCTION public."sincronizacaoRegistrar"('eventoId');


--
-- Name: etiquetaCheckpoint sincronizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "sincronizacaoGatilho" AFTER INSERT OR DELETE OR UPDATE ON public."etiquetaCheckpoint" FOR EACH ROW EXECUTE FUNCTION public."sincronizacaoRegistrar"('tagId');


--
-- Name: evento sincronizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "sincronizacaoGatilho" AFTER INSERT OR DELETE OR UPDATE ON public.evento FOR EACH ROW EXECUTE FUNCTION public."sincronizacaoRegistrar"('eventoId');


--
-- Name: eventoBrincadeira sincronizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "sincronizacaoGatilho" AFTER INSERT OR DELETE OR UPDATE ON public."eventoBrincadeira" FOR EACH ROW EXECUTE FUNCTION public."sincronizacaoRegistrar"('eventoId', 'brincadeiraId');


--
-- Name: leitorUhf sincronizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "sincronizacaoGatilho" AFTER INSERT OR DELETE OR UPDATE ON public."leitorUhf" FOR EACH ROW EXECUTE FUNCTION public."sincronizacaoRegistrar"('leitorId');


--
-- Name: leitura sincronizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "sincronizacaoGatilho" AFTER INSERT OR DELETE OR UPDATE ON public.leitura FOR EACH ROW EXECUTE FUNCTION public."sincronizacaoRegistrar"('leituraId');


--
-- Name: log sincronizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "sincronizacaoGatilho" AFTER INSERT OR DELETE OR UPDATE ON public.log FOR EACH ROW EXECUTE FUNCTION public."sincronizacaoRegistrar"('logId');


--
-- Name: login sincronizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "sincronizacaoGatilho" AFTER INSERT OR DELETE OR UPDATE ON public.login FOR EACH ROW EXECUTE FUNCTION public."sincronizacaoRegistrar"('loginId');


--
-- Name: loteUhf sincronizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "sincronizacaoGatilho" AFTER INSERT OR DELETE OR UPDATE ON public."loteUhf" FOR EACH ROW EXECUTE FUNCTION public."sincronizacaoRegistrar"('leitorId', 'seq');


--
-- Name: mensagemDisplay sincronizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "sincronizacaoGatilho" AFTER INSERT OR DELETE OR UPDATE ON public."mensagemDisplay" FOR EACH ROW EXECUTE FUNCTION public."sincronizacaoRegistrar"('mensagemId');


--
-- Name: monsterCacaEstadoTime sincronizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "sincronizacaoGatilho" AFTER INSERT OR DELETE OR UPDATE ON public."monsterCacaEstadoTime" FOR EACH ROW EXECUTE FUNCTION public."sincronizacaoRegistrar"('id');


--
-- Name: monsterCacaLeitura sincronizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "sincronizacaoGatilho" AFTER INSERT OR DELETE OR UPDATE ON public."monsterCacaLeitura" FOR EACH ROW EXECUTE FUNCTION public."sincronizacaoRegistrar"('id');


--
-- Name: monsterCacaPartida sincronizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "sincronizacaoGatilho" AFTER INSERT OR DELETE OR UPDATE ON public."monsterCacaPartida" FOR EACH ROW EXECUTE FUNCTION public."sincronizacaoRegistrar"('id');


--
-- Name: objetoBrincadeiraParalela sincronizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "sincronizacaoGatilho" AFTER INSERT OR DELETE OR UPDATE ON public."objetoBrincadeiraParalela" FOR EACH ROW EXECUTE FUNCTION public."sincronizacaoRegistrar"('id');


--
-- Name: partidaBomba sincronizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "sincronizacaoGatilho" AFTER INSERT OR DELETE OR UPDATE ON public."partidaBomba" FOR EACH ROW EXECUTE FUNCTION public."sincronizacaoRegistrar"('partidaId');


--
-- Name: partidaRefem sincronizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "sincronizacaoGatilho" AFTER INSERT OR DELETE OR UPDATE ON public."partidaRefem" FOR EACH ROW EXECUTE FUNCTION public."sincronizacaoRegistrar"('partidaId');


--
-- Name: perfilCrianca sincronizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "sincronizacaoGatilho" AFTER INSERT OR DELETE OR UPDATE ON public."perfilCrianca" FOR EACH ROW EXECUTE FUNCTION public."sincronizacaoRegistrar"('perfilCriancaId');


--
-- Name: pontoVerificacao sincronizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "sincronizacaoGatilho" AFTER INSERT OR DELETE OR UPDATE ON public."pontoVerificacao" FOR EACH ROW EXECUTE FUNCTION public."sincronizacaoRegistrar"('checkpointId');


--
-- Name: pontuacao sincronizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "sincronizacaoGatilho" AFTER INSERT OR DELETE OR UPDATE ON public.pontuacao FOR EACH ROW EXECUTE FUNCTION public."sincronizacaoRegistrar"('pontuacaoId');


--
-- Name: pulseira sincronizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "sincronizacaoGatilho" AFTER INSERT OR DELETE OR UPDATE ON public.pulseira FOR EACH ROW EXECUTE FUNCTION public."sincronizacaoRegistrar"('empresaId', 'codigo');


--
-- Name: roundBomba sincronizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "sincronizacaoGatilho" AFTER INSERT OR DELETE OR UPDATE ON public."roundBomba" FOR EACH ROW EXECUTE FUNCTION public."sincronizacaoRegistrar"('roundId');


--
-- Name: roundRefem sincronizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "sincronizacaoGatilho" AFTER INSERT OR DELETE OR UPDATE ON public."roundRefem" FOR EACH ROW EXECUTE FUNCTION public."sincronizacaoRegistrar"('roundId');


--
-- Name: sessaoJogo sincronizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "sincronizacaoGatilho" AFTER INSERT OR DELETE OR UPDATE ON public."sessaoJogo" FOR EACH ROW EXECUTE FUNCTION public."sincronizacaoRegistrar"('id');


--
-- Name: sincronizacaoAcesso sincronizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "sincronizacaoGatilho" AFTER INSERT OR DELETE OR UPDATE ON public."sincronizacaoAcesso" FOR EACH ROW EXECUTE FUNCTION public."sincronizacaoRegistrar"('usuario');


--
-- Name: time sincronizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "sincronizacaoGatilho" AFTER INSERT OR DELETE OR UPDATE ON public."time" FOR EACH ROW EXECUTE FUNCTION public."sincronizacaoRegistrar"('timeId');


--
-- Name: vencedorBrincadeiraParalela sincronizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "sincronizacaoGatilho" AFTER INSERT OR DELETE OR UPDATE ON public."vencedorBrincadeiraParalela" FOR EACH ROW EXECUTE FUNCTION public."sincronizacaoRegistrar"('id');


--
-- Name: vinculoFamiliar sincronizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "sincronizacaoGatilho" AFTER INSERT OR DELETE OR UPDATE ON public."vinculoFamiliar" FOR EACH ROW EXECUTE FUNCTION public."sincronizacaoRegistrar"('vinculoId');


--
-- Name: zona sincronizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "sincronizacaoGatilho" AFTER INSERT OR DELETE OR UPDATE ON public.zona FOR EACH ROW EXECUTE FUNCTION public."sincronizacaoRegistrar"('zonaId');


--
-- Name: zonaConquistaEstadoCheckpoint sincronizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "sincronizacaoGatilho" AFTER INSERT OR DELETE OR UPDATE ON public."zonaConquistaEstadoCheckpoint" FOR EACH ROW EXECUTE FUNCTION public."sincronizacaoRegistrar"('id');


--
-- Name: zonaConquistaEstadoParticipanteIndividual sincronizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "sincronizacaoGatilho" AFTER INSERT OR DELETE OR UPDATE ON public."zonaConquistaEstadoParticipanteIndividual" FOR EACH ROW EXECUTE FUNCTION public."sincronizacaoRegistrar"('id');


--
-- Name: zonaConquistaEstadoZona sincronizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "sincronizacaoGatilho" AFTER INSERT OR DELETE OR UPDATE ON public."zonaConquistaEstadoZona" FOR EACH ROW EXECUTE FUNCTION public."sincronizacaoRegistrar"('id');


--
-- Name: zonaConquistaLeituraIndividual sincronizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "sincronizacaoGatilho" AFTER INSERT OR DELETE OR UPDATE ON public."zonaConquistaLeituraIndividual" FOR EACH ROW EXECUTE FUNCTION public."sincronizacaoRegistrar"('id');


--
-- Name: zonaConquistaLeituraTime sincronizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "sincronizacaoGatilho" AFTER INSERT OR DELETE OR UPDATE ON public."zonaConquistaLeituraTime" FOR EACH ROW EXECUTE FUNCTION public."sincronizacaoRegistrar"('id');


--
-- Name: zonaConquistaPartidaIndividual sincronizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "sincronizacaoGatilho" AFTER INSERT OR DELETE OR UPDATE ON public."zonaConquistaPartidaIndividual" FOR EACH ROW EXECUTE FUNCTION public."sincronizacaoRegistrar"('id');


--
-- Name: zonaConquistaPartidaTime sincronizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "sincronizacaoGatilho" AFTER INSERT OR DELETE OR UPDATE ON public."zonaConquistaPartidaTime" FOR EACH ROW EXECUTE FUNCTION public."sincronizacaoRegistrar"('id');


--
-- Name: zonaConquistaProtecaoCheckpointIndividual sincronizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "sincronizacaoGatilho" AFTER INSERT OR DELETE OR UPDATE ON public."zonaConquistaProtecaoCheckpointIndividual" FOR EACH ROW EXECUTE FUNCTION public."sincronizacaoRegistrar"('id');


--
-- Name: zonaConquistaTempoTime sincronizacaoGatilho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "sincronizacaoGatilho" AFTER INSERT OR DELETE OR UPDATE ON public."zonaConquistaTempoTime" FOR EACH ROW EXECUTE FUNCTION public."sincronizacaoRegistrar"('id');


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
-- Name: sincronizacaoAcesso acessoProprio; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "acessoProprio" ON public."sincronizacaoAcesso" FOR SELECT USING ((usuario = SESSION_USER));


--
-- Name: amostraUhf; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."amostraUhf" ENABLE ROW LEVEL SECURITY;

--
-- Name: antenaUhf; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."antenaUhf" ENABLE ROW LEVEL SECURITY;

--
-- Name: bonusVencedorJogo; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."bonusVencedorJogo" ENABLE ROW LEVEL SECURITY;

--
-- Name: brincadeira; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.brincadeira ENABLE ROW LEVEL SECURITY;

--
-- Name: brincadeiraParalela; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."brincadeiraParalela" ENABLE ROW LEVEL SECURITY;

--
-- Name: amostraUhf buffetVeSuaEmpresa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "buffetVeSuaEmpresa" ON public."amostraUhf" USING ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario"))) WITH CHECK ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario")));


--
-- Name: bonusVencedorJogo buffetVeSuaEmpresa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "buffetVeSuaEmpresa" ON public."bonusVencedorJogo" USING ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario"))) WITH CHECK ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario")));


--
-- Name: brincadeira buffetVeSuaEmpresa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "buffetVeSuaEmpresa" ON public.brincadeira USING ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario"))) WITH CHECK ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario")));


--
-- Name: brincadeiraParalela buffetVeSuaEmpresa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "buffetVeSuaEmpresa" ON public."brincadeiraParalela" USING ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario"))) WITH CHECK ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario")));


--
-- Name: chamadoSuport buffetVeSuaEmpresa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "buffetVeSuaEmpresa" ON public."chamadoSuport" USING ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario"))) WITH CHECK ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario")));


--
-- Name: cliente buffetVeSuaEmpresa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "buffetVeSuaEmpresa" ON public.cliente USING ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario"))) WITH CHECK ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario")));


--
-- Name: codigoVinculoFamiliar buffetVeSuaEmpresa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "buffetVeSuaEmpresa" ON public."codigoVinculoFamiliar" USING ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario"))) WITH CHECK ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario")));


--
-- Name: configuracao buffetVeSuaEmpresa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "buffetVeSuaEmpresa" ON public.configuracao USING (("empresaId" IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario"))) WITH CHECK (("empresaId" IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario")));


--
-- Name: controleEventoEmpresa buffetVeSuaEmpresa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "buffetVeSuaEmpresa" ON public."controleEventoEmpresa" USING ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario"))) WITH CHECK ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario")));


--
-- Name: conviteFamilia buffetVeSuaEmpresa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "buffetVeSuaEmpresa" ON public."conviteFamilia" USING ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario"))) WITH CHECK ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario")));


--
-- Name: crianca buffetVeSuaEmpresa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "buffetVeSuaEmpresa" ON public.crianca USING ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario"))) WITH CHECK ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario")));


--
-- Name: empresa buffetVeSuaEmpresa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "buffetVeSuaEmpresa" ON public.empresa USING ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario"))) WITH CHECK ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario")));


--
-- Name: estadoJogoEvento buffetVeSuaEmpresa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "buffetVeSuaEmpresa" ON public."estadoJogoEvento" USING ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario"))) WITH CHECK ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario")));


--
-- Name: evento buffetVeSuaEmpresa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "buffetVeSuaEmpresa" ON public.evento USING ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario"))) WITH CHECK ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario")));


--
-- Name: leitorUhf buffetVeSuaEmpresa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "buffetVeSuaEmpresa" ON public."leitorUhf" USING ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario"))) WITH CHECK ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario")));


--
-- Name: leitura buffetVeSuaEmpresa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "buffetVeSuaEmpresa" ON public.leitura USING ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario"))) WITH CHECK ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario")));


--
-- Name: log buffetVeSuaEmpresa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "buffetVeSuaEmpresa" ON public.log USING ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario"))) WITH CHECK ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario")));


--
-- Name: login buffetVeSuaEmpresa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "buffetVeSuaEmpresa" ON public.login USING ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario"))) WITH CHECK ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario")));


--
-- Name: monsterCacaEstadoTime buffetVeSuaEmpresa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "buffetVeSuaEmpresa" ON public."monsterCacaEstadoTime" USING ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario"))) WITH CHECK ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario")));


--
-- Name: monsterCacaLeitura buffetVeSuaEmpresa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "buffetVeSuaEmpresa" ON public."monsterCacaLeitura" USING ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario"))) WITH CHECK ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario")));


--
-- Name: monsterCacaPartida buffetVeSuaEmpresa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "buffetVeSuaEmpresa" ON public."monsterCacaPartida" USING ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario"))) WITH CHECK ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario")));


--
-- Name: objetoBrincadeiraParalela buffetVeSuaEmpresa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "buffetVeSuaEmpresa" ON public."objetoBrincadeiraParalela" USING ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario"))) WITH CHECK ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario")));


--
-- Name: partidaBomba buffetVeSuaEmpresa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "buffetVeSuaEmpresa" ON public."partidaBomba" USING ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario"))) WITH CHECK ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario")));


--
-- Name: partidaRefem buffetVeSuaEmpresa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "buffetVeSuaEmpresa" ON public."partidaRefem" USING ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario"))) WITH CHECK ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario")));


--
-- Name: perfilCrianca buffetVeSuaEmpresa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "buffetVeSuaEmpresa" ON public."perfilCrianca" USING ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario"))) WITH CHECK ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario")));


--
-- Name: pontoVerificacao buffetVeSuaEmpresa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "buffetVeSuaEmpresa" ON public."pontoVerificacao" USING ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario"))) WITH CHECK ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario")));


--
-- Name: pontuacao buffetVeSuaEmpresa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "buffetVeSuaEmpresa" ON public.pontuacao USING ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario"))) WITH CHECK ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario")));


--
-- Name: pulseira buffetVeSuaEmpresa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "buffetVeSuaEmpresa" ON public.pulseira USING ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario"))) WITH CHECK ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario")));


--
-- Name: sincronizacaoFila buffetVeSuaEmpresa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "buffetVeSuaEmpresa" ON public."sincronizacaoFila" USING (("empresaId" IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario"))) WITH CHECK (("empresaId" IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario")));


--
-- Name: time buffetVeSuaEmpresa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "buffetVeSuaEmpresa" ON public."time" USING ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario"))) WITH CHECK ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario")));


--
-- Name: vencedorBrincadeiraParalela buffetVeSuaEmpresa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "buffetVeSuaEmpresa" ON public."vencedorBrincadeiraParalela" USING ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario"))) WITH CHECK ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario")));


--
-- Name: vinculoFamiliar buffetVeSuaEmpresa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "buffetVeSuaEmpresa" ON public."vinculoFamiliar" USING ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario"))) WITH CHECK ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario")));


--
-- Name: zonaConquistaEstadoCheckpoint buffetVeSuaEmpresa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "buffetVeSuaEmpresa" ON public."zonaConquistaEstadoCheckpoint" USING ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario"))) WITH CHECK ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario")));


--
-- Name: zonaConquistaEstadoParticipanteIndividual buffetVeSuaEmpresa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "buffetVeSuaEmpresa" ON public."zonaConquistaEstadoParticipanteIndividual" USING ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario"))) WITH CHECK ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario")));


--
-- Name: zonaConquistaEstadoZona buffetVeSuaEmpresa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "buffetVeSuaEmpresa" ON public."zonaConquistaEstadoZona" USING ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario"))) WITH CHECK ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario")));


--
-- Name: zonaConquistaLeituraIndividual buffetVeSuaEmpresa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "buffetVeSuaEmpresa" ON public."zonaConquistaLeituraIndividual" USING ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario"))) WITH CHECK ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario")));


--
-- Name: zonaConquistaLeituraTime buffetVeSuaEmpresa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "buffetVeSuaEmpresa" ON public."zonaConquistaLeituraTime" USING ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario"))) WITH CHECK ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario")));


--
-- Name: zonaConquistaPartidaIndividual buffetVeSuaEmpresa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "buffetVeSuaEmpresa" ON public."zonaConquistaPartidaIndividual" USING ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario"))) WITH CHECK ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario")));


--
-- Name: zonaConquistaPartidaTime buffetVeSuaEmpresa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "buffetVeSuaEmpresa" ON public."zonaConquistaPartidaTime" USING ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario"))) WITH CHECK ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario")));


--
-- Name: zonaConquistaTempoTime buffetVeSuaEmpresa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "buffetVeSuaEmpresa" ON public."zonaConquistaTempoTime" USING ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario"))) WITH CHECK ((("empresaId")::text IN ( SELECT public."sincronizacaoEmpresasDoUsuario"() AS "sincronizacaoEmpresasDoUsuario")));


--
-- Name: cacaTesourPartida; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."cacaTesourPartida" ENABLE ROW LEVEL SECURITY;

--
-- Name: cacaTesourScan; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."cacaTesourScan" ENABLE ROW LEVEL SECURITY;

--
-- Name: cacaTesourTempo; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."cacaTesourTempo" ENABLE ROW LEVEL SECURITY;

--
-- Name: chamadoSuport; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."chamadoSuport" ENABLE ROW LEVEL SECURITY;

--
-- Name: cliente; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cliente ENABLE ROW LEVEL SECURITY;

--
-- Name: codigoVinculoFamiliar; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."codigoVinculoFamiliar" ENABLE ROW LEVEL SECURITY;

--
-- Name: configuracao; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.configuracao ENABLE ROW LEVEL SECURITY;

--
-- Name: conquista; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conquista ENABLE ROW LEVEL SECURITY;

--
-- Name: controleEventoEmpresa; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."controleEventoEmpresa" ENABLE ROW LEVEL SECURITY;

--
-- Name: conviteFamilia; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."conviteFamilia" ENABLE ROW LEVEL SECURITY;

--
-- Name: crianca; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crianca ENABLE ROW LEVEL SECURITY;

--
-- Name: criancaConquista; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."criancaConquista" ENABLE ROW LEVEL SECURITY;

--
-- Name: empresa; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.empresa ENABLE ROW LEVEL SECURITY;

--
-- Name: estadoJogoEvento; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."estadoJogoEvento" ENABLE ROW LEVEL SECURITY;

--
-- Name: etiquetaCheckpoint; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."etiquetaCheckpoint" ENABLE ROW LEVEL SECURITY;

--
-- Name: evento; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.evento ENABLE ROW LEVEL SECURITY;

--
-- Name: eventoBrincadeira; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."eventoBrincadeira" ENABLE ROW LEVEL SECURITY;

--
-- Name: leitorUhf; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."leitorUhf" ENABLE ROW LEVEL SECURITY;

--
-- Name: leitura; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.leitura ENABLE ROW LEVEL SECURITY;

--
-- Name: log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.log ENABLE ROW LEVEL SECURITY;

--
-- Name: login; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.login ENABLE ROW LEVEL SECURITY;

--
-- Name: loteUhf; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."loteUhf" ENABLE ROW LEVEL SECURITY;

--
-- Name: mensagemDisplay; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."mensagemDisplay" ENABLE ROW LEVEL SECURITY;

--
-- Name: monsterCacaEstadoTime; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."monsterCacaEstadoTime" ENABLE ROW LEVEL SECURITY;

--
-- Name: monsterCacaLeitura; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."monsterCacaLeitura" ENABLE ROW LEVEL SECURITY;

--
-- Name: monsterCacaPartida; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."monsterCacaPartida" ENABLE ROW LEVEL SECURITY;

--
-- Name: objetoBrincadeiraParalela; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."objetoBrincadeiraParalela" ENABLE ROW LEVEL SECURITY;

--
-- Name: partidaBomba; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."partidaBomba" ENABLE ROW LEVEL SECURITY;

--
-- Name: partidaRefem; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."partidaRefem" ENABLE ROW LEVEL SECURITY;

--
-- Name: perfilCrianca; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."perfilCrianca" ENABLE ROW LEVEL SECURITY;

--
-- Name: pontoVerificacao; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."pontoVerificacao" ENABLE ROW LEVEL SECURITY;

--
-- Name: pontuacao; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pontuacao ENABLE ROW LEVEL SECURITY;

--
-- Name: pulseira; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pulseira ENABLE ROW LEVEL SECURITY;

--
-- Name: roundBomba; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."roundBomba" ENABLE ROW LEVEL SECURITY;

--
-- Name: roundRefem; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."roundRefem" ENABLE ROW LEVEL SECURITY;

--
-- Name: sessaoJogo; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."sessaoJogo" ENABLE ROW LEVEL SECURITY;

--
-- Name: sincronizacaoAcesso; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."sincronizacaoAcesso" ENABLE ROW LEVEL SECURITY;

--
-- Name: sincronizacaoEstado; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."sincronizacaoEstado" ENABLE ROW LEVEL SECURITY;

--
-- Name: sincronizacaoFila; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."sincronizacaoFila" ENABLE ROW LEVEL SECURITY;

--
-- Name: time; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."time" ENABLE ROW LEVEL SECURITY;

--
-- Name: vencedorBrincadeiraParalela; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."vencedorBrincadeiraParalela" ENABLE ROW LEVEL SECURITY;

--
-- Name: vinculoFamiliar; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."vinculoFamiliar" ENABLE ROW LEVEL SECURITY;

--
-- Name: zona; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.zona ENABLE ROW LEVEL SECURITY;

--
-- Name: zonaConquistaEstadoCheckpoint; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."zonaConquistaEstadoCheckpoint" ENABLE ROW LEVEL SECURITY;

--
-- Name: zonaConquistaEstadoParticipanteIndividual; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."zonaConquistaEstadoParticipanteIndividual" ENABLE ROW LEVEL SECURITY;

--
-- Name: zonaConquistaEstadoZona; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."zonaConquistaEstadoZona" ENABLE ROW LEVEL SECURITY;

--
-- Name: zonaConquistaLeituraIndividual; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."zonaConquistaLeituraIndividual" ENABLE ROW LEVEL SECURITY;

--
-- Name: zonaConquistaLeituraTime; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."zonaConquistaLeituraTime" ENABLE ROW LEVEL SECURITY;

--
-- Name: zonaConquistaPartidaIndividual; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."zonaConquistaPartidaIndividual" ENABLE ROW LEVEL SECURITY;

--
-- Name: zonaConquistaPartidaTime; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."zonaConquistaPartidaTime" ENABLE ROW LEVEL SECURITY;

--
-- Name: zonaConquistaProtecaoCheckpointIndividual; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."zonaConquistaProtecaoCheckpointIndividual" ENABLE ROW LEVEL SECURITY;

--
-- Name: zonaConquistaTempoTime; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."zonaConquistaTempoTime" ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--


