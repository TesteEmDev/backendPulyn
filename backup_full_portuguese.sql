--
-- PostgreSQL database dump
--

\restrict qWHWhNfEoldX3YXiCSFPpOaloETHLxCmkkFhEsRm3xR5rTPwPWNbk05rm4RLYnn

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
-- Name: auth; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA auth;


--
-- Name: extensions; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA extensions;


--
-- Name: graphql; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA graphql;


--
-- Name: graphql_public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA graphql_public;


--
-- Name: pgbouncer; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA pgbouncer;


--
-- Name: realtime; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA realtime;


--
-- Name: storage; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA storage;


--
-- Name: vault; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA vault;


--
-- Name: pg_stat_statements; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;


--
-- Name: EXTENSION pg_stat_statements; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_stat_statements IS 'track planning and execution statistics of all SQL statements executed';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: aal_level; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.aal_level AS ENUM (
    'aal1',
    'aal2',
    'aal3'
);


--
-- Name: code_challenge_method; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.code_challenge_method AS ENUM (
    's256',
    'plain'
);


--
-- Name: factor_status; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.factor_status AS ENUM (
    'unverified',
    'verified'
);


--
-- Name: factor_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.factor_type AS ENUM (
    'totp',
    'webauthn',
    'phone',
    'recovery_code'
);


--
-- Name: oauth_authorization_status; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_authorization_status AS ENUM (
    'pending',
    'approved',
    'denied',
    'expired'
);


--
-- Name: oauth_client_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_client_type AS ENUM (
    'public',
    'confidential'
);


--
-- Name: oauth_registration_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_registration_type AS ENUM (
    'dynamic',
    'manual'
);


--
-- Name: oauth_response_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_response_type AS ENUM (
    'code'
);


--
-- Name: one_time_token_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.one_time_token_type AS ENUM (
    'confirmation_token',
    'reauthentication_token',
    'recovery_token',
    'email_change_token_new',
    'email_change_token_current',
    'phone_change_token'
);


--
-- Name: action; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.action AS ENUM (
    'INSERT',
    'UPDATE',
    'DELETE',
    'TRUNCATE',
    'ERROR'
);


--
-- Name: equality_op; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.equality_op AS ENUM (
    'eq',
    'neq',
    'lt',
    'lte',
    'gt',
    'gte',
    'in',
    'like',
    'ilike',
    'is',
    'match',
    'imatch',
    'isdistinct'
);


--
-- Name: user_defined_filter; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.user_defined_filter AS (
	column_name text,
	op realtime.equality_op,
	value text,
	negate boolean
);


--
-- Name: wal_column; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.wal_column AS (
	name text,
	type_name text,
	type_oid oid,
	value jsonb,
	is_pkey boolean,
	is_selectable boolean
);


--
-- Name: wal_rls; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.wal_rls AS (
	wal jsonb,
	is_rls_enabled boolean,
	subscription_ids uuid[],
	errors text[]
);


--
-- Name: buckettype; Type: TYPE; Schema: storage; Owner: -
--

CREATE TYPE storage.buckettype AS ENUM (
    'STANDARD',
    'ANALYTICS',
    'VECTOR'
);


--
-- Name: email(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.email() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  )::text
$$;


--
-- Name: FUNCTION email(); Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON FUNCTION auth.email() IS 'Deprecated. Use auth.jwt() -> ''email'' instead.';


--
-- Name: jwt(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.jwt() RETURNS jsonb
    LANGUAGE sql STABLE
    AS $$
  select 
    coalesce(
        nullif(current_setting('request.jwt.claim', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
$$;


--
-- Name: role(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.role() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;


--
-- Name: FUNCTION role(); Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON FUNCTION auth.role() IS 'Deprecated. Use auth.jwt() -> ''role'' instead.';


--
-- Name: uid(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;


--
-- Name: FUNCTION uid(); Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON FUNCTION auth.uid() IS 'Deprecated. Use auth.jwt() -> ''sub'' instead.';


--
-- Name: grant_pg_cron_access(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.grant_pg_cron_access() RETURNS event_trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF EXISTS (
    SELECT
    FROM pg_event_trigger_ddl_commands() AS ev
    JOIN pg_extension AS ext
    ON ev.objid = ext.oid
    WHERE ext.extname = 'pg_cron'
  )
  THEN
    grant usage on schema cron to postgres with grant option;

    alter default privileges in schema cron grant all on tables to postgres with grant option;
    alter default privileges in schema cron grant all on functions to postgres with grant option;
    alter default privileges in schema cron grant all on sequences to postgres with grant option;

    alter default privileges for user supabase_admin in schema cron grant all
        on sequences to postgres with grant option;
    alter default privileges for user supabase_admin in schema cron grant all
        on tables to postgres with grant option;
    alter default privileges for user supabase_admin in schema cron grant all
        on functions to postgres with grant option;

    grant all privileges on all tables in schema cron to postgres with grant option;
    revoke all on table cron.job from postgres;
    grant select on table cron.job to postgres with grant option;
    revoke trigger on cron.job_run_details from postgres;
  END IF;
END;
$$;


--
-- Name: FUNCTION grant_pg_cron_access(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.grant_pg_cron_access() IS 'Grants access to pg_cron';


--
-- Name: grant_pg_graphql_access(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.grant_pg_graphql_access() RETURNS event_trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $_$
begin
    if not exists (
        select 1
        from pg_catalog.pg_event_trigger_ddl_commands() ev
        join pg_catalog.pg_extension e on ev.objid = e.oid
        where e.extname = 'pg_graphql'
    ) then
        return;
    end if;

    drop function if exists graphql_public.graphql;
    create or replace function graphql_public.graphql(
        "operationName" text default null,
        query text default null,
        variables jsonb default null,
        extensions jsonb default null
    )
        returns jsonb
        language sql
    as $$
        select graphql.resolve(
            query := query,
            variables := coalesce(variables, '{}'),
            "operationName" := "operationName",
            extensions := extensions
        );
    $$;

    -- Attach the wrapper to the extension so DROP EXTENSION cascades to it,
    -- which in turn triggers set_graphql_placeholder to reinstall the "not enabled" stub.
    alter extension pg_graphql add function graphql_public.graphql(text, text, jsonb, jsonb);

    grant usage on schema graphql to postgres, anon, authenticated, service_role;
    grant execute on function graphql.resolve to postgres, anon, authenticated, service_role;
    grant usage on schema graphql to postgres with grant option;
    grant usage on schema graphql_public to postgres with grant option;
end;
$_$;


--
-- Name: FUNCTION grant_pg_graphql_access(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.grant_pg_graphql_access() IS 'Grants access to pg_graphql';


--
-- Name: grant_pg_net_access(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.grant_pg_net_access() RETURNS event_trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_event_trigger_ddl_commands() AS ev
    JOIN pg_extension AS ext
    ON ev.objid = ext.oid
    WHERE ext.extname = 'pg_net'
  )
  THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_roles
      WHERE rolname = 'supabase_functions_admin'
    )
    THEN
      CREATE USER supabase_functions_admin NOINHERIT CREATEROLE LOGIN NOREPLICATION;
    END IF;

    GRANT USAGE ON SCHEMA net TO supabase_functions_admin, postgres, anon, authenticated, service_role;

    IF EXISTS (
      SELECT FROM pg_extension
      WHERE extname = 'pg_net'
      -- all versions in use on existing projects as of 2025-02-20
      -- version 0.12.0 onwards don't need these applied
      AND extversion IN ('0.2', '0.6', '0.7', '0.7.1', '0.8.0', '0.10.0', '0.11.0')
    ) THEN
      ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;
      ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;

      ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;
      ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;

      REVOKE ALL ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;
      REVOKE ALL ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;

      GRANT EXECUTE ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
      GRANT EXECUTE ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
    END IF;
  END IF;
END;
$$;


--
-- Name: FUNCTION grant_pg_net_access(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.grant_pg_net_access() IS 'Grants access to pg_net';


--
-- Name: pgrst_ddl_watch(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.pgrst_ddl_watch() RETURNS event_trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN SELECT * FROM pg_event_trigger_ddl_commands()
  LOOP
    IF cmd.command_tag IN (
      'CREATE SCHEMA', 'ALTER SCHEMA'
    , 'CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO', 'ALTER TABLE'
    , 'CREATE FOREIGN TABLE', 'ALTER FOREIGN TABLE'
    , 'CREATE VIEW', 'ALTER VIEW'
    , 'CREATE MATERIALIZED VIEW', 'ALTER MATERIALIZED VIEW'
    , 'CREATE FUNCTION', 'ALTER FUNCTION'
    , 'CREATE TRIGGER'
    , 'CREATE TYPE', 'ALTER TYPE'
    , 'CREATE RULE'
    , 'COMMENT'
    )
    -- don't notify in case of CREATE TEMP table or other objects created on pg_temp
    AND cmd.schema_name is distinct from 'pg_temp'
    THEN
      NOTIFY pgrst, 'reload schema';
    END IF;
  END LOOP;
END; $$;


--
-- Name: pgrst_drop_watch(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.pgrst_drop_watch() RETURNS event_trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  obj record;
BEGIN
  FOR obj IN SELECT * FROM pg_event_trigger_dropped_objects()
  LOOP
    IF obj.object_type IN (
      'schema'
    , 'table'
    , 'foreign table'
    , 'view'
    , 'materialized view'
    , 'function'
    , 'trigger'
    , 'type'
    , 'rule'
    )
    AND obj.is_temporary IS false -- no pg_temp objects
    THEN
      NOTIFY pgrst, 'reload schema';
    END IF;
  END LOOP;
END; $$;


--
-- Name: set_graphql_placeholder(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.set_graphql_placeholder() RETURNS event_trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $_$
    DECLARE
    graphql_is_dropped bool;
    BEGIN
    graphql_is_dropped = (
        SELECT ev.schema_name = 'graphql_public'
        FROM pg_event_trigger_dropped_objects() AS ev
        WHERE ev.schema_name = 'graphql_public'
    );

    IF graphql_is_dropped
    THEN
        create or replace function graphql_public.graphql(
            "operationName" text default null,
            query text default null,
            variables jsonb default null,
            extensions jsonb default null
        )
            returns jsonb
            language plpgsql
            set search_path to ''
        as $$
            DECLARE
                server_version float;
            BEGIN
                server_version = (SELECT (SPLIT_PART((select version()), ' ', 2))::float);

                IF server_version >= 14 THEN
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql extension is not enabled.'
                            )
                        )
                    );
                ELSE
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql is only available on projects running Postgres 14 onwards.'
                            )
                        )
                    );
                END IF;
            END;
        $$;
    END IF;

    END;
$_$;


--
-- Name: FUNCTION set_graphql_placeholder(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.set_graphql_placeholder() IS 'Reintroduces placeholder function for graphql_public.graphql';


--
-- Name: graphql(text, text, jsonb, jsonb); Type: FUNCTION; Schema: graphql_public; Owner: -
--

CREATE FUNCTION graphql_public.graphql("operationName" text DEFAULT NULL::text, query text DEFAULT NULL::text, variables jsonb DEFAULT NULL::jsonb, extensions jsonb DEFAULT NULL::jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
            DECLARE
                server_version float;
            BEGIN
                server_version = (SELECT (SPLIT_PART((select version()), ' ', 2))::float);

                IF server_version >= 14 THEN
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql extension is not enabled.'
                            )
                        )
                    );
                ELSE
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql is only available on projects running Postgres 14 onwards.'
                            )
                        )
                    );
                END IF;
            END;
        $$;


--
-- Name: get_auth(text); Type: FUNCTION; Schema: pgbouncer; Owner: -
--

CREATE FUNCTION pgbouncer.get_auth(p_usename text) RETURNS TABLE(username text, password text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
  BEGIN
      RAISE DEBUG 'PgBouncer auth request: %', p_usename;

      RETURN QUERY
      SELECT
          rolname::text,
          CASE WHEN rolvaliduntil < now()
              THEN null
              ELSE rolpassword::text
          END
      FROM pg_authid
      WHERE rolname=$1 and rolcanlogin;
  END;
  $_$;


--
-- Name: apply_rls(jsonb, integer); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer DEFAULT (1024 * 1024)) RETURNS SETOF realtime.wal_rls
    LANGUAGE plpgsql
    AS $$
declare
    -- Regclass of the table e.g. public.notes
    entity_ regclass = (quote_ident(wal ->> 'schema') || '.' || quote_ident(wal ->> 'table'))::regclass;

    -- I, U, D, T: insert, update ...
    action realtime.action = (
        case wal ->> 'action'
            when 'I' then 'INSERT'
            when 'U' then 'UPDATE'
            when 'D' then 'DELETE'
            else 'ERROR'
        end
    );

    -- Is row level security enabled for the table
    is_rls_enabled bool = relrowsecurity from pg_class where oid = entity_;

    subscriptions realtime.subscription[] = array_agg(subs)
        from
            realtime.subscription subs
        where
            subs.entity = entity_
            -- Filter by action early - only get subscriptions interested in this action
            -- action_filter column can be: '*' (all), 'INSERT', 'UPDATE', or 'DELETE'
            and (subs.action_filter = '*' or subs.action_filter = action::text);

    -- Subscription vars
    working_role regrole;
    working_selected_columns text[];
    claimed_role regrole;
    claims jsonb;

    subscription_id uuid;
    subscription_has_access bool;
    visible_to_subscription_ids uuid[] = '{}';

    -- structured info for wal's columns
    columns realtime.wal_column[];
    -- previous identity values for update/delete
    old_columns realtime.wal_column[];

    error_record_exceeds_max_size boolean = octet_length(wal::text) > max_record_bytes;

    -- Primary jsonb output for record
    output jsonb;

    -- Loop record for iterating unique roles (outer loop)
    role_record record;
    -- Loop record for iterating unique selected_columns within a role (inner loop)
    cols_record record;
    -- Subscription ids visible at the role level (before fanning out by selected_columns)
    visible_role_sub_ids uuid[] = '{}';

begin
    perform set_config('role', null, true);

    columns =
        array_agg(
            (
                x->>'name',
                x->>'type',
                x->>'typeoid',
                realtime.cast(
                    (x->'value') #>> '{}',
                    coalesce(
                        (x->>'typeoid')::regtype, -- null when wal2json version <= 2.4
                        (x->>'type')::regtype
                    )
                ),
                (pks ->> 'name') is not null,
                true
            )::realtime.wal_column
        )
        from
            jsonb_array_elements(wal -> 'columns') x
            left join jsonb_array_elements(wal -> 'pk') pks
                on (x ->> 'name') = (pks ->> 'name');

    old_columns =
        array_agg(
            (
                x->>'name',
                x->>'type',
                x->>'typeoid',
                realtime.cast(
                    (x->'value') #>> '{}',
                    coalesce(
                        (x->>'typeoid')::regtype, -- null when wal2json version <= 2.4
                        (x->>'type')::regtype
                    )
                ),
                (pks ->> 'name') is not null,
                true
            )::realtime.wal_column
        )
        from
            jsonb_array_elements(wal -> 'identity') x
            left join jsonb_array_elements(wal -> 'pk') pks
                on (x ->> 'name') = (pks ->> 'name');

    for role_record in
        select claims_role
        from (select distinct claims_role from unnest(subscriptions)) t
        order by claims_role::text
    loop
        working_role := role_record.claims_role;

        -- Update `is_selectable` for columns and old_columns (once per role)
        columns =
            array_agg(
                (
                    c.name,
                    c.type_name,
                    c.type_oid,
                    c.value,
                    c.is_pkey,
                    pg_catalog.has_column_privilege(working_role, entity_, c.name, 'SELECT')
                )::realtime.wal_column
            )
            from
                unnest(columns) c;

        old_columns =
                array_agg(
                    (
                        c.name,
                        c.type_name,
                        c.type_oid,
                        c.value,
                        c.is_pkey,
                        pg_catalog.has_column_privilege(working_role, entity_, c.name, 'SELECT')
                    )::realtime.wal_column
                )
                from
                    unnest(old_columns) c;

        if action <> 'DELETE' and count(1) = 0 from unnest(columns) c where c.is_pkey then
            -- Fan out 400 error per distinct selected_columns for this role
            for cols_record in
                select selected_columns
                from (select distinct selected_columns from unnest(subscriptions) s where s.claims_role = working_role) t
                order by coalesce(array_to_string(selected_columns, ','), '')
            loop
                working_selected_columns := cols_record.selected_columns;
                return next (
                    jsonb_build_object(
                        'schema', wal ->> 'schema',
                        'table', wal ->> 'table',
                        'type', action
                    ),
                    is_rls_enabled,
                    (select array_agg(s.subscription_id) from unnest(subscriptions) as s where s.claims_role = working_role and (s.selected_columns is not distinct from working_selected_columns)),
                    array['Error 400: Bad Request, no primary key']
                )::realtime.wal_rls;
            end loop;

        -- The claims role does not have SELECT permission to the primary key of entity
        elsif action <> 'DELETE' and sum(c.is_selectable::int) <> count(1) from unnest(columns) c where c.is_pkey then
            -- Fan out 401 error per distinct selected_columns for this role
            for cols_record in
                select selected_columns
                from (select distinct selected_columns from unnest(subscriptions) s where s.claims_role = working_role) t
                order by coalesce(array_to_string(selected_columns, ','), '')
            loop
                working_selected_columns := cols_record.selected_columns;
                return next (
                    jsonb_build_object(
                        'schema', wal ->> 'schema',
                        'table', wal ->> 'table',
                        'type', action
                    ),
                    is_rls_enabled,
                    (select array_agg(s.subscription_id) from unnest(subscriptions) as s where s.claims_role = working_role and (s.selected_columns is not distinct from working_selected_columns)),
                    array['Error 401: Unauthorized']
                )::realtime.wal_rls;
            end loop;

        else
            -- Create the prepared statement (once per role)
            if is_rls_enabled and action <> 'DELETE' then
                if (select 1 from pg_prepared_statements where name = 'walrus_rls_stmt' limit 1) > 0 then
                    deallocate walrus_rls_stmt;
                end if;
                execute realtime.build_prepared_statement_sql('walrus_rls_stmt', entity_, columns);
            end if;

            -- Collect all visible subscription IDs for this role (filter check + RLS check)
            visible_role_sub_ids = '{}';

            for subscription_id, claims in (
                    select
                        subs.subscription_id,
                        subs.claims
                    from
                        unnest(subscriptions) subs
                    where
                        subs.entity = entity_
                        and subs.claims_role = working_role
                        and (
                            realtime.is_visible_through_filters(columns, subs.filters)
                            or (
                              action = 'DELETE'
                              and realtime.is_visible_through_filters(old_columns, subs.filters)
                            )
                        )
            ) loop

                if not is_rls_enabled or action = 'DELETE' then
                    visible_role_sub_ids = visible_role_sub_ids || subscription_id;
                else
                    -- Check if RLS allows the role to see the record
                    perform
                        -- Trim leading and trailing quotes from working_role because set_config
                        -- doesn't recognize the role as valid if they are included
                        set_config('role', trim(both '"' from working_role::text), true),
                        set_config('request.jwt.claims', claims::text, true);

                    execute 'execute walrus_rls_stmt' into subscription_has_access;

                    -- Reset the role on every FOR..LOOP batch execution.
                    -- The first batch of 10 rows is pre-fetched using the current connection role (PG internal behaviour)
                    -- then we have to reset it again otherwise it would use the role defined in the `set_config` above
                    -- to fetch the remaining rows when rows>10, which could be a user-defined role that lacks execution grants.
                    -- The flow is:
                    --   1. run batch with conn role
                    --   2. set_config working_role
                    --   3. execute walrus
                    --   4. reset role (revert)
                    --   5. repeat
                    perform set_config('role', null, true);

                    if subscription_has_access then
                        visible_role_sub_ids = visible_role_sub_ids || subscription_id;
                    end if;
                end if;
            end loop;

            perform set_config('role', null, true);

            -- Inner loop: per distinct selected_columns for this role
            for cols_record in
                select selected_columns
                from (select distinct selected_columns from unnest(subscriptions) s where s.claims_role = working_role) t
                order by coalesce(array_to_string(selected_columns, ','), '')
            loop
                working_selected_columns := cols_record.selected_columns;

                output = jsonb_build_object(
                    'schema', wal ->> 'schema',
                    'table', wal ->> 'table',
                    'type', action,
                    'commit_timestamp', to_char(
                        ((wal ->> 'timestamp')::timestamptz at time zone 'utc'),
                        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
                    ),
                    'columns', (
                        select
                            jsonb_agg(
                                jsonb_build_object(
                                    'name', pa.attname,
                                    'type', pt.typname
                                )
                                order by pa.attnum asc
                            )
                        from
                            pg_attribute pa
                            join pg_type pt
                                on pa.atttypid = pt.oid
                            left join (
                                select unnest(conkey) as pkey_attnum
                                from pg_constraint
                                where conrelid = entity_ and contype = 'p'
                            ) pk on pk.pkey_attnum = pa.attnum
                        where
                            attrelid = entity_
                            and attnum > 0
                            and pg_catalog.has_column_privilege(working_role, entity_, pa.attname, 'SELECT')
                            and (working_selected_columns is null or pa.attname = any(working_selected_columns) or pk.pkey_attnum is not null)
                    )
                )
                -- Add "record" key for insert and update
                || case
                    when action in ('INSERT', 'UPDATE') then
                        jsonb_build_object(
                            'record',
                            (
                                select
                                    jsonb_object_agg(
                                        -- if unchanged toast, get column name and value from old record
                                        coalesce((c).name, (oc).name),
                                        case
                                            when (c).name is null then (oc).value
                                            else (c).value
                                        end
                                    )
                                from
                                    unnest(columns) c
                                    full outer join unnest(old_columns) oc
                                        on (c).name = (oc).name
                                where
                                    coalesce((c).is_selectable, (oc).is_selectable)
                                    and (working_selected_columns is null or coalesce((c).name, (oc).name) = any(working_selected_columns) or coalesce((c).is_pkey, (oc).is_pkey))
                                    and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                            )
                        )
                    else '{}'::jsonb
                end
                -- Add "old_record" key for update and delete
                || case
                    when action = 'UPDATE' then
                        jsonb_build_object(
                                'old_record',
                                (
                                    select jsonb_object_agg((c).name, (c).value)
                                    from unnest(old_columns) c
                                    where
                                        (c).is_selectable
                                        and (working_selected_columns is null or (c).name = any(working_selected_columns) or (c).is_pkey)
                                        and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                                )
                            )
                    when action = 'DELETE' then
                        jsonb_build_object(
                            'old_record',
                            (
                                select jsonb_object_agg((c).name, (c).value)
                                from unnest(old_columns) c
                                where
                                    (c).is_selectable
                                    and (working_selected_columns is null or (c).name = any(working_selected_columns) or (c).is_pkey)
                                    and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                                    and ( not is_rls_enabled or (c).is_pkey ) -- if RLS enabled, we can't secure deletes so filter to pkey
                            )
                        )
                    else '{}'::jsonb
                end;

                -- Filter visible_role_sub_ids to those matching the current selected_columns group
                visible_to_subscription_ids = coalesce(
                    (
                        select array_agg(s.subscription_id)
                        from unnest(subscriptions) s
                        where s.claims_role = working_role
                          and (s.selected_columns is not distinct from working_selected_columns)
                          and s.subscription_id = any(visible_role_sub_ids)
                    ),
                    '{}'::uuid[]
                );

                return next (
                    output,
                    is_rls_enabled,
                    visible_to_subscription_ids,
                    case
                        when error_record_exceeds_max_size then array['Error 413: Payload Too Large']
                        else '{}'
                    end
                )::realtime.wal_rls;
            end loop;

        end if;
    end loop;

    perform set_config('role', null, true);
end;
$$;


--
-- Name: broadcast_changes(text, text, text, text, text, record, record, text); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.broadcast_changes(topic_name text, event_name text, operation text, table_name text, table_schema text, new record, old record, level text DEFAULT 'ROW'::text) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    -- Declare a variable to hold the JSONB representation of the row
    row_data jsonb := '{}'::jsonb;
BEGIN
    IF level = 'STATEMENT' THEN
        RAISE EXCEPTION 'function can only be triggered for each row, not for each statement';
    END IF;
    -- Check the operation type and handle accordingly
    IF operation = 'INSERT' OR operation = 'UPDATE' OR operation = 'DELETE' THEN
        row_data := jsonb_build_object('old_record', OLD, 'record', NEW, 'operation', operation, 'table', table_name, 'schema', table_schema);
        PERFORM realtime.send (row_data, event_name, topic_name);
    ELSE
        RAISE EXCEPTION 'Unexpected operation type: %', operation;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Failed to process the row: %', SQLERRM;
END;

$$;


--
-- Name: build_prepared_statement_sql(text, regclass, realtime.wal_column[]); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) RETURNS text
    LANGUAGE sql
    AS $$
      /*
      Builds a sql string that, if executed, creates a prepared statement to
      tests retrive a row from *entity* by its primary key columns.
      Example
          select realtime.build_prepared_statement_sql('public.notes', '{"id"}'::text[], '{"bigint"}'::text[])
      */
          select
      'prepare ' || prepared_statement_name || ' as
          select
              exists(
                  select
                      1
                  from
                      ' || entity || '
                  where
                      ' || string_agg(quote_ident(pkc.name) || '=' || quote_nullable(pkc.value #>> '{}') , ' and ') || '
              )'
          from
              unnest(columns) pkc
          where
              pkc.is_pkey
          group by
              entity
      $$;


--
-- Name: cast(text, regtype); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime."cast"(val text, type_ regtype) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    AS $$
declare
  res jsonb;
begin
  if type_::text = 'bytea' then
    return to_jsonb(val);
  end if;
  execute format('select to_jsonb(%L::'|| type_::text || ')', val) into res;
  return res;
end
$$;


--
-- Name: check_equality_op(realtime.equality_op, regtype, text, text); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    AS $$
/*
Casts *val_1* and *val_2* as type *type_* and check the *op* condition for truthiness
*/
declare
    op_symbol text = (
        case
            when op = 'eq' then '='
            when op = 'neq' then '!='
            when op = 'lt' then '<'
            when op = 'lte' then '<='
            when op = 'gt' then '>'
            when op = 'gte' then '>='
            when op = 'in' then '= any'
            else 'UNKNOWN OP'
        end
    );
    res boolean;
begin
    execute format(
        'select %L::'|| type_::text || ' ' || op_symbol
        || ' ( %L::'
        || (
            case
                when op = 'in' then type_::text || '[]'
                else type_::text end
        )
        || ')', val_1, val_2) into res;
    return res;
end;
$$;


--
-- Name: check_equality_op(realtime.equality_op, regtype, text, text, boolean); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text, negate boolean) RETURNS boolean
    LANGUAGE plpgsql STABLE
    AS $$
declare
    op_symbol text;
    res boolean;
begin
    -- IS DISTINCT FROM / IS NOT DISTINCT FROM: infix, both sides typed literals
    if op = 'isdistinct' then
        execute format(
            'select %L::%s %s %L::%s',
            val_1,
            type_::text,
            case when negate then 'IS NOT DISTINCT FROM' else 'IS DISTINCT FROM' end,
            val_2,
            type_::text
        ) into res;
        return res;
    end if;

    -- IS requires a keyword RHS (NULL, TRUE, FALSE, UNKNOWN), not a typed literal
    if op = 'is' then
        if val_2 not in ('null', 'true', 'false', 'unknown') then
            raise exception 'invalid value for is filter: must be null, true, false, or unknown';
        end if;
        execute format(
            'select %L::%s %s %s',
            val_1,
            type_::text,
            case when negate then 'IS NOT' else 'IS' end,
            upper(val_2)
        ) into res;
        return res;
    end if;

    op_symbol = case
        when op = 'eq'    then '='
        when op = 'neq'   then '!='
        when op = 'lt'    then '<'
        when op = 'lte'   then '<='
        when op = 'gt'    then '>'
        when op = 'gte'   then '>='
        when op = 'in'    then '= any'
        when op = 'like'   then 'LIKE'
        when op = 'ilike'  then 'ILIKE'
        when op = 'match'  then '~'
        when op = 'imatch' then '~*'
        else null
    end;

    if op_symbol is null then
        raise exception 'unsupported equality operator: %', op::text;
    end if;

    execute format(
        'select %L::%s %s (%L::%s)',
        val_1,
        type_::text,
        op_symbol,
        val_2,
        case when op = 'in' then type_::text || '[]' else type_::text end
    ) into res;

    return case when negate then not res else res end;
end;
$$;


--
-- Name: is_visible_through_filters(realtime.wal_column[], realtime.user_defined_filter[]); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
    select
        filters is null
        or array_length(filters, 1) is null
        or coalesce(
            count(col.name) = count(1)
            and sum(
                realtime.check_equality_op(
                    op:=f.op,
                    type_:=coalesce(col.type_oid::regtype, col.type_name::regtype),
                    val_1:=col.value #>> '{}',
                    val_2:=f.value,
                    negate:=coalesce(f.negate, false)
                )::int
            ) filter (where col.name is not null) = count(col.name),
            false
        )
    from
        unnest(filters) f
        left join unnest(columns) col
            on f.column_name = col.name;
$$;


--
-- Name: list_changes(name, name, integer, integer); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.list_changes(publication name, slot_name name, max_changes integer, max_record_bytes integer) RETURNS TABLE(wal jsonb, is_rls_enabled boolean, subscription_ids uuid[], errors text[], slot_changes_count bigint)
    LANGUAGE sql
    SET log_min_messages TO 'fatal'
    AS $$
  WITH pub AS (
    SELECT
      concat_ws(
        ',',
        CASE WHEN bool_or(pubinsert) THEN 'insert' ELSE NULL END,
        CASE WHEN bool_or(pubupdate) THEN 'update' ELSE NULL END,
        CASE WHEN bool_or(pubdelete) THEN 'delete' ELSE NULL END
      ) AS w2j_actions,
      coalesce(
        string_agg(
          realtime.quote_wal2json(format('%I.%I', schemaname, tablename)::regclass),
          ','
        ) filter (WHERE ppt.tablename IS NOT NULL),
        ''
      ) AS w2j_add_tables
    FROM pg_publication pp
    LEFT JOIN pg_publication_tables ppt ON pp.pubname = ppt.pubname
    WHERE pp.pubname = publication
    GROUP BY pp.pubname
    LIMIT 1
  ),
  -- MATERIALIZED ensures pg_logical_slot_get_changes is called exactly once
  w2j AS MATERIALIZED (
    SELECT x.*, pub.w2j_add_tables
    FROM pub,
         pg_logical_slot_get_changes(
           slot_name, null, max_changes,
           'include-pk', 'true',
           'include-transaction', 'false',
           'include-timestamp', 'true',
           'include-type-oids', 'true',
           'format-version', '2',
           'actions', pub.w2j_actions,
           'add-tables', pub.w2j_add_tables
         ) x
  ),
  slot_count AS (
    SELECT count(*)::bigint AS cnt
    FROM w2j
    WHERE w2j.w2j_add_tables <> ''
  ),
  rls_filtered AS (
    SELECT xyz.wal, xyz.is_rls_enabled, xyz.subscription_ids, xyz.errors
    FROM w2j,
         realtime.apply_rls(
           wal := w2j.data::jsonb,
           max_record_bytes := max_record_bytes
         ) xyz(wal, is_rls_enabled, subscription_ids, errors)
    WHERE w2j.w2j_add_tables <> ''
      AND xyz.subscription_ids[1] IS NOT NULL
  )
  SELECT rf.wal, rf.is_rls_enabled, rf.subscription_ids, rf.errors, sc.cnt
  FROM rls_filtered rf, slot_count sc

  UNION ALL

  SELECT null, null, null, null, sc.cnt
  FROM slot_count sc
  WHERE NOT EXISTS (SELECT 1 FROM rls_filtered)
$$;


--
-- Name: list_changes_sync(name, name, integer, integer); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.list_changes_sync(publication name, slot_name name, max_changes integer, max_record_bytes integer) RETURNS TABLE(wal jsonb, is_rls_enabled boolean, subscription_ids uuid[], errors text[], slot_changes_count bigint)
    LANGUAGE sql
    SET log_min_messages TO 'fatal'
    AS $$
  WITH pub AS (
    SELECT
      concat_ws(
        ',',
        CASE WHEN bool_or(pubinsert) THEN 'insert' ELSE NULL END,
        CASE WHEN bool_or(pubupdate) THEN 'update' ELSE NULL END,
        CASE WHEN bool_or(pubdelete) THEN 'delete' ELSE NULL END
      ) AS w2j_actions,
      coalesce(
        string_agg(
          realtime.quote_wal2json(format('%I.%I', schemaname, tablename)::regclass),
          ','
        ) filter (WHERE ppt.tablename IS NOT NULL),
        ''
      ) AS w2j_add_tables
    FROM pg_publication pp
    LEFT JOIN pg_publication_tables ppt ON pp.pubname = ppt.pubname
    WHERE pp.pubname = publication
    GROUP BY pp.pubname
    LIMIT 1
  ),
  -- MATERIALIZED ensures the slot is read exactly once.
  consumed AS MATERIALIZED (
    SELECT x.*, pub.w2j_add_tables
    FROM pub,
         realtime.settled_changes(
           slot_name, max_changes,
           'include-pk', 'true',
           'include-transaction', 'false',
           'include-timestamp', 'true',
           'include-type-oids', 'true',
           'format-version', '2',
           'actions', pub.w2j_actions,
           'add-tables', pub.w2j_add_tables
         ) x
  ),
  slot_count AS (
    SELECT count(*)::bigint AS cnt
    FROM consumed
    WHERE consumed.w2j_add_tables <> ''
  ),
  rls_filtered AS (
    SELECT xyz.wal, xyz.is_rls_enabled, xyz.subscription_ids, xyz.errors
    FROM consumed,
         realtime.apply_rls(
           wal := consumed.data::jsonb,
           max_record_bytes := max_record_bytes
         ) xyz(wal, is_rls_enabled, subscription_ids, errors)
    WHERE consumed.w2j_add_tables <> ''
      AND xyz.subscription_ids[1] IS NOT NULL
  )
  SELECT rf.wal, rf.is_rls_enabled, rf.subscription_ids, rf.errors, sc.cnt
  FROM rls_filtered rf, slot_count sc

  UNION ALL

  SELECT null, null, null, null, sc.cnt
  FROM slot_count sc
  WHERE NOT EXISTS (SELECT 1 FROM rls_filtered)
$$;


--
-- Name: quote_wal2json(regclass); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.quote_wal2json(entity regclass) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT
    AS $$
  SELECT
    realtime.wal2json_escape_identifier(nsp.nspname::text)
    || '.'
    || realtime.wal2json_escape_identifier(pc.relname::text)
  FROM pg_class pc
  JOIN pg_namespace nsp ON pc.relnamespace = nsp.oid
  WHERE pc.oid = entity
$$;


--
-- Name: send(jsonb, text, text, boolean); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.send(payload jsonb, event text, topic text, private boolean DEFAULT true) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  generated_id uuid;
  final_payload jsonb;
BEGIN
  BEGIN
    generated_id := gen_random_uuid();

    -- Check if payload has an 'id' key, if not, add the generated UUID
    IF payload ? 'id' THEN
      final_payload := payload;
    ELSE
      final_payload := jsonb_set(payload, '{id}', to_jsonb(generated_id));
    END IF;

    -- Set the topic configuration
    EXECUTE format('SET LOCAL realtime.topic TO %L', topic);

    INSERT INTO realtime.messages (id, payload, event, topic, private, extension)
    VALUES (generated_id, final_payload, event, topic, private, 'broadcast');
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'WarnSendingBroadcastMessage: %', SQLERRM;
  END;
END;
$$;


--
-- Name: send_binary(bytea, text, text, boolean); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.send_binary(payload bytea, event text, topic text, private boolean DEFAULT true) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  generated_id uuid;
BEGIN
  BEGIN
    generated_id := gen_random_uuid();

    EXECUTE format('SET LOCAL realtime.topic TO %L', topic);

    INSERT INTO realtime.messages (id, binary_payload, event, topic, private, extension)
    VALUES (generated_id, payload, event, topic, private, 'broadcast');
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'WarnSendingBroadcastMessage: %', SQLERRM;
  END;
END;
$$;


--
-- Name: settled_changes(name, integer, text[]); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.settled_changes(slot_name name, max_changes integer, VARIADIC opts text[]) RETURNS TABLE(lsn pg_lsn, xid xid, data text)
    LANGUAGE plpgsql
    AS $$
declare
  upto pg_lsn;
  total bigint;
  xids xid[];
  starts bigint[];
  snapshot pg_snapshot;
  running_xids xid[];
  xmax_age int;
  cut bigint;
begin
  -- Each statement in a volatile function takes its own snapshot, which is what lets the
  -- check below see a writer that was still in flight when the peek ran. Under REPEATABLE
  -- READ the snapshot never advances, so a deferred change would never be released.
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'realtime.settled_changes requires READ COMMITTED';
  end if;

  -- The peek and the read below cover the same WAL, so the read cannot reach a commit the
  -- check never saw.
  upto := pg_current_wal_flush_lsn();

  -- One entry per transaction, in commit order: its xid and the position of its first
  -- change. The peek uses the caller's own options, so max_changes counts exactly what the
  -- read counts. A non-transactional logical message is emitted as soon as it is decoded,
  -- tagged with the xid of whatever transaction wrote it, so it does not mark where that
  -- transaction starts.
  select coalesce(sum(g.n), 0),
         array_agg(g.x order by g.first) filter (where g.first is not null),
         array_agg(g.first order by g.first) filter (where g.first is not null)
    into total, xids, starts
    from (
      select p.xid as x, count(*) as n,
             min(p.ord) filter (where not case
               when starts_with(p.data, '{"action":"M"') then (p.data::jsonb->>'transactional')::boolean is false
               else false
             end) as first
      from pg_logical_slot_peek_changes(slot_name, upto, max_changes, variadic opts)
           with ordinality as p(lsn, xid, data, ord)
      group by p.xid
    ) g;

  -- Nothing for the caller, but the slot still has to move past what the peek covered.
  if total = 0 then
    perform pg_replication_slot_advance(slot_name, upto);
    return;
  end if;

  if xids is not null then
    -- Taken after the peek is materialized, so a writer that was still in flight during
    -- decoding is guaranteed to show up here.
    snapshot := pg_current_snapshot();

    -- A commit record reaches the WAL before the writer leaves the proc array, so a change
    -- can be decoded while its row is invisible. apply_rls would resolve a policy against a
    -- row it cannot see and authorize it for nobody, while the read consumed it regardless.
    --
    -- xip lists transactions running when the snapshot was taken. It does not cover a writer
    -- whose xid sits at or beyond xmax, which never appears there, so the horizon is checked
    -- too. age() counts backwards from the current xid and so compares correctly across
    -- wraparound.
    select coalesce(array_agg(running.x::xid), array[]::xid[])
      into running_xids
      from pg_snapshot_xip(snapshot) running(x);
    xmax_age := age(pg_snapshot_xmax(snapshot)::xid);

    select min(u.s) into cut
      from unnest(xids, starts) as u(x, s)
      where u.x = any(running_xids) or age(u.x) <= xmax_age;
  end if;

  -- The read stops right after the commit that brings its count to upto_nchanges, so the
  -- count of changes in front of the first unsettled transaction stops it just before that
  -- transaction.
  if cut is null then
    return query
      select p.* from pg_logical_slot_get_changes(slot_name, upto, max_changes, variadic opts) p;
  elsif cut > 1 then
    return query
      select p.* from pg_logical_slot_get_changes(slot_name, upto, (cut - 1)::int, variadic opts) p;
  end if;
end;
$$;


--
-- Name: subscription_check_filters(); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.subscription_check_filters() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
    col_names text[] = coalesce(
            array_agg(a.attname order by a.attnum),
            '{}'::text[]
        )
        from
            pg_catalog.pg_attribute a
        where
            a.attrelid = new.entity
            and a.attnum > 0
            and not a.attisdropped
            and pg_catalog.has_column_privilege(
                (new.claims ->> 'role'),
                a.attrelid,
                a.attnum,
                'SELECT'
            );
    filter realtime.user_defined_filter;
    col_type regtype;
    in_val jsonb;
    selected_col text;
begin
    for filter in select * from unnest(new.filters) loop
        if not filter.column_name = any(col_names) then
            raise exception 'invalid column for filter %', filter.column_name;
        end if;

        col_type = (
            select atttypid::regtype
            from pg_catalog.pg_attribute
            where attrelid = new.entity
                  and attname = filter.column_name
        );
        if col_type is null then
            raise exception 'failed to lookup type for column %', filter.column_name;
        end if;

        if filter.op = 'in'::realtime.equality_op then
            in_val = realtime.cast(filter.value, (col_type::text || '[]')::regtype);
            if coalesce(jsonb_array_length(in_val), 0) > 100 then
                raise exception 'too many values for `in` filter. Maximum 100';
            end if;
        elsif filter.op = 'is'::realtime.equality_op then
            -- `is` requires a keyword RHS rather than a typed literal
            if filter.value not in ('null', 'true', 'false', 'unknown') then
                raise exception 'invalid value for is filter: must be null, true, false, or unknown';
            end if;
            -- IS NULL works for any type, but IS TRUE/FALSE/UNKNOWN require a boolean
            -- operand. Reject the non-null keywords on non-boolean columns here so they
            -- don't abort apply_rls at WAL time.
            if filter.value <> 'null' and col_type <> 'boolean'::regtype then
                raise exception 'is % filter requires a boolean column, got %', filter.value, col_type::text;
            end if;
        elsif filter.op in ('like'::realtime.equality_op, 'ilike'::realtime.equality_op) then
            -- like/ilike apply the text pattern operator (~~); reject column types that
            -- have no such operator instead of failing at WAL time
            if not exists (
                select 1 from pg_catalog.pg_operator
                where oprname = '~~' and oprleft = col_type
            ) then
                raise exception 'operator % requires a text-compatible column type, got %', filter.op::text, col_type::text;
            end if;
        elsif filter.op in ('match'::realtime.equality_op, 'imatch'::realtime.equality_op) then
            -- match/imatch apply the regex operators ~ / ~*; reject column types that have
            -- no such operator (e.g. integer) instead of failing at WAL time, mirroring the
            -- like/ilike guard above.
            if not exists (
                select 1 from pg_catalog.pg_operator
                where oprname = case when filter.op = 'imatch'::realtime.equality_op then '~*' else '~' end
                  and oprleft = col_type
                  and oprright = col_type
                  and oprresult = 'boolean'::regtype
            ) then
                raise exception 'operator % requires a text-compatible column type, got %', filter.op::text, col_type::text;
            end if;
            -- validate the regex eagerly so a bad pattern is rejected here, not inside
            -- apply_rls where it would abort the WAL stream for the entity
            begin
                perform '' ~ filter.value;
            exception when others then
                raise exception 'invalid regular expression for % filter: %', filter.op::text, sqlerrm;
            end;
        else
            -- eq/neq/lt/lte/gt/gte: value must be coercable to the type
            perform realtime.cast(filter.value, col_type);
        end if;
    end loop;

    if new.selected_columns is not null then
        for selected_col in select * from unnest(new.selected_columns) loop
            if not selected_col = any(col_names) then
                raise exception 'invalid column for select %', selected_col;
            end if;
        end loop;
    end if;

    -- Apply consistent order to filters so the unique constraint can't be tricked by a
    -- different filter order. negate is part of the sort key.
    new.filters = coalesce(
        array_agg(f order by f.column_name, f.op, f.value, f.negate),
        '{}'
    ) from unnest(new.filters) f;

    -- Normalize selected_columns order so ARRAY['a','b'] and ARRAY['b','a'] are treated
    -- as the same subscription group in apply_rls. Preserve an empty array as '{}'
    -- ("primary keys only") so it stays distinct from NULL ("all columns"); array_agg
    -- over an empty set would otherwise collapse '{}' back to NULL.
    if new.selected_columns is not null then
        new.selected_columns = coalesce(
            (
                select array_agg(c order by c)
                from unnest(new.selected_columns) c
            ),
            '{}'::text[]
        );
    end if;

    return new;
end;
$$;


--
-- Name: to_regrole(text); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.to_regrole(role_name text) RETURNS regrole
    LANGUAGE sql IMMUTABLE
    AS $$ select role_name::regrole $$;


--
-- Name: topic(); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.topic() RETURNS text
    LANGUAGE sql STABLE
    AS $$
select nullif(current_setting('realtime.topic', true), '')::text;
$$;


--
-- Name: wal2json_escape_identifier(text); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.wal2json_escape_identifier(name text) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT
    AS $$
  -- Prefix `\`, `,`, `.`, and any whitespace with `\`
  SELECT regexp_replace(name, '([\\,.[:space:]])', '\\\1', 'g')
$$;


--
-- Name: allow_any_operation(text[]); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.allow_any_operation(expected_operations text[]) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  WITH current_operation AS (
    SELECT storage.operation() AS raw_operation
  ),
  normalized AS (
    SELECT CASE
      WHEN raw_operation LIKE 'storage.%' THEN substr(raw_operation, 9)
      ELSE raw_operation
    END AS current_operation
    FROM current_operation
  )
  SELECT EXISTS (
    SELECT 1
    FROM normalized n
    CROSS JOIN LATERAL unnest(expected_operations) AS expected_operation
    WHERE expected_operation IS NOT NULL
      AND expected_operation <> ''
      AND n.current_operation = CASE
        WHEN expected_operation LIKE 'storage.%' THEN substr(expected_operation, 9)
        ELSE expected_operation
      END
  );
$$;


--
-- Name: allow_only_operation(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.allow_only_operation(expected_operation text) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  WITH current_operation AS (
    SELECT storage.operation() AS raw_operation
  ),
  normalized AS (
    SELECT
      CASE
        WHEN raw_operation LIKE 'storage.%' THEN substr(raw_operation, 9)
        ELSE raw_operation
      END AS current_operation,
      CASE
        WHEN expected_operation LIKE 'storage.%' THEN substr(expected_operation, 9)
        ELSE expected_operation
      END AS requested_operation
    FROM current_operation
  )
  SELECT CASE
    WHEN requested_operation IS NULL OR requested_operation = '' THEN FALSE
    ELSE COALESCE(current_operation = requested_operation, FALSE)
  END
  FROM normalized;
$$;


--
-- Name: can_insert_object(text, text, uuid, jsonb); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.can_insert_object(bucketid text, name text, owner uuid, metadata jsonb) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  INSERT INTO "storage"."objects" ("bucket_id", "name", "owner", "metadata") VALUES (bucketid, name, owner, metadata);
  -- hack to rollback the successful insert
  RAISE sqlstate 'PT200' using
  message = 'ROLLBACK',
  detail = 'rollback successful insert';
END
$$;


--
-- Name: enforce_bucket_lifecycle_service_role(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.enforce_bucket_lifecycle_service_role() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $$
BEGIN
  IF current_user::text IS DISTINCT FROM TG_ARGV[0]
     AND (
       OLD.lifecycle_configuration IS DISTINCT FROM NEW.lifecycle_configuration
       OR OLD.lifecycle_configuration_generation IS DISTINCT FROM NEW.lifecycle_configuration_generation
     ) THEN
    -- AFTER runs only after caller RLS has accepted the proposed row. The API
    -- recognizes this specific error after rolling back its permission probe;
    -- direct non-service writes still fail and cannot persist the change.
    RAISE EXCEPTION 'bucket control columns may only be changed by the configured storage service role'
      USING ERRCODE = 'PST01',
            SCHEMA = TG_TABLE_SCHEMA,
            TABLE = TG_TABLE_NAME,
            CONSTRAINT = TG_NAME;
  END IF;

  RETURN NULL;
END;
$$;


--
-- Name: enforce_bucket_name_length(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.enforce_bucket_name_length() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
    if length(new.name) > 100 then
        raise exception 'bucket name "%" is too long (% characters). Max is 100.', new.name, length(new.name);
    end if;
    return new;
end;
$$;


--
-- Name: extension(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.extension(name text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
    _parts text[];
    _filename text;
BEGIN
    -- Split on "/" to get path segments
    SELECT string_to_array(name, '/') INTO _parts;
    -- Get the last path segment (the actual filename)
    SELECT _parts[array_length(_parts, 1)] INTO _filename;
    -- Extract extension: reverse, split on '.', then reverse again
    RETURN reverse(split_part(reverse(_filename), '.', 1));
END
$$;


--
-- Name: filename(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.filename(name text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
    _parts text[];
BEGIN
    SELECT string_to_array(name, '/') INTO _parts;
    RETURN _parts[array_length(_parts, 1)];
END
$$;


--
-- Name: foldername(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.foldername(name text) RETURNS text[]
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
    _parts text[];
BEGIN
    -- Split on "/" to get path segments
    SELECT string_to_array(name, '/') INTO _parts;
    -- Return everything except the last segment
    RETURN _parts[1 : array_length(_parts,1) - 1];
END
$$;


--
-- Name: get_common_prefix(text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.get_common_prefix(p_key text, p_prefix text, p_delimiter text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
SELECT CASE
    WHEN p_delimiter <> ''
         AND position(p_delimiter IN substring(p_key FROM length(p_prefix) + 1)) > 0
    THEN left(
        p_key,
        length(p_prefix)
            + position(p_delimiter IN substring(p_key FROM length(p_prefix) + 1))
            + length(p_delimiter) - 1
    )
    ELSE NULL
END;
$$;


--
-- Name: get_size_by_bucket(text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.get_size_by_bucket(noncurrent_versions text DEFAULT 'include'::text, delete_markers text DEFAULT 'include'::text) RETURNS TABLE(size bigint, bucket_id text)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    -- COALESCE first: NULL NOT IN (...) evaluates to NULL (not TRUE), so a
    -- bare NOT IN check silently leaves an explicit NULL argument unreset.
    noncurrent_versions := COALESCE(noncurrent_versions, 'include');
    delete_markers := COALESCE(delete_markers, 'include');
    IF noncurrent_versions NOT IN ('exclude', 'only', 'include') THEN
        noncurrent_versions := 'include';
    END IF;
    IF delete_markers NOT IN ('exclude', 'only', 'include') THEN
        delete_markers := 'include';
    END IF;

    return query
        select sum((metadata->>'size')::bigint)::bigint as size, obj.bucket_id
        from "storage".objects as obj
        where (noncurrent_versions != 'exclude' OR obj.archived_at IS NULL)
          and (noncurrent_versions != 'only' OR obj.archived_at IS NOT NULL)
          and (delete_markers != 'exclude' OR NOT obj.is_delete_marker)
          and (delete_markers != 'only' OR obj.is_delete_marker)
        group by obj.bucket_id;
END
$$;


--
-- Name: list_multipart_uploads_with_delimiter(text, text, text, integer, text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.list_multipart_uploads_with_delimiter(bucket_id text, prefix_param text, delimiter_param text, max_keys integer DEFAULT 100, next_key_token text DEFAULT ''::text, next_upload_token text DEFAULT ''::text, raw_prefix_param text DEFAULT NULL::text) RETURNS TABLE(key text, id text, created_at timestamp with time zone)
    LANGUAGE sql STABLE
    AS $_$
WITH candidates AS (
    SELECT
        upload.key AS object_key,
        CASE
            WHEN position($3 IN substring(upload.key FROM length(coalesce($7, $2)) + 1)) > 0
            THEN left(
                upload.key,
                length(coalesce($7, $2))
                    + position($3 IN substring(upload.key FROM length(coalesce($7, $2)) + 1))
                    + length($3) - 1
            )
            ELSE upload.key
        END AS result_key,
        upload.id,
        upload.created_at,
        position($3 IN substring(upload.key FROM length(coalesce($7, $2)) + 1)) > 0 AS is_common_prefix
    FROM storage.s3_multipart_uploads AS upload
    WHERE upload.bucket_id = $1
      AND upload.key COLLATE "C" LIKE $2 || '%'
), filtered AS (
    SELECT candidate.*
    FROM candidates AS candidate
    WHERE $5 = ''
       OR candidate.result_key COLLATE "C" > $5
       OR (
           candidate.result_key COLLATE "C" = $5
           AND NOT candidate.is_common_prefix
           AND $6 <> ''
           -- A completed or aborted marker repeats the remaining same-key uploads.
           AND COALESCE(
               (candidate.created_at, candidate.id COLLATE "C") > (
                   SELECT marker.created_at, marker.id COLLATE "C"
                   FROM storage.s3_multipart_uploads AS marker
                   WHERE marker.bucket_id = $1
                     AND marker.key COLLATE "C" = $5
                     AND marker.id = $6
               ),
               TRUE
           )
       )
), ranked AS (
    SELECT
        filtered.*,
        row_number() OVER (
            PARTITION BY filtered.result_key COLLATE "C"
            ORDER BY filtered.created_at, filtered.id COLLATE "C"
        ) AS prefix_rank
    FROM filtered
)
SELECT ranked.result_key, ranked.id, ranked.created_at
FROM ranked
WHERE NOT ranked.is_common_prefix OR ranked.prefix_rank = 1
ORDER BY ranked.result_key COLLATE "C", ranked.created_at, ranked.id COLLATE "C"
LIMIT $4;
$_$;


--
-- Name: list_objects_with_delimiter(text, text, text, integer, text, text, text, text, text, timestamp with time zone, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.list_objects_with_delimiter(_bucket_id text, prefix_param text, delimiter_param text, max_keys integer DEFAULT 100, start_after text DEFAULT ''::text, next_token text DEFAULT ''::text, sort_order text DEFAULT 'asc'::text, noncurrent_versions text DEFAULT 'exclude'::text, delete_markers text DEFAULT 'exclude'::text, next_token_archived_at timestamp with time zone DEFAULT NULL::timestamp with time zone, next_token_version text DEFAULT ''::text) RETURNS TABLE(name text, id uuid, metadata jsonb, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, version text, archived_at timestamp with time zone, is_delete_marker boolean, is_versioned boolean)
    LANGUAGE plpgsql STABLE
    AS $_$
DECLARE
    v_peek_name TEXT;
    v_current RECORD;
    v_common_prefix TEXT;

    -- Configuration
    v_is_asc BOOLEAN;
    v_prefix TEXT;
    v_start TEXT;
    v_start_relative TEXT;
    v_upper_bound TEXT;
    v_file_batch_size INT;
    v_version_filter TEXT;

    -- true when noncurrent_versions can return >1 row per name; keeps them
    -- ordered most-recent-first and lets pagination resume mid-key
    v_multi_row BOOLEAN;
    v_name_order TEXT;
    v_exact_range_predicate TEXT;
    v_strict_range_predicate TEXT;
    v_inclusive_range_predicate TEXT;

    -- Seek state for the current name. archived_at is normalized to JavaScript's
    -- millisecond precision and version breaks ties within the same millisecond.
    -- Current rows use 'infinity'; NULL means no tiebreak has been established.
    v_next_seek TEXT;
    v_next_seek_at TIMESTAMPTZ;
    v_next_seek_version TEXT;
    v_next_seek_strict BOOLEAN := false;
    v_cursor_is_folder BOOLEAN;
    v_count INT := 0;
    v_previous_seek TEXT;
    v_previous_seek_at TIMESTAMPTZ;
    v_previous_seek_version TEXT;
    v_previous_count INT;

    -- Dynamic SQL for batch query only
    v_batch_query TEXT;
    v_batch_query_strict TEXT;
    v_delete_marker_peek_query TEXT;
    v_delete_marker_peek_query_strict TEXT;

BEGIN
    -- ========================================================================
    -- INITIALIZATION
    -- ========================================================================
    v_is_asc := lower(coalesce(sort_order, 'asc')) = 'asc';
    v_prefix := coalesce(prefix_param, '');
    v_start := CASE WHEN coalesce(next_token, '') <> '' THEN next_token ELSE coalesce(start_after, '') END;
    v_file_batch_size := LEAST(GREATEST(max_keys * 2, 100), 1000);
    v_next_seek_at := NULL;
    v_next_seek_version := '';

    -- COALESCE first: NULL NOT IN (...) evaluates to NULL (not TRUE), so a
    -- bare NOT IN check silently leaves an explicit NULL argument unreset.
    noncurrent_versions := COALESCE(noncurrent_versions, 'exclude');
    delete_markers := COALESCE(delete_markers, 'exclude');
    IF noncurrent_versions NOT IN ('exclude', 'only', 'include') THEN
        noncurrent_versions := 'exclude';
    END IF;
    IF delete_markers NOT IN ('exclude', 'only', 'include') THEN
        delete_markers := 'exclude';
    END IF;

    v_multi_row := noncurrent_versions IN ('only', 'include');
    v_name_order := CASE WHEN v_is_asc THEN 'ASC' ELSE 'DESC' END;

    v_version_filter := '';
    IF noncurrent_versions = 'exclude' THEN
        v_version_filter := v_version_filter || ' AND o.archived_at IS NULL';
    ELSIF noncurrent_versions = 'only' THEN
        v_version_filter := v_version_filter || ' AND o.archived_at IS NOT NULL';
    END IF;
    IF delete_markers = 'exclude' THEN
        v_version_filter := v_version_filter || ' AND NOT o.is_delete_marker';
    ELSIF delete_markers = 'only' THEN
        v_version_filter := v_version_filter || ' AND o.is_delete_marker';
    END IF;

    -- Calculate upper bound for prefix filtering (bytewise, using COLLATE "C")
    IF v_prefix = '' THEN
        v_upper_bound := NULL;
    ELSE
        v_upper_bound := left(v_prefix, -1) || chr(ascii(right(v_prefix, 1)) + 1);
    END IF;

    -- Keep caller-provided cursors inside the requested prefix range.
    IF v_start <> '' AND v_upper_bound IS NOT NULL THEN
        IF v_is_asc THEN
            IF v_start COLLATE "C" < v_prefix COLLATE "C" THEN
                v_start := '';
            ELSIF v_start COLLATE "C" >= v_upper_bound COLLATE "C" THEN
                RETURN;
            END IF;
        ELSE
            IF v_start COLLATE "C" < v_prefix COLLATE "C" THEN
                RETURN;
            ELSIF v_start COLLATE "C" >= v_upper_bound COLLATE "C" THEN
                v_start := '';
            END IF;
        END IF;
    END IF;

    v_start_relative := substring(v_start FROM length(v_prefix) + 1);

    -- Direction affects only the indexed name range and its ordering. Cursor
    -- state transitions and within-key version ordering stay shared.
    IF v_is_asc THEN
        v_exact_range_predicate := 'TRUE';
        v_strict_range_predicate := 'o.name COLLATE "C" > $2';
        v_inclusive_range_predicate := 'o.name COLLATE "C" >= $2';
        IF v_upper_bound IS NOT NULL THEN
            v_exact_range_predicate := 'o.name COLLATE "C" < $3';
            v_strict_range_predicate := v_strict_range_predicate || ' AND o.name COLLATE "C" < $3';
            v_inclusive_range_predicate := v_inclusive_range_predicate || ' AND o.name COLLATE "C" < $3';
        END IF;
    ELSE
        v_exact_range_predicate := 'TRUE';
        v_strict_range_predicate := 'o.name COLLATE "C" < $2';
        v_inclusive_range_predicate := 'o.name COLLATE "C" < $2';
        IF v_prefix <> '' THEN
            v_exact_range_predicate := 'o.name COLLATE "C" >= $3';
            v_strict_range_predicate := v_strict_range_predicate || ' AND o.name COLLATE "C" >= $3';
            v_inclusive_range_predicate := v_inclusive_range_predicate || ' AND o.name COLLATE "C" >= $3';
        END IF;
    END IF;

    -- Build batch query (dynamic SQL - called infrequently, amortized over many rows)
    -- The multi-row order matches the externally serialized cursor exactly:
    -- archived_at at millisecond precision, then version as the final tiebreak.
    --
    -- When v_multi_row, the seek is a keyset tuple comparison ("name > $2 OR
    -- (name = $2 AND tiebreak)") - Postgres won't split that OR into indexable
    -- form (confirmed even with fully literal values), so as one WHERE clause
    -- it forces a full bucket scan filtered row-by-row. Splitting it into two
    -- independently-indexable branches (exact name match with the tiebreak
    -- filter, vs. strictly-past names) combined with UNION ALL lets each
    -- branch keep name as a real index condition; the outer ORDER BY/LIMIT
    -- re-merges them into the same page the single query used to produce.
    IF v_multi_row THEN
        v_batch_query := format(
            $sql$
            SELECT *
            FROM (
                (
                    SELECT o.name, o.id, o.updated_at, o.created_at,
                           o.last_accessed_at, o.metadata, o.version,
                           o.archived_at, o.is_delete_marker, o.is_versioned
                    FROM storage.objects o
                    WHERE o.bucket_id = $1
                      AND o.name COLLATE "C" = $2
                      AND %s
                      AND NOT $7::boolean
                      AND (
                          $5::timestamptz IS NULL
                          OR COALESCE(date_trunc('milliseconds', o.archived_at), 'infinity'::timestamptz) < $5
                          OR (
                              COALESCE(date_trunc('milliseconds', o.archived_at), 'infinity'::timestamptz) = $5
                              AND COALESCE(o.version, '') > $6
                          )
                      )
                      %s
                    ORDER BY
                        COALESCE(date_trunc('milliseconds', o.archived_at), 'infinity'::timestamptz) DESC,
                        COALESCE(o.version, '') ASC
                    LIMIT $4
                )
                UNION ALL
                (
                    SELECT o.name, o.id, o.updated_at, o.created_at,
                           o.last_accessed_at, o.metadata, o.version,
                           o.archived_at, o.is_delete_marker, o.is_versioned
                    FROM storage.objects o
                    WHERE o.bucket_id = $1
                      AND %s
                      %s
                    ORDER BY
                        o.name COLLATE "C" %s,
                        COALESCE(date_trunc('milliseconds', o.archived_at), 'infinity'::timestamptz) DESC,
                        COALESCE(o.version, '') ASC
                    LIMIT $4
                )
            ) sub
            ORDER BY
                sub.name COLLATE "C" %s,
                COALESCE(date_trunc('milliseconds', sub.archived_at), 'infinity'::timestamptz) DESC,
                COALESCE(sub.version, '') ASC
            LIMIT $4
            $sql$,
            v_exact_range_predicate,
            v_version_filter,
            v_strict_range_predicate,
            v_version_filter,
            v_name_order,
            v_name_order
        );
    ELSE
        v_batch_query := format(
            $sql$
            SELECT o.name, o.id, o.updated_at, o.created_at,
                   o.last_accessed_at, o.metadata, o.version,
                   o.archived_at, o.is_delete_marker, o.is_versioned
            FROM storage.objects o
            WHERE o.bucket_id = $1
              AND %s
              %s
            ORDER BY o.name COLLATE "C" %s, o.archived_at DESC
            LIMIT $4
            $sql$,
            v_inclusive_range_predicate,
            v_version_filter,
            v_name_order
        );

        -- Strict counterpart of the query above: used once the single-row
        -- ASC batch advance (below) has left v_next_seek pointing at the
        -- last row already emitted, so an inclusive predicate would
        -- re-match it forever. Only single-row mode ever sets strict mode,
        -- so this variant is never needed when v_multi_row.
        v_batch_query_strict := format(
            $sql$
            SELECT o.name, o.id, o.updated_at, o.created_at,
                   o.last_accessed_at, o.metadata, o.version,
                   o.archived_at, o.is_delete_marker, o.is_versioned
            FROM storage.objects o
            WHERE o.bucket_id = $1
              AND %s
              %s
            ORDER BY o.name COLLATE "C" %s, o.archived_at DESC
            LIMIT $4
            $sql$,
            v_strict_range_predicate,
            v_version_filter,
            v_name_order
        );
    END IF;

    -- The static peek predicates cannot use the partial delete-marker index
    -- once PL/pgSQL switches to a generic plan because whether
    -- is_delete_marker is required remains parameter-dependent. Reuse the
    -- already-specialized batch query with a one-row limit for this sparse
    -- filter so the plan sees a literal `o.is_delete_marker` predicate.
    IF delete_markers = 'only' THEN
        v_delete_marker_peek_query :=
            'SELECT marker_page.name FROM (' || v_batch_query || ') marker_page LIMIT 1';
        IF NOT v_multi_row THEN
            v_delete_marker_peek_query_strict :=
                'SELECT marker_page.name FROM (' || v_batch_query_strict || ') marker_page LIMIT 1';
        END IF;
    END IF;

    -- ========================================================================
    -- SEEK INITIALIZATION: Determine starting position
    -- ========================================================================
    IF v_start = '' THEN
        IF v_is_asc THEN
            v_next_seek := v_prefix;
        ELSE
            -- DESC without cursor performs one specialized initial seek so
            -- partial current-version and delete-marker indexes remain available.
            EXECUTE format(
                'SELECT o.name FROM storage.objects o WHERE o.bucket_id = $1%s%s ORDER BY o.name COLLATE "C" DESC LIMIT 1',
                CASE WHEN v_upper_bound IS NOT NULL
                    THEN ' AND o.name COLLATE "C" >= $2 AND o.name COLLATE "C" < $3'
                    ELSE ''
                END,
                v_version_filter
            )
            INTO v_next_seek
            USING _bucket_id, v_prefix, v_upper_bound;

            IF v_next_seek IS NOT NULL THEN
                v_next_seek := v_next_seek || delimiter_param;
            ELSE
                RETURN;
            END IF;
        END IF;
    ELSE
        -- Folder continuation tokens retain their trailing delimiter. A
        -- delimiter-less startAfter is always a literal key boundary.
        v_cursor_is_folder := delimiter_param <> ''
            AND v_start_relative <> ''
            AND right(v_start_relative, length(delimiter_param)) = delimiter_param;

        IF v_cursor_is_folder THEN
            v_next_seek := CASE
                WHEN right(v_start, length(delimiter_param)) = delimiter_param
                    THEN v_start
                ELSE v_start || delimiter_param
            END;
            IF v_is_asc THEN
                v_next_seek := left(v_next_seek, -1)
                    || chr(ascii(right(v_next_seek, 1)) + 1);
            END IF;
            v_next_seek_strict := NOT v_is_asc;
        ELSE
            -- leaf object: when v_multi_row, stay on v_start with the
            -- caller-supplied tiebreak so a page boundary mid-key resumes
            -- that key's remaining rows instead of skipping them. Truncate
            -- to milliseconds like every other v_next_seek_at assignment -
            -- harmless today since object.ts's cursor always round-trips
            -- through JS Date first, but this shouldn't rely on that.
            IF v_multi_row THEN
                v_next_seek := v_start;
                v_next_seek_at := date_trunc('milliseconds', next_token_archived_at);
                v_next_seek_version := coalesce(next_token_version, '');
                v_next_seek_strict := coalesce(next_token, '') = '';
            ELSIF v_is_asc THEN
                v_next_seek := v_start;
                v_next_seek_strict := true;
            ELSE
                v_next_seek := v_start;
            END IF;
        END IF;
    END IF;

    -- ========================================================================
    -- MAIN LOOP: Hybrid peek-then-batch algorithm
    -- Uses STATIC SQL for peek (hot path) and DYNAMIC SQL for batch
    -- ========================================================================
    LOOP
        EXIT WHEN v_count >= max_keys;

        v_previous_seek := v_next_seek;
        v_previous_seek_at := v_next_seek_at;
        v_previous_seek_version := v_next_seek_version;
        v_previous_count := v_count;

        -- STEP 1: PEEK using STATIC SQL (plan cached, very fast)
        -- v_multi_row is branched here (rather than folded into the WHERE
        -- clause as a bound parameter) so each concrete query keeps an
        -- unconditional seek predicate - once PL/pgSQL switches to its
        -- cached generic plan (after 5 calls), a parameter-gated
        -- "(NOT v_multi_row AND name >= $x) OR (v_multi_row AND ...)"
        -- predicate stops the planner from using name as an index
        -- condition at all, degrading every subsequent peek to a full
        -- index scan filtered row-by-row instead of a bounded range scan.
        -- v_multi_row's seek predicate is a keyset tuple comparison
        -- ("name > x OR (name = x AND tiebreak)") - Postgres does not
        -- split this OR into indexable form even with fully literal
        -- values, so it falls back to a full scan filtered row-by-row.
        -- Splitting it into two independently-indexable branches (exact
        -- name match with the tiebreak filter, vs. strictly-past name)
        -- combined with UNION ALL lets each branch keep name as a real
        -- index condition; the outer ORDER BY/LIMIT picks whichever of
        -- the (at most 2) rows sorts first.
        IF delete_markers = 'only' THEN
            EXECUTE CASE WHEN v_next_seek_strict AND NOT v_multi_row
                THEN v_delete_marker_peek_query_strict
                ELSE v_delete_marker_peek_query
            END
                INTO v_peek_name
                USING _bucket_id, v_next_seek,
                    CASE WHEN v_is_asc THEN COALESCE(v_upper_bound, v_prefix) ELSE v_prefix END,
                    1, v_next_seek_at, v_next_seek_version, v_next_seek_strict;
        ELSIF v_multi_row THEN
            IF v_is_asc THEN
                IF v_upper_bound IS NOT NULL THEN
                    SELECT sub.name INTO v_peek_name FROM (
                        (SELECT o.name FROM storage.objects o
                         WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" = v_next_seek
                           AND o.name COLLATE "C" < v_upper_bound
                           AND NOT v_next_seek_strict
                           AND (v_next_seek_at IS NULL
                                OR COALESCE(date_trunc('milliseconds', o.archived_at), 'infinity'::timestamptz) < v_next_seek_at
                                OR (COALESCE(date_trunc('milliseconds', o.archived_at), 'infinity'::timestamptz) = v_next_seek_at
                                    AND COALESCE(o.version, '') > v_next_seek_version))
                           AND (noncurrent_versions != 'exclude' OR o.archived_at IS NULL)
                           AND (noncurrent_versions != 'only' OR o.archived_at IS NOT NULL)
                           AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                           AND (delete_markers != 'only' OR o.is_delete_marker)
                         ORDER BY COALESCE(date_trunc('milliseconds', o.archived_at), 'infinity'::timestamptz) DESC, COALESCE(o.version, '') ASC LIMIT 1)
                        UNION ALL
                        (SELECT o.name FROM storage.objects o
                         WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" > v_next_seek AND o.name COLLATE "C" < v_upper_bound
                           AND (noncurrent_versions != 'exclude' OR o.archived_at IS NULL)
                           AND (noncurrent_versions != 'only' OR o.archived_at IS NOT NULL)
                           AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                           AND (delete_markers != 'only' OR o.is_delete_marker)
                         ORDER BY o.name COLLATE "C" ASC LIMIT 1)
                    ) sub ORDER BY sub.name COLLATE "C" ASC LIMIT 1;
                ELSE
                    SELECT sub.name INTO v_peek_name FROM (
                        (SELECT o.name FROM storage.objects o
                         WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" = v_next_seek
                           AND NOT v_next_seek_strict
                           AND (v_next_seek_at IS NULL
                                OR COALESCE(date_trunc('milliseconds', o.archived_at), 'infinity'::timestamptz) < v_next_seek_at
                                OR (COALESCE(date_trunc('milliseconds', o.archived_at), 'infinity'::timestamptz) = v_next_seek_at
                                    AND COALESCE(o.version, '') > v_next_seek_version))
                           AND (noncurrent_versions != 'exclude' OR o.archived_at IS NULL)
                           AND (noncurrent_versions != 'only' OR o.archived_at IS NOT NULL)
                           AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                           AND (delete_markers != 'only' OR o.is_delete_marker)
                         ORDER BY COALESCE(date_trunc('milliseconds', o.archived_at), 'infinity'::timestamptz) DESC, COALESCE(o.version, '') ASC LIMIT 1)
                        UNION ALL
                        (SELECT o.name FROM storage.objects o
                         WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" > v_next_seek
                           AND (noncurrent_versions != 'exclude' OR o.archived_at IS NULL)
                           AND (noncurrent_versions != 'only' OR o.archived_at IS NOT NULL)
                           AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                           AND (delete_markers != 'only' OR o.is_delete_marker)
                         ORDER BY o.name COLLATE "C" ASC LIMIT 1)
                    ) sub ORDER BY sub.name COLLATE "C" ASC LIMIT 1;
                END IF;
            ELSE
                IF v_upper_bound IS NOT NULL THEN
                    SELECT sub.name INTO v_peek_name FROM (
                        (SELECT o.name FROM storage.objects o
                         WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" = v_next_seek
                           AND o.name COLLATE "C" >= v_prefix
                           AND NOT v_next_seek_strict
                           AND (v_next_seek_at IS NULL
                                OR COALESCE(date_trunc('milliseconds', o.archived_at), 'infinity'::timestamptz) < v_next_seek_at
                                OR (COALESCE(date_trunc('milliseconds', o.archived_at), 'infinity'::timestamptz) = v_next_seek_at
                                    AND COALESCE(o.version, '') > v_next_seek_version))
                           AND (noncurrent_versions != 'exclude' OR o.archived_at IS NULL)
                           AND (noncurrent_versions != 'only' OR o.archived_at IS NOT NULL)
                           AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                           AND (delete_markers != 'only' OR o.is_delete_marker)
                         ORDER BY COALESCE(date_trunc('milliseconds', o.archived_at), 'infinity'::timestamptz) DESC, COALESCE(o.version, '') ASC LIMIT 1)
                        UNION ALL
                        (SELECT o.name FROM storage.objects o
                         WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" < v_next_seek AND o.name COLLATE "C" >= v_prefix
                           AND (noncurrent_versions != 'exclude' OR o.archived_at IS NULL)
                           AND (noncurrent_versions != 'only' OR o.archived_at IS NOT NULL)
                           AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                           AND (delete_markers != 'only' OR o.is_delete_marker)
                         ORDER BY o.name COLLATE "C" DESC LIMIT 1)
                    ) sub ORDER BY sub.name COLLATE "C" DESC LIMIT 1;
                ELSE
                    SELECT sub.name INTO v_peek_name FROM (
                        (SELECT o.name FROM storage.objects o
                         WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" = v_next_seek
                           AND NOT v_next_seek_strict
                           AND (v_next_seek_at IS NULL
                                OR COALESCE(date_trunc('milliseconds', o.archived_at), 'infinity'::timestamptz) < v_next_seek_at
                                OR (COALESCE(date_trunc('milliseconds', o.archived_at), 'infinity'::timestamptz) = v_next_seek_at
                                    AND COALESCE(o.version, '') > v_next_seek_version))
                           AND (noncurrent_versions != 'exclude' OR o.archived_at IS NULL)
                           AND (noncurrent_versions != 'only' OR o.archived_at IS NOT NULL)
                           AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                           AND (delete_markers != 'only' OR o.is_delete_marker)
                         ORDER BY COALESCE(date_trunc('milliseconds', o.archived_at), 'infinity'::timestamptz) DESC, COALESCE(o.version, '') ASC LIMIT 1)
                        UNION ALL
                        (SELECT o.name FROM storage.objects o
                         WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" < v_next_seek
                           AND (noncurrent_versions != 'exclude' OR o.archived_at IS NULL)
                           AND (noncurrent_versions != 'only' OR o.archived_at IS NOT NULL)
                           AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                           AND (delete_markers != 'only' OR o.is_delete_marker)
                         ORDER BY o.name COLLATE "C" DESC LIMIT 1)
                    ) sub ORDER BY sub.name COLLATE "C" DESC LIMIT 1;
                END IF;
            END IF;
        ELSE
            -- Single-row mode is always noncurrent_versions='exclude'. Keep
            -- this predicate literal so generic plans use the current index.
            IF v_is_asc THEN
                IF v_next_seek_strict AND v_upper_bound IS NOT NULL THEN
                    SELECT o.name INTO v_peek_name FROM storage.objects o
                    WHERE o.bucket_id = _bucket_id
                      AND o.name COLLATE "C" > v_next_seek
                      AND o.name COLLATE "C" < v_upper_bound
                      AND o.archived_at IS NULL
                      AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                      AND (delete_markers != 'only' OR o.is_delete_marker)
                    ORDER BY o.name COLLATE "C" ASC LIMIT 1;
                ELSIF v_next_seek_strict THEN
                    SELECT o.name INTO v_peek_name FROM storage.objects o
                    WHERE o.bucket_id = _bucket_id
                      AND o.name COLLATE "C" > v_next_seek
                      AND o.archived_at IS NULL
                      AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                      AND (delete_markers != 'only' OR o.is_delete_marker)
                    ORDER BY o.name COLLATE "C" ASC LIMIT 1;
                ELSIF v_upper_bound IS NOT NULL THEN
                    SELECT o.name INTO v_peek_name FROM storage.objects o
                    WHERE o.bucket_id = _bucket_id
                      AND o.name COLLATE "C" >= v_next_seek
                      AND o.name COLLATE "C" < v_upper_bound
                      AND o.archived_at IS NULL
                      AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                      AND (delete_markers != 'only' OR o.is_delete_marker)
                    ORDER BY o.name COLLATE "C" ASC LIMIT 1;
                ELSE
                    SELECT o.name INTO v_peek_name FROM storage.objects o
                    WHERE o.bucket_id = _bucket_id
                      AND o.name COLLATE "C" >= v_next_seek
                      AND o.archived_at IS NULL
                      AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                      AND (delete_markers != 'only' OR o.is_delete_marker)
                    ORDER BY o.name COLLATE "C" ASC LIMIT 1;
                END IF;
            ELSE
                IF v_upper_bound IS NOT NULL THEN
                    SELECT o.name INTO v_peek_name FROM storage.objects o
                    WHERE o.bucket_id = _bucket_id
                      AND o.name COLLATE "C" < v_next_seek
                      AND o.name COLLATE "C" >= v_prefix
                      AND o.archived_at IS NULL
                      AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                      AND (delete_markers != 'only' OR o.is_delete_marker)
                    ORDER BY o.name COLLATE "C" DESC LIMIT 1;
                ELSE
                    SELECT o.name INTO v_peek_name FROM storage.objects o
                    WHERE o.bucket_id = _bucket_id
                      AND o.name COLLATE "C" < v_next_seek
                      AND o.archived_at IS NULL
                      AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                      AND (delete_markers != 'only' OR o.is_delete_marker)
                    ORDER BY o.name COLLATE "C" DESC LIMIT 1;
                END IF;
            END IF;
        END IF;

        EXIT WHEN v_peek_name IS NULL;

        -- STEP 2: Check if this is a FOLDER or FILE
        v_common_prefix := storage.get_common_prefix(v_peek_name, v_prefix, delimiter_param);

        IF v_common_prefix IS NOT NULL THEN
            -- FOLDER: Emit and skip to next folder (no heap access needed)
            name := v_common_prefix;
            id := NULL;
            updated_at := NULL;
            created_at := NULL;
            last_accessed_at := NULL;
            metadata := NULL;
            version := NULL;
            archived_at := NULL;
            is_delete_marker := NULL;
            is_versioned := NULL;
            RETURN NEXT;
            v_count := v_count + 1;

            -- Advance seek past the folder range
            IF v_is_asc THEN
                v_next_seek := left(v_common_prefix, -1)
                    || chr(ascii(right(v_common_prefix, 1)) + 1);
            ELSE
                v_next_seek := v_common_prefix;
            END IF;
            v_next_seek_at := NULL;
            v_next_seek_version := '';
            v_next_seek_strict := NOT v_is_asc;
        ELSE
            -- FILE: Batch fetch using DYNAMIC SQL (overhead amortized over many rows)
            -- For ASC: upper_bound is the exclusive upper limit (< condition)
            -- For DESC: prefix is the inclusive lower limit (>= condition)
            FOR v_current IN EXECUTE CASE WHEN v_next_seek_strict AND NOT v_multi_row THEN v_batch_query_strict ELSE v_batch_query END
                USING _bucket_id, v_next_seek,
                CASE WHEN v_is_asc THEN COALESCE(v_upper_bound, v_prefix) ELSE v_prefix END, v_file_batch_size, v_next_seek_at, v_next_seek_version,
                v_next_seek_strict
            LOOP
                v_common_prefix := storage.get_common_prefix(v_current.name, v_prefix, delimiter_param);

                IF v_common_prefix IS NOT NULL THEN
                    -- Hit a folder: exit batch, let peek handle it. Reset
                    -- strict mode too it may have been set by an earlier
                    -- row in this same batch (see the single-row ASC advance
                    -- below), and v_next_seek here is the folder-triggering
                    -- row's own name, which the next peek must find inclusively.
                    v_next_seek := CASE
                        WHEN v_is_asc THEN v_current.name
                        ELSE v_current.name || delimiter_param
                    END;
                    v_next_seek_at := NULL;
                    v_next_seek_version := '';
                    v_next_seek_strict := false;
                    EXIT;
                END IF;

                -- Emit file
                name := v_current.name;
                id := v_current.id;
                updated_at := v_current.updated_at;
                created_at := v_current.created_at;
                last_accessed_at := v_current.last_accessed_at;
                metadata := v_current.metadata;
                version := v_current.version;
                archived_at := v_current.archived_at;
                is_delete_marker := v_current.is_delete_marker;
                is_versioned := v_current.is_versioned;
                RETURN NEXT;
                v_count := v_count + 1;

                -- when v_multi_row, stay on this name and record its
                -- archived_at as the new tiebreak so remaining rows for the
                -- same key are picked up before moving to the next name
                IF v_multi_row THEN
                    v_next_seek := v_current.name;
                    v_next_seek_at := COALESCE(date_trunc('milliseconds', v_current.archived_at), 'infinity'::timestamptz);
                    v_next_seek_version := COALESCE(v_current.version, '');
                    v_next_seek_strict := false;
                ELSIF v_is_asc THEN
                    -- Appending the delimiter as a fake lexical successor
                    -- would skip a real key like `name || '!'` (or any
                    -- character sorting below the delimiter), which sorts
                    -- between `name` and `name || delimiter`. Track the real
                    -- name and mark the next comparison strict instead.
                    v_next_seek := v_current.name;
                    v_next_seek_strict := true;
                ELSE
                    v_next_seek := v_current.name;
                END IF;

                EXIT WHEN v_count >= max_keys;
            END LOOP;
        END IF;

        IF v_count = v_previous_count
           AND v_next_seek IS NOT DISTINCT FROM v_previous_seek
           AND v_next_seek_at IS NOT DISTINCT FROM v_previous_seek_at
           AND v_next_seek_version IS NOT DISTINCT FROM v_previous_seek_version THEN
            RAISE EXCEPTION 'storage.list_objects_with_delimiter made no progress at seek (%, %, %)',
                v_next_seek, v_next_seek_at, v_next_seek_version;
        END IF;
    END LOOP;
END;
$_$;


--
-- Name: operation(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.operation() RETURNS text
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    RETURN current_setting('storage.operation', true);
END;
$$;


--
-- Name: protect_bucket_control_columns(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.protect_bucket_control_columns() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  configuration_changed boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.lifecycle_configuration IS NOT NULL
       OR NEW.lifecycle_configuration_generation IS NOT NULL THEN
      IF NOT pg_has_role(current_user, TG_ARGV[0], 'MEMBER') THEN
        RAISE EXCEPTION 'only members of the configured storage service role may insert lifecycle policy state'
          USING ERRCODE = '42501',
                HINT = format(
                  'Insert with both lifecycle columns NULL and configure lifecycle through the Storage API afterward, or insert as a member of %I.',
                  TG_ARGV[0]
                );
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  configuration_changed =
    OLD.lifecycle_configuration IS DISTINCT FROM NEW.lifecycle_configuration
    OR OLD.lifecycle_configuration_generation IS DISTINCT FROM NEW.lifecycle_configuration_generation;

  IF NOT configuration_changed THEN
    RETURN NEW;
  END IF;

  IF NEW.type IS DISTINCT FROM 'STANDARD' THEN
    RAISE EXCEPTION 'bucket versioning and lifecycle controls require a Standard bucket'
      USING ERRCODE = '0A000';
  END IF;

  IF NEW.lifecycle_configuration IS NULL
     AND NEW.lifecycle_configuration_generation IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.lifecycle_configuration IS NULL
     OR NEW.lifecycle_configuration_generation IS NULL
     OR OLD.lifecycle_configuration IS NOT DISTINCT FROM NEW.lifecycle_configuration
     OR OLD.lifecycle_configuration_generation IS NOT DISTINCT FROM NEW.lifecycle_configuration_generation THEN
    RAISE EXCEPTION 'a changed lifecycle policy requires a new non-null generation'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: protect_delete(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.protect_delete() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Check if storage.allow_delete_query is set to 'true'
    IF COALESCE(current_setting('storage.allow_delete_query', true), 'false') != 'true' THEN
        RAISE EXCEPTION 'Direct deletion from storage tables is not allowed. Use the Storage API instead.'
            USING HINT = 'This prevents accidental data loss from orphaned objects.',
                  ERRCODE = '42501';
    END IF;
    RETURN NULL;
END;
$$;


--
-- Name: search(text, text, integer, integer, integer, text, text, text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.search(prefix text, bucketname text, limits integer DEFAULT 100, levels integer DEFAULT 1, offsets integer DEFAULT 0, search text DEFAULT ''::text, sortcolumn text DEFAULT 'name'::text, sortorder text DEFAULT 'asc'::text, noncurrent_versions text DEFAULT 'exclude'::text, delete_markers text DEFAULT 'exclude'::text) RETURNS TABLE(name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb, version text, archived_at timestamp with time zone, is_delete_marker boolean, is_versioned boolean)
    LANGUAGE plpgsql STABLE
    AS $_$
DECLARE
    v_peek_name TEXT;
    v_current RECORD;
    v_common_prefix TEXT;
    v_delimiter CONSTANT TEXT := '/';

    -- Configuration
    v_limit INT;
    v_prefix TEXT;
    v_prefix_lower TEXT;
    v_prefix_len INT;
    v_prefix_start INT;
    v_combined_levels INT;
    v_is_asc BOOLEAN;
    v_order_by TEXT;
    v_sort_order TEXT;
    v_upper_bound TEXT;
    v_file_batch_size INT;
    v_version_filter TEXT;
    v_multi_row BOOLEAN;

    -- Dynamic SQL for batch query only
    v_batch_query TEXT;
    v_delete_marker_peek_query TEXT;
    v_delete_marker_peek_query_strict TEXT;

    -- Seek state
    v_next_seek TEXT;
    v_next_seek_at TIMESTAMPTZ;
    v_next_seek_version TEXT;
    v_next_seek_strict BOOLEAN := false;
    v_count INT := 0;
    v_skipped INT := 0;
    v_previous_seek TEXT;
    v_previous_seek_at TIMESTAMPTZ;
    v_previous_seek_version TEXT;
    v_previous_count INT;
    v_previous_skipped INT;
BEGIN
    -- ========================================================================
    -- INITIALIZATION
    -- ========================================================================
    v_limit := LEAST(coalesce(limits, 100), 1500);
    v_prefix := coalesce(prefix, '') || coalesce(search, '');
    v_prefix_lower := lower(v_prefix);
    v_prefix_len := length(coalesce(prefix, ''));
    v_prefix_start := coalesce(array_length(string_to_array(coalesce(prefix, ''), v_delimiter), 1), 1);
    v_combined_levels := coalesce(array_length(string_to_array(v_prefix, v_delimiter), 1), 1);
    v_is_asc := lower(coalesce(sortorder, 'asc')) = 'asc';
    v_file_batch_size := LEAST(GREATEST(v_limit * 2, 100), 1000);
    v_next_seek_at := NULL;
    v_next_seek_version := '';

    -- COALESCE first: NULL NOT IN (...) evaluates to NULL (not TRUE), so a
    -- bare NOT IN check silently leaves an explicit NULL argument unreset.
    noncurrent_versions := COALESCE(noncurrent_versions, 'exclude');
    delete_markers := COALESCE(delete_markers, 'exclude');
    IF noncurrent_versions NOT IN ('exclude', 'only', 'include') THEN
        noncurrent_versions := 'exclude';
    END IF;
    IF delete_markers NOT IN ('exclude', 'only', 'include') THEN
        delete_markers := 'exclude';
    END IF;

    v_multi_row := noncurrent_versions IN ('only', 'include');

    v_version_filter := '';
    IF noncurrent_versions = 'exclude' THEN
        v_version_filter := v_version_filter || ' AND o.archived_at IS NULL';
    ELSIF noncurrent_versions = 'only' THEN
        v_version_filter := v_version_filter || ' AND o.archived_at IS NOT NULL';
    END IF;
    IF delete_markers = 'exclude' THEN
        v_version_filter := v_version_filter || ' AND NOT o.is_delete_marker';
    ELSIF delete_markers = 'only' THEN
        v_version_filter := v_version_filter || ' AND o.is_delete_marker';
    END IF;

    -- Validate sort column
    CASE lower(coalesce(sortcolumn, 'name'))
        WHEN 'name' THEN v_order_by := 'name';
        WHEN 'updated_at' THEN v_order_by := 'updated_at';
        WHEN 'created_at' THEN v_order_by := 'created_at';
        WHEN 'last_accessed_at' THEN v_order_by := 'last_accessed_at';
        ELSE v_order_by := 'name';
    END CASE;

    v_sort_order := CASE WHEN v_is_asc THEN 'asc' ELSE 'desc' END;

    -- ========================================================================
    -- NON-NAME SORTING: Use path_tokens approach
    -- ========================================================================
    IF v_order_by != 'name' THEN
        RETURN QUERY EXECUTE format(
            $sql$
            WITH folders AS (
                SELECT array_to_string(path_tokens[$1:$2], '/') AS folder
                FROM storage.objects
                WHERE objects.name ILIKE $3 || '%%'
                  AND bucket_id = $4
                  AND array_length(objects.path_tokens, 1) <> $2
                  AND ($7 != 'exclude' OR objects.archived_at IS NULL)
                  AND ($7 != 'only' OR objects.archived_at IS NOT NULL)
                  AND ($8 != 'exclude' OR NOT objects.is_delete_marker)
                  AND ($8 != 'only' OR objects.is_delete_marker)
                GROUP BY folder
                ORDER BY folder %s
            )
            (SELECT folder AS "name",
                   NULL::uuid AS id,
                   NULL::timestamptz AS updated_at,
                   NULL::timestamptz AS created_at,
                   NULL::timestamptz AS last_accessed_at,
                   NULL::jsonb AS metadata,
                   NULL::text AS version,
                   NULL::timestamptz AS archived_at,
                   NULL::boolean AS is_delete_marker,
                   NULL::boolean AS is_versioned FROM folders)
            UNION ALL
            (SELECT array_to_string(path_tokens[$1:$2], '/') AS "name",
                   id, updated_at, created_at, last_accessed_at, metadata,
                   version, archived_at, is_delete_marker, is_versioned
             FROM storage.objects
             WHERE objects.name ILIKE $3 || '%%'
               AND bucket_id = $4
               AND array_length(objects.path_tokens, 1) = $2
               AND ($7 != 'exclude' OR objects.archived_at IS NULL)
               AND ($7 != 'only' OR objects.archived_at IS NOT NULL)
               AND ($8 != 'exclude' OR NOT objects.is_delete_marker)
               AND ($8 != 'only' OR objects.is_delete_marker)
             -- name, then version, as tiebreaks so two versions of the same
             -- key tying on the sort column still sort deterministically
             ORDER BY %I %s, name COLLATE "C" %s, COALESCE(version, '') %s)
            LIMIT $5 OFFSET $6
            $sql$, v_sort_order, v_order_by, v_sort_order, v_sort_order, v_sort_order
        ) USING v_prefix_start, v_combined_levels, v_prefix, bucketname, v_limit, offsets, noncurrent_versions, delete_markers;
        RETURN;
    END IF;

    -- ========================================================================
    -- NAME SORTING: Hybrid skip-scan with batch optimization
    -- ========================================================================

    -- Calculate upper bound for prefix filtering
    IF v_prefix_lower = '' THEN
        v_upper_bound := NULL;
    ELSIF right(v_prefix_lower, 1) = v_delimiter THEN
        v_upper_bound := left(v_prefix_lower, -1) || chr(ascii(v_delimiter) + 1);
    ELSE
        v_upper_bound := left(v_prefix_lower, -1) || chr(ascii(right(v_prefix_lower, 1)) + 1);
    END IF;

    -- Build a resume-safe batch query. The exact-name branch returns remaining
    -- versions after the current (archived_at, version) boundary; the strict
    -- name branch returns subsequent keys. UNION ALL keeps both predicates
    -- independently indexable.
    IF v_is_asc THEN
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT * FROM (' ||
                '(SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata, o.version, o.archived_at, o.is_delete_marker, o.is_versioned FROM storage.objects o ' ||
                'WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" = $2 AND ($5::timestamptz IS NULL OR COALESCE(o.archived_at, ''infinity''::timestamptz) < $5 OR (COALESCE(o.archived_at, ''infinity''::timestamptz) = $5 AND COALESCE(o.version, '''') > $6))' ||
                v_version_filter || ' ORDER BY COALESCE(o.archived_at, ''infinity''::timestamptz) DESC, COALESCE(o.version, '''') ASC LIMIT $4) UNION ALL ' ||
                '(SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata, o.version, o.archived_at, o.is_delete_marker, o.is_versioned FROM storage.objects o ' ||
                'WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" > $2 AND lower(o.name) COLLATE "C" < $3' || v_version_filter ||
                ' ORDER BY lower(o.name) COLLATE "C" ASC, COALESCE(o.archived_at, ''infinity''::timestamptz) DESC, COALESCE(o.version, '''') ASC LIMIT $4)' ||
                ') sub ORDER BY lower(sub.name) COLLATE "C" ASC, COALESCE(sub.archived_at, ''infinity''::timestamptz) DESC, COALESCE(sub.version, '''') ASC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT * FROM (' ||
                '(SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata, o.version, o.archived_at, o.is_delete_marker, o.is_versioned FROM storage.objects o ' ||
                'WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" = $2 AND ($5::timestamptz IS NULL OR COALESCE(o.archived_at, ''infinity''::timestamptz) < $5 OR (COALESCE(o.archived_at, ''infinity''::timestamptz) = $5 AND COALESCE(o.version, '''') > $6))' ||
                v_version_filter || ' ORDER BY COALESCE(o.archived_at, ''infinity''::timestamptz) DESC, COALESCE(o.version, '''') ASC LIMIT $4) UNION ALL ' ||
                '(SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata, o.version, o.archived_at, o.is_delete_marker, o.is_versioned FROM storage.objects o ' ||
                'WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" > $2' || v_version_filter ||
                ' ORDER BY lower(o.name) COLLATE "C" ASC, COALESCE(o.archived_at, ''infinity''::timestamptz) DESC, COALESCE(o.version, '''') ASC LIMIT $4)' ||
                ') sub ORDER BY lower(sub.name) COLLATE "C" ASC, COALESCE(sub.archived_at, ''infinity''::timestamptz) DESC, COALESCE(sub.version, '''') ASC LIMIT $4';
        END IF;
    ELSE
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT * FROM (' ||
                '(SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata, o.version, o.archived_at, o.is_delete_marker, o.is_versioned FROM storage.objects o ' ||
                'WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" = $2 AND ($5::timestamptz IS NULL OR COALESCE(o.archived_at, ''infinity''::timestamptz) < $5 OR (COALESCE(o.archived_at, ''infinity''::timestamptz) = $5 AND COALESCE(o.version, '''') > $6))' ||
                v_version_filter || ' ORDER BY COALESCE(o.archived_at, ''infinity''::timestamptz) DESC, COALESCE(o.version, '''') ASC LIMIT $4) UNION ALL ' ||
                '(SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata, o.version, o.archived_at, o.is_delete_marker, o.is_versioned FROM storage.objects o ' ||
                'WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" < $2 AND lower(o.name) COLLATE "C" >= $3' || v_version_filter ||
                ' ORDER BY lower(o.name) COLLATE "C" DESC, COALESCE(o.archived_at, ''infinity''::timestamptz) DESC, COALESCE(o.version, '''') ASC LIMIT $4)' ||
                ') sub ORDER BY lower(sub.name) COLLATE "C" DESC, COALESCE(sub.archived_at, ''infinity''::timestamptz) DESC, COALESCE(sub.version, '''') ASC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT * FROM (' ||
                '(SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata, o.version, o.archived_at, o.is_delete_marker, o.is_versioned FROM storage.objects o ' ||
                'WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" = $2 AND ($5::timestamptz IS NULL OR COALESCE(o.archived_at, ''infinity''::timestamptz) < $5 OR (COALESCE(o.archived_at, ''infinity''::timestamptz) = $5 AND COALESCE(o.version, '''') > $6))' ||
                v_version_filter || ' ORDER BY COALESCE(o.archived_at, ''infinity''::timestamptz) DESC, COALESCE(o.version, '''') ASC LIMIT $4) UNION ALL ' ||
                '(SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata, o.version, o.archived_at, o.is_delete_marker, o.is_versioned FROM storage.objects o ' ||
                'WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" < $2' || v_version_filter ||
                ' ORDER BY lower(o.name) COLLATE "C" DESC, COALESCE(o.archived_at, ''infinity''::timestamptz) DESC, COALESCE(o.version, '''') ASC LIMIT $4)' ||
                ') sub ORDER BY lower(sub.name) COLLATE "C" DESC, COALESCE(sub.archived_at, ''infinity''::timestamptz) DESC, COALESCE(sub.version, '''') ASC LIMIT $4';
        END IF;
    END IF;

    -- Keep the delete-marker predicate literal so the cached generic
    -- plan can use idx_objects_delete_markers during the main-loop peek.
    IF delete_markers = 'only' THEN
        IF v_multi_row THEN
            v_delete_marker_peek_query :=
                'SELECT marker_page.name FROM (' || v_batch_query || ') marker_page LIMIT 1';
        ELSIF v_is_asc THEN
            -- Two separate literal query strings, not one gated by a bound
            -- boolean: folding "$n AND op1 OR NOT $n AND op2" into a single
            -- query defeats the generic plan's ability to push either
            -- comparison into the index. Branching in PL/pgSQL control flow
            -- instead keeps each query's index condition intact.
            v_delete_marker_peek_query :=
                'SELECT o.name FROM storage.objects o WHERE o.bucket_id = $1 ' ||
                'AND lower(o.name) COLLATE "C" >= $2' ||
                CASE WHEN v_upper_bound IS NOT NULL
                    THEN ' AND lower(o.name) COLLATE "C" < $3'
                    ELSE ''
                END ||
                v_version_filter ||
                ' ORDER BY lower(o.name) COLLATE "C" ASC LIMIT 1';
            -- Strict variant: used once the single-row ASC batch advance
            -- (below) has left v_next_seek pointing at the last row already
            -- emitted, so a plain >= would re-match it forever.
            v_delete_marker_peek_query_strict :=
                'SELECT o.name FROM storage.objects o WHERE o.bucket_id = $1 ' ||
                'AND lower(o.name) COLLATE "C" > $2' ||
                CASE WHEN v_upper_bound IS NOT NULL
                    THEN ' AND lower(o.name) COLLATE "C" < $3'
                    ELSE ''
                END ||
                v_version_filter ||
                ' ORDER BY lower(o.name) COLLATE "C" ASC LIMIT 1';
        ELSE
            v_delete_marker_peek_query :=
                'SELECT o.name FROM storage.objects o WHERE o.bucket_id = $1 ' ||
                'AND lower(o.name) COLLATE "C" < $2' ||
                CASE WHEN v_upper_bound IS NOT NULL
                    THEN ' AND lower(o.name) COLLATE "C" >= $3'
                    ELSE ''
                END ||
                v_version_filter ||
                ' ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1';
        END IF;
    END IF;

    -- Initialize seek position
    IF v_is_asc THEN
        v_next_seek := v_prefix_lower;
    ELSE
        -- DESC performs one specialized initial seek so partial current-version
        -- and delete-marker indexes remain available.
        EXECUTE format(
            'SELECT o.name FROM storage.objects o WHERE o.bucket_id = $1%s%s ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1',
            CASE WHEN v_upper_bound IS NOT NULL
                THEN ' AND lower(o.name) COLLATE "C" >= $2 AND lower(o.name) COLLATE "C" < $3'
                ELSE ''
            END,
            v_version_filter
        )
        INTO v_peek_name
        USING bucketname, v_prefix_lower, v_upper_bound;

        IF v_peek_name IS NOT NULL THEN
            v_next_seek := lower(v_peek_name) || v_delimiter;
        ELSE
            RETURN;
        END IF;
    END IF;

    -- ========================================================================
    -- MAIN LOOP: Hybrid peek-then-batch algorithm
    -- Uses STATIC SQL for peek (hot path) and DYNAMIC SQL for batch and
    -- the delete-marker-only path
    -- ========================================================================
    LOOP
        EXIT WHEN v_count >= v_limit;

        v_previous_seek := v_next_seek;
        v_previous_seek_at := v_next_seek_at;
        v_previous_seek_version := v_next_seek_version;
        v_previous_count := v_count;
        v_previous_skipped := v_skipped;

        -- STEP 1: PEEK
        v_peek_name := NULL;
        IF delete_markers = 'only' THEN
            EXECUTE CASE WHEN v_next_seek_strict
                THEN v_delete_marker_peek_query_strict
                ELSE v_delete_marker_peek_query
            END
                INTO v_peek_name
                USING bucketname, v_next_seek,
                    CASE WHEN v_is_asc THEN COALESCE(v_upper_bound, v_prefix_lower) ELSE v_prefix_lower END,
                    1, v_next_seek_at, v_next_seek_version;
        ELSIF v_multi_row AND v_next_seek_at IS NOT NULL THEN
            SELECT o.name INTO v_peek_name
            FROM storage.objects o
            WHERE o.bucket_id = bucketname
              AND lower(o.name) COLLATE "C" = v_next_seek
              AND (COALESCE(o.archived_at, 'infinity'::timestamptz) < v_next_seek_at
                   OR (COALESCE(o.archived_at, 'infinity'::timestamptz) = v_next_seek_at
                       AND COALESCE(o.version, '') > v_next_seek_version))
              AND (noncurrent_versions != 'exclude' OR o.archived_at IS NULL)
              AND (noncurrent_versions != 'only' OR o.archived_at IS NOT NULL)
              AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
              AND (delete_markers != 'only' OR o.is_delete_marker)
            ORDER BY COALESCE(o.archived_at, 'infinity'::timestamptz) DESC,
                     COALESCE(o.version, '') ASC
            LIMIT 1;

            -- The current key is exhausted. Clear its version boundary and
            -- make the following ASC name peek strict. Appending '/' is not a
            -- valid lexical successor because keys ending in characters such
            -- as '!' sort between the exhausted name and name || '/'.
            IF v_peek_name IS NULL THEN
                IF v_is_asc THEN
                    v_next_seek_strict := true;
                END IF;
                v_next_seek_at := NULL;
                v_next_seek_version := '';
            END IF;
        END IF;

        -- Single-row mode is always noncurrent_versions='exclude'. Keep the
        -- current-row predicate literal so generic plans use the current index.
        IF delete_markers != 'only' AND v_peek_name IS NULL AND NOT v_multi_row THEN
            IF v_is_asc THEN
                IF v_next_seek_strict AND v_upper_bound IS NOT NULL THEN
                    SELECT o.name INTO v_peek_name FROM storage.objects o
                    WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" > v_next_seek AND lower(o.name) COLLATE "C" < v_upper_bound
                      AND o.archived_at IS NULL
                      AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                    ORDER BY lower(o.name) COLLATE "C" ASC LIMIT 1;
                ELSIF v_next_seek_strict THEN
                    SELECT o.name INTO v_peek_name FROM storage.objects o
                    WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" > v_next_seek
                      AND o.archived_at IS NULL
                      AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                    ORDER BY lower(o.name) COLLATE "C" ASC LIMIT 1;
                ELSIF v_upper_bound IS NOT NULL THEN
                    SELECT o.name INTO v_peek_name FROM storage.objects o
                    WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_next_seek AND lower(o.name) COLLATE "C" < v_upper_bound
                      AND o.archived_at IS NULL
                      AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                    ORDER BY lower(o.name) COLLATE "C" ASC LIMIT 1;
                ELSE
                    SELECT o.name INTO v_peek_name FROM storage.objects o
                    WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_next_seek
                      AND o.archived_at IS NULL
                      AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                    ORDER BY lower(o.name) COLLATE "C" ASC LIMIT 1;
                END IF;
            ELSIF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" < v_next_seek AND lower(o.name) COLLATE "C" >= v_prefix_lower
                  AND o.archived_at IS NULL
                  AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" < v_next_seek
                  AND o.archived_at IS NULL
                  AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
            END IF;
        ELSIF delete_markers != 'only' AND v_peek_name IS NULL AND v_is_asc THEN
            IF v_next_seek_strict AND v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" > v_next_seek AND lower(o.name) COLLATE "C" < v_upper_bound
                  AND (noncurrent_versions != 'exclude' OR o.archived_at IS NULL)
                  AND (noncurrent_versions != 'only' OR o.archived_at IS NOT NULL)
                  AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                  AND (delete_markers != 'only' OR o.is_delete_marker)
                ORDER BY lower(o.name) COLLATE "C" ASC LIMIT 1;
            ELSIF v_next_seek_strict THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" > v_next_seek
                  AND (noncurrent_versions != 'exclude' OR o.archived_at IS NULL)
                  AND (noncurrent_versions != 'only' OR o.archived_at IS NOT NULL)
                  AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                  AND (delete_markers != 'only' OR o.is_delete_marker)
                ORDER BY lower(o.name) COLLATE "C" ASC LIMIT 1;
            ELSIF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_next_seek AND lower(o.name) COLLATE "C" < v_upper_bound
                  AND (noncurrent_versions != 'exclude' OR o.archived_at IS NULL)
                  AND (noncurrent_versions != 'only' OR o.archived_at IS NOT NULL)
                  AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                  AND (delete_markers != 'only' OR o.is_delete_marker)
                ORDER BY lower(o.name) COLLATE "C" ASC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_next_seek
                  AND (noncurrent_versions != 'exclude' OR o.archived_at IS NULL)
                  AND (noncurrent_versions != 'only' OR o.archived_at IS NOT NULL)
                  AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                  AND (delete_markers != 'only' OR o.is_delete_marker)
                ORDER BY lower(o.name) COLLATE "C" ASC LIMIT 1;
            END IF;
        ELSIF delete_markers != 'only' AND v_peek_name IS NULL THEN
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" < v_next_seek AND lower(o.name) COLLATE "C" >= v_prefix_lower
                  AND (noncurrent_versions != 'exclude' OR o.archived_at IS NULL)
                  AND (noncurrent_versions != 'only' OR o.archived_at IS NOT NULL)
                  AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                  AND (delete_markers != 'only' OR o.is_delete_marker)
                ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" < v_next_seek
                  AND (noncurrent_versions != 'exclude' OR o.archived_at IS NULL)
                  AND (noncurrent_versions != 'only' OR o.archived_at IS NOT NULL)
                  AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                  AND (delete_markers != 'only' OR o.is_delete_marker)
                ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
            END IF;
        END IF;

        EXIT WHEN v_peek_name IS NULL;

        -- If the peek landed on a different key than we were tracking, any
        -- version boundary belongs to the OLD key and must not leak into the
        -- new one - e.g. the deleteMarkers='only' peek doesn't know or care
        -- whether it's continuing the same key or jumping to a new one, so
        -- it never clears these itself.
        IF lower(v_peek_name) IS DISTINCT FROM v_next_seek THEN
            v_next_seek_at := NULL;
            v_next_seek_version := '';
        END IF;

        -- The peek is authoritative for the next key to process. This is
        -- especially important after exhausting a multi-version key: the
        -- version boundary has been cleared, so executing the batch against
        -- a stale v_next_seek would replay every version of that old key.
        v_next_seek := lower(v_peek_name);
        v_next_seek_strict := false;

        -- STEP 2: Check if this is a FOLDER or FILE
        v_common_prefix := storage.get_common_prefix(lower(v_peek_name), v_prefix_lower, v_delimiter);

        IF v_common_prefix IS NOT NULL THEN
            -- FOLDER: Handle offset, emit if needed, skip to next folder
            IF v_skipped < offsets THEN
                v_skipped := v_skipped + 1;
            ELSE
                name := substring(rtrim(storage.get_common_prefix(v_peek_name, v_prefix, v_delimiter), v_delimiter) from v_prefix_len + 1);
                id := NULL;
                updated_at := NULL;
                created_at := NULL;
                last_accessed_at := NULL;
                metadata := NULL;
                version := NULL;
                archived_at := NULL;
                is_delete_marker := NULL;
                is_versioned := NULL;
                RETURN NEXT;
                v_count := v_count + 1;
            END IF;

            -- Advance seek past the folder range
            IF v_is_asc THEN
                v_next_seek := lower(left(v_common_prefix, -1)) || chr(ascii(v_delimiter) + 1);
            ELSE
                v_next_seek := lower(v_common_prefix);
            END IF;
            v_next_seek_at := NULL;
            v_next_seek_version := '';
        ELSE
            -- FILE: Batch fetch using DYNAMIC SQL (overhead amortized over many rows)
            -- For ASC: upper_bound is the exclusive upper limit (< condition)
            -- For DESC: prefix_lower is the inclusive lower limit (>= condition)
            FOR v_current IN EXECUTE v_batch_query
                USING bucketname, v_next_seek,
                    CASE WHEN v_is_asc THEN COALESCE(v_upper_bound, v_prefix_lower) ELSE v_prefix_lower END, v_file_batch_size,
                    v_next_seek_at, v_next_seek_version
            LOOP
                v_common_prefix := storage.get_common_prefix(lower(v_current.name), v_prefix_lower, v_delimiter);

                IF v_common_prefix IS NOT NULL THEN
                    -- Hit a folder: exit batch, let peek handle it. Reset
                    -- strict mode too - it may have been set by an earlier
                    -- row in this same batch (see the single-row ASC advance
                    -- below), and v_next_seek here is the folder-triggering
                    -- row's own name, which the next peek must find inclusively.
                    v_next_seek := CASE
                        WHEN v_is_asc THEN lower(v_current.name)
                        ELSE lower(v_current.name) || v_delimiter
                    END;
                    v_next_seek_at := NULL;
                    v_next_seek_version := '';
                    v_next_seek_strict := false;
                    EXIT;
                END IF;

                -- Handle offset skipping
                IF v_skipped < offsets THEN
                    v_skipped := v_skipped + 1;
                ELSE
                    -- Emit file
                    name := substring(v_current.name from v_prefix_len + 1);
                    id := v_current.id;
                    updated_at := v_current.updated_at;
                    created_at := v_current.created_at;
                    last_accessed_at := v_current.last_accessed_at;
                    metadata := v_current.metadata;
                    version := v_current.version;
                    archived_at := v_current.archived_at;
                    is_delete_marker := v_current.is_delete_marker;
                    is_versioned := v_current.is_versioned;
                    RETURN NEXT;
                    v_count := v_count + 1;
                END IF;

                -- Multi-row mode must remain on this key until all of its
                -- versions have crossed the internal batch boundary.
                IF v_multi_row THEN
                    v_next_seek := lower(v_current.name);
                    v_next_seek_at := COALESCE(v_current.archived_at, 'infinity'::timestamptz);
                    v_next_seek_version := COALESCE(v_current.version, '');
                ELSIF v_is_asc THEN
                    -- Appending the delimiter as a fake lexical successor would
                    -- skip a real key like `name || '!'` (or any character
                    -- sorting below the delimiter), which sorts between `name`
                    -- and `name || delimiter`. Track the real name and mark the
                    -- next comparison strict instead - same fix as the
                    -- exhausted-key case above.
                    v_next_seek := lower(v_current.name);
                    v_next_seek_strict := true;
                ELSE
                    v_next_seek := lower(v_current.name);
                END IF;

                EXIT WHEN v_count >= v_limit;
            END LOOP;
        END IF;

        IF v_count = v_previous_count
           AND v_skipped = v_previous_skipped
           AND v_next_seek IS NOT DISTINCT FROM v_previous_seek
           AND v_next_seek_at IS NOT DISTINCT FROM v_previous_seek_at
           AND v_next_seek_version IS NOT DISTINCT FROM v_previous_seek_version THEN
            RAISE EXCEPTION 'storage.search made no progress at seek (%, %, %)',
                v_next_seek, v_next_seek_at, v_next_seek_version;
        END IF;
    END LOOP;
END;
$_$;


--
-- Name: search_by_timestamp(text, text, integer, integer, text, text, text, text, text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.search_by_timestamp(p_prefix text, p_bucket_id text, p_limit integer, p_level integer, p_start_after text, p_sort_order text, p_sort_column text, p_sort_column_after text, noncurrent_versions text DEFAULT 'exclude'::text, delete_markers text DEFAULT 'exclude'::text, p_start_after_version text DEFAULT ''::text) RETURNS TABLE(key text, name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb, version text, archived_at timestamp with time zone, is_delete_marker boolean, is_versioned boolean)
    LANGUAGE plpgsql STABLE
    AS $_$
DECLARE
    v_cursor_op text;
    v_query text;
    v_prefix text;
    v_prefix_pattern text;
    v_sort_order text;
    v_sort_column text;
    v_version_tiebreak text;
BEGIN
    v_prefix := coalesce(p_prefix, '');
    -- Keep the raw prefix for common-prefix calculations and escape only LIKE metacharacters.
    v_prefix_pattern := replace(v_prefix, chr(92), chr(92) || chr(92));
    v_prefix_pattern := replace(v_prefix_pattern, '%', chr(92) || '%');
    v_prefix_pattern := replace(v_prefix_pattern, '_', chr(92) || '_');

    -- COALESCE first: NULL NOT IN (...) evaluates to NULL (not TRUE), so a
    -- bare NOT IN check silently leaves an explicit NULL argument unreset.
    noncurrent_versions := COALESCE(noncurrent_versions, 'exclude');
    delete_markers := COALESCE(delete_markers, 'exclude');
    IF noncurrent_versions NOT IN ('exclude', 'only', 'include') THEN
        noncurrent_versions := 'exclude';
    END IF;
    IF delete_markers NOT IN ('exclude', 'only', 'include') THEN
        delete_markers := 'exclude';
    END IF;

    -- $9 is only populated in multi-row mode; it's always '' otherwise, so
    -- only use each row's real version as a tiebreak in multi-row mode.
    v_version_tiebreak := CASE WHEN noncurrent_versions IN ('only', 'include') THEN 'COALESCE(version, '''')' ELSE '''''' END;

    -- Defense-in-depth: this function is independently reachable and must
    -- not trust p_sort_order/p_sort_column to already be validated by a
    -- caller. Normalize to the same strict allow-list storage.search_v2
    -- uses before interpolating anything into dynamic SQL below.
    v_sort_order := lower(coalesce(p_sort_order, 'asc'));
    IF v_sort_order NOT IN ('asc', 'desc') THEN
        v_sort_order := 'asc';
    END IF;

    v_sort_column := lower(coalesce(p_sort_column, 'updated_at'));
    IF v_sort_column NOT IN ('updated_at', 'created_at') THEN
        v_sort_column := 'updated_at';
    END IF;

    IF v_sort_order = 'asc' THEN
        v_cursor_op := '>';
    ELSE
        v_cursor_op := '<';
    END IF;

    v_query := format($sql$
        WITH raw_objects AS (
            SELECT
                o.name AS obj_name,
                o.id AS obj_id,
                o.updated_at AS obj_updated_at,
                o.created_at AS obj_created_at,
                o.last_accessed_at AS obj_last_accessed_at,
                o.metadata AS obj_metadata,
                o.version AS obj_version,
                o.archived_at AS obj_archived_at,
                o.is_delete_marker AS obj_is_delete_marker,
                o.is_versioned AS obj_is_versioned,
                storage.get_common_prefix(o.name, $1, '/') AS common_prefix
            FROM storage.objects o
            WHERE o.bucket_id = $2
              AND o.name COLLATE "C" LIKE $10 || '%%'
              AND ($7 != 'exclude' OR o.archived_at IS NULL)
              AND ($7 != 'only' OR o.archived_at IS NOT NULL)
              AND ($8 != 'exclude' OR NOT o.is_delete_marker)
              AND ($8 != 'only' OR o.is_delete_marker)
        ),
        -- Aggregate common prefixes (folders)
        -- Both created_at and updated_at use MIN(obj_created_at) to match the old prefixes table behavior
        aggregated_prefixes AS (
            SELECT
                common_prefix AS name,
                NULL::uuid AS id,
                MIN(obj_created_at) AS updated_at,
                MIN(obj_created_at) AS created_at,
                NULL::timestamptz AS last_accessed_at,
                NULL::jsonb AS metadata,
                NULL::text AS version,
                NULL::timestamptz AS archived_at,
                NULL::boolean AS is_delete_marker,
                NULL::boolean AS is_versioned,
                TRUE AS is_prefix
            FROM raw_objects
            WHERE common_prefix IS NOT NULL
            GROUP BY common_prefix
        ),
        leaf_objects AS (
            SELECT
                obj_name AS name,
                obj_id AS id,
                obj_updated_at AS updated_at,
                obj_created_at AS created_at,
                obj_last_accessed_at AS last_accessed_at,
                obj_metadata AS metadata,
                obj_version AS version,
                obj_archived_at AS archived_at,
                obj_is_delete_marker AS is_delete_marker,
                obj_is_versioned AS is_versioned,
                FALSE AS is_prefix
            FROM raw_objects
            WHERE common_prefix IS NULL
        ),
        combined AS (
            SELECT * FROM aggregated_prefixes
            UNION ALL
            SELECT * FROM leaf_objects
        ),
        filtered AS (
            SELECT *
            FROM combined
            WHERE (
                $5 = ''
                OR ROW(
                    COALESCE(date_trunc('milliseconds', %I), 'epoch'::timestamptz),
                    name COLLATE "C",
                    %s
                ) %s ROW(
                    -- truncated the same way as the stored value above
                    date_trunc('milliseconds', COALESCE(NULLIF($6, '')::timestamptz, 'epoch'::timestamptz)),
                    $5,
                    $9
                )
            )
        )
        SELECT
            split_part(name, '/', $3) AS key,
            name,
            id,
            updated_at,
            created_at,
            last_accessed_at,
            metadata,
            version,
            archived_at,
            is_delete_marker,
            is_versioned
        FROM filtered
        ORDER BY
            COALESCE(date_trunc('milliseconds', %I), 'epoch'::timestamptz) %s,
            name COLLATE "C" %s,
            COALESCE(version, '') %s
        LIMIT $4
    $sql$,
        v_sort_column,
        v_version_tiebreak,
        v_cursor_op,
        v_sort_column,
        v_sort_order,
        v_sort_order,
        v_sort_order
    );

    -- version is the third tiebreak component for two versions of the same
    -- key tying on both timestamp and name (see filtered CTE / ORDER BY above)
    RETURN QUERY EXECUTE v_query
    USING v_prefix, p_bucket_id, p_level, p_limit, p_start_after, p_sort_column_after, noncurrent_versions, delete_markers, coalesce(p_start_after_version, ''), v_prefix_pattern;
END;
$_$;


--
-- Name: search_v2(text, text, integer, integer, text, text, text, text, text, text, timestamp with time zone, text, boolean); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.search_v2(prefix text, bucket_name text, limits integer DEFAULT 100, levels integer DEFAULT 1, start_after text DEFAULT ''::text, sort_order text DEFAULT 'asc'::text, sort_column text DEFAULT 'name'::text, sort_column_after text DEFAULT ''::text, noncurrent_versions text DEFAULT 'exclude'::text, delete_markers text DEFAULT 'exclude'::text, start_after_archived_at timestamp with time zone DEFAULT NULL::timestamp with time zone, start_after_version text DEFAULT ''::text, start_after_is_continuation boolean DEFAULT false) RETURNS TABLE(key text, name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb, version text, archived_at timestamp with time zone, is_delete_marker boolean, is_versioned boolean)
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
    v_sort_col text;
    v_sort_ord text;
    v_limit int;
BEGIN
    -- Cap limit to maximum of 1500 records
    v_limit := LEAST(coalesce(limits, 100), 1500);

    -- Validate and normalize sort_order
    v_sort_ord := lower(coalesce(sort_order, 'asc'));
    IF v_sort_ord NOT IN ('asc', 'desc') THEN
        v_sort_ord := 'asc';
    END IF;

    -- Validate and normalize sort_column
    v_sort_col := lower(coalesce(sort_column, 'name'));
    IF v_sort_col NOT IN ('name', 'updated_at', 'created_at') THEN
        v_sort_col := 'name';
    END IF;

    -- Route to appropriate implementation
    IF v_sort_col = 'name' THEN
        -- Use list_objects_with_delimiter for name sorting (most efficient: O(k * log n))
        RETURN QUERY
        SELECT
            split_part(l.name, '/', levels) AS key,
            l.name AS name,
            l.id,
            l.updated_at,
            l.created_at,
            l.last_accessed_at,
            l.metadata,
            l.version,
            l.archived_at,
            l.is_delete_marker,
            l.is_versioned
        FROM storage.list_objects_with_delimiter(
            bucket_name,
            coalesce(prefix, ''),
            '/',
            v_limit,
            CASE WHEN start_after_is_continuation THEN '' ELSE start_after END,
            CASE WHEN start_after_is_continuation THEN start_after ELSE '' END,
            v_sort_ord,
            noncurrent_versions,
            delete_markers,
            start_after_archived_at,
            start_after_version
        ) l;
    ELSE
        -- Use aggregation approach for timestamp sorting
        -- Not efficient for large datasets but supports correct pagination
        RETURN QUERY SELECT * FROM storage.search_by_timestamp(
            prefix, bucket_name, v_limit, levels, start_after,
            v_sort_ord, v_sort_col, sort_column_after,
            noncurrent_versions, delete_markers, start_after_version
        );
    END IF;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW; 
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: audit_log_entries; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.audit_log_entries (
    instance_id uuid,
    id uuid NOT NULL,
    payload json,
    created_at timestamp with time zone,
    ip_address character varying(64) DEFAULT ''::character varying NOT NULL
);


--
-- Name: TABLE audit_log_entries; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.audit_log_entries IS 'Auth: Audit trail for user actions.';


--
-- Name: custom_oauth_providers; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.custom_oauth_providers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider_type text NOT NULL,
    identifier text NOT NULL,
    name text NOT NULL,
    client_id text NOT NULL,
    client_secret text NOT NULL,
    acceptable_client_ids text[] DEFAULT '{}'::text[] NOT NULL,
    scopes text[] DEFAULT '{}'::text[] NOT NULL,
    pkce_enabled boolean DEFAULT true NOT NULL,
    attribute_mapping jsonb DEFAULT '{}'::jsonb NOT NULL,
    authorization_params jsonb DEFAULT '{}'::jsonb NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    email_optional boolean DEFAULT false NOT NULL,
    issuer text,
    discovery_url text,
    skip_nonce_check boolean DEFAULT false NOT NULL,
    cached_discovery jsonb,
    discovery_cached_at timestamp with time zone,
    authorization_url text,
    token_url text,
    userinfo_url text,
    jwks_uri text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    custom_claims_allowlist text[] DEFAULT '{}'::text[] NOT NULL,
    CONSTRAINT custom_oauth_providers_authorization_url_https CHECK (((authorization_url IS NULL) OR (authorization_url ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_authorization_url_length CHECK (((authorization_url IS NULL) OR (char_length(authorization_url) <= 2048))),
    CONSTRAINT custom_oauth_providers_client_id_length CHECK (((char_length(client_id) >= 1) AND (char_length(client_id) <= 512))),
    CONSTRAINT custom_oauth_providers_discovery_url_length CHECK (((discovery_url IS NULL) OR (char_length(discovery_url) <= 2048))),
    CONSTRAINT custom_oauth_providers_identifier_format CHECK ((identifier ~ '^[a-z0-9][a-z0-9:-]{0,48}[a-z0-9]$'::text)),
    CONSTRAINT custom_oauth_providers_issuer_length CHECK (((issuer IS NULL) OR ((char_length(issuer) >= 1) AND (char_length(issuer) <= 2048)))),
    CONSTRAINT custom_oauth_providers_jwks_uri_https CHECK (((jwks_uri IS NULL) OR (jwks_uri ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_jwks_uri_length CHECK (((jwks_uri IS NULL) OR (char_length(jwks_uri) <= 2048))),
    CONSTRAINT custom_oauth_providers_name_length CHECK (((char_length(name) >= 1) AND (char_length(name) <= 100))),
    CONSTRAINT custom_oauth_providers_oauth2_requires_endpoints CHECK (((provider_type <> 'oauth2'::text) OR ((authorization_url IS NOT NULL) AND (token_url IS NOT NULL) AND (userinfo_url IS NOT NULL)))),
    CONSTRAINT custom_oauth_providers_oidc_discovery_url_https CHECK (((provider_type <> 'oidc'::text) OR (discovery_url IS NULL) OR (discovery_url ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_oidc_issuer_https CHECK (((provider_type <> 'oidc'::text) OR (issuer IS NULL) OR (issuer ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_oidc_requires_issuer CHECK (((provider_type <> 'oidc'::text) OR (issuer IS NOT NULL))),
    CONSTRAINT custom_oauth_providers_provider_type_check CHECK ((provider_type = ANY (ARRAY['oauth2'::text, 'oidc'::text]))),
    CONSTRAINT custom_oauth_providers_token_url_https CHECK (((token_url IS NULL) OR (token_url ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_token_url_length CHECK (((token_url IS NULL) OR (char_length(token_url) <= 2048))),
    CONSTRAINT custom_oauth_providers_userinfo_url_https CHECK (((userinfo_url IS NULL) OR (userinfo_url ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_userinfo_url_length CHECK (((userinfo_url IS NULL) OR (char_length(userinfo_url) <= 2048)))
);


--
-- Name: flow_state; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.flow_state (
    id uuid NOT NULL,
    user_id uuid,
    auth_code text,
    code_challenge_method auth.code_challenge_method,
    code_challenge text,
    provider_type text NOT NULL,
    provider_access_token text,
    provider_refresh_token text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    authentication_method text NOT NULL,
    auth_code_issued_at timestamp with time zone,
    invite_token text,
    referrer text,
    oauth_client_state_id uuid,
    linking_target_id uuid,
    email_optional boolean DEFAULT false NOT NULL
);


--
-- Name: TABLE flow_state; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.flow_state IS 'Stores metadata for all OAuth/SSO login flows';


--
-- Name: identities; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.identities (
    provider_id text NOT NULL,
    user_id uuid NOT NULL,
    identity_data jsonb NOT NULL,
    provider text NOT NULL,
    last_sign_in_at timestamp with time zone,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    email text GENERATED ALWAYS AS (lower((identity_data ->> 'email'::text))) STORED,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: TABLE identities; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.identities IS 'Auth: Stores identities associated to a user.';


--
-- Name: COLUMN identities.email; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.identities.email IS 'Auth: Email is a generated column that references the optional email property in the identity_data';


--
-- Name: instances; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.instances (
    id uuid NOT NULL,
    uuid uuid,
    raw_base_config text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);


--
-- Name: TABLE instances; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.instances IS 'Auth: Manages users across multiple sites.';


--
-- Name: mfa_amr_claims; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.mfa_amr_claims (
    session_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    authentication_method text NOT NULL,
    id uuid NOT NULL
);


--
-- Name: TABLE mfa_amr_claims; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.mfa_amr_claims IS 'auth: stores authenticator method reference claims for multi factor authentication';


--
-- Name: mfa_challenges; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.mfa_challenges (
    id uuid NOT NULL,
    factor_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    verified_at timestamp with time zone,
    ip_address inet NOT NULL,
    otp_code text,
    web_authn_session_data jsonb
);


--
-- Name: TABLE mfa_challenges; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.mfa_challenges IS 'auth: stores metadata about challenge requests made';


--
-- Name: mfa_factors; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.mfa_factors (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    friendly_name text,
    factor_type auth.factor_type NOT NULL,
    status auth.factor_status NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    secret text,
    phone text,
    last_challenged_at timestamp with time zone,
    web_authn_credential jsonb,
    web_authn_aaguid uuid,
    last_webauthn_challenge_data jsonb
);


--
-- Name: TABLE mfa_factors; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.mfa_factors IS 'auth: stores metadata about factors';


--
-- Name: COLUMN mfa_factors.last_webauthn_challenge_data; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.mfa_factors.last_webauthn_challenge_data IS 'Stores the latest WebAuthn challenge data including attestation/assertion for customer verification';


--
-- Name: mfa_recovery_code_sets; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.mfa_recovery_code_sets (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    mfa_factor_id uuid NOT NULL,
    failed_verification_count integer DEFAULT 0 NOT NULL,
    verification_locked_until timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT mfa_recovery_code_sets_failed_verification_count_check CHECK ((failed_verification_count >= 0))
);


--
-- Name: mfa_recovery_codes; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.mfa_recovery_codes (
    id uuid NOT NULL,
    mfa_recovery_code_set_id uuid NOT NULL,
    code_hash text NOT NULL,
    consumed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: oauth_authorizations; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth_authorizations (
    id uuid NOT NULL,
    authorization_id text NOT NULL,
    client_id uuid NOT NULL,
    user_id uuid,
    redirect_uri text NOT NULL,
    scope text NOT NULL,
    state text,
    resource text,
    code_challenge text,
    code_challenge_method auth.code_challenge_method,
    response_type auth.oauth_response_type DEFAULT 'code'::auth.oauth_response_type NOT NULL,
    status auth.oauth_authorization_status DEFAULT 'pending'::auth.oauth_authorization_status NOT NULL,
    authorization_code text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:03:00'::interval) NOT NULL,
    approved_at timestamp with time zone,
    nonce text,
    CONSTRAINT oauth_authorizations_authorization_code_length CHECK ((char_length(authorization_code) <= 255)),
    CONSTRAINT oauth_authorizations_code_challenge_length CHECK ((char_length(code_challenge) <= 128)),
    CONSTRAINT oauth_authorizations_expires_at_future CHECK ((expires_at > created_at)),
    CONSTRAINT oauth_authorizations_nonce_length CHECK ((char_length(nonce) <= 255)),
    CONSTRAINT oauth_authorizations_redirect_uri_length CHECK ((char_length(redirect_uri) <= 2048)),
    CONSTRAINT oauth_authorizations_resource_length CHECK ((char_length(resource) <= 2048)),
    CONSTRAINT oauth_authorizations_scope_length CHECK ((char_length(scope) <= 4096)),
    CONSTRAINT oauth_authorizations_state_length CHECK ((char_length(state) <= 4096))
);


--
-- Name: oauth_client_states; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth_client_states (
    id uuid NOT NULL,
    provider_type text NOT NULL,
    code_verifier text,
    created_at timestamp with time zone NOT NULL
);


--
-- Name: TABLE oauth_client_states; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.oauth_client_states IS 'Stores OAuth states for third-party provider authentication flows where Supabase acts as the OAuth client.';


--
-- Name: oauth_clients; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth_clients (
    id uuid NOT NULL,
    client_secret_hash text,
    registration_type auth.oauth_registration_type NOT NULL,
    redirect_uris text NOT NULL,
    grant_types text NOT NULL,
    client_name text,
    client_uri text,
    logo_uri text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    client_type auth.oauth_client_type DEFAULT 'confidential'::auth.oauth_client_type NOT NULL,
    token_endpoint_auth_method text NOT NULL,
    CONSTRAINT oauth_clients_client_name_length CHECK ((char_length(client_name) <= 1024)),
    CONSTRAINT oauth_clients_client_uri_length CHECK ((char_length(client_uri) <= 2048)),
    CONSTRAINT oauth_clients_logo_uri_length CHECK ((char_length(logo_uri) <= 2048)),
    CONSTRAINT oauth_clients_token_endpoint_auth_method_check CHECK ((token_endpoint_auth_method = ANY (ARRAY['client_secret_basic'::text, 'client_secret_post'::text, 'none'::text])))
);


--
-- Name: oauth_consents; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth_consents (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    client_id uuid NOT NULL,
    scopes text NOT NULL,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    CONSTRAINT oauth_consents_revoked_after_granted CHECK (((revoked_at IS NULL) OR (revoked_at >= granted_at))),
    CONSTRAINT oauth_consents_scopes_length CHECK ((char_length(scopes) <= 2048)),
    CONSTRAINT oauth_consents_scopes_not_empty CHECK ((char_length(TRIM(BOTH FROM scopes)) > 0))
);


--
-- Name: one_time_tokens; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.one_time_tokens (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    token_type auth.one_time_token_type NOT NULL,
    token_hash text NOT NULL,
    relates_to text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    CONSTRAINT one_time_tokens_token_hash_check CHECK ((char_length(token_hash) > 0))
);


--
-- Name: refresh_tokens; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.refresh_tokens (
    instance_id uuid,
    id bigint NOT NULL,
    token character varying(255),
    user_id character varying(255),
    revoked boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    parent character varying(255),
    session_id uuid
);


--
-- Name: TABLE refresh_tokens; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.refresh_tokens IS 'Auth: Store of tokens used to refresh JWT tokens once they expire.';


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE; Schema: auth; Owner: -
--

CREATE SEQUENCE auth.refresh_tokens_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: auth; Owner: -
--

ALTER SEQUENCE auth.refresh_tokens_id_seq OWNED BY auth.refresh_tokens.id;


--
-- Name: saml_providers; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.saml_providers (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    entity_id text NOT NULL,
    metadata_xml text NOT NULL,
    metadata_url text,
    attribute_mapping jsonb,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    name_id_format text,
    CONSTRAINT "entity_id not empty" CHECK ((char_length(entity_id) > 0)),
    CONSTRAINT "metadata_url not empty" CHECK (((metadata_url = NULL::text) OR (char_length(metadata_url) > 0))),
    CONSTRAINT "metadata_xml not empty" CHECK ((char_length(metadata_xml) > 0))
);


--
-- Name: TABLE saml_providers; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.saml_providers IS 'Auth: Manages SAML Identity Provider connections.';


--
-- Name: saml_relay_states; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.saml_relay_states (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    request_id text NOT NULL,
    for_email text,
    redirect_to text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    flow_state_id uuid,
    CONSTRAINT "request_id not empty" CHECK ((char_length(request_id) > 0))
);


--
-- Name: TABLE saml_relay_states; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.saml_relay_states IS 'Auth: Contains SAML Relay State information for each Service Provider initiated login.';


--
-- Name: schema_migrations; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.schema_migrations (
    version character varying(255) NOT NULL
);


--
-- Name: TABLE schema_migrations; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.schema_migrations IS 'Auth: Manages updates to the auth system.';


--
-- Name: scim_tokens; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.scim_tokens (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    token_hash text NOT NULL,
    prefix text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    revoked_at timestamp with time zone,
    last_used_at timestamp with time zone,
    CONSTRAINT scim_tokens_expires_at_future CHECK (((expires_at IS NULL) OR (expires_at > created_at))),
    CONSTRAINT scim_tokens_revoked_after_created CHECK (((revoked_at IS NULL) OR (revoked_at >= created_at))),
    CONSTRAINT scim_tokens_token_hash_check CHECK ((token_hash ~ '^[0-9a-f]{64}$'::text))
);


--
-- Name: scim_users; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.scim_users (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    user_id uuid,
    resource jsonb NOT NULL,
    user_name text GENERATED ALWAYS AS (lower((resource ->> 'userName'::text))) STORED NOT NULL,
    external_id text GENERATED ALWAYS AS ((resource ->> 'externalId'::text)) STORED,
    active boolean GENERATED ALWAYS AS (COALESCE(((resource ->> 'active'::text))::boolean, true)) STORED NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: sessions; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.sessions (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    factor_id uuid,
    aal auth.aal_level,
    not_after timestamp with time zone,
    refreshed_at timestamp without time zone,
    user_agent text,
    ip inet,
    tag text,
    oauth_client_id uuid,
    refresh_token_hmac_key text,
    refresh_token_counter bigint,
    scopes text,
    CONSTRAINT sessions_scopes_length CHECK ((char_length(scopes) <= 4096))
);


--
-- Name: TABLE sessions; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.sessions IS 'Auth: Stores session data associated to a user.';


--
-- Name: COLUMN sessions.not_after; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sessions.not_after IS 'Auth: Not after is a nullable column that contains a timestamp after which the session should be regarded as expired.';


--
-- Name: COLUMN sessions.refresh_token_hmac_key; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sessions.refresh_token_hmac_key IS 'Holds a HMAC-SHA256 key used to sign refresh tokens for this session.';


--
-- Name: COLUMN sessions.refresh_token_counter; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sessions.refresh_token_counter IS 'Holds the ID (counter) of the last issued refresh token.';


--
-- Name: sso_domains; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.sso_domains (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    domain text NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    CONSTRAINT "domain not empty" CHECK ((char_length(domain) > 0))
);


--
-- Name: TABLE sso_domains; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.sso_domains IS 'Auth: Manages SSO email address domain mapping to an SSO Identity Provider.';


--
-- Name: sso_providers; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.sso_providers (
    id uuid NOT NULL,
    resource_id text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    disabled boolean,
    CONSTRAINT "resource_id not empty" CHECK (((resource_id = NULL::text) OR (char_length(resource_id) > 0)))
);


--
-- Name: TABLE sso_providers; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.sso_providers IS 'Auth: Manages SSO identity provider information; see saml_providers for SAML.';


--
-- Name: COLUMN sso_providers.resource_id; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sso_providers.resource_id IS 'Auth: Uniquely identifies a SSO provider according to a user-chosen resource ID (case insensitive), useful in infrastructure as code.';


--
-- Name: users; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.users (
    instance_id uuid,
    id uuid NOT NULL,
    aud character varying(255),
    role character varying(255),
    email character varying(255),
    encrypted_password character varying(255),
    email_confirmed_at timestamp with time zone,
    invited_at timestamp with time zone,
    confirmation_token character varying(255),
    confirmation_sent_at timestamp with time zone,
    recovery_token character varying(255),
    recovery_sent_at timestamp with time zone,
    email_change_token_new character varying(255),
    email_change character varying(255),
    email_change_sent_at timestamp with time zone,
    last_sign_in_at timestamp with time zone,
    raw_app_meta_data jsonb,
    raw_user_meta_data jsonb,
    is_super_admin boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    phone text DEFAULT NULL::character varying,
    phone_confirmed_at timestamp with time zone,
    phone_change text DEFAULT ''::character varying,
    phone_change_token character varying(255) DEFAULT ''::character varying,
    phone_change_sent_at timestamp with time zone,
    confirmed_at timestamp with time zone GENERATED ALWAYS AS (LEAST(email_confirmed_at, phone_confirmed_at)) STORED,
    email_change_token_current character varying(255) DEFAULT ''::character varying,
    email_change_confirm_status smallint DEFAULT 0,
    banned_until timestamp with time zone,
    reauthentication_token character varying(255) DEFAULT ''::character varying,
    reauthentication_sent_at timestamp with time zone,
    is_sso_user boolean DEFAULT false NOT NULL,
    deleted_at timestamp with time zone,
    is_anonymous boolean DEFAULT false NOT NULL,
    CONSTRAINT users_email_change_confirm_status_check CHECK (((email_change_confirm_status >= 0) AND (email_change_confirm_status <= 2)))
);


--
-- Name: TABLE users; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.users IS 'Auth: Stores user login data within a secure schema.';


--
-- Name: COLUMN users.is_sso_user; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.users.is_sso_user IS 'Auth: Set this column to true when the account comes from SSO. These accounts can have duplicate emails.';


--
-- Name: webauthn_challenges; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.webauthn_challenges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    challenge_type text NOT NULL,
    session_data jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    CONSTRAINT webauthn_challenges_challenge_type_check CHECK ((challenge_type = ANY (ARRAY['signup'::text, 'registration'::text, 'authentication'::text])))
);


--
-- Name: webauthn_credentials; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.webauthn_credentials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    credential_id bytea NOT NULL,
    public_key bytea NOT NULL,
    attestation_type text DEFAULT ''::text NOT NULL,
    aaguid uuid,
    sign_count bigint DEFAULT 0 NOT NULL,
    transports jsonb DEFAULT '[]'::jsonb NOT NULL,
    backup_eligible boolean DEFAULT false NOT NULL,
    backed_up boolean DEFAULT false NOT NULL,
    friendly_name text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone
);


--
-- Name: acessos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.acessos (
    "loginId" character varying(36) CONSTRAINT logins_id_not_null NOT NULL,
    "empresaId" character varying(36) CONSTRAINT logins_empresa_id_not_null NOT NULL,
    email character varying(255) CONSTRAINT logins_email_not_null NOT NULL,
    senha character varying(255) CONSTRAINT logins_password_not_null NOT NULL,
    status character varying(50) DEFAULT 'active'::character varying,
    "ultimoAcesso" timestamp with time zone,
    "dataCriacao" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    data_atualizacao timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    perfil character varying(50) DEFAULT 'admin'::character varying,
    "nomeFamilia" character varying(255)
);


--
-- Name: bonusVencedorJogo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."bonusVencedorJogo" (
    id character varying(36) CONSTRAINT game_winner_bonuses_id_not_null NOT NULL,
    empresa_id character varying(36),
    evento_id character varying(36) CONSTRAINT game_winner_bonuses_evento_id_not_null NOT NULL,
    partida_id character varying(36) CONSTRAINT game_winner_bonuses_partida_id_not_null NOT NULL,
    game_type character varying(50) CONSTRAINT game_winner_bonuses_game_type_not_null NOT NULL,
    time_id character varying(36) CONSTRAINT game_winner_bonuses_time_id_not_null NOT NULL,
    points_per_member integer DEFAULT 0 CONSTRAINT game_winner_bonuses_points_per_member_not_null NOT NULL,
    members_awarded integer DEFAULT 0 CONSTRAINT game_winner_bonuses_members_awarded_not_null NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP CONSTRAINT game_winner_bonuses_created_at_not_null NOT NULL
);


--
-- Name: brincadeiras; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brincadeiras (
    "brincadeiraId" character varying(36) CONSTRAINT brincadeiras_id_not_null NOT NULL,
    nome character varying(100) CONSTRAINT brincadeiras_name_not_null NOT NULL,
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
    "eventoId" text
);


--
-- Name: cacaTesourPartidas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."cacaTesourPartidas" (
    "partidaId" character varying(36) CONSTRAINT caca_tesouro_partidas_id_not_null NOT NULL,
    "eventoId" character varying(36) CONSTRAINT caca_tesouro_partidas_evento_id_not_null NOT NULL,
    "brincadeiraId" character varying(36) CONSTRAINT caca_tesouro_partidas_brincadeira_id_not_null NOT NULL,
    status character varying(20) CONSTRAINT caca_tesouro_partidas_status_not_null NOT NULL,
    "numeroRonda" integer CONSTRAINT caca_tesouro_partidas_round_number_not_null NOT NULL,
    "checkpointAlvoId" character varying(36),
    "checkpointsCompletadosIds" text,
    "iniciadoEm" timestamp with time zone CONSTRAINT caca_tesouro_partidas_started_at_not_null NOT NULL,
    "rondaIniciadaEm" timestamp with time zone CONSTRAINT caca_tesouro_partidas_round_started_at_not_null NOT NULL,
    "finalizadoEm" timestamp with time zone,
    "timeInicialId" character varying(36),
    "timeVezId" character varying(36),
    "vezDisponvelEm" timestamp with time zone
);


--
-- Name: cacaTesourScans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."cacaTesourScans" (
    "scanId" character varying(36) CONSTRAINT caca_tesouro_scans_id_not_null NOT NULL,
    "partidaId" character varying(36) CONSTRAINT caca_tesouro_scans_partida_id_not_null NOT NULL,
    "eventoId" character varying(36) CONSTRAINT caca_tesouro_scans_evento_id_not_null NOT NULL,
    "brincadeiraId" character varying(36) CONSTRAINT caca_tesouro_scans_brincadeira_id_not_null NOT NULL,
    "numeroRonda" integer CONSTRAINT caca_tesouro_scans_round_number_not_null NOT NULL,
    "checkpointId" character varying(36) CONSTRAINT caca_tesouro_scans_checkpoint_id_not_null NOT NULL,
    "criancaId" character varying(36) CONSTRAINT caca_tesouro_scans_crianca_id_not_null NOT NULL,
    "timeId" character varying(36) CONSTRAINT caca_tesouro_scans_time_id_not_null NOT NULL,
    uid character varying(100) CONSTRAINT caca_tesouro_scans_uid_not_null NOT NULL,
    "leroEm" timestamp with time zone CONSTRAINT caca_tesouro_scans_scanned_at_not_null NOT NULL
);


--
-- Name: cacaTesourTempos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."cacaTesourTempos" (
    "tempoId" character varying(36) CONSTRAINT caca_tesouro_tempos_id_not_null NOT NULL,
    "partidaId" character varying(36) CONSTRAINT caca_tesouro_tempos_partida_id_not_null NOT NULL,
    "eventoId" character varying(36) CONSTRAINT caca_tesouro_tempos_evento_id_not_null NOT NULL,
    "timeId" character varying(36) CONSTRAINT caca_tesouro_tempos_time_id_not_null NOT NULL,
    "iniciadoEm" timestamp with time zone,
    "completadoEm" timestamp with time zone,
    "msDecorridos" bigint
);


--
-- Name: chamadosSuport; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."chamadosSuport" (
    "ticketId" character varying(36) CONSTRAINT support_tickets_id_not_null NOT NULL,
    "empresaId" character varying(36),
    cliente character varying(255) CONSTRAINT support_tickets_client_not_null NOT NULL,
    assunto character varying(255) CONSTRAINT support_tickets_subject_not_null NOT NULL,
    status character varying(20) DEFAULT 'aberto'::character varying CONSTRAINT support_tickets_status_not_null NOT NULL,
    prioridade character varying(20) DEFAULT 'media'::character varying CONSTRAINT support_tickets_priority_not_null NOT NULL,
    descricao text,
    "atribuidoPara" character varying(255),
    "criadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP CONSTRAINT support_tickets_created_at_not_null NOT NULL,
    "atualizadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP CONSTRAINT support_tickets_updated_at_not_null NOT NULL
);


--
-- Name: etiquetasCheckpoint; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."etiquetasCheckpoint" (
    "tagId" integer CONSTRAINT checkpoint_tags_id_not_null NOT NULL,
    "checkpointId" character varying(36) CONSTRAINT checkpoint_tags_checkpoint_id_not_null NOT NULL,
    "tagUid" character varying(50) CONSTRAINT checkpoint_tags_tag_uid_not_null NOT NULL,
    "criadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: checkpoint_tags_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."etiquetasCheckpoint" ALTER COLUMN "tagId" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.checkpoint_tags_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: clientes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clientes (
    "clienteId" character varying(36) CONSTRAINT clientes_id_not_null NOT NULL,
    nome character varying(100) CONSTRAINT clientes_name_not_null NOT NULL,
    cidade character varying(100),
    estado character varying(2),
    email character varying(100) NOT NULL,
    telefone character varying(20),
    plano character varying(20) DEFAULT 'starter'::character varying,
    status character varying(20) DEFAULT 'active'::character varying,
    "eventosRealizados" integer DEFAULT 0,
    "ultimoAcesso" timestamp with time zone,
    "criadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    empresa_id character varying(36),
    address character varying(255),
    backup_frequency character varying(20) DEFAULT 'daily'::character varying,
    logo_data text,
    logo_name character varying(255),
    logo_type character varying(100)
);


--
-- Name: codigosVinculoFamiliar; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."codigosVinculoFamiliar" (
    id uuid DEFAULT gen_random_uuid() CONSTRAINT family_linking_codes_id_not_null NOT NULL,
    crianca_id character varying(36) CONSTRAINT family_linking_codes_crianca_id_not_null NOT NULL,
    evento_id character varying(36) CONSTRAINT family_linking_codes_evento_id_not_null NOT NULL,
    empresa_id character varying(36) CONSTRAINT family_linking_codes_empresa_id_not_null NOT NULL,
    qr_code_value character varying(50) CONSTRAINT family_linking_codes_qr_code_value_not_null NOT NULL,
    tracking_url character varying(500) CONSTRAINT family_linking_codes_tracking_url_not_null NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    expires_at timestamp without time zone CONSTRAINT family_linking_codes_expires_at_not_null NOT NULL,
    used_at timestamp without time zone,
    used_by_login_id character varying(36)
);


--
-- Name: configuracoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.configuracoes (
    "settingId" integer CONSTRAINT settings_id_not_null NOT NULL,
    setting_key character varying(100) CONSTRAINT settings_setting_key_not_null NOT NULL,
    setting_value text,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    empresa_id text
);


--
-- Name: conquistas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conquistas (
    "conquistaId" character varying(36) CONSTRAINT conquistas_id_not_null NOT NULL,
    nome character varying(100) CONSTRAINT conquistas_name_not_null NOT NULL,
    descricao character varying(500),
    icone character varying(50),
    cor character varying(20),
    "tipoRequerido" character varying(50),
    "valorRequerido" integer,
    "pontosBonus" integer DEFAULT 0,
    "criadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: conviteFamilia; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."conviteFamilia" (
    "conviteId" character varying(36) CONSTRAINT family_invites_id_not_null NOT NULL,
    "empresaId" character varying(36) CONSTRAINT family_invites_empresa_id_not_null NOT NULL,
    "eventoId" character varying(36) CONSTRAINT family_invites_evento_id_not_null NOT NULL,
    "criancaId" character varying(36),
    email character varying(255),
    "hashToken" character varying(128) CONSTRAINT family_invites_token_hash_not_null NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying CONSTRAINT family_invites_status_not_null NOT NULL,
    "expiramEm" timestamp with time zone CONSTRAINT family_invites_expires_at_not_null NOT NULL,
    "usadoEm" timestamp with time zone,
    "criadoPor" character varying(36),
    "criadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP CONSTRAINT family_invites_created_at_not_null NOT NULL
);


--
-- Name: criancaConquistas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."criancaConquistas" (
    "criancaId" character varying(36) CONSTRAINT crianca_conquistas_crianca_id_not_null NOT NULL,
    "conquistaId" character varying(36) CONSTRAINT crianca_conquistas_conquista_id_not_null NOT NULL,
    "desbloqueadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: criancas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.criancas (
    "criancaId" character varying(36) CONSTRAINT criancas_id_not_null NOT NULL,
    "eventoId" character varying(36) CONSTRAINT criancas_evento_id_not_null NOT NULL,
    "timeId" character varying(36),
    nome character varying(100) CONSTRAINT criancas_name_not_null NOT NULL,
    apelido character varying(100),
    idade integer,
    avatar character varying(64) DEFAULT '??'::character varying,
    "codigoPulseira" character varying(50),
    pontos integer DEFAULT 0,
    status character varying(20) DEFAULT 'active'::character varying,
    "criadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "empresaId" character varying(36),
    qr_code character varying
);


--
-- Name: empresaEventoControle; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."empresaEventoControle" (
    empresa_id character varying(36) CONSTRAINT empresa_event_control_empresa_id_not_null NOT NULL,
    evento_id character varying(36),
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP CONSTRAINT empresa_event_control_updated_at_not_null NOT NULL
);


--
-- Name: empresas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.empresas (
    "empresaId" character varying(36) CONSTRAINT empresas_id_not_null NOT NULL,
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
    floor_plan_data text,
    floor_plan_name character varying(255),
    floor_plan_type character varying(100),
    zones_data text
);


--
-- Name: estadoJogoEvento; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."estadoJogoEvento" (
    evento_id character varying(36) CONSTRAINT event_game_state_evento_id_not_null NOT NULL,
    empresa_id character varying(36) CONSTRAINT event_game_state_empresa_id_not_null NOT NULL,
    mode character varying(20) DEFAULT 'idle'::character varying CONSTRAINT event_game_state_mode_not_null NOT NULL,
    game_type character varying(50) DEFAULT 'none'::character varying CONSTRAINT event_game_state_game_type_not_null NOT NULL,
    game_id character varying(36),
    game_name character varying(255),
    started_at timestamp with time zone,
    stopped_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP CONSTRAINT event_game_state_updated_at_not_null NOT NULL
);


--
-- Name: eventoBrincadeiras; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."eventoBrincadeiras" (
    "eventoId" character varying(36) CONSTRAINT evento_brincadeiras_evento_id_not_null NOT NULL,
    "brincadeiraId" character varying(36) CONSTRAINT evento_brincadeiras_brincadeira_id_not_null NOT NULL,
    ordem integer DEFAULT 0,
    "multiplicadorPontos" integer DEFAULT 1,
    "criadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: eventos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.eventos (
    "eventoId" character varying(36) CONSTRAINT eventos_id_not_null NOT NULL,
    "clienteId" character varying(36),
    nome character varying(100) CONSTRAINT eventos_name_not_null NOT NULL,
    descricao character varying(500),
    data date CONSTRAINT eventos_date_not_null NOT NULL,
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
    zones_data text,
    "nomeResponsavel" character varying(150),
    "iniciadoEm" timestamp with time zone,
    "finalizadoEm" timestamp with time zone,
    "autoInicio" integer DEFAULT 0,
    "autoFim" integer DEFAULT 0
);


--
-- Name: leituras; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leituras (
    "leituraId" character varying(36) CONSTRAINT leituras_id_not_null NOT NULL,
    "checkpointId" character varying(36) CONSTRAINT leituras_checkpoint_id_not_null NOT NULL,
    "criancaId" character varying(36),
    uid character varying(50) NOT NULL,
    "brincadeiraId" text,
    autorizado integer DEFAULT 0,
    "pontosAtribuidos" integer DEFAULT 0,
    "forcaSinal" integer,
    "criadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "empresaId" character varying(36),
    session_id character varying(36)
);


--
-- Name: logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.logs (
    "logId" integer CONSTRAINT logs_id_not_null NOT NULL,
    tipo character varying(20) NOT NULL,
    "clienteId" character varying(36),
    "eventoId" character varying(36),
    mensagem character varying(500) CONSTRAINT logs_message_not_null NOT NULL,
    detalhes text,
    "criadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "empresaId" character varying(36)
);


--
-- Name: logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.logs ALTER COLUMN "logId" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: mensagensDisplay; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."mensagensDisplay" (
    "mensagemId" character varying(36) CONSTRAINT mensagens_display_id_not_null NOT NULL,
    "eventoId" character varying(36) CONSTRAINT mensagens_display_evento_id_not_null NOT NULL,
    texto character varying(500) CONSTRAINT mensagens_display_text_not_null NOT NULL,
    tipo character varying(20) DEFAULT 'custom'::character varying,
    remetente character varying(100),
    "enviadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: monsterCacaEstadosTime; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."monsterCacaEstadosTime" (
    id character varying(36) CONSTRAINT monster_hunt_team_states_id_not_null NOT NULL,
    partida_id character varying(36) CONSTRAINT monster_hunt_team_states_partida_id_not_null NOT NULL,
    empresa_id character varying(36) CONSTRAINT monster_hunt_team_states_empresa_id_not_null NOT NULL,
    evento_id character varying(36) CONSTRAINT monster_hunt_team_states_evento_id_not_null NOT NULL,
    time_id character varying(36) CONSTRAINT monster_hunt_team_states_time_id_not_null NOT NULL,
    hp integer DEFAULT 500 CONSTRAINT monster_hunt_team_states_hp_not_null NOT NULL,
    max_hp integer DEFAULT 500 CONSTRAINT monster_hunt_team_states_max_hp_not_null NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying CONSTRAINT monster_hunt_team_states_status_not_null NOT NULL,
    version integer DEFAULT 0 CONSTRAINT monster_hunt_team_states_version_not_null NOT NULL,
    defeated_at timestamp with time zone,
    victory_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP CONSTRAINT monster_hunt_team_states_created_at_not_null NOT NULL
);


--
-- Name: monsterCacaLeituras; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."monsterCacaLeituras" (
    id character varying(36) CONSTRAINT monster_hunt_scans_id_not_null NOT NULL,
    partida_id character varying(36) CONSTRAINT monster_hunt_scans_partida_id_not_null NOT NULL,
    empresa_id character varying(36) CONSTRAINT monster_hunt_scans_empresa_id_not_null NOT NULL,
    evento_id character varying(36) CONSTRAINT monster_hunt_scans_evento_id_not_null NOT NULL,
    brincadeira_id character varying(36),
    checkpoint_id character varying(36) CONSTRAINT monster_hunt_scans_checkpoint_id_not_null NOT NULL,
    crianca_id character varying(36) CONSTRAINT monster_hunt_scans_crianca_id_not_null NOT NULL,
    time_id character varying(36),
    uid character varying(255),
    leitura_id character varying(36),
    attack_type character varying(30) CONSTRAINT monster_hunt_scans_attack_type_not_null NOT NULL,
    damage integer DEFAULT 0 CONSTRAINT monster_hunt_scans_damage_not_null NOT NULL,
    monster_hp_after integer CONSTRAINT monster_hunt_scans_monster_hp_after_not_null NOT NULL,
    monster_defeated boolean DEFAULT false CONSTRAINT monster_hunt_scans_monster_defeated_not_null NOT NULL,
    version integer DEFAULT 0 CONSTRAINT monster_hunt_scans_version_not_null NOT NULL,
    scanned_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP CONSTRAINT monster_hunt_scans_scanned_at_not_null NOT NULL
);


--
-- Name: monsterCacaPartidas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."monsterCacaPartidas" (
    id character varying(36) CONSTRAINT monster_hunt_partidas_id_not_null NOT NULL,
    empresa_id character varying(36) CONSTRAINT monster_hunt_partidas_empresa_id_not_null NOT NULL,
    evento_id character varying(36) CONSTRAINT monster_hunt_partidas_evento_id_not_null NOT NULL,
    brincadeira_id character varying(36),
    status character varying(20) DEFAULT 'active'::character varying CONSTRAINT monster_hunt_partidas_status_not_null NOT NULL,
    hp integer DEFAULT 100 CONSTRAINT monster_hunt_partidas_hp_not_null NOT NULL,
    max_hp integer DEFAULT 100 CONSTRAINT monster_hunt_partidas_max_hp_not_null NOT NULL,
    normal_damage integer DEFAULT 10 CONSTRAINT monster_hunt_partidas_normal_damage_not_null NOT NULL,
    special_checkpoint_damage integer DEFAULT 30 CONSTRAINT monster_hunt_partidas_special_checkpoint_damage_not_null NOT NULL,
    special_attack_damage integer DEFAULT 50 CONSTRAINT monster_hunt_partidas_special_attack_damage_not_null NOT NULL,
    special_checkpoint_id character varying(36),
    winner_time_id character varying(36),
    version integer DEFAULT 0 CONSTRAINT monster_hunt_partidas_version_not_null NOT NULL,
    started_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP CONSTRAINT monster_hunt_partidas_started_at_not_null NOT NULL,
    finished_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP CONSTRAINT monster_hunt_partidas_created_at_not_null NOT NULL
);


--
-- Name: pontoVerificacao; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."pontoVerificacao" (
    "checkpointId" character varying(36) CONSTRAINT checkpoints_id_not_null NOT NULL,
    "eventoId" character varying(36) CONSTRAINT checkpoints_evento_id_not_null NOT NULL,
    nome character varying(100) CONSTRAINT checkpoints_name_not_null NOT NULL,
    tipo character varying(20) DEFAULT 'NFC'::character varying,
    ip character varying(15),
    zona character varying(100),
    "corLed" character varying(20) DEFAULT '#00FF00'::character varying,
    points integer DEFAULT 10,
    status character varying(20) DEFAULT 'offline'::character varying,
    "territorioDonoTimeId" character varying(36),
    "territorioTravadoAte" timestamp with time zone,
    "territorioCooldownAte" timestamp with time zone,
    "ultimoConquistadoEm" timestamp with time zone,
    "criadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "empresaId" character varying(36),
    "tagsAutorizadas" text,
    "ultimoVisto" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    location character varying(100),
    proposito character varying(20) DEFAULT 'game'::character varying,
    "mapaX" integer,
    "mapaY" integer,
    "territorioDonosCriancaId" character varying(36)
);


--
-- Name: pontuacoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pontuacoes (
    "pontuacaoId" character varying(36) CONSTRAINT pontuacoes_id_not_null NOT NULL,
    "eventoId" character varying(36) CONSTRAINT pontuacoes_evento_id_not_null NOT NULL,
    "criancaId" character varying(36) CONSTRAINT pontuacoes_crianca_id_not_null NOT NULL,
    "brincadeiraId" text,
    "checkpointId" character varying(36) CONSTRAINT pontuacoes_checkpoint_id_not_null NOT NULL,
    pontos integer CONSTRAINT pontuacoes_points_not_null NOT NULL,
    "leituraId" character varying(36),
    "criadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "empresaId" character varying(36)
);


--
-- Name: pulseiras; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pulseiras (
    codigo character varying(50) CONSTRAINT pulseiras_code_not_null NOT NULL,
    status character varying(20) DEFAULT 'disponivel'::character varying,
    crianca_id character varying(36),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    empresa_id character varying(36)
);


--
-- Name: sessoesJogo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."sessoesJogo" (
    id character varying(36) CONSTRAINT game_sessions_id_not_null NOT NULL,
    evento_id character varying(36) CONSTRAINT game_sessions_evento_id_not_null NOT NULL,
    brincadeira_id character varying(36) CONSTRAINT game_sessions_brincadeira_id_not_null NOT NULL,
    game_type character varying(50) CONSTRAINT game_sessions_game_type_not_null NOT NULL,
    mode character varying(20),
    status character varying(20) DEFAULT 'active'::character varying CONSTRAINT game_sessions_status_not_null NOT NULL,
    started_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP CONSTRAINT game_sessions_started_at_not_null NOT NULL,
    finished_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP CONSTRAINT game_sessions_created_at_not_null NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP CONSTRAINT game_sessions_updated_at_not_null NOT NULL
);


--
-- Name: settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.configuracoes ALTER COLUMN "settingId" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.settings_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: times; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.times (
    "timeId" character varying(36) CONSTRAINT times_id_not_null NOT NULL,
    evento_id character varying(36),
    nome character varying(50) CONSTRAINT times_name_not_null NOT NULL,
    cor character varying(20) CONSTRAINT times_color_not_null NOT NULL,
    pontos integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    empresa_id character varying(36)
);


--
-- Name: vinculoFamiliar; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."vinculoFamiliar" (
    "vinculoId" character varying(36) CONSTRAINT family_child_links_id_not_null NOT NULL,
    "loginId" character varying(36) CONSTRAINT family_child_links_login_id_not_null NOT NULL,
    "criancaId" character varying(36) CONSTRAINT family_child_links_crianca_id_not_null NOT NULL,
    "empresaId" character varying(36) CONSTRAINT family_child_links_empresa_id_not_null NOT NULL,
    relacionamento character varying(50) DEFAULT 'responsável'::character varying CONSTRAINT family_child_links_relationship_not_null NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying CONSTRAINT family_child_links_status_not_null NOT NULL,
    "aprovadoPor" character varying(36),
    "aprovadoEm" timestamp with time zone,
    "rejeitadoEm" timestamp with time zone,
    "criadoEm" timestamp with time zone DEFAULT CURRENT_TIMESTAMP CONSTRAINT family_child_links_created_at_not_null NOT NULL
);


--
-- Name: zonas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.zonas (
    "zonaId" character varying(36) CONSTRAINT zonas_id_not_null NOT NULL,
    evento_id character varying(36) NOT NULL,
    nome character varying(100) CONSTRAINT zonas_name_not_null NOT NULL,
    cor character varying(20) CONSTRAINT zonas_color_not_null NOT NULL,
    x integer NOT NULL,
    y integer NOT NULL,
    width integer NOT NULL,
    height integer NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: zonasConquistaEstadosCheckpoint; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."zonasConquistaEstadosCheckpoint" (
    id character varying(36) CONSTRAINT zone_conquest_checkpoint_states_id_not_null NOT NULL,
    partida_id character varying(36) CONSTRAINT zone_conquest_checkpoint_states_partida_id_not_null NOT NULL,
    empresa_id character varying(36) CONSTRAINT zone_conquest_checkpoint_states_empresa_id_not_null NOT NULL,
    evento_id character varying(36) CONSTRAINT zone_conquest_checkpoint_states_evento_id_not_null NOT NULL,
    checkpoint_id character varying(36) CONSTRAINT zone_conquest_checkpoint_states_checkpoint_id_not_null NOT NULL,
    current_owner_id character varying(36),
    owner_type character varying(20) DEFAULT 'team'::character varying CONSTRAINT zone_conquest_checkpoint_states_owner_type_not_null NOT NULL,
    protected_until timestamp with time zone,
    last_conquered_at timestamp with time zone,
    conquest_count integer DEFAULT 0 CONSTRAINT zone_conquest_checkpoint_states_conquest_count_not_null NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP CONSTRAINT zone_conquest_checkpoint_states_created_at_not_null NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP CONSTRAINT zone_conquest_checkpoint_states_updated_at_not_null NOT NULL
);


--
-- Name: zonasConquistaEstadosParticipanteIndividual; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."zonasConquistaEstadosParticipanteIndividual" (
    id character varying(36) CONSTRAINT zone_conquest_individual_participant_states_id_not_null NOT NULL,
    partida_id character varying(36) CONSTRAINT zone_conquest_individual_participant_states_partida_id_not_null NOT NULL,
    empresa_id character varying(36) CONSTRAINT zone_conquest_individual_participant_states_empresa_id_not_null NOT NULL,
    evento_id character varying(36) CONSTRAINT zone_conquest_individual_participant_states_evento_id_not_null NOT NULL,
    crianca_id character varying(36) CONSTRAINT zone_conquest_individual_participant_states_crianca_id_not_null NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying CONSTRAINT zone_conquest_individual_participant_states_status_not_null NOT NULL,
    checkpoints_read integer DEFAULT 0 CONSTRAINT zone_conquest_individual_participant__checkpoints_read_not_null NOT NULL,
    total_points numeric(10,2) DEFAULT 0 CONSTRAINT zone_conquest_individual_participant_stat_total_points_not_null NOT NULL,
    ranking integer,
    version integer DEFAULT 0 CONSTRAINT zone_conquest_individual_participant_states_version_not_null NOT NULL,
    started_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP CONSTRAINT zone_conquest_individual_participant_states_started_at_not_null NOT NULL,
    finished_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP CONSTRAINT zone_conquest_individual_participant_states_created_at_not_null NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP CONSTRAINT zone_conquest_individual_participant_states_updated_at_not_null NOT NULL,
    color character varying(50)
);


--
-- Name: zonasConquistaEstadosZona; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."zonasConquistaEstadosZona" (
    id character varying(36) CONSTRAINT zone_conquest_zone_states_id_not_null NOT NULL,
    partida_id character varying(36) CONSTRAINT zone_conquest_zone_states_partida_id_not_null NOT NULL,
    empresa_id character varying(36) CONSTRAINT zone_conquest_zone_states_empresa_id_not_null NOT NULL,
    evento_id character varying(36) CONSTRAINT zone_conquest_zone_states_evento_id_not_null NOT NULL,
    zone_id character varying(36) CONSTRAINT zone_conquest_zone_states_zone_id_not_null NOT NULL,
    current_owner_id character varying(36),
    owner_type character varying(20) DEFAULT 'team'::character varying CONSTRAINT zone_conquest_zone_states_owner_type_not_null NOT NULL,
    is_disputed boolean DEFAULT false CONSTRAINT zone_conquest_zone_states_is_disputed_not_null NOT NULL,
    checkpoints_count integer DEFAULT 0 CONSTRAINT zone_conquest_zone_states_checkpoints_count_not_null NOT NULL,
    checkpoints_owned integer DEFAULT 0 CONSTRAINT zone_conquest_zone_states_checkpoints_owned_not_null NOT NULL,
    last_updated_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP CONSTRAINT zone_conquest_zone_states_created_at_not_null NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP CONSTRAINT zone_conquest_zone_states_updated_at_not_null NOT NULL
);


--
-- Name: zonasConquistaLeituraIndividual; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."zonasConquistaLeituraIndividual" (
    id character varying(36) CONSTRAINT zone_conquest_individual_scans_id_not_null NOT NULL,
    partida_id character varying(36) CONSTRAINT zone_conquest_individual_scans_partida_id_not_null NOT NULL,
    empresa_id character varying(36) CONSTRAINT zone_conquest_individual_scans_empresa_id_not_null NOT NULL,
    evento_id character varying(36) CONSTRAINT zone_conquest_individual_scans_evento_id_not_null NOT NULL,
    brincadeira_id character varying(36) CONSTRAINT zone_conquest_individual_scans_brincadeira_id_not_null NOT NULL,
    checkpoint_id character varying(36) CONSTRAINT zone_conquest_individual_scans_checkpoint_id_not_null NOT NULL,
    crianca_id character varying(36) CONSTRAINT zone_conquest_individual_scans_crianca_id_not_null NOT NULL,
    uid character varying(255),
    leitura_id character varying(36),
    points_awarded numeric(10,2) DEFAULT 0 CONSTRAINT zone_conquest_individual_scans_points_awarded_not_null NOT NULL,
    version integer DEFAULT 0 CONSTRAINT zone_conquest_individual_scans_version_not_null NOT NULL,
    scanned_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP CONSTRAINT zone_conquest_individual_scans_scanned_at_not_null NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP CONSTRAINT zone_conquest_individual_scans_created_at_not_null NOT NULL
);


--
-- Name: zonasConquistaLeituraTime; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."zonasConquistaLeituraTime" (
    id character varying(36) CONSTRAINT zone_conquest_team_scans_id_not_null NOT NULL,
    partida_id character varying(36) CONSTRAINT zone_conquest_team_scans_partida_id_not_null NOT NULL,
    empresa_id character varying(36) CONSTRAINT zone_conquest_team_scans_empresa_id_not_null NOT NULL,
    evento_id character varying(36) CONSTRAINT zone_conquest_team_scans_evento_id_not_null NOT NULL,
    brincadeira_id character varying(36) CONSTRAINT zone_conquest_team_scans_brincadeira_id_not_null NOT NULL,
    round_number integer CONSTRAINT zone_conquest_team_scans_round_number_not_null NOT NULL,
    checkpoint_id character varying(36) CONSTRAINT zone_conquest_team_scans_checkpoint_id_not_null NOT NULL,
    crianca_id character varying(36) CONSTRAINT zone_conquest_team_scans_crianca_id_not_null NOT NULL,
    time_id character varying(36) CONSTRAINT zone_conquest_team_scans_time_id_not_null NOT NULL,
    uid character varying(255),
    leitura_id character varying(36),
    points_awarded numeric(10,2) DEFAULT 0 CONSTRAINT zone_conquest_team_scans_points_awarded_not_null NOT NULL,
    scanned_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP CONSTRAINT zone_conquest_team_scans_scanned_at_not_null NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP CONSTRAINT zone_conquest_team_scans_created_at_not_null NOT NULL
);


--
-- Name: zonasConquistaPartidaIndividual; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."zonasConquistaPartidaIndividual" (
    id character varying(36) CONSTRAINT zone_conquest_individual_partidas_id_not_null NOT NULL,
    empresa_id character varying(36) CONSTRAINT zone_conquest_individual_partidas_empresa_id_not_null NOT NULL,
    evento_id character varying(36) CONSTRAINT zone_conquest_individual_partidas_evento_id_not_null NOT NULL,
    brincadeira_id character varying(36) CONSTRAINT zone_conquest_individual_partidas_brincadeira_id_not_null NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying CONSTRAINT zone_conquest_individual_partidas_status_not_null NOT NULL,
    version integer DEFAULT 0 CONSTRAINT zone_conquest_individual_partidas_version_not_null NOT NULL,
    started_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP CONSTRAINT zone_conquest_individual_partidas_started_at_not_null NOT NULL,
    finished_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP CONSTRAINT zone_conquest_individual_partidas_created_at_not_null NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP CONSTRAINT zone_conquest_individual_partidas_updated_at_not_null NOT NULL
);


--
-- Name: zonasConquistaPartidaTime; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."zonasConquistaPartidaTime" (
    id character varying(36) CONSTRAINT zone_conquest_team_partidas_id_not_null NOT NULL,
    empresa_id character varying(36) CONSTRAINT zone_conquest_team_partidas_empresa_id_not_null NOT NULL,
    evento_id character varying(36) CONSTRAINT zone_conquest_team_partidas_evento_id_not_null NOT NULL,
    brincadeira_id character varying(36) CONSTRAINT zone_conquest_team_partidas_brincadeira_id_not_null NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying CONSTRAINT zone_conquest_team_partidas_status_not_null NOT NULL,
    round_number integer DEFAULT 1 CONSTRAINT zone_conquest_team_partidas_round_number_not_null NOT NULL,
    current_team_id character varying(36),
    started_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP CONSTRAINT zone_conquest_team_partidas_started_at_not_null NOT NULL,
    finished_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP CONSTRAINT zone_conquest_team_partidas_created_at_not_null NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP CONSTRAINT zone_conquest_team_partidas_updated_at_not_null NOT NULL
);


--
-- Name: zonasConquistaProtecaoCheckpointIndividual; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."zonasConquistaProtecaoCheckpointIndividual" (
    id character varying(36) CONSTRAINT zone_conquest_individual_checkpoint_protection_id_not_null NOT NULL,
    partida_id character varying(36) CONSTRAINT zone_conquest_individual_checkpoint_protect_partida_id_not_null NOT NULL,
    checkpoint_id character varying(36) CONSTRAINT zone_conquest_individual_checkpoint_prot_checkpoint_id_not_null NOT NULL,
    crianca_id character varying(36) CONSTRAINT zone_conquest_individual_checkpoint_protect_crianca_id_not_null NOT NULL,
    protection_until timestamp with time zone CONSTRAINT zone_conquest_individual_checkpoint_p_protection_until_not_null NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP CONSTRAINT zone_conquest_individual_checkpoint_protect_created_at_not_null NOT NULL
);


--
-- Name: zonasConquistaTempoTime; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."zonasConquistaTempoTime" (
    id character varying(36) CONSTRAINT zone_conquest_team_tempos_id_not_null NOT NULL,
    partida_id character varying(36) CONSTRAINT zone_conquest_team_tempos_partida_id_not_null NOT NULL,
    empresa_id character varying(36) CONSTRAINT zone_conquest_team_tempos_empresa_id_not_null NOT NULL,
    evento_id character varying(36) CONSTRAINT zone_conquest_team_tempos_evento_id_not_null NOT NULL,
    time_id character varying(36) CONSTRAINT zone_conquest_team_tempos_time_id_not_null NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying CONSTRAINT zone_conquest_team_tempos_status_not_null NOT NULL,
    zones_dominated integer DEFAULT 0 CONSTRAINT zone_conquest_team_tempos_zones_dominated_not_null NOT NULL,
    checkpoints_read integer DEFAULT 0 CONSTRAINT zone_conquest_team_tempos_checkpoints_read_not_null NOT NULL,
    total_points numeric(10,2) DEFAULT 0 CONSTRAINT zone_conquest_team_tempos_total_points_not_null NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    elapsed_ms integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP CONSTRAINT zone_conquest_team_tempos_created_at_not_null NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP CONSTRAINT zone_conquest_team_tempos_updated_at_not_null NOT NULL
);


--
-- Name: zonasEquipesEstadosTime; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."zonasEquipesEstadosTime" (
    id character varying(36) CONSTRAINT zonas_equipes_teams_states_id_not_null NOT NULL,
    partida_id character varying(36) CONSTRAINT zonas_equipes_teams_states_partida_id_not_null NOT NULL,
    empresa_id character varying(36) CONSTRAINT zonas_equipes_teams_states_empresa_id_not_null NOT NULL,
    evento_id character varying(36) CONSTRAINT zonas_equipes_teams_states_evento_id_not_null NOT NULL,
    time_id character varying(36) CONSTRAINT zonas_equipes_teams_states_time_id_not_null NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying CONSTRAINT zonas_equipes_teams_states_status_not_null NOT NULL,
    version integer DEFAULT 0 CONSTRAINT zonas_equipes_teams_states_version_not_null NOT NULL,
    defeated_at timestamp with time zone,
    victory_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP CONSTRAINT zonas_equipes_teams_states_created_at_not_null NOT NULL
);


--
-- Name: zonasEquipesPartidas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."zonasEquipesPartidas" (
    id character varying(36) CONSTRAINT zonas_equipes_partidas_id_not_null NOT NULL,
    empresa_id character varying(36) CONSTRAINT zonas_equipes_partidas_empresa_id_not_null NOT NULL,
    evento_id character varying(36) CONSTRAINT zonas_equipes_partidas_evento_id_not_null NOT NULL,
    brincadeira_id character varying(36),
    status character varying(20) DEFAULT 'active'::character varying CONSTRAINT zonas_equipes_partidas_status_not_null NOT NULL,
    version integer DEFAULT 0 CONSTRAINT zonas_equipes_partidas_version_not_null NOT NULL,
    started_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP CONSTRAINT zonas_equipes_partidas_started_at_not_null NOT NULL,
    finished_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP CONSTRAINT zonas_equipes_partidas_created_at_not_null NOT NULL
);


--
-- Name: zonasEquipesScans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."zonasEquipesScans" (
    id character varying(36) CONSTRAINT zonas_equipes_scans_id_not_null NOT NULL,
    partida_id character varying(36) CONSTRAINT zonas_equipes_scans_partida_id_not_null NOT NULL,
    empresa_id character varying(36) CONSTRAINT zonas_equipes_scans_empresa_id_not_null NOT NULL,
    evento_id character varying(36) CONSTRAINT zonas_equipes_scans_evento_id_not_null NOT NULL,
    brincadeira_id character varying(36),
    checkpoint_id character varying(36) CONSTRAINT zonas_equipes_scans_checkpoint_id_not_null NOT NULL,
    crianca_id character varying(36) CONSTRAINT zonas_equipes_scans_crianca_id_not_null NOT NULL,
    time_id character varying(36),
    uid character varying(255),
    leitura_id character varying(36),
    version integer DEFAULT 0 CONSTRAINT zonas_equipes_scans_version_not_null NOT NULL,
    scanned_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP CONSTRAINT zonas_equipes_scans_scanned_at_not_null NOT NULL
);


--
-- Name: messages; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    binary_payload bytea,
    skip_broadcast boolean DEFAULT false NOT NULL
)
PARTITION BY RANGE (inserted_at);


--
-- Name: schema_migrations; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.schema_migrations (
    version bigint NOT NULL,
    inserted_at timestamp(0) without time zone DEFAULT now()
);


--
-- Name: subscription; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.subscription (
    id bigint NOT NULL,
    subscription_id uuid NOT NULL,
    entity regclass NOT NULL,
    filters realtime.user_defined_filter[] DEFAULT '{}'::realtime.user_defined_filter[] NOT NULL,
    claims jsonb NOT NULL,
    claims_role regrole GENERATED ALWAYS AS (realtime.to_regrole((claims ->> 'role'::text))) STORED NOT NULL,
    created_at timestamp without time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    action_filter text DEFAULT '*'::text,
    selected_columns text[],
    CONSTRAINT subscription_action_filter_check CHECK ((action_filter = ANY (ARRAY['*'::text, 'INSERT'::text, 'UPDATE'::text, 'DELETE'::text])))
);


--
-- Name: subscription_id_seq; Type: SEQUENCE; Schema: realtime; Owner: -
--

ALTER TABLE realtime.subscription ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME realtime.subscription_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: buckets; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.buckets (
    id text NOT NULL,
    name text NOT NULL,
    owner uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    public boolean DEFAULT false,
    avif_autodetection boolean DEFAULT false,
    file_size_limit bigint,
    allowed_mime_types text[],
    owner_id text,
    type storage.buckettype DEFAULT 'STANDARD'::storage.buckettype NOT NULL,
    versioning_status text DEFAULT 'DISABLED'::text NOT NULL,
    lifecycle_configuration jsonb,
    lifecycle_configuration_generation uuid,
    CONSTRAINT buckets_lifecycle_configuration_pair_check CHECK (((lifecycle_configuration IS NULL) = (lifecycle_configuration_generation IS NULL))),
    CONSTRAINT buckets_lifecycle_configuration_shape_check CHECK (((lifecycle_configuration IS NULL) OR ((jsonb_typeof(lifecycle_configuration) = 'object'::text) AND (lifecycle_configuration ? 'rules'::text) AND
CASE
    WHEN (jsonb_typeof((lifecycle_configuration -> 'rules'::text)) = 'array'::text) THEN ((jsonb_array_length((lifecycle_configuration -> 'rules'::text)) >= 1) AND (jsonb_array_length((lifecycle_configuration -> 'rules'::text)) <= 1000))
    ELSE false
END))),
    CONSTRAINT buckets_lifecycle_configuration_standard_only_check CHECK (((type = 'STANDARD'::storage.buckettype) OR ((lifecycle_configuration IS NULL) AND (lifecycle_configuration_generation IS NULL)))),
    CONSTRAINT buckets_versioning_dark_check CHECK ((versioning_status = 'DISABLED'::text)),
    CONSTRAINT buckets_versioning_standard_only_check CHECK (((type = 'STANDARD'::storage.buckettype) OR (versioning_status = 'DISABLED'::text))),
    CONSTRAINT buckets_versioning_status_check CHECK ((versioning_status = ANY (ARRAY['DISABLED'::text, 'ENABLED'::text, 'SUSPENDED'::text])))
);


--
-- Name: COLUMN buckets.owner; Type: COMMENT; Schema: storage; Owner: -
--

COMMENT ON COLUMN storage.buckets.owner IS 'Field is deprecated, use owner_id instead';


--
-- Name: buckets_analytics; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.buckets_analytics (
    name text NOT NULL,
    type storage.buckettype DEFAULT 'ANALYTICS'::storage.buckettype NOT NULL,
    format text DEFAULT 'ICEBERG'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: buckets_vectors; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.buckets_vectors (
    id text NOT NULL,
    type storage.buckettype DEFAULT 'VECTOR'::storage.buckettype NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: migrations; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.migrations (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    hash character varying(40) NOT NULL,
    executed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: objects; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.objects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bucket_id text,
    name text,
    owner uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    last_accessed_at timestamp with time zone DEFAULT now(),
    metadata jsonb,
    path_tokens text[] GENERATED ALWAYS AS (string_to_array(name, '/'::text)) STORED,
    version text,
    owner_id text,
    user_metadata jsonb,
    archived_at timestamp with time zone,
    is_delete_marker boolean DEFAULT false NOT NULL,
    is_versioned boolean DEFAULT false NOT NULL
);


--
-- Name: COLUMN objects.owner; Type: COMMENT; Schema: storage; Owner: -
--

COMMENT ON COLUMN storage.objects.owner IS 'Field is deprecated, use owner_id instead';


--
-- Name: s3_multipart_uploads; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.s3_multipart_uploads (
    id text NOT NULL,
    in_progress_size bigint DEFAULT 0 NOT NULL,
    upload_signature text NOT NULL,
    bucket_id text NOT NULL,
    key text NOT NULL COLLATE pg_catalog."C",
    version text NOT NULL,
    owner_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_metadata jsonb,
    metadata jsonb
);


--
-- Name: s3_multipart_uploads_parts; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.s3_multipart_uploads_parts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    upload_id text NOT NULL,
    size bigint DEFAULT 0 NOT NULL,
    part_number integer NOT NULL,
    bucket_id text NOT NULL,
    key text NOT NULL COLLATE pg_catalog."C",
    etag text NOT NULL,
    owner_id text,
    version text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: vector_indexes; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.vector_indexes (
    id text DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL COLLATE pg_catalog."C",
    bucket_id text NOT NULL,
    data_type text NOT NULL,
    dimension integer NOT NULL,
    distance_metric text NOT NULL,
    metadata_configuration jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: refresh_tokens id; Type: DEFAULT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens ALTER COLUMN id SET DEFAULT nextval('auth.refresh_tokens_id_seq'::regclass);


--
-- Data for Name: audit_log_entries; Type: TABLE DATA; Schema: auth; Owner: -
--

COPY auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) FROM stdin;
\.


--
-- Data for Name: custom_oauth_providers; Type: TABLE DATA; Schema: auth; Owner: -
--

COPY auth.custom_oauth_providers (id, provider_type, identifier, name, client_id, client_secret, acceptable_client_ids, scopes, pkce_enabled, attribute_mapping, authorization_params, enabled, email_optional, issuer, discovery_url, skip_nonce_check, cached_discovery, discovery_cached_at, authorization_url, token_url, userinfo_url, jwks_uri, created_at, updated_at, custom_claims_allowlist) FROM stdin;
\.


--
-- Data for Name: flow_state; Type: TABLE DATA; Schema: auth; Owner: -
--

COPY auth.flow_state (id, user_id, auth_code, code_challenge_method, code_challenge, provider_type, provider_access_token, provider_refresh_token, created_at, updated_at, authentication_method, auth_code_issued_at, invite_token, referrer, oauth_client_state_id, linking_target_id, email_optional) FROM stdin;
\.


--
-- Data for Name: identities; Type: TABLE DATA; Schema: auth; Owner: -
--

COPY auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, id) FROM stdin;
\.


--
-- Data for Name: instances; Type: TABLE DATA; Schema: auth; Owner: -
--

COPY auth.instances (id, uuid, raw_base_config, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: mfa_amr_claims; Type: TABLE DATA; Schema: auth; Owner: -
--

COPY auth.mfa_amr_claims (session_id, created_at, updated_at, authentication_method, id) FROM stdin;
\.


--
-- Data for Name: mfa_challenges; Type: TABLE DATA; Schema: auth; Owner: -
--

COPY auth.mfa_challenges (id, factor_id, created_at, verified_at, ip_address, otp_code, web_authn_session_data) FROM stdin;
\.


--
-- Data for Name: mfa_factors; Type: TABLE DATA; Schema: auth; Owner: -
--

COPY auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret, phone, last_challenged_at, web_authn_credential, web_authn_aaguid, last_webauthn_challenge_data) FROM stdin;
\.


--
-- Data for Name: mfa_recovery_code_sets; Type: TABLE DATA; Schema: auth; Owner: -
--

COPY auth.mfa_recovery_code_sets (id, user_id, mfa_factor_id, failed_verification_count, verification_locked_until, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: mfa_recovery_codes; Type: TABLE DATA; Schema: auth; Owner: -
--

COPY auth.mfa_recovery_codes (id, mfa_recovery_code_set_id, code_hash, consumed_at, created_at) FROM stdin;
\.


--
-- Data for Name: oauth_authorizations; Type: TABLE DATA; Schema: auth; Owner: -
--

COPY auth.oauth_authorizations (id, authorization_id, client_id, user_id, redirect_uri, scope, state, resource, code_challenge, code_challenge_method, response_type, status, authorization_code, created_at, expires_at, approved_at, nonce) FROM stdin;
\.


--
-- Data for Name: oauth_client_states; Type: TABLE DATA; Schema: auth; Owner: -
--

COPY auth.oauth_client_states (id, provider_type, code_verifier, created_at) FROM stdin;
\.


--
-- Data for Name: oauth_clients; Type: TABLE DATA; Schema: auth; Owner: -
--

COPY auth.oauth_clients (id, client_secret_hash, registration_type, redirect_uris, grant_types, client_name, client_uri, logo_uri, created_at, updated_at, deleted_at, client_type, token_endpoint_auth_method) FROM stdin;
\.


--
-- Data for Name: oauth_consents; Type: TABLE DATA; Schema: auth; Owner: -
--

COPY auth.oauth_consents (id, user_id, client_id, scopes, granted_at, revoked_at) FROM stdin;
\.


--
-- Data for Name: one_time_tokens; Type: TABLE DATA; Schema: auth; Owner: -
--

COPY auth.one_time_tokens (id, user_id, token_type, token_hash, relates_to, created_at, updated_at, expires_at) FROM stdin;
\.


--
-- Data for Name: refresh_tokens; Type: TABLE DATA; Schema: auth; Owner: -
--

COPY auth.refresh_tokens (instance_id, id, token, user_id, revoked, created_at, updated_at, parent, session_id) FROM stdin;
\.


--
-- Data for Name: saml_providers; Type: TABLE DATA; Schema: auth; Owner: -
--

COPY auth.saml_providers (id, sso_provider_id, entity_id, metadata_xml, metadata_url, attribute_mapping, created_at, updated_at, name_id_format) FROM stdin;
\.


--
-- Data for Name: saml_relay_states; Type: TABLE DATA; Schema: auth; Owner: -
--

COPY auth.saml_relay_states (id, sso_provider_id, request_id, for_email, redirect_to, created_at, updated_at, flow_state_id) FROM stdin;
\.


--
-- Data for Name: schema_migrations; Type: TABLE DATA; Schema: auth; Owner: -
--

COPY auth.schema_migrations (version) FROM stdin;
20171026211738
20171026211808
20171026211834
20180103212743
20180108183307
20180119214651
20180125194653
00
20210710035447
20210722035447
20210730183235
20210909172000
20210927181326
20211122151130
20211124214934
20211202183645
20220114185221
20220114185340
20220224000811
20220323170000
20220429102000
20220531120530
20220614074223
20220811173540
20221003041349
20221003041400
20221011041400
20221020193600
20221021073300
20221021082433
20221027105023
20221114143122
20221114143410
20221125140132
20221208132122
20221215195500
20221215195800
20221215195900
20230116124310
20230116124412
20230131181311
20230322519590
20230402418590
20230411005111
20230508135423
20230523124323
20230818113222
20230914180801
20231027141322
20231114161723
20231117164230
20240115144230
20240214120130
20240306115329
20240314092811
20240427152123
20240612123726
20240729123726
20240802193726
20240806073726
20241009103726
20250717082212
20250731150234
20250804100000
20250901200500
20250903112500
20250904133000
20250925093508
20251007112900
20251104100000
20251111201300
20251201000000
20260115000000
20260121000000
20260219120000
20260302000000
20260625000000
20260821000000
20260821010000
20260824000000
20260824000001
20260831180000
\.


--
-- Data for Name: scim_tokens; Type: TABLE DATA; Schema: auth; Owner: -
--

COPY auth.scim_tokens (id, sso_provider_id, token_hash, prefix, created_at, expires_at, revoked_at, last_used_at) FROM stdin;
\.


--
-- Data for Name: scim_users; Type: TABLE DATA; Schema: auth; Owner: -
--

COPY auth.scim_users (id, sso_provider_id, user_id, resource, created_at, updated_at, deleted_at) FROM stdin;
\.


--
-- Data for Name: sessions; Type: TABLE DATA; Schema: auth; Owner: -
--

COPY auth.sessions (id, user_id, created_at, updated_at, factor_id, aal, not_after, refreshed_at, user_agent, ip, tag, oauth_client_id, refresh_token_hmac_key, refresh_token_counter, scopes) FROM stdin;
\.


--
-- Data for Name: sso_domains; Type: TABLE DATA; Schema: auth; Owner: -
--

COPY auth.sso_domains (id, sso_provider_id, domain, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: sso_providers; Type: TABLE DATA; Schema: auth; Owner: -
--

COPY auth.sso_providers (id, resource_id, created_at, updated_at, disabled) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: auth; Owner: -
--

COPY auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, invited_at, confirmation_token, confirmation_sent_at, recovery_token, recovery_sent_at, email_change_token_new, email_change, email_change_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, phone, phone_confirmed_at, phone_change, phone_change_token, phone_change_sent_at, email_change_token_current, email_change_confirm_status, banned_until, reauthentication_token, reauthentication_sent_at, is_sso_user, deleted_at, is_anonymous) FROM stdin;
\.


--
-- Data for Name: webauthn_challenges; Type: TABLE DATA; Schema: auth; Owner: -
--

COPY auth.webauthn_challenges (id, user_id, challenge_type, session_data, created_at, expires_at) FROM stdin;
\.


--
-- Data for Name: webauthn_credentials; Type: TABLE DATA; Schema: auth; Owner: -
--

COPY auth.webauthn_credentials (id, user_id, credential_id, public_key, attestation_type, aaguid, sign_count, transports, backup_eligible, backed_up, friendly_name, created_at, updated_at, last_used_at) FROM stdin;
\.


--
-- Data for Name: acessos; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.acessos ("loginId", "empresaId", email, senha, status, "ultimoAcesso", "dataCriacao", data_atualizacao, perfil, "nomeFamilia") FROM stdin;
5694317f-0465-4d07-a99c-2bb0e0a3073c	c9287e4b-399d-4764-8bff-2e0ce7058dcb	display@buffetadv.com	MTIzNDU2	active	2026-10-05 11:29:41.017007-03	2026-10-05 11:29:22.146688-03	2026-10-05 11:29:22.146688-03	display	\N
b5782399-a62a-44f1-9c72-eac13038799c	c9287e4b-399d-4764-8bff-2e0ce7058dcb	familia@gmail.com	MTIzNDU2	inactive	2026-07-28 10:28:51.388423-03	2026-07-28 10:28:39.650261-03	2026-08-17 14:35:17.580619-03	family	\N
b4e1423e-c1b2-4889-8492-3712d383e382	c9287e4b-399d-4764-8bff-2e0ce7058dcb	alissonbr158@gmail.com	VHJvcGExNDdA	inactive	2026-07-28 13:55:51.351766-03	2026-07-28 13:53:33.17828-03	2026-08-17 14:35:20.873516-03	family	Walisson
933bede9-f92a-47bc-b097-53f5c2284d96	c9287e4b-399d-4764-8bff-2e0ce7058dcb	mikael@gmail.com	MTIzNDU2	inactive	2026-07-28 14:00:03.148601-03	2026-07-28 13:59:29.165436-03	2026-08-17 14:35:23.021981-03	family	Mikaek
b9761ed2-a9d8-4544-a636-acb135fb2df2	c9287e4b-399d-4764-8bff-2e0ce7058dcb	telao@gmail.com	MTIzNDU2	inactive	2026-10-05 09:45:02.781346-03	2026-07-16 10:36:12.93-03	2026-10-05 11:30:00.012109-03	display	\N
554533a9-a324-42ee-8b30-21818c666ed7	c9287e4b-399d-4764-8bff-2e0ce7058dcb	mikael.freitas@advantag.com.br	dGVzdGUxMjM=	active	2026-09-29 10:21:44.822604-03	2026-09-29 10:18:52.481887-03	2026-09-29 10:19:16.701087-03	family	Mikael
86fc3d17-3592-4c10-adb5-7e92a8ed0c21	c9287e4b-399d-4764-8bff-2e0ce7058dcb	dalton@abgc.com.br	MTIzNDU2	active	2026-10-03 18:38:32.248508-03	2026-09-01 11:50:26.214716-03	2026-10-02 16:57:12.7912-03	family	Dalton
eb308270-a0ea-46d5-a252-ad4847957d92	c9287e4b-399d-4764-8bff-2e0ce7058dcb	alissoneu9@gmail.com	MTIzNDU2	active	2026-10-03 18:38:55.96965-03	2026-10-02 12:19:49.420981-03	2026-10-02 16:58:13.486644-03	family	Walisson
313ba6f8-cfb2-43ad-9da8-f93c9500ccf0	01afb92b-5ad2-4823-8341-d9f821d210db	walisson@gmail.com	MTIzNDU2	active	\N	2026-09-22 10:38:52.087708-03	2026-09-22 10:38:52.087708-03	family	walisson
cf62d6f3-ddfe-4985-a9e8-5f733abe0bfd	c9287e4b-399d-4764-8bff-2e0ce7058dcb	rodrigo@teste.com	MTIzNDU2	inactive	\N	2026-09-25 15:36:52.050145-03	2026-09-29 16:55:40.278701-03	family	Rodrigo
f382c9d4-9c90-4369-baac-8feb8b5316c3	c9287e4b-399d-4764-8bff-2e0ce7058dcb	recpcao@gmail.com	MTIzNDU2	active	2026-10-05 08:26:00.562611-03	2026-07-16 07:27:26.647-03	2026-07-16 07:27:26.647-03	reception	\N
b86f2f81-c54c-4618-a3eb-913c35fbc099	c9287e4b-399d-4764-8bff-2e0ce7058dcb	walisson.almeida@advantag.com.br	MTIzNDU2	active	\N	2026-09-22 14:19:08.76361-03	2026-09-22 14:23:52.001812-03	family	walisson
218e9825-52fe-410d-9f0b-830bba985938	c9287e4b-399d-4764-8bff-2e0ce7058dcb	testetes@gmail.com	MTIzNDU2	active	\N	2026-09-22 14:32:29.752411-03	2026-09-22 15:45:58.356846-03	family	teste
cfa31060-233f-4ef8-9e82-635f4ad92fb4	c9287e4b-399d-4764-8bff-2e0ce7058dcb	recreacionista@gmail.com	MTIzNDU2	active	2026-10-05 09:43:10.634079-03	2026-07-16 08:30:47.673-03	2026-07-16 08:30:47.673-03	game_master	\N
c7234ca6-a5c5-403a-9528-45d964859785	c9287e4b-399d-4764-8bff-2e0ce7058dcb	testetest@gmail.com	MTIzNDU2	active	\N	2026-09-22 14:35:15.213905-03	2026-09-22 15:46:02.240964-03	family	testess
4ddf6bfd-072a-4bbe-b76a-d1681b0d2d13	c9287e4b-399d-4764-8bff-2e0ce7058dcb	guilherme1@gmail.com	MTIzNDU2	active	2026-09-22 15:46:27.316555-03	2026-09-22 15:45:39.536491-03	2026-09-22 15:45:59.835653-03	family	gui
d88ce8f9-5e2a-4419-8d2a-d960135538a0	c9287e4b-399d-4764-8bff-2e0ce7058dcb	daltonkm@yahoo.com.br	MTIzNDU2	active	2026-09-29 17:07:59.135837-03	2026-09-29 17:07:22.509365-03	2026-09-29 17:18:37.292153-03	family	Dalton Miyazato
3a4410d1-9071-417f-a3f1-1a9c12f7b23f	c9287e4b-399d-4764-8bff-2e0ce7058dcb	atendimento@gmail.com	MTIzNDU2	active	2026-10-05 10:13:35.253706-03	2026-08-18 10:10:22.252465-03	2026-08-18 10:10:22.252465-03	kiosk	\N
0f1a7f02-9427-472f-86b9-0e56a84bbb35	c9287e4b-399d-4764-8bff-2e0ce7058dcb	testetessst@gmail.com	MTIzNDU2	active	\N	2026-09-29 17:20:12.660603-03	2026-09-29 17:20:12.660603-03	family	Walisson Almeida
83c8893e-32d6-4e8e-a1c0-78be3943175b	61bc768f-c5c0-45c3-9696-f551c4b6ebce	master@pulyn.com.br	bWFzdGVyMTIzNDU2	active	2026-10-05 14:24:51.991971-03	2026-07-15 12:19:36.35-03	2026-07-15 12:19:36.35-03	master	\N
a54ed528-2662-4935-ac83-e5973f5b295b	c9287e4b-399d-4764-8bff-2e0ce7058dcb	teste@gmail.com	MTIzNDU2	active	2026-10-05 15:22:12.743443-03	2026-07-15 12:31:54.11-03	2026-07-15 12:31:54.11-03	admin	\N
dc807d1f-448c-4d16-8207-328f2acff028	c9287e4b-399d-4764-8bff-2e0ce7058dcb	pontuacao@gmail.com	MTIzNDU2	active	2026-10-06 09:31:47.516234-03	2026-08-19 11:10:56.683112-03	2026-08-19 11:10:56.683112-03	score_kiosk	\N
\.


--
-- Data for Name: bonusVencedorJogo; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."bonusVencedorJogo" (id, empresa_id, evento_id, partida_id, game_type, time_id, points_per_member, members_awarded, created_at) FROM stdin;
7c0f3028-e53b-4764-8a9e-1ffd3f847077	c9287e4b-399d-4764-8bff-2e0ce7058dcb	c920334b-c141-47ea-a791-dd2c9828be58	b52f378d-3a6d-4f43-a5cd-be8b011437d8	treasure_hunt	697df292-ec0f-40e5-97d5-1c77c6e539ff	200	1	2026-10-05 13:54:15.212085-03
\.


--
-- Data for Name: brincadeiras; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.brincadeiras ("brincadeiraId", nome, descricao, regras, tipo, duracao, status, "pontosPadrao", "criadoEm", "empresaId", "tipoJogo", checkpoints, "eventoId") FROM stdin;
f9de27d6-278c-4a9b-8056-2c158c066951	Caça ao monstro	Cada equipe tem o seu próprio monstro de 500 de vida. Percorra os checkpoints atacando o monstro da sua equipe e derrote-o antes das outras.	1- Cada equipe tem um monstro com 500 HP. Todas as equipes jogam ao mesmo tempo.\r\n2- Cada leitura em um checkpoint do jogo é um ataque: 10 de dano em checkpoint normal e 30 no checkpoint especial (marcado pelo administrador ou sorteado).\r\n3- Ataque especial: quando o último integrante da equipe que ainda não tinha atacado faz o seu primeiro ataque, o dano é de 50.\r\n4- Depois de uma leitura, aquele checkpoint fica bloqueado para a sua equipe por um tempo de recarga (de 1 a 120 segundos, padrão de 15).\r\n5- Quando o HP chega a zero, o monstro é derrotado e a equipe vence. O jogo acaba quando todos os monstros forem derrotados ou o tempo se esgotar.\r\n6- Os membros da equipe vencedora ganham 200 pontos ao final.\r\n	monster_hunt	28	\N	\N	2026-08-11 16:43:31.276768-03	c9287e4b-399d-4764-8bff-2e0ce7058dcb	standard	[]	4695594c-19e9-493f-86a9-dfe79941400e
6da6e7f8-0358-41e4-8dcd-253df10242bf	ZONA - INDIVIDUAL	Cada participante joga por si. Conquiste checkpoints com a pulseira, acumule pontos e mantenha o seu nome e a sua cor no mapa. Quem tiver mais pontos no fim do tempo lidera o ranking.	1- Não há equipes: cada participante disputa por conta própria, e o telão mostra o nome e a cor de quem domina cada checkpoint.\r\n2- Cada leitura vale 10 pontos, com bônus progressivo: a cada 10 checkpoints lidos, cada nova leitura passa a valer 1 ponto a mais (11, 12, 13...).\r\n3- Ao ler um checkpoint, ele passa a ser seu, mesmo que fosse de outro participante.\r\n4- Para reler o mesmo checkpoint, você precisa antes ler 3 checkpoints diferentes.\r\n5- O domínio de um checkpoint não expira: ele só muda de dono quando outro participante o lê, e é zerado no fim do jogo.\r\n6- Uma zona só é dominada quando todos os seus checkpoints são do mesmo participante. Caso contrário, fica "em disputa".\r\n7- O ranking é por pontos totais. Os pontos ficam salvos ao final.	individual	10	active	\N	2026-08-24 15:14:44.893439-03	c9287e4b-399d-4764-8bff-2e0ce7058dcb	standard	[]	9ba04dda-8cd4-4d44-a37b-3042a0b8519a
b58b6207-7348-40fe-b7fc-432212d08534	CAÇA AO TESOURO	Uma corrida contra o relógio entre equipes. Uma equipe de cada vez precisa "acender" todos os checkpoints do jogo, sempre lendo o checkpoint-alvo indicado. A equipe mais rápida vence.	1- São necessárias pelo menos 2 equipes com participantes. Só entram os checkpoints online configurados no jogo.\r\n2- As equipes jogam uma por vez. A primeira é sorteada, e cada vez começa após 10 segundos de preparação. O cronômetro de cada equipe começa quando a sua vez é liberada.\r\n3- Em cada etapa existe um checkpoint-alvo sorteado. Só ele conta, e só a equipe da vez pode lê-lo.\r\n4- Todos os integrantes da equipe precisam ler o alvo, e cada criança conta uma vez por etapa. Quando o último lê, o checkpoint fica com a cor da equipe e um novo alvo é sorteado.\r\n5- A equipe termina quando domina todos os checkpoints do jogo. A vez passa para a próxima equipe que ainda não terminou, e o mapa é limpo para ela recomeçar.\r\n6- O jogo acaba quando todas as equipes terminam. Vence a equipe com o menor tempo. Se o tempo configurado do jogo se esgotar antes, o jogo é encerrado automaticamente.\r\n7- Os membros da equipe vencedora ganham 200 pontos ao final.	treasure_hunt	18	\N	\N	2026-07-22 08:46:32.493-03	c9287e4b-399d-4764-8bff-2e0ce7058dcb	standard	[]	4695594c-19e9-493f-86a9-dfe79941400e
a456cd5f-cfc3-4e93-96c2-4232578f9ea2	ZONA - EQUIPE	As equipes disputam os checkpoints espalhados pelo espaço. Encoste a pulseira em um checkpoint para conquistá-lo para a sua equipe e ganhar pontos. Quando uma equipe domina todos os checkpoints de uma zona, a zona inteira fica com a cor dela. Vence a equipe com mais pontos quando o tempo acabar.	1- Todas as equipes jogam ao mesmo tempo, sem fila nem turnos. Qualquer checkpoint online pode ser lido a qualquer momento.\r\n2- Cada leitura vale 10 pontos para o participante e para a equipe.\r\n3- Ao ler um checkpoint, ele passa a ser da sua equipe, mesmo que estivesse com outra.\r\n4- Você não pode reler um checkpoint que você mesmo já domina. Ele só libera quando outra equipe o conquistar, ou depois de 1m30s sem nenhuma leitura, quando volta a ficar livre para todos.\r\n5- Uma zona só é dominada quando todos os checkpoints dentro dela pertencem à mesma equipe. Se estiverem misturados ou algum estiver livre, a zona fica "em disputa".\r\n6- O jogo termina quando o tempo configurado acaba ou o recreador encerra. Os pontos ficam salvos e os domínios são zerados.\r\n7- É preciso estar com a pulseira ativa, vinculada à sua conta e ao evento, e pertencer a uma equipe.	team	15	\N	\N	2026-08-24 15:15:31.920441-03	c9287e4b-399d-4764-8bff-2e0ce7058dcb	standard	[]	9ba04dda-8cd4-4d44-a37b-3042a0b8519a
\.


--
-- Data for Name: cacaTesourPartidas; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."cacaTesourPartidas" ("partidaId", "eventoId", "brincadeiraId", status, "numeroRonda", "checkpointAlvoId", "checkpointsCompletadosIds", "iniciadoEm", "rondaIniciadaEm", "finalizadoEm", "timeInicialId", "timeVezId", "vezDisponvelEm") FROM stdin;
a122de43-4936-4303-bea6-720596fa299a	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	completed	2	\N	[]	2026-09-15 16:45:08.694-03	2026-09-15 16:50:12.368-03	2026-09-15 16:50:53.422-03	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N
ab9648cc-ccdb-42d1-9da6-f6f076368fd2	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	1	\N	[]	2026-09-16 08:17:04.367-03	2026-09-16 08:17:14.367-03	2026-09-16 08:26:48.770859-03	a8238112-f78c-4a80-95d3-4d18336f1318	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-16 08:17:14.367-03
1f10f31f-ec24-49f8-baa6-841c816bf170	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	2	\N	[]	2026-09-21 11:35:34.863-03	2026-09-21 11:35:50.898-03	2026-09-21 11:36:23.748654-03	3218d5b4-372e-424e-9d91-dedea2b741f3	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-21 11:35:50.898-03
7c9e99b9-8192-4983-ab9e-2fc0c84cac52	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	completed	6	\N	[]	2026-09-18 14:35:33.775-03	2026-09-18 14:38:22.698-03	2026-09-18 14:38:29.776-03	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N
17f81928-0042-4527-834d-f7a7ea9b3c3c	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	completed	8	\N	[]	2026-09-03 13:47:35.374-03	2026-09-03 13:50:05.86-03	2026-09-03 13:50:16.806-03	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N
f86e45a6-5d40-47f7-b1b8-6348cba7e212	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	1	\N	[]	2026-08-31 11:37:59.169-03	2026-08-31 11:38:09.169-03	2026-08-31 11:38:14.365167-03	3218d5b4-372e-424e-9d91-dedea2b741f3	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-08-31 11:38:09.169-03
21ea8f11-b6e8-44e3-a87e-bc03783d612f	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	completed	4	\N	[]	2026-09-23 12:21:12.966-03	2026-09-23 12:23:17.024-03	2026-09-23 12:23:27.87-03	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N
04b8bb88-f60a-4258-9fbc-81dff4fefca1	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	completed	6	\N	[]	2026-09-03 13:35:34.138-03	2026-09-03 13:36:45.955-03	2026-09-03 13:36:54.937-03	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N
7b0745d9-ae7f-48fa-9999-9abbd858d205	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	1	\N	[]	2026-09-18 10:01:13.087-03	2026-09-18 10:01:23.087-03	2026-09-18 10:01:26.000984-03	3218d5b4-372e-424e-9d91-dedea2b741f3	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-18 10:01:23.087-03
1c46d8c6-1c4c-401c-a739-805afd207eca	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	2	\N	[]	2026-09-25 10:27:59.628-03	2026-09-25 10:28:15.221-03	2026-09-25 10:28:19.317437-03	a8238112-f78c-4a80-95d3-4d18336f1318	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-25 10:28:15.221-03
0bb4b716-98fd-490b-bb1f-fb4a300d2ee1	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	1	\N	[]	2026-09-23 16:12:35.065-03	2026-09-23 16:12:45.065-03	2026-09-23 16:16:25.230788-03	3218d5b4-372e-424e-9d91-dedea2b741f3	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-23 16:12:45.065-03
c6827569-553a-4829-8dd1-080e750a2960	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	completed	3	\N	[]	2026-08-28 15:42:54.606-03	2026-08-28 15:44:54.844-03	2026-08-28 15:45:20.725-03	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N
fd39ae64-b906-40bd-9a3d-44299fbd95da	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	1	\N	[]	2026-08-28 16:36:25.073-03	2026-08-28 16:36:35.073-03	2026-08-28 16:37:30.522448-03	3218d5b4-372e-424e-9d91-dedea2b741f3	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-08-28 16:36:35.073-03
f4adf239-3eef-4d97-bacb-8e1f0310714e	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	completed	2	\N	[]	2026-09-02 10:54:15.192-03	2026-09-02 10:54:33.657-03	2026-09-02 10:54:48.418-03	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N
08cce837-1026-42f4-8913-fa8cf50b14b9	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	1	\N	[]	2026-09-17 16:22:46.728-03	2026-09-17 16:22:56.728-03	2026-09-17 16:22:51.697436-03	a8238112-f78c-4a80-95d3-4d18336f1318	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-17 16:22:56.728-03
37dd3e56-55ba-4293-b560-d45c8d867705	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	completed	2	\N	[]	2026-09-02 11:10:33.942-03	2026-09-02 11:11:00.52-03	2026-09-02 11:11:14.724-03	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N
ad9ae259-9cb1-48c3-8cf6-fbb5f36b7b3e	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	1	\N	[]	2026-09-18 10:21:40.004-03	2026-09-18 10:21:50.004-03	2026-09-18 10:23:16.193123-03	3218d5b4-372e-424e-9d91-dedea2b741f3	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-18 10:21:50.004-03
9f19ad78-82e9-49e7-8ec7-b8aa78b38f6d	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	completed	2	\N	[]	2026-09-16 11:21:04.484-03	2026-09-16 11:22:37.655-03	2026-09-16 11:22:52.601-03	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N
04d1ce30-644e-4a85-ae5e-25cfe34a4406	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	1	\N	[]	2026-09-16 10:21:35.845-03	2026-09-16 10:21:45.845-03	2026-09-16 10:21:51.387353-03	3218d5b4-372e-424e-9d91-dedea2b741f3	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-16 10:21:45.845-03
0f678e10-5fcb-415c-8b9b-eab192cf4ed5	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	completed	2	\N	[]	2026-09-16 11:23:18.176-03	2026-09-16 11:23:32.412-03	2026-09-16 11:23:47.932-03	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N
e43f8055-f804-4daa-ae36-fcd6e2ce3db1	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	1	\N	[]	2026-09-25 11:44:26.152-03	2026-09-25 11:44:36.152-03	2026-09-25 11:44:58.257102-03	a8238112-f78c-4a80-95d3-4d18336f1318	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-25 11:44:36.152-03
0d77cb23-da2b-4f56-9a87-f84a9eef3387	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	1	\N	[]	2026-09-18 10:10:41.616-03	2026-09-18 10:10:51.616-03	2026-09-18 10:18:22.926389-03	3218d5b4-372e-424e-9d91-dedea2b741f3	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-18 10:10:51.616-03
4c7bd6a3-da58-4efd-b409-adfbe13baa7b	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	completed	2	\N	[]	2026-09-23 13:36:34.563-03	2026-09-23 13:36:53.776-03	2026-09-23 13:38:42.36-03	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N
1a07be1b-3cc6-4ae8-bce6-7c168ea5d09a	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	1	\N	[]	2026-09-23 17:00:35.233-03	2026-09-23 17:00:45.233-03	2026-09-23 17:16:37.621155-03	3218d5b4-372e-424e-9d91-dedea2b741f3	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-23 17:00:45.233-03
a3893b99-24ce-4c41-ac3b-7f22102b2155	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	completed	6	\N	[]	2026-09-03 13:42:12.351-03	2026-09-03 13:43:34.828-03	2026-09-03 13:43:40.251-03	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N
0174e8a0-769f-4ab3-880f-32ba3a73c06c	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	1	\N	[]	2026-09-18 10:35:43.424-03	2026-09-18 10:35:53.424-03	2026-09-18 10:35:49.471797-03	3218d5b4-372e-424e-9d91-dedea2b741f3	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-18 10:35:53.424-03
3be2fcf7-68bf-4c0b-b070-ebd7715a8eb1	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	1	\N	[]	2026-09-21 13:40:59.458-03	2026-09-21 13:41:09.458-03	2026-09-21 13:41:08.328212-03	a8238112-f78c-4a80-95d3-4d18336f1318	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-21 13:41:09.458-03
8734d474-9b3d-4816-9bcf-3fe779b21e6e	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	completed	6	\N	[]	2026-09-18 16:35:14.287-03	2026-09-18 16:36:15.437-03	2026-09-18 16:36:22.824-03	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N
6636fd7c-0723-4bf0-8186-5b93f74d68e3	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	1	\N	[]	2026-08-28 16:37:39.237-03	2026-08-28 16:37:49.237-03	2026-08-28 16:41:35.487537-03	a8238112-f78c-4a80-95d3-4d18336f1318	a8238112-f78c-4a80-95d3-4d18336f1318	2026-08-28 16:37:49.237-03
2e184515-3724-4c4f-b07f-8e6e175c2bcd	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	1	\N	[]	2026-08-31 11:38:42.143-03	2026-08-31 11:38:52.143-03	2026-08-31 11:38:57.569304-03	3218d5b4-372e-424e-9d91-dedea2b741f3	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-08-31 11:38:52.143-03
f2391ba4-61bb-442c-8a18-98d227c20b86	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	1	\N	[]	2026-09-18 10:23:40.341-03	2026-09-18 10:23:50.341-03	2026-09-18 10:33:04.942161-03	3218d5b4-372e-424e-9d91-dedea2b741f3	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-18 10:23:50.341-03
8fda78da-97bf-4925-93b7-144ef71a2ec6	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	1	\N	[]	2026-09-18 16:32:52.873-03	2026-09-18 16:33:02.873-03	2026-09-18 16:33:00.548117-03	a8238112-f78c-4a80-95d3-4d18336f1318	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-18 16:33:02.873-03
42181ca8-766c-4a05-a97d-57c456ac3101	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	1	\N	[]	2026-09-15 16:51:19.977-03	2026-09-15 16:51:29.977-03	2026-09-15 16:51:39.419061-03	3218d5b4-372e-424e-9d91-dedea2b741f3	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-15 16:51:29.977-03
e929c5f0-490f-4b83-a689-52892bc15763	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	1	\N	[]	2026-09-16 08:26:58.391-03	2026-09-16 08:27:08.391-03	2026-09-16 08:42:31.278083-03	a8238112-f78c-4a80-95d3-4d18336f1318	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-16 08:27:08.391-03
814bc1ff-b7b5-48d0-9f13-34eda1c7a3db	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	2	\N	[]	2026-09-16 08:43:35.773-03	2026-09-16 09:47:15.452-03	2026-09-16 10:10:43.392015-03	a8238112-f78c-4a80-95d3-4d18336f1318	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-16 09:47:25.452-03
1d13ca2d-12d1-4073-81fb-8c5d72402bab	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	completed	2	\N	[]	2026-09-02 11:11:23.059-03	2026-09-02 11:11:39.257-03	2026-09-02 11:11:53.484-03	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N
3471bc6c-391c-4f0e-8485-950411e0f139	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	1	\N	[]	2026-09-17 17:31:59.868-03	2026-09-17 17:32:09.868-03	2026-09-17 17:32:49.194771-03	3218d5b4-372e-424e-9d91-dedea2b741f3	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-17 17:32:09.868-03
c2e2be24-3782-42e0-b71f-a9962da5ae70	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	1	\N	[]	2026-09-25 11:44:08.339-03	2026-09-25 11:44:18.339-03	2026-09-25 11:44:21.73585-03	3218d5b4-372e-424e-9d91-dedea2b741f3	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-25 11:44:18.339-03
6ce44061-1f80-4a10-b4b5-1dd2dc4aa92e	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	4	\N	[]	2026-09-18 16:47:51.771-03	2026-09-18 16:48:33.482-03	2026-09-18 16:52:00.85787-03	3218d5b4-372e-424e-9d91-dedea2b741f3	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-18 16:48:43.482-03
a6563902-76b3-4b8d-a995-74cd6afb66ea	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	1	\N	[]	2026-09-03 17:27:08.341-03	2026-09-03 17:27:18.341-03	2026-09-03 17:39:46.16082-03	3218d5b4-372e-424e-9d91-dedea2b741f3	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-03 17:27:18.341-03
2d772826-0d32-42ab-95c7-90534038e5a2	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	completed	12	\N	[]	2026-08-28 17:35:54.173-03	2026-08-28 17:40:03.984-03	2026-08-28 17:40:12.375-03	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N
70ea1475-15d4-4cdd-a68c-e1590dfe55d6	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	1	\N	[]	2026-09-18 09:33:35.587-03	2026-09-18 09:33:45.587-03	2026-09-18 09:40:07.782486-03	a8238112-f78c-4a80-95d3-4d18336f1318	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-18 09:33:45.587-03
b9c2a905-f312-471b-98e5-7b66d90048a6	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	1	\N	[]	2026-09-22 17:18:37.213-03	2026-09-22 17:18:47.213-03	2026-09-22 17:18:54.523308-03	a8238112-f78c-4a80-95d3-4d18336f1318	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-22 17:18:47.213-03
fce702ce-51ff-46bf-936e-c3c505af4b82	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	1	\N	[]	2026-09-23 13:39:52.898-03	2026-09-23 13:40:02.898-03	2026-09-23 13:48:53.238061-03	3218d5b4-372e-424e-9d91-dedea2b741f3	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-23 13:40:02.898-03
fff1b1cf-1a58-42df-aed4-c40398c15f57	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	1	\N	[]	2026-09-23 13:48:56.235-03	2026-09-23 13:49:06.235-03	2026-09-23 15:29:02.940238-03	a8238112-f78c-4a80-95d3-4d18336f1318	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-23 13:49:06.235-03
5df2bdfe-ac0f-4a0e-ac0c-88bc37f6830a	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	1	\N	[]	2026-09-23 17:16:45.874-03	2026-09-23 17:16:55.874-03	2026-09-23 17:16:53.905043-03	3218d5b4-372e-424e-9d91-dedea2b741f3	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-23 17:16:55.874-03
6991cb74-0309-4a7a-812b-b4ab9a926b0b	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	2	\N	[]	2026-09-25 11:45:15.393-03	2026-09-25 11:45:36.362-03	2026-09-25 11:46:36.768754-03	3218d5b4-372e-424e-9d91-dedea2b741f3	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-25 11:45:36.362-03
ffb426c8-80f6-4a5f-a06e-7128ec34bd0b	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	1	\N	[]	2026-08-31 11:38:59.761-03	2026-08-31 11:39:09.761-03	2026-08-31 11:40:12.473359-03	a8238112-f78c-4a80-95d3-4d18336f1318	a8238112-f78c-4a80-95d3-4d18336f1318	2026-08-31 11:39:09.761-03
7e377d83-0d7c-41bf-87e9-b800725658ec	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	1	\N	[]	2026-09-15 17:00:50.165-03	2026-09-15 17:01:00.165-03	2026-09-15 17:04:10.860787-03	3218d5b4-372e-424e-9d91-dedea2b741f3	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-15 17:01:00.165-03
74502c0a-0d06-49a5-9164-ed3cddf4a81f	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	1	\N	[]	2026-09-16 10:11:17.192-03	2026-09-16 10:11:27.192-03	2026-09-16 10:13:33.456887-03	a8238112-f78c-4a80-95d3-4d18336f1318	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-16 10:11:27.192-03
974a8efa-94bd-4442-9e5a-dad880c89263	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	completed	2	\N	[]	2026-09-16 11:05:48.792-03	2026-09-16 11:06:08.394-03	2026-09-16 11:06:55.868-03	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N
b63b9089-87ce-4be1-8c59-55148b376307	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	1	\N	[]	2026-09-18 11:12:02.8-03	2026-09-18 11:12:12.8-03	2026-09-18 11:12:24.79688-03	a8238112-f78c-4a80-95d3-4d18336f1318	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-18 11:12:12.8-03
3338dc75-405b-4c62-b9c6-ff9ed8148ff8	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	completed	2	\N	[]	2026-09-16 11:24:04.931-03	2026-09-16 11:24:41.188-03	2026-09-16 11:24:58.26-03	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N
86a7d9fa-730e-49ec-a99d-277d05a36e49	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	1	\N	[]	2026-09-15 17:04:20.099-03	2026-09-15 17:04:30.099-03	2026-09-15 17:06:17.017727-03	3218d5b4-372e-424e-9d91-dedea2b741f3	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-15 17:04:30.099-03
22185a19-4ef7-4620-94ea-1ce9fd885b29	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	4	\N	[]	2026-08-31 08:53:49.336-03	2026-08-31 08:57:24.933-03	2026-08-31 08:57:32.082354-03	3218d5b4-372e-424e-9d91-dedea2b741f3	a8238112-f78c-4a80-95d3-4d18336f1318	2026-08-31 08:57:34.933-03
b3af38fd-d459-4e52-abed-1cb75d6dffc1	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	3	\N	[]	2026-09-18 17:19:56.123-03	2026-09-18 17:20:25.072-03	2026-09-18 17:36:52.847602-03	3218d5b4-372e-424e-9d91-dedea2b741f3	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-18 17:20:25.072-03
129f05c8-025e-4cc0-a0a2-cba45358e568	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	1	\N	[]	2026-09-23 11:32:14.644-03	2026-09-23 11:32:24.644-03	2026-09-23 11:32:21.770193-03	a8238112-f78c-4a80-95d3-4d18336f1318	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-23 11:32:24.644-03
fd5dc4f1-7342-4d51-9de6-49f371615d1a	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	1	\N	[]	2026-09-23 15:30:56.384-03	2026-09-23 15:31:06.384-03	2026-09-23 15:36:07.038701-03	a8238112-f78c-4a80-95d3-4d18336f1318	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-23 15:31:06.384-03
af7e20d0-04cb-4415-b79e-6e355edd69cd	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	completed	2	\N	[]	2026-09-23 17:17:30.015-03	2026-09-23 17:18:15.929-03	2026-09-23 17:29:31.028-03	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N
67ba47cb-8757-41e6-a885-8ea4b247a951	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	completed	8	\N	[]	2026-08-31 11:40:30.314-03	2026-08-31 11:41:54.87-03	2026-08-31 11:42:01.225-03	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N
7ea064f4-5172-41ba-9e64-c7dc606c7412	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	1	\N	[]	2026-09-15 17:06:26.967-03	2026-09-15 17:06:36.967-03	2026-09-15 17:07:27.129766-03	a8238112-f78c-4a80-95d3-4d18336f1318	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-15 17:06:36.967-03
a0daf023-76c0-4618-98b2-ca80a3425276	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	completed	4	\N	[]	2026-09-25 15:52:31.692-03	2026-09-25 15:53:59.242-03	2026-09-25 15:54:16.5-03	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N
7d8ce58e-cd35-4983-beaf-f6950982cb1c	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	1	\N	[]	2026-09-16 10:17:20.107-03	2026-09-16 10:17:30.107-03	2026-09-16 10:17:46.394044-03	a8238112-f78c-4a80-95d3-4d18336f1318	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-16 10:17:30.107-03
39ef45e3-0123-4c65-98e2-ebb81bd1f125	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	1	\N	[]	2026-09-16 16:41:47.944-03	2026-09-16 16:41:57.944-03	2026-09-16 16:42:07.038679-03	a8238112-f78c-4a80-95d3-4d18336f1318	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-16 16:41:57.944-03
594d824a-2796-4da8-906b-75f1cbc28cef	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	1	\N	[]	2026-09-18 13:33:54.117-03	2026-09-18 13:34:04.117-03	2026-09-18 13:38:15.024584-03	a8238112-f78c-4a80-95d3-4d18336f1318	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-18 13:34:04.117-03
2efcad1b-abc7-4077-b04f-5d1b8706ef5d	4695594c-19e9-493f-86a9-dfe79941400e	b58b6207-7348-40fe-b7fc-432212d08534	finished	1	\N	[]	2026-10-01 14:46:21.302-03	2026-10-01 14:46:31.302-03	2026-10-01 14:53:06.758807-03	aea6e59c-7626-4e57-964a-5bf49620b671	aea6e59c-7626-4e57-964a-5bf49620b671	2026-10-01 14:46:31.302-03
9e1b18d7-1231-41f7-b185-b7a3b563ca51	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	3	\N	[]	2026-08-31 08:13:23.9-03	2026-08-31 08:17:02.689-03	2026-08-31 08:19:41.740557-03	3218d5b4-372e-424e-9d91-dedea2b741f3	a8238112-f78c-4a80-95d3-4d18336f1318	2026-08-31 08:17:12.689-03
ec796731-deb3-4a97-a6c0-905f89aab0ed	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	6	\N	[]	2026-09-18 09:44:59.536-03	2026-09-18 09:46:22.955-03	2026-09-18 09:46:54.21073-03	a8238112-f78c-4a80-95d3-4d18336f1318	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-18 09:46:22.955-03
6e702d66-e2fe-4d38-aecd-c09723483dd6	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	1	\N	[]	2026-09-18 13:41:37.338-03	2026-09-18 13:41:47.338-03	2026-09-18 13:51:00.514491-03	a8238112-f78c-4a80-95d3-4d18336f1318	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-18 13:41:47.338-03
0937c6fe-b82a-4060-a46f-e681a5172216	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	completed	2	\N	[]	2026-09-10 13:11:32.605-03	2026-09-10 13:12:33.291-03	2026-09-10 13:13:02.485-03	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N
c1d04bd5-17f0-4e13-b5e0-06fab6adf33f	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	1	\N	[]	2026-09-16 10:18:11.856-03	2026-09-16 10:18:21.856-03	2026-09-16 10:18:28.985315-03	a8238112-f78c-4a80-95d3-4d18336f1318	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-16 10:18:21.856-03
5fddce13-dcd4-4663-9d86-63b7b6fc9a06	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	1	\N	[]	2026-09-16 10:25:58.103-03	2026-09-16 10:26:08.103-03	2026-09-16 10:27:04.885358-03	a8238112-f78c-4a80-95d3-4d18336f1318	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-16 10:26:08.103-03
02e56e35-4196-4bf9-bc49-8385d548b853	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	1	\N	[]	2026-09-29 09:00:46.326-03	2026-09-29 09:00:56.326-03	2026-09-29 09:00:52.379486-03	3218d5b4-372e-424e-9d91-dedea2b741f3	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-29 09:00:56.326-03
b524a314-cb8a-425d-9a95-788286d9f008	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	1	\N	[]	2026-09-18 13:59:26.609-03	2026-09-18 13:59:36.609-03	2026-09-18 14:10:50.52981-03	a8238112-f78c-4a80-95d3-4d18336f1318	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-18 13:59:36.609-03
6c88ab81-c0c2-45b1-886b-c4c862af9d83	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	completed	2	\N	[]	2026-09-23 15:57:39.888-03	2026-09-23 15:58:04.486-03	2026-09-23 15:58:18.718-03	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N
fca0605e-dfd5-4479-895e-1699b973711e	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	2	\N	[]	2026-09-23 16:45:35.449-03	2026-09-23 16:45:59.57-03	2026-09-23 17:00:29.422543-03	3218d5b4-372e-424e-9d91-dedea2b741f3	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-23 16:46:09.57-03
7cdfd7b4-70f4-44ff-9527-63cfdcbf3b52	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	completed	4	\N	[]	2026-09-23 11:32:38.146-03	2026-09-23 11:35:00.104-03	2026-09-23 11:35:12.077-03	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N
b52f378d-3a6d-4f43-a5cd-be8b011437d8	c920334b-c141-47ea-a791-dd2c9828be58	b58b6207-7348-40fe-b7fc-432212d08534	completed	8	\N	["12","15","10","14"]	2026-10-05 13:52:45.815-03	2026-10-05 13:54:06.38-03	2026-10-05 13:54:15.187-03	697df292-ec0f-40e5-97d5-1c77c6e539ff	\N	\N
dabd2c55-a42e-4cd5-a237-444d32d24e47	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	completed	6	\N	[]	2026-09-17 15:35:50.713-03	2026-09-17 15:37:06.626-03	2026-09-17 15:37:13.907-03	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N
d796f0df-9604-4400-957e-93428a715500	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	completed	6	\N	[]	2026-09-18 09:53:33.614-03	2026-09-18 09:54:35.604-03	2026-09-18 09:54:42.452-03	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N
c7e387d3-244e-456b-995f-7a99e1553c7e	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	1	\N	[]	2026-09-18 13:56:01.343-03	2026-09-18 13:56:11.343-03	2026-09-18 13:56:42.864255-03	a8238112-f78c-4a80-95d3-4d18336f1318	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-18 13:56:11.343-03
49cbf31c-7f0f-46e9-9c08-20ca3f15ccf3	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	completed	8	\N	[]	2026-08-31 09:34:01.204-03	2026-08-31 09:36:30.344-03	2026-08-31 09:36:45.074-03	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N
04758f1d-f7dd-416a-b4cf-a004cf8ca769	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	completed	2	\N	[]	2026-09-02 10:37:15.594-03	2026-09-02 10:38:37.972-03	2026-09-02 10:39:57.076-03	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N
4c6e4e3a-b23c-43ba-9f59-eb802ba3b9dd	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	1	\N	[]	2026-09-18 13:51:06.832-03	2026-09-18 13:51:16.832-03	2026-09-18 13:55:59.383889-03	a8238112-f78c-4a80-95d3-4d18336f1318	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-18 13:51:16.832-03
f6f08415-c73e-4531-82cb-246a425b3c6d	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	1	\N	[]	2026-09-15 16:06:27.215-03	2026-09-15 16:06:37.215-03	2026-09-15 16:11:04.722977-03	a8238112-f78c-4a80-95d3-4d18336f1318	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-15 16:06:37.215-03
33c46b7e-6704-401a-99b3-70b0b6d3c245	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	1	\N	[]	2026-09-15 17:15:15.246-03	2026-09-15 17:15:25.246-03	2026-09-15 17:15:46.175976-03	a8238112-f78c-4a80-95d3-4d18336f1318	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-15 17:15:25.246-03
b1d59e92-5fe9-48c7-955d-752ff04efce9	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	1	\N	[]	2026-09-18 17:36:54.754-03	2026-09-18 17:37:04.754-03	2026-09-18 17:36:57.742059-03	a8238112-f78c-4a80-95d3-4d18336f1318	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-18 17:37:04.754-03
342fbdf3-a113-4aa3-aed8-1dacc2829c94	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	completed	2	\N	[]	2026-09-23 17:29:44.153-03	2026-09-23 17:29:58.867-03	2026-09-23 17:30:15.752-03	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N
5cbc2b6a-3909-4e48-8dae-5e6cef6455ab	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	1	\N	[]	2026-09-21 09:13:29.682-03	2026-09-21 09:13:39.682-03	2026-09-21 09:31:32.776267-03	a8238112-f78c-4a80-95d3-4d18336f1318	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-21 09:13:39.682-03
fc372c3f-d5ab-4ff2-a3a6-f2cdbb4cbf25	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	1	\N	[]	2026-09-29 16:26:44.417-03	2026-09-29 16:26:54.417-03	2026-09-29 16:26:51.843265-03	a8238112-f78c-4a80-95d3-4d18336f1318	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-29 16:26:54.417-03
002f0d59-a8c2-4d41-9f12-5626fd0e27e9	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	2	\N	[]	2026-08-31 09:45:12.556-03	2026-08-31 09:45:44.378-03	2026-08-31 09:46:06.001062-03	3218d5b4-372e-424e-9d91-dedea2b741f3	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-08-31 09:45:44.378-03
40903033-5cd1-4ffb-9f94-1ed2f9fb9f40	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	1	\N	[]	2026-09-17 16:14:07.171-03	2026-09-17 16:14:17.171-03	2026-09-17 16:14:13.957538-03	3218d5b4-372e-424e-9d91-dedea2b741f3	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-17 16:14:17.171-03
7b502969-e309-4aca-a014-ee4ca0d3070b	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	1	\N	[]	2026-09-18 09:56:43.327-03	2026-09-18 09:56:53.327-03	2026-09-18 09:56:47.600927-03	a8238112-f78c-4a80-95d3-4d18336f1318	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-18 09:56:53.327-03
205ff02f-7cc7-48ed-9d1c-c7bf7f42e72d	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	completed	2	\N	[]	2026-09-23 17:45:47.771-03	2026-09-23 17:46:08.477-03	2026-09-23 17:46:25.382-03	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N
b1aa251f-14be-4573-9075-c9fe9204f347	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	3	\N	[]	2026-09-23 11:36:56.396-03	2026-09-23 11:38:20.795-03	2026-09-23 11:42:35.314632-03	a8238112-f78c-4a80-95d3-4d18336f1318	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-23 11:38:30.795-03
c133625e-bd20-468f-9f3b-d8364b02f7e1	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	1	\N	[]	2026-09-23 16:02:57.44-03	2026-09-23 16:03:07.44-03	2026-09-23 16:02:59.860136-03	3218d5b4-372e-424e-9d91-dedea2b741f3	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-23 16:03:07.44-03
dea288c1-e3ff-4a84-9733-383639d00389	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	completed	2	\N	[]	2026-09-23 16:38:50.544-03	2026-09-23 16:40:43.054-03	2026-09-23 16:45:30.709-03	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N
3168960b-0e10-446b-88c7-bd898ff9d6e5	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	2	\N	[]	2026-09-18 14:19:23.663-03	2026-09-18 14:19:58.637-03	2026-09-18 14:23:22.760722-03	3218d5b4-372e-424e-9d91-dedea2b741f3	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-18 14:19:58.637-03
5d8c8b0e-7077-442b-9da8-162566006264	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	completed	2	\N	[]	2026-09-02 10:52:50.939-03	2026-09-02 10:53:08.463-03	2026-09-02 10:53:26.235-03	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N
ac392b27-6f71-4c5d-aa22-215440a84ef2	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	1	\N	[]	2026-09-18 10:08:24.106-03	2026-09-18 10:08:34.106-03	2026-09-18 10:10:39.536213-03	3218d5b4-372e-424e-9d91-dedea2b741f3	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-18 10:08:34.106-03
treasure-9ba04dda	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	1	\N	[]	2026-08-28 15:26:55.328-03	2026-08-28 15:26:55.328-03	2026-08-28 15:42:46.829345-03	3218d5b4-372e-424e-9d91-dedea2b741f3	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-08-28 15:26:55.328-03
008c38f8-1633-4428-aa3e-8998b4adc0a3	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	1	\N	[]	2026-09-15 16:32:14.293-03	2026-09-15 16:32:24.293-03	2026-09-15 16:44:59.474498-03	a8238112-f78c-4a80-95d3-4d18336f1318	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-15 16:32:24.293-03
b60e7cd4-4d9f-4887-bfb9-271b13b34882	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	1	\N	[]	2026-09-15 17:16:02.18-03	2026-09-15 17:16:12.18-03	2026-09-15 17:16:32.659236-03	a8238112-f78c-4a80-95d3-4d18336f1318	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-15 17:16:12.18-03
5c198983-6505-4a0f-a121-0b99960b9071	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	1	\N	[]	2026-09-16 11:16:06.289-03	2026-09-16 11:16:16.289-03	2026-09-16 11:16:16.622309-03	a8238112-f78c-4a80-95d3-4d18336f1318	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-16 11:16:16.289-03
56f3c18b-32c7-4070-8250-12400159a5d9	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	finished	1	\N	[]	2026-09-18 14:17:20.243-03	2026-09-18 14:17:30.243-03	2026-09-18 14:19:21.06656-03	3218d5b4-372e-424e-9d91-dedea2b741f3	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-18 14:17:30.243-03
\.


--
-- Data for Name: cacaTesourScans; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."cacaTesourScans" ("scanId", "partidaId", "eventoId", "brincadeiraId", "numeroRonda", "checkpointId", "criancaId", "timeId", uid, "leroEm") FROM stdin;
5069e714-6235-4eb2-9d05-20289df43ffb	b52f378d-3a6d-4f43-a5cd-be8b011437d8	c920334b-c141-47ea-a791-dd2c9828be58	b58b6207-7348-40fe-b7fc-432212d08534	1	15	b3ee6536-ebd0-431d-b106-4ebde945cc9b	697df292-ec0f-40e5-97d5-1c77c6e539ff	04F0B45ABB2190	2026-10-05 13:52:58.349-03
3926b2d0-16eb-4fdf-9dd1-84c0e13c9c0c	b52f378d-3a6d-4f43-a5cd-be8b011437d8	c920334b-c141-47ea-a791-dd2c9828be58	b58b6207-7348-40fe-b7fc-432212d08534	2	12	b3ee6536-ebd0-431d-b106-4ebde945cc9b	697df292-ec0f-40e5-97d5-1c77c6e539ff	04F0B45ABB2190	2026-10-05 13:53:07.954-03
afe7314a-99a0-4325-a5b8-7fb2dc6bb226	b52f378d-3a6d-4f43-a5cd-be8b011437d8	c920334b-c141-47ea-a791-dd2c9828be58	b58b6207-7348-40fe-b7fc-432212d08534	3	14	b3ee6536-ebd0-431d-b106-4ebde945cc9b	697df292-ec0f-40e5-97d5-1c77c6e539ff	04F0B45ABB2190	2026-10-05 13:53:18.269-03
e7047b30-ff15-4cff-8657-d670503c4a40	b52f378d-3a6d-4f43-a5cd-be8b011437d8	c920334b-c141-47ea-a791-dd2c9828be58	b58b6207-7348-40fe-b7fc-432212d08534	4	10	b3ee6536-ebd0-431d-b106-4ebde945cc9b	697df292-ec0f-40e5-97d5-1c77c6e539ff	04F0B45ABB2190	2026-10-05 13:53:28.308-03
f5c28659-76ae-4292-a285-55f1c0709228	b52f378d-3a6d-4f43-a5cd-be8b011437d8	c920334b-c141-47ea-a791-dd2c9828be58	b58b6207-7348-40fe-b7fc-432212d08534	5	12	d70cac9b-1fb5-4444-a350-a6fadc61c300	3e781f1a-bd88-426c-b2de-d47f2489cc65	0455525ABB2190	2026-10-05 13:53:48.379-03
3382f10e-90d4-490f-8f06-c397e506b336	b52f378d-3a6d-4f43-a5cd-be8b011437d8	c920334b-c141-47ea-a791-dd2c9828be58	b58b6207-7348-40fe-b7fc-432212d08534	6	15	d70cac9b-1fb5-4444-a350-a6fadc61c300	3e781f1a-bd88-426c-b2de-d47f2489cc65	0455525ABB2190	2026-10-05 13:53:57.294-03
1470d233-ff88-44c9-a664-be6bc4bc368a	b52f378d-3a6d-4f43-a5cd-be8b011437d8	c920334b-c141-47ea-a791-dd2c9828be58	b58b6207-7348-40fe-b7fc-432212d08534	7	10	d70cac9b-1fb5-4444-a350-a6fadc61c300	3e781f1a-bd88-426c-b2de-d47f2489cc65	0455525ABB2190	2026-10-05 13:54:06.38-03
ac93019b-e455-45e1-ae7d-a84b07c34243	b52f378d-3a6d-4f43-a5cd-be8b011437d8	c920334b-c141-47ea-a791-dd2c9828be58	b58b6207-7348-40fe-b7fc-432212d08534	8	14	d70cac9b-1fb5-4444-a350-a6fadc61c300	3e781f1a-bd88-426c-b2de-d47f2489cc65	0455525ABB2190	2026-10-05 13:54:15.187-03
\.


--
-- Data for Name: cacaTesourTempos; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."cacaTesourTempos" ("tempoId", "partidaId", "eventoId", "timeId", "iniciadoEm", "completadoEm", "msDecorridos") FROM stdin;
0479d4ef-6040-431d-9ce0-8d4bd117b89b	fbd286dc-0f3f-457d-a0a7-34bb1144dc44	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
07ef35d8-0528-4e16-8adc-a633766b57ed	d316aedc-0de5-43da-9b1f-793f8a4551f3	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-07-22 16:45:40.706-03	\N	\N
147d5b16-5956-4b84-875d-72d37619eb12	be6435cb-b2e8-452c-918f-92738067543f	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
19c7dd72-cf76-4475-ada2-02a6fa461221	f44314b1-6712-4c59-9d2c-568cd8dd5cbf	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-07-22 16:51:11.463-03	\N	\N
1ae9c4c0-eac4-4f9c-82b9-7c9b1513c5db	80819922-6b0d-4aaf-b73b-15b8d2372086	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-07-22 16:43:46.416-03	\N	\N
23d996f6-4d23-4769-9251-ce357c089f38	b79142d1-22b0-44ca-a79d-731b01949070	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-07-22 16:50:56.973-03	\N	\N
2467aed8-a55c-400b-b2c4-33513148320e	4955f73c-14a3-4858-a4d5-dfbe3b1b9359	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-07-22 16:58:07.716-03	\N	\N
2f781bb2-3b3f-409c-ab29-9bddbe4c0599	a6bd4527-bb09-4033-8bca-9ecd0b74a06f	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-07-22 16:45:35.06-03	\N	\N
349e40ac-c4ab-42df-aed2-f1b6855c3503	614b2c0c-a145-4aa9-bf91-96a579f54af9	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-07-22 17:04:41.27-03	2026-07-22 17:06:38.29-03	117020
36eb8b3c-138e-4b36-ad36-afa889d2f1da	d316aedc-0de5-43da-9b1f-793f8a4551f3	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
39193b08-8f28-4739-86b6-3d874a33a9d4	be6435cb-b2e8-452c-918f-92738067543f	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-07-23 17:06:32.453-03	\N	\N
3c48377c-31ad-4033-84f6-90776d0a079d	6b4cace6-618c-4eca-8fd4-35fe0cee1746	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
41bc585b-0c32-40a8-b5b6-22e92e6c3d2e	f2a059e2-5441-4eb5-8a4a-041e8197f617	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
4dc3b62d-d949-4748-9441-5411e66de6d7	7bf85af8-cb81-4019-a5c4-238deb2dd453	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
52c8af7e-1d2b-4298-a6ac-3ee7d22c48ce	4739604d-0318-43a7-8d42-c23bfbedab9d	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-07-22 17:15:54.543-03	\N	\N
562f4134-4b89-482a-a15e-1a7101ad712e	2535f2eb-e239-4c14-97df-b24bc81fe7aa	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
5c6b2434-9b9e-49d5-ab1b-47b15e060ecd	f44314b1-6712-4c59-9d2c-568cd8dd5cbf	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-07-22 16:51:44.97-03	\N	\N
61565ac6-cd9e-4380-a187-0d72e9ab34d2	7cd73227-d02d-4173-975d-f2386168eddf	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-07-23 16:28:27.956-03	\N	\N
61e8b977-34e5-4fc9-8b26-d997b3f6aaf0	fb2290b3-9b23-45fa-9377-9ad60507098b	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-07-22 16:45:43.683-03	\N	\N
66e257ac-d236-4c83-aaa0-4c330cd5469c	1ce3eec0-dc17-4538-8610-7e60ff144803	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
6de3eb24-5ef9-495b-9d83-85d9180b4a81	80819922-6b0d-4aaf-b73b-15b8d2372086	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
75a1305b-254a-40c7-afcf-4e5ec6fc379b	7bf85af8-cb81-4019-a5c4-238deb2dd453	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-07-22 16:46:12.493-03	\N	\N
7e3d4515-da0a-47d7-9b30-6ef07680aa6b	f5a996f5-76e9-46c4-8098-b8b08ce853dd	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-07-22 16:59:40.676-03	2026-07-22 17:00:52.86-03	72184
7efdd7fe-951e-45ce-80a1-0c3a07aaf83b	4036c598-4cea-4f5d-8f9c-729aed54d62c	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
8692585a-f761-4e73-bfc6-81448b2cc8c3	4828ea8a-d585-4504-ae5b-118e626861fa	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-07-22 16:44:00.916-03	\N	\N
87c30569-0b40-4001-9ece-520691adefc9	0e025d2d-b5db-45f2-8d0f-b4ed747377f0	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-07-22 16:57:42.893-03	\N	\N
891e7199-b0de-4d15-b9ee-8eba484c047c	4828ea8a-d585-4504-ae5b-118e626861fa	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
8ede8358-c0ec-4414-8d37-6db043ef5926	4739604d-0318-43a7-8d42-c23bfbedab9d	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-07-22 17:12:16.323-03	2026-07-22 17:15:44.543-03	208220
8f317c29-dba3-44ef-b701-b387ae948e31	7cd73227-d02d-4173-975d-f2386168eddf	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
96a761f3-be73-4e93-b55e-d3b4850d65d4	a6bd4527-bb09-4033-8bca-9ecd0b74a06f	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
9cada682-995a-4aa1-9306-a2eb3fbdd614	6b4cace6-618c-4eca-8fd4-35fe0cee1746	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-07-22 16:43:11.746-03	\N	\N
a43ab014-b092-44e7-829d-627452ac9bcf	b79142d1-22b0-44ca-a79d-731b01949070	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
b9c6901b-2c38-4419-8d3f-8edd13d1dc31	c885291c-f8ec-4755-8e4f-1c67f6a6dc69	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-07-22 16:55:04.75-03	\N	\N
bb9a1a76-de3a-48c8-b22d-d35f79d13bc2	0e025d2d-b5db-45f2-8d0f-b4ed747377f0	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
bc317ee4-d83f-4e2b-883c-c53746f6f791	cc539a31-a908-4fe6-9f84-3ec68f408645	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-07-22 16:43:59.6-03	\N	\N
bec43021-58e6-406b-aff0-e2eba2334224	4955f73c-14a3-4858-a4d5-dfbe3b1b9359	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
c5f3f381-9ed2-41a0-83eb-910db0679852	fbd286dc-0f3f-457d-a0a7-34bb1144dc44	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-07-22 16:46:18.846-03	\N	\N
d359d1bd-ae05-4aa8-9bd9-1d92634c6fce	f2a059e2-5441-4eb5-8a4a-041e8197f617	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-07-22 16:57:56.986-03	\N	\N
d78362af-7957-4581-b052-665dfa6e9a27	a633f69a-cb69-43eb-a240-7cec9bc5a398	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-07-24 10:52:39.63-03	\N	\N
dcd04398-1d64-4f69-9247-0a4dfa94f687	896da9d9-c34d-456a-9e8c-3ae706b89618	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-07-22 16:43:41.976-03	\N	\N
dedf90db-44a8-458f-98c6-db399c66a2c9	a633f69a-cb69-43eb-a240-7cec9bc5a398	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
e65732d2-73e2-4b97-9afe-3a0415f1929a	2535f2eb-e239-4c14-97df-b24bc81fe7aa	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-07-23 16:53:29.83-03	\N	\N
e7f44c3f-75fd-4a0e-8b15-7a82c0569755	c885291c-f8ec-4755-8e4f-1c67f6a6dc69	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-07-22 16:54:26.066-03	\N	\N
ecb21756-10d6-40c1-bb97-3d07b1016fe6	cc539a31-a908-4fe6-9f84-3ec68f408645	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
ef72acc9-51aa-4bb3-829b-2b737dd53a35	2a0ff9e1-74a5-40e8-906f-d9f41ebeefd8	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-07-23 16:50:44.89-03	\N	\N
f4348082-1d3f-4825-ac05-31ff0bfffe95	1ce3eec0-dc17-4538-8610-7e60ff144803	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-07-23 16:50:20.686-03	\N	\N
f4a64a17-0735-41bd-92bb-82a8e398aee2	896da9d9-c34d-456a-9e8c-3ae706b89618	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
f515a330-7cc4-4be2-a267-a78a9b66b1ff	f5a996f5-76e9-46c4-8098-b8b08ce853dd	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-07-22 16:58:12.863-03	2026-07-22 16:59:30.676-03	77813
f7379d2e-74d9-4452-a09d-39d93a15a212	614b2c0c-a145-4aa9-bf91-96a579f54af9	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-07-22 17:02:57.176-03	2026-07-22 17:04:31.27-03	94094
f7550f75-0fe1-4a1b-9835-db1ce292e2b8	4036c598-4cea-4f5d-8f9c-729aed54d62c	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-07-22 16:57:38.9-03	\N	\N
f94fa21b-1c54-4a7d-9703-1b9ae8408e4d	2a0ff9e1-74a5-40e8-906f-d9f41ebeefd8	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
fba12a76-2f24-43bc-a776-012ced7ded7e	fb2290b3-9b23-45fa-9377-9ad60507098b	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
6ca534b6-dc2b-4441-b81a-dd47d7106704	2b2c27c3-4e00-4ed3-acaa-1a57f48e7c3c	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
8f064392-51e4-4afc-a0a8-a82e23dac13d	2b2c27c3-4e00-4ed3-acaa-1a57f48e7c3c	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-07-24 15:17:08.75-03	\N	\N
f3f33c5c-8e3b-479e-9a7d-bacdb1f5942a	632baa8d-61cd-4a6c-98e8-8a7a8997940b	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
66440f79-0b9a-4d07-a0dc-1976b7ee5e97	632baa8d-61cd-4a6c-98e8-8a7a8997940b	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-07-24 16:18:58.017-03	\N	\N
78babf7c-3276-4cb2-9a3b-10da1ea3b8e6	5d94da4c-150e-43f1-abe6-b497a46e2bc7	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-07-24 16:22:01.127-03	\N	\N
b54e8fa7-6598-4ea3-9991-b69ff79d1841	5d94da4c-150e-43f1-abe6-b497a46e2bc7	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
cf4e8f75-5254-49c3-b340-822c7f1eb156	9d1f2c67-714e-4b8a-95af-ba4b16af70d0	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
c5f26c42-f9b2-4532-8456-ab4fabf3794c	9d1f2c67-714e-4b8a-95af-ba4b16af70d0	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-07-24 16:23:16.603-03	\N	\N
29323bb0-3761-46cc-a0c4-6931072078ef	cada24a9-67ee-40c5-acd0-134d1970a3db	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
3d919f91-fd43-465e-bbcc-4bc96128d809	cada24a9-67ee-40c5-acd0-134d1970a3db	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-07-24 16:24:00.276-03	\N	\N
acad4a76-cf88-487a-9685-c2c88f19de7e	84a16a62-940f-472e-b6f8-4312f8f27048	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-07-24 16:24:40.374-03	\N	\N
89d5796b-9712-4a6a-a3ff-cffefe0dd4f1	84a16a62-940f-472e-b6f8-4312f8f27048	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
efe0967d-8163-4538-b9f9-79f6546ea2e8	b4927fe8-fb02-4bec-bdf8-4adef95d96d5	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-07-24 16:24:42.462-03	\N	\N
431b890c-529b-4386-a1fe-bfac85a211f7	b4927fe8-fb02-4bec-bdf8-4adef95d96d5	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
705dd161-3a19-425e-b922-49573fdc3fc9	9c29b959-8ec4-4308-9eba-48a2db8b520a	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
117f0fdc-06a7-4711-9a02-1e723bd01306	9c29b959-8ec4-4308-9eba-48a2db8b520a	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-07-24 16:26:06.947-03	\N	\N
a7c0dec5-2413-475a-9698-385f94951f9e	e8bcbb6f-6665-414a-8fc3-249da8c0dddf	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
9191446b-3235-49a8-b462-7693e3576ff5	e8bcbb6f-6665-414a-8fc3-249da8c0dddf	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-07-24 16:26:11.847-03	\N	\N
efcbc052-62ff-4b5a-ae37-497643108a8d	2de050c1-024e-4595-ad9a-d25b6d07ed72	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
c6f5a23e-d575-446c-b3f1-816c76831723	94ce5958-5228-4a7b-9df1-2ff918e1f1e9	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-07-24 16:55:30.38-03	\N	\N
f60b3dbd-0f32-4e1c-9a0a-0371c7667665	2de050c1-024e-4595-ad9a-d25b6d07ed72	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-07-24 16:26:15.234-03	\N	\N
5a8b6dcd-bed2-473b-8f56-cc25b18db73e	2c5efe62-d1c1-486a-a2cd-814f208ce05b	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
6b0bf510-acac-4fb6-94ef-9781d93530b5	b1a65c3d-ce1a-45c1-a8c4-2ca997250ea7	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-07-24 16:42:13.847-03	\N	\N
1bb1dc0e-1495-424f-9a89-0b58a0c9797c	2c5efe62-d1c1-486a-a2cd-814f208ce05b	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-07-24 16:29:01.96-03	\N	\N
8bd26e16-cd3f-4462-a8eb-3bfaa4086a4c	3d420180-3105-406e-aeef-45258899fe94	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
ec5ee701-f66b-40c5-b95a-1573d8106135	3d420180-3105-406e-aeef-45258899fe94	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-07-24 16:39:32.969-03	\N	\N
2c2dbccb-a72a-40d2-8729-66b8b87ef3ca	b1a65c3d-ce1a-45c1-a8c4-2ca997250ea7	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
0f3c7091-d6fa-40e6-8ea8-6368ba30e069	94ce5958-5228-4a7b-9df1-2ff918e1f1e9	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
c1227726-79a6-492e-adaa-256b1d752e76	3e70cc36-afd2-423a-a124-58c7bd6e4313	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
3249a7cf-eccf-4167-8488-64920659ae3b	3e70cc36-afd2-423a-a124-58c7bd6e4313	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-07-24 17:01:34.138-03	\N	\N
bc9e873e-2a10-4e40-b6db-35edcca48734	a5c4c08a-dfc6-45fc-a64b-b89c95ac61e0	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
1d10daaa-6f72-4413-86e5-03df71cb237b	6d72c498-4413-458b-8002-5165b6f72b6d	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-07-24 17:16:27.403-03	\N	\N
b37861a9-ffae-47ce-9b09-629f350aa2e6	a5c4c08a-dfc6-45fc-a64b-b89c95ac61e0	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-07-24 17:05:26.678-03	\N	\N
a68ac00e-4400-4304-9050-79670b290007	6d72c498-4413-458b-8002-5165b6f72b6d	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
801b4254-6bce-43cb-9f6b-896dacb06940	f0236544-e8cc-4913-9c78-262b120e5dc5	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
42f6886d-d904-4bdf-998b-6fc69693561b	712387e9-f23a-49c3-bfd8-8e4145d9c200	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
2e76ab45-968b-4801-b985-fb02e6b7b0b4	712387e9-f23a-49c3-bfd8-8e4145d9c200	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-07-24 17:16:36.457-03	\N	\N
84996143-4b9d-4eb2-a1f6-303fa0ca5092	f0236544-e8cc-4913-9c78-262b120e5dc5	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-07-24 17:21:10.113-03	\N	\N
b7202f35-7b13-4204-9bed-9d3d884a9190	96457bd8-9cdb-425a-b344-1ff6e922faa3	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-07-24 17:21:14.679-03	\N	\N
8cbf8936-5116-4d29-b3a2-c86f018f8d70	96457bd8-9cdb-425a-b344-1ff6e922faa3	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
e6108694-7cbc-49e0-84f6-2566bea44dff	3f0caf35-62a8-49ce-8939-5034f79e38cc	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
710244ab-a5bf-4315-b522-6f6b48a5ea79	08c3e290-9659-45c5-a24f-8c78afd9d70f	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
d944826e-7bab-4084-b231-a1ba9fec71a0	3f0caf35-62a8-49ce-8939-5034f79e38cc	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-07-24 17:22:09.618-03	\N	\N
dad8b565-273e-48b8-b1c2-a26d6526e216	92472da9-4f85-4a38-99c8-55dda77fa72d	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
0e80e6e9-dbb8-47cb-a361-c5428f640cfd	08c3e290-9659-45c5-a24f-8c78afd9d70f	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-07-27 14:50:03.224-03	\N	\N
36bb3bce-0089-4ab2-a362-8a9d5eb836ed	92472da9-4f85-4a38-99c8-55dda77fa72d	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-07-24 17:35:34.377-03	\N	\N
127541ca-095d-4fdb-adf4-04992516273d	002bc110-9b8a-48ce-90c7-062547dc1c81	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
4c59982b-cc0c-45cc-b6aa-2ebbb0117cda	002bc110-9b8a-48ce-90c7-062547dc1c81	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-07-27 09:41:44.437-03	\N	\N
65879dcf-cc9c-40fc-9fc5-d4f11bc0edb0	13e597fc-7776-4663-9464-f37a5b6486f5	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
59a53da5-e2e0-49f0-9436-ed41d7371db4	13e597fc-7776-4663-9464-f37a5b6486f5	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-07-27 09:51:20.617-03	\N	\N
d631b343-141b-49df-82bb-1d7b5e55b254	12214497-ad56-41e0-803f-c13c76119845	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
47298aca-bd29-43c3-a652-1f7daffcd28a	12214497-ad56-41e0-803f-c13c76119845	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-07-27 09:51:26.943-03	\N	\N
c4884c59-eab4-4b02-beab-30dba5ca04a2	aa14897c-8fb1-4f4d-853d-ce5ecc46dfd4	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
b1605104-315f-4c48-a7c7-311b14e7241f	aa14897c-8fb1-4f4d-853d-ce5ecc46dfd4	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-07-27 10:25:42.938-03	\N	\N
3e71bceb-ab36-4703-b39b-f4b36687e8c2	6435ceaa-49bb-4791-b711-af1637106073	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-07-27 10:55:20.514-03	2026-07-27 10:57:56.43-03	155916
6e192680-be0d-43fd-99f5-61a6e9f8b490	080f531e-a897-47f2-984d-5a13feb633a0	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-07-27 10:37:31.131-03	2026-07-27 10:38:31.944-03	60813
8af31397-389c-4924-9d00-79f6dd71ef7b	6435ceaa-49bb-4791-b711-af1637106073	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-07-27 10:58:06.43-03	\N	\N
2b1c5ac0-f242-479d-8be0-a010f1bb1c5e	23065774-4f95-4388-98e8-0d31a4a49607	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
6fc5fe2a-98ef-4597-ba92-bfb0f9648fa3	080f531e-a897-47f2-984d-5a13feb633a0	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-07-27 10:38:41.944-03	2026-07-27 10:39:37.416-03	55472
59f93a1f-2384-445a-adc4-2c31c4a51c6a	75b44f7f-100c-40da-a066-84c03bc3b134	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-07-27 10:51:51.838-03	\N	\N
72be041e-ebac-4858-adf7-7e7984503c9e	75b44f7f-100c-40da-a066-84c03bc3b134	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
0bb2861d-a13b-4e0c-b168-dbd04bd59ac3	23065774-4f95-4388-98e8-0d31a4a49607	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-07-27 14:42:05.435-03	\N	\N
d81d27b9-a1fe-4dc7-a723-b4d7b94c2e53	05a4bcf8-cf6c-4451-92e1-31f09e148923	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-07-27 10:51:59.879-03	2026-07-27 10:54:06.826-03	126947
2b12fa5a-8ae3-4ae8-9abf-667b0bcb3c69	05a4bcf8-cf6c-4451-92e1-31f09e148923	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-07-27 10:54:16.826-03	\N	\N
4ddd890b-bdec-48be-ab76-f1bb1f4c42bb	a9ad501f-8061-4257-a834-cb1e6c0a61ec	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-07-27 10:55:10.288-03	\N	\N
2ce3593c-49c3-4348-a07d-a939a9602189	a9ad501f-8061-4257-a834-cb1e6c0a61ec	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
dbf3c1da-67d5-4319-a37b-c5a22be447bb	1a3e84f0-f006-4518-a50e-94a228a3996e	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
c77f140a-14e6-4077-a93f-eb0fd10907e7	1a3e84f0-f006-4518-a50e-94a228a3996e	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-07-27 14:51:40.894-03	\N	\N
06156479-d2a9-4671-9d1b-c1166e86e723	cfc884b7-db2c-4e2a-9c81-e4ad0a115b6d	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-07-27 15:00:29.206-03	\N	\N
ca2dc69b-2b3f-4df8-8b06-48041e3db065	49dac98f-e1d6-438e-983d-5049cd00415d	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-07-27 14:45:08.329-03	2026-07-27 14:47:25.608-03	137279
6ec6a4d7-6ef0-4fb5-b5a9-4aa993f71804	49dac98f-e1d6-438e-983d-5049cd00415d	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-07-27 14:47:35.608-03	\N	\N
cfb456ae-1886-4d30-9214-ab141830d276	32fe79b0-ce34-4396-8e7e-172ed1784fc7	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-07-27 14:49:59.885-03	\N	\N
dc9ace87-0075-4366-8be2-6689b4876ad9	32fe79b0-ce34-4396-8e7e-172ed1784fc7	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
7755ee2b-c74e-48dc-a6a9-02e874ae73e5	cfc884b7-db2c-4e2a-9c81-e4ad0a115b6d	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
da72e3d8-cd56-4fb7-b6a1-9287f6aa6a6f	1ee00233-3329-4e93-9f20-da31b39b4671	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-07-27 15:06:33.793-03	\N	\N
3c90a720-3623-45ad-9a2d-9faa6d036984	1ee00233-3329-4e93-9f20-da31b39b4671	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
750858c5-5f7b-426f-9935-cbf80f8d6ddf	dce54126-7885-4fcc-a94a-5a8bef51ef42	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
27c2f457-0135-408a-91ca-ca4e3d9f32af	dce54126-7885-4fcc-a94a-5a8bef51ef42	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-07-27 15:10:06.679-03	\N	\N
83fcd5ef-df0a-4d7a-941d-031e3965e6fc	86696e0b-bf25-4516-921a-863d6d009d54	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-07-27 15:12:47.936-03	\N	\N
23fbd848-3569-4ec0-b639-8a1a390413d5	86696e0b-bf25-4516-921a-863d6d009d54	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
9768ff50-cf94-4dca-ac8e-532c6742e9a3	d41ba5db-0722-465c-b431-e00cd61465dc	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
d38f768c-0cc1-416a-a208-29fece8b9faa	d41ba5db-0722-465c-b431-e00cd61465dc	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-07-27 15:14:45.337-03	\N	\N
edbdd744-cdc8-40c1-96f3-382ab3d2489c	9aa8a16b-b531-43a2-b776-3e3206235f15	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
02e919c1-6bb9-445e-a3e5-adbd8c953c85	9aa8a16b-b531-43a2-b776-3e3206235f15	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-07-27 15:19:11.708-03	\N	\N
a5a4f7bb-93c3-4fa8-8210-c5990c6e56c1	8daa22fc-e19f-4017-a777-c893468e6aca	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-07-27 15:41:57.935-03	2026-07-27 15:42:10.886-03	12951
5971a6a2-1194-4180-8f24-5d0f8f8120d3	8daa22fc-e19f-4017-a777-c893468e6aca	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-07-27 15:42:20.886-03	2026-07-27 15:42:49.43-03	28544
ae7a964d-f71d-4d00-9514-e3f5d25a2a56	a9bfee45-111f-4bfc-ac4f-46bff4cc6dd9	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-07-27 15:49:21.657-03	2026-07-27 15:49:44.19-03	22533
b85043b0-d9d1-44db-98a5-dccff3b7584d	a9bfee45-111f-4bfc-ac4f-46bff4cc6dd9	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-07-27 15:49:54.19-03	2026-07-27 15:50:24.68-03	30490
88ef40ff-62cb-4ac5-b001-94ecef8f7794	3e2fa671-7e0c-4481-a370-226885c37949	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
5e8698f3-1044-40a1-adb1-f6ced6a189f1	3e2fa671-7e0c-4481-a370-226885c37949	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-07-28 13:47:27.345-03	\N	\N
894dcea0-1417-4504-8911-21d96db6ff6b	f37aa9d1-b734-42ef-9027-2c9d445faaf2	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-07-27 15:24:00.095-03	2026-07-27 15:27:50.623-03	230528
89527996-79c3-46fa-8d59-4f0a2ec89330	f37aa9d1-b734-42ef-9027-2c9d445faaf2	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-07-27 15:28:00.623-03	\N	\N
b4f9397c-fe8a-4850-8305-49041053b385	adce2d80-f90d-4faf-aec4-57d11a301615	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-07-28 13:48:47.739-03	\N	\N
9690b633-0699-41d7-b3e0-c85020feedc5	adce2d80-f90d-4faf-aec4-57d11a301615	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
9ee551ab-6c43-4963-8dcb-ac8facfb655b	e46880f7-d54c-46c0-a6af-076d3b95cafb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-07-27 15:32:43.838-03	2026-07-27 15:35:16.286-03	152448
7c0c6a63-068f-44e9-a84a-5c8f7308f923	e46880f7-d54c-46c0-a6af-076d3b95cafb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-07-27 15:35:26.286-03	\N	\N
5905d28f-512e-407d-b243-8ef86223d4fa	31a657b2-d7af-4019-bcc0-dfcfb1c2ed22	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-07-27 15:43:13.861-03	2026-07-27 15:43:47.077-03	33216
12222087-6bb9-4967-9369-a7fa873b1cb9	31a657b2-d7af-4019-bcc0-dfcfb1c2ed22	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-07-27 15:43:57.077-03	2026-07-27 15:44:23.388-03	26311
d8aa0ec2-a2bf-462a-9aba-b84f97a01f76	0eef7ca5-7e93-4a61-9282-b88435d1d0ad	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-07-27 15:54:18.125-03	2026-07-27 15:54:42.698-03	24573
f7488b14-3a05-4bef-bd24-b1d6eccf7d24	0eef7ca5-7e93-4a61-9282-b88435d1d0ad	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-07-27 15:54:52.698-03	2026-07-27 15:55:21.466-03	28768
4ea67f1e-be26-43e1-a2d6-930559689fa0	37ae9f15-faf6-40d3-895a-f0d833b50f12	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-07-27 16:02:41.228-03	2026-07-27 16:03:15.883-03	34655
7780005a-ad56-4e8d-852e-c14689fecf2a	a3ad1f51-4d6e-451d-9aab-9525f6d32228	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-07-28 15:40:48.751-03	2026-07-28 15:42:04.75-03	75999
301b018e-7aac-4a10-aab2-ab493c5b3264	37ae9f15-faf6-40d3-895a-f0d833b50f12	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-07-27 16:03:25.883-03	2026-07-27 16:04:05.515-03	39632
84715695-8629-4265-85f3-ef0b701395c1	003b87d5-339d-4866-a1a4-6e4524191b27	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-07-27 16:13:08.591-03	2026-07-27 16:13:39.272-03	30681
1b543301-0533-4bb6-814e-e68bca0cdbae	d432db07-9f05-44e5-b1fe-30381df6eabc	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-07-28 15:05:14.22-03	2026-07-28 15:05:29.923-03	15703
859162f1-47be-44b4-8c01-30ba7b04873a	003b87d5-339d-4866-a1a4-6e4524191b27	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-07-27 16:13:49.272-03	2026-07-27 16:14:03.209-03	13937
8ba6bced-2101-413f-8bdc-5c3c7c6e53f6	c7a03855-d18a-4b30-a18b-cfe78e66753f	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
167f99b9-b047-4c20-b690-a922bd8cf3f2	c7a03855-d18a-4b30-a18b-cfe78e66753f	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-07-27 17:22:20.105-03	\N	\N
4037eba4-00f0-4ab1-97a7-7b126c33913c	cc41f71b-4afa-4bc1-bfa9-5313dd907612	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-07-27 17:36:29.767-03	2026-07-27 17:36:49.038-03	19271
b05debbb-3a70-4326-9acd-69236a6d58ad	51d7b159-91bf-426b-8f31-a1d771f4c185	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-07-28 15:36:26.874-03	2026-07-28 15:37:30.095-03	63221
cc1ab54f-5c9f-47a4-bfca-42c881247102	cc41f71b-4afa-4bc1-bfa9-5313dd907612	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-07-27 17:36:59.038-03	2026-07-27 17:37:18.458-03	19420
c5ecd686-6ac4-4ab5-b8a6-0134198acad8	a3ad1f51-4d6e-451d-9aab-9525f6d32228	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-07-28 15:39:09.981-03	2026-07-28 15:40:38.751-03	88770
bee83158-643c-4706-903c-3f062cdb973a	d432db07-9f05-44e5-b1fe-30381df6eabc	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-07-28 15:05:39.923-03	2026-07-28 15:06:07.705-03	27782
c1752ddb-a3e5-4120-aa66-434ff470de63	a55cdb0e-85d9-4f30-9293-6606ff1d5da1	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
7dc51428-c0a0-42ba-9682-72ab308d40cd	a55cdb0e-85d9-4f30-9293-6606ff1d5da1	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-07-28 15:27:35.498-03	\N	\N
a1f6d9cf-459a-41f8-b442-b8c3f9b93fbe	6cdbb426-b3a2-4e4c-9666-1c619dfd8fba	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
d76558d4-9682-4795-838d-864ab2d877fc	6cdbb426-b3a2-4e4c-9666-1c619dfd8fba	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-07-28 15:29:16.879-03	\N	\N
1bb84161-9248-4cc6-97ea-50b5a849217a	5418fb00-40dc-40ce-8904-8cde7239242a	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-07-28 15:33:26.398-03	\N	\N
beb4e678-ff58-4c47-b6e4-4f3b84f88687	5418fb00-40dc-40ce-8904-8cde7239242a	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
e1b92898-f36a-4069-9c9a-40130f26caf0	e05f9146-2306-43de-8819-0268614f5a2b	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
2fa934ee-c243-4094-a928-bca6aa51d161	e05f9146-2306-43de-8819-0268614f5a2b	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-07-28 15:34:34.186-03	\N	\N
0779f921-b45c-457c-bd95-54c96946d0e9	bb2c12b5-55b2-4b0d-925d-ec079e69c01b	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
e9ee2be8-e383-4dbe-871d-6a9d64fc46ff	51d7b159-91bf-426b-8f31-a1d771f4c185	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-07-28 15:37:40.095-03	2026-07-28 15:38:36.476-03	56381
2269a24d-7e70-4812-8892-788d92dafb55	df1ad774-1f99-48a0-b693-efb919711f07	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-07-28 17:30:13.241-03	\N	\N
5252ead8-97d8-47dd-996d-585dea3c11d2	bb2c12b5-55b2-4b0d-925d-ec079e69c01b	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-07-28 17:29:27.642-03	\N	\N
f96f7216-5358-4a18-8968-1bfab999ad0d	d3ca4ec7-67ab-472b-8321-37452bc98f00	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
45ac035f-1976-4758-aec9-fb72745783d0	d3ca4ec7-67ab-472b-8321-37452bc98f00	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-07-28 17:29:30.937-03	\N	\N
e65ea80b-ad57-43c5-a66f-074cd0ff2bca	df1ad774-1f99-48a0-b693-efb919711f07	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
31226629-d6e1-4d9c-b018-733312a85d0d	13ebed0f-afce-46f8-9d98-032b4799b336	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
396fd586-35af-4700-8e2a-52c1a7537b29	13ebed0f-afce-46f8-9d98-032b4799b336	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-07-28 17:42:50.923-03	\N	\N
a8e1e802-7b11-4dfe-95a8-16947f71263d	ede8e49b-46d1-4ab3-b3b4-3bea0761e8d4	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
3984df71-b3f9-4c7b-8bc1-63307fb7bc68	ede8e49b-46d1-4ab3-b3b4-3bea0761e8d4	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-07-28 17:42:54.267-03	\N	\N
07c95883-c3ba-4911-a964-6fa2daed9313	f5734418-60d1-4601-b2f2-86b7c3d3a746	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-07-28 17:43:23.096-03	\N	\N
70741822-8878-4159-be8b-19795e9ebaed	f5734418-60d1-4601-b2f2-86b7c3d3a746	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
95ccbbf9-f90c-4a54-a0bf-74ee8016119d	9931a928-b698-4be2-b555-25695464d52d	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
44e3f31c-1617-480a-aae5-26b7509e280b	9931a928-b698-4be2-b555-25695464d52d	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-07-28 17:43:26.103-03	\N	\N
63860465-0fa5-4d6c-8500-b68fe35f02fa	a3de9701-e0b4-4c75-99a0-4b7447d967f0	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-07-29 15:14:05.331-03	2026-07-29 15:14:39.807-03	34476
39a9669e-08b4-4e30-9c61-a6cd513b807e	a3de9701-e0b4-4c75-99a0-4b7447d967f0	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-07-29 15:14:49.807-03	\N	\N
8a156d4c-ecad-4229-b3b2-1a2aec54ec02	7efc1a58-a6d8-4f63-8742-86ae8c322d72	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
7aad7a84-5e30-49e9-998b-7fc21c46b981	7d7f8ba1-fcac-4e39-a213-760c9ce23bbc	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-08-12 11:54:22.512-03	2026-08-12 11:55:20.16-03	57648
6141f826-8ff6-4311-88f0-066d349f514e	7efc1a58-a6d8-4f63-8742-86ae8c322d72	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-07-29 15:36:44.163-03	\N	\N
42c9e007-7731-4ece-a177-efe5d7234a34	a7c33841-0f05-43b3-9556-1eb39fd89125	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-07-29 16:11:42.736-03	\N	\N
e8b6d6af-9a20-40d0-90ef-94692fe02a07	a7c33841-0f05-43b3-9556-1eb39fd89125	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
30da967f-c83f-48d2-9e22-d21782dff10c	aed19ed9-4d9c-425a-8daf-28836e2f2476	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
7f00f9ff-c152-44af-98d4-a0045572f13a	aed19ed9-4d9c-425a-8daf-28836e2f2476	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-07-29 16:12:15.185-03	\N	\N
6c81b577-5582-473e-abcb-8b82bfe384a6	68c76c70-32dd-4de5-8db1-e55931234b7e	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
323cf765-38fc-4fad-b583-3a72b724995b	68c76c70-32dd-4de5-8db1-e55931234b7e	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-07-31 08:12:23.918-03	\N	\N
7e4f7ff1-3658-430a-be0e-7080c6bc3b0c	5f43e031-c673-4c8e-a070-3206d3caef00	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
94638832-e77d-4183-a233-fd67bf46105f	5f43e031-c673-4c8e-a070-3206d3caef00	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-08-11 12:26:35.657-03	\N	\N
5df6cf1d-c787-41e5-b590-238e1766e11b	83c7edf0-db1e-4f9f-aeae-b6537fb28620	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-08-19 16:58:33.789-03	\N	\N
b469dd28-1a62-4fa8-a67a-abff3250adee	36a96e89-edb4-4195-9d29-41cb7b5edafa	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-08-11 12:27:26.879-03	2026-08-11 12:28:24.665-03	57786
c20c84ca-ca1f-40a8-93ec-716f4799888f	03006463-9c2a-419f-bc7a-f118fd7ff3f9	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-08-18 09:01:56.065-03	2026-08-18 09:03:25.568-03	89503
ad9154cd-f9ea-48ef-9f65-812bffc77acc	7d7f8ba1-fcac-4e39-a213-760c9ce23bbc	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-08-12 11:55:30.16-03	2026-08-12 11:56:00.165-03	30005
c01a376b-7d23-4fb9-bdfd-b5eeac223c1e	36a96e89-edb4-4195-9d29-41cb7b5edafa	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-08-11 12:28:34.665-03	2026-08-11 12:29:03.648-03	28983
73849d5d-4e06-4bb0-bb2b-9b28de9d3464	2f2ea075-3c35-4834-a5b2-19bebdf3fff2	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-08-12 11:22:18.719-03	2026-08-12 11:22:40.817-03	22098
d79a7649-8fea-4724-a124-ceedb16002f4	2f2ea075-3c35-4834-a5b2-19bebdf3fff2	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-08-12 11:22:50.817-03	\N	\N
64c8b5cb-45bc-41e3-92a4-ddf3ca6c2a1c	f6281d75-ba6c-44a3-a3ab-4dbbb8b3b724	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
b4713fa5-4e57-41f1-b63d-5a23f830e0d7	f6281d75-ba6c-44a3-a3ab-4dbbb8b3b724	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-08-12 11:51:21.568-03	\N	\N
a7aeae08-9300-4ba6-8d40-a139a6a2e1db	03006463-9c2a-419f-bc7a-f118fd7ff3f9	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-08-18 09:03:35.568-03	\N	\N
92fa1634-d8e8-48db-9f65-ed2aaf3d909c	114c5581-0194-4a89-9f6d-ca93c55fbf26	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-08-12 16:03:45.853-03	2026-08-12 16:04:23-03	37147
090a411f-ba8a-4a6e-bc94-3347aa0cb999	114c5581-0194-4a89-9f6d-ca93c55fbf26	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-08-12 16:04:33-03	\N	\N
7adbbf1b-b419-43a1-806c-05e930a6817f	51ff5e87-3aad-4b90-a904-a42b6f443ddc	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-08-19 16:47:11.971-03	\N	\N
858566a4-1bdb-4e05-ae11-5cb91dd9ce20	83c7edf0-db1e-4f9f-aeae-b6537fb28620	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
abec6b91-9e0d-481a-a7ed-47476925f187	51ff5e87-3aad-4b90-a904-a42b6f443ddc	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
9db2be01-5511-478c-a5ed-a93ee13d0b58	ccaf2075-7508-4245-8d34-1c26f09aee44	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
e80e5013-9bd8-47fb-aed7-fc214126d0f9	ccaf2075-7508-4245-8d34-1c26f09aee44	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-08-19 16:52:10.42-03	\N	\N
2abc016d-0623-4a44-bc2f-4d736c3b95d1	43c21b4d-6a40-4d2b-9bcd-2e048ee0a559	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
992811bb-38d5-4fc2-924a-7014071ed193	43c21b4d-6a40-4d2b-9bcd-2e048ee0a559	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-08-19 16:54:00.17-03	\N	\N
3a7ba2be-4ef8-43bb-8013-de1f82d44778	e7f35427-a87c-4e2d-aef5-88717b6a357b	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
1b172e7e-9b35-4786-8f58-833f6d02bc6c	e7f35427-a87c-4e2d-aef5-88717b6a357b	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-08-19 17:08:00.446-03	\N	\N
25ca5eba-ca1d-4089-9747-7462f7f8b77f	d13ff088-90f1-4000-9b41-9fc68afade25	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
8d4abb72-1287-45a9-95a7-d249ebb5064c	d13ff088-90f1-4000-9b41-9fc68afade25	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-08-19 17:08:25.364-03	\N	\N
4c943133-6139-4baa-a8a0-c8fcd77cb8e6	ae9cfcb2-f961-49da-b8da-12b444b0f5d2	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-08-26 11:51:36.634-03	\N	\N
21ef03ce-8ebf-45d0-a268-e958e53ad6df	ae9cfcb2-f961-49da-b8da-12b444b0f5d2	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
f95bac89-8e58-40b2-88bc-d95278fe64cc	c9cc5ee3-fca5-41fe-9eb0-dfe389ba71a0	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-08-20 12:26:10.679-03	2026-08-20 12:28:49.415-03	158736
832906c1-6b11-4495-b38a-5a9b24d91f10	67ec4f0f-92ab-4c25-ba36-64eeacaaaf19	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-08-24 17:32:27.021-03	2026-08-24 17:33:44.923-03	77902
6cd5bd0b-c3f5-44dc-9200-5df59430a17d	c9cc5ee3-fca5-41fe-9eb0-dfe389ba71a0	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-08-20 12:28:59.415-03	\N	\N
42a0d600-81c5-4552-b3b9-4677bed15059	91c0d92e-bbc7-4e05-b4a9-33173edae594	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
be7e67ca-1755-4449-bacf-1ec92d10161e	91c0d92e-bbc7-4e05-b4a9-33173edae594	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-08-21 09:44:23.593-03	\N	\N
180cd944-c5af-4335-b37e-660c9f7d1436	cba1781c-b774-4950-9a22-c8f7c73f43dd	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-08-24 16:11:26.223-03	2026-08-24 16:11:54.186-03	27963
43d29192-4fd8-41b2-bae9-62cf18be56dc	cba1781c-b774-4950-9a22-c8f7c73f43dd	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-08-24 16:12:04.186-03	\N	\N
aab9dc5e-6482-4608-b6d5-e110ec3de143	74205d5a-ad22-4d5d-8e9e-8ff7f4b1764c	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-08-24 16:12:13.264-03	2026-08-24 16:12:43.202-03	29938
e1e20427-1da6-4925-befd-0285611d8621	ae9cfcb2-f961-49da-b8da-12b444b0f5d2	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	0ee3527e-0209-4764-857b-ebec2ec9759d	\N	\N	\N
a55a905b-846a-4e66-b5f8-0f2b9fb72fe6	274b5f17-e258-42fa-98a8-8026ab1dda3b	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-08-25 08:29:15.217-03	2026-08-25 08:29:37.101-03	21884
d65ad5fb-4df3-4ca9-81cd-e443f4c91ccb	74205d5a-ad22-4d5d-8e9e-8ff7f4b1764c	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-08-24 16:12:53.202-03	2026-08-24 16:13:16.659-03	23457
29388975-cc03-413e-b2ea-8264dab1d83a	9e57ecad-22bb-41e8-9c50-436f045f1ef1	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-08-26 11:53:35.518-03	\N	\N
f4eacaa9-704e-4e58-b1b3-8f2ea506eb3b	df685a05-18aa-41a9-bff0-f76557f43382	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-08-24 17:14:09.319-03	2026-08-24 17:14:38.475-03	29156
dfafd4ce-4fa2-4076-afad-0c7cac4fbe3f	9e57ecad-22bb-41e8-9c50-436f045f1ef1	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
092dac03-040a-4c2d-ac33-9b2ec6341ada	274b5f17-e258-42fa-98a8-8026ab1dda3b	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-08-25 08:29:47.101-03	2026-08-25 08:30:09.888-03	22787
054da903-6624-4a1c-b0fc-f294b3c9c0cd	df685a05-18aa-41a9-bff0-f76557f43382	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-08-24 17:14:48.475-03	2026-08-24 17:15:32.795-03	44320
5064c72f-5640-4802-8e33-411ef3571568	aaf41f60-5c03-46e9-a272-917a5fe5f002	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-08-26 08:39:48.321-03	\N	\N
09ebaefc-620e-4005-88d5-274497e8819c	7e4da671-d9aa-4c99-a964-877c62695706	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-08-24 17:28:12.906-03	2026-08-24 17:28:33.939-03	21033
30ce5538-7a3b-4212-8de3-6c06cbb9ca91	aaf41f60-5c03-46e9-a272-917a5fe5f002	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
4bf73938-b8b0-474b-9860-3b9a72255c5f	a4b52e51-62e3-43da-8b89-8de643bcff99	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-08-26 08:41:16.609-03	\N	\N
3f26af0c-3582-45f7-9b21-3b7958bf07f2	7e4da671-d9aa-4c99-a964-877c62695706	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-08-24 17:28:43.939-03	2026-08-24 17:28:52.715-03	8776
8b1cce4a-3749-431d-8545-27da46976be9	9e57ecad-22bb-41e8-9c50-436f045f1ef1	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	0ee3527e-0209-4764-857b-ebec2ec9759d	\N	\N	\N
c5ddba28-4720-40a1-9334-af2d151771d9	67ec4f0f-92ab-4c25-ba36-64eeacaaaf19	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-08-24 17:31:18.066-03	2026-08-24 17:32:17.021-03	58955
ebf06a31-07a3-44a9-b1a3-b91d6354c3f7	a4b52e51-62e3-43da-8b89-8de643bcff99	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
f9d0d491-3f72-4a6e-9619-d5b369f74bd0	30ee1ebc-e51e-4bd8-a78c-4b63d3465716	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
d50d5781-a2e2-4513-a793-9e4bce63343d	30ee1ebc-e51e-4bd8-a78c-4b63d3465716	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-08-26 11:11:34.093-03	\N	\N
9aed5d2d-5ac8-4361-9778-91e971e8c70b	30ee1ebc-e51e-4bd8-a78c-4b63d3465716	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	0ee3527e-0209-4764-857b-ebec2ec9759d	\N	\N	\N
378a3f18-818c-47aa-a4ac-45d8c4e7b45c	662f400b-84f9-44c3-871a-ee811aacf874	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
fa07cd4f-0ac8-457a-9292-57cf8a23674a	662f400b-84f9-44c3-871a-ee811aacf874	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
ca8da92a-5365-496c-9cf1-a83b6d1990de	662f400b-84f9-44c3-871a-ee811aacf874	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	0ee3527e-0209-4764-857b-ebec2ec9759d	2026-08-26 11:26:23.126-03	\N	\N
6ec9e309-241b-43bb-9e3e-314ae890f1c9	1a40146d-36d9-4a4d-ab9b-29115b12a879	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
fa7d88c3-2204-4f61-8735-8a839551daff	1a40146d-36d9-4a4d-ab9b-29115b12a879	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
a65d41e5-3b53-43ce-8ac3-6f78dd6279e4	1a40146d-36d9-4a4d-ab9b-29115b12a879	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	0ee3527e-0209-4764-857b-ebec2ec9759d	2026-08-26 11:33:02.719-03	\N	\N
815cbbb1-1caf-49ab-b332-bede5df93fcd	3af3fbba-49b2-42a3-8b52-e21c59822268	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
86587a80-50bb-4a75-ac4f-ea08ee9fb252	3af3fbba-49b2-42a3-8b52-e21c59822268	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
99e60c41-b395-4023-9d22-94009c1e2449	3af3fbba-49b2-42a3-8b52-e21c59822268	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	0ee3527e-0209-4764-857b-ebec2ec9759d	2026-08-26 11:50:32.596-03	\N	\N
a6d708ef-d849-4cc8-ab98-bffa165ed914	de0fc0ed-0fbb-47bb-84dd-27a976d3534f	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
e8a8e99e-5bbe-42a0-ac6f-9b3d17a95391	de0fc0ed-0fbb-47bb-84dd-27a976d3534f	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-08-26 12:06:17.261-03	\N	\N
3961e2ae-81fe-4e7a-b23d-df90a1ca65b8	de0fc0ed-0fbb-47bb-84dd-27a976d3534f	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	0ee3527e-0209-4764-857b-ebec2ec9759d	\N	\N	\N
8115835c-0500-4a1a-9007-34bfc6a6372a	527a381b-5c90-4450-8a3b-8d25ed4d924f	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
fd26d287-c1b6-4b9f-a36d-92ecd2d66180	527a381b-5c90-4450-8a3b-8d25ed4d924f	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
7396332e-713c-4cf7-bf85-dc1d3a9663b5	527a381b-5c90-4450-8a3b-8d25ed4d924f	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	0ee3527e-0209-4764-857b-ebec2ec9759d	2026-08-26 12:06:40.465-03	\N	\N
171094b2-4cbd-45ce-b4b3-d60c804bd817	918fb1d1-ea8b-425b-b1a9-c2bfe5522d17	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
51ab241b-8520-40e8-9000-d0d8336a6dbc	918fb1d1-ea8b-425b-b1a9-c2bfe5522d17	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
d85cfd2e-6a11-4add-9746-f74ee76d48ea	918fb1d1-ea8b-425b-b1a9-c2bfe5522d17	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	0ee3527e-0209-4764-857b-ebec2ec9759d	2026-08-26 12:18:17.416-03	\N	\N
16cde845-46d9-4cfa-82d4-747c410cdd73	c5ff3797-7fed-4df5-bd55-cd2365eb51df	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-08-26 13:48:51.693-03	\N	\N
154f79b7-59d1-4180-a9a8-c491277b24cf	c5ff3797-7fed-4df5-bd55-cd2365eb51df	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
1000fba7-6f31-4f4b-9cd8-41c7e587a2c7	c5ff3797-7fed-4df5-bd55-cd2365eb51df	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	0ee3527e-0209-4764-857b-ebec2ec9759d	\N	\N	\N
afc3959e-f986-4131-b34c-ea8c0bcbfbdc	b45521da-2059-4bd5-836b-fe8188e2c591	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-08-26 13:50:44.561-03	\N	\N
06fa191d-af06-4e2f-94b6-b7922263de06	b45521da-2059-4bd5-836b-fe8188e2c591	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
b95fbedc-82aa-470a-ad2c-124d4d027085	b45521da-2059-4bd5-836b-fe8188e2c591	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	0ee3527e-0209-4764-857b-ebec2ec9759d	\N	\N	\N
c5184bee-1cb2-4233-b572-31f78902cf91	39c12855-f6d1-4e68-919b-19489687973e	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-08-26 15:51:00.509-03	\N	\N
ca7c5c23-5458-49e8-8777-37da93017257	39c12855-f6d1-4e68-919b-19489687973e	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
b21ffd95-44cc-4cbb-b8bf-b10053a6b3f9	39c12855-f6d1-4e68-919b-19489687973e	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	0ee3527e-0209-4764-857b-ebec2ec9759d	\N	\N	\N
552eaaa2-79be-47ca-bcec-d411d861a031	86e07dd3-dd9a-4678-a120-3b6181ea14fb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
44301392-a63a-4f38-81b1-51c0f1db5c9f	86e07dd3-dd9a-4678-a120-3b6181ea14fb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
c4105950-cb4a-494a-a100-d985d4f9ac98	86e07dd3-dd9a-4678-a120-3b6181ea14fb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	0ee3527e-0209-4764-857b-ebec2ec9759d	2026-08-28 11:59:25.394-03	\N	\N
a38af0ad-c513-40ba-bc54-09c6dffe3c65	329be53f-ea9f-414b-9c11-747be76be9b6	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
6be12e8f-173f-4d03-9ed8-8cc88fa912f2	329be53f-ea9f-414b-9c11-747be76be9b6	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-08-28 14:07:37.174-03	\N	\N
7dc11fca-5b59-485f-9b94-1d0312868aff	329be53f-ea9f-414b-9c11-747be76be9b6	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	0ee3527e-0209-4764-857b-ebec2ec9759d	\N	\N	\N
9a77a93f-9579-43a1-b721-a584c485b9ec	c6827569-553a-4829-8dd1-080e750a2960	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-08-28 15:43:04.606-03	2026-08-28 15:43:38.29-03	33684
1aaa5510-812d-466e-9b06-a4b3e169adfc	c6827569-553a-4829-8dd1-080e750a2960	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	0ee3527e-0209-4764-857b-ebec2ec9759d	2026-08-28 15:43:48.29-03	2026-08-28 15:44:54.844-03	66554
7300174f-012e-4a5e-878f-a9354ac54a6f	9e1b18d7-1231-41f7-b185-b7a3b563ca51	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-08-31 08:13:33.9-03	2026-08-31 08:17:02.689-03	208789
9b17cc81-1c72-4e46-9689-88d183935e79	c6827569-553a-4829-8dd1-080e750a2960	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-08-28 15:45:04.844-03	2026-08-28 15:45:20.725-03	15881
f8ed83a0-6c29-4a9f-ac14-d9ec38b9e700	fd39ae64-b906-40bd-9a3d-44299fbd95da	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-08-28 16:36:35.073-03	\N	\N
a9377016-0ba2-4879-ad7d-a1007f4a53be	fd39ae64-b906-40bd-9a3d-44299fbd95da	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
2f4f4eb3-1a5f-4ce0-827f-3ad2306f60b0	fd39ae64-b906-40bd-9a3d-44299fbd95da	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	0ee3527e-0209-4764-857b-ebec2ec9759d	\N	\N	\N
6a225f8a-99a0-4410-889d-a1b52706ae3f	6636fd7c-0723-4bf0-8186-5b93f74d68e3	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
c9760dcd-8e6e-49fc-b57e-ea279287090e	6636fd7c-0723-4bf0-8186-5b93f74d68e3	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-08-28 16:37:49.237-03	\N	\N
6379deb9-4377-467c-a463-0c2420893f95	6636fd7c-0723-4bf0-8186-5b93f74d68e3	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	0ee3527e-0209-4764-857b-ebec2ec9759d	\N	\N	\N
b81e7a07-5941-4f6d-be5e-838a147f3238	9e1b18d7-1231-41f7-b185-b7a3b563ca51	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-08-31 08:17:12.689-03	\N	\N
81dcd40c-edd6-4137-93c0-540f11f25dff	2d772826-0d32-42ab-95c7-90534038e5a2	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-08-28 17:37:53.777-03	2026-08-28 17:38:23.796-03	30019
3730d6c1-be32-4e36-98f7-787008091292	2d772826-0d32-42ab-95c7-90534038e5a2	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-08-28 17:36:04.173-03	2026-08-28 17:37:43.777-03	99604
3e1b3444-60bb-4eed-8a2d-faf5a9607440	22185a19-4ef7-4620-94ea-1ce9fd885b29	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	0ee3527e-0209-4764-857b-ebec2ec9759d	\N	\N	\N
2b7bdd27-6636-4e6d-8576-72bc40dad503	49cbf31c-7f0f-46e9-9c08-20ca3f15ccf3	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-08-31 09:34:11.204-03	2026-08-31 09:35:19.218-03	68014
34cf0168-e9b5-4702-8399-f75c50461e71	22185a19-4ef7-4620-94ea-1ce9fd885b29	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-08-31 08:53:59.336-03	2026-08-31 08:57:24.933-03	205597
122dbff3-b138-4001-aa2c-d9e36cc590ea	2d772826-0d32-42ab-95c7-90534038e5a2	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	0ee3527e-0209-4764-857b-ebec2ec9759d	2026-08-28 17:38:33.796-03	2026-08-28 17:40:12.375-03	98579
308adf4d-0c20-49ff-a9c7-99c6a05bc746	9e1b18d7-1231-41f7-b185-b7a3b563ca51	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	0ee3527e-0209-4764-857b-ebec2ec9759d	\N	\N	\N
f6d3f15d-aee4-4e77-90a8-46dc4cad5022	22185a19-4ef7-4620-94ea-1ce9fd885b29	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-08-31 08:57:34.933-03	\N	\N
ea88a36f-4086-45b1-b12c-d8a3c183ed2a	49cbf31c-7f0f-46e9-9c08-20ca3f15ccf3	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-08-31 09:35:29.218-03	2026-08-31 09:36:45.074-03	75856
3853d196-6a59-4761-92a1-22b6c67815dd	002f0d59-a8c2-4d41-9f12-5626fd0e27e9	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
9aa92654-7347-40f2-9293-79881d0b850b	002f0d59-a8c2-4d41-9f12-5626fd0e27e9	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-08-31 09:45:22.556-03	\N	\N
c0a3e06e-bada-4e4b-b861-b06d7a3b96b4	f86e45a6-5d40-47f7-b1b8-6348cba7e212	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-08-31 11:38:09.169-03	\N	\N
3488b823-2e6f-4652-b358-d53ca5bb841e	f86e45a6-5d40-47f7-b1b8-6348cba7e212	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
e4fec19f-7b7d-407d-93f3-3369cf9186f0	2e184515-3724-4c4f-b07f-8e6e175c2bcd	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-08-31 11:38:52.143-03	\N	\N
868d4eff-2a50-44aa-b935-449773b45bb4	2e184515-3724-4c4f-b07f-8e6e175c2bcd	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
0312f6d2-a3d7-4998-a4f3-54261b01c5bc	ffb426c8-80f6-4a5f-a06e-7128ec34bd0b	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
03654a89-809a-4d24-8380-62ee157ac6d3	ffb426c8-80f6-4a5f-a06e-7128ec34bd0b	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-08-31 11:39:09.761-03	\N	\N
dd23eca4-695b-4c01-9f34-4753e1a5acec	67ba47cb-8757-41e6-a885-8ea4b247a951	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-08-31 11:40:40.314-03	2026-08-31 11:41:10.255-03	29941
e3cd6623-01ca-44f8-8e50-039dd4550d28	17f81928-0042-4527-834d-f7a7ea9b3c3c	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-03 13:47:45.374-03	2026-09-03 13:48:50.527-03	65153
a6033035-c4b7-4292-811b-55b58f34622d	04b8bb88-f60a-4258-9fbc-81dff4fefca1	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-03 13:35:44.138-03	2026-09-03 13:36:18.197-03	34059
4ece7013-2409-442d-a868-52814778b4c3	a122de43-4936-4303-bea6-720596fa299a	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-15 16:45:18.694-03	2026-09-15 16:50:12.368-03	293674
e4e34645-cea5-4d3b-84e1-eee0f2ac4cfa	67ba47cb-8757-41e6-a885-8ea4b247a951	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-08-31 11:41:20.255-03	2026-08-31 11:42:01.225-03	40970
bf19037c-28f2-41e5-b5ed-d8f145fedcca	04758f1d-f7dd-416a-b4cf-a004cf8ca769	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-02 10:37:25.594-03	2026-09-02 10:38:37.972-03	72378
ddb9175b-7f8c-4ee0-af75-ac3b73e4f096	86a7d9fa-730e-49ec-a99d-277d05a36e49	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-15 17:04:30.099-03	\N	\N
cbe4f0b7-c071-4d8b-a373-c55613308c35	04758f1d-f7dd-416a-b4cf-a004cf8ca769	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-02 10:38:47.972-03	2026-09-02 10:39:57.076-03	69104
3fd377a5-a36c-4a80-90f1-4f7ff4f02bd1	5d8c8b0e-7077-442b-9da8-162566006264	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-02 10:53:00.939-03	2026-09-02 10:53:08.463-03	7524
97710a99-0ad9-4bed-964a-fe33b4b0ede4	04b8bb88-f60a-4258-9fbc-81dff4fefca1	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-03 13:36:28.197-03	2026-09-03 13:36:54.937-03	26740
dbe2bc8e-b158-496f-82d3-23df600544c0	5d8c8b0e-7077-442b-9da8-162566006264	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-02 10:53:18.463-03	2026-09-02 10:53:26.235-03	7772
d7db7ad4-42a8-4d92-ac95-338e7995d393	f4adf239-3eef-4d97-bacb-8e1f0310714e	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-02 10:54:25.192-03	2026-09-02 10:54:33.657-03	8465
de8b2b5e-c0e6-4efc-827e-e6b22c20dea4	f4adf239-3eef-4d97-bacb-8e1f0310714e	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-02 10:54:43.657-03	2026-09-02 10:54:48.418-03	4761
a1aab02c-acd1-442c-bf2e-56be286d79ff	37dd3e56-55ba-4293-b560-d45c8d867705	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-02 11:10:43.942-03	2026-09-02 11:11:00.52-03	16578
fc59da9c-0b0a-4cb6-8031-f723857198e3	37dd3e56-55ba-4293-b560-d45c8d867705	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-02 11:11:10.52-03	2026-09-02 11:11:14.724-03	4204
0e2ad3f2-31f3-4821-ada4-97050bda017f	1d13ca2d-12d1-4073-81fb-8c5d72402bab	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-02 11:11:33.059-03	2026-09-02 11:11:39.257-03	6198
03ff5231-4f4c-467b-8be1-04f2c6f25104	a122de43-4936-4303-bea6-720596fa299a	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-15 16:50:22.368-03	2026-09-15 16:50:53.422-03	31054
f520164c-1d44-4af6-805b-93ef1d02e62e	1d13ca2d-12d1-4073-81fb-8c5d72402bab	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-02 11:11:49.257-03	2026-09-02 11:11:53.484-03	4227
687dcb0b-5a3c-4580-9705-3f9de9ae7e8d	17f81928-0042-4527-834d-f7a7ea9b3c3c	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-03 13:49:00.527-03	2026-09-03 13:50:16.806-03	76279
937f95e2-20c2-40fc-986d-467cf3681641	a6563902-76b3-4b8d-a995-74cd6afb66ea	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-03 17:27:18.341-03	\N	\N
5bb13b44-adf9-4064-9929-9eb150a00e5d	a3893b99-24ce-4c41-ac3b-7f22102b2155	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-03 13:42:22.351-03	2026-09-03 13:42:45.521-03	23170
bfd837ab-9790-4787-bf46-7dd3b3f7b15f	a6563902-76b3-4b8d-a995-74cd6afb66ea	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
2b7bd6d4-8e69-44cb-b60c-ec3d8e5b0499	a3893b99-24ce-4c41-ac3b-7f22102b2155	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-03 13:42:55.521-03	2026-09-03 13:43:40.251-03	44730
03f67d0d-fea7-41df-98fd-8e9adfe8b490	0937c6fe-b82a-4060-a46f-e681a5172216	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-10 13:11:42.605-03	2026-09-10 13:12:33.291-03	50686
4bffdcfd-c4f7-4e3b-881a-bdb5d2452360	42181ca8-766c-4a05-a97d-57c456ac3101	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-15 16:51:29.977-03	\N	\N
8f11de88-e5e5-490b-865d-3721796e96b7	42181ca8-766c-4a05-a97d-57c456ac3101	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
50a20b80-a3cb-4267-ba37-dcbe3967d1d0	0937c6fe-b82a-4060-a46f-e681a5172216	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-10 13:12:43.291-03	2026-09-10 13:13:02.485-03	19194
84e9e3ab-49f3-4eb2-850a-127702573f9c	f6f08415-c73e-4531-82cb-246a425b3c6d	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
6e0c3fdd-49f7-40f4-a288-a1ae16f4bda4	f6f08415-c73e-4531-82cb-246a425b3c6d	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-15 16:06:37.215-03	\N	\N
4a7d588e-f6ef-419e-b0fd-6cd2077899ee	008c38f8-1633-4428-aa3e-8998b4adc0a3	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
51b00672-6b37-45ee-9e6d-ce54f6f35c93	008c38f8-1633-4428-aa3e-8998b4adc0a3	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-15 16:32:24.293-03	\N	\N
581cea01-fe97-40c7-bfdc-8338cae22ab1	7e377d83-0d7c-41bf-87e9-b800725658ec	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-15 17:01:00.165-03	\N	\N
f803bd03-d99b-4de6-a141-835e91178a4f	7e377d83-0d7c-41bf-87e9-b800725658ec	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
7281cfcf-7df4-4d10-b449-2fc00fea634d	86a7d9fa-730e-49ec-a99d-277d05a36e49	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
dfe1c2ca-f131-4153-aed6-9621d244c5a8	7ea064f4-5172-41ba-9e64-c7dc606c7412	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
8bac9ea0-6cda-4419-a4d5-2780d80e02b8	7ea064f4-5172-41ba-9e64-c7dc606c7412	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-15 17:06:36.967-03	\N	\N
929e1ffd-e98d-4dc7-a163-670ed29314f5	33c46b7e-6704-401a-99b3-70b0b6d3c245	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
89be0aa8-b1a9-454e-8984-e89c62b8c7bd	33c46b7e-6704-401a-99b3-70b0b6d3c245	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-15 17:15:25.246-03	\N	\N
84b27211-d62a-4fe3-97ac-6fed7e8a9610	b60e7cd4-4d9f-4887-bfb9-271b13b34882	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
7eb7093c-2ea1-424f-bde6-f454a38c3563	b60e7cd4-4d9f-4887-bfb9-271b13b34882	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-15 17:16:12.18-03	\N	\N
c7725474-0399-442c-abc2-8266f769d9f9	ab9648cc-ccdb-42d1-9da6-f6f076368fd2	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
b327f284-589b-44d3-b908-9e3ba22933ec	ab9648cc-ccdb-42d1-9da6-f6f076368fd2	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-16 08:17:14.367-03	\N	\N
9eb06aff-fadd-4182-b7d9-606167bc3f52	e929c5f0-490f-4b83-a689-52892bc15763	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
e298b3f2-edfe-4ed1-8d4e-7c0931d336c7	e929c5f0-490f-4b83-a689-52892bc15763	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-16 08:27:08.391-03	\N	\N
1e1e74d1-135d-4564-9958-d1c3ae9d0557	814bc1ff-b7b5-48d0-9f13-34eda1c7a3db	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-16 08:43:45.773-03	2026-09-16 09:47:15.452-03	3809679
9f9428ee-2f08-46b9-a342-360607d8501e	814bc1ff-b7b5-48d0-9f13-34eda1c7a3db	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-16 09:47:25.452-03	\N	\N
e9cce738-3928-457a-be1d-6c2c6b4982b9	74502c0a-0d06-49a5-9164-ed3cddf4a81f	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
bf4958a5-1f64-4c8b-9fe0-247aea909172	74502c0a-0d06-49a5-9164-ed3cddf4a81f	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-16 10:11:27.192-03	\N	\N
40c4fba1-90ff-4d9c-bb6e-d5b77eb58191	7d8ce58e-cd35-4983-beaf-f6950982cb1c	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
aa9785e1-992e-424e-82da-09c434b186d1	7d8ce58e-cd35-4983-beaf-f6950982cb1c	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-16 10:17:30.107-03	\N	\N
9d45862b-b06b-4f99-9b01-b9c842129fdb	c1d04bd5-17f0-4e13-b5e0-06fab6adf33f	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
9d4ce37b-1b8e-4d0a-ae81-babf119f225b	c1d04bd5-17f0-4e13-b5e0-06fab6adf33f	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-16 10:18:21.856-03	\N	\N
0059f65a-c0ff-4bad-a138-04a3d427c6ae	04d1ce30-644e-4a85-ae5e-25cfe34a4406	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-16 10:21:45.845-03	\N	\N
0a9d4484-ef7b-4ed2-942f-82c436d150d1	04d1ce30-644e-4a85-ae5e-25cfe34a4406	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
d2751d07-7679-44fc-a52b-c5f876fad410	5fddce13-dcd4-4663-9d86-63b7b6fc9a06	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
00632dee-5768-4995-bb4b-bccee7550ede	5fddce13-dcd4-4663-9d86-63b7b6fc9a06	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-16 10:26:08.103-03	\N	\N
7d3a59dd-611e-4a76-9891-35b66e08c00b	974a8efa-94bd-4442-9e5a-dad880c89263	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-16 11:05:58.792-03	2026-09-16 11:06:08.394-03	9602
8f59d8b7-71cf-43db-b47b-4a4b0aa4f5da	974a8efa-94bd-4442-9e5a-dad880c89263	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-16 11:06:18.394-03	2026-09-16 11:06:55.868-03	37474
03327e35-6580-49b9-bc6b-b7abfcb39e2b	5c198983-6505-4a0f-a121-0b99960b9071	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
1d98d648-5fdf-4e7a-a1ab-d871ac73c0f3	5c198983-6505-4a0f-a121-0b99960b9071	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-16 11:16:16.289-03	\N	\N
39c72ae4-d060-467b-abd5-23f4cc8a3474	9f19ad78-82e9-49e7-8ec7-b8aa78b38f6d	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-16 11:21:14.484-03	2026-09-16 11:22:37.655-03	83171
1ec20658-8398-4289-92bc-56ce430766a1	9f19ad78-82e9-49e7-8ec7-b8aa78b38f6d	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-16 11:22:47.655-03	2026-09-16 11:22:52.601-03	4946
c6cbb0fa-c6c3-4d1a-acfd-33e1773ea93f	0f678e10-5fcb-415c-8b9b-eab192cf4ed5	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-16 11:23:28.176-03	2026-09-16 11:23:32.412-03	4236
6da96502-638c-4689-bf2e-808cea3f95c6	3471bc6c-391c-4f0e-8485-950411e0f139	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-17 17:32:09.868-03	\N	\N
82bc9583-238a-4815-8171-fe2830a545a1	0f678e10-5fcb-415c-8b9b-eab192cf4ed5	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-16 11:23:42.412-03	2026-09-16 11:23:47.932-03	5520
183f1980-dff3-432b-a11b-062cfc155691	3338dc75-405b-4c62-b9c6-ff9ed8148ff8	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-16 11:24:14.931-03	2026-09-16 11:24:41.188-03	26257
3ee6da08-3274-44a7-8e10-72025c77a7b2	3471bc6c-391c-4f0e-8485-950411e0f139	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
fa60319b-4ef1-4112-b2e8-224375f5efdc	3338dc75-405b-4c62-b9c6-ff9ed8148ff8	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-16 11:24:51.188-03	2026-09-16 11:24:58.26-03	7072
4589da11-8158-431d-8bcc-3be2363d3c4f	39ef45e3-0123-4c65-98e2-ebb81bd1f125	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
df3798b3-1535-4d55-be23-57d5f246dacf	39ef45e3-0123-4c65-98e2-ebb81bd1f125	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-16 16:41:57.944-03	\N	\N
9807d6ef-aaea-4802-aec2-a522eec5ce7d	dabd2c55-a42e-4cd5-a237-444d32d24e47	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-17 15:36:00.713-03	2026-09-17 15:36:42.386-03	41673
fb1cccd9-fec7-403a-a2b6-4f769e5b5d71	70ea1475-15d4-4cdd-a68c-e1590dfe55d6	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
d350f2a3-b687-4034-b317-ca4c4100fb05	70ea1475-15d4-4cdd-a68c-e1590dfe55d6	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-18 09:33:45.587-03	\N	\N
d41bc29e-89ae-4e0d-9f56-025c7dc767db	dabd2c55-a42e-4cd5-a237-444d32d24e47	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-17 15:36:52.386-03	2026-09-17 15:37:13.907-03	21521
9aecce0a-0c84-4f90-8af2-ca77f2b80b6e	40903033-5cd1-4ffb-9f94-1ed2f9fb9f40	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-17 16:14:17.171-03	\N	\N
6aa8383a-70ee-4f61-a5fc-4d0bc81d2eeb	40903033-5cd1-4ffb-9f94-1ed2f9fb9f40	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
e834621a-592e-48be-b105-a35fcea64c6a	08cce837-1026-42f4-8913-fa8cf50b14b9	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
923ad009-5a83-4ede-8966-b907c20c4299	08cce837-1026-42f4-8913-fa8cf50b14b9	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-17 16:22:56.728-03	\N	\N
ccd46951-c711-4042-8124-1c756d6aa464	ec796731-deb3-4a97-a6c0-905f89aab0ed	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-18 09:45:09.536-03	2026-09-18 09:45:56.455-03	46919
8e756f0f-d32c-4403-8288-220f81368b2c	ec796731-deb3-4a97-a6c0-905f89aab0ed	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-18 09:46:06.455-03	\N	\N
952e70a9-0d29-4657-866e-10e91454b724	d796f0df-9604-4400-957e-93428a715500	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-18 09:53:43.614-03	2026-09-18 09:54:11.145-03	27531
13e449be-1893-4324-91ea-fcfcf440add7	d796f0df-9604-4400-957e-93428a715500	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-18 09:54:21.145-03	2026-09-18 09:54:42.452-03	21307
29551e95-840f-49d6-8a66-6aab50b44226	7b502969-e309-4aca-a014-ee4ca0d3070b	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
7c033249-fc3b-4530-a986-befe6643b37d	7b502969-e309-4aca-a014-ee4ca0d3070b	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-18 09:56:53.327-03	\N	\N
ab632df5-7240-4420-a826-08219a062f81	7b0745d9-ae7f-48fa-9999-9abbd858d205	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-18 10:01:23.087-03	\N	\N
846fb23e-026a-4d5b-ae31-d900ec8dec95	7b0745d9-ae7f-48fa-9999-9abbd858d205	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
621474d2-1f98-4ba5-be6d-10777b3f349e	ac392b27-6f71-4c5d-aa22-215440a84ef2	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-18 10:08:34.106-03	\N	\N
0c273e2c-f170-48be-b51a-5c4f5cb32a61	ac392b27-6f71-4c5d-aa22-215440a84ef2	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
8246a1c4-5c14-426f-bb1e-ddb0a40e9478	0d77cb23-da2b-4f56-9a87-f84a9eef3387	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-18 10:10:51.616-03	\N	\N
5c8369ef-fdae-4f11-af04-ba5c0be0c9b7	0d77cb23-da2b-4f56-9a87-f84a9eef3387	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
9642995f-d3f8-4d22-bebc-69078a5863a4	ad9ae259-9cb1-48c3-8cf6-fbb5f36b7b3e	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-18 10:21:50.004-03	\N	\N
92c97c63-e148-4f39-94a3-af01bc9e4f1c	ad9ae259-9cb1-48c3-8cf6-fbb5f36b7b3e	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
5599c489-fd1c-454a-9eab-1cbf550620da	f2391ba4-61bb-442c-8a18-98d227c20b86	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-18 10:23:50.341-03	\N	\N
642f8753-adc7-4ce7-8922-f6a7021d55f4	f2391ba4-61bb-442c-8a18-98d227c20b86	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
8cd2a5d3-7685-461e-92cd-60ee99f83be8	0174e8a0-769f-4ab3-880f-32ba3a73c06c	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-18 10:35:53.424-03	\N	\N
5bcf6ac4-5d65-4d2e-abdd-3cf6a8b0cc64	0174e8a0-769f-4ab3-880f-32ba3a73c06c	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
00e568e4-f36b-496f-8927-ba0056ae0442	b63b9089-87ce-4be1-8c59-55148b376307	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
69cecf1a-b090-45df-af9d-e51e3f06068a	b63b9089-87ce-4be1-8c59-55148b376307	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-18 11:12:12.8-03	\N	\N
91e21d15-c36d-4dbe-9f30-98f84c1d4ca5	594d824a-2796-4da8-906b-75f1cbc28cef	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
237b5764-38bd-410f-9b4d-92ee64b40ef5	594d824a-2796-4da8-906b-75f1cbc28cef	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-18 13:34:04.117-03	\N	\N
b483abda-4ba0-4aae-b172-f91e7300e3c6	6e702d66-e2fe-4d38-aecd-c09723483dd6	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
bfebe74f-51e2-4cea-82c0-919b2a900f04	6e702d66-e2fe-4d38-aecd-c09723483dd6	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-18 13:41:47.338-03	\N	\N
61717b88-b826-4b40-a79a-ce2eba773ccd	4c6e4e3a-b23c-43ba-9f59-eb802ba3b9dd	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
c150f61a-1eda-4415-adec-a37dcaf2b204	4c6e4e3a-b23c-43ba-9f59-eb802ba3b9dd	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-18 13:51:16.832-03	\N	\N
e9411705-87fe-477f-b4fc-dbcb50731e31	c7e387d3-244e-456b-995f-7a99e1553c7e	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
117100e4-7f40-4880-b25a-ee2896c8fcc0	c7e387d3-244e-456b-995f-7a99e1553c7e	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-18 13:56:11.343-03	\N	\N
9d9ba4a5-5fc1-4c24-ac71-9901ebb53b67	b524a314-cb8a-425d-9a95-788286d9f008	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
29147465-76d2-4619-b00d-d2bf31c1d7a9	b524a314-cb8a-425d-9a95-788286d9f008	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-18 13:59:36.609-03	\N	\N
bb94fee3-5424-4bad-b4f2-534cd0c265ac	56f3c18b-32c7-4070-8250-12400159a5d9	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-18 14:17:30.243-03	\N	\N
04fab537-a6c4-410d-a4a3-07a36673ea4c	56f3c18b-32c7-4070-8250-12400159a5d9	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
c4ad9b2b-e2d4-493e-8144-3ed2d8bdcffb	3168960b-0e10-446b-88c7-bd898ff9d6e5	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
a5c31821-c6cd-4b9d-8520-11e06e6374c4	3168960b-0e10-446b-88c7-bd898ff9d6e5	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-18 14:19:33.663-03	\N	\N
f3e84ae5-08ef-4c8d-a0df-f647f9104ec5	5cbc2b6a-3909-4e48-8dae-5e6cef6455ab	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
d340b846-03e2-4e3c-98de-eca1e7b1998d	b3af38fd-d459-4e52-abed-1cb75d6dffc1	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-18 17:20:06.123-03	\N	\N
db83ca92-f956-47cf-8ea0-2786b49accf1	7c9e99b9-8192-4983-ab9e-2fc0c84cac52	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-18 14:35:43.775-03	2026-09-18 14:38:01.116-03	137341
bd141afa-80a2-415a-804a-cbc25792e068	8734d474-9b3d-4816-9bcf-3fe779b21e6e	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-18 16:35:24.287-03	2026-09-18 16:35:45.954-03	21667
ea88d428-a6d4-44ab-b67b-778416b368cb	6ce44061-1f80-4a10-b4b5-1dd2dc4aa92e	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-18 16:48:01.771-03	2026-09-18 16:48:33.482-03	31711
aa3b9dc4-8f22-48ea-aa58-179e0627b566	6ce44061-1f80-4a10-b4b5-1dd2dc4aa92e	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-18 16:48:43.482-03	\N	\N
7ac4aeba-163f-48cd-80e4-a7ac80744e84	7c9e99b9-8192-4983-ab9e-2fc0c84cac52	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-18 14:38:11.116-03	2026-09-18 14:38:29.776-03	18660
170e5869-9c18-4adc-a8b6-2659ea202c28	8fda78da-97bf-4925-93b7-144ef71a2ec6	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
9a466249-090e-4a1d-915f-05be8f65c3c1	8fda78da-97bf-4925-93b7-144ef71a2ec6	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-18 16:33:02.873-03	\N	\N
0cc25dff-b0c4-42d1-b499-eab7cf8dd939	8734d474-9b3d-4816-9bcf-3fe779b21e6e	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-18 16:35:55.954-03	2026-09-18 16:36:22.824-03	26870
f8796092-78d2-475e-9e96-993fc2a443ff	b3af38fd-d459-4e52-abed-1cb75d6dffc1	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
1e3c772e-f4a4-4185-a727-2965aefef5d1	b1d59e92-5fe9-48c7-955d-752ff04efce9	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
84b0ad23-e989-4c69-8d06-0eb20b4b2fae	b1d59e92-5fe9-48c7-955d-752ff04efce9	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-18 17:37:04.754-03	\N	\N
fa0c719d-3097-4405-bf0c-4a1a676037df	5cbc2b6a-3909-4e48-8dae-5e6cef6455ab	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-21 09:13:39.682-03	\N	\N
07681036-b28b-45b0-8905-57239fdba725	1f10f31f-ec24-49f8-baa6-841c816bf170	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
0a03331d-0eef-4db8-bdf6-f128ddbacb88	1f10f31f-ec24-49f8-baa6-841c816bf170	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-21 11:35:44.863-03	\N	\N
2a0b9b7d-0df8-4e7d-afb1-eae3ca364ce6	3be2fcf7-68bf-4c0b-b070-ebd7715a8eb1	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
5bdea85d-b648-419f-8ca1-d623ce646d59	3be2fcf7-68bf-4c0b-b070-ebd7715a8eb1	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-21 13:41:09.458-03	\N	\N
1ae10ca9-6819-45dc-873c-267f1151a280	b9c2a905-f312-471b-98e5-7b66d90048a6	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
58fa3721-5471-46fd-8ddd-2f0f52630d59	b9c2a905-f312-471b-98e5-7b66d90048a6	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-22 17:18:47.213-03	\N	\N
2c2686f6-796d-42d6-80f0-b27e6898e531	129f05c8-025e-4cc0-a0a2-cba45358e568	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
8a41d4d2-4160-46f4-8d9d-f8174fe33bd9	129f05c8-025e-4cc0-a0a2-cba45358e568	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-23 11:32:24.644-03	\N	\N
e6c400ff-efce-4aec-a3f4-d8f281eb02f3	6c88ab81-c0c2-45b1-886b-c4c862af9d83	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-23 15:58:14.486-03	2026-09-23 15:58:18.718-03	4232
2adbe2c5-788a-498e-8d27-394326149ecc	7cdfd7b4-70f4-44ff-9527-63cfdcbf3b52	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-23 11:32:48.146-03	2026-09-23 11:34:42.743-03	114597
52fd4ea7-8080-4d10-9f51-fc4e9b8d4e37	c133625e-bd20-468f-9f3b-d8364b02f7e1	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-23 16:03:07.44-03	\N	\N
8a43aeaf-e72a-4173-b496-aa6e97082821	c133625e-bd20-468f-9f3b-d8364b02f7e1	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
2de6e72b-5734-430b-9344-6e129c7dfbc8	7cdfd7b4-70f4-44ff-9527-63cfdcbf3b52	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-23 11:34:52.743-03	2026-09-23 11:35:12.077-03	19334
dc45f358-94cc-4961-a8b3-9761de1c10c1	0bb4b716-98fd-490b-bb1f-fb4a300d2ee1	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-23 16:12:45.065-03	\N	\N
e87c6190-2eb3-4ba1-9f05-7cd8e1750c76	b1aa251f-14be-4573-9075-c9fe9204f347	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-23 11:37:06.396-03	2026-09-23 11:38:20.795-03	74399
b301f123-5dec-44f6-aba0-c64249b22f11	b1aa251f-14be-4573-9075-c9fe9204f347	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-23 11:38:30.795-03	\N	\N
e61bf5ee-bff6-48c7-8eaa-fb2987a5a57c	0bb4b716-98fd-490b-bb1f-fb4a300d2ee1	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
3f0ea34f-edae-4757-81ad-2471d8002e8d	21ea8f11-b6e8-44e3-a87e-bc03783d612f	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-23 12:21:22.966-03	2026-09-23 12:22:09.699-03	46733
65283f7d-1e45-4b2d-8ac2-8ce1e7603d83	21ea8f11-b6e8-44e3-a87e-bc03783d612f	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-23 12:22:19.699-03	2026-09-23 12:23:27.87-03	68171
3d7bd951-092c-40ad-bb62-8aa96213d896	4c7bd6a3-da58-4efd-b409-adfbe13baa7b	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-23 13:36:44.563-03	2026-09-23 13:36:53.776-03	9213
16683b55-8321-4841-b542-392060a6f75b	dea288c1-e3ff-4a84-9733-383639d00389	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-23 16:39:00.544-03	2026-09-23 16:40:43.054-03	102510
afa747b9-b2c6-4422-b4e3-b8c9d7f39c2b	4c7bd6a3-da58-4efd-b409-adfbe13baa7b	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-23 13:37:03.776-03	2026-09-23 13:38:42.36-03	98584
8098d118-2fa5-4ed1-a188-553e15e88220	fce702ce-51ff-46bf-936e-c3c505af4b82	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-23 13:40:02.898-03	\N	\N
4d7f4148-0352-4831-8bd4-9bd6d83f5342	fce702ce-51ff-46bf-936e-c3c505af4b82	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
8d03e285-e306-4fdd-b56c-f43044b14ebb	fff1b1cf-1a58-42df-aed4-c40398c15f57	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
f5b245ad-9d00-4402-9dca-b7fbcef3fe2d	fff1b1cf-1a58-42df-aed4-c40398c15f57	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-23 13:49:06.235-03	\N	\N
7dabc601-a10e-47e1-8d78-a64677ae337b	fd5dc4f1-7342-4d51-9de6-49f371615d1a	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
7994e2dd-001c-463a-b382-336ddcedad11	fd5dc4f1-7342-4d51-9de6-49f371615d1a	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-23 15:31:06.384-03	\N	\N
39c50e1a-4fb7-4f47-91e2-36641e84d197	6c88ab81-c0c2-45b1-886b-c4c862af9d83	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-23 15:57:49.888-03	2026-09-23 15:58:04.486-03	14598
a2daabcc-6664-4675-9dd3-9595a46de9e7	dea288c1-e3ff-4a84-9733-383639d00389	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-23 16:40:53.054-03	2026-09-23 16:45:30.709-03	277655
3fd321cd-1da2-4871-9f88-90a9841b2002	fca0605e-dfd5-4479-895e-1699b973711e	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-23 16:45:45.449-03	2026-09-23 16:45:59.57-03	14121
2e0d79dd-4149-461e-b27c-512a4c86b902	fca0605e-dfd5-4479-895e-1699b973711e	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-23 16:46:09.57-03	\N	\N
21916c2a-04ce-4f94-a365-8d0de50e8452	1a07be1b-3cc6-4ae8-bce6-7c168ea5d09a	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-23 17:00:45.233-03	\N	\N
9a719fc3-80d1-4be6-a20b-5e2eb3d460ac	1a07be1b-3cc6-4ae8-bce6-7c168ea5d09a	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
bbff2311-5282-4ba3-accd-f870c7552be4	5df2bdfe-ac0f-4a0e-ac0c-88bc37f6830a	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-23 17:16:55.874-03	\N	\N
5b8f319a-f1a6-4247-8a15-82a0c6704340	5df2bdfe-ac0f-4a0e-ac0c-88bc37f6830a	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
5d9c4926-15e3-47b0-9415-8fa434a7a0a8	af7e20d0-04cb-4415-b79e-6e355edd69cd	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-23 17:17:40.015-03	2026-09-23 17:18:15.929-03	35914
577d8b96-259c-4bea-94ee-a18df5799ee1	342fbdf3-a113-4aa3-aed8-1dacc2829c94	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-23 17:29:54.153-03	2026-09-23 17:29:58.867-03	4714
3c142fb0-4bc4-4488-83a0-6a4db8d412dc	af7e20d0-04cb-4415-b79e-6e355edd69cd	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-23 17:18:25.929-03	2026-09-23 17:29:31.028-03	665099
0dff767b-1d98-46ef-a75f-66d701e52c3f	342fbdf3-a113-4aa3-aed8-1dacc2829c94	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-23 17:30:08.867-03	2026-09-23 17:30:15.752-03	6885
2987a027-0f0e-458d-a3af-9a19713dd306	205ff02f-7cc7-48ed-9d1c-c7bf7f42e72d	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-23 17:45:57.771-03	2026-09-23 17:46:08.477-03	10706
ea3abb45-16c6-44fe-a2dd-c71a9cb9c88a	1c46d8c6-1c4c-401c-a739-805afd207eca	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
5eddda79-b444-46f8-837e-5fdf3259c19d	205ff02f-7cc7-48ed-9d1c-c7bf7f42e72d	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-23 17:46:18.477-03	2026-09-23 17:46:25.382-03	6905
dee8133e-48bf-4426-8503-7f93ea833c84	1c46d8c6-1c4c-401c-a739-805afd207eca	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-25 10:28:09.628-03	\N	\N
4de5dfaf-7a2e-4680-8624-2589134f4cfe	c2e2be24-3782-42e0-b71f-a9962da5ae70	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-25 11:44:18.339-03	\N	\N
6095446d-b2bf-4dac-be90-7bd22010f394	c2e2be24-3782-42e0-b71f-a9962da5ae70	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
f4f4677e-1740-4db9-84ee-825b1128a616	e43f8055-f804-4daa-ae36-fcd6e2ce3db1	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
920ce428-3987-459e-8569-cf00d58c8c50	e43f8055-f804-4daa-ae36-fcd6e2ce3db1	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-25 11:44:36.152-03	\N	\N
598ca0d5-fefd-4eb4-aabc-f377508dd4cd	6991cb74-0309-4a7a-812b-b4ab9a926b0b	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
3f9e55f7-5646-4e99-b56c-ae7a0518cb08	6991cb74-0309-4a7a-812b-b4ab9a926b0b	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-25 11:45:25.393-03	\N	\N
720e0e09-bbe4-4f77-bee7-375a519fcd5a	a0daf023-76c0-4618-98b2-ca80a3425276	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-25 15:52:41.692-03	2026-09-25 15:53:28.414-03	46722
e920da89-a727-4ee4-99d4-4fce1d0a77b1	a0daf023-76c0-4618-98b2-ca80a3425276	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-25 15:53:38.414-03	2026-09-25 15:54:16.5-03	38086
968b9309-59fe-4780-9031-8de84282fac8	02e56e35-4196-4bf9-bc49-8385d548b853	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-29 09:00:56.326-03	\N	\N
97a5aaf2-3f99-4358-9202-052fc1615d60	02e56e35-4196-4bf9-bc49-8385d548b853	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	\N	\N	\N
ffab6086-55d9-4fc0-9608-2012e117ad45	fc372c3f-d5ab-4ff2-a3a6-f2cdbb4cbf25	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	\N	\N	\N
aa49db0a-b309-4524-a514-3f494ecce6eb	fc372c3f-d5ab-4ff2-a3a6-f2cdbb4cbf25	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	2026-09-29 16:26:54.417-03	\N	\N
ebad0aa1-1ba7-4c31-bea1-6d69a3105219	b52f378d-3a6d-4f43-a5cd-be8b011437d8	c920334b-c141-47ea-a791-dd2c9828be58	697df292-ec0f-40e5-97d5-1c77c6e539ff	2026-10-05 13:52:55.815-03	2026-10-05 13:53:28.308-03	32493
058f5fa9-393a-48a0-932d-9e65ab5a791f	b52f378d-3a6d-4f43-a5cd-be8b011437d8	c920334b-c141-47ea-a791-dd2c9828be58	3e781f1a-bd88-426c-b2de-d47f2489cc65	2026-10-05 13:53:38.308-03	2026-10-05 13:54:15.187-03	36879
77da7c0f-8f8a-4fa6-9681-a778a02338e5	2efcad1b-abc7-4077-b04f-5d1b8706ef5d	4695594c-19e9-493f-86a9-dfe79941400e	aea6e59c-7626-4e57-964a-5bf49620b671	2026-10-01 14:46:31.302-03	\N	\N
d5ec9f3f-0552-4875-b92c-fe824f051f68	2efcad1b-abc7-4077-b04f-5d1b8706ef5d	4695594c-19e9-493f-86a9-dfe79941400e	e4feef99-4920-4c40-b3c2-1c3a31c62f08	\N	\N	\N
\.


--
-- Data for Name: chamadosSuport; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."chamadosSuport" ("ticketId", "empresaId", cliente, assunto, status, prioridade, descricao, "atribuidoPara", "criadoEm", "atualizadoEm") FROM stdin;
\.


--
-- Data for Name: clientes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.clientes ("clienteId", nome, cidade, estado, email, telefone, plano, status, "eventosRealizados", "ultimoAcesso", "criadoEm", empresa_id, address, backup_frequency, logo_data, logo_name, logo_type) FROM stdin;
4e73b030-1bb1-4efc-b339-2cf7c5afc46b	buffet alegria	embu	sp	admin@buffet.com.br	1199584756	starter	active	0	\N	2026-07-13 13:15:24.7-03	\N	\N	daily	\N	\N	\N
8073e548-eb4c-469b-b028-7b21f4c373a6	Buffet Teste	São Paulo	SP	teste@buffet.com	(11) 99999-9999	starter	active	-13	\N	2026-06-11 08:58:43.997-03	\N	\N	daily	\N	\N	\N
c87ce8a4-ad3a-476f-b574-c9cc1cb97dcf	buffet maria das rosas	embu	SP	teste@gmail.com	11998456789	starter	active	0	\N	2026-07-13 12:31:33.933-03	\N	\N	daily	\N	\N	\N
cliente-teste-1	Pullyn Teste	Cotia	SP	teste@teste.com	11999999999	starter	active	-5	\N	2026-07-08 12:40:12.897-03	\N	\N	daily	\N	\N	\N
9122bde4-634d-4d45-b69b-5ff6ede4a7fd	Buffet ADV	taboao	sp	contato@advbuffet.com	(11) 99487-5644	starter	active	0	\N	2026-07-15 12:31:54.113-03	c9287e4b-399d-4764-8bff-2e0ce7058dcb	Rua Varicano 121, Cotia	daily	data:image/jpeg;base64,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	Logo teste.jpg	image/jpeg
\.


--
-- Data for Name: codigosVinculoFamiliar; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."codigosVinculoFamiliar" (id, crianca_id, evento_id, empresa_id, qr_code_value, tracking_url, status, created_at, expires_at, used_at, used_by_login_id) FROM stdin;
\.


--
-- Data for Name: configuracoes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.configuracoes ("settingId", setting_key, setting_value, updated_at, empresa_id) FROM stdin;
\.


--
-- Data for Name: conquistas; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.conquistas ("conquistaId", nome, descricao, icone, cor, "tipoRequerido", "valorRequerido", "pontosBonus", "criadoEm") FROM stdin;
\.


--
-- Data for Name: conviteFamilia; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."conviteFamilia" ("conviteId", "empresaId", "eventoId", "criancaId", email, "hashToken", status, "expiramEm", "usadoEm", "criadoPor", "criadoEm") FROM stdin;
c4cde193-d125-4f4c-8456-38e6e4c56fc9	c9287e4b-399d-4764-8bff-2e0ce7058dcb	cb2c9907-c412-4cf3-9b36-59b41e5e9d0b	\N	\N	f4f8c18990c58d3b88fa23f252ff0ae78f0ae4f33f1bd739bfe4f90dffbd8005	used	2026-08-04 13:51:52.197-03	2026-07-28 13:53:33.214865-03	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-07-28 13:51:52.202309-03
10c52790-0c63-4164-aecd-971680f434f4	c9287e4b-399d-4764-8bff-2e0ce7058dcb	cb2c9907-c412-4cf3-9b36-59b41e5e9d0b	\N	\N	44b204109d79d4f65d8b7e839e68ec92ac0127e9219c13f5c584e0254387e7f8	used	2026-08-04 13:58:26.908-03	2026-07-28 13:59:29.180995-03	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-07-28 13:58:26.912993-03
08b8f604-2a51-4b0e-b3d4-a5fa5b69b43c	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	\N	\N	5d48ad75b5c1c29f1aa54918319bf6aa398800545f73bd796dc21f999fb052c4	used	2026-09-08 11:49:49.623-03	2026-09-01 11:50:26.233279-03	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-01 11:49:49.620808-03
ea6da151-7889-4380-8b3b-57a2d03b1fc5	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	\N	\N	0c2b72faad47678903ca3c96e9feb0ade7015e6133e1ae5be7ed079dd7c6aa35	pending	2026-09-29 11:38:26.505-03	\N	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-22 11:38:26.502095-03
11f94821-6d1f-4b17-b495-3b6fca7c84de	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	\N	\N	e8b9ffbd6a499945e2c936d922e9a957184ddc0a91c148c3a38ea72c1572602a	pending	2026-09-29 11:49:38.319-03	\N	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-22 11:49:38.317929-03
79279597-cede-4411-a1d2-bb76bb44c70e	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	\N	\N	270a8c2bcffb2b21465323083ca3fed0daeb48c45b333f5a1b1d7137f019e298	pending	2026-09-29 11:57:03.861-03	\N	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-22 11:57:03.860997-03
f602def9-9fdd-4b8f-901c-2c0db8621540	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	\N	\N	f30897524773c716a72c2210ae4cb667219d8f82be28c161a0c2899fa7bbdc0a	pending	2026-09-29 12:07:41.883-03	\N	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-22 12:07:41.882677-03
1879650c-f51d-41b1-9f60-7528597a3ade	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	\N	\N	4e2c865d28ba59d4dd4d528890efaa3f4a2c9dd5bae131b3e83256eeab9272e2	pending	2026-09-29 12:08:58.291-03	\N	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-22 12:08:58.291136-03
35fb606f-08e0-4273-9934-a8e34db057e5	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	\N	\N	631025753b66df29252b53d35c2ea5abe4ce33a931d92f51e95d2fb8549c6a88	pending	2026-09-29 12:10:09.954-03	\N	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-22 12:10:09.954117-03
379a8e14-e8f8-495a-b73b-d4b7f143a16b	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	\N	\N	450c761dc90c5a540854385ac5736bdd48a808dff1df9740392168bde4544e82	pending	2026-09-29 12:10:10.241-03	\N	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-22 12:10:10.240872-03
46b5d412-d5b3-451a-8df3-9711ce359a72	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	\N	\N	4ee6b006afac5d33b22048b516baef8701089ba9169abc20a966bd382148406b	pending	2026-09-29 12:16:00.984-03	\N	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-22 12:16:00.983777-03
2d5551f9-6536-4400-8370-3663eaaa1717	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	\N	\N	f07c3bbf3fc9c324930abe8c91914d64adc87dcd81c3b7d8dc8c63227ad38ffc	pending	2026-09-29 13:41:41.179-03	\N	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-22 13:41:41.179611-03
52b647e9-e245-49a7-8065-ea0ae1cdbad2	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	\N	\N	a2d5a3760563e2dd10e8b48b5400b1f44b24e72263959abac8b075fc43e65bad	pending	2026-09-29 13:44:05.217-03	\N	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-22 13:44:05.217947-03
5a3b35ab-75f3-4a37-800e-4e55f9689efb	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	\N	\N	05f529b87b83818d33372256e7abe394c37516dd1afb7ff9ef8f71f4a6f1a01f	pending	2026-09-29 13:44:05.818-03	\N	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-22 13:44:05.819403-03
84f6b36e-383d-4087-82a9-f5e3c5f81bd2	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	\N	\N	b1a0b2a9188d32868c45f5e84238e4c613075d8dde740223b372ee54c1abe145	pending	2026-09-29 13:44:05.985-03	\N	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-22 13:44:05.986718-03
c439245c-8f4b-4d2c-b176-801c45d14a77	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	\N	\N	56b54a559d357336dae97c7190ef3248a1423540e0e14ce223a736d88c9d99c8	pending	2026-09-29 13:44:06.133-03	\N	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-22 13:44:06.13392-03
b2f17967-f734-43be-a465-966f48fc9bd0	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	\N	\N	b784cc01f5a8b7ce3c75e3346f7e0c30be7200799dbbdcc8c1d3cc88f2dc27b1	pending	2026-09-29 13:44:06.314-03	\N	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-22 13:44:06.315079-03
9ff28b5a-c064-4885-abf9-a11f402561e3	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	\N	\N	16f23011f20ec2100d8842fa968bad1c411efb5ff312d9c396ab4f4bd4a3189c	pending	2026-09-29 13:44:06.752-03	\N	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-22 13:44:06.7535-03
952f0e1c-8f5b-47ba-8cac-57bf6d38c32b	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	\N	\N	2584a99db166b3df08c857f88eccb51f509a52300cae3ae77a79b233f636a328	pending	2026-09-29 13:44:08.284-03	\N	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-22 13:44:08.284961-03
d897399f-d8a7-43a1-b66f-300bdbfa53fb	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	\N	\N	58e2f2656b146c3df2fed4f173a976b47fcef535bfce8d1105f7497b49862233	pending	2026-09-29 13:44:08.46-03	\N	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-22 13:44:08.461533-03
4ac9f000-bdff-40b8-89cb-6c33b3a77f61	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	\N	\N	f2fbdf8369a56546ecb0e70459828be9903d71e8a2a53123c9881a7bdb80ae2b	pending	2026-09-29 13:44:08.633-03	\N	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-22 13:44:08.634411-03
f9af4faf-923b-4d7a-aece-15c018219de8	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	\N	\N	57db0af9cae0db59e1573cf926e29c650b53916219271f8bde287972ecb925e0	pending	2026-09-29 13:44:28.321-03	\N	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-22 13:44:28.322287-03
a4aeae34-a150-405d-a5a2-8a74bb4974f0	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	\N	\N	a644c278c5b6ef1b6fe5ab5ff718e1fdbfee2fdaab9c2902d29609b819ac2eac	pending	2026-09-29 13:46:26.74-03	\N	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-22 13:46:26.741942-03
92d3078b-441b-4643-bec0-947c75877127	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	\N	\N	0816cfc88fdf010d7e62ee472526bc27019d4a238f76a031e8f3c4706bc5f003	pending	2026-09-29 13:46:37.053-03	\N	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-22 13:46:37.055065-03
d6014561-9e33-4ce0-acbb-966d02989c53	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	\N	\N	546dae456e83b9e57ae1381fca66f1a421d4a7c355ba2642df72cf988a0c2939	pending	2026-09-29 13:47:04.168-03	\N	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-22 13:47:04.170226-03
3141025f-c462-4bd1-abc9-813f339deea6	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	\N	\N	1e70dd819a381de0101cf6fa987c35909161587d66982453724d618914f5c0ea	pending	2026-09-29 13:47:06.601-03	\N	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-22 13:47:06.603306-03
c2b7f384-13ef-4fc8-9bec-26e2eb12c266	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	\N	\N	f8c86b9959f0ea4e47f3839930101b99b997616e2f5b96098de5718471896906	pending	2026-09-29 13:47:06.772-03	\N	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-22 13:47:06.773618-03
f7457957-6e0f-4aa7-acd7-1505a20b83eb	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	\N	\N	8869df885ae8032ad8b289c38cdca6d41e377939d3906bc9740591a24ad3285b	pending	2026-09-29 13:51:20.767-03	\N	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-22 13:51:20.768787-03
8293b90c-3f9e-4441-8481-05b8a603f474	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	\N	\N	54fc1f9850f7685b4ef2646aad3a17212c1241feb6e25663b777fa3b9066d147	pending	2026-09-29 13:51:26.05-03	\N	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-22 13:51:26.052268-03
85f1f92b-3735-4cdd-965c-e8387de94152	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	\N	\N	e7f8666bb0eaa593bd400f0149f9c3017e0407769dd32f6aea0f1eb28d0f4e90	pending	2026-09-29 13:51:26.695-03	\N	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-22 13:51:26.697118-03
b8ff40dc-e35a-40b6-9bba-caac06a19ba2	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	\N	\N	01db86693a6519168717d1b2a3abd3d1944828fc90db81acc0238489ab83a6b4	pending	2026-09-29 13:51:27.096-03	\N	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-22 13:51:27.097459-03
236a1d63-725a-4a2c-bfdf-10d5e95fad45	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	\N	\N	7526fc81c02056887ab6a703fcbbd8ae19dcd8b98ba393bc1f440319961c8348	pending	2026-09-29 13:46:48.63-03	\N	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-22 13:46:48.6312-03
7d43dcca-227a-4404-9059-991a548a11c9	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	\N	\N	4fb069b7afb5884602fd1066f30f6c12f36239e09249eee3a8e0a154cd53d740	pending	2026-09-29 13:46:48.948-03	\N	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-22 13:46:48.949072-03
d2b8787e-5e98-4f4e-86bc-5a402dcb2c87	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	\N	\N	0c4829b41b8b7f39cc2092f5df5a66dcbe9d81775d4d04fb263782cc4991493d	pending	2026-09-29 13:46:49.503-03	\N	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-22 13:46:49.503974-03
f25f07c9-8d58-487e-bcc2-2990bde8b63a	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	\N	\N	edf63b8f3752df678f0d8dc986d3182103a10a6e01a644f8aea06cb899ce0bef	pending	2026-09-29 13:48:17.942-03	\N	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-22 13:48:17.9434-03
184f4703-2fef-4d96-aea8-0414f90b46ef	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	\N	\N	40199324df1dafa620d989fdcfcebb6002c667f0ebb2a211fb56945fe131dfd2	pending	2026-09-29 13:48:20.357-03	\N	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-22 13:48:20.358985-03
750c49e2-c20a-4ede-b398-66e8486d6f62	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	\N	\N	fecc5811a9dbdae91c8c7f867d349315b05823fda31421fd037e533a96f3756b	pending	2026-09-29 13:48:20.528-03	\N	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-22 13:48:20.530149-03
5dec54cf-6498-4d44-85a1-255be2a78283	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	\N	\N	39dff51c5529e033c3afbcfcc2330790765c11f92ee87e6ac9a3981889b5e80d	pending	2026-09-29 13:49:06.701-03	\N	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-22 13:49:06.70294-03
25d1ae3a-7e4a-4723-adeb-adf14dd6f15a	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	\N	\N	55d3b6bf606a14f75facf58f544171ad83c69a0e2345bf9375aaab3c12c10d2b	pending	2026-09-29 13:53:31.02-03	\N	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-22 13:53:31.021814-03
16de2041-8b05-4136-83d5-6d0f5ed1672a	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	\N	\N	db34c0af19ea6718d734dc07920325b040d6ddae3f6c6e176f2545a34bc48ff1	pending	2026-09-29 13:53:31.999-03	\N	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-22 13:53:32.000988-03
24591248-a352-4f7d-9ca5-4b9033456ad7	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	\N	\N	9bcdd34e817d7a788927f0e062b7482afc0c995f370ca0207df4b00f67c04d62	pending	2026-09-29 13:54:08.333-03	\N	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-22 13:54:08.335708-03
ab7ba0f5-90c0-4d18-9811-70efb5a873a5	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	\N	\N	dcf57f1db3f421445387ce814472be079620746f2d28a12d2543d01549f00aea	pending	2026-09-29 14:05:08.264-03	\N	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-22 14:05:08.263963-03
6bcde342-9cd9-45c6-84fb-31dbca4819dc	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	\N	\N	d6a8b4183d8d2d9496686bf9a918313ffc4e971ff547fadb1295fa154f430ca7	used	2026-09-29 14:34:34.982-03	2026-09-22 14:35:15.228074-03	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-22 14:34:34.979204-03
3e085d6f-80e3-47d0-8bad-7dc334cb5dbf	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	\N	\N	af6c2eb50b640353753a84e22d86e03645dd614b604a7209f150ea7626ec3bbe	used	2026-09-29 14:07:48.795-03	2026-09-22 14:19:08.796216-03	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-22 14:07:48.794078-03
44e70f72-be03-4dd0-9216-d1a45b28ee8b	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	\N	\N	19e28779988f49e029991e44e6252c8326ff49620f91ef60f9d354453889c578	pending	2026-09-29 14:19:44.607-03	\N	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-22 14:19:44.60325-03
800dc06f-96c2-4b46-baa3-d82559be697f	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	\N	\N	470379ae8ef848546055423fbc04ed7ac5b8f201de51a6519407df8ec04a35d0	pending	2026-09-29 14:19:44.72-03	\N	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-22 14:19:44.717253-03
6c753a10-a033-4529-8bc5-ec625001d1cc	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	\N	\N	38f43cdbafe71b1c6e2ab07c5b0e0e885f01fe9202743eaf02b75bf2fb054e46	pending	2026-09-29 14:19:44.727-03	\N	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-22 14:19:44.724302-03
bc2c7f4c-8def-4c09-90f8-ca9dd20e17db	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	\N	\N	8aeb00e39a6f76524bf02a7efc7a0154bfc880252ecb3e3dc67aec8dbb875617	pending	2026-09-29 15:37:52.566-03	\N	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-22 15:37:52.567687-03
2e05b471-359b-44e8-9fe2-02cd70b593cb	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	\N	\N	34316ecc115b1c9ea1b6d454805cf6f4f9d4afdaabe85a436ddfd892792254b4	used	2026-09-29 14:19:44.866-03	2026-09-22 14:21:10.048508-03	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-22 14:19:44.862695-03
1b3c0e93-3de8-4869-951c-69de34f3b6aa	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	\N	\N	96e03ce6263d0cca830126ee60e086b7398bf5218385f07d7119ba19bd07ea53	pending	2026-09-29 14:30:56.374-03	\N	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-22 14:30:56.370608-03
0ad0f725-bc14-4157-9eb1-ed5ff95b7e10	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	\N	\N	cc80fb168c81d0c3de82d5234a5753b1765773401c72c9e27ef7af57f1b52a17	pending	2026-09-29 14:30:56.793-03	\N	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-22 14:30:56.794131-03
6a7d0011-d109-4098-9d82-ddd71a3fcb62	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	\N	\N	2ebe7b0c5e69092796f08c0dba0528623e2a8b2a363e63daecf39970b318c8be	pending	2026-09-29 15:43:40.773-03	\N	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-22 15:43:40.77383-03
8e97f054-ce57-48de-b7d9-f5e65fd83080	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	\N	\N	88047626e67de5621369cd92bed8c71c067596c3777ed6957c52ef994e3dc5ed	used	2026-09-29 14:30:58.435-03	2026-09-22 14:32:29.770693-03	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-22 14:30:58.431134-03
5b964066-cd77-473b-a4d3-7f4babf3afb3	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	\N	\N	f797dae98689f7ac93141d639470a672797bfc9d2046c2175e032a3bb5287983	pending	2026-09-29 15:43:45.17-03	\N	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-22 15:43:45.171191-03
2654ec74-96d1-45b0-b50a-8c5123afb288	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	\N	\N	6e94e13b9d1fffe1b6db478be23f58aa8ff64902278ddb3e2c7adc79b5a9731f	pending	2026-09-29 15:43:45.694-03	\N	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-22 15:43:45.695067-03
54a9f388-4b86-4ffc-a31f-c93b29442e10	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	\N	\N	ee9ffe8e9ba5ee24cefe9dc05301fd3cf668ea4d4cab0a3d326ba24077994e0e	pending	2026-09-29 15:43:46.655-03	\N	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-22 15:43:46.656116-03
bc0bd120-2a7d-469c-9297-f6c60487fcf1	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	\N	\N	55c02e5e5de80263b94e633ac2b636400bd58b482da3ee4c4c0803a747f80167	used	2026-09-29 15:43:46.966-03	2026-09-22 15:45:39.560618-03	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-22 15:43:46.967276-03
aff1e271-0745-4e31-8ddb-5e7f99b9b87a	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	\N	\N	6f3e13752399b1a47fb438fb2338b36278a2d1d05b86d1d6461910ef2d5ec995	pending	2026-10-06 16:55:44.616-03	\N	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-29 16:55:44.617193-03
e2813d6d-2f32-4d23-8a66-097e4ffbbe22	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	\N	\N	c0ee2d86fb670e3f58701af12e3ecdc040943a300a11f914d5b977e59ef5007d	used	2026-10-02 15:34:29.378-03	2026-09-25 15:36:52.081607-03	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-25 15:34:29.374741-03
828e2fdc-4711-446f-bce8-5560540f1fb7	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	\N	\N	1e96586a2d79ef9283d379dd7997544c0258bffd7b8aec9c5cea7996453ce52b	used	2026-10-06 10:17:26.735-03	2026-09-29 10:18:52.502552-03	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-29 10:17:26.738763-03
1b797acb-0b7f-42f2-aaaf-8c5363fcd6f2	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	\N	\N	c409077e8d017a24e93b47c888279d240cdf6fc11bda799b3e8f0576a6771661	used	2026-10-06 17:05:20.428-03	2026-09-29 17:07:22.515542-03	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-29 17:05:20.428457-03
e0b9cf64-089d-4ad0-b3f8-8858d37d9bba	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	\N	\N	50bb2ac032f42f14db0f7eb3142e1e15712df89b47dd424f8db2f8052eba416e	used	2026-10-06 17:18:40.145-03	2026-09-29 17:20:12.666931-03	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-29 17:18:40.144149-03
b40df15b-2eb9-4919-87fd-053e4b3b4bf8	c9287e4b-399d-4764-8bff-2e0ce7058dcb	909bb418-82c5-4461-869e-72bc9bfbb3aa	\N	\N	7f7866541625c3f5d5a5106af3f9885152ca7fe2e8d7abe3f0e266ee9ee62093	used	2026-10-09 12:19:09.821-03	2026-10-02 12:19:49.434683-03	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-10-02 12:19:09.825373-03
\.


--
-- Data for Name: criancaConquistas; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."criancaConquistas" ("criancaId", "conquistaId", "desbloqueadoEm") FROM stdin;
\.


--
-- Data for Name: criancas; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.criancas ("criancaId", "eventoId", "timeId", nome, apelido, idade, avatar, "codigoPulseira", pontos, status, "criadoEm", "empresaId", qr_code) FROM stdin;
\.


--
-- Data for Name: empresaEventoControle; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."empresaEventoControle" (empresa_id, evento_id, updated_at) FROM stdin;
c9287e4b-399d-4764-8bff-2e0ce7058dcb	\N	2026-10-05 18:30:18.663554-03
\.


--
-- Data for Name: empresas; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.empresas ("empresaId", nome, cidade, estado, telefone, plano, status, "dataCriacao", "dataAtualizacao", latitude, longitude, cnpj, floor_plan_data, floor_plan_name, floor_plan_type, zones_data) FROM stdin;
empresa-001	Buffet Teste	\N	\N	\N	professional	active	2026-10-05 13:51:25.992372-03	2026-10-05 13:51:25.992372-03	\N	\N	\N	\N	\N	\N	\N
61bc768f-c5c0-45c3-9696-f551c4b6ebce	Master Admin	\N	\N	\N	enterprise	active	2026-07-15 12:19:36.343-03	2026-07-15 12:19:36.343-03	\N	\N	\N	\N	\N	\N	\N
01afb92b-5ad2-4823-8341-d9f821d210db	walisson's Family	\N	\N	\N	family	active	2026-09-22 10:38:52.067384-03	2026-09-22 10:38:52.067384-03	\N	\N	\N	\N	\N	\N	\N
c9287e4b-399d-4764-8bff-2e0ce7058dcb	Buffet ADV	taboao	sp	(11) 99487-5644	starter	active	2026-07-15 12:31:54.103-03	2026-10-05 11:22:39.053432-03	\N	\N	47007102000100	data:image/jpeg;base64,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YjjuUpEEWrw+lrqGWhqqeKallYYnwvaC1zToWkbrWWqowTDqukgo6iihlpqdzHxRubdsbmEFhHMQQLc1lPRBCZhFBFicuKR0kLK6aNsUk4aM72NJygniBc2ULaDY/ANqmRtxvCaSu5K5jdKy7o778rt49RV0iDnMA2B2f2VxGWuwShbh5mhbDJDAS2J+Umzi3cX6kZt5G8rdtBsRs5tXJFLjmDUdfJEC1j5Wd0Gne241IPEHRXqIIrMPpI6AYeymibSCPkuRa0BgZa2W3NbSyyo6GloKKKhpYGQ0sLBHHE0Wa1oFgAOaykIgjYfh9LhVFDQ0NPHT00DQyOKMWaxo4AcyoKX7mWxlDiDMRptmsMirGSmZs7IQHteTfNfnvc3XUIggYvguG7QUL6HFaGnrqV/fRTsD2npsePSoGAbC7M7LTPnwbBaOime3K6ZjLvLebMbm3RdXyIItTh1JWVFLU1FPFLNSPL4HubcxOLS0lvMbEj1rZU00FZTyU9TFHNDI0tfHI0Oa4HgQdCFuRBzWD/c42RwCtFfhmz+H0tUAWtlZHqwHeG370dAsrrEMMo8UiZFW00VQyOVkzGyC4a9pu1w6QQCFLRBGqsPpK18ElRTxSvp38pE57QTG61szeY2JXkuG0k1dBXyU8bqqnY6OKYtu5jXWzAHhfKPkUpEFXj2zODbUUraTGsMpa+FrszWzsDsh52neD0ha8A2RwHZeORmC4TSUPKG73RMs55/tOOp9ZVwiCHR4VQ4fUVVRSUsUM1ZIJah7G2MrgAAXHibAD1L2DDaOmramuhpo46qryieVrbOlyizcx42BNlLRAK52g+59snhmKHFaLZ7DYK9znPNQyBokzON3G/Akn6V0SIIcmFUM2IQYlJSxvrKdjo4Zi27o2utmDTwvYX8y9qMLoqurpayopopKijc51PI5ozRFwyuLTwuNFLRBRYnsTs3jOKQ4tiOC0VVXwFpZPJGC4ZTdt+ex1F72VjW4VQ4lJSyVlLFO+klE8Be2/JvAIDhzGxPyqYiCHiGF0WKsjjrqWKobFK2ZgkbfLI03a4cxB1BUwIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIg//Z	Planta teste.jpg	image/jpeg	[{"id":"1","name":"Entrada","color":"#1E9BD7","x":50,"y":20,"width":120,"height":80},{"id":"2","name":"Área Verde","color":"#22C55E","x":200,"y":20,"width":200,"height":150},{"id":"3","name":"Área Azul","color":"#1E9BD7","x":50,"y":130,"width":120,"height":120},{"id":"4","name":"Área Central","color":"#F59E0B","x":200,"y":200,"width":200,"height":100}]
\.


--
-- Data for Name: estadoJogoEvento; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."estadoJogoEvento" (evento_id, empresa_id, mode, game_type, game_id, game_name, started_at, stopped_at, updated_at) FROM stdin;
9ba04dda-8cd4-4d44-a37b-3042a0b8519a	c9287e4b-399d-4764-8bff-2e0ce7058dcb	idle	none	\N	\N	\N	2026-09-29 17:30:11.035-03	2026-09-29 17:30:10.807186-03
cb2c9907-c412-4cf3-9b36-59b41e5e9d0b	c9287e4b-399d-4764-8bff-2e0ce7058dcb	idle	none	\N	\N	\N	2026-09-29 17:45:27.42-03	2026-09-29 17:45:27.185268-03
4695594c-19e9-493f-86a9-dfe79941400e	c9287e4b-399d-4764-8bff-2e0ce7058dcb	idle	none	\N	\N	\N	2026-10-02 07:59:18.541-03	2026-10-02 07:59:18.552955-03
909bb418-82c5-4461-869e-72bc9bfbb3aa	c9287e4b-399d-4764-8bff-2e0ce7058dcb	idle	none	\N	\N	\N	2026-10-02 17:11:31.763-03	2026-10-02 17:11:31.766602-03
c920334b-c141-47ea-a791-dd2c9828be58	c9287e4b-399d-4764-8bff-2e0ce7058dcb	idle	none	\N	\N	\N	2026-10-05 18:30:18.649-03	2026-10-05 18:30:18.653339-03
\.


--
-- Data for Name: etiquetasCheckpoint; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."etiquetasCheckpoint" ("tagId", "checkpointId", "tagUid", "criadoEm") FROM stdin;
\.


--
-- Data for Name: eventoBrincadeiras; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."eventoBrincadeiras" ("eventoId", "brincadeiraId", ordem, "multiplicadorPontos", "criadoEm") FROM stdin;
\.


--
-- Data for Name: eventos; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.eventos ("eventoId", "clienteId", nome, descricao, data, hora, duracao, status, "exibirDisplay", "exibirLocalizacao", "criadoEm", "empresaId", "tipoJogoAtivo", "brincadeiraAtivaId", "dadosPlanoPiso", "nomePlanoPiso", "tipoPlanoPiso", zones_data, "nomeResponsavel", "iniciadoEm", "finalizadoEm", "autoInicio", "autoFim") FROM stdin;
1D7AA6F2-1438-4813-B4ED-4039AC985536	8073e548-eb4c-469b-b028-7b21f4c373a6	Evento Teste	Evento para teste do sistema Pulyn	2026-07-12	11:00:00	120	scheduled	1	0	2026-07-13 09:20:01.19-03	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0	0
evento-teste-1	cliente-teste-1	Evento RFID Teste	Teste de conquista de território	2026-07-07	07:00:00	60	scheduled	1	1	2026-07-08 12:40:59.463-03	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0	0
9ba04dda-8cd4-4d44-a37b-3042a0b8519a	\N	rtrt		2026-09-29	17:25:00	5	finished	1	0	2026-07-16 07:22:01.59-03	c9287e4b-399d-4764-8bff-2e0ce7058dcb	none	\N	data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAYEBAUEBAYFBQUGBgYHCQ4JCQgICRINDQoOFRIWFhUSFBQXGiEcFxgfGRQUHScdHyIjJSUlFhwpLCgkKyEkJST/2wBDAQYGBgkICREJCREkGBQYJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCT/wAARCAG0AtwDASIAAhEBAxEB/8QAHAAAAQQDAQAAAAAAAAAAAAAAAAQFBgcBAgMI/8QAWRAAAQIEAwIGCg8FBgQGAgMBAQIDAAQFEQYSITFBBxNRYXGRFBUXIjJVgZKh0RY0QlJTVHJzdJOUsbLB4SMzNWKiJDY3grPwQ0TC8SVFY4TS4giDJkZko//EABsBAAEFAQEAAAAAAAAAAAAAAAUAAgMEBgEH/8QAQBEAAQMCAgQMBAUEAgMAAwAAAQACAwQRBSESMUFRBhMUFVJhcYGRobHBIjJT0RYzNOHwI0JykiRDgtLxVGKi/9oADAMBAAIRAxEAPwC1+AXgfk+DXDDE1OSza8RTzYcm31J75kHUMp5Anfbab7rWtKMCGWu1w0aRnZ1xSA3LNqcsogXsL2ueXZFKtro6RodIDmbZLoC3xJiqm4YklzM66CsFKUMIILjilGyQBzm+vMYaKNwiy1Tm2WH5ZMql2wzl3MEq3A6Dovyx5+rVdmJ5mSqjr7r82uZW+/nVrmv3vOABcDk3Q5yOKux1OvzBAHhKB1KtOXlgRV4lUhwdCMgdW/PyQt9Y7S+HUvTsEVrSOEyafYY7JlGmtBnSFEqCeWxA6YmjVTW+0l1pxC0LAUlQGhEPdwlpW5EHw/dEYntl+Qp2ghr7Of5U9UHZz/Knqhv4npNx8P3U3FlOkENfZz/KnqjqxPqKsrtrHeN0Sw8I6OR4ZmL7xkucWUvgji8+G2SsG99kIezn+UdUWK7GaekeGSXJOeS4GE6ktnpxmnSb85MLyMMNqdcVyJSLk9QikMVcKk3iOZkacy25T6dMkvqINnHWsvepVusTckDTQDWH/hYxVNPSD+FpJoPTU3Kl50hVihsKFht2qsfIIpVKX6quQbIAeQMiRrbKDrfo1inNiYqWf0iWtzvv1ZdyHVkxB4tp7VbmDsULlKkhwPthCjkdB2Kbvt6R/vbFwomWXFBKHW1KIvYKBjy9UKTO0piWS28XmXnUoXxKblNyPvESynzTtMWEMKXIqtlYdCQlQ0sRyQOosU5E3R+dpO/Mb+3fZV4KoxjRdmpwzi9+axvOOtTYVSpM9globFLBBWvpB0/y85ifhQUkEEEHW8eZ8LTz9F7IlmrzSkOqLoQkrtra6iL2Jh6xHjmo1c06iFx+UYalFuOthI/bqzWbvfakBJ0335ouU2LPZLIJAS05t6upTRVdtIuVqTXCRR2KjMSDCXZpcsShxbWXIFg2Kbk3JG/S26JDJVOWnqemfaX+wUnNc7U22g84jy7QaytiSSy8hV23ipSjvUTcm/libNYwemaPUqBIBlDk83kcfKyA3mSQbW1KiLf70iRuLTRzO44fB1bEo6w3+PUu+MOFuZrSZSnyLb0hIzr2ruxx1lINxfYMxtoNwtfW0dcL4odkqih1p5HenIUnQON77/70tFa1qmTTD8pTncinGjll1JuAoG3VshdU6VP0mnB2XfDrbiwlfFJuUAnaIG1NQ6Z7H8ZZ2zx/mtVHSvc7SJXqJqZYeCeLdbUVC4AUDeOsUJSZlVJWwppKpXKQplxSQFBfPby7dt4t6nVh6fkWZkLQeMSCbDQHf6YIM4Swi/GsI7M/sitNPxxI1FPsEcZeYDrWYkAjbzRyXOoKVFJ74aAcsGHYjTtjErnCxFx12VnROpKybC5ig3cbz1b4RFVqUfDTEqpUrKJ1KVtJPfX5c5H3ckTnhSxe7h/CUylt0om54diy+XaFK2nmsm5vy2iFYQosrKU+WzMtqdS2FBRTqLiM/iOOtfTh0Fxc+io1jy0hgV4U+eaqMm1NMm6HBcc3NCiIHhiprp76pILAaeJU2CNi948o+6JR2c/yp6omh4T05YOMB0tv8urUJ4xukE6QQ19nPco6oOznuUdUS/iek3Hw/dS8WU6QQ19nPco6oOznuUdUL8T0m4+H7pcWU6QQ19nPco6oOznuUdUL8T0m4+H7pcWU6QQ19nPco6oOznuUdUL8T0m4+H7pcWU6QQ19nPco6oOznuUdUL8T0m4+H7pcWU6QQ19nPco6oOznuUdUL8T0m4+H7pcWU6QQ19nPco6oOznuUdUL8T0m4+H7pcWU6QQ19nPco6oOznuUdUL8T0m4+H7pcWU6RWHD7iw0PCzVGlpjiZ2tOFi6T3yWBq6R0iyL/wA8Tvs5/lHVHjrhCxpU8a4/nahODikSa1Ssux8ChCyLH+YkEnn03CLNPjENWHNhBuBtUFTdkZsvS/A3itdZoPambdU5OU1KUBajdTjXuVE7yLWPQDviwo8l8GeOnqRjClLTmCX3UyjuXULS4QnXoOU+SPVrMylbGckXG0RPTVoFopTZwF+0BRUjy+PPWF3ghsM+9c2IHkjHZz3KOqB54T0m4+H7q5xZTpBDX2c9yjqjJnXxvHVCHCakOw+H7rvFlOcENfZz3KOqM9nP8o6oX4npNx8P3S4spzghs7Of5R1QdnP8o6o5+J6TcfD90uLKc4IbOzn+UdUHZz/KOqF+J6TcfD90uLKc4IbOzn+UdUHZz/KOqF+J6TcfD90uLKc4IbOzn+UdUHZz/KOqF+J6TcfD90uLKc4IbOzn+UdUHZz/ACjqhfiek3Hw/dLiynOKw4dcZzOHqNI0imTapao1R63GNqstplFipQ5LkoTf+YxOnKi62hS1KASkEnSPHOL8fzmO8cTVedQW2UIDEs0Dfi2U3sDzkkqPObbotQYvHWNcIActpVaqJZGba1614PsVjF2HWpt1SOzWf2M0lItZwDbbkIIPl5okwjzRwN48EhitmnpXlaqSeJWlQ/4guUH7x/mj0GJ5/lT1RFJjsVPaOcHSt/NqVI4yxgnWnSCG0Tr3Knqg7Ne5U9UMPCWkGw+H7qzxZTlBDZ2a/wC+T1Qdmv8Avk9UN/E9Jud4fulxZTnBDZ2a/wC+T1QnqFcFLkZidm3UtsMILjiiNgAuY6OE1KTYB3h+64YyMynuCK9wHwiTWLGnuypdEq6FFbaUjQtk6A/zAWvEu7Ne98OqHScI6WNxY4G/YPumx2kbpNOSdIIa+zXvfDqg7Nf98OqGfiek3O8P3T+LKWT9QlaYx2ROPoYazJRnWbC6iAB1kR3Cri4OkVHj3FjVSxTIYbU6h1mW/tEylO5y3eJPQCTbnTE5w5WlPy3EurCiz3pvty7j+XkiQcIYOMDXggECxPuqwkBlMaZuE2uhLtNw6xMLYfnXOPcWhVihpGo61W8gMSug1LtnT0OKI41HeOdI3+WPOVQqs9XMfVKqh56b/brZlVNIKkqQFEJCTsAsL7tpMWdwfVWr9sZhqZlVNIUzcqWLXKTpp5TFafFXQVpe43jta3uFWjmLprbCrRgiMsYwkpmuTNDam2lVCVbS661bUJV+ewkbsw5YcuznvfJ6onPCWlbkWu8P3RAMvqTpBeGvs1/3yeqGPHGJahh/B9YqslxRmZSUcdbzjQKA0J5ejfCZwlpXuDQDc9X7rpYQLqqeGfFLWIMdMUWVm1huhgKUEGw7KXY3+UlISAdxUoRceA8TDFOHmJtRT2S3+xmANzgA18oIPljxdI1iYdfen3phT8zMOlbil6uKWTck223NzFzcAOK553E8/IpQpTL8rxrhHgoUhQAJ5L5iOrki1NVmne6Z/wAtkMjkdyi2wr0dEMxPwO4FxjVVVWt4elpmdWkIW8FKQVgbCrKRc67Tra3JEllJp153Ksi1r6CFtot0NbHWR8bHq1ZoiRZZtFJ8NNcDOJaVSpnSRyLmHBmI4xRukA25LHri7IrbhbwhL4lok5MpavUJJtTsusGxIAuUHmNuuB+NvY1sZfqvbxBUUzHPjcGqjZhmTpzUrMPLealJp0uBK0XIaAG/ed1oba/ixddZMjKttScshQyFCAFqtvPJ0CGbFtXdm5KnypAysJJ0O69h90c8K0SZxFOuykstKHEMKfCVDw8tu9B3E3inxDI4+UTnVfuz1qhTU5kIAFyUvl69V2VhxmpznGoAHfOlQI5NdIkFM4e8UymSSMzLcUjvEOKYST5YQdz+sdpZWqMtuGYmX8hlVJyqaQo2So359TfYCOQxHq7SnKJVpinvOJdcZIClJ2EkA6dcNpzQ1TywWcRfyNirFTTzU7Q4gtvbPtzCsvu1Yv8AjMp9nTB3asX/ABmU+zphiwzNqnKS2Vm62yWyeW2z0EQ7hsm2m30Q11JTtNuLCzb8UqGuLS45da7d2rF/xmU+zpjHdpxcf+ZlPs6Y5rbtfSwHLvjSG8mp/phMOL1HSPilJ4bMYFIT2VK2G7iExr3acXfGZT6hMcII6aeA62BcGLz9I+KYqpiqp1aqP1OZdR2S+2G1qQkJ0AsLW2HQQ5z1TTI1invSalLaQxlSMw0JOpFvJHWZlkTTKmnL5Vcm6G5yircS2kOIu34KtdfJHTFGSMrAZKeKuY8XkNj6qWUWtl8djKQ2tThPeHTbtN98dpepsTMq81MhQCSrKo+5I3dERChTipllbrGZpNyg5gCSbbo3W2qVnWuMuuXcuFqUBqTuO7WKD8PFydSnMjRJxR1qaM4wbkKS672InjG2swCLC5tpf0RE25OVqnYc0maWZ5LRdmnFnMCBtVpre+loeHZukONBo0KVU2kFCQQElKTyWGhiMyMw5RajNMNBwNvoKUkqscuu/fthtHEGhxYLOU91JMMpkTKpmnm2nlTCz4QtkF7b9IXSNDTTJmbKplZlptYUgJGg5AT92kQWlTLjA4u67trvY7Bf/tEjmaqEScvdxPH59iVAjLyC/PHaqCTTOi7J38CaUtxNUTIJk0vNnsht+7C0m105SD6DGaNX1OLU0pCFKdUf2Z90TvvaGiulyvMS6VnLxINlKHfdBhBRplTrj3Ego4lWRRWL3NyNOox1lCHQWIzUYlboucD8uvqUxlqkw8H5eYByIWQL65CNw5oZWOF3FFPZTKS8xJhlkZEWl07BCVuWCHC4pxa1HedI7WHJE0NFEwnTF7qm/Eiw/wBIpQOGvF4BAmpUA7f7OmMd2nF52TMr9nTHJKCsgDfCKsTgk2C22rK44LXHuBFkU0DrDiwnRYnUyODWk59a4VvGVYxfOyhqr6FiXzBCW0BAF9SbDfoIsbCs4X6fLOLFiU8WfJpf0RT0qM02ji9bHU/fFi0ipqlW0HJ+zUASgaW6IoYrTji2sjGpEHPN7uNyp24VoTxjZIcQQtJG4iK/q/CxjGlVJ+TcmJUcWrvSZdPfJOoPVEql8QsKQAXEX/n0MMGJGW3Q3MtrbUR3qgCDpugZhoa2bQmZcHemT1EkbC6I2TT3acXfGZT7OmDu04u+Myn2dMLqXh1dTZLyZyTaSNoWvvh0iFowpJDRdblb8ibH84O6FLfREdz1C/sq7a2sI0r5doTJ3acXfGZT7OmDu04u+Myn2dMPgwtThtq9x/K1GwwzSRtqjp6Gv0jvEQ7ID/qfska6pGt4/wB2/dMPdpxcP+ZlPs6Y3PDTivIFCZlL70lhMPgw3Rt9RmPqj6oPY5RN9Rmvqj/8Y7yePZTn/Q/Zc5xm+qP9x90wd2rF3xqU+zpjHdpxd8alPs6YkHsdofjGZ+r/APrG3sboZ/5+a+r/APrC5NH/APjn/Q/ZLnGb6zf9wo73acXfGpT7OmDu04u+NSn2dMSMYYoytk/NfV//AFjIwpSVbKhM/VfpHDTxDXTn/Q/Zd5fOdUo/3Cjfdpxf8alPs6Yz3acXfGpX7OmJGcI0wf8AmTw6Wv0jQ4Spm6rkdKBHOKgGuA/6n7Lorarpj/YfdR/u04vOyZlT/wC3TG3dmxflB7KlLnYOx0xIW8IyB0TV0E8mUa+mO6sCJAumf8pa2emI3mjZk+O3aD9lI2eudm03/wDIKKd2rF2+Zlfs6Yz3asXfGpX7OmHebw3ISQs7W5dKhuyXPUCYZpllhlzKy+l9Pvgkp++HsZSv+WMeCry4hVRZPd5hJqpw54vlJF11M1KhVrJPY6dCdLxXVCYkZj9pUsyphaitS1HwyTfvuWJLj6cTLUEtZAozDiWxceDbvr/0xGZGkvBm5ebVppdJ9cEIYYmRksGjfcrcNU+eHSkJ1qWys5JUWal6lIpYTNSyw40vLeyhsvEkRw24vKe9mZXKofF06xXwopYZD03MNpFwcje23SYmssGhLtcTbisgyW5LaRA6KLW4aSrz1j6cARuOaV92nF3xiV+oTB3acXfGJT6hMcLCCwiPk1N9MKtzvUdI+KUd2nF3xiU+oTB3asXn/mJT6hMaycr2XMIZC0ozHLdWy/8AsRIGsFZ7FU0roSmIJDRxnRcwX7EXoYsVrY+NgaS3fcD1TD3acXfGJT6hMHdpxd8YlPqExLGsFyoF1pdcI5VEfdEertI7WTAKE2ZXs1vY8kMjdRvdoiPyViuosVo4DUSkaI12NyL7Tlq70j7tOLvjEr9QmDu04u+MSv1CY4WEFhFnk9N9MIBzvUdI+K792nF3xiV+oTB3acXfGJX6hMcLDkjdDd7nLpy8kd5NTfTCXO9R0j4pSnhjxeVAGZldTY/2dOkaucMuLki/ZEqnW1iwm8aOOFJGuvJuUOWOJNzrC5NTfTC7zvP0j4rt3acXfGZX7OmDu04u+Myv2dMcIIXJqb6YXOd6jpHxXfu04u+Myv2dMHdpxd8Zlfs6Y4QQuTU30wlzvUdI+K41jh0xdJyDihMy2dYyIswm9zviAUCkSU02lyZmHEuHVaM2i4euEOYaRTZeWKMzzzwLZ97bafSB5Yj8rIzgbKilFxssvwuiLcMMbI/6Q0bolDUvmgDnnaVLqcqXwxUGavTuLRNy5Kms4C0gkWvY6bDEk7tOLj/zEp9nTEAapE0QhU86JdoqF7quQOXkibISEICRsAsIrvhidnINI71VnrZKezWOOaU92nF3xmV+zpg7tWLvjMr9nTHCwgsIj5PT/TCr871HSPilHdqxd8Zlfs6YO7Vi74zK/Z0wnsILCO8np/phLneo6R8V37tWL/jMr9nTHKZ4QsTYyQmhzkwyZeZWkOJbaCSoAg2JG7SNFFKUlSrAAXJ5IbKJPheIEzqk3QhaUgcgOn6w18ELWl7GC41dqs0tdPMSHONlalDpRo7XHScw4HScySoCyTa2yIlO8K+NZCoPyb78sFtKt7XT33P+cTuRUVM5SNUmI7i+npQsTabg6BRG7n64AYdKx0xbO0G+/erUs0sUelGSEwHhkxYEkmblLX29jp05o5q4asW3OWYlbbv7OmE6jm3AQjq5QKc9nJAsLW5b6RohT05y4sKgzFp3ODdI59aV4ZpNVr00/V7NLcmXVFbziyMpJJJy7/IYecSTGIsL0d5bM6ktTKTLPKSCSEkbRfweS/PDbhdVXlJLjGWH0oFgOLKSCOi+vVDhibt1M0V4TbK0pcTlCVEA+UAwKke41QBLS29rK+5+j8WrrTdgrESaVIllvieLBuQpQBufuh8rPCM9RaY5VJQoZLSSELPfBajpa2+GekV7sanIlky7ayBZxLm29thHrhh4TMWzk5SZSlFtlDcwuy8qbd6mxtzbocKXjqoXZrOeexObe4IKQYcx5UGanMV9cylFUfdW/wAYpNwoq0sRyWsANwA5IlrPDJi99xttExKEuEJSex074r+ny9ERLgKW5mtscUbjmEObc83OOSLKFNtS7VhdRsNLjU+T0wWmp4XEnQ1bwmunla8aBIBOasnE2NsYYUl5Lip9p9hxGUuOMhRzjU3POPuMVtwg8KGJ8S0tuiTk2gSswsKdDTYRnCSCEkjdextzCLAm60ufpXY70s4pNgpDnFqF+Q6jZzxU+P5pb9Xk6crMlpLfG3SNSokjTzfTFTCYWOsZGDSB1+6QqpTOGaRsQutFnafLoSXJdCXQMvGBO2JlgTFrVHxfTVypBRMuplXgBqpKzb0Gx8kQJmkDKhHZSkrJF8yRp0iJTgVuk0fG1CcmHTMpEyAbpB75QKUG3MopPNaLlVHG5jr3ORyXYiOMaQdq9W0/2x5DDnDZIaPjoMOcTcGP0feVoZNaIjmJv4ZVPo7v4DEjiN4m/hlU+ju/gMM4Tfkx/wCXsk3UV4xqbVplty2hby9R/WHrgnqMpTMVvPTs03LtKZW2lTqsqQcwsLnQbIWUOSk59T7M60VpLXeKG1tdxZVt/JbnhmnKdL0aYeLko4VOm9zqg/JO6JaljamJ9M6+YsguE1rYSHXGkLWB8VeXsooPjumfakeuKTxrOsVDFNQmZVxLrK3BlWk3CrJAuOqGQ7dImfB3wZVPHU8lWVUrS21DjppQ2/yoG8nqG+BWHYLBhLnVBkJytn4+yLYhi8le1sJaBnfJLMCUubmqeluWl3X3HXCsIbTc20F/RFmSHBjWZpCVzL0vJ8x79VucDT0xYtDw/TcOSKJOmSyGGkJAuPCVYbSd8OED6rF3vcTELDzQuLAoy4vnNydgyH39FXieCJoj9pWHCr+VgAfihJNcEUyhJMrVWnTuS40UekExZ0EURiVQDfS8grRwajItoeZ+6ois4Vq9CJM7KLDQ/wCMjvkdY2eWGiPRqkpWkpUApJFiCNDFe4x4OW1oXUKK3kWkXXKp2KHKnkPNBKlxUPOjLkd+xBa7AXRNL6c3G7b+6rSF9Io0zWXlNy+QZBdSlmwEISCCQdCI2Zedl3A4y4ttY2KSbGCz9ItIac0AjLQ4F4uFjDOD62xSJpc3JmVUw6oBDpALiQB3ybE6RqbKFlAEHcYVP1SemkcW/NvOI96pZtCdCihaVAAlJvYi4jjdPMvt3KzXVLaiUytFr6/RNTSlJxA80lxYZTLJWG797cqOvohwcZQ6AHEJVbZcbIf04jYE92x7TyPZ/E9j8fY34u98vRfdDK4vjHFLslOYk2SLAdEcY4uObbJ1ZLG7QMbrkC27vTFWm+x3JIS54kuO5FqABKkhJNtYeUISlIASABDvOUvC1ak5BLszNyD8q4l1S0JCi4bEFJuCLG+60aV12luzKTS2lttgd9e4BPMDCbNpWboka9inqtA00YDwXC9899reGa5UukzFYfUxLZAQnMorNgBHGg4NrSTVOPlSwGn1ZC4bB5OZRzJ5rW28sc2nXGVhxpakLTsUk2IhQ9VqhMNlt6cfWg7UqWbGOO425DCLKGmqoooXxOaTpde43CS7IxGUgqNgL3jshGUbQCdh2xKqIF0JSEaKVra9vVEcxNbslpQOpQQR0HQ+kxIJtxLaMyjlSkXN90RF6YNRqCVuXCFKCQORN4kZrvuRCgYTJpDUEqw8009MrQ6tKRa+ptcckSJyryrTiZdnPMu7m2E5z6IX07g/kapTuNU0tt1dyhaVeCNxIO2JVQcJSNClw20gFZFluHwl9J/IaQDq8RhLiRcnd+6LllzdQpupMlXFvJdlXB7iYQUE9F9DCiWdTNzbbDbHZDYOZ0hRCUp5Mw3nkiwVSEuoWLYI5zeEc8yuQlXH5VtpwoGjbibgjk0ivTYhFxreMZlfPNRzxOMbtE5+PkmS6xLqYYlpKXaWLKs2XFH/ADKhRS6UVNBtvvUJ0KlDUw3+y5R8KmSZ6AR+cdW8araFkU6XSNuhMbqmxeCnGjHCQO0fdZGpopJ83zA9xHoFIWKG2s2Klk+QCFjeHJceEAfKYi3s5VvpzJ6FmN0Y7AOtOA6Hf0i1+IY/pu8vuq7cItrkaf8Ab/1UuTRJZPuG/MEbiky49ynyJERhrH0ubByXmW/kqCvVC9nGVLcHtt5s8jiPVEjcdpzr0h3fa6ccJd/bY/8Al97J8TTZce5jdMmwnY2D0w0pxLTVbKowOlQEYXiWmp21Ro/JVf7oTsfox/cf9XfZPbhE/QHi37p6DLSfcIHkjm48yg2CQs8iREeexZRkXJmHHTzIJ++G5/HTYOSTklHkLiregeuKknCJgH9GNzj12A/ncp24R9SRrez4j5KUBoKOZQsTuhPPVOQpiCqZcbChsQBdR8kQqbxPVZonM8WEbMjAt6dsNanBnKiq6ztVtJgBLPW1Dy+aUgbgbBFGcjp2hsMQJ3uAun+oY3nFqKJNluXSNhIzK9QhhmalOTiiX5p5y+5SzbqhOo3JMYjjYmg3tmoJKiR+ROXl4Igggh6gTfXaM1XZBUo6ooN8yFgXKVcsRKcp1SpLF5lrO0iw45vVPJ0jyiJ7DTiWYZbpTza1pClFBy7yM6YkjeQQNiI0Ez+MbDsJ9Ux0yhzdUDcw8ri5ZQCgom5UOYeuJg00hlpDTYshCQlI5AISUmZYfkmUsuIVZtOiTsFhC2FI4uKhrZHmVzDqBI80QQRuyhDjoS46Gkn3ZSTbyCIjkqq4zE4mTVJg6KfmAOhNv1ixaNUhMy7bh8NPeqHPFZVHDdTqzzDjHEuttNpAQy6nPfadCbjXTfsiS0edmJEgzTLkuSMriHElNjy67oF1rQ4B7TmvbsDZBHRxwRvBsM7EHM5nzU+VONgbFQx1xlqfZWlQCb7DyHljDc2t4Di0Z8wuMut41mc6E3mXWZdG7jFhP53gcZZHuHUr1TyVkbmVDhokWNzbJQhxtbK1NrFlJNiI1hzrpl3JhtyXmkO2QQsISdtxbUjkvCBtAUDc2O6NFE8vaHEWK8Pr6eOCodHC8PaNRG7771hCMxjoqwbBFxbZzRkkN3FxYbBvvHJbhULdfPEmpVdS1Ubm5jEEEJMRBBBCSRBBBCSTHivD667KtFhaUTMuoqbKvBN7XB6h1RG3nZuSsmZZcYUncsWHkOw+SLAhoxQG1U1KXLZS83cHf3wiWN+ppRTDZXPlZTnUTbsumOSpdQrC0qeK22L3KlbxzCJkhIQkJGwCwjSWsZZm1rZEjToEdIY511Uqp3SOsdQRBBBDVWRBBBCSTNXp8pHYjZ8IXWebkjjhy4ngSjMk6eWOdXZSuoOltaSSkFQJ2G1vV1w70OYkJSXS7MuNtOpBASdp5+eHS5RZBaKmYGwjR2qeUyt9jhKXiAoaZrXChC2ozspUGS0VtgKSQe+G+IUxPzk83xsjSpx6WTscFhm5wCdY6B8kWEtNcYTbi+JVmv0W/SM4+kbpXGRUtyRZJnWy04ptVrpJBtCWelROyy2Sct7EHkIhQS4SS8gIcvqkG+XmvGIPtJsCVnCdB927Fo3W5mmyjTb0yqWQ2MoUDZJJ5x+esd3pt+ZCA8846EaJClE2jnVMOVSfoyJuUklzKOOTZLffLI1BIEKqjS5mkvhmaQEqUMwym4Iiu2KDTu0i6LTyS8lbJbXcHsyt43KZMQNXpinSFIQHEhTiTltrszboYcdyz3ZdMbmUOIlRmzbRZZGlz90WBLVx6XkewXJeUm5W+biphoLTe9/vhPWZ92vKJn0NOIKcnF5O9y8losxyPa/NuQvtUEVVFHEwC5c0k+IA8tirdtFNZ75xLzltAkLNjzmJdgOdak5hTq5dC84yFtaRZKRCCSpkimtTqUtN2bCOLQdQk5Um4B5yYd8MGTk0Oqm5Jp+ZQqwC0gkG+25hVzrwuFibolpfFo9QPiLqezOJ5RyXWyWdVpIyqIsRFMY4m5Q1iQlktFUwyeNUvkQSbDn1F+a3PFlJrEhLyzrMrSJdlTmnGWubc8Vk1Tnq/O1StTUqsy0orirJJCkISSPLqbnpijhMbYdNxBA7da4WXkDjsB81rU5lE84wuVJLjhCFJA1ud8SXgqpiO6JR0zKUulD6zlOoCktrIPkIBhjD9IZdaMs1ZeYDvQdBeJTwYEK4SKUsbFPukfVLgjO4ineALZFStNpIw3ac/EL03Ifvx0GHOGyQ/fjoMOcS8Gf0Z7T7LRS60RHMSi9Nqg//AM7v4DEjiOYk/h1T+Yc/AYZwm/Jj/wAvZcZtXl2gMrbmV3GnF7R0iHxaEuJKVpCknaCLgwlwwAZlwEXHF/mIfXZBteqO8PoivJP8eaw9RTHSuxI6JhmXq1TZk5eUl0POqsFBoaDaTs3CL8pVLlqNIMyMqnK00m3Oo7yecxBuC2lq7InKg6kXQkMN6bzqSPJaLFgFilUXv4sHILR4JS6EXHO+Z3oi8EEECLo2iCCCEkiCCCEuqB4o4NVVeqLnafMMywdF3ELSbZuUW5Yae5HUvGMp5qotKCLrMRnY0NB1IXJg9JI4vc3M9ZVW9yOpeMZTzVQdyOpeMZTzVRaJNhcwy4fqs7WVTM0tDbUkh5bDKQLqcKDlUu97ZSoGwtewvfWwkGI1JBN/IJnMdH0fMqEdyOpeMZTzVQdyOpeMZTzVRaUEc50qN/kEuY6Po+ZVW9yOpeMZTzVQdyOpeMZTzVRaUM+IMV0vDcrMOzk00HWWS8JcLHGLGwADnOgjrcRqnGzTc9gTXYLRNFy3zKgvcjqXjGU81UHcjqXjGU81Ud5bHVYnkF191Mlx9lNtBoWQLbApXhHluPIImuHa4mryxSuyZprRxHLyKHMYe+vqWGxPkq8WHYfK7Ra0+J+6g6eCeoBKbz8pdO8BUaq4JqiQAmoSgHQr1RaEEMOKVGx3kFb5kpOj5leeuEnDE3hOXk23ppp7stSv3YOgSBy/KHVEQpjAU6l5Y7xJ2ReXDXQUVTChqHGpbdpq+NF/dpVZJT6QfJFGU6YCCWlGwJuDzweoah09PpHXtVKelZTOLIxYa1ZNGrnY6EDNmaGiVDcOQxJ5erNPJuCDzpN4rWjNuBK1m4QrZzmHRKlIN0qKTyg2gPU0TC86JVcPIU97NZtfMeixhvqFQbSkrcVlbGwcsRjs6a+Hc86NCHH3AVFTilEDlMV2UGdyV0yFPdN4PZjEEsahJTsu0y4tQCHEnMmx2aQq7kdS8Yynmqib4Npb1IoTTEwgodUpTikE6pvsHVD5D34jOxxa12Q6giEeC0rmAvbmdeZVWdyOpeMZTzVQdyOpeMZTzVRacEM5zqN/kE/mOj6PmVVncjqXjGU81UHcjqXjGU81UWnBC5zqOl5BLmOj6PmVVvcjqPjGU81UHcjqW6oynmqi0oI7zpUdLyC5zHR9HzKqzuSVLxjKeaqOieCafABNQlcw3hKos+CEMUqN/kF0YJR9HzKrBXBTUz4NRlOkpVGh4JKlt7Yynmqi0oIRxSo3+QS5ko+j5lVb3JKl4xlPNVB3I6l4xlPNVFpQmTUJVc85IJeSZptCXFN7wkkgH0QhidSdR8glzJRj+3zKrbuSVLxjKeaqDuSVLxjKeaqLSghc51HS8glzJR9HzKq3uSVLxjKeaqEk1wITU2vO5UJXMdpSFC8W7BHRiVT0vIJzcGpWm7WnxKqSV4E5uTUVNz8qVEWuQo6Qp7klR8Yynmqi0oI4cUqel5BJ2C0jjdzT4lVZ3I6l4xlPNVGe5HUvGMp5qotKCFzpUb/IJvMdH0fMqrRwS1If+Yyfmqjujgzrrbam01pkIUCCglZSR0GLLghpxKc6z5BObg1K03aCO8/dVuvg5xC42ltVdayJFglOZIt5ISnglqatTUpUnnCotKCEMSnGojwCTsHpXm7gT2k/dVaOCWpAgioymn8qo6ngrqZFu2Emb7boVpFmwR3nSo6XkFzmSk6PmVVvckqZ21GUJ+SqDuR1LxjKeaqLSghc51G/yC5zHR9HzKq3uR1LxjKeaqDuR1LxjKeaqLSghc51G/yCXMdH0fMqre5HUvGMp5qoO5HUvGMp5qotKCFznUb/ACCXMdH0fMqre5HUvGMp5qoO5HUvGMp5qotOMGH85VHS8glzHR9HzKq3uSVLxjKeaqG2e4CJuecK11SUudoU2VD0xckEN50qRqd5BPjwemjOkwEHtKqKQ4E56QSQiqSyiRY3SoDqhV3I6l4xlPNVForWltOZaglPKTYRtCOKVPS8guPwakcbuab9pVWdyOpeMZTzVQdyOpeMZTzVRacELnOo6XkE3mOj6PmVVncjqXjGU81UNOKcEvYTor1UnKlKqSiyUNpSrM4s7Ej/AHsvF0RT/wD+QL0yBRWAD2KourJ3FwZQPQT1mLNFWzzTNjc7I9QUM+D0kbC4N8yquo2aZqqFLAWpRJOYXFzy9cWmzgqjzSJdxyVYJaIUShNsx/mA2jpitaKRKBEwkZirb6onNKr7jTSSklbe7XVPNFzFONJBiNrKoHAZKZtSjLSAhLaSByiMrlmlDwAOjSGljEbCgMy03/m0jMxX5coI41AB96bmM4YpL6inaQXBrg/erkxMzErPMNo4zwVg39Hljr3JKj4xlPNVCzBNcccxCJZKbMPIUnXaSNQfQeuLHi+a6pis0nyCnpsLpJmaZbn2lVkzwX1qXBDNZZaB3IKx90aO8FFVeVmcqkstR3qCiYtCCGjEp73BHgFZOC0hFtE+JVWp4IqjcZqjKEfJVAvgiqC7js+TsdLZVRacYhxxOcaneQXOZKTo+ZVLTvAuukykxUVTcssS7anSkZrqCRe3oiKTSUqaWvL3wQSCNo6DHoDFP92qr9Ed/CYpOk1MU1xxSpVmZS4jIUuDYOYwUoKqWaNzn5kILi1PHTzxhpIFuspgpkypNFZmJh5ThCMylq2mJBwbPSkvRZiTnCFNzC151Of8S41zdMcako1DDzlNpFHl5aTkstyi6igE3IBPTc80PeHsJ0xMokmpPvjKMqMwRxfLsAvry3jtfPG6Etdlns/nWpGtaZXzM1ONx2blXD9KlqbiHtVKSfGIaXdTq1FWZsi4N+j0iH3gxsnhJpQGgDzoA/8A1rh5r9PYp87ll3CtC0g3Jub88M3Bn/iVS/n3v9NcW+N42kc//wDU+ighlLqsA7CPVem5H9+Ogw5w2SP78dBhzi9wZ/SHtPstdJrREcxJ/Dqn8w5+AxI4jmJP4dU/mHPwGI+E/wCTH/l7LjNq84YX9tL+b/MRJYjWF/bS/m/zESWB8/zrKSa1ZfB4gJoKiNqn1E9QiURFeDtwGirb3h4nrA9USqM1U/muutVSi0LOxEEEEQqdEEEEJJEZEYtBeHDLMpIMEEJqjIt1KRek3lOJbeQUKLaylQ6CI5rOa6FA+EXGEzKldHpuUuTbDrC3kruGcye9WLa5gbjLbUkagaxMcM00UbD9Pp4SpJYYQhQUbnNbviTvN7xWOM8Iextbbks447KuCwKxqk8lx5OuLCwliaRrVKlss0gzSG0pdbUqygoCxNjtHPBCpiAgbxeY2q3NC0RtczMKQQRi99msEDlUTdiOstYeoc7VHklSZZsrygXJOwDrIjzvV5p2Zwu1MvTTz03Mv8ZMFRuF3zHbzG3oifcItfnMR1mewvIzbTUpLsp4yyrca8TfKojcLbOW972EVe2mYlpKYYmUuFtlzKpG4Hd1xocNpwxocT8Vwe7YglfMHvDRsT/JYiU+iW0WMtrZiLJMTGhY4apE+1xjCn3nUKSUNqAuNNbnYL2iNUXC0mJVtE648l0i4QRlGuy3LaE9MpE1T8SPIVKcc2EZW1KtlKdvXsiOZlNIXAf23PaqTHljtJquqQxfLTk23LrYWyHSEoWoggq5DbZD/FNMumSXxE5cJd8A5rpSOTmi1MPzyajSWH0qUsgZFKOtyNCb74DSR6OpGKKqMpLX61U3D1iBxc9JUBtRDbbYmngDopSiUpB6AFHyxXlLorc+ylbj5ZzqyhVrhI5SIlfDlKuMY2D6kni35RtSFbjYqBHk064ZMOlC5RCVqypDhCjyC8aiA8VRsMao1ZJlN1IaXgh5hvJOVV91nc0ySkedtt0WjecwlOMupNHny22rRTUwS5Y/yk3MOs3XpSUbSlkh9VrAJOgHTGG8TS4CFNtrLvvVbAemAwmq3O09/ULeCrWXOm8H6VKS/VJhc89tyqJS2noSNvlh/lKbT6TV5SaMq3dlQPeDKLbLkDQ226w0yuMlpuJltOQnRSRYpPRvENNVxDMTy1JaWpts7T7pXqhOjqXus8/ZOb8JBCvRKwtIUkgpIuCN8bRF+DeYmJjCsvx4P7NSm2yd6AdPV5IlED5G6Li07Foo36bQ7eiCCCGJyIIIheOcZzVIqEtQ6Y3edmmlOresDxKBoCAdCom+3QW2GHxxl5sEySRsbS5ykFYxJTqGtpqbeJfePeMtjMtQ5bbgOU6RmnYikanMFhkuJXbMkLTbMN9ooun181ev1OoVEOOOnK0lSlAKSlFwNlh/3MSajVUrU2rslQmUKzIWNLbtD19cW5qMxax2/wA6kMOIu08hkrhghHKVOVmZJuZD7QQpAUSVAWuIVggi41EUbHaiwIOpZggghLq4T09L02TenJt1LMuwgrcWrYkCKzwbXu2c1N15SSJmZfUs3+D2JR5EgDpvC3htqbaMOsUdDixNzz6MiEmwKUm5Kua9vLbkiJ0LDNalZRKUoalMlgApwkr5ToNBBCOBop9NzrFxy7B+6FV0xDw1uxXe04h1tLiDmSsAgjkhLWKozRaXMVB4FSGUXCQdVq2BI5ySB5YSYTbeaoMs1MPB15AKVkbjc6eQWiC8J+LkmtSGHpZQPEvImJo2uL7Uo9Nz/liCmgMsmiMwPQK4+cNh4w61Y9LnxU5Bma4stKWkFTZNyg7xCuIfhjEMs7OIlg8n9um2UmxChs9F4mEQvBBsRZOp5eNYCiCCCGKZEEEEJJEEEEJJEENWIMSSGG5VL86s5nFZGmkWzuqtew8g2nQRzpGKJWrTHEJbWytScyM5Bz8uyHaDrXsmGVgdoE5p5ggghikRBBEEx3wlpwliCk0phhMzxwL87tu0xfKCLe6JuRzII33iWKF0rtFgzTHvaxuk45KdwRoy83MNIeaWlbbiQpKkm4UDsIjeI05EEAghwG9JEEEENJSRBBCSqVOVo1PfqE66GpdhBWtXNyDlO6OgEmwSvbWoTwlzz9RnpDDUm4lJWOy5kk7Eg2Qk25VXP+URLaBOKmpJLTpBeZAQo31UNx/3yRR9DxO9W8XT9ZfIa7JV4KjfIgWyJ8lh6Ys+lVNEtNsvpWChZyLF9x3+QxbrYnQlsR2DzOtCWVd5y7YclNLRmCCKaLIiseHefkG8Oysg6kLnnnw4xrq2E+EroINvLzRZ0eeuG19b2OHEKJysyzTaRutqr71GCOFRadQ3qzVasdoxHrULk5oy+i0ktk7bbIlVPnZdUsEyiJiZCRdZaZUbdOkZwyyh1Mmyplt5CwApDiQoEb9DE7bbaYQlptDbaRsSkADqgjiFc1rtHRz7UAcLqDmsyAbz9kp5MtjmvyW2wtlW52bbLrdOmUt7i4UoKugE3iSok6JKTJnpliVbfUrRZQMxO832w5zMzKMSynEqbCVJvmB0ty3ihJWiw4tp7/ZLQCXcHmGjLsprM0FJecCkttH/AIYvYk85t1ROIguBcWMzU8ukd9lKStlathI2gff1xOgIpzabnXeM0eo9Hiho/wAKBGYxsgvEepWkQQQQxJNeKf7tVX6I7+ExQEw+mVYW8oEhAvYb4v8AxT/dqq/RHfwmPOlXeVlalk/8Y98f5Ra8aDBvkd2rL44zjKiNvV7qS4BqrbEg+mcSQmYcUonLpqBHdukJStKWKtKMsFRT36TdIvoB32ptywtoNGw8JRNnFumwslx0958nWGPEaJeTrSJeTbJZdQVFYVcJUNoO/UW9MQgiaodxdwT1fdKwtfYFtV22WZri2Jjj0pGqueGvgz/xKpfz73+m5Ha0ceDP/Eql/Pvf6bkFtAspXtOxp9ENpHh9WHN1XHqvTcj+/HQYc4bJH9+Ogw53i/wZ/SHtPstpJrREcxJ/Dqn8w5+AxI4jmJP4dU/mHPwGI+E/5Mf+XskzavOGF/bS/m/zESWI1hf20v5v8xElgfP86yr9amHB5VUNPzEms2soK8ihYHrSYsKKOp1SFHrstMOGzD6Sw6eQbj1/nFwUqpJmEJZcI4wDQ++HrgPXwG/GBarDnCalBbrZkfYpyggggWpkQQCAw8ADMpIvBeCOT76JdsuOGwHphXLsgugEmwXKen0ySUkpzqUdE3tCLt+Pix8/9Ih2NcYLpKm1NobdmHTo2omyUDebf72xFe6TUviUp1qgrDQXYCQpZKyhpncVOfiGuwJ9FNMfTqahRikI4tSTcAqvc3B+4GKlU0sqK277SbDbDrXsZzlZp5l3ZaXaKVBxC0FWZJH6XHlhtRNloJJbCwb6FRAgnDEY2BqtRYnScQZWE6DTbUV3k6jVJdV5ebmWre9cUn7iInmCcZVhyeRJzj5mmrKUeN8IWG5W3k2xXD02tQu2zY7khajDnRa6ukZpyUabeJTks5fveXZ5I5PAHtzAT2V9LUQulbmG68jfw1ppxOueoWKaupTfFdlvOuoOXRSVKKgR1xvXFpl8O09tp5xQWsKeSRopWXaTvhbirEcxieQSw9JyyFtrzoWm+YbiLncfyERwqemKcJdTiipGxCjssYstZpaDjkQc/CyxVQ6F0hMBu3ryUnlMRKmDL2CtPBKyO9MPj9WS9JlS2hnQLly9gg7AR1xX0gpamUhRFknLbeLQ+pqiJamOyzBc/a6KChFKpom6Q0RtVc5KUS01KVGUCJhw5kAq4wn0gxZNPqctISTMtKyhSy2kBAz7uXZFDyVTdlygqQh5tNv2bgIuOTTWJKOEqfSABISg5NVeuK7sPNyNYRTCqykhLjUbbWsD7KZY/octjemoaLZYnZe6pd7NcAm10qFtQbDo9EU+1JTmG5xyn1RhTBUbocPgKPMdh3RLVcJVT2iRkyOlXrhHPcIL9QZMvO0invtk3KHAoj74u08UjGcVa7e3Upq6swuXNji13YbFI22wu91AWF438AWJGW3g77w0P1EqWpyTQmWQdCxmLiB0ZtR1wy+zR9L6mFSYeUglN0qI2G3PEwpHn5c0KpxygkQ52/m1S0uG1usw9Ydww/WX21vJW1J5hmXsKhyJ9cRuRxAmTc4xdOlplQ2B4qIHkGh8sSOR4TZ9c1Ls9gSaUqcQjvc2gJA5YgfBLbIKWjqKG96h57AD6q7JOVZkZVqWl20tstJCUJGwAR3jAjMZYrQWtkiNVHKCeQRtHKaWW5Z1wC5ShRt5IQ1pZbUy1DF0rS5J6dm2y2wykqWrNsHVFFV/Eq57HM1VS28lEwEcW2tzMUJyptY7hcXtzmOuKccVGt0xMk61LsMuLBWG7kuAa213X+6M8e3iidlmAypaJVsOKdbFl2v4MaWKlbTAvc3WDfqCF4jXQ1FhTj4e/X3pllqe7MVVQlmlOF4qIQnXJc315ueHSopqeH5EF1pCAsWQdCQo/nG+FpqUMxUH+KcQFLHFgr75AF7dO2JOhMpXZPsWdIdVfNybOQx2pqXMkAe27Ra6FHrXGkLap0sw3nbe40DOrYoKsASSdsWBhyvuy8uZR5HHIRq0rNqE8h02DdzRCpNEskGnIaZCQi2dq1revWG6cr05haYbbRleNiUoUTlynTX1QLEXHy2Gs+YVilqWQSiST5dvYrZnMVy8hKuzUwypDTSSpRz306LR0axI282lxuXUUrAIOfd1RTLmPpquzkrTZmXl2mFupW7kJuoDUA3Oy9j5Ik+IsRzeHZSXekZaWeYWcpC7jId1rHZEj6NrJGxEZlHudqDS0rHQtrzvfs3KPcKk8KhjWVdlUvOPtyqUrZHf8WcyiCOc32dELqdU60lLcu3LzS1lIIC2js5bnQeUgxD5yuvTmIu3LjLTalhIUlFyAU2sbHoEOzeK5oKKm6iApJuQCAeqLtTTuDWRhoIAQCeeKaV0kR+G/l3qz8L1OYpFOmXqlsKisjMLNgDUm14rNmdYxpiadq8zNGn8e6EMJQkEqTYADZtska8scmcezdOamkJlmppD11L48mxNrHTkMJeDtuXfrID4StKGyUptohRP5AffHeIMEL5LWNtinlq4ZYGMh1jXr1qwqbSaVQ5yWn+MeWGVhdnHioE223OvPyROPZAk7JY+f+kVhV6WmQQ++qbbKQolqXXfvt4BN/uENndRqQ07AkxbddXrihTUpqAXX0vJWMPxClpg5tVlfVYE9uruVxeyBPxY+f8ApB7IE/Fj5/6RU1O4Qa3VZxuTlKdJLecOgKlADnOuyJ5Smpx9QTUHZVtRGvFBVh5SdYIQ4G+U5Ny33RmHEMPmBMQJ7iFIZesKmXQ23LEk7e/0Hoh0UxMhN0tIV0OfpDbLURYTeWnwL6kAQoTSaij/AJ1dv5QI0I4O0IFtE+JVQym91wmamuUVZyVVyXC9PuhnxHjNNFoc5PiWVmZbOTvge+OifJciJGaWUML7IeCwR4KrflaKPx/O5sUTdGqrwTIS7BW2GVWKswCgog+6A0gRWYDHAQ9guzzUktZDHCS5vxbNaj89W5kVClTj8w7NulsuOLXa6nVaE8+lugaCH6k4tbkSJh1Ke8cCwkHvs1xbriNSNLbanpCUmXUFK0qeUlST3qQTlv0nkMSabocrVmWVySW5V6XcC7IHhAG+zTfsilU8QNFrhlv7yswSb3VmSmPGZkNqXJKaSvQ3eBynkOkOnb9Pxc+f+kVeFqYC5ppSnhez2ewIA3+SG5zhPn21qQ1JSqm0mySoquRFGmo+OJsEZpMWp4wRWd1r+ytio4vk6TIvz06gMS0uguOOKXolI8keY5jGz2KsXVKuzlkJmXMrSPgmgLIT0ganlJPLD9j7hMmKhh2YpUxJSoM6AhOUquLKBzbd1hENpOGJpbKLvtpatmC0jvjzQeoaGOBjnvyJy7kzEa2nqGDk/wAvf7r0DwV41ExSHKWtIeVJEcWoKt+yVqBs3G46LRORXkn/AJc+f+keb8KTL+DKi5ONBqYW80WrLukbQb2B12RLe6jUviEn1q9cUp8Oa55dGLgqakxahihDKm+kOo9yu6RnhOhZDZRltvvCqINwX4mmcSMVFcwwyyWFoA4snW4PL0ROYA1UZjlLDsVwTRTDjIPlOpEYjMEQJJFPVDsEoBbK81/dWit+GestzeFmpYhbTi5pBQgLvxlgbgjkF79NoduFDFUzhtyQEuwy7xwcJ4y+lsvJ0xTlcr03iqtNvzQS2hgAJbRfKkaEkX3k/lB3DaMHRmOzNQVVdSiJ0Azkt1//ABdsOtLYCWkSM05NuXCUBsgEX25jpaJUiSrbHe9hvIO4tugp69LdUO9ArUkZVptSEt5U2SobCBD05U5RDRUHk7Nt4r1NXI55uzxzWfsDmpFTq26zT5ZuYbDryGkpcWleilAanZCjt+Pi58/9Iqur8IE3TJkMy0tLPM5bha8wJ6jCLuo1H4hJ9avXEzMN02h4br61pW4zhbRouvfsKuHt+Pi58/8ASKm4YqG/U5xuvykuspS0GphIObLYkhfRrY9AhN3Uql8Qk+tXrgPCjUiLGnyfWr1xZpqJ8EgeweahqMVwmaMs0iO4qP4en1syzTjKwHGrpO//AHpDg9NvzDvGuOqK9xvs6OSGaoT6Jmb7Kk5GXp61fvEMk5F/5ToPJGO3YYQpc0yUISLlaCCOoxZkpiXabRrWd46JztFjr+V/FO633XCStxSidpUbmAvucUGi4riwb5b6Xhrlq/TptRQy/nUE5iAk7P8AZhVKV1EpMB0yLUyBsS8Ta/LYRHxD9WinPkbG4NkNu4+invB9TFyc6KvMtKyoSUsovYqJ0zdFr9cWH2/T8XPn/pFODhRqI0EhJgcl1euM91Ko/EJPrV64gfQPebkeaP0+K4TCwMuSewq5WK0H30NBgjMbXzbPRDnFN4X4RJ6pYip0m5JyyEvvpQVJKrgE9MXJAqtpuIcARrVkVdNU/FTahr1+6IIIIpJJrxT/AHaqv0R38JjzlPI7KqkpLLUUIsVZhtv0+SPRuKf7tVX6I7+ExQDsq3MFJUSlSNUrG1JjQYP+W+2/2WYxqQR1Ub3arFP7dOpzPFNrrJShHers2kk9FhoOuGyp01ldXdmmKkOxUMpZZZV4anlKIChpYixBPyYRJmXG55MmW0L/AGXGFd7bzu37IRz82VVhlsqShpqyipQ2dPPui3FSyMJeXbOpRtmAIaB8wv3HJSatUM0dMuULLja0AZj74bYZeDP/ABKpfz73+m5EknqpNTtL4mYknwkAKS4WlJtz6iI3wZ/4lUv597/TcjkEj3Ukgk1gH0VeGIMq2kaiR6r03I+2B0Q5WhukEkvZraAbYcoL8GmkUee8rWv1oiOYk/h1T+Yc/AYkcMOJpdwUqorAuky7mz5BjnCOF8kDSwXsblJp1rzXhf20583+YiSxGsL+2nPm/wAxElgVP86yr9aTVCW7KlVIHhDvk9MPODMWBSUUyfcyOo71lxRtm/lJ5eSG+GyVpPbuuupaQsssgIcKNyyNT5BbrMROLdA6eoK1h9XJTS8ZH3jeFdcpWlN97MAqG5Q2+WHRmcl3xdDqTzE2MUpI4tqWHJldPqDZmm2jlBUbLCd1jvHTEpksZ0WdA/taWFH3L3eW8p0ihLQAjSbqO5a2GroqvNrtB24/z0VkZhyxqt5tAJW4lIHKYhqKrKKTdE8wU8zyfXCaaxDSZQFT1Rlb8gcCj1C5isKE7/JWTSRNzfILd33UtmKyw3cNXdVzaCIviPErVOl1TU44FKsQ20k2KjyAfnEXq3CKy2CimMcaq3710WSOgbT6IiBM9XZovTDy3FHwlq2AcgghT0IZ8TkMq8YpqVpbS/E/fsH37kpzPYgnnp6dJObQW0A5AOYR17TSv8/XCxlpDDaW2xZIjY3sbbd0Wi83y1LIPcXuLnG5Kap6kyzUk+4M90tqIueaNpGmtTbKFO5r7rG24RzqfbeYlXWWGGCVjL4WhG/Xo5o2lTVGmUJLBaUE98gEKAPKDEoDtHWiEc7G0L475lwy6kuTRJQXsXBu27IaqPKtTLLoIVxZUd+2FLkxWSklpptaxsz96D0kRtQZaZlJLiptlDTgPuF5wRy3sOWESQw5p9HUsipphexcAB7rp2mlf5/OjU0OTJuUqJ6YcI6yrHZMw2znSjObZlbBEBkcM7oWBc5KCYrp6JeoyCGHHG0qQ4peVVs1im33mJQqiyeY965t99+kKcYcH9Vnp+lu0pTLzaM6JgvLyZQSnUacgMPVZoyaahLqHwsLVbKrRXTD3VTXMYGuzzRKqitBGAMxe6jfaaU5HPO/SO+EpWmzddm2lJUtLTfFpKlaEnwvyHkMa1OYTK0991SimyDYjbc6C3lhJg7DlXMsl9ptLSXu/D63NCNwsNbxFMf6Di51r5KlE3+5LZzD0tKTLjJDnenTXaITqocmoWUFn/NDxOyc/KrT2c4hZUO9KTf06QnjkMrnMBvdRPYL2smh3DrG1sq6CfziCSkulE5UQUi4ecHRZRi1mZd6YVlaaW4f5ReKpS8lisVNhw5V9kujKeXORaClFKXaQJRrAIg2R53hS1NNYI911wokKcwJ+WPfaOoO3+YQ6TVFeY1U240TuWnQwnlWnGp+XCkkftUa+UQwSh4yKyTo5GO+JegxGYxGYxS9HOtEcpsXlHx/6avujraOU3pKPfNq+6JGCxuU12orze/TpdxGUBQNtDfVJhroc65SJ95myiVd7cGx0h7hNMyDcw4l25bdTpmTbXpjaus5pa7UV59TVfFktfqKYmFNy0+6gZkoNwkbd8SSkTLqihASCyDqoaEDmhtm6clptU0F/tWklWibBVhsMc6FMOVFnshbZYNxYBW0Wvthk0Zkaigma6J0rdTbX79SfpyqIZqjuTOGBYJAtdJt1xirPoqoaW8sqDaTYjTTnhKJZkKK8gKjrr6oxOFCJR4rNkhBvboiKOma0tO0IbNV8aAxgtdc8L0GZq8+9NSHEcWhWVJfURb+bQa9ESqrYXnWaY5xs4h5tNiUJSUk28p6YjmEWakhguy7LuQDQoUmx6yNYk80uuOyKnZht1tkDYspSoi3IL6QPq5X8oFnCwIRR4AYQdyh7sjLNIK1Z7DkN45ymHJh6vzTKJN5ZEuh4KCb3QQnYd/RDlISiatW2JIrKW2wXnLdQ9OsS/EXbCkyjJlJx5MuBkUNNOe9ouy1pZKIW6yNqp0g4uB8j7/ELZbss/JQCYk5Vhla3c4SkXIJhbg7DlTeZEzLsICXtUvrc0SBusNSYb6+QZKylG6liwHujrpEgw/OVaQkUrRLzaUAgBHFFQtusBqRziO1rniGzbZ707Dx8BcdpSrEFNqMq00ZxxK0G6QUKJsfKNIjna1n+briT1uaqT8qhc60tpKzoFAD8zDFEdATxWdr9SqV7iJLA5Jwwm/J0SqGYezhK2yjMBfLcj1RZdPqFMnEaTCXP5m1AnyiKkjZCM5GpEGaetdENG1wpqLFZKduha481djUnLKILc8UjnFoWtyzqNU1kJ6V+sxSSZyYaa/ZzD6ANgCyCI4rn5t3w5p5Q51mLfOTej5omcfZb5D4q8JioSVPSVzlXSsDUgW18sUtwqzMhXqmKlTmjxjaA26tJuHEjZ1Df6oQHvjc6nnjN4rz1xkGiBYKlUY2+QBrWgDxTHVKk7PTEnOKCwpKAjRV9NtvSYeqJPlCwHlWZF8wKrKMcuw5cjKWUZTutpDdh1KnJVbjzhdXxhykjwRyQNfA18ejsCeyqD4nygfLbzT9IVxxHGoRmUleYagFJHPDcaawT7oeWFUEcjiawkt2oVPUmUjYoBjthmXqUiGipa+LUVN7SBfQ/f1QmlKjMyzaVNqcSk8qTa/VDljGnvs1tirZVKluKS0tQ/4ZBVt5u+Gsc0VMNqCgL22X1gkD8AFrozTuvCwDNKqX2fU6gxxwUhsd+SRlukbfviT9rmP5uuI5SpifqlSadsUtMm6lDQW5PLEsEVpCQbIbXuIeACrG4G5dDEvVQi+rjd79CoseK84If3FT+W39xiwxGQxH9Q7u9Atdg5vRs7/UrMEEEUkSVYcMkqiYcpZXfRLtrH5MU6yw5OVRYkglJSbDOqwNtNTF08LiSp2mAD3Ln3pip6Yyqm1RTblv2hJSTsWL3tGrw4kUlx1+qy05HLpL7h6BSeUo1UlZEAyjedG1vjhmJ3kG1uswqlqDV5lKnnm2JNFrhCznUemxsPTHGYxLN8ddAbQnLoi17eWOPskqRacbVMFQXvI1T0QPfyh19QTtFNtUkbzakP3zN97odI5ylAM6Vhhta8m3WOwC3nPdLWo9JJifYcpTcrLBBsVbVHlJghJOYmNaPmK5guDHEal+k48W3WRv2AfzUFXi8Ovt3zSkyAN+XSOC6a02bLC0nkJi4VSjdibkdEMtZmW5KScdVYnUJB11iI18jSAW370ffwIY/wDJnI7Rf0IVb9rmf5uuEFekGm6NOLGa4buNeeHkKDiUOjUOJC78txf84R4glZhWHp55LDpaS1crCDlAuN8Eo3XLT2LFRwSQ1ohfra4A9xTFhunsBwC3fFkkkbScyfXD/wBrmP5uuGrB6V1B89jNreKZclQQkqI75O20SBSVIUUqBSRtBFiIlmcdMhXuEZIrTbVYeiSdrmP5uuDtcx/N1wqgiJAdIpwwZIst4rpS05rpmUEXPPF/RROEP70Uv6Sj74vaM9jP5jexa/g8bwu7fZEEEECEfTXin+7VV+iO/hMUYy2EqSVnTS9toi9MTC+HKoNdZV3Z8kxRoSoqNm1EnQ2SdY0GD5RuvvWT4Qj+qzs904uUzDrlSTPipPJZTLlsyymjnK7mys2wbTpbyxHcH1TtfPvvrSh1bhOfPawAMLVyUw4hQSgpJBAJNrGE2GnGaWhwTUi25NNmwDiRdGu29r6jki5OP6Lmkl2oWUVNM6XNzQLAAZbFM5vFMvMSrjBZF1oIKSobDEM4L0pVwm0oKVlSX3tf/wBbkPbdabEo5JydLlJcOHUtpAvy3G8w08G8pk4RqYoqvZ97S3/privRNbDFLduzUduSsBrnTsPWPVepGUIQ2AjwRG8Nsho/YckOUavCq0VVOHhujbK3YtE4WKIwQCCDqIzCKtrU3Rp9aFKStMs4UqSbEHKdRBE6k1QXF/B5QETLtSkZmVpc44CVtLWENO89vcno0iulDKoi4NjbQ3ERvDj7szPOvPuuPOqb75biipR1G0nWJHGQrZWyPu1tlnap4e+4FknqE4mQk3Zhdu8GgO87hCrg2mAZR3PcuLczrVylQ/SIXi2dddnxKXIaaAIHKSNsPuGnJimyiCCBzHeIq1cF6a20pMGiLqUYvobU7kmx3jgGUqG8c8Q16kTTfgpS4P5TEuXiEzDRamGiQRbvSIb0kKSCk3B2GK1C+VjNB+xRSgE3CjJk5gf8u55sbt06acNgwoc50iSR1l5l2Vc4xlVlcm4xcdM63wjNRht8imSWogBzTC7/AMqfXDo22hpAQhISkbAId50S0zxFQUQhhTZW7bQ6fmdkNy3m5nv25bsfkSCTcc99his2oMmz9k8ssucFr6RslBWbC0dBolNwNN8S2TbLVKCjeAeWMObgNkSXBdEka45OImkOWZCCnIsjU39USg4AoZ2tPn/9yorSVccbi03V2GgklYHttYqr4Is/2AUP4F761UHsAoXwL31piPl0XWn81TdXj+yrCCJVjXD0hQ25RUkhaS6VBWZZVstyxFYsxyCRuk3Uqc0TonljtYXZM5MoFkzDyRyBZEc1rW4brUpR5VG8awQ4AJmkUx4tymSZRdRcU8nKgbF9MOdDn6vISLRRKzYSo2CQ1m6Bb89kJq3THKg00tlQDrC86QrYrmjBrk7LLallzCpZaxkbbNklVve8vkjszS+MMaAd91NEbtsnyecqLpQuebLZIuEm2nUTHBooDqC4CUZhmA5N8J21TL7nHzbq3F2sMxvHaIomaLNH0Ubz8Vwp5JuyzjSRKqbKLaBG7yREZvgiw1O1ZypOpnMzrpdW0HrIUom53X1PPCJK1IOZCik8oNo7dnzdrdlP2+cMMZFJGSY3Wur0eIFuoWU3mHGGmjx6m0t21C9kQwlldUSWB+yLwyDmvCZa1uKzLUpR5VG8dJP22x84n7xDooeLzuq0s3GkCyuzeYzBvMEAQBa61aLxxm/ar3zavujtHGb9qvfNq+6Og3K47UV53gjJSUmxBB5DGI2y8xsszNOm5qmTbrEu4ttDKypQGgASb6w14Mln6lRzMSjS32miELKBfKcoNvTEwpGLH6XKplVS7bzSb5dcpF93PClvGLcmwWpCly8sCSbJsE35bACKzppxdoZ2ZozTy0raR8LnG7rE5arKM7I5zDImWHGVaBYteO7ji3nVuK1UtRUbDeY0iyLoODY3auUjUZijSSWHHiy22b8YnwTu1P5GOs1V3DJFx2acdY8MDPcKvst0xioUWfqNCnJiVlHZhtoC6W05lKsQSAkak23CEWIqbNU6jyAm2VNLmEoU2g6K0SLgp2gi40iuIYXPubXujrHyyQNfbWbd29YwhOqNaXMuLKSdVAbwQRb8/JFoPvytVpq2eMSoqTsH3xWNAlJyWSltNLmnJl0nizlsgjeSrYIlAoVbb1dlG1C17tObDyG4HXA3EmMfKH6ViNWpWLf22yUbrVNdcBZBCXmXLgHYSIcGMRTLDKGkvCXATkCSAk36Tv5xGsy0+y+tEyEh0Hvgk3A8u+EFcpU0W6Y+5JuqZdmkobVkuCog29O+CZiZM1okVDDnOM3JwMrnuTlNVCansvZLy3MosMx/3rCeOszKPyTpZmWlNOAeCqLTo/B3QJulyc06w+XXWUOKIeUBcgE6RDJPDSsG47lDFTz18htYEb8vZVW22FhVzYjZeOilBA0ItbRI23i3jwb4eII4h/X/ANdUczwZYcVtYmPr1RFztAN/h+6tcw1WzR8T9lUBWSLcu08saRcXcxw38BM/XqiqazLNSVYnpVkENMvrbQCbkAKIET09bHOSGXyVOsw2alaHS2z3H9gkcEEEW0PTlRHaWzMlVTZW4i3e2vYHnA1MdZSn4Uo1OmGJV6cnFuuKcQXBYtk7gbDTpvDRBEL4tI30j4q5FWPjiMQAsdeSII2KCADca62jWJVTQQCCCLgxG6vR5MVWR4thDQWVKcS2MoXYp2gabzEkhgnaTUpqaaeLxKmiSkoUANbbiOYRLGbHNEMNkbHLpPNhY+YIHmn1ttDSAhtCUJGxKRYCN44SaH22AmZWFuco5I7RGqDhnrVlcEP7iqfLb+4xYYivOCH2vVPlt/cYsSMniH6h3d6BbzB/0cff6lEEEEUwUTVdcLRCXqbfZld8uqYrZ9Lb6ci0Ap5Du54sbhdBLlMt71z/AKYrvIomwBJO60avD3f8dv8ANqwuMkirdbq9AmWtzczSmpcyiuMU68GsrpuAMqjt27odZdSly7S12zrbSpVtlyATaEmOKTPUimSE/Ny622ROJBO0jvF6kbvLDx2kqEpTJaael1BlTLZze9ukbRtEWrxFrXC2ZKnqI5RQRvINyTfsysltBlAu80oXAJSjp2ExKmJkBIsoA7xENkq3NyKEtILa2k3s2tAI9cOCMSsOfv5Ep5Sw5b0G8CqukmkeXrU4Dwlw2ipm05aW7za9zvy/llKjO2Fis25zELxnV80tMZFZghBQgDeo6f76IXv1enuNpLDz7aioBQcavZO8ix1MNU2zS33klaJ2YQn3ClJbTfnsCfSIZTU0geHPByWik4UYY1ulxngDdIMFVGRWzJuVBOZuXWWVAi42XSbbxs6os2bYpmIKW/ILW09KzDfFrQ2u2h6NkV9xzcrcycjKyQUbnIkqUdCNSq/KYSXINwdeURempeMdp3sdiwOI41C6rdPTNNnWvfI3GV9qm+F8BUTBkw/NyCn+NeRxalvu3sm97CwA2gdUJsZT1Mfl0tNFt2bCr5m9co5z+URIqcc0JUry3hNVVqkpIrV3inDkQN9zvjjKV3GiSR9yqE+JSVQMYZr260pk5d+blZibSBxLagBykbL9YMYAKjYAk80TfCiGHMPy8ulI4vigkpI26WPphmmZQST62QkJCTpbkiKDENN7mEZjUop6ACxabBaYRl3RiWmKKCEiYQbnpi8op7DJ/wD5BT/n0/fFwQMxN5fICdy0OCRCOJwG9ZgEEEDQbIym/ER/8BqP0Zz8JinIuLEX8BqP0Zz8JimXnkS7SnVmyUi5gth9y09qBYsLyNtuW5UAQCQCdg5YRVlpC6ZNryJLiGFqSq2qSEk3B3RrTVmddenlNBCFHIwrepA91zXPoAh5kp3sQPIUwy+28goWhwXBTvHlvBB12HJD9Di5NF+VtaZMOp/8GllqUpalJJK1G5V3x3xng8/xEp3zz34Fw9OzjZkWZCWk5eUlmPAbaTYJ6OTbDLwef4iU75578C4c52kyQkWyKsxOa+o0m6iR6r0hI8SToCHAN8LobJD2x/lMOcHeD8vGUgyAsbZevajz9aIbsRuhqhVAqvYyzg0+QYcYbMTIz4fqQ/8A8zn4TBWqc9sTjHrATF5fwr7ZX83+YiSrUlttTi1JSlIubwwYVSEzDm8lvQ8uo0hwxMtztO9xKe+FirmF9YycjLyaN1mXi7rKOSzHssrq0lSm0rISi25I5b81zE7p2AVZyarOrm20kBtod4mw3qAOp8sQPD82JJQfQO+JsojaOiLEksSvMpCXklYAtceqKeJOnB0YjYeanuBklXsKpyGy22XUtq1LZcVl6NtwOaGh5jsZxTNgAg2FtloeHsTtKbslK78gFvzhlXNLm3FOLCRuAHJFKjM2keM1dajlsRksR3XJuJykKQpCkhQWFWBvpv36HSOEdFIRxQvMqXY3Q1ltlJ23P3dMXXXysoWgbV2T2VTXHZSalnexFZ0qcKDxdyMySCdNsc2Zt1biFSyEgp/dpSnUjkPLeBM46Gy05lfZNrtOjMnTZpHSZcl3cr+ZSVrFi2kC6VDq0tbriIsAPxDWpS4EfCuT63M1lNFlPhIQpNiBfbyxzUrNzRhRudSbwRO0WFlE43Km3Bj++qPyWv8AqiexAuDL9/UfktfeqJ7ASs/OP82LTYd+nb3+pRGIzBFZXFCeEz9xIfKX9wiBRPeEz2vIfKX9wiCITmOy8G6L8oBZnEf1Du70QEE/72QKTa+lt3TGylWty/fGgBcWEA2UrQRbsq0UTpXiNguSsQ31igVJ2tUJ5Em6ttxbgC0pzBFwkgqI8EaHUwsrjb9EZZmOMTMNFWR3cW1HojhL4vCGw2ibebGzKFXiRjZBZ7M9aNRYNVQu09EO16iNuW2yWvS7ks6WXU5Fp2gxxZeDyAbjNYEpB8G8JXqwlaVONpfedOou2e+POY0lphMuyltEu4SB3ylWSVHeTHBE62YzUAwaqLT8Gd8sxq8U4wQ1rrQQpQVLuXG5OsKadPpn21KCChSFZVJJ2QjG5ouVDU4VUU8fGSDLtSuO0n7bY+cT94jjHaT9tsfOJ+8RGdSHt1hXbvgg3wRmls0Rymvaz3yFfdHWOU17We+Qr7oQXDqVHuNodFlpBhK5T0nVtRB5DCyCNO17m6liHxtfrCaXJZ1rwkm3KI1QjObQ8QlqbjUpLqdLS3FJsSEjUjfa2+2zliyyck2IVfm8vcGx603KdKZjiEJubZlKvokbPvv1RsognQaQSdMecD0245+1eWbIPuEA96CRv235+WN1yzrfhINuUaxMXtvYFR1dK+B5jLdWvtW0tPTUmSZaYdavtyKIvEbqE7NVmsKXNPuOcSrKCtRJCQd14fYjhD09VXFSTac19l7Zt1z0w5oaLuPipsOJLiNitKgV+UTKtMkISEjKlYFrw99tJYozB0HmvFfyNMq7Mlm7XWKdVIU6M6/kjZ1kQvkaPVp9WbsHsVn3z6u+J5ki/pMZialh0i4Py7iiukQsYkeZmZwPNkFZFlkDQ2jhKYgqck0GmZpQQNAFAKt0XjlUpd6Vf4l4JuBcFN7GEcHKaJpha05hAqiRzZnFhsu0zNPzrxemHVOuHapRi+MPfwGnfRmvwiKCG0RfuHv4DTforX4RFDGAAxoG9GuDpJleTu904Ri0ZggCtWiKCxH/AHiqn0t38Ri/YoLEf94ap9Ld/EYMYN87uxZ3hH+Szt9kgQguLCE2uTYXNoUzdLnJFCVzDCkIVsVoQfKISRIKPMmpUyZpTysyrBTJUd99BfqgtUyviAeNW1ZmnjbIS069iYLG193LHZIATYC6tf8AMId5iZmELckmmD2HLfs1IUjbbapRtpc31hvfkptpXFlkk5OMujvhl5biHxTaQu7LvXZICzVn3JKpwWskDZa52iOcZjsxKLe18FPKYmLgMyoGtc82C4R2RKvObEG3KdIcGpZtnYLnlMdYrOqOirjKPpFIE01XunAOgXjqmQaG0qJ6oVQREZXnarDaeMbFOeC5lDMvUMgtdaL9RidRCeDP2vP/AC0fcYm0Z+sJMzif5ktdh4Ap2gdfqUQQQRVV1QLhN/e0/oc/6YhKSUqCkkgg3BG6Jvwm/vaf0Of9MQiDtH+S1ZfED/yHfzYpHSanU6gothMupKLZlrT6o5VeuyCkqkn3HZxRNlty6bJuN1/VCbDjzjdRS2i5Q4CFDm5YRO09qQr0y02q6QMyRvGbW0FcIw6CqqTHLlYXFvNUMRrpael4xmew3Wf7Pe7FBl0DlmHSr0RuHpoCyJSlN9Etf746x0YYXMLytoUroEbdmDUbR8l+259brGnF6p2p1uwAei5NvVInRySQP5ZVOkdFTdTH/OMptySyYcG6QtSQXFBveANTHdulS6dV5nD/ADHT0RK3C6Uaox4BNOK1Iy4wpkM3U76zzZ6ZdMAeqS/+JKudMokxIkSrKPBaQPJCtqUcc3ZRzx04XSbY2+ATRilWdTyoslFROvYsgrn7Et90V1ip6bnsRLlX2UMKaUG0Ntpyp5bgcpvfqi6K3NSmH6TMVGazKSyi4SPdqOgHlNoqXC9PZxRVpmbqriwt1ZXnCyLKOyxHJ+UAcaipKRgfGwA9Q2LSYHLVSlzpnXbqHan6lVh2koaaLrQUR4ClbeiHLtpJT8xacl3y4RpxJBPTbkhzp2D6RJyxaVLomlLHfuvALU50kxmblGqKy65TUNsOrACylIvlHPGEhqKZ04Lmn0/+eaOyNeGnR+6UU+jy0jWqc61NG6n0ENuDvjr6IsmKgw64t3EcgtaipRmEEkm5OsXBFeuBDhcoxhhBY4gWzRBBBFJE03Yi/gFR+jOfhMU2ZXss8UFkKV3qQbZb8+l+bbFyYi/gFR+jOfhMU804WnEODUpIMFsONmntQmtndDURyN2fdI5aYS2Cw4QhbZIsdP8Ae+FIWFbCD0GGaYQmpTbrjIUApRUEnanXYY5obVKLsta0qOwWgqWBGKzAYqiUyNfYuz3/AGT9Dfwef4iU75578C4XM/tGkEEkkamE3B8nJwgU8A7X3rnlGRcMt/Tk7CszDFxVRxd72NvNeh5H2x/lMOUNsj7YHyTDlBng1+kPafZHn60Q04ody0SebG1Uu5foymHaI9iVZVT6jf3Mu4P6DE+OVRgprN1uNvuuNF15zw4u0y6ggZsmpGzaIUYqnVSlMKUGyn1cXfmsb/754SYbIVOOEbC3f0iFmJqe7P08cSkqcaXnCRtIsQR6YDutxwuswbaYumjDlAmJ5TbsvONsuKBVlcbzA2PTEvew1UcjQk59tx46LDzVkk8qbajoN4jmF6k5Iy+ZtKFOJBbIWPB1vDoK5UAlQ7IV3xvfYR0HdFGqNQ6Y6JFhvU5AKf5bCKmJcrnZ9bzttciQhI5gPWTDe42hp1baFhYSbXBENxrFQUx2OZlwtk7L6jmB5I7yLKmmyVaFRvaIoWSBxL3XUUoFkpvBeCCLCrojbOiyrMNpWoAFYvfTy2HPaNYNI5ZdDiFgwCMwR1cU24Mv39R+S196onsQLgy/f1H5LX3qiewDrPzj/Ni0+Hfp29/qiCCCKwF1dUK4SklTEgP51/cIgtrN7CPvie8JKgmXkb28JenkEQArJEHaMWiCzeI/nnuWpUVHWO8vLvgpnEy7jjLKrrKRew3wspwlp5tco4yhD2W6HE7Tbljiw4mQSlbky+064TkQ1tIG880d4/MttmFFSyGCVswzsmrF1RlJim9jyKXZh991K7JGbKBqdnTEfYkak4QpqlTCVW2llXqibO1mfUktGaVl5UgJJHkhCrviSrUnaTFyOZzW2A80efwkt8jPEpjapWIbXRJKHyk+uN1UfEixrLugciG7w8ZRyCMx3lD9w8FF+JZegPNRt3D9ZGq5CouX3JZI/KHyjUGYp1IM5NtmWcfdshhSSFZQDqb7P+0LETLzXgPOJ6FEQPTD0wQXnVuEbMyr2hr55HjRNrKtWY06piMRba65x2k/bbHzifvEcY7Sfttj5xP3iIyckGbrCu3fBBvgjMrZojlNe1nvkK+6Oscpr2s98hX3Q4a1w6lSJjABJsBGyElZsCBpfWOwslKSQBpa8aUBYyy0SkoG4Hl2wnmJFx1slDi3VIBWUKGoHNHZS7iyRlG2FFMWEzqATbMFJ6wYc052RPCqt0FS22okA96bJJ0LaKb98k2PRCi8MExxiXTkUUrG0Dm3xhqoTYVbjFKtuMOLEdr+D5mmdLE+187EJ9Uy2s98gGIbS2VSFXdlnkEEAix0uAd3SIk8pOuuqCFtjMdBfljrOU6XngA6jv0+CtOik9BjrX6ILHaigFVh8tC4caBntCUuYocDg4phAaAtlUdT5Y2Ti+oJzA8WpJTZIy2yxGq6t2gSAmSrstOdLYSU5VknnGnoEOFJaTOyTM24goLic3Fk+D5YqchYGaRbkoyCGcYdWpazEy9NOFx5ZWo8u7ojlDzkTlCcibDdaNDLNK2tp8kXIpWsaG2QeogdI8vBTUNoi/cPfwGm/RWvwiKUMiydgKegxdtDSEUWQSNglmx/SIHYtIHMbbejGAQujkfpbvdLoIIICLTIigsR/wB4ap9Ld/EYv2KSr8i2qu1FSiSVTLh2/wAxgrhLw17r7kCx+N0kTA3f7JtkpKXnZdyzimn2rKJURkKL2J2XuLwukKSy82lUpUWkzCipsofOTeCmw1vqIzJsSbNiuXLigQT35FxyHlEa2QhRLaQnXQjbBORxdcXNu5A4YhFZxAJ71mozE4t0OhpxtJV3ygkjjHABf0W9McXZR5ck0jstoJTYhAzFWtzY9BJ64WdnZkFuaCn81g1c3Vmv4IPOLxwUvOc2RKDvCb29MRNdkG2tZSujBJO/ySZuTaaN7ZyPfR3vGYIkLi7MrjWBosFi8F4TTbwlnWnFKVkN0lIF7kjTTlv98KUnMAbEX3GOEZXUz4i1rX7Ci8F4zBHFEpnwf1BEmxOBaVHMpJ06DEs7es/BOeiKlYxSrDoKBKh7jdbleW1vIY690xfi1P13/wBYrSUXGOL7a1rcNrKBlM1szvizvr3lWt29Z+Cc9EY7es/BOeiKq7pi/Fqfrv8A6wd0xfi1P1x/+MM5u6vNXOcML6XqpHwgTyJ1ySKEqTlC7358vqiLSss9OPBplBUo+jnMbOYhXiZxAEsGVIOUALzZifIOSH6eUnDdKCZZOaaeIQFnerl6BFmGF2k2njHxHILL4g+F00kzD/TG3uSaYnJTCsuUIIfqDg2X0T6h98NEg0+tx2bmCouvG5vtjoxJpQsvOkuvqOZS1a680LpVBcmW0cp16I9CwvCmUTb3u46z/NiwGJYqar4GizRqCWSFL7ITxj10p3Dlh4S0hlAQ2gADYlIjKe/shAAJ0tDiyyloDQFW9UFybIUxhfqSFMs84PAt0x1RIH3auqFsEN0ypxTtGvNc25dtrwRrymOkEENupwABYKKcJ0u2/g6cLjobLZQ4i/ulA6J8tzFUUGdShaE8ahrKLLzKsLRYPDMX+0ElkzcT2WOMt8hVrxH8Lqp7EqmYmkMFTaEFu7YKwba23xj+EcwY75b5BazBmf8AGvfWSlzWJFyzRInW8iTlJUoaHkjd2fmZ3KXCrKe+HelIPXthWqp0NM0ieck0TEzYDOWxnQOkxrVsQS80tLMqzdBtdRFrdA5Yx7fnBEdutFHNNskpwz/H6f8APo++LhinsNf3gp/z6Pvi4YrYh847EVwn8t3aiCCCKKKJuxH/AACo/RnPwmKci48RfwCo/RnPwmKXmBMZR2Pxd9+e8FcPHwntQLF/nb2JLTk2fm1DT9qR6TG9XYDsit0WDjRSUKvqCVAQll5ersB25lrrWV5k7/IemNn2Ks+2G88sElQKgq+oBvbToguB8d7pPq2GtZKHZDRz7ALp3YsiXRmtcp1hu4PnM3CHTQBZPHPWH+RcLgLJA5BDdwef4iU/597/AE1xG4/05OwqKOXjaovG11/NejJD2x5DDnDZIe2PIYc4McGf0fefZHJNaIjmJP4fU/o7n4DEjiOYk/h9T+jufgMR8J/yY/8AL2KTNq84YY9tL+a/MRJYjWGPbS/mvzESWB1R85WVl1pJM0uWmXeOspp74Rs2J6dx8sRmr1GapFXZp6WxNB1CV5yMpSCojXqiYxDcTKCMUy4VoVSzdr7/ANoqH0wD36L8xZXcNYJJtB+YsVK2ZRtqxtc8pjvGUpNwDcR0AAuQbbjbdFYBD7l2ZXLp0h0kKS1OS6Hw8VIWkEWFoY6lNJk5R5/c2gnp0hXgSq8ZT5dlar52xY/zDQ/dEM+mGaTVsuDmEQTwumqG6Vzlr2a/P0Uhbw0yNqXFdJhPVqOlhkKbQElIJ03iH5E6AkAi5G+8JpyY45GXKLCKz5GgaQcSVo3YPTPY6IRgA7QBftUOghRNshpy6fBMJ4vNcHC4XmNXSvppXQyDMfzzU24Mv39R+S196onsQLgy/f1H5LX3qiewErPzj/NiP4d+nb3+pRBeCCK4NldUJ4TP3Eh8tf3CIK20t3NkSVZRc25InXCZ+4kPlr+4RBpdTiHkraKQtOoClBIPKLnmgzSk8SCFm8QF6gjsWuZ2T4udyLShlaVFdrAA6fnHZ2alJpLU8ltK3Fo4stpVYZgTrzDf1RlqcmpF1eR8KUbZiDmSeYX3COgLE/MOuLSpE08kBKiq6Li2wbr259sPc3PTd4jcqzdG2iDmk65lniggtJzpPebswIOhtyEA9EcjruA6I6l1xlPFh1JtcEAXKbjUXt12jmhPGOttk2ClAE354ljaMyFyOMyvbGNZyWIFApbK+QEgbzCevuuUioITLhIS63mDTp5DbadddsIHK6HGsinGW1KFlWTmy32gRabA5w0gjf4cnv8AMCO/7J2SoKF0kEHeDpGYY3qyoAcU/mPIlrT7oV0ecmJ1LynUjKhQAUBa1xs9EcfC5o0iq9Zgs1NEZXEWH83JxjtJ+22PnE/eI4x2k/bbHzifvEQFCG6wrt3wQb4IzS2aI5TXtZ75CvujrHKa9rPfIV90OGtcOpUiCQQRtjKlZjstGII0ixiI1cSVoUkEpzAi42iNowYSQJBuEx09Ts67+3txhvnNt4veHB6njKS0pQUBsIGvohPSxebfVuDi/vh1iWR1nZLV4pi9RDKGxnKwOremOnzBU8CtSkqSqy0L2oMPY1MMi2w5iB0DT9mkHpsIfmR34OUEA3sYUlriyrY7LxzIZDkSL28EwY1aUKM04oENiaaBURoNeWHOjoIpMqrIUpKe9vvFzEqqE9Q63TuwKpKZ5ckK4qxy3GwgpIMc3apSpWloptPk7MNo4ttChZKBute5iM1B4sR6JvdD3vi5MIdLMG6YrwXgMEcQxZBi5qL/AAeR+jt/hEUwIueifwaQ+jt/hED8Q+VvajGEfM7sS2CCCBSOIima6f8AxuofSXPxGLmima7/ABuofSXPxGCGHfMexCsW+RvakQOukEYEZ5OmCpQJLaTLOzKg4ibcZZIuS2QOg3O+I/UpqbotUXKTakutkZm3D3uYeSJNRGuPooYaUkOApulRsdBY+mIxjsNMT8g04tK1JZ74A3y98fX6ImhAdJokL0NlBTBgYWAgbwtkVyVULqVl/wB9Mb9uZL4b0RGsskhYN1G2uwkGFbdXQ3okL8gtFo07TqCjdg1Ef+sDvP3TiZ9qZnkuZHVNsjvbJ8JR39ULUzy1nvJVw6XGYgXhmFbzaJl1q6/XG6qq9qlEuUkb7fdHOIB1hd5po8gWXtqzP3S81tDZXmAAGlkAkjmMEpXG5uaDPEraCh3hVvPJDE8/NuXUoIbvtUTtjpRZN2pVeXYlyt98KCzbRKUp1Jv5PTHXwsDSSFFV4bSiB4awDI52/hUgnqeJ0oJcKMt9gvCXtCn4dXmw7KSUKKVCxBsQd0YikJHAWCwSau0Kfh1ebGO0Kfh1ebDtGDC4x29Ky40qX7VvBxKyshaVai2yJtUGG6xJNPy5Cyg509ViOmIfHeVnpmSVmYdUi+0bj5IayR8crZ2fM0pxDXxuhf8AK4JWRlJB0I0IhZSQFTg5kkwlNeW9rMyks8r31iD98ZYrTLDnGIkrG1tHDb7o2EPCWEgcYwg9Vj9llpeD8oJ4t4I67j2Kk7LgacCyL2hwbmW3dirHkMRRvEsubcZLPJ+SoH1QrZrVPeIHHFsnctNvTFxuO0L9bi3tB9rquMJrYh8LQ7sI97KSwQ2NvupSFoXmQdhBuI7IqB2KR1QTjc2RunGQRvCqvfoO0JAWnrS2MEgC5NhCYz6NyFQndmHH9N3IIfo7SmunbqbmVxrUvLVqUckJhoOy7mihexPIQdx54gFTws5h0hiWdE42RmQ2ohLiU32HcfRE4n6izS2yMyVzBGiB7nnMROamlzK1OOG7itSYxWN4jHUSBkObW7d56uofzJavCKaamjL5jm7+3d29ajUpU5aoTjkkwr+0t3C0KTZSADY67NsO8tKBk5lHMr7ojOG0p9klRUAL8a/c/wCcRLoD1EYY6wR6tZxT9AHKwPinPDX94Kf8+j74uGKewz/eCn/Po++LhgHiHzjsRHCfy3dqIIIIoIqm7EX8AqP0Zz8JinYuLEX8BqP0Zz8JinLwUw/5T2oFi3zt7FmCMaQaQRQhZht4PP8AESn/AD73+muHHSG7g8/xEp/z73+muHH8qTsPorlF+aO0eq9GSHtjyGHOGyQ9seQw5wY4M/o+8+y0UmtERzEn8Pqf0dz8BiRxHMSfw+p/R3PwGGcJ/wAmP/L2KTNq84YY9tL+a/MRJYjWGPbS/mvzESWB1R85WVk1pbSZqWlJrjJlrjE200vlPLaFNYoeFMRVKVqc8papiWCQjKtaBZKswBA57wytTDbzy2UG60EJPT/swsMq8yO+QUnlteKxZZ2kHEFWKeWZjToDIdSeK5UZCZa4ppAW5oQ4E2sOmGBSrn8+WN3VE2FiOURzhzGBg0Qq8ry51ykVZortZlFS0vPsMhSkkh4FNxbUXAO8DbHOh0Wp0mzAl1OISc6HWlBxN/JshxguUkEEgjeIcXOLdDYjtBwjnpYxEGgtHcU9ys2/NJPFtqUtByrTkN0m17ekR2cD1rPONMD/ANRQSerbDF2XMWUOPcss3V3x742AufIAPJHOKXJBe90Ql4YTEWijA7Tf7JfUVSypdbTU0VOG1lIbJA15TaEEEEWmMDBYLN11fLWP4ya1+oWU24Mv39R+S196onsQLgy/f1H5LX3qiewFrPzj/NiNYf8Ap29/qUQQQRWV1QnhM/cSHy1/cIgUWrivDjuIW5dDUwhniSonMCb3t6ojvczm/GDHmGCtLURsjAcc0DraSWSYuY3JQyNkcXm/aFxI2gotcHcdYmPczm/GDHmGMdzOb8YMeYYscriOV1UFBUD+1Q9YaCrMhQQALZjcnnMdZZZZKiUNrSoWKVpB0/KJaODSZ3z7HmKjfubzINxPsX2eAY6KmLenNoahp0g3NQmaZk5lzjHJCWU7oM6wXNnyibRltSGhZEtKJH0dv/4xMTwaTRP8QY8wwdzOb8YMeYY5yuLVpKV8Vc43cT4/uoeXG1aKlJJQ55Zv/wCMZLwDAl2mJeXaCs+RlsIBVa1yBEv7mc34wY8wwdzOb8YMeYY5ymHemupqxw0XXI7VDI7Sfttj5xP3iJb3M5vxgx5hjdng3mmnm3DPsHIoKtkO4wuVRb1G2gnB+VT3fBBvggGtOiOU17We+Qr7o6xo8guNLQDYqSReECuHUqPgiZdzSb8YMeYYO5pN+MGPMMHeVw9JZfkE/RUNhFNTz8uohEm44BvB0MT/ALmk34wY8wwdzSb8YMeYYQq4QcylyCfoqqKZUZtptwLpz7LqlFRDgunUk6EbYXJqs3fWVv0AxZI4NJvxgx9WY2HBnM2N6gzfd3hiV1bA83yU9TBVVD+Me3PIeCrCkmZmqvMPPSMzLpUAQtYGUgaWBvtO2H82CNAR+UTLucTQ0FQYtbZkVGquDecIt2exz94qOPrYSdafPFVTaOm35QAFDCSTcxrEoqmBJmlU96dXOMuJaAJSlJBOtvziLx1krXi7Sh0sL4jZ4ssiCMQXh6iWYuaifwaQ+jt/hEUwIuei/wAGkPo7f4RA/EPlb2oxhHzO7EtggggUjiIpqufxuofSXPxGLliDVDg8mp2fmZlM8yhLzqnAkoNxc3i5RStY4lxsh2IwvlY0MF81BY7SjjDTwVMMF5v3ua0SzuZzfjFjzDB3M5vxix5hghyqE5aSFCgqBno+ij7jFOm5jjpOdVTlK8NtxvMg8410MNVQwrRHJhUxN1Kcnn1bmglCR6DE17mc34xY8wwdzOb8YseYYTatjdUn88ETFTiQYGAeigSKJSGj3km6ofzzCr/02hS1I01BsmmNK+U84f8AqiadzOb8YseYY6jg3mRtnpe9reAYdyuM63nzUBdiJ1uPioghqnNj+FSYvyFWvpjV5mjrsFUhu38r6x+cS5XBtN7BUJcAbBkMa9zSb8YS/mKjnKoumfErl8Q6R8VD+1uGnBZ2kzA+TMrP5wvpRoVA452mSLyHnU5Spasx6Lk6CJD3NJvxhL+YqDuaTfjCX8xUNNRGRol5t3pOOIOGi4kjtUNUoqJJNydSYxEz7mc14wl/MVB3NJrxhL+YqHcqi6Sp831HRUNjBiZ9zSb8YS/mKg7mk34wl/MVC5VF0kub6joqGCMxMu5pN+MJfzFQdzSb8YS/mKhcqi6SXN9R0VDIyImXczmvGEv5ioO5pN+MJfzFQuVRdJLm+o6KhsETLuaTfjCX8xUHc0m/GEv5ioXKouklzfUdFRWTqEzIrzMOEDek6pPkh6axMwpI4+XWlW8tkEHrhw7mk34wl/MVB3NJvxhL+YqJ4MT4h2lDIWnq/llFLhMkw0ZY7jrST2QyRtkbmFK5CABCOZxFMOpKWW+ISdO91V1w9jg2mBYifYvy5TGFcG02f/MWPMMSVGLvqBaaUkbtngE2DBTBnFEAd+3x1qHl7v1qKsyidTvMLaLMU9h1RnW8xPgqIuE+SJB3MpvxhL+YYO5lN+MJfzDFN9TC4W0lZZRVLXaWio/TqDhekVidrDMw649OZ87bhzNpzKCjlTbTUQkn3JdyaWqVbKGjsBiV9zKb8YS/mGDuZTfjCX8ww0VMV9Jz7lTTwVU3zMUfwz/eCn/Po++LdL7SXksFxAdWkqSgnviBa5A5BcdcQyl8H81TqjLTip1haWXErKQki4BhgkajMV7GM1iSXc/s7C1S8sFE6to0uLaWUcx8oirU6Ep0wcgPPYFYpS6ljtINZVrQRylZhE3Loeb8FYv0c0dYHouDcXCbMTqKMOVNQ2iVcP8ASYozs5/3wHki8sU/3aqv0V38JihYPYQAWOuNqyfCJ7mysAOz3Sjs5/3/AKBB2e+PdA9IhPHKZdLTYyWLiyEIB5T/ALv5ILljdoQFj5CQ0E3TgKi7vSk+SE3BvNcZwjU1JTYl97/Tcjo/Kuywb4waOIC0kbwYScGf+JNL+fe/03Ije1hge5u4+iJYdJIKgMcdo9V6akPbHkMOcNkh7YHyTDnF/gz+j7z7LZSa0RHMS6U6p/R3PwGJHEcxN/Dap9Hd/AYj4Tfkx/5exSbtXmjDE82mZWClX7v8xEjdqLDbDjmcApSSAd55Ih2HfbLnzf5iFk0t2p1OWpsrcq41OYgaXv8AlEU0DS8krGROlmmEbQrCwvR2pOmy7jiguYes64dLAnW/9XoiV9itFIA1HMdsRuUvIpS0pKrJSE67dIXCoISNFWjOcaNIlwvdev4bh4padrGnPWTvP7LpURLyqHVrSlSUC+oB1iHszIm0F4ZdVKHeiw0URCzFFYAZUlKtEDMT75W4RDsLvzi5Z2VCXFOpczJAF8wVt9IPXFylhJaZNSo8JKMSUTngXc3Pw1jwUpgMNYm307Va84jYT7w96fJFzk7l5Tyxm4pxtGYbxUXeRHVG4nHrC6Ec+3ZHOIcuiqYlsEInJ50XORCdwvfWORn3j70eSO8Q5dNVGrI4Mv39R+S196onsVvwSPremKpnN7Jat/XFkRnq5ujO4H+ZLW4W8PpWuHX6lEEEEVFfRBBBHLJJkxbiiXwpTEzbzfHOuuJaZZCrFxR1Ou6wBPkh1kZtuelGplu4Q6kKAO0cx5xFYYoq0viPHna5ZbclKU0U5SdFvKIz9QsOuJjhyaEs92FazbmqBuChu8o+6LEjBGGgjO1/HUqQq/6xZs1d6kkEEEQ3V5EEEEcSuiCCCEkiCCCOgXSuiCAwRxJEEEEJJEEEEcsuIggghWSRBeCCOg2SRGIzBCukmbF/92575A/EIqS0W3jD+7k98gfiEVLBbD/yz2oBi35o7PcrEEBgi+haBFz0X+DyP0dv8IinmwBsFzu54uGi60eR3f2dv8IihiA+EIvhHzu7EtggggSjiIIIISSIIwTYXhLS6pKViTTOSTvGsrJAVa17G0Kx1pXzslcEEEJdRBBBCuuIjAIOwg7obcSVtrDtDnKo6Mwl2yUo9+s6JT5SQIjfB+t+nS/ETcwHVTa1PKUdzqjdXWSYk0fg0yVC+drHhh2qbwQQRGpkQQQR0JItBGYxHSuoggght1xEEEEK6SIIIIV0kQQQQrpIggghXSRBBBCSRBBBCSUI4V8YIwzh1yVYeCajPpLTIG1CfdL8g0HOREN4PJpCaW0ySABcp50/97xHeGFxT/CBNoM1x6G22khI/wCAMoJR1kq/zR1pLjSEdiyKX5pxoZlFlPg89zYDo2xoORtFG0bTndAqyUuk7FcuHJwIfckyq6VjjEcx3j84kMU7hmeqjtekEMNzGYupCw42UAJ90SSOS/TFxQFmi4s2RCgkL47HYmvFP92qr9Fd/CYoWL6xT/dqq/RXfwmKFgzg/wCW7tWe4R/nM7PdEYorzUxihhpyxQwCQOVwg2hPUZoykot1IurYOkwhwpxyZ8zAF9+Y7jy/75YKztJid2KhQQ3JlOxWjienJnqYH20jjGu+TbeN4iAcGf8AiTS/n3v9NyJpL4lTxBZeaNiLXTrEYwZLNSvCzT0MEllTzq0XGoBaWbeS8CaBz2QSwvGwkeCJNY3lLJBtI9V6NkPbA+SYc4RU9k6unoELY0/B6F0dGNMayT3LSvOaIjeJf4bVPo7v4DEkiN4m/htU+ju/gMVuE35Mf+XsUm7V5bw8QmZcJIADepPSI1kpdyaqanmJd+YaS4VHik3VbmhA08pptxKdOMSEk817/lEywPNtUlai6hK1ubQRew5oZWyOiY5zRcrJUsejd52p8o5xHMsJdlWFMy48FuZcN1D5NiB5YUz83VpJoOTclKBBOVRAsrUbsth5T1RIJWsyb6O9WlNt0Iq7PykxKLl1qBSobBqb7tIyrKlzpQHMyur4nmiaTC8tPUVE1VEkJHYsoop9043xhvy99cX8kcnp6afFnH3FI3IBypHkGkcNmkYjTNjYNQWeqK+pqD/WkLu0lEZ2xiNkIKjzcsPsqoSpdKnWGg87KuJaPu7aRycUUgbiNhG/ph9w/O8dLv0x4ktOtkIB2giEM/UHKW0ZJuWzFpvNMXbzFxVrkdGoF4pNqJA8xEXd4Zb1e5M0tD2nI+u5NRWFKNiNNo5IxD3T8LOdpHJhWUvOftkAG6he5KSdn/aGUixsdsTQ1DJr6B1KCpp3QkA7VYXBB7YqvyWfvXFlxWnBB7YqvyWfvXFlxm8R/UO7vQLaYL+jZ3+pRBBBFJFERF+EXFhwfhxydaSFTTquIlwdgWQTmPMACYfahP8AYKUEN58199oqXhnxS1UZSSoSGEB9TofUsqvxYsUgeW58g54vUNMZZW3F27VyoY9kBl2KEYOmXkVBycczOLJKytR1UT4Vzym8WXL4klyhCs5bdbUFAqGwiIVQsJVwMtNI7GZYc78zFiVAcmU21iRowZMsghNSU6OV1AJHVaLmIPp5ZLl3gsxd17hW3ITjdQk2ZppQUh1AUCIURF6DOopFIlZFtpTgZQEqWtzvlK2knTlvDh2/V8XHn/pAw07/AO3UtfFSTPYHW1p4ghn7fq+Ljz/0g7fK+Ljz/wBI5yeTcpORTbk8QQz9vlfFx5/6RkV1Xxcef+kdFNJuS5FNuTvsghnNfI/5cef+kY9kB+Ljz/0hxp5NyXIptyeYIZvZAfiw8/8ASD2QH4sPP/SG8nk3Jcim3J4iOzVUqFJqYYmHeNZX37alJHfJvqNN49UKfZF32XscX2+H+kMOM62DT2Xi2lstPAhWe+0EW2f7tHW0zybWVSrppGxl+rR6081bFaZCotyEvLrmnlalDaSpVvJD404HmkOJBAUL2IsR0xXtDxAhDRmafLoeqE6QVLWokIQnQ9CQRfnJh0dxLOy0wqWbAW/MWU0lRuG/fG9tQNfRCNO42sFXgdI5vGZkE+G4KYwQyt19YbSHGAV21KVWBMbdvz8W/r/SG8nfuRIUU3RTxBDP7ID8W/r/AEjHb8/Fv6/0jvJpNy7yKbcnmCGbt+fi/wDX+kHb8/F/6/0hcmk3Jcim3Ixh/dye+QPxCKlixsT1kzFCm2uIy5kAXzXtqOaK6AKjYbYJUUbmMIdvWZxqJ0czQ4bPcrEdEI3q/wC3PGAi3hAnW1hG2YJUddRvA2xdCELVSzs0vvIi46L/AAaQ+jt/hEUs6822bqUE3OyLooZCqLIEbDLt/hED8RB0QetFMIcC9w6kuggggSjyIIIaXq2pp5bYlwcqiL59voh7I3PyapYoXyGzQmDhUxS3QMOrk23SmdqP9naCTZSUnw1c1gbX5SI6YNqEuwlmXZyIZdSEpQnYlQEV1jaaON8dcXIJaSaeyGVcas5XFhRJF9223kh8p+HJqQdYmHKgkFtaVrDaCnYb2Bv+UXp4I44mMc6ztZ70EnncKjLZl91bUEMwr5IBEuLfL/SM9v1fFx5/6RU5NJuWh5FNuTxGDDP2/V8XHn/pHOZxOiUl3Zh5lKGmkla1FewAXO6O8mk3LnI5hmQqw4YsYKqFYaw3KBXESbiVzB2cY5a4HQkHr6Ic6TX2WpRtp1RbcQBZR5RviFy6HcfYqqNZaWmSU45nbStOYAAAJBGlzYC8TCXwSyhpJdqE2t/apYULHmy2sB6eeCVY2CNjIH5Ea+0rKTyOkkLgrSpc+3U6exNtkFLib6cuw+mMVOfVTZfsjiFOtpPfkHwBy9ER/Ds81SKU1IMMlwM3ClqXqpRNyTpzw5mt8ahSFyoKSLEFe0dUDhTuJu0ZLSxU00sIe3aNaWyFUZnmVOp7zJ4QVu543lajKzqlpl3gtSPCFiCOuICKitlE7S5RxLTqiUNhZJypBuNeYHyw5UqoUuihTUnJhb7Is86VkqVylRt5bbo7xBAO8KjFJI42Nssjvv1Kawz1WsTNLm20rZbMu7ohetyd4PIY4N4rQ6+plEvmUgd8QrQHkvbbCWv1UTdImkLlxo2VpOfwVJ1B2c0NbTvOxXXU0skZdEniarkpJyLc48rKhwXAJF4USE/L1OVRMyzgcbVvG48kV4xPydTUzMTqw5JyGdS2DolRvcE8o1JtzQ9TuKn5SmuuyUgzLFbSi0HO9AXbQkcm/wAkcEDtW1UoJnPbxh+W38K41KvvTWMwzJzREvSUgPtC9nXFi5B6E28pMTVlxLzSXEG6VC4MefaBUlU+emZiWn3ao9MLLji+JOdR90SkXsL3IPPFo4SxM+9TlpclFJDbhCSpRFwddLjlMWKmlc11m6gOxRUMz55jGBrU0ghm7fq+Ljz/ANIO36vi48/9Ir8nk3I1yKbcnmCGbt+r4uPP/SDt+r4uPP8A0hcnk3Jcim3J5ghm7fq+Ljz/ANIO36vi48/9IXJ5NyXIptyeYIZu36vi48/9IO36vi48/wDSFyeTclyKbcnmGjFdcGG8PTtUyhSmG7oSdilk2SDzXIjAryvi48/9Ij+P6zJvYPqbVQZCWXGsqbL1z3722nvrRNBSvMjQ4ZXCjmpZmRuda1gqmwo6qYrTlRqThfU8suLUoXLpJuT+kWbJdrmm/wCxoZaSo3ISANTtil6ZNqCmkLDrbYV3ikIJ+7bEqVUxIKTxomJZTicyM7aklY5uU822C+J0xlfkVkXOIKsRycbkyl9JTnbIUCDsibyk03PSrMyyoKbdQFpI5DFKMNVKpIRdmZDayAOO73ykE3HVFm0ed7U0yXkUs8YGUZcxXtO87IDOpC0fCblGMJillLtEZe6cMUf3aqv0R38JihouXENaL1BqLfEBOaWcF897d6eaKaEGMKjcxjtLegnCeJ8c0YcNnummvTYDaZRPhLIKuYbokdAwNPrlmnGqjxUs8cziQ2M9uY30v0REZlGSsqEwPCOZHJzRN6FXZpmXunwQbW3eSLeIGRsYEShpmCOMAbU/M4IkGB+yemgd5LpUDz99eGChUdVG4XaS33xadUtxCySb/sVg68t/vEPycVXQQppWbmtDlgOnpxLi6XnnwtCaYlTyMtrFSgUWUecEnTkgZQR1MkhiJ+YEZ9YVuNodIy2wgq35e3EotyCOkYQgISEpFgIzHocTS1ga7WAjhREcxN/Dap9Hd/AYkcRvE38Nqn0d38BjPcJvyY/8vYpzdRXklKwltaSkHMAAfe63iTYeptUccbKZIutgaOcYlIR074i4QpaCpKSQkAm26J/Ra12FI3baCluhKgonQackQYi97W2YL3WZpwNAJQqSqwmexm6Yt0nUOocTxducnUdUKZ2jT0lKqee4q4FylBJt1jX0RzOKZ0BPFZGlC1yBfN17o41GvTlSsFq4tFrFKN8BWicubcC21SSNBac7JuhIKlLGoGn8Z/aAgOFNtLHdfl325I6zcy3JSzsy6bNtIK1dAEQyjMTU4typGwfeXxxN9hPggdAAEH2NGiXFA6am40Ocdnqp4hAN82mkLpOWamG3W+MKHkoK0Itou20X5YbpWeM1LB0gBfgrSdx3x2lnm2lEutrWCmwyrykeg7rjyxFKHaJ0NajjDWvs/VtTlJ05DpK5epSvHIUUFDpKApOUgkE3vrzQjxNU6nKMtIbbUhaFJYmplsG10khKb8/5QkcUlS1qSjIgkkJvfKOSEdGrTtSffpdVmVzUq4FqaU4oqLK03yqSeTm54rSQZ8a74reKKUUjXgtAtZTyiF6fbY49aDLlAU6kKHfODTKRyaAwxYikBJVBZRbi3CVJtuO8Rxlp5TwLlPk5viG+8ztJURppvNyeWwtGKjNzL7baXUPFAVotxGUA22ai5ijSxujnuNR2J1c0OiNxqU14IPbFV+Sz964suK04IPbFV+Sz964suB2I/qHd3oEfwX9Gzv8AUogggikiig3CjiSaw5LyC5ZplzjVLCg5fSwGyx54otyddqldfnpwgurXxmXdt0HQBaLl4aJdL8lTSpSkhC3Dpv0TFK0yTNSm1qD/ABOWxCst9ug0jUYYGtptI5dfegVZUyvmdAT8DbZbiVZFGxOtMqnOgqQNByjmh4OKJYtXGirbLGI6zhmeZkwkVBoupHepDNmz07/KLQukcITZAen6gB3t+LYSAkeUgk+iBEzKUkuB8P8A4qg0lym8aTdOI7HZaWhZJ/a3v6DCfukVL4pKf1euEs/RWTNKR2UtzKAN1x02hN2iZ+Fc9EFIGwhgsFK3FKyIaDHkAdic+6RUvikp/V642Rwi1Nw2ErKA8+b1w1domvhnOoQChtAgh5wEcwiXRh3LvPNd9Q+X2TyeESopSCqUlNd4zeuOSuEmpX72TlR53rhsXRGla8ascuzWMCgtHY64fII7aEbEueK4/wDYfL7J0HCTU/ikr/V64O6RUvikr/V64bRh1J2LeP8AlEZ9jX0jzP0htotyXO9d9Q+X2Tj3SKl8Ulf6vXB3SKl8Ulf6vXDf7GFckz5n6QHDJHxjzP0jlodyXO9f9Q+X2TmxjaoVF0JMvJoLff3z5VHmBJtv2c0Jl40nJVTsuuUknznJWpRKwo8t72hGcPJG1bw6U/pGRh1vaXXOfQaRwRw6V7KF9fUvOk91z3fZO9MxK0tyafkpdLU6tvNxTqrtkDUhFgCDpvMaTeNqjKvNuuSVNU6E2zJuVN/yk30hFK0eXlphLxeebKfBKQDry2jg9RGFOrUh54pJuM1r+WOBjA/VknNxCoYwMa+w3ZeOpOHdHqXxWV6leuDukVL4pK9SvXDX2ja+Fc9EHaNr4VfoiTRh3J/PFd9U+X2Tp3SKl8UlOpXrg7pFS+KSnUr1w19o2vhV9Qg7RtfCr6hCtFuS54rvqny+ydO6RUvikp1K9cHdIqXxSU6leuGvtG18KvqEBojKRcvLA57QrRbkueK36p8vsnQ44nqoOw3ZeXQh3QlINx6Y3QEkXF8w1hkRLy8o8lxtxbik7jYCN3Jt1z3WUciYeIbn4RYIdVYm6V2lK7SKcn55tq4CrnkG2ETL03UZtcvLIslDZWs635hfyH0QiddQy2pxw2SkXJh94NptLrM0pdgt10qud42AeS3phlUeIiMgFyoKYvqCdLJqZbkq1JJvvi/cP/wKnfRmvwiKYxLT+wamtSBZt05023coi58P/wABp30Zr8IihicgkhY9uoojgDCyeRp2D3ThBBBARapEUpXeEapSddqMo3KSqksTLjYJzXICiLnWLrjz5iWmNKxFV18asZ5x0kjd35gvhEbXvdpDYheK101KxroXaNymnDjU7U6k/NSrSUocdU4oBy2W5vv1tcjniYIZrrko6p67LKAbcY6m6rclr6dNoick29SuNblluFlevemyhzdGkdJaqGpS5eamHXGnDa6rjNbmMX6qCSSTIC3YgxnY5plvknRnhKqkuy2yJSVIbSEd9mvoLa6xv3UKp8TlOpXriPqpqVqKi6u5N90YFLQdjq/RF3iItrVCOEFaPhEp8vsnWW4R6pJPO/2aXLLqsyArNlQd6Rrym9ufmjWt8IE/VqTMyT0vLttvIyqUjNcdGsJ5KlJcJl/3pWcxSvYLa3/3yQ31mmt8Q4uVKlAWOUJtcDbaOtjiLvlRqqq6xlNFK+YjT1tOvdfVqRhmcU26htsqbVY2ABJX0W36xLpbE804sy7LpdcGhQlBKk9IGzyw04Xq6KfSwEoUtakgAX0Ftt4e2MYLZWSiTasdpJ74npgVWFz5D/Tvbr/ZUbJG7jSfoc242hpLjiwM6XQpOXksNOWFq+EaZRSWZgstKfWopUg30sdt+S3piPVZSqxM9kPqyrtYZRujm4mYdlRKLm3SyAAE2GwbBe17CLkdO10bbix2qqcWqICY2yEAarbLp8RXaTVZx6cZdmZOfJzpTMOpDJJASQDbkvth7o1VU1MuUWZ4sPZM6HUJIS6Fak67Tc7YgTVDU/m4rjnMozKyi9hyw+yjU1KyEnM96pEqR+2zJKktlQ73lFrxBVU4A+A5+fV/8XaXEZS/SBIO8bU9yNbVLyamlJWwhLqmWysZ3nXQdTpYW2DyQgquNZmXnVNOsJck3GyMhJRxiTfUH0dIMJqsmTqaZafU4ttLWdKm2V2u5muLHde9z0Qjcbkp+VUZxTrjrSgpDqlEuOI1/Zk9JGtoiijafjeD2bv57qeTEZx/T09mXYE40uepjzzRkP7M5fMqWeUpzjFJvlsSQN40uISVvGdRelgioUlsywdLayCpASrZYnXnFoZxTmVTIU24phJULXN8nl2wYkLi6jLOOTCHZdxVnENm6Ekm+vLc6xcEADxtGvPWmU2IyFpja6wOvVmpfQMRMMSTQVJhAy2BRtsI2q2OHKchLkoy2vOfBX9+kNzc1RWGkNopLbmQAjMkJC9Nb2+6EVfmpesONlmVRKpQnKMqQDbk6IoQU0bp9LRIupHVElM3jY3WISk8KFS3Scp/V64x3UKp8Tk/6vXEe7Vt+/VB2rb+EX6IMcni3Kr+Ia76p8vspD3UKp8Uk/6vXB3UKp8Uk/6vXEe7Vt/CL9EZTSUq8Fbh6AI5xEW5d/ENd9U+X2Ug7qFU+KSf9Xrg7qFU+KSf9XrhgVRgnVSnB0gRr2rb+FV6IXERdFL8QVw/7T5fZSHuoVT4pJ/1euDuoVT4pJ/1euI92rb+EX6IO1bfwi/RHeIi3Ln4hrvqny+ykPdRqvxST/q9cMmLcZT+IqciVmGGG20OBwlu9zoRrc88ce1bfwi/RAaU0oEFaiD0Q5sUbTpALhx6reNGSQkHWMvsnLBs6xJyyHHnClPFEWAvmOb/ALxIE4pl0jMJdS1i9gq1umIazJOSKSmXUHGyb5Fm1ugxp26lEzyZFwrRMqIAQU31Ou0XEDqjDxJIX2urEUzJhdh1Zqaz2L+OlkJl2OLc2m+oSeblhvVwl1Ng8UJeVcyd7mINzz7YaHUFxBSFlF94hJ2rb+EXEtNRRxjMKE4xJAbUzyN6fneEWoz7S5RyVlUofSW1EZrgEW01huA3QkbpyG1pWFqJSb7oXttki+7li42NrRZoQ2trpqtwdM7SIUelpVNTq7nZBXkGYmxsRY2AieyuE5ZiUSgzc9cpujMsAo8gGvlvEOel106o9mJzKaVcLyi+UHmh1NQfmVJeMytwgd6sK2CKle2RxAY6wRiJzHMGhqUmp+E5HNmnKk7OOI1KM4QE/wCVNvTeOWGiqmcKFGVTp17sR4uNvMJdVlJDbhAVrZQ2G24iI6HXAcwcUDYi4OtjtjvgSoCY4RKLLtjvG3nLnlPFLirAyeJzpw+5APp4KVmjxjAd49V6WYnEPKyAEHbrCiGyR9sDoMOcanBaySqp+Ml13IR94sckRHcTpKabUydLyzpHmGJFDVihjjaBUbWzCWdI8wwsZonVUFma2m461wG115Mw8AqYcBAILdiDv1EO/YimQexnOLF75FDMnyDdDRhz2yv5v8xEhCFLOVCSoncBeKE9i4rAPlfG+7Cmml1pVRnJiWMqW+IUtJczaKKVZdIdYYMMhS6jUG0pUpaX5jMkDVP7XfDvUJ9imSjs1Mqytti55TyAc5hjomNdZgRHGA5kzYmaiAe8qNY9qgQwzSm12cmCFugbQgHTrI9BhRQlpDQQNhQCIgk7VHarVlTr1gpxWiRsSnYAIk9InQwEJKhdOy+8RbmhIiDVabT8TE1u3apQ06JebTcnK93p5Mw2H/fNDjDFMzLD8sSlwBY74DYQYdpKY7KlkO7yLK6d8UmXtmhVbHY6Y2pNW5sy0pkR4Tve35Bvh54PVS0khapod85pqAQBptB6BDBiIt9jNhV8+bvejf8AlHShTKlTCErbmONy+AlpSivqER1TNOAt1K7QC0VxrVxMuSxT3ikWOu3bDRihEvMyKkAoC098lXON0RFNWMu6ZZCplD4NuIDas9/k/nshVOieQyHppl4JOwrINvSbRn4qNzJGu0tuXWrMzgWEO1KXcD/tiq/JZ/64su0VrwQoKX6qTvS1/wBcWVeG4jlUOPZ6BGMG/Rs7/UoMEEEDyUUVe8L4Bk6aDqCtwHqEU3TELpNTKHLBC/3ajsUQbiLk4XvatN+cc+4RWS20OoKFpCknaCLiNRhwvShp1FY7E6kw1rzsNvRLl1ufW6V8epJItYbB5I5pqU4gOBMw6A54Xfbefp54jdefmaW3LKkVkKdfDWVZzJAyqOzyQ6yS3HZRhbpBcUhJUQLC9tYfyEAZAWXZKgNgbPbIkgdyeaHKPTrriGEKcc0vyAcpMSQYcblmw7PzrbKd9rD0mEWBqiyw87JOAJW8QpCuUgbP988IsXCbFZWJglTZsWRuy80SUdEamqMGlogC/WexQPqWspuUEaRJtbYE4PTuHJVRQgTE2oaabOvSNU1uVSP7NQLncpw3/KOEpJol2k96nPbvlW3wotGsi4N0jR8d3dpPtYLNy8IZybRgDu+91jt1VCbtU6QZHOn9Yz23rh91Jo6E/pBBFtmCULdUYVV2N1h/vQapXD/zTCehA9Ua9sK54wQP8ifVG4BJsASeaO7chMui4aUBz6RMMLpB/wBTfAfZQnFqs/8AYfFIzO1w/wDmQ8weqNkz9cH/AJgk9KB6ocm6O6rw3EJHNqYUN0Vv3Tqz0C0O5spfpN/1H2Tedar6h8SmlupVu5JmmFdKB6o6Kq9aA1VIrP8AM2dYeRSpVCLZVG24qjdMgwTowknovDHYPRu1xN8FLz1VtyEhUf7cVQn9rJ0xwcySIBVVf8WhSi/kKA/KJQimlIulhA8gjmppIJCkJuNxEVzgFA7+zzP3Ugx2tbrPiFGVVKSX+8w+6nnQ56ox2dRP+LTp5nnGv5xIVyMs54TKekaRw7SsrV3q3BzXEQv4OUVr5j/yPuVLHwhqb2sCeweyaWVYamjlROPsq2Wc0+8WhW5hUKSFy82lSSLjMNvlEaVJFGpYHZqlPuW0ZTYk9PJDFUsUTk63xDCexZYDKG2wbkchMZSupIWyBtG8uG0m1u42F/TrWip6x2gXVTADsA1942evUks1Nll1bSQMyFFJVe48kInHVum6lExpryHqg15D1Q5kYaqMkrn60QQeQ9UESKFNeICVS7TKCSta9EjfpDvhuTnkspZk5GaLqRncUoFtKDyXO0nmhhWu9dK3r5WSClPKIs6m4qYLCA81kunakbYo4lK+Nga1t0fpYwyIA9qYKt2y4lvsyXdbQFaFzLe9tml4urD/APAqd9Ga/CIq6u1mWqEkuXbSVX1Fxax5YtHD/wDAqd9Ga/CIC1EjnU7Q4WsUTwxtqh5G0D1ThBBBsigBdHkRQeJSfZHVPpbv4jF+GKDxJ/eKqfS3fxGDGEfO7sWd4R/lM7fZc6TSXqu+pllxtBSm5znb0DfCWQwzU6Rh9l+osiVcCihTC1pKxuB0JBBtfbvjQEpNwSCN4jK3FuEFa1LI98bwbIkvkcuxZxlQ1sDoS3MkG9917eqygpDSlE2Vu5hCZSHn1kJdKhzXjeacU1KuLRbMkaaRswlTLSUodcA26KOpO0xwsLiStbQYpDhuHRSGMOc4nVlqO02/gXWnONyanS4vv1MrQnXUlQI/WOe6ONs83nJJPFk69KfWY7Q5gsEM4TVnKJ4yBYaAP+2a4mWSlSltEtKO3LsJ5SISUKemZ+VU9MhsHNZOS+y2+JPQqAqtqc/tCGkN7d6j0CE+G8B1aVpMx2yDUm804eLSVhSVpA8IkHSI3zQC4ec8lVpIpX0cjhry0c+vNIYIIInQRKqY46zPNOMlIWg5rKUEhVtoudNdkKjVZ+nTSwl1opUkDihZbYTtCbbLjfzw1wRE6FrnaTgp2TuY3Rbkb609pfk625kdaLU24jIixCWc+42AuCenfCIOTdNZ4sLZGfUoKUqWi426jS45ITSym0PoU6pxKQb5mwCoHcbHnjeZ4p6ZUZcuKSrW7tgonedOeI2xaLtEfKpXzl7dMn4tS4R0SyLErsdNh1t0wJQE6qBOtrDdGxWEqOy+8jfFrtVUDamqafcbqksw25kaUlSloGwkbLcnkhdDz2xobsxJzj9DT2VKJUlstuEIOYa3TsV5bw2Tb6JmZcebZQwlZuG0bExE1+kflt4K9WPY6OMNdcgWOveTf2XGCAxLcL4alZmTTOzqC4Vk5EE2AHLFmGJ0rtFqgpaV9S/i2Jow3RjV54BxCjLN6uEaX5vLFnUmVp0rlzJbbSjwUBGnXBSewKckt9ioSm9wEpFuqHtucobostpCDzpg3TUwhbvK19BQNpWW1uOsrt2ypK0BLjTJA5hDFW8NYerwWltlll0jvXWgAoHybR0xIW5ajuC7bjI6CIUIRINDRQVbcNYncxrhZwVt8THjReLhef67QZzD06ZWbTodW3B4Lg5R6obovDGNIYxBSZlpDQ41CS4wTtCgPz2RR+w25IA1VPxLrDUVjcSouTSWb8p1fZEEEEVkORviOkJOKHFaZszX4RE3w8qlpnCaoCUW7y/g357QvewdhuYxK3iBNVbbSjKVSqVIDS8qbC42239MQOq2xOLXA6kewZjW6b3OGbSOvNRuCHnEqqQuZQaUBex4zIDkvutf8tIa0NhSTckKvD43abQ61kGkj0HllwbblqhGY6gkW2DfHRdggEAi2zlEC1hGYXBG5Ntkc1OFW2JUw5LVRKjcwz4kRxFMdflv2L+dtIcRodVgfcTDxtOkdcWYOrCcMTEw1Ll91KmliXZBW4QHEk6AbhrpfZDeMYxwDjrV7C43vqGFoyBF+zrTfSuN7Xs8c4p1zvgpatp74x14M/8AEqmfSHv9NyHemYUqK8Oyk4JdbThbUt2XeBS4k51HYea2kNHBn/iVTPpD3+m5Eb5GPhl0DqB90QETmYgbjIuy7Lr01I+2R0GHOGyR9sjoMOcXeDP6PvPstVJrRDTiiYDVCqKRqtUq7Yf5DDtEcxN/DKp9Gd/AYsY3WvpoBxetxtfcmgXuvLWHPbK/m/zET3DeIJejBxD8sV5zfjEWzDm13RAsOe2V/N/mIkED6qJsl2u1LAmZ0UoezWpPITmEaPUpqrSFPdanZrMXVJB74qOZWhVYXOptFccMVQVVUy81LMBiW4zK4kHVSrd6T6fREgOyK5x5WhPz6JBhZLMsTn5FOfoNOkmFRUobLpi5PWiVNWVFVM0O1DNMFOaDjx5Ui4h3K0NABSgOk2jMvhpa0cbLTDmfZ4NwTD3T8KobGeaUHHCBqoZrdAi/LOwayiEkjSb3TS3NOpSC26cvTcRJsIzjr4mml3IQUqBtoCb+oRxVhmT1KBlJ25QQPQYdKDLIkWnJYIQi6s4y+62CKz5WOb8KH1pBiNgk2IUqTMsOEHi8tvKDr+UTSjVaXp8ivjFKWsrulAG6228MkxLNTTZbdSFJPWI4tImJVKW7B9pIsDeyx+R9EUKuETsDTsUVJVsDAx2RCmLeLJdpaS3KlxSrZs+hHRHCtV81EFtDNmtAc209ERamVaQqTjjLC1qeauVApItY2hctzUgbNxipFhrGOBtYhXKmdsILH69ysLglt2TVQDeyGf8Arix4rTgg9s1b5LP/AFxZcCcSN6h3d6BGsF/Rs7/Uogggiiiir3he9q035xz7hFaAFRAAJJ0AEWXwve1ab8459witW3FMuJcQcq0EKSeQiNRhv6cd6w2N/rHX6vRNeO6XOUinU6fnGFMsCcSCo7v2a9vJ5YeJajzzdGlJ1Uusy7jKFhY3AgWuNoiQtY5mi3kfk2Hj0kX8msKWapVsUIVKsMtyssrvXXdTYbwOeJHTzNaA9oABzN9imdJTS0zaaMkkEkdp8kz4VkXZyrsrbHeMnjFq3AfrD1jp5rNJs2u8CpV+RP6n7oWTU9IYSkBKy6Q4+RfLvUffKiJtB+rTypiYUpV1XWrd0CCuC0UlRUtrHCzG6uvZ4IdXTR0lKae93HX1funoQRnboIc5Oliwcf6Qj1xulh7pDLyj0wrvE97746AQ4sUhtIu6orPINBC8JCQAAABsAjYAk2AJPNDwEwuJXNtltkWbQE9Ebx1TLPK2II6dI6okFHw1AdEc0gE4RvOoJOkA3ubR1bZUs96Dltvha3Ltt7Bc8qo6Qwv3K02mtrKTNyYGrhueaFCUJQLJAHRGYIYSSp2sDdSIbp0APnnAMON4bpn9pNEDdoY4ZGxgyPNgBcpksbpLMZmSbBckJBBUogITqSYitdxcbqlaYrKkaKfG1XyfXHbGtXUylFNYVlK05nSOTcIh4HJGHqsQkrzpOyj2N9zv9AtFHSx0A4uPN+13sNw8yn/A37XF0gXCVlS1ElWt+9MXXxDXwSPNEUtgROXFdNJNiVq0/wAiouyMtjH5o7FruDw/oOvv9gtOIa+DR5og4hr4NHmiN4IFXR6wUdx202nCNSIQgENjUD+YRScXfjz+6NT+bH4hFIRo8I/JPb7BY7hF+ob/AI+5TRTZJFZrTrby3UEOZElBAKRe28cgibKosgAhJrDzIRo4rMhRPktoegRFDIlicVNy5F1+Ggm1+cHcYyqpSzU03KOucW+5bKhQ1PV0GLFXDLK8FjiAE+nljkaA3YNSlFYlaTJyqESky486oAhXGFWYc+touHD/APAad9Ga/CIoIDUdMX7h/wDgNN+itfhECa2J0cLQ83zV7CZGPnfobvdOMYgggYXLQoig8Sf3iqn0t38Ri/Iraq8F1QqFUnJxFQlUJfeW6EqSq4BJNoI4XMyJ7jIbZIHjlNLPGwRNuQfbrVdQRO+5HU/GUn5ioO5HU/GUn5ioNcvp+n6/ZZrmqs+mfEfdQCZClSzyUIK1KQQEgga+WE4mJ0JSDKhOmy94sfuR1PxlJ+YqMjgjqQ/8yk/MVCFdT9Measmkr3QtgMeQJI1bde1Vrx84X0FMnoEFKlFYA2jYP8vphagqUkFScp5L3ieq4JKkdlSkwOTIqMdyOp+MpPzFQuXU/SHmuVFHXTlpfFqAGzUNW1QZDi2lZkLUhQ3pNjG7k1MPDK6+84ORSyR6Ym3cjqfjKT8xUHcjqfjKT8xUc5dTa9Ief2UAwutAsIz4j7qCQRO+5HU/GUn5ioO5HU/GUn5io7y+n6fr9lzmms+mfEfdQSCJ33I6n4yk/MVB3I6n4yk/MVHOX0/T9fslzVWfTPiPuoJHZrLlBscw22ia9yOp+MpPzFQdyOp+MpPzFR3l9P0/X7LowqsH/WfEfdQhbh9ySBy80aXiddyOp+MpPzFQdyOp+MpPzFQuX0/T9fskcKrPpnxH3UEgid9yOp+MpPzFQdyOpeMpPzFRzl9P0/X7LnNNZ9M+I+6gkS7D2LJaUlGZOaQtvixZLidR5eSFvcjqXjKT8xUHckqXjKT8xUSw4rDE7Sa8eas0tHiFM/TjjPl91I5LEFKnQMypd7+ZCglXlEOCE0p03upA8sQ0cENRPhVGTI5Mio2XwWT0q0txdXk2W098pZCkhI5zyQQbwhg228/sjTKqut8VP5hTcStHO2Zt1xydmMOyIKnZwEDaASPvMVinDjU2jjGq4063cgKDDtiBvBI1EO7XBNPutpcbqkkpCwFJUEqsQd8ddwggGv3+yaK6rdcMgv8A+QTzXeEWQlpdUvTAFmxAya685iriSoknaTeJ33I6l4ylPMVB3I6l4yk/MVFGfF4Zjdzx5oVWU+IVRBfHq7PuoHBE87kdS8ZSfmKg7kdS8ZSfmKivy+n6fr9lT5qrPpny+6gcETzuR1LxlJ+YqDuR1LxlJ+YqFy+n6fr9l3mqs+mfL7qCBRSbg6iOinSpO0a7RE37kdS8ZSfmKg7kdS8ZSnmKhcvp+n6/ZIYVWfTPl91BCb7YxEzqPBhP02nzM65UJVaJdpTpSlKgSAL2iGRPFNHKLsN1VnppYCBK2xP82IhRLY2rktUuxUTPGSzYAOZouEabLjW+6Eyr5Ta17aXjjgmrqpsy84Aha3CS4VmOVDRxZOjpEK5htw5zgVLZ6u1h+nupelX2kLT4QbKDY778nNEU4M/8S6Z9Ie/03ImkzitqYllshrvlCygVC1jEL4M/8S6ZbZ2Q9/puRRoy7k8wc22R9CiLbmpjJO0eq9NSPtkdBhzhtkfbA6DDlBzg0P8Aid59lppNaIjmJv4ZVPozv4DEjiOYmF6bU/o7v4DEfCb8mP8Ay9km7V5dw40rshZPvNeYXESFxFrm2UDQc8MlCWQ8oXtZvQ8uo2w8KOY3js3zLzye2km3ENQVS6NNTTZs4hFkG17KJsD6YqeVZL7uYkkA3USbkxbtYkm6jS5mVdWG0uNnvzsTvB8hF4qKRmA0vXRK9vNFmk+U21oxhJHFuA1qW0qqqkwEXujZ/wB4fmaqw4Nbp5xqIhjGozA6GO6XFJN0qI6DEUlO1xurL49ymSp6XSm/Gg8w2wgFXSxONvLVYXy5RuSdsR4zbo2vKHljrISb1TmkstXUVG6le9G8mGMpw3MqJ8Y0TpnJWIBAQLQiedU5OMybSiAiy3FA203DymJrQpWlSN26slrslRuguG6MvNuv0xRmnEeWsoRHROeASQAd6rbC4SHXynbnduRy54kN7iJFQsH4cw3OTs6qqpm25kqIZeUgpbzKzG1tb7uiGirdhdnOdr83Y/uc3ptzQ8VTZpCGg23ojjga6XjmuBBAFtuQU34INZirfJZ/64suKz4H/bFW+Sz/ANcWZGZxL9S7u9Aj2Cfomd/qUQQQRSRZV7wve1ab8459witUIzqA5YsvhdBMrTbfCOfcIrkANi191/8AtGpwz9O1YbGx/wAx3d6J3w9h81Z5SllSJZBstQ2k+9ESGuVdnD8s3JSDaQ+pPeJA0QOU8phzo8siUpcs0jYGwonlJ1JiIltUzU5uceBKi6pKL7gNPyi7hNM3Eao8Z8jM7b9yjrpebaUFnzu2/ZJWqYuYcL86tS1q1IvqTzmHFCEtpCUJCUjYBGYI9DYwNFgsLJK6Q3cU4UmWDiy8oXCdB0w7wkpqMkojTbcwvl2uNdCd20xJqCgsXGwXWXlOMAWvRPJywtQ2hAslIAjaCIi4lEWRtYLBEEEENT0QQQQkkEgC5iI4mx5LyMgoUtSX5px1LDTikni8x2kH3VubTURnhPrKqThZ1DaCpc4rsYEG2UEEk9QI8sVdiBbbbNJdlmwEsIsTe4JGW33QExTEXwPbDFrOs7skawzDmTDjZNV8grFlKhNIUiXmJqaU8rvwrjSoG+t+QbNmyH+mvrmW1LdTZxJyq5CeUcxirZOtOKdQpZS0LaKF7iJHScXvLnDLtBkobCeOcVcjmtbf6BGK5TVwskY5xc14sbkm3WEdNHC6SOQi2gb5JFidwO16bN9AoJ6gIQoSAm287Ad8OtWpK2lGcLhdLiipZtsJ3w0LcvdOnSIt00jXRDRQqpa5sji7an7AywcWU0JA8NX4FRdcUhgP+91O+Wr8Cou+AeL/AJo7FqeD36d3b7BEEEECkeTBjz+6NT+bH4hFIRd+PP7o1P5sfiEUhGjwf8k9vsFjuEX6hv8Aj7lEMs7LrTiuVaU0sOuNNltJSbq79WwQ/wArMKlJht9CUqU2oKAULg2h8dxPKTE4zPzFDlHZ1gWbmFWK0DmJFxtO/fBF0j2H4W3HaqeGSxQvc+R1siPEWTCpKm15VpKVA6gixEX3h/8AgNN+itfhEUfVqo5V5zslxtts2CQEDdznfF4Yf/gNO+itfhECMWJMbNIWKJ8Hw0TSBpuLe6cIIIIBLVIggghJIgggjoSRaCM7oxHTkkiCCCGpIggghXSsiCGGj4zpVcrtUokq4rsqmryOZrAOe+KddQk96eeH6HPY5hs4WXGkO1IggghqdZEEEEJKyIIIISVlxm5yXkJZyZmnm2GGxdbjirJSOcxXeLuEhUwuRplAcWy7NqWXXnEZFIaGwpvszHYdunLCXhnrZE5RqDlWlpx0Tbyr2CgkkJT13PVFZ1ybEniUTLDRCVIQAkm99LH03gxRUIeA52sgkbur7oVWVbmuMbFZMhVJltbbKZiZRMS6e9K3VOBPlJ1vfftix6LVE1eQTMcWptYOVaDuUNtuaKHp1acXMEqWlpRFwq+3pvEyw3jt+WmHJZhphxrOAtS1kDMBqE237OrfENRQvBuAq9HU8W+zzkVYuIK5LYbo01VZsLU1LozFKPCUb2AHOSQIprGuO6nXWZanzQ4iWnH0OllCMoS2Dokq90bkE6AabIcOFnEFSqtCZlwnimA8Fvpa2KAGgV0K/wB6RAa7NmsMSkw2palMoKbHcNunVFzDqUENkO891tSkqqovOiw5KdS9QbZdbS0taGCLqC++seaJ9gieJS5J8aFNAcYyn3uuoHNFIU/s1SUTSGXn0hNyrKSCIdaHUpyo1RxllZaZl2wS3xpRnJOouNbabIjqKDIuB1a1TglMTw4L0NBFY0qvzDcymcZLq1oUA6haiQsb03Po54smVmW5yWbmGr5HE5hfbAdzS02KOU9S2YG2RXWCCCGqwiCCCEkiEcrVpGdnJqTl5lDkxKKCXmxtQSL/AJxwxLW2cO0Ocqj2qZdsqSn36tiU+UkCIDgaVdoyBUlvKcfmDxkwCPCKu+V5bm8StYOLLz2BVp6kROa07VPMVf3Zqv0R38JihovjEy0uYWqi0EKSqTcII3jKY88VibXLSwQ2LrdukHk5fvg5gwuxw61ncfYZJ42t2j3Tk5Tpt2jGeyZWn8yW1cgI0PljlhadapsopDsohx9JsQoC6dTzX1FuqJNSqjLOYdRTptKkENhINtnJ1REao0ewppSCA420spWNqSAdQYsROdUh0UgtY+SqC0Ega0ZOt4qQqxAlMm5KytPlZdKztQkbN9xvMNHBm1l4Raao7ePe0G79muOdKQUyEuXVLdWQQVK27TqY68Gzg7pNNSDa8w9s3/s1xMKZsMEoG4+hU7JL1YjI+VwHmvSkj7YHQYc4bJH2wOgw5wR4NfpO8rUv1oiOYnNqVVDySzv4DEjiNYpP/hNV+iu/gMM4S/lR/wCXsk3avLOGZjj5hZJuoN6jyiJHEJw+6tmZUtBsQjr1ETKXfTMNhSdDvHJCm+ZefVLLPuo9j+eclKKGmzYzDgbUf5bEn7gPKYg9HkGZxLqngo2IAsbRNeEOTcmKM2+2nMGHQpfMkgi/WREQw+4E8c2TYmxEWoTaG7UYw82prt13TrLUKVaAJU64naEqVp6I6GgomHgJdxbGbalJ06eaO5mO9AQLaRszOqZWFkbBtEQl79YKk0n3vdK5PDErKnMe+VvUdT1wppUzLU6cdR+zQh3QK2Xte33w0v1p5SSgKuOT9YSywcfd4xZzZeXlhoY8gl5TXxGQEO2qzMD0Zuq8fPTaVWecyixsdNluj84luIKGh6n/ALAd8yO9B26boZMCzaEyBlQLLYWFdIP/AGMTkpStJB2EWjIVlRI2pLtxyUhia5hj2KqbQQ5V6Q7BnlZU5UL74cl94htjSRSiVge3as3IwxuLTsVhcD/tirfJZ/64syKp4Lp4ST1TJbK8wa32t4UWB2+HwB879IztfA907iBu9AvQMCpZX0MbmjLP1KdoIaRXhf8AcHzv0g7fDT9gfO/SKgppNyL8jm6Poovwse1adZWX9ovW3MIrR87ABz25InnCfUBPS0gkN5Mq1nbfcIr5RAOp26RpcPaWwAFef481zK1zHDPL0U/wlWET9PRLLV/aGE5SD7pO4/lGKvT1MOqfbTdteqre5MQZpT8stL7ZW2pJulY0t5YkMnjiZbQG5uXRMDYVA5SekbInpJJaGo4+D4gdYVWd8VZTinqfhI1FdoI3VXqDM6qRMy6t+VItGOzKKvwKmpHy2TGuix6mcLvu3tB9rrNSYPM0/AWu7CPeykEp7VZ+QPuhSy8WV5gAdLQ2S1YpIZQ32zZukAXPe/fCxualHh+xnJdzocEW24xREfmDvuPWyrc11gNww91j6Ep0bnG16E5Tzx3BB2Q08Wq17X6DAla2T3qlJPJFiOWGbOJ4PYQU15mhymYR2iydoIQon1jRaAecQoRNtL91lPPEhaU9szHaiu0YWoIQpSjZKRcmMBxB2KB8saTCmy0tCl5cySNNscT9IbSqeqsy3jR6qzjs+W2WnbSecHKEJHJuzXv/ANoYkyEy1KSjbrVkzLnFIKrWOupHNzxwqNNnsPTblKm8zba1DUeC4i/hAw44rmEtT0hMSyCEto2FVxmv/wBowFRxwqC2Q/MSeywW9gDBG0Rn4dilklQ6aloSLkrZ8otmUoqJHLcbITYeoc9SJmdZdcaSl5fe31Lg5fvhDT62VOBThDSgL5gTeHmo1dblP49QTxOYJC06kn1QEcyZl2uN9Lfv6lJ2pciaTSnTLTASpu10uBPhdIiKvFJdWUeDmNofXqgzM051t0cW4lFkWF/+0R6J8OafiLhY/wAzQvEXD4Qn/AX97qd8tX4FRd8UhgL+91O+Wr8Cou+KGL/mjsR/g9+nd2+wRBBBApHkwY8/ujU/mx+IRSEXfjvXCVTA1PFj8QikI0eEfknt9gsdwi/UN/x9yiCCCCqALI2xfuH/AOA076K1+ERQQ2xdNFrYao0i3xF8su2L5v5RAnFo3Pa3R3rUcF4XySvDBfL3Ukgho7fD4A+dB2+HwB86AfJ5Ny2XI5uj6J3gho7fD4A+dB2+HwH9ULk8m5Lkc3R9E7xmGft8PgP6oz2+/wDQPnQ7iHjUEuRzdH0TteCGjt8PgD50Hb4fAHzo5yeTclyObo+id4IaO3w+APnQdvh8AfOjnJ5NyXI5uj6J3iOcIOMJbA+FJ2sPrTxqEFEs2drrxFkJA366nkAJ3Qs7fD4A+dFB/wD5G1hVdr1GpkqtxZlGHHXpZJulJUpOVXTYK8nTFygoDNO1jxltUFRFJDGXuFk2YDxA/SJmXqwWqYmmnC88pR75/N4dzyqufKY9QSc01PSjM0wrM08hLiFcqSLiPHMlTKklpLkuw4gEaAmyrdEehOCWsTktgWRZnf27qFupBzaoTxisqTpuH5QTxmkDrSM13shWFB8kjo257VZEEJJCf7NCzxeTLbfeFcZxzS02KKvYWO0Xa0QQRgwxMWYbMS1tnDtDnKm+tCQw2SgLNs67d6npJsI7T9Q7BKAWyvNffa0QvhNXMYgwfNyUpLlToU26EjUqCVAkActhFqmpzI9ukMiVK6CXijIwbFVFdlZ6uU1qvzc+JqcUm7wWSFWJuLDYAOQRwl6W9UJyXk1IWlxxPGgkd9lG8Rwok4uanpKTmVKDDSlEgDU2Gl+iFdQqapDFq3eNeeSEpQhStCBYbOa8aYcY1xiGwEj2CyZJJzUuOH6a5KKbZQoTOQ2zq1B5DzQ3YWkqjLSszKusNs3WSc51N9MwG2MU6uuOzLjiAEqNioKPhQ41GpILbboTxN1ZQ4VWJNtR6YFvdMLxHO+/OxTbpSy+0wVSE2lBAHhK1Sq+u+INO09mRmpGUE2l1Trt1JSgjK3fS9+Xk5oms9NS83TnXk2DzKbjjDrEFxVPdlzktONOC6GwgFItaxuD5bxLh7XF5tlfX22XQp7KTiGXG5ZLqFskaKUMuXbp90ImsNylMn3pwcapp4kqSlVgjn59piMytScQ6lbri3EW1AMP655xyjuTQeJSiyUtqNiddYifTPiPwnJ2R601OrrapcomZAEtnwki9j5IszCSJtFCY7NRkcUSpKDtSknQGKmpNZdLaEhPHFQASgG5B3CLZYrawy3xkv34SM1lb98UpoJPlte21GMIp3yuc5mxPMENPb3/ANA+d+kY7ff+h/VFfk0m5HORTdH0TvBDR2//APQ/qjVeIkNoUtbQShIuolWgELk0m5Lkc3R9FVPDLjVFSqTOHpJwql5R0KmiBot0bE84TrfnPNDvhiptdgMsuvArCACTvsNsVY7xc5XpucabmX5RUw64HEoKjlKiQTbpESySlKrOtIek6YoSxGhdXkWocoTY+kiDdZSxshbFe1tvWslPI58mkVZ5qAmMI1qVKgSxLO5TypKTb84pBHY9QrjUvOZhKMmy7Egknk/3uieU1ioyjFTU+lTTBkHkFK1glRKdLAEjS22IJR5RNTrr5ef7HDSrXsCLC+2/RHaBoihkN8t4UU4c98bnD+028bKw5KkYbblu8Qh0jVTjiyXFdJ/KGhqdlKW7OS4k2JyVfBQtK9uQgi3RY2galKXxmZ+sLUgAqShKEgnpVb0WERPFtRTJSjqZZ5fGTKgwyrYrvtp8gufJDcPj0pCCSQd91WqS8FpZkbqRTlZl5inS8jIyLErKsCzeQ5jbkvyQxcGzwPCjSEA/8w9f6pyEFKUaZIpZJzN5bo/lPJHTgqJVwoUgk6l96/1TkFZGtbBIG6rH0TaQSOqwZDfMZ969VyPtgdBhzhskfbA6DDnFvgz+k7ytbJrREaxV/Cat9Fd/AYksRrFX8Jq30V38BiLhP+TH/l7JM2ryJQ/3y/kfmIfmHlMOBafKOWGGhfvl/I/MQ9RJJ8yws4u5PYLcw1qAtCxYgi4I5DEOqmBnJd9U3RlJy21llm3kSfyPXEgkJniV5FHvFegw6Qxr3MOSgjmkgddhVZLdXLOcVMoclXT7h0ZSejljoElSArNe+wbbxZimGn2i262hxKvcrFweYxAZWRbNXcW02htDU0U5AkWHf7BzRYZIHAlaDD3Gs0sraIukrMk++2XENni07VnRI8sLmkBpASndEjxCgmSRl0SlYuPIbQzSDIfm227XJOg5TEfGXbpFQ00xlZpqcYXnEyjKXQm+fRwb+aJzIVVlxoAKzgcm0dIiByrKJKXstaRvUomwjZieln12YmGlqG5CwTGZqqZszi8J4cQVJ8Sy6Z6WccbBzN9+Ljby+iIdDk5PuS7S3HJhaG0i6iVG1obQoLAUAUg6gHaIuYax0bCwm4QrEWjSD96VU/E8xhouKYYad4+wOe+lr8nTCzuo1H4jK9avXDFNSvZISM+XLzXhP2qHwp82LxhjcbuGanpcaqqeIRRyWaNnmpL3Uah8RletXrjJ4Uqgf+QletXriM9qh8KfNjnMSKJZhby3jlSL6Jhcni3KyOENcTYSnwH2UimMTzuK3G5cyaElolRU3eyRbXMTs2Qjwq0upTUzOXZWWXMrSXNRYbwPKNYQ0dDBwtUFL4zj1hwpIOhOUCxhDh6rdhIcZ4sqJ74EG3MYgkYXMkZHlbL7qV4dJIZpTpPO1WOFtVaVdZS2UWG0jQHmiMzkm7JOht5ISSLjW+kdqTVniC4jvLK1RmuDHWfm+3s+2xKNArb0cUVWCd9unmijSh9PIWn5NvUqlZDxjbgfEmyMw5TdCflJbj1KQoDwgN2sIG0kk6XEFIpmSi7DdCZInRmzhZCWjcXHTzQOIy62y626Y3Wsjfs2Eb+mOJN4lKZku0vPTUorNLzDrR/lUfuh7ksazzJCZtDcy3v0yq6xp6Ij+Q+9V1Rgi0MLGk3279vjrT2TPYLA5btnhqVj02sSNWR/ZnMru9peihCwgjaLRVqFqbUFoUpKgbgpNiIeZTF9TlgEuLRMpG50a9Y1gtS4zUwDRk+MdZsfHb3+KpT4fTT5j4D1Zjw2d3gpxfng28piKpx48BrIM35ln1RxfxzUHAQyywxzgFRHXF53CLL4IjfrIHpdVm4Ky/xTC3UD72SzHmF11+lpdQ82y/KZlo4w2SsEapJvpew1isX5R56Xbb4tYdSNhG2JROVKcn1XmZhx3mJ0Hk2QmgHPVS1EhlksD1fzNHKaobSxiGEEgb0ySbhQUJdUvjBbM2rQ+uHh95+Yk0MNtBtAN8qlH0aQwPMtuYs4xSQVIQ1lPJ3xiRxDJE3SDj2ojWzPhZG5v97Qf2XNgPNoKVulQPudoEbxmMRwADUg8kjpDpOT/gL+91O+Wr8Cou+KQwF/e6nfLV+BUXfGexf84di13B79O7t9giC0EZgWAj6YMdgexKpXNv2Y/EIpFRBPeiwi7ce/3SqXzY/EIpCNFhP5R7fYLG8Iv1Df8fcrtK9jl5ImeM4o7S2RcdcONWoiJRtiYk3VPsPnKm+2/JDTD/QJtpyVRJvrykPXaUfcqI08l4sVT3x2lactoQymjbLeNwz2FN07SHZFAK3WVqHhoQq6kdMdW+Eiek20yyZKWUllIbBJVcgC3LzRxXLNS9lTMytb575xtO3Kf5tl99rQjqVBlGHnCidWorOdscWPBIvqb7deTdHWPa8BshuexXKapmo3ufTHR36k6d1GofEZXrV64O6jUPiMr1q9cRvtUn4Y+b+sbNUUvOpabdUpayAAEbT1xPyeLcrQ4RVxNhKfAfZSPuo1D4lK9avXB3Uah8SletXrhxpfA4/PN5n6wxLm3wZVr1wgxBwVVKhNKmBNszkujVSmEkqSOUjkid2G6I0ixXH4jizG6bnG3cte6jUPiUr1q9cHdRqHxKV61euI12qHw39P6wdqh8N/T+sV+TxblS/EVd9U+X2Ul7qNQ+JSvWr1wd1GofEpXrV64jXakfDf0/rB2pHw39P6wuTxbkvxHW/VPgPspL3Uah8SletXrg7qNQ+JSvWr1xGu1Q+G/p/WDtUPhj5v6wuTxbkvxHW/VPgPspJ3Uah8SletXripZmozU3iKfn5peefdfWu5NwRfQDoFgByCJ4ijBPfF7vhs73Zz7YrumBlxUw3NsoLzbxz5hrf8tbxcpYmMDnNCsQ4pUVTHCZ+kBsT+nFTiEWU0k2Fr8kSDBuP6hSmpptuXaeYcWFp4wnvVWsbW6BEVYXS5cl12WStWmUAflDnQUmpmYIbDLSVApIGhJvcfd1w18UZBGionVMlMONiNiNqvrgwxM/iVioLfYaaLK0AZCdbg8vRE3tFbcC8r2NLVUZs13G91tyosqMfiDQ2ocBq/ZaGhqH1EDZZDcm+feQiMWjMEU1bUB4TsVTOGnJAMMMuh5LhPGX0sU8nTEG7qNQ+IynWr1xJuGeV7Kdpd1ZcqXRsvfVMVp2qHwp6o0+HwxugaXBZyvxqqp5zFHIQAkNannJysqqjbSJVTqgVBrQBWwnyxwqZeU6iZupdh4R1h17Vj4X+mNe06Nf2m3b3sEhYWtsQrnIuOlJmVxYN1JL2g3lG30w5VKstuSkvKNuKKWzmHe7Ok8sRqQl311l9kzSwyh1SAi2lst4e+1YP/ABj5v6wx9O3SBdsVislMDmg7QD3Fc5qpvvyrjGYXWLZxoRDe8kTDSW1JUlSRooaiHTtWn4Y+b+sHapPwx839Y61rW6lRFc4JqlpyXlXGmVrSh8Wsk77mw6YcZmqTDzIZCkBO85dvNDXMSSEYhbbJzEttWNtl3DD03Rws6uqsBfRMPfE24cVdrJDFHE8H5xddcP1hVImRNJlGph5PgqWogJ6AN8SJfCjUEaGSlr7tVajriOrpYDYPGEcgy+D6Y4mlAn98fN/WI3RRk3IUcWNVMDdGN9h2D7KSd1Ko/EZXrV64x3Uah8RletXriN9qR8MfN/WDtSPhj5v6w3k8O5TfiKt+qfAfZSTuo1D4jK9avXDHWuFKdrknN0xthllKiG1utkkke6SNfIfLDTW0IpFMfm1OlSkpshNvCUdANvKYbaLSmzT7FR4zS55SdST5Yc2nhYNOytQYxWSsOnISDl91NMCTTNJCw8hK1LNyNuUc0WLLVSUeRdDieiKow7JVB1YUmSdeSm6UuJKQm+yyiTpD5xNSL5l00uYU9uKbcX059n580BK+mZJKXaWfaEwE7FLa5U2RKPMhYBcbUjZqbi0V2qVAeU80Qh1QsTa4V0iH6cplRkpUPTDTSLjUIWVFOvOBCGntyr02hE68plk+EtIuRFnDmNZE6xuEOrZX8Y0NNj5ZprkZ1c2p8KaCOKcKAc181iRfm2RBq9XhVMQNpYWFS0roggeEq/fK/Lyc8WRVKNQ6LRK5MPV8OB0OuMBpsgoBBsk66m526RTVPbUhfGLZdsRZJCCQTyQaohG7SeweSJNiaZXP0rgAWz3jNWBLTbMxIZeMAUlOl+XdCvgpSRwnUa+950//APJyIi1JT984lnEBWoIOvliWcEqXU8JdEDwIVxjm03/4K4jqIw2GSx2H0ShYBMwg7R6r1bI+2B0GHOGyR9sDoMOcTcGf0feVoZNaIjWKv4TVvorv4DEliNYq/hNW+iu/gMRcJ/yY/wDL2SZtXkShfvl/I/MQ9Qy0L98v5H5iHtKcxAG06RJJ8yw03zLEOEhVGuy2pJ0EuFBVe40G6/Tr1QiUlLCFuO+CgXPJblhBQFsTrr8ysELdJUk+6QNLDyC0MIGiXFdip+MBJ2KXrcsMuhPLEJkFDs6ZF/8AnD/qQ6TtWm+OUhKkt2O4Xv1xG0S08zOreS6kIW5nVrqdb8m2HxAZ5ovggFPxnGEC4sFI8QTgccEsg6IOZZ5+T74W0XCL1TCHWZviVoAXmKLgHcNv+7RH20LmXbaqUs3UfvMWbhSebpku22bZV6lZ5eQxQxCV8MX9LWo4WCJgYEmpOAZyce42tzJmEJPeNJUQk859Q64ksxgukzLaULlJcBHglDeQp6CCDDu1OsugG9ieqO4UDsIjLy1kz3XJt2ZKYAKNu4Nk0JzBCnlJByZ1qVlPKATa8Q9xpTLim1iykHKRzxZszNJZT3pBWdnNEHxGwhE4HkkXcF1i+wwRwqqcZCx5vdDsRiu0PGxNEEEEH0FRCF1uYq5nJOVQpXEt5lZU3KlcnoMLVGySb2sIbMLVoU5cw647kW4Asm3hWvcemGSaYYXM1hX6CIOcXnYklJm5mXD0tmKUjagjYdhhVRqOqfqBTLLQhrwVqUdEnkHLDixxExKTVfm5NxxS0KypTokm9rqP5x2wa9Lt0xzjmg4ta1KKrag7oglnIY9zBnkD27fBGbrtUsMPU2RVNIfLi2xdSUpsT0QmwW7LGTfL6VOPLcK7gm4O7rN4lFNnEOpLEw4VKXoAoaW6Y6NybFFzrYQhDKiMyAO+ud94FGqeWOhkzcdR1LmtZpz5eCpeccOdXehC020tyw11mnpk30NsNryuAZU7SVXtp6IeZyWVOtNPI7xwJHenS/liXYKw2pppFVqSQ5NrH7EK14tPL0mI4KkQEyDvHWkaI1X9MZdajuHuDCZnkpmaw6qWbOvEJ/eEc59z9/RE5p+EaHTAOx6cwVj/AIjic6usw8QRVnrZpj8Ry3BG6XDaenHwtud51rQNNpFghIHIBCacpFOn0FE1ISzwPv2wfTCyCKocRmCrrmNcLEKDVvgtp80guUtxUm77xZKm1fmPT0RW9VpE7RJsys8wppzaL6hQ5Qd4j0DDdXaFJ4hkFSk2jnQ4PCbVyiCdLib2HRkzHmgldgkUrS6EaLvIqgoIXVqjzNCqTsjNDv2zoobFp3EQhjRNcHAEaljnscxxa4WIRC+iS8lNT6W594ss2Jve1zuF90IIIT26QsDZJjg1wcRdP01wcSj+KGK1LVRhunpQhLstYqK8pJ0Xm0vcbt0cMRydNlJlApz3GAg50hWYJPTDRYcggiFkUgcC55Nslfq8Q5RGGFgFsh1diIIIIsIan/AX97qd8tX4FRd8UlgEXxbTzfYtX4FRdsZ7FheUdi2XB79O7t9ggQGCCBROxHkwY8/ulUvmx+IRSEXfjz+6VS+bH4hFIRoMI/Kd2+wWO4Q/qG/4+5TqiYeXTmyuVU8pm5aWpF0hG++4gW38sbt1KnTYSJuSSy8hASiYbUqySnVJKBpthrD7oaLQdWGztQFGx8kc4u8mbndC21bm2LO++1OE7TnOMZcYKppLwvnA0UobQBe4sLbbQnnH0PLATLJYKScwBJJ5teS0dWlkU9xvsttKValsg5r8g0tr07oRR2Fp1O2ZBKd+0f3Zn+a0E2BNrxZOFqRIMS8tMsMy7z+QKK3CCSSNRfdyRW0dWZp+WVmYfcaVyoVaCFNM2J2kRdPoKtlNIXvbpeyvZgoI/aUVC/5myIUpU0htQ7WmXSrRSnCm1uuKMRiKsNiyalNAfLjk/WKlNCz8/MujkU4SIv8AOTOiUaPCCLYw+SUYnl5SVr861IqSZYOd4E7BygdBhrgggS92k4lZqR4e8uAtdEEEEcTFlCStQSN8dUt5RdSSTe1hA2U5QQk5k7Y1W6TcJOnLCCcuinQhZ1ud5G+GWpYekKm7xziFtP2txrRsojn3HyiHKOU08thlS22i6oe5EdBIzCcxzg67DYqLUnDrb8/NNzS1LaZWUoy96VWO/wDSJWyy3LNJaZQlCE6BKREep03OsTswsy+dLrhUEpCri/kiSXuL2tD5XElX8TdeQaJysPGwv53VlcEH7iqfON/cYsSK74IP3FU+cb+4xYkZDEf1Du70C1eD/o4+/wBSiCCCKSJqtuF795TPku/emK6ixeF795TPkufemK5UpKRdRAGzUxq8N/Tt7/VYPGf1j+70CzDlRqFM1pawyUIQjwlq2CEBZcSjOW1hN7ZiNI7SU/NU9wuSrymlHbbYekRZeXFp4s5ofHoteONBskNMwXWE4zm5Rco+iV4xaxOKb/ZkZdNec22aw5VakzFHmAzMZTmGZKknRQhccY1kpy9kNjnDYvDVNTb866Xph1Trh90owyMzl15LWtsRHEKuGoDS0G4AHcFxhxoTdPdn0pqSilmxtrYFXIbQ3RkEg3G0RK9ukCL2QyN2i4OtdSafwNQ6jiGTrTVSal2pdKErlk5Sh0JUVC5PLfXbsjnidNHl1I7WrSXCTnQg3QB6+iGFbuZOwXO0H8o5k3iFkLmkEvJsiNViRmjEeiMtXV2LKllQsY1ggiwhiIIIRVt56Xo847LnK6hlSkq5NNsdAubLrW6RDd6huNq2mcqTNOZXdmXXdy2wucnkHpJ5IdqDNBTQSoi6kgf5hEAlUl6ZFySfCuTe5h+beUx4K8pA1i7LANAMC05p2xsbG3YrJoNaVR35hgNhfZAC0XOgUND6LdUPvstmkBJYabbPur65v0iqEVSYYcbcKkqWjvra6CJNSK6mquONpl3Wy2DdRtlNja3pgJU4aC7T0b70gC1pcdQUpqmIZqp96bNNkWKU7/0hrgAgiWnpxE2zUBrKkTOGiMgoRwiz7xclaa2craxxq/5jeyR5LE+UQnoM+zJNIaeQFhIHfEbI547nUz9UlZRlIztp0VvOY7PReEspITpTZTbQPvivQwW0RxQDkZp2AUzActqmKatKKRm4zdshw4OJpqa4T6GtFr8Y4NOTiVxCZak1CaULMBtF7FSlA9Vol3BNJLY4VMPsOEEF13UczLmkU30zXNcyM3cQR4qaEAStz2hesaezkRxhGqtnRCuMJACQBujMHaOmbTQthbsR4m5REaxV/Cat9Fd/AYksRrFX8Jq30V38BgHwn/Jj/wAvZOZtXkShfvl/I/MQ/tBBSQQSq+ljDBQv3y/kfmIer21iST5lhpvnTBjGuFodr2CQpwBbithSm+zy2hNQZ9UghBUCb7YR1S1era25dSUhCeLCynwiD6zDxKYYm3U/2l0NAbA3pfnN7xM4sbGGvRZjGsiDTkdadJadkahPJS5oHBYakG8OE5Q2ux1ljPnAuATe/NDO1h8yjzby3S4lBvttrzw7u1VbEmobXNEoMVcrjQKHz6YlbxZTZTXQ28Uq0zCwiRUx9xMwloaoVtHJzxGZWUenFKDQBKRckm0SSjydeacU0KStxXwjneAD5R0PkiCr0bG5HeURcFImJyYlj+ycIHvTqOqFjdcfAsppCjzXENU1IVuQbQ+uXYmkHw0S+bOjov4UaSjNYqij2JIGVRsU7Mgi3QnaYD8TFI3TNrb7poBTs9WZhwZUhDfONsNE4q6dTck31h69jMylkKVOgnYVFiwJ6M1/TDBNoW1MLacN1IOXkiWhbEXnizqVOueWssdq4w212qKpsu0GQlT7zgQgK2W2qPUOsiHKIVNVRFRxUsjVqVTxLZvtNwVHrFvJBqNtyTuQ+kh4x+eoZlTGXfTMsJdTsUNRyHeIj1TpqpFWdu5ZUbD+U8kO8u6GXwgkBLuzkzfr+UKJyVTOS6mVEpvqCNxhrH7VKx5pZbbD6LSXqiHcLuSImAgcXlKSNhGsN8nITkjLIfWVBh8aW2ZuQ+SOErKKYmW5J8ZA66My/clG8iLZqFBlKjQVyrTSWzbMgp0sobDA6pqG0jg22Tjcoy2xFxqUAkKkiWTkWlR1vmBvD7VJpTFLamw4h11xQulZJOUiIvLKVJPKQEBS0kgpXqQR90K51ybm2kBDSAm91JUqx+6Hvh0ngt1KJ8jI/mNk/wBNqy2kpVm4xsjwc2zoi5MP9kdpZMzacrxbBUm1rcg6rRXHBjgVicS1XZx5SuLdIRLgd6VJ3k7xfdbdFsQCrtAPLW6xrRrDYjo8bfI6kQQQRRRNEEEEJJEEZjEOsupnruFaZiJTS55pZW0CEqQrKbHdDX3McPfBzP1piWQRKyqlYNFriAqslFBI7TewE9iifcxw98HM/WwdzHDvwcz9d+kSyCHcsn6ZTeb6b6Y8FE+5jh34OZ+u/SDuY4d+Dmfrv0iWQy4jxbS8Myrz04+kuttlxLCTda9gAtuuSALw5lVUOOi1xJXHUNK0XLB4Jt7mOHfg5n639IO5jh34OZ+t/SEdPx7NurR2ZLso1zLaQklSUk7jfW3p5omrLqH2kOtqzIWApJ5QYTqqobkXlRRU9HLfQYMupR+mYCotJnmp2VQ+HmiSkqcuNltnliRwQRBJK+Q3ebq7FCyIaMYsOpEEEERqRJanTmKtIvSUyFFl4WVlNjtvtiOdzHD3wcz9bEtgiWOeSMWY6yglpYZTpSNBPWol3McPfBzP1sZ7mGHvg5n62JZAIk5VN0yo+b6b6Y8FE+5hh74OZ+tg7mOHvg5n62JbGI6aubpFLm+m+mPBRPuY4e+DmfrYO5jh74OZ+tiWQRzlk3SKXIKb6Y8FE+5jh74OZ+tg7mOHvg5n62JZBC5ZN0ilyCm+mPBRPuY4e+DmfrYO5jh74OZ+tiWQQuWTdIpcgpvpjwUT7mOHvg5n62DuY4e+DmfrYlkELlk3SKXIKb6Y8FE+5jh74OZ+tg7mOHvg5n62JZBC5ZN0ilyCm+mPBRPuY4e+DmfrYx3McPfBzP1sS2CFyybpFLkFN9MeCifcxw98HM/WxjuY4e+DmfrYlsELlk/TKXN9N9MeCaqFhqn4cQ8iQS4kPEFWdebZ/wB4dYIzEJcXnScblWWRtjaGsFgERgwRwnptuQkn5t0KLbDanFBIubAXNh5I5ryCddQ/Hs3h96Yl5SeQ9O1BvwZZhzKUJV7pZ2AadJ3CKxkUylVxNPuSFmpOXUESyHzn1G08huQfIRHGnVRqvVOt1SZZUTOuqUlObwBY5R1WHkiOUCorkHXGg2FZ9TrsIjRwUr2RvjBzAHnmVnKhzZZC8NHurPZeTUG3pZaLWBSpSfBJ5ofsPYIoNXkeMfl30PtnIvK8bKPKNNL8kVzTao4twqCktKFrWO2JRQ8fTEjPuS0pLsvLISl3jHMqEHlvvNr6c+3lHvhnhJERsE2ARF/9ZoI7FMu5jh74KZ+tjPcxw98HM/WxhjG7nZCDNy7TUsTZRQoqKORV+Tl0iWAhQBBBB1BEVDVzj+8orFS0couxg8FFO5jh74OZ+tg7mOHvg5n62JZBHOWT9MqTm+m+mPBRPuY4e+DmfrYO5jh74OZ+tiWQQuWT9Mpc3030x4KJdzHD3wUx9bEXx9hGl4dp8s/IodStx3IrOvNpYmLViCcLf8IkvpB/CYtUVVK6drXOJCo4nRU7KV7msAI+4VWRFsd1wSMh2vaUOPmk99ypb3ny6jriUxVuLuNdxTMomDZOZKU/Jyi3++mNZTsDn57FmcNhEk13bM11ouHk1CXQ604427tKgR93JEqkMLykqxZ0JedI1UoXzDyxHqY65JquhVlAbB7nph5bxOooyupBUNunpuIfPxp1HJGpC8nNLFUaUZUh1hKUlshQCxcaG9o0wqO+f0Nwpwkcl1gwhmq8l5spGg5Eg6xNOCyo0aQlZ2oTTKkz63OJKk5lBTVkkC2y9/yitI98cZc4XK4x7RHIx5sHC1z2pFUag1TZJyacBUEAWSnaok2AHSYTP1FMxLo4k6LSCrm5oSY9rcrVsTMysoylmXb/AGziBvVYhN+TQk26Iy82lrKpAASrSw2XhDJrS4WJQfkgDNLb7fzNRHEsq5LVZmoZSWTkClbkkH1WhYicQEgAgQ/LQlxJStIUkixBFwYZalSpeWbW7LFbRSCeLTYo6js8kWQ8OAa5W4KgP0YnDPUFsa28htLTarAC14fuCWYWrhPoKys5w67r/wDpciOSMhZAXMAFe2w2Wh94Iv8AFCjfPvf6TkQ1FmRSFmRAOfciEdmVAiIzBF/FeuJOYdceCVLJFtkOENch7YHQYdIm4OSPkpNJ5JNzrN0ek1oiNYq/hNW+iu/gMSWI1ir+E1b6K7+AxBwn/Jj/AMvZJm1eRKF++X8j8xDlPh1UjMBj96W1ZOm0NtC/fL+R+YhVXppyUpMw60bLsEg8lyBf0xK/N9liXAmUAdSh1KUlvvwTxgPlHJEplcQTDKAlYCwIYKPS2pplDpccQu58E7hD03RGphxKUzDjQt3xve/X+UTTlhPxIvMWl1l1m66uYTlCLegQofUtbDCl3Cim5B5bCNH5KnUxLZCi4oEHVV7wreSJlgKRreyhzxXBblojJUpHhsjTbLelWHAM0x0J/OLNpAW3TGS8vXLe5OwbvRFW0BwNzqm1GxcTYdIiV9kTHY4aL6y2NgBuBzQHxKnMr7XVwqZNTMu42VtvIUkeEoK0jZvElMQ8GM5AGnGlPek9O2IM8rYBcA7RHIkk3JvA/m9t8yu6lPKzXJaVbAJzX1SkbVeoRC56dVPzJeUhKCdLJ5OeE5JVqSTbTWMRboqQROuMyqdc5oiIcmXGNSfplDddlwoOLUG84/4YO/8ALpIiAUUONgug7Tp5If8AHta7JmW6O0VZEKSt4g+EdyfJt6o2pWGJR0JcD6y3tLWbfGjaRHFd21doWiKD4hm7NbN153ikIUASkgpI5YmLM0h6URNbEKbDnQLXhiXh6n5T+yCNNo0EOjk8y3TONFiMuRKQNCdmzkirpMdkwKrWsDy3RGd01S0w5P1ZLykZk3tlB2J5PTFqU3EKGGg1MJI0tcbIgOF8OVWbaM7T0yzlxlyu5hbXlA/3eJvL4JmQ2lb9UdL+1QCU5OgC1/TAbFJYHuDXHUiQZo5N1KNVany7Nffn5VV0TiMyhyKFr9eh645xIJzBtQVOJLDqXU8Wb5iEgG40AhmnJKYkHyzMtKbWNx3845YuUkzHxtAdewQnEWvMmm4ZZZ9ytrgwVmwo2BuecHpiWRCuCuZCqEqXvqh1Z/36Im0Z2uFp39q2WHNtSxf4j0RBBBFRXEQQQQ4DaUkQQQQ0m6SIIIwTYXhJLMEQbE3CTLSimJGirampuYdUyHSf2bYCSSoHYqxsOS55rR0oOMZmYmkpnF8Y0o8WbIAKFcum0csSuhc1oc4a1WdVxh4ZdS6cnJenyy5mbeQyygXUtZsBHmqtVk15FSmlWM2/PF+1zfINAOgADqi0eGyqOyMjR2f+Vdm+Md72+YosUj0k25oq2fbl3ZByrNtcQiamUtJCCAkAE5lEbQSAeuC+GQhrRI4azl3HUqOIS3eGbkuplcmmkJnHM/F5RdaUnKOnmif4bxzVnKdL8ZxCUrAUykt3JTtsTf8AIRHZaekJ1hynqUFSq0ZAm4OXyjdHeTlZSXa7AYUkKQn9m7mJPNt/KIqksffSZY+381qhHK5huw2Vw0yfbqck3NNhSQsapVtSd4hVEfwVKTUtRwuadStTyytITsSNnpteJBAl2RIWjhc50Yc7WiCNHnQw0t1QUUoFyEi56oTSVVlZ82YcubXAO+OLpe0GxOaWQRpxrfGcXxic+3LfXqje0IC6cgRmDZGIfkF1EEEEMSRBBBCSRBBBCSRBBBCSRBBBCSRBBBCSRBBBCSRBBBeHBu1JEEF4IROxcRFZ8I2LKi5WThOl/sguVLky8mxUQoEBA5BbUnnGyLLjzI9WHGcZ1WYnHnluGaeb4xeqgEuEJHkAAtF/DqfjHOdtaMu1Uq6Usjs3am2UanaXPOyrocl3AO/Re0K6dTk1Gp2bdSzlP7Vatlj+e2HenLcqyZquzMmJkMZw2lRCRYC+vLHDBs+20JxxbTKlOuZlJO4c3ILwclneWuIHxAAHtQS6d5vCLbMip1h9brqRmtYWWOQckNWCVoT2WHZVTzqlkqGUkpt6Nt4klLqLTalJcWpSVWAIVcJhVMpbp54+WWhBNiWhay+eBZqZA10MmZOorhXORfVLKLE2XEhQARn2W6YsbBk2lyQVKcYpSmDoFKuQg7PJoYgDst20lG13ShzaLG4ETjAlAcpUiubmVFUxNBOhN8qBfKPTeB8uiQTex2hXcPDuNy1KUQQQRWRxIKxUV0qTVOcTxrTZBdAVYpTexUOjaeaFqVBSQoEEEXBEcp5hqak35d5KVNOtqQsKFwUkWN4rzAWMVS9qVPuvPoRxbEqtDRUQkAJAVbo22367InjhMkZc3WFKyJzwXN2KyogfC3/CZL6QfwmJ2IgvC1/CZL6QfwmJKD9Qz+bEKxb9HJ2e4VXIQVqAFgeeKzxI/wBuMQrDbd8iux0nZbKTcnyk+QCLSl0KecDbLSlrQguKy7QB/s9UVA4XJLEDjDt0lt5abnaQb2+8Rt6W2k4jWAsxhUdnF512yTjJy84hxWdpv53Nor0xqZOeDoaRLh0nYpKrD06w4IfShsBIuYUS1STLFSiLG2kddK7WAr3GOJ1JEKFOIaLjy0JtuCf1iSTM5K4doSnZdIWEozJF/CUbC58sMM7W3JhGRACYbKnVFsUcypOdyYVYXNyECxJ67jrhrWveRpqCaB0xaDqvqTfITT8xPuzjqszjisy1cqolLVdQqV4l1JBGxW20NNLw1MOtJWzMJDbmqjbUdEPXsWaSnvJl0G2t9b9cdnkiJsSrMpYTklKZhC2EupNwoac8I5sJclZgrcykNqI0JzG2gjcMmXSGALhoW0N4d8OUiTqxc7OdfZbBsFNgfnFd8gjbpnUEPp47SaQ1ApilZhEw2HEXtssRvtDpwRf4o0b597/ScjviKiy9GnUIlJgzDC05krIAN94McOCL/FGjfPvf6TkMlkbJTyPbqLT6K+yTjKzT3keq9aSHtgdBhzhskPbHkMOcWODH6PvK0cmtERrFX8Jq30V38BiSxGsVfwmrfRXfwGI+E/5Mf+XsuM2ryJQv3y/kfmIc52UbnpVyXcvlcFjbdzw2UL98v5H5iHqJZMnXWHlJD7hRNqUnKGFNPJzMglSXkjvbc/J5Y6CdJTmQoC42g7YlENBkWFVsu5EgoQggJFrkk6mHh4dcnWiVHKahzgRmAT4JLKU56cWFLulvaVHf0RIWGE962myQBYXjEZ2RE5xKGTTulOepdXGUqQgkgKSdFp2gx1aqz7KMjrYdSD4SNFHpBhMpWY3O3fzxrEb2hwsU6OpezIak4Jrkjmyrd4lW3K4LGO3bCVLYcbdS4k7Cg3vEJqkqmbriW1GyeKBNvlKh6kWksSbbaRYJzD+owx9GwAG5zRmpYY6RlSDm63onB+fcd0R3iebbGG599GhUFD+YQngEPawNFgs/ITIbuUIrpS1iOZcUQQ4rNtvkJA0hVKTjjISUOgE6gX2whp6eyKpNdkpC1kquFi+uaJGiQlUo4niW0tkjMkJ0tF6QgANKOuIa1rTnkEmVW5pYLSnEk2uRrf74VSzUxxLK5nOG3lFSCTtBtcj0QtdVTKZLrSywhCrWAG/njixNO1RMqws5UhWRO/S9r9UV75XAsFHY6QsMlOsLVldORxDIslI1G4j1xLWcVMqH7VJSej1RFKBhdzsfjO2SuKV7lLICwR/Mb6eSHSVwjPTDig9U0JYB73im8riukm4HkEZaqFM+QknPv+yfnsSx/FJafD7TRWE7Qo2uOSI/VqvMViZDz4SnKMqUpGiRC2v0tmnJSlmZUs3AKFruTptEMkXsOii0OMYEJr5n34u+SlnBtVzKVaZlCr3KXkJ5dyvvHVFvsupebS4g3SoXEebjOPUqoStRl/3jSth2KHJ5dYubDeJGpuTbmpdXGS7upTvQd46Yr4nSlx4xq13B+dtVSiAfOzV1j9lLoI5svtvoC21BQPojpAMZFESCDYogggjhN1xEYgJA27BDVUaslKS1LquTope4dEPZG55sFLFC6V2i1a1Kqraf4qXVbL4R23MRTG+Mn6RQZpKZpKZt5lSWUZQSdxV0AHbEJxljOYfqPY1LmnGmZe6VONqtxit/kERUYknGqkZqddcmlJYU22HTmtfW2u4kRoYMOsAbX6t6pVGN07dOmgbdwy0tnWtHJovJpbsojKthsMkBGp3eXfD6ip1OjIQVsOodeVkbKxYEk22c22EiW5alVamJW0jLkU8SlZIK1XsnmtrEnZm6fV5RTc5daQvMgkeCRsA3n84dO8AN+C7f3Kzydp2pPYhprlMqjgnE5e+zJTt3KSQBY8kVnPUer0+UVTJqWculd2ilslK+dJ33vE8S41NtqMuUNPMXKMgtmAH5xD3MUVkuKKahMtgnRAWbJ5oiw7jLuaLWFj39SkfVMAtNfqISWmKfaWhCkvNrFkqQhJzX5LGJBVJarSbzlRmJFUvKtoQCtZABGgFgDe5JAttiJStSnxiKbn+yX+zMiU8bc5suVPohwnalW6pIvLXMTM1Lyy0LcSpRI3kXHNaCUsF3Bxtb7p55O06LtIkgEagM9+vyUwGLpx+aapCJh2VlpJoOLRc3cdJzd8RYkei53xK8OYgmh3jb/wCzc1KCcxQrpPLFRNS0xWa1xrSkhx1AKwpdgNLA337IeFMTlPqklT5pRDLl1FbKSc1gbDrtAuelZcAHO17eqfFVvZMJTnbZ7K5TV5wf8X+kQwmeNLq5KFJQXf2qL2AzHQgdY64jjjj82wptE4/IvIOa7dwpSeWxhplJqVq3FJGInkzRKkZZxBJ1Iy5babuWKwibIw2GY6kSq8XhmYGNj0XawbjYpvKJnJidVUpyadZcU4SyyFABNjtPKTyckPnsheCErVMJSFHKLpAueTZFRYmqNYS7LTK+OlW9Q3m71WbS5sdRu1hNNV1/sNhTNYeXMNkmwQoKuq5USdmh0Fr35osR0Rc1pFs1XixuGC7RHq131nr19v8AArrNWm/hR5ojHbab+FHmiKK9lFb3VSa+sMHsorfjSa+sMT829itjhRR/RPkr17bTfwo80Qdtpv4UeaIor2UVvxpNfWGD2UVvxpNfWGFzb2Lv4oo/pHyV69tpv4UeaIO2038KPNEUV7KK340mvrDB7KK340mvPMLm3sS/FFH9I+SvXttN/CjzRB22m/hf6RFIJxLWco/8Tmid13DrGrmKq0AAKnNWO/jDHebexd/E1JbS4k27lePbab+FHmiDttN/CjzRFE+yeteNJr6wweyeteNJr6wxzm3sTfxRR/SPkr27bTfwo80Qdtpv4UeaIon2T1rxpNfWGD2T1rxpNfWGO829iX4oo/pHyV7dtpv4UeaIO2038KPNEUT7J6140mvrDB7J6140mvrDC5t7EvxRR/SPkr27bTfwo80Qdtpv4UeaIon2T1rxpNfWGD2T1rxpNfWGOc29iX4oo/pHyV7dtpv4UeaIO2038KPNEUT7J6140mvrDB7J6140mvrDHebexd/FFH9I+SvbttN/CjzRB22m/hR5oiifZPWvGk19YYPZPWvGk19YYXNvYl+KKP6R8le3bab+FHmiKs4TcHIImcRyasjhVnmm9yiSBmHPc69cRz2T1rxnNfWGOcxX6rNMrYfqEw404kpUlSyQQd0TU9I6F+k2yrVXCGinjLDEerVkVrQ6s2ilvSSi53yVIUE70qhnp5S3NKSVbikc+sdpVHYq196VIIFiNsAlUqfDyElSCrvkkWPk5YutjAc621BmyMIuCnyQmFSqrFvMlRsdxBh5qDiWaQJhK8kwpQugi+UbLemIxL1NhC88s+jjAPcEG45xG85U35tKUZkJSk3Pe7YqSUxc8ELkjhHk5SOlVVTeQtupU4oWUjlPRFm0SeqMpTGGXnbLCbkEDvb628kUQ3MutLQ4hWVaCFBQ2gjeIX+yeteM5r6wxE/Dw43Flcw7Faelc50jS7YNVvNXt23m/hf6REUqPCo7KOLbZYccKTa67J/IxWnsmrZ0FTmbnZ+0MYnJ9aFpC1FTh1WL7b/nDW4e0H4gCtNR4zS1LXv0NFrBck2UvqPCjXKkw5LNBqWbcSUqUkXUAduu6JLgZRp9HS60Ahx4krVlFzyRVTM8l48UlkJNtt/0jDWIquyjI1UJhtO5KV2Ah5owWljQAuzY3RxU4mYNJpNshb1V89t5r4U+aIiHCTUHHqXLl9zvEOlVyALd6Yrf2T1vxpNeeYS1Gvz81KrZm5p6ZzjKhK1XAJ0J6o5DQaDw7JA6/Haarp3U8cZBd2b1JeD6sNdkzrj5yIdISkncANnp++GLG+DZCpT7jjCw094TT6Be45FDeNsSnDOEJZci2pVScKSm/FN2SUqPKdp/3thFi+niiFlcu6p5Ll0qKzqk+T/ekRQVDOWkxu1+yBVLXMjDo8tFVdN0mqU1RS/LLWjc8x3yT0jaD5IStL7JXxbd1r1722sTB11bputRUeeGOjyzYddmLftC64L81zB9r7tJKsUTnTxSvdrYL9utEpRVqKVzPep25AdfLDHiNkM1tIcFm1ISUW2ADS3XfribRCZ4CoYkebfuUJJSBfcBs/OHQOJcSdyr0cr5JS5xyAS6QqMxKC7a9OQ7IeGK486CjL31rg8sIJejyyEZP2hJG1SzdPRDpLUelyTSlTDy3VgX/aEEjoiN/F3uQrJLCk8s+XkubcqlAAAa35Is7C+H6M7KNqcmHlKULqY4zKkK5dNT1xWMo63NzCGGjkTnAuB6RFjydGTLSjaVVeXbXYLWVtbAeYK2wKxV3whodo3XG2F8kh4QqPKyfY0xJrJA7xaSsqPKDrEY4Iv8UaN8+9/pORIMaMNyzTDcrPCZRe7psNu7UeXSI/wRf4o0b597/SchUxPIX3N8j7rlOP8AkjtC9aSHtjyGHOGyQ9seQw5wT4Mfo+8rTSa0Qw4uYAodSdBGsq7cf5DD9EaxSSaTVbkn+zO/gMScIZWMpwHtvci3Ud6a3avIlC/fL+R+Yh6hloX75fyPzEPURyfMsPN8y0dc4tOa14a1KmRUOPSG+LUlIVyixPrh3jXIn3qeqGtdZS01UYCS0ZkEdxWrLpcTcptb0x0jGyMxxVXEE3CIIInmHeDyXm5JmcqLziuNSFpaaNgEnZc+qIZ52Qt0nqWCB8ztFiqqYP8A4+B/6KfxKh1l/wBynpV+Iw9474M6z2/bnMNyAckzLobyh4ZkrClXJzkbQU9US2g8HUsvD0o1V2VM1IJUXVMu3sSokco2ERyWvh4pr7921aerhL8PjgaRcW9FXcEPeKsMrw3NoRx3HMPAltZFjptBHlhmaRnWAdnLEjHtkaHN1FZR8bmO0Xa0zzmHeyZwzsopLbx8NKjZK/UYSTbk1JpHZLbjJScqVWuDzEiJQpKQ0e9IA3cnPDZUwl5EuHLKBmE3B396qLDHkkAolh73SzMgccjkmyVpj82Q6v8AZtqsoHeoHkEOYlhJuMuNAlDZBI2nQwpa/dN294n7o3hrnkqCSpe2U7gpIxV31yjbbD5DI1Tk0jK6jNuOpdVMOcYnYoG1oizy1S7DrrKlIUlClApJGoHJGlNqVQmJUKmXwoqsU5UgWEDuQayLWV2OTThdMBk21+9SV6d418l54KcO3MYIYY6NzDrXgLI5t0WI4QwWCDVD3TO0ind5oPNKRy7DyGNcPYjnMMzisl1sKV+1ZJ0VzjkMI0VRY8NAPRGJl2XmgCCULHKNsOLARYhcpppaaQSRmxG1XJQMSSlWaExTpnvwLrbvZSOYiJAxXHUizraV840MecWnnJZ4OMuqbcSdFIVYjyiJLT+EOtSaQh1bU0gb3U991iB02HB2YzW4puE9PK0CsZnvH8v6q8O3ze9pfXGi68bfs2deVRipE8Ks0BY0pknlDxH5QnmeE6qOpIYlZZg8pusj7oqjCjfV5q4cawpouCT1WPvZWjP1ZfErdmn0tMoF1EnKkdMVrizHvZiFyFJUpLXguPjQrHInkHPEUqNZn6uvNOzTj+twlR70dA2CCTkSSFuCydoHLBCCjbHmUCxPhM6Rhipm6DfM/ZZlJJLjed0HXYL7ozOUhEwwpLIs4NUkmHAJJIAEdkgITcKI18ID0RcBOtZJsjg7SCYphiaWhgupcW6ynXMm9xzGFtIqHFzHHNkurbNroIsD/MOWHBSFvOJbZbUtZ9wgXN4Y8NMKVLzam2lEIeIcISbJVc6HkPTDXMa9hB2e6LxVD5IZJbfLbzNk5MOzSVuKVlQlalKI0J16I2kG2ZCdZmgyh0tKzBLmqTG1oxfnENDGgEW1oVJUve4OJ1KQpxDS0VJyrIobQqLjXFKfz6lOmmzmHUIhBnJlirPMKAl2JyZzqyad4VageTSHa45R1wkqMkieaAzpStBuk39ENjp423AGv+BXI8RkLhxpuF0FW7Ars8htJW2ttLaLAJsgDZp0mJHIVdE1KFHFhamkFYKTYoAF9d8QaclFS4VOuKSEsoKnAlV7gAnSF9KneNkszKkNtupIzKFl2vY/dFeeia8CwzyRDjWhnGXy1KWOzzE3IceogvoSCkqBsseSIz2vl73yHrjZgoYRlMwCLWtm06o2MyyNrqOuJaaDiQQEIqp+Md8OpOVPSl2Sck3ZZc02FJLKSCSF38EHbYi+kNj8qw84VllDZO1LYyp8g3R0bqqZcKDU0pAULKCCdem0cDPy490T5DEjItFxdvUb5XOaGhHa+X96euDtfL+8PXGiqmyNiVnyRzNVPuWusxLmowHrv2vl/eemNmqWy8sIQi6jzwiVUnleCEp8kLsOzSnKu1x6yU666ACOOuBdXsPp+PqWRSGwJAK7VPD3ahlh+YRdp42zJPgnnjVmlSh14xq9thUbjn2RJsXuMoos6px5LgfUkIbSTfaPyvEHTMSiVBSQpShyb+aGwlz26RW+k4N0L/laR2E+90smGGG0qCkpVbUkLFoTNyqHUhWRu9tAVnQbtgMbNzupKZMn/KI69spkeBKBPylWh9nBcZwZpGtLLuz6/wBlx7FZSbOqZaHKpSoSv8ShdmVtup98AofeY6vzEwtRcc4hBtt2mMylOmalKzU8zdxmUSC64s5RqdAOUx0/CLuKp4ngNJBSvfGDpDaSf55JLm/lT6fXBm/lT6fXGIIcsPZZzD3iPT642Did7SD5T64yxKzE0rLLy7zx5G0FX3RJqdhmRakeNrDc0iYKrJaaeRdQP8u0Q293aLRc7gnhmWk7Ibyo2HWd7HUoxsHJbewrzomreGaKfBpsw50zKvyEKm8KU1Xg0FR51TSxFoUNWdUJ8W/+yrOqqUZGUf8A9fZQELk97TnXG6TIHaFJ6bxYKMHSCv8A+vt+WaXHUYMkT/8A19gf+5chc31n0j4t/wDZN5TS/V8nf+qrwIkD7odZjYMSJ2LT50WKMDSKv/I5Yf8AulwKwHTUpKlUeXAAv7bc9Uc5BWfSPi3/ANl3jqa1+N8nf+qr0ScodhB6FRt2BLn3J64nfsGpSjpSkg8004PyhJOYbwrTb9sAmWI9yJtaleba8UZHujNnDPtaT4BytR0xkGk1+XY4eoURbpkuo6tqI6dsdHJBjib8WRbW2Y3TC+fncJMJWmVYqb6rWCeNyJ6zc+iFNLwVN12XROKfVT5VxOZtBWXVqG4k97DTUNa3SfcDr/l0/kjydFjrnq/llXuF5Nl14rWm6lIWSb6nvkxJO18v7w9cccGYErz9TmJOflJmmssocyzS0gpUrMmwGutwCbjkhRiGhVDDswhuZeDiHAS24hRsq23TcdRE0lRG6XQDrlFMfhe6o4xvy2C17Xy/vD1wdr5f3h64a+Oc+EX5xjHGLO1Sj5Y7ZAdF29OipCWse9t/mjlMolhOEvLSEKQCklVr2JEN5JMcyy2pectoK7WzWF+uFo53Ku0tRxUUsTsw8AdhBuPdOrC5APAMuAuHQAEmEjcxIqQMqVLVbWytL74SlhtQIKEkHQi0ZQy22LIQlI5ALQtEa0uPvSinOx179wFl3W40od41l6VEwldSpx9htBCVKVoTujrGFJ79DgNlINwYd2KOBzWPBOpTiRok9LyzVpqUQbC6lLUkJB33t6NIbcXyrsnxLa5tqYUdV5QbpNtN502wzmvN8chp5LodcF9O+GnPHKamzMG1rJHpgZDTSiUPefJEKp7RH26kjcfQ3ptPIIZ6XNlt91hbTgIcWq9uUw7uy6FnNfKYTqbSnYq/kgs0gAhNo6pkMb2D+8WKVB9spvfZu3xH6lSXXah2wkwC5tW2TbNpa4PRDu0yHL2UARywpWsJAzBOqbab+aOtJbmFWjdxbtJiYkzSmciCrIonQKTbPzaxo6HZtyyLqAFuYc14WVUCYYCFAAZkiw+UI7MsoYRxbYslJsBD9MaNwiDnWpuUAbbeV7rSTlhKgKBJcvmzc8PCcQltSG3JZS1KBupBAAAtqb9MNsSljB1MnEU+Zl8RyBbUCJ0OuBtbYIBshJ2m4traKkzo8jKoqNxfIdI5WPjbLzUfnKg5OqAPetjYkR14Iv8AFGjfPvf6Tkc6nLS0nPvMSk2mcYQqyHkiwXG/BF/ijRvn3v8AScjktuTP0dWifRKiJM40tdx6r1rI+2B0GHOGyR9sDoMOcWODH6PvK1cmtERrFP8ACat9Gd/AYksRrFP8Jq30Z38BhnCb8mP/AC9lxm1eRKF++X8j8xD1DLQgS+sAX7z8xD0QRD5PmWGn+ZEEYuIzDFCiCCCEkiJBQ8cVOispl+8mZdOiUObUjkBiPwRHJG2QWcLp8cjozdhsVYCOFRq3f0ty/wDK6PVHGZ4UnVIKZSmpQs7FOuZgPILffEFtBsiuKCAZ6KsmunP93onCo1Obrc0uYqDyluBNki1gkcgHJCcq4oDUWt4Ntp5Y0L5KdTrsIOwxyvffFxoDRYKq5xJuda2W6tSSBbWGuflXptCUFS0lKwsKSL2I/wC8OUEdBtmpIJ3QvD2awk0sl5ASlRVlSALq32EKYII4mSPLzpFODOFavVqXMTMrKkshpZC1G2awOgG0nohDhKh1HEFKcfkZZS+xiltaT3pJsdl9sSCi44qdFlUyqAy+yjwUuDVI5ARDg9wm1NxspZlJVo226qt6YqPkqRdrWjqN0UgqKdlM6Ek/Fa/coe604w4pp1CkOIOVSVCxBjWO0y87OPLmX3C488orJO1RO+OMWhqzQk68kQQQR1cWqkpWLEXjmWVDwHFDmjtBCXbrjleHux1RukOX1UnqjeCElddmJgMG4aQpXKYUoqDrpICWwbb7wggBINwbGOWTS0HWnNVTfCE34vkuBe0JV1GYWLBQSOQCE615zewHLbfGIS7YJ2ouJ5+hzCnmChzOMqkOC4I8myHF3Hk0Jd5mSpshJceSXVNN6rJ2nkvzm8RiCInU8bjpOGamZUSMboNNgslaiblRPljB12wQRMoUQQR0DWo22vrCSXdOGqpW6NPvyMqp1ttlwXG1Sgm+VI2k7NkbIw3VZehs1KYknGWTmCkuDKtvvyO+SdRfd0xtK1WfpOZUlNuywUfBQq4PSNkaz9eqdTRknJ559G3ITZPUIhPHaVha1+9Xm1EQpzDY3Jv36khjMYvBE6orMEYgjiSzBGIzCSRD1RMRTNHYW1LoZcbWbuNuIBCx9/khljF7a3tDXNDhZwT45HMdpNNipJO4op78vkRQZYujwFPuKcQjoSYaU1ibaVdgsMczMu2gDqTDcXWxtUI1My2NlzDBCwbL9ufqrEldUy/M8+KeBiSsDZUX09Fh+UboxTW0f+YvH5QB/KGIzQ3J6zGOyVciRDuKZ0R4BRcZL0j4lSNGMKwnwnWHfnGEG/ojWoYrqVRkVSLglWZdZClJYaCMxBvr1CI6ZhfKIx2QvlENEEd76ITjNMW6JcbdqVxs2SFpUEhWU3sRcHphM0txagLjXZptjfjbIUM6hsvYag+qJbKIMKmqcdyj0s2xM0gISgWCZZzKjyJItAnF9IH/AClQTzBSD6ogi5lalEjQbLWjHZDnKOqJIJZIG6ETiAmzxNmdpStBKs5nhHpLKUpEhPgJFtMnrhe1wpUjYqXnEc5bSfuMVH2SveBGeyT70RPy6p+ofL7KEUcI1MHn91dMtwhUOZ/51LZ5HG1J9NrQuTi6jKH8VkR0vJH5xRQmSE3yabLwCaG9Jh/OdWNTx3ge1lzkUG1vmfe6u93GdFb21WUI/kOY+i8M9Q4SaQ0SJdMzOKGwhORPWbfdFVCZRz9UZ7Ib5T1RBLWVMo0XyG3VYegv5qRkELDdsYv13Prl5KXVThEq07dEqESTZ953y/OP5ARG3Zlbt1qWVLUe+za3PLeEvHt+/EZDqD7tPXFSKJkYswWU8kz5DdxW5N9sPNIxfV6KyGJZ9K2RsbdTmA6N464ZM6ffJ64MyffJ647IxrxZwumsc5hu02UtXwlVpSSA1JJJ90G1XHWqI/U6tO1iY4+dfU6sCwvoEjkAGyEWZPvk9cGZPvk9cMjgjjN2tAT5J5HizjdbQRrmT75PXBnRvUnriVQraxPkjYt2A1ubXtyCOgWhKE2UnNra+wiOLk43sSebZrHV2yII5GYRzmNTMjckwkrLvGDshOZhZ2ACNFLWraowkrKVo4PZ2ampCZl56SelXG18e8hwWZ2Eae62W3WhhqaBT516VQ8zMcUrLxrZulXRDfbbpt2wWiJjZAfjdcdiuTTNkYxobbRFvf3WynFL2mNYLQWiZV1lKik3GhEClZiTYDojFoLQrpJPONLmGVIQoJXcEE8xB/KOjOfIA4Ule8pGl46WgtzR3SysrJqSYuJtle/fqRBBBaOFVkQu4I/8UaN8+9/pOQhhw4IkK7p1GVYW497b805Ec/5EnYfRXsP/ADm9oXrKR9sDoMOcNkj7YHQYc4scGv0neVrZNaIjuJG1vU6ptNpKlrl3EpSkXJJQdBEihufl3VvLUlBIJjnCKJ8kTOLbcg7OxcYvIrGDcUS+ZTVCrCFEZTllF3+6MLwzjEkZaJWxYW9qr19EetzKPe8jHYj/ALwwJOIVn0PIodzVFtd6LyN7F8Z+Ja19kX6oz7F8ZeJK19lX6o9cdiv+8MHYr/vDHOX1n0PIrnNEO/0Xkf2L4y8SVr7Kv1QexfGXiStfZV+qPXHYr/vDB2K/7wwuX1n0D4FLmiHf6LyP7F8ZeJK19lX6oPYvjLxJWvsq/VHrjsV/3hg7Ff8AeGFy+s+gfApc0Q7/AEXkf2L4y8SVr7Kv1QexfGXiStfZV+qPXHYr/vDB2K/7wwuX1n0D4FLmiHf6LyP7F8ZeJK19lX6oPYvjLxJWvsq/VHrjsV/3hg7Ff94YXL6z6B8ClzRDv9F5H9i+MvEla+yr9UHsXxl4krX2Vfqj1x2K/wC8MHYr/vDC5fWfQPgUuaId/ovI/sXxl4krX2Vfqg9i+MvEla+yr9UeuOxH/eGMiTfPueswhXVpyEB8ClzRDv8AReRvYvjLxJWvsq/VHdvC+MEpI7TVgnaCZVdj06R62TT3D4SgI3NONtHOsRba7EXN0uI8/wB1zmmHpei8irw7jKwyUOsg88qvTo0jj7FsZ+JKz9lX6o9dqknk7Eg+WNexX/eRVdW1rTYwHwKdzTD0vReRvYtjPxLWvsq/VB7FsZ+Ja19lX6o9c9iv+8g7Ff8AeQ3l9Z9A+BXOaId/ovI3sWxn4lrX2Vfqg9i2M/Eta+yr9UeuexX/AHkHYr/vIXL6z6B8Cu80xdL0Xkb2LYz8S1r7Kv1QexbGfiWtfZV+qPXPYr/vIOxX/eQuX1n0D4Fc5oh3+i8jexbGfiWtfZV+qD2LYz8S1r7Kv1R657Ff95B2K/7yFy+s+gfApc0Q7/ReRvYtjPxLWvsq/VB7FsZ+Ja19lX6o9c9iv+8jIk3z7kDpMObXVrjYQHwKXNEO/wBF5F9i2M/Eta+yr9UY9jGMx/5LW/srnqj2G3ThtcVc8gjqqTZUm2S3ONsE44K9zdIsaDuJ+ybzVDvPkvG/sZxl4lrf2Rz/AOMY9jOMvEtb+yOf/GPXzsi4g953w9MadiPe8MDn1dcx2i6DPvTuaIel6LyO1hjGSttFrVueVcv90dHMP4yFiKJW8w2ESjmo59I9adiPe8MHYr3wZhhr6wf9HkV0YRD0vReRDhvGRJPaOufZHPVB7G8ZeI659kc9Ueu+xXvgzB2K98GY5y+t+h5FLmiHpei8h+xvGfiKufZHPVB7G8Z+Iq59kc9UevOxXvgzB2K98GYXL636HkVzmiHpei8h+xzGfiGufZHPVGPY5jTxDW/srn/xj172K98GYOxXvgzC5fW/Q8ilzRD0vReQThvG26hVsf8AtHPVGPY3jfxHWx/7Rz1R6/7Fe+DMHYr3wZhcvrfoeRS5oh6XovHxwvjdW2iVz7I56o19ieNPEdc+yOeqPYfYr3wZg7Fe+DMLl9b9DyK7zTD0vRePPYnjTxFW/sjnqjHsTxp4irf2Rz1R7E7Fe+DMHYr3wZhcvrfoeRXeaYul6Lx37E8aeIq39kc9UHsTxp4irf2Rz1R7E7Fe+DMHYr3wZhcvrfoeRS5ph6XovHfsTxp4irf2Rz1RkYSxoSB2irfT2I56o9h9ivfBmDsV73hjor6z6HkUuaYul6LyInCeLkApNErZNtf7K5r0aRxXhXGqzc0Otcl+xHPVHsHsR73hjYST3IB5Ye2srnaoD4FLmmLpei8c+xLGniKt/ZHPVB7EsaeIq39kc9UexTJvj3IPQYx2K/8ABmOGurQbGA+BS5ph6XovHfsSxp4irf2Rz1RlOD8aruE0Gtm3JKOeqPYfYr/wZhXIsqazlabE2i1Qz1M8wjki0RtNjuXDhUQHzei87UHg0rc7wQVp2bkJ1mstzwmpVlbSg8pCEJBSEkXN7rsN5tFdrwhjZsDNQK4L8so56o9r2jhNMca2QB3w1EG6qAtiLohdwGQ3pOw+N9gdi8W+xTGfiKtfZHPVB7FMZ+Iq19kc9Uew+xX/AIMwdjPfBmMzzhWfQ8ilzVFv9F489imM/EVa+yOeqD2KYz8RVv7K56o9h9jP/BmDsZ/4MwucKz6HkUuaot/ovHnsVxn4jrf2Vz1QexXGfiOt/ZXPVHsPsV4/8MxnsR73hhc4Vn0PIpc1Rb/ReO/YrjPxHW/srnqg9iuM/Edb+yueqPYnYj3vDB2I97wwucKz6HkUuaot/ovHfsUxn4jrf2Vz1R3awjjFAzKotYzHQf2Vw29EevexHveGDsR73kLnCs+h5FLmqLf6Lx+5hjGihl7Q1nnIlXNfRHP2J4z8RVv7K56o9idiPe8MHYj3vDC5wrfoeRXeaoul6Lx17EsZ+Iq19kc9UZ9ieM/EVa+yueqPYnYj3vDB2I97wwucaz6HkUuaoul6Lx37FMaeIq39lc9UHsUxp4irf2Vz1R7E7Ee94YOxHveGFzhWfQ8ilzVF0vRePBhPGh2UKt/ZXPVGPYpjTxFW/sjnqj2ZKSyhn4xG0W1jk9JOpWcgzJ3RafNWNgbMIr32Z3C5zXFe1z5Lxx7FMab6FW/sjnqg9imM/EVb+yOeqPYglH/eHrg7Ef8AeHrirzhWfQ8iu80xdL0Xjv2KYz8RVv7I56oPYpjPxHW/sjnqj2J2I/7w9cHYj/wZ645zhW/Q8ilzTF0vReO/YpjPxHW/sjnqg9imM/Edb+yOeqPYnYj/AMGeuDsR/wCDPXC5fW/Q8ilzTF0vReO/YpjPxHW/sjnqg9imNPEVb+yOeqPYnYj/AMGeuDsV/wB56YXL636HkUuaYul6Lx81hHGSld/Q63YC/tVzX0RMOCbCNflOEShzc7QqkxLNuulxx2XWlLd2XBqSLakjrj0j2K/7z0wrkmlthWdNiTpF6gqKmacRyxWbvsU5mHRxkOa7UtWpYszIUNUEHyQsjEZ1jQUtJHTNLIsgTdXCbqu//wAf8R1DFPBPQ6hVHEuzKULli4BYrS2tSEk8pskXO8xYkEEWlxEEEEJJEEEEJJEEEEJJEEEEJJEEEEJJEEEEJJEEEEJJEEEEJJEEEEJJEEEEJJEEEEJJEEEEJJEEEEJJEEEEJJEEEEJJEEEEJJEEEEJJEEEEJJEEEEJJEEEEJJEEEEJJEEEEJJEEEEJJEEEEJJEEEEJJEEEEJJEEEEJJEEEEJJEEEEJJEEEEJJEEEEJJEEEEJJEEEEJJEEEEJJEEEEJJEEEEJJEEEEJJEEEEJJEEEEJJEEEEJJEEEEJJEEEEJJEEEEJJEEEEJJEEEEJJf//Z	Captura de tela 2026-09-02 122238.png	image/jpeg	[{"id":"1","name":"Entrada","color":"#1E9BD7","x":-22,"y":14,"width":218,"height":118},{"id":"2","name":"Área Verde","color":"#22C55E","x":200,"y":20,"width":269,"height":151},{"id":"3","name":"Área Azul","color":"#1E9BD7","x":-21,"y":133,"width":221,"height":175},{"id":"4","name":"Área Central","color":"#F59E0B","x":201,"y":170,"width":269,"height":136}]	Lúcio da Silva	2026-09-29 17:25:07.345112-03	2026-09-29 17:30:11.093647-03	1	1
cb2c9907-c412-4cf3-9b36-59b41e5e9d0b	\N	Buffet Teste		2026-07-30	08:00:00	240	finished	1	0	2026-07-28 11:57:26.955509-03	c9287e4b-399d-4764-8bff-2e0ce7058dcb	none	\N	\N	\N	\N	\N	\N	2026-09-29 17:45:13.264607-03	2026-09-29 17:45:27.469247-03	0	0
909bb418-82c5-4461-869e-72bc9bfbb3aa	\N	Festinha do Lulinha		2026-10-03	09:00:00	320	finished	1	1	2026-10-02 11:51:17.554364-03	c9287e4b-399d-4764-8bff-2e0ce7058dcb	none	\N	\N	\N	\N	[{"id":"1","name":"Entrada","color":"#1E9BD7","x":50,"y":20,"width":120,"height":80},{"id":"2","name":"Área Verde","color":"#22C55E","x":200,"y":20,"width":200,"height":150},{"id":"3","name":"Área Azul","color":"#1E9BD7","x":50,"y":130,"width":120,"height":120},{"id":"4","name":"Área Central","color":"#F59E0B","x":200,"y":200,"width":200,"height":100}]	O jogo terminou. Confira o ranking!	2026-10-02 11:51:21.856865-03	2026-10-02 17:11:31.779926-03	1	1
4695594c-19e9-493f-86a9-dfe79941400e	\N	Anivers Marta		2026-10-01	11:30:00	500	finished	1	0	2026-07-15 12:36:55.247-03	c9287e4b-399d-4764-8bff-2e0ce7058dcb	none	\N	data:image/jpeg;base64,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YjjuUpEEWrw+lrqGWhqqeKallYYnwvaC1zToWkbrWWqowTDqukgo6iihlpqdzHxRubdsbmEFhHMQQLc1lPRBCZhFBFicuKR0kLK6aNsUk4aM72NJygniBc2ULaDY/ANqmRtxvCaSu5K5jdKy7o778rt49RV0iDnMA2B2f2VxGWuwShbh5mhbDJDAS2J+Umzi3cX6kZt5G8rdtBsRs5tXJFLjmDUdfJEC1j5Wd0Gne241IPEHRXqIIrMPpI6AYeymibSCPkuRa0BgZa2W3NbSyyo6GloKKKhpYGQ0sLBHHE0Wa1oFgAOaykIgjYfh9LhVFDQ0NPHT00DQyOKMWaxo4AcyoKX7mWxlDiDMRptmsMirGSmZs7IQHteTfNfnvc3XUIggYvguG7QUL6HFaGnrqV/fRTsD2npsePSoGAbC7M7LTPnwbBaOime3K6ZjLvLebMbm3RdXyIItTh1JWVFLU1FPFLNSPL4HubcxOLS0lvMbEj1rZU00FZTyU9TFHNDI0tfHI0Oa4HgQdCFuRBzWD/c42RwCtFfhmz+H0tUAWtlZHqwHeG370dAsrrEMMo8UiZFW00VQyOVkzGyC4a9pu1w6QQCFLRBGqsPpK18ElRTxSvp38pE57QTG61szeY2JXkuG0k1dBXyU8bqqnY6OKYtu5jXWzAHhfKPkUpEFXj2zODbUUraTGsMpa+FrszWzsDsh52neD0ha8A2RwHZeORmC4TSUPKG73RMs55/tOOp9ZVwiCHR4VQ4fUVVRSUsUM1ZIJah7G2MrgAAXHibAD1L2DDaOmramuhpo46qryieVrbOlyizcx42BNlLRAK52g+59snhmKHFaLZ7DYK9znPNQyBokzON3G/Akn6V0SIIcmFUM2IQYlJSxvrKdjo4Zi27o2utmDTwvYX8y9qMLoqurpayopopKijc51PI5ozRFwyuLTwuNFLRBRYnsTs3jOKQ4tiOC0VVXwFpZPJGC4ZTdt+ex1F72VjW4VQ4lJSyVlLFO+klE8Be2/JvAIDhzGxPyqYiCHiGF0WKsjjrqWKobFK2ZgkbfLI03a4cxB1BUwIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIg//Z	Planta teste.jpg	image/jpeg	[{"id":"1","name":"Entrada","color":"#1E9BD7","x":39,"y":52,"width":33,"height":92},{"id":"2","name":"Área Verde","color":"#22C55E","x":72,"y":58,"width":115,"height":94},{"id":"3","name":"Área Azul","color":"#1E9BD7","x":72,"y":155,"width":70,"height":116},{"id":"4","name":"Corredor","color":"#F59E0B","x":138,"y":249,"width":52,"height":20},{"id":"1790795494128","name":"Área central","color":"#1E9BD7","x":191,"y":166,"width":147,"height":99},{"id":"1790795532703","name":"Bar","color":"#0e4e0f","x":147,"y":163,"width":39,"height":79}]	Marta da Silva	2026-10-01 11:02:12.977911-03	2026-10-02 07:59:18.566298-03	1	1
c920334b-c141-47ea-a791-dd2c9828be58	\N	Ani Do Walle		2026-10-05	08:30:00	600	finished	1	0	2026-10-05 08:27:37.177748-03	c9287e4b-399d-4764-8bff-2e0ce7058dcb	none	\N	data:image/jpeg;base64,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YjjuUpEEWrw+lrqGWhqqeKallYYnwvaC1zToWkbrWWqowTDqukgo6iihlpqdzHxRubdsbmEFhHMQQLc1lPRBCZhFBFicuKR0kLK6aNsUk4aM72NJygniBc2ULaDY/ANqmRtxvCaSu5K5jdKy7o778rt49RV0iDnMA2B2f2VxGWuwShbh5mhbDJDAS2J+Umzi3cX6kZt5G8rdtBsRs5tXJFLjmDUdfJEC1j5Wd0Gne241IPEHRXqIIrMPpI6AYeymibSCPkuRa0BgZa2W3NbSyyo6GloKKKhpYGQ0sLBHHE0Wa1oFgAOaykIgjYfh9LhVFDQ0NPHT00DQyOKMWaxo4AcyoKX7mWxlDiDMRptmsMirGSmZs7IQHteTfNfnvc3XUIggYvguG7QUL6HFaGnrqV/fRTsD2npsePSoGAbC7M7LTPnwbBaOime3K6ZjLvLebMbm3RdXyIItTh1JWVFLU1FPFLNSPL4HubcxOLS0lvMbEj1rZU00FZTyU9TFHNDI0tfHI0Oa4HgQdCFuRBzWD/c42RwCtFfhmz+H0tUAWtlZHqwHeG370dAsrrEMMo8UiZFW00VQyOVkzGyC4a9pu1w6QQCFLRBGqsPpK18ElRTxSvp38pE57QTG61szeY2JXkuG0k1dBXyU8bqqnY6OKYtu5jXWzAHhfKPkUpEFXj2zODbUUraTGsMpa+FrszWzsDsh52neD0ha8A2RwHZeORmC4TSUPKG73RMs55/tOOp9ZVwiCHR4VQ4fUVVRSUsUM1ZIJah7G2MrgAAXHibAD1L2DDaOmramuhpo46qryieVrbOlyizcx42BNlLRAK52g+59snhmKHFaLZ7DYK9znPNQyBokzON3G/Akn6V0SIIcmFUM2IQYlJSxvrKdjo4Zi27o2utmDTwvYX8y9qMLoqurpayopopKijc51PI5ozRFwyuLTwuNFLRBRYnsTs3jOKQ4tiOC0VVXwFpZPJGC4ZTdt+ex1F72VjW4VQ4lJSyVlLFO+klE8Be2/JvAIDhzGxPyqYiCHiGF0WKsjjrqWKobFK2ZgkbfLI03a4cxB1BUwIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIg//Z	Planta teste.jpg	image/jpeg	[{"id":"1","name":"Entrada","color":"#1E9BD7","x":30,"y":43,"width":40,"height":104},{"id":"2","name":"Cozinha","color":"#2421c4","x":221,"y":56,"width":85,"height":95},{"id":"3","name":"Área1","color":"#04ff00","x":73,"y":54,"width":115,"height":93},{"id":"4","name":"Área2","color":"#F59E0B","x":75,"y":147,"width":269,"height":122}]	Walisson	2026-10-05 08:30:07.081683-03	2026-10-05 18:30:18.659696-03	1	1
\.


--
-- Data for Name: leituras; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.leituras ("leituraId", "checkpointId", "criancaId", uid, "brincadeiraId", autorizado, "pontosAtribuidos", "forcaSinal", "criadoEm", "empresaId", session_id) FROM stdin;
\.


--
-- Data for Name: logs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.logs ("logId", tipo, "clienteId", "eventoId", mensagem, detalhes, "criadoEm", "empresaId") FROM stdin;
\.


--
-- Data for Name: mensagensDisplay; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."mensagensDisplay" ("mensagemId", "eventoId", texto, tipo, remetente, "enviadoEm") FROM stdin;
95388ba6-2bd1-4423-9d22-6906fb8d64e7	c920334b-c141-47ea-a791-dd2c9828be58	Preparem-se!	preset	recreacionista@gmail.com	2026-10-05 09:44:42.022478-03
1a30d858-0d60-4781-b143-f414a0b6ffb6	c920334b-c141-47ea-a791-dd2c9828be58	Faltam 5 minutos!	preset	recreacionista@gmail.com	2026-10-05 09:45:11.22874-03
81616d71-4ee8-4653-b29b-5a75a6903ec4	c920334b-c141-47ea-a791-dd2c9828be58	Atenção ao próximo desafio!	preset	recreacionista@gmail.com	2026-10-05 09:45:12.931769-03
dfa29740-b214-4d65-bbb3-dfdca5b60d40	c920334b-c141-47ea-a791-dd2c9828be58	Parabéns a todos!	preset	recreacionista@gmail.com	2026-10-05 09:45:14.334857-03
eb67b356-8581-4fd6-bbfe-3b6466690307	c920334b-c141-47ea-a791-dd2c9828be58	Equipe vencedora!	preset	recreacionista@gmail.com	2026-10-05 09:45:15.971374-03
f421e834-42d3-4b52-aec7-a723f616a276	c920334b-c141-47ea-a791-dd2c9828be58	Jogo iniciado!	preset	recreacionista@gmail.com	2026-10-05 09:45:19.274331-03
\.


--
-- Data for Name: monsterCacaEstadosTime; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."monsterCacaEstadosTime" (id, partida_id, empresa_id, evento_id, time_id, hp, max_hp, status, version, defeated_at, victory_at, created_at) FROM stdin;
dfbcd6c6-1fe9-4b08-97bc-2992e057415e	564f4f1a-e2a3-49c3-a0c6-747b3bcbe82d	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	500	500	finished	1	\N	\N	2026-08-25 10:44:59.54011-03
13c6b410-98d3-47ac-9645-43b67625ffb6	564f4f1a-e2a3-49c3-a0c6-747b3bcbe82d	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	500	500	finished	1	\N	\N	2026-08-25 10:44:59.54011-03
dd157627-a166-4a21-b954-352be2289c85	6b897d20-95a8-4b7d-a18c-779bb0334630	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	500	500	finished	1	\N	\N	2026-08-26 11:50:18.088695-03
44730a83-6cd3-4b5b-b5ff-24551ddede19	3f28904e-d116-4d94-ae43-5daba572572f	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	420	500	finished	3	\N	\N	2026-08-25 10:45:11.199414-03
174a7d39-2b9f-40e4-94f2-1ff94c494cb7	3f28904e-d116-4d94-ae43-5daba572572f	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	420	500	finished	3	\N	\N	2026-08-25 10:45:11.199414-03
f80928fc-f489-4a8b-8a38-f41e6c172aa7	6b897d20-95a8-4b7d-a18c-779bb0334630	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	500	500	finished	1	\N	\N	2026-08-26 11:50:18.088695-03
1805410b-80d5-4a52-9d25-0e2f2b5de658	6b897d20-95a8-4b7d-a18c-779bb0334630	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	0ee3527e-0209-4764-857b-ebec2ec9759d	500	500	finished	1	\N	\N	2026-08-26 11:50:18.088695-03
ca784b01-16e6-4c3e-b6e7-bf28d2ba5c2a	61f8f984-34ee-43ab-a723-419d91e3476e	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	500	500	finished	1	\N	\N	2026-08-26 13:48:31.998462-03
f814c0d4-49aa-4594-a90f-8ed802882bf6	321cd709-b248-44ec-a738-617f865e5886	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	280	500	finished	19	\N	\N	2026-08-25 10:51:34.719365-03
386630fd-738c-4960-83c8-c3b652b07134	321cd709-b248-44ec-a738-617f865e5886	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	380	500	finished	9	\N	\N	2026-08-25 10:51:34.719365-03
23e8434d-b861-49d8-b384-295e0054f08d	67230ab7-f135-4aa3-869e-a806f7ec1eaa	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	500	500	finished	1	\N	\N	2026-08-26 08:41:43.696694-03
495d77e5-dd60-4605-b96c-3c42d8b1bb03	67230ab7-f135-4aa3-869e-a806f7ec1eaa	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	500	500	finished	1	\N	\N	2026-08-26 08:41:43.696694-03
1a789ce6-04e1-44f7-9dd5-95078b30f120	61f8f984-34ee-43ab-a723-419d91e3476e	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	500	500	finished	1	\N	\N	2026-08-26 13:48:31.998462-03
653361a4-e14a-47ef-96d1-785288f432b0	61f8f984-34ee-43ab-a723-419d91e3476e	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	0ee3527e-0209-4764-857b-ebec2ec9759d	500	500	finished	1	\N	\N	2026-08-26 13:48:31.998462-03
6b4ac62b-cbec-470f-9274-b2cbfe016887	1d19e993-0e61-4e6d-93a0-23c652da8d67	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	500	500	finished	1	\N	\N	2026-08-26 09:10:30.851962-03
e0ede9f5-e4e5-4fd9-ac8e-e73df02a5084	1d19e993-0e61-4e6d-93a0-23c652da8d67	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	500	500	finished	1	\N	\N	2026-08-26 09:10:30.851962-03
bc62dd7c-8dd6-4691-ac42-430ca9e258af	1d19e993-0e61-4e6d-93a0-23c652da8d67	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	0ee3527e-0209-4764-857b-ebec2ec9759d	500	500	finished	1	\N	\N	2026-08-26 09:10:30.851962-03
d2d4808d-5465-4977-98e3-daf2c30477c5	e36aae13-cf6a-4787-985f-ff6453212a37	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	500	500	finished	1	\N	\N	2026-08-28 14:06:46.520224-03
dce59e78-f4d2-456d-9f32-a5a941ee067e	e36aae13-cf6a-4787-985f-ff6453212a37	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	500	500	finished	1	\N	\N	2026-08-28 14:06:46.520224-03
e8af1773-d6e9-44a7-a29a-4b25c9883a6b	e36aae13-cf6a-4787-985f-ff6453212a37	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	0ee3527e-0209-4764-857b-ebec2ec9759d	500	500	finished	1	\N	\N	2026-08-28 14:06:46.520224-03
9ab44282-7cb5-4cc1-96fd-30f411f2ed54	0aaad036-b722-4d21-9dc5-065b88776907	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	490	500	finished	2	\N	\N	2026-08-28 15:45:56.129614-03
f885ab05-29f3-45f4-a52d-f33665e4202d	0aaad036-b722-4d21-9dc5-065b88776907	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	490	500	finished	2	\N	\N	2026-08-28 15:45:56.129614-03
e0d76373-64ca-4f2e-9a7f-281575357ddc	0aaad036-b722-4d21-9dc5-065b88776907	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	0ee3527e-0209-4764-857b-ebec2ec9759d	490	500	finished	2	\N	\N	2026-08-28 15:45:56.129614-03
15929071-05ac-4d7b-99d4-2af2a30cf068	6c693efc-88a2-42d8-a525-8f1320aa4cad	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	500	500	finished	34	\N	\N	2026-08-31 09:46:12.005178-03
e008e0a5-88e1-479e-8489-c8c20cfcb662	823aaa81-44ed-4d72-aec2-d1cc02846e32	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	470	500	finished	2	\N	\N	2026-08-28 16:41:39.790921-03
1b1c2eb4-db93-442e-8204-23ca6b41867c	6c693efc-88a2-42d8-a525-8f1320aa4cad	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	500	500	finished	31	\N	\N	2026-08-31 09:46:12.005178-03
1ec602be-0b5e-415e-bfc3-b59f4beba971	823aaa81-44ed-4d72-aec2-d1cc02846e32	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	0ee3527e-0209-4764-857b-ebec2ec9759d	490	500	finished	2	\N	\N	2026-08-28 16:41:39.790921-03
0580af3f-7b65-4aa4-8ec9-e940967707ef	823aaa81-44ed-4d72-aec2-d1cc02846e32	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	370	500	finished	8	\N	\N	2026-08-28 16:41:39.790921-03
7a3b4a8f-729e-49e7-bd03-6bb099cc7d54	a0409ce1-d7ef-4a15-8524-fc69afa9f8fb	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	500	500	finished	1	\N	\N	2026-08-31 11:31:50.83522-03
e8ad34e5-78cf-4a70-9635-5ca13049ba99	a0409ce1-d7ef-4a15-8524-fc69afa9f8fb	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	500	500	finished	1	\N	\N	2026-08-31 11:31:50.83522-03
bddf5d27-68d7-436d-8075-1b7e1296158e	65767144-09e9-4d6e-b8a7-54a65c161196	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	500	500	finished	1	\N	\N	2026-09-18 13:41:19.374129-03
16d4f7ba-a978-4430-9956-c197bfb7593d	9f45953a-de69-42ff-a9e5-42351ca68622	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	490	500	finished	2	\N	\N	2026-09-10 13:10:23.0304-03
c0855989-074d-4896-abe7-3a0696dbebd9	9f45953a-de69-42ff-a9e5-42351ca68622	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	490	500	finished	2	\N	\N	2026-09-10 13:10:23.0304-03
c8bfb26f-1261-417b-ae9c-e096352c0925	3249dcfd-1e4d-4a09-8f21-d6d43bf67f4a	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	500	500	finished	1	\N	\N	2026-09-15 08:45:08.115872-03
b8015b6c-9417-49dd-934d-e113dfa40ae4	65767144-09e9-4d6e-b8a7-54a65c161196	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	500	500	finished	1	\N	\N	2026-09-18 13:41:19.374129-03
f04db620-f439-498d-82ae-4ce00753840d	3249dcfd-1e4d-4a09-8f21-d6d43bf67f4a	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	500	500	finished	1	\N	\N	2026-09-15 08:45:08.115872-03
6f96c1a3-60cb-4cf5-b6d4-c21883a96ea8	e8d02467-8852-4637-9c12-22e0d27d84f7	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	440	500	finished	3	\N	\N	2026-09-15 16:54:42.615553-03
5dbb1125-9516-42dc-addc-a7540727b56a	e8d02467-8852-4637-9c12-22e0d27d84f7	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	420	500	finished	5	\N	\N	2026-09-15 16:54:42.615553-03
05ae3727-0030-428a-9da1-86180974a93e	654724c2-cb0c-46ef-9184-acb72a944c07	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	500	500	finished	1	\N	\N	2026-09-02 10:31:47.325381-03
8ccd0eba-8bea-4864-8182-f30657b37957	654724c2-cb0c-46ef-9184-acb72a944c07	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	500	500	finished	1	\N	\N	2026-09-02 10:31:47.325381-03
fe604d36-771e-4e48-b79f-51a4dc78eaf3	ea5ac4e8-5530-4338-a13d-c7f26a945a97	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	500	500	finished	1	\N	\N	2026-09-02 10:34:06.299836-03
76c28882-15a5-4dfd-baf1-f906b7e4fb3f	ea5ac4e8-5530-4338-a13d-c7f26a945a97	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	500	500	finished	1	\N	\N	2026-09-02 10:34:06.299836-03
8959afdc-f05e-4455-8e0f-6c4bb85cb153	a7a47887-cc60-4413-8dad-4447e9d3b218	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	500	500	finished	1	\N	\N	2026-09-02 10:52:30.932263-03
7d710d4d-b9b1-4f33-8743-689d556addba	a7a47887-cc60-4413-8dad-4447e9d3b218	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	500	500	finished	1	\N	\N	2026-09-02 10:52:30.932263-03
8c4ffc63-7f10-4153-80af-b28e546baa2b	f378e3a8-672e-4c6c-8edb-1839842c7c38	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	500	500	finished	36	\N	\N	2026-08-31 11:32:54.061883-03
a4486aa2-79a6-4456-ab56-b735d81ad664	f378e3a8-672e-4c6c-8edb-1839842c7c38	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	500	500	finished	32	\N	\N	2026-08-31 11:32:54.061883-03
5b265f6a-7cf6-46ed-8cb1-f34a50be9778	85e55d30-09f4-4781-969d-e0a07ef0eefd	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	500	500	finished	1	\N	\N	2026-09-18 16:33:12.540406-03
69be3164-1db6-4086-aa70-7cb90dd721f9	0bca2a54-fe8c-4646-9a14-09f89ff7c706	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	500	500	finished	1	\N	\N	2026-09-18 09:56:06.160419-03
76320925-438b-42bc-8ca0-a2cf8ac808ad	0bca2a54-fe8c-4646-9a14-09f89ff7c706	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	410	500	finished	6	\N	\N	2026-09-18 09:56:06.160419-03
863aa69f-26ad-4fa2-a798-a817b1c4df39	c3953c8b-af1e-4cc7-a454-e097bfa265c0	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	490	500	finished	2	\N	\N	2026-09-16 11:16:34.615128-03
07931980-70d4-42ae-b40c-1f851d21db7d	c3953c8b-af1e-4cc7-a454-e097bfa265c0	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	490	500	finished	2	\N	\N	2026-09-16 11:16:34.615128-03
283623b8-aff9-4481-bc0d-b41a794f5f29	85e55d30-09f4-4781-969d-e0a07ef0eefd	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	500	500	finished	1	\N	\N	2026-09-18 16:33:12.540406-03
7ae62247-79ef-45fd-a4c7-01db14110abd	48b2b330-2d83-421f-be96-16840a579e44	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	500	500	finished	1	\N	\N	2026-09-18 16:47:44.652983-03
c85f1640-40ea-43f7-acc7-2496460e0508	48b2b330-2d83-421f-be96-16840a579e44	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	500	500	finished	1	\N	\N	2026-09-18 16:47:44.652983-03
97339e36-85dc-4e47-98f6-8380a73a5d50	8f064fc7-f48c-4c50-8603-adb1d486efe2	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	500	500	finished	1	\N	\N	2026-09-21 08:44:30.318791-03
e296e06b-3f45-4ae5-ab80-2fbcc8212832	8f064fc7-f48c-4c50-8603-adb1d486efe2	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	500	500	finished	1	\N	\N	2026-09-21 08:44:30.318791-03
9e8acd0e-5858-4865-aea7-24e68c49c291	3e35ec5a-b7e5-4997-a731-b06cccceaf7c	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	500	500	finished	1	\N	\N	2026-09-21 11:34:21.775979-03
9b2ebd5d-a719-40dc-9ff1-1cc6e9c40b47	3e35ec5a-b7e5-4997-a731-b06cccceaf7c	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	420	500	finished	5	\N	\N	2026-09-21 11:34:21.775979-03
e8de9dad-5ef6-4b24-9898-b5e7a10976e6	e906a9e8-02b0-4c65-91e1-bf22c9e20708	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	500	500	finished	1	\N	\N	2026-09-23 17:45:40.796789-03
3f5653ff-fc28-4bd9-a947-38591c798fb0	e906a9e8-02b0-4c65-91e1-bf22c9e20708	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	500	500	finished	1	\N	\N	2026-09-23 17:45:40.796789-03
4ed488a0-8bde-4ff6-aa5c-d145052e8310	0fa1d523-434f-451f-859e-854272237906	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	430	500	finished	4	\N	\N	2026-09-25 10:54:58.729918-03
0db89965-8ed2-4514-aa6a-ebde917189fc	0fa1d523-434f-451f-859e-854272237906	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	480	500	finished	3	\N	\N	2026-09-25 10:54:58.729918-03
c534fbef-3fa1-45dc-93eb-ffec1751f1b1	4f7afe70-74c4-4594-97c4-2dca10d91099	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	500	500	finished	1	\N	\N	2026-09-25 08:23:14.009633-03
8873cb21-bfa8-41bb-a6c5-bb755961ef77	4f7afe70-74c4-4594-97c4-2dca10d91099	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	390	500	finished	4	\N	\N	2026-09-25 08:23:14.009633-03
c44b2345-36ef-4e14-9a9b-1cfd270ec4ca	fc51d236-3a7a-4ab3-8d63-843dc9512375	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	500	500	finished	1	\N	\N	2026-09-25 10:27:43.098048-03
e3ebbfff-22a1-47b9-bcec-a9a17bb1b6c8	fc51d236-3a7a-4ab3-8d63-843dc9512375	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	460	500	finished	3	\N	\N	2026-09-25 10:27:43.098048-03
6f1a8eeb-8379-4824-941d-c92de228c7db	f522af1e-41a8-4110-abab-eea23e991e0a	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	500	500	finished	1	\N	\N	2026-09-25 10:53:39.626511-03
bfff2865-92be-4a9c-9bd2-d910e0cac2aa	f522af1e-41a8-4110-abab-eea23e991e0a	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	490	500	finished	2	\N	\N	2026-09-25 10:53:39.626511-03
ba1c8afa-8f57-4c59-ba48-7028b5acb1c5	69ac454b-a080-4439-8cd6-cbe6f82862b6	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	430	500	finished	4	\N	\N	2026-09-25 11:53:25.750293-03
26ec8f9d-ea8a-4858-b218-3e0580e2bb27	69ac454b-a080-4439-8cd6-cbe6f82862b6	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	420	500	finished	5	\N	\N	2026-09-25 11:53:25.750293-03
a169bf77-3e26-4fc7-91f5-ea563750f2b1	b44395d9-d350-4930-a6e0-2d53fc8d5c0d	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	390	500	finished	4	\N	\N	2026-09-25 11:46:59.636528-03
c004f617-6b08-491a-9b53-d2dca8634d0b	b44395d9-d350-4930-a6e0-2d53fc8d5c0d	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	390	500	finished	4	\N	\N	2026-09-25 11:46:59.636528-03
8db951d1-8ade-4789-8c3d-aabc3e201b46	da22c0b3-7641-4709-8135-01b2daa81c86	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	430	500	finished	4	\N	\N	2026-09-25 11:42:25.794392-03
3af520ab-fd8a-4ab7-a022-c202ff2c2098	da22c0b3-7641-4709-8135-01b2daa81c86	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	430	500	finished	4	\N	\N	2026-09-25 11:42:25.794392-03
66bb9bba-8411-40f2-ada6-cc06b509f0a6	800551cf-84ca-4d2d-a4ef-89720d7761df	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	500	500	finished	1	\N	\N	2026-09-25 15:47:13.261387-03
9117cc49-c88b-44a8-85af-1d087976f25a	800551cf-84ca-4d2d-a4ef-89720d7761df	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	500	500	finished	1	\N	\N	2026-09-25 15:47:13.261387-03
33081b10-5c09-4ba1-862a-094b0b8862f7	455a3340-393c-4c7d-b35f-d4a6250b6973	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	490	500	finished	2	\N	\N	2026-09-25 13:40:53.722079-03
603767b4-fef9-401e-9e41-e1aba3e9946a	455a3340-393c-4c7d-b35f-d4a6250b6973	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	490	500	finished	2	\N	\N	2026-09-25 13:40:53.722079-03
6c3a0147-78d7-4aeb-928d-3eacf3ab94af	2044c05a-43c6-46e8-a87d-bc8c664e5dc1	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	490	500	finished	2	\N	\N	2026-09-25 11:57:28.791069-03
5f0913e8-ab14-457d-82d3-738313d435d3	2044c05a-43c6-46e8-a87d-bc8c664e5dc1	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	440	500	finished	3	\N	\N	2026-09-25 11:57:28.791069-03
9e26465c-b892-49d3-8bea-f7706925e650	3ddc7f55-7192-4fe0-8c6a-17e952dd74f5	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	480	500	finished	3	\N	\N	2026-09-25 13:54:28.983435-03
7152d834-c74b-48fc-a861-ea917d896b70	3ddc7f55-7192-4fe0-8c6a-17e952dd74f5	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	480	500	finished	3	\N	\N	2026-09-25 13:54:28.983435-03
af7a4a6f-25f7-41a7-88b6-c166a86352f6	7ed1ac78-98b5-4e6f-9be7-8104472609f3	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	410	500	finished	6	\N	\N	2026-09-28 12:19:51.849355-03
84bdbc5c-5a33-4298-8a65-9c3238ed2998	7ed1ac78-98b5-4e6f-9be7-8104472609f3	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	420	500	finished	5	\N	\N	2026-09-28 12:19:51.849355-03
b84005fe-1d47-4002-bc3d-6229e89762e1	088042a6-b718-4f2d-86a0-c84ab80bfff7	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	400	500	finished	7	\N	\N	2026-09-28 16:06:19.377225-03
f141aaec-3550-45fb-b691-fa15e59a0884	088042a6-b718-4f2d-86a0-c84ab80bfff7	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	390	500	finished	8	\N	\N	2026-09-28 16:06:19.377225-03
8681b722-7601-4712-a4da-b306af33a07c	8c9b59c0-9b0f-446c-8ff4-aeace36a40fb	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	500	500	finished	1	\N	\N	2026-09-29 15:04:12.914611-03
2c5c1fc8-c151-487a-9505-35fdf535cb8e	8c9b59c0-9b0f-446c-8ff4-aeace36a40fb	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	500	500	finished	1	\N	\N	2026-09-29 15:04:12.914611-03
226ba8c1-4f1a-413c-a5e2-16a8cc4a0f32	66774e52-2171-40db-9844-38f1bef74be6	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	500	500	finished	1	\N	\N	2026-09-29 16:26:20.650426-03
be0c1c94-09c5-4fc1-b329-8327bf0a7257	66774e52-2171-40db-9844-38f1bef74be6	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	500	500	finished	1	\N	\N	2026-09-29 16:26:20.650426-03
0a9d9448-09ca-4fe3-b4b1-a8bfd8266b5c	1db7a8c2-305d-4fc8-906a-372ad89409d8	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	360	500	finished	11	\N	\N	2026-09-28 17:13:37.381175-03
918e0e2d-9bb8-4451-9298-b14cdf428dd6	1db7a8c2-305d-4fc8-906a-372ad89409d8	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	350	500	finished	12	\N	\N	2026-09-28 17:13:37.381175-03
ebb1fb3b-1af7-474b-bdd2-0fe74a195e98	d652c4a1-a12c-4f10-9ffa-95ddec7021a5	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	500	500	finished	1	\N	\N	2026-09-29 09:00:39.320283-03
01523aa3-4788-4d8f-aae7-4783ea125dfd	d652c4a1-a12c-4f10-9ffa-95ddec7021a5	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	500	500	finished	1	\N	\N	2026-09-29 09:00:39.320283-03
6d52cbc4-44a9-463a-a5b6-4afd2230e09d	b9d2e850-da9d-4802-bf02-29b98e3a7465	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	500	500	finished	1	\N	\N	2026-09-29 09:01:00.333325-03
35d66d5b-e25e-4021-b788-61b01587e022	b9d2e850-da9d-4802-bf02-29b98e3a7465	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	440	500	finished	3	\N	\N	2026-09-29 09:01:00.333325-03
0e10b053-3684-488b-9eb4-4087d02461cb	8378a269-12a0-406f-b8eb-cf64f112ab64	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	500	500	finished	1	\N	\N	2026-09-29 15:03:22.80071-03
10525d6d-6028-4b02-95c1-220e8c7afe35	8378a269-12a0-406f-b8eb-cf64f112ab64	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	500	500	finished	1	\N	\N	2026-09-29 15:03:22.80071-03
5a81fff6-81a4-4919-bd99-a5851ad7449b	762c47fe-91ae-4216-b76f-585f32f37e00	c9287e4b-399d-4764-8bff-2e0ce7058dcb	4695594c-19e9-493f-86a9-dfe79941400e	aea6e59c-7626-4e57-964a-5bf49620b671	500	500	finished	1	\N	\N	2026-10-01 11:16:11.709039-03
013fa1a6-4d3a-4570-8393-19531d14b1cc	762c47fe-91ae-4216-b76f-585f32f37e00	c9287e4b-399d-4764-8bff-2e0ce7058dcb	4695594c-19e9-493f-86a9-dfe79941400e	e4feef99-4920-4c40-b3c2-1c3a31c62f08	500	500	finished	1	\N	\N	2026-10-01 11:16:11.709039-03
596942d8-89a0-4edd-b2d6-dd63846aa217	3c7a43a9-0b03-4dd9-a487-1fdc1ea1cfb8	c9287e4b-399d-4764-8bff-2e0ce7058dcb	4695594c-19e9-493f-86a9-dfe79941400e	aea6e59c-7626-4e57-964a-5bf49620b671	500	500	finished	1	\N	\N	2026-10-01 11:37:00.329459-03
469ac721-81a7-495a-a8e3-88df62546c77	3c7a43a9-0b03-4dd9-a487-1fdc1ea1cfb8	c9287e4b-399d-4764-8bff-2e0ce7058dcb	4695594c-19e9-493f-86a9-dfe79941400e	e4feef99-4920-4c40-b3c2-1c3a31c62f08	500	500	finished	1	\N	\N	2026-10-01 11:37:00.329459-03
bd04ae51-727b-422e-93fe-2239af790b7e	ea09b376-d26e-48d4-9dae-cfad4a4240ff	c9287e4b-399d-4764-8bff-2e0ce7058dcb	4695594c-19e9-493f-86a9-dfe79941400e	aea6e59c-7626-4e57-964a-5bf49620b671	500	500	finished	1	\N	\N	2026-10-01 14:43:52.035633-03
ffeafdf1-edfc-4d39-ab0d-7293de8339a0	ea09b376-d26e-48d4-9dae-cfad4a4240ff	c9287e4b-399d-4764-8bff-2e0ce7058dcb	4695594c-19e9-493f-86a9-dfe79941400e	e4feef99-4920-4c40-b3c2-1c3a31c62f08	500	500	finished	1	\N	\N	2026-10-01 14:43:52.035633-03
24971533-39de-439b-9fc1-7d2f86b399ce	cf639bb1-02f1-4d18-82d9-c3e434d9767e	c9287e4b-399d-4764-8bff-2e0ce7058dcb	4695594c-19e9-493f-86a9-dfe79941400e	aea6e59c-7626-4e57-964a-5bf49620b671	500	500	finished	1	\N	\N	2026-10-01 11:19:43.342437-03
fc5e71d4-3481-44d8-8d20-08d8a78af68d	cf639bb1-02f1-4d18-82d9-c3e434d9767e	c9287e4b-399d-4764-8bff-2e0ce7058dcb	4695594c-19e9-493f-86a9-dfe79941400e	e4feef99-4920-4c40-b3c2-1c3a31c62f08	500	500	finished	1	\N	\N	2026-10-01 11:19:43.342437-03
0c73b783-a8cc-49d3-bfb1-4459a3efb7ca	88fe7cc6-1d95-4f0e-9c75-a6873a74ffe0	c9287e4b-399d-4764-8bff-2e0ce7058dcb	4695594c-19e9-493f-86a9-dfe79941400e	aea6e59c-7626-4e57-964a-5bf49620b671	500	500	finished	1	\N	\N	2026-10-01 14:44:59.319494-03
3867316f-0119-41a8-8bc7-e421bc0451cb	88fe7cc6-1d95-4f0e-9c75-a6873a74ffe0	c9287e4b-399d-4764-8bff-2e0ce7058dcb	4695594c-19e9-493f-86a9-dfe79941400e	e4feef99-4920-4c40-b3c2-1c3a31c62f08	500	500	finished	1	\N	\N	2026-10-01 14:44:59.319494-03
43963a67-92dd-4632-8462-c3ed912bc73b	683a60b3-7ff5-4463-be95-5c09a37e5827	c9287e4b-399d-4764-8bff-2e0ce7058dcb	4695594c-19e9-493f-86a9-dfe79941400e	aea6e59c-7626-4e57-964a-5bf49620b671	500	500	finished	1	\N	\N	2026-10-01 15:04:08.041277-03
5b9732fe-49ba-43fd-a2b1-c5f7e47752f5	683a60b3-7ff5-4463-be95-5c09a37e5827	c9287e4b-399d-4764-8bff-2e0ce7058dcb	4695594c-19e9-493f-86a9-dfe79941400e	e4feef99-4920-4c40-b3c2-1c3a31c62f08	500	500	finished	1	\N	\N	2026-10-01 15:04:08.041277-03
eacdc531-3d15-49c2-844f-c212a7a9c908	d761a519-762d-42ef-abb2-8303e7611721	c9287e4b-399d-4764-8bff-2e0ce7058dcb	909bb418-82c5-4461-869e-72bc9bfbb3aa	e36f8423-3467-4c88-8d45-238400074aab	460	500	finished	3	\N	\N	2026-10-02 16:33:18.116375-03
74ade10f-5204-4fcb-8dba-4b029d30831e	d761a519-762d-42ef-abb2-8303e7611721	c9287e4b-399d-4764-8bff-2e0ce7058dcb	909bb418-82c5-4461-869e-72bc9bfbb3aa	647c6bb8-c2ee-4147-89bc-d632deff4d18	410	500	finished	4	\N	\N	2026-10-02 16:33:18.116375-03
\.


--
-- Data for Name: monsterCacaLeituras; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."monsterCacaLeituras" (id, partida_id, empresa_id, evento_id, brincadeira_id, checkpoint_id, crianca_id, time_id, uid, leitura_id, attack_type, damage, monster_hp_after, monster_defeated, version, scanned_at) FROM stdin;
\.


--
-- Data for Name: monsterCacaPartidas; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."monsterCacaPartidas" (id, empresa_id, evento_id, brincadeira_id, status, hp, max_hp, normal_damage, special_checkpoint_damage, special_attack_damage, special_checkpoint_id, winner_time_id, version, started_at, finished_at, created_at) FROM stdin;
0aaad036-b722-4d21-9dc5-065b88776907	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	f9de27d6-278c-4a9b-8056-2c158c066951	finished	500	500	10	30	50	9	\N	1	2026-08-28 15:45:56.127-03	2026-08-28 15:46:35.892644-03	2026-08-28 15:45:56.129614-03
762c47fe-91ae-4216-b76f-585f32f37e00	c9287e4b-399d-4764-8bff-2e0ce7058dcb	4695594c-19e9-493f-86a9-dfe79941400e	f9de27d6-278c-4a9b-8056-2c158c066951	finished	500	500	10	30	50	10	\N	1	2026-10-01 11:16:11.708-03	2026-10-01 11:17:12.917402-03	2026-10-01 11:16:11.709039-03
3c7a43a9-0b03-4dd9-a487-1fdc1ea1cfb8	c9287e4b-399d-4764-8bff-2e0ce7058dcb	4695594c-19e9-493f-86a9-dfe79941400e	f9de27d6-278c-4a9b-8056-2c158c066951	finished	500	500	10	30	50	12	\N	1	2026-10-01 11:37:00.332-03	2026-10-01 11:51:59.495323-03	2026-10-01 11:37:00.329459-03
ea09b376-d26e-48d4-9dae-cfad4a4240ff	c9287e4b-399d-4764-8bff-2e0ce7058dcb	4695594c-19e9-493f-86a9-dfe79941400e	f9de27d6-278c-4a9b-8056-2c158c066951	finished	500	500	10	30	50	12	\N	1	2026-10-01 14:43:52.04-03	2026-10-01 14:44:01.538009-03	2026-10-01 14:43:52.035633-03
ea5ac4e8-5530-4338-a13d-c7f26a945a97	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	f9de27d6-278c-4a9b-8056-2c158c066951	finished	500	500	10	30	50	9	\N	1	2026-09-02 10:34:04.208-03	2026-09-02 10:34:59.474313-03	2026-09-02 10:34:06.299836-03
9f45953a-de69-42ff-a9e5-42351ca68622	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	f9de27d6-278c-4a9b-8056-2c158c066951	finished	500	500	10	30	50	5	\N	1	2026-09-10 13:10:23.031-03	2026-09-10 13:11:29.990784-03	2026-09-10 13:10:23.0304-03
88fe7cc6-1d95-4f0e-9c75-a6873a74ffe0	c9287e4b-399d-4764-8bff-2e0ce7058dcb	4695594c-19e9-493f-86a9-dfe79941400e	f9de27d6-278c-4a9b-8056-2c158c066951	finished	500	500	10	30	50	10	\N	1	2026-10-01 14:44:59.324-03	2026-10-01 14:46:12.411224-03	2026-10-01 14:44:59.319494-03
f378e3a8-672e-4c6c-8edb-1839842c7c38	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	f9de27d6-278c-4a9b-8056-2c158c066951	finished	500	500	10	30	50	15	\N	3	2026-08-31 11:32:54.059-03	2026-09-15 16:52:15.090291-03	2026-08-31 11:32:54.061883-03
e8d02467-8852-4637-9c12-22e0d27d84f7	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	f9de27d6-278c-4a9b-8056-2c158c066951	finished	500	500	10	30	50	3	\N	1	2026-09-15 16:54:42.704-03	2026-09-15 16:55:50.143879-03	2026-09-15 16:54:42.615553-03
d761a519-762d-42ef-abb2-8303e7611721	c9287e4b-399d-4764-8bff-2e0ce7058dcb	909bb418-82c5-4461-869e-72bc9bfbb3aa	f9de27d6-278c-4a9b-8056-2c158c066951	finished	500	500	10	30	50	11	\N	1	2026-10-02 16:33:18.118-03	2026-10-02 16:39:58.701436-03	2026-10-02 16:33:18.116375-03
6c693efc-88a2-42d8-a525-8f1320aa4cad	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	f9de27d6-278c-4a9b-8056-2c158c066951	finished	500	500	10	30	50	15	\N	3	2026-08-31 09:46:12.008-03	2026-09-16 15:24:54.307374-03	2026-08-31 09:46:12.005178-03
0bca2a54-fe8c-4646-9a14-09f89ff7c706	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	f9de27d6-278c-4a9b-8056-2c158c066951	finished	500	500	10	30	50	9	\N	1	2026-09-18 09:56:07.507-03	2026-09-18 09:56:36.738063-03	2026-09-18 09:56:06.160419-03
85e55d30-09f4-4781-969d-e0a07ef0eefd	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	f9de27d6-278c-4a9b-8056-2c158c066951	finished	500	500	10	30	50	9	\N	1	2026-09-18 16:33:14.025-03	2026-09-18 16:33:32.224565-03	2026-09-18 16:33:12.540406-03
8f064fc7-f48c-4c50-8603-adb1d486efe2	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	f9de27d6-278c-4a9b-8056-2c158c066951	finished	500	500	10	30	50	15	\N	1	2026-09-21 08:44:28.289-03	2026-09-21 08:44:38.0829-03	2026-09-21 08:44:30.318791-03
e906a9e8-02b0-4c65-91e1-bf22c9e20708	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	f9de27d6-278c-4a9b-8056-2c158c066951	finished	500	500	10	30	50	3	\N	1	2026-09-23 17:45:40.796-03	2026-09-23 17:45:42.077229-03	2026-09-23 17:45:40.796789-03
fc51d236-3a7a-4ab3-8d63-843dc9512375	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	f9de27d6-278c-4a9b-8056-2c158c066951	finished	500	500	10	30	50	3	\N	1	2026-09-25 10:27:43.098-03	2026-09-25 10:27:53.512979-03	2026-09-25 10:27:43.098048-03
0fa1d523-434f-451f-859e-854272237906	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	f9de27d6-278c-4a9b-8056-2c158c066951	finished	500	500	10	30	50	9	\N	1	2026-09-25 10:54:58.729-03	2026-09-25 10:56:09.846099-03	2026-09-25 10:54:58.729918-03
b44395d9-d350-4930-a6e0-2d53fc8d5c0d	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	f9de27d6-278c-4a9b-8056-2c158c066951	finished	500	500	10	30	50	5	\N	1	2026-09-25 11:46:59.637-03	2026-09-25 11:53:09.11861-03	2026-09-25 11:46:59.636528-03
2044c05a-43c6-46e8-a87d-bc8c664e5dc1	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	f9de27d6-278c-4a9b-8056-2c158c066951	finished	500	500	10	30	50	9	\N	1	2026-09-25 11:57:28.792-03	2026-09-25 12:04:52.38239-03	2026-09-25 11:57:28.791069-03
3ddc7f55-7192-4fe0-8c6a-17e952dd74f5	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	f9de27d6-278c-4a9b-8056-2c158c066951	finished	500	500	10	30	50	15	\N	1	2026-09-25 13:54:28.979-03	2026-09-25 13:56:15.735968-03	2026-09-25 13:54:28.983435-03
7ed1ac78-98b5-4e6f-9be7-8104472609f3	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	f9de27d6-278c-4a9b-8056-2c158c066951	finished	500	500	10	30	50	9	\N	1	2026-09-28 12:19:51.849-03	2026-09-28 12:21:36.302134-03	2026-09-28 12:19:51.849355-03
d652c4a1-a12c-4f10-9ffa-95ddec7021a5	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	f9de27d6-278c-4a9b-8056-2c158c066951	finished	500	500	10	30	50	3	\N	1	2026-09-29 09:00:39.324-03	2026-09-29 09:00:43.158583-03	2026-09-29 09:00:39.320283-03
8378a269-12a0-406f-b8eb-cf64f112ab64	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	f9de27d6-278c-4a9b-8056-2c158c066951	finished	500	500	10	30	50	5	\N	1	2026-09-29 15:03:23.259-03	2026-09-29 15:04:05.746799-03	2026-09-29 15:03:22.80071-03
66774e52-2171-40db-9844-38f1bef74be6	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	f9de27d6-278c-4a9b-8056-2c158c066951	finished	500	500	10	30	50	5	\N	1	2026-09-29 16:26:20.649-03	2026-09-29 16:26:40.586796-03	2026-09-29 16:26:20.650426-03
monster-9ba04dda	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	f9de27d6-278c-4a9b-8056-2c158c066951	finished	100	100	10	25	50	15	\N	1	2026-08-28 15:26:55.328-03	2026-08-28 15:42:46.850503-03	2026-08-28 15:26:55.328-03
823aaa81-44ed-4d72-aec2-d1cc02846e32	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	f9de27d6-278c-4a9b-8056-2c158c066951	finished	500	500	10	30	50	15	\N	1	2026-08-28 16:41:39.792-03	2026-08-28 17:35:52.040187-03	2026-08-28 16:41:39.790921-03
cf639bb1-02f1-4d18-82d9-c3e434d9767e	c9287e4b-399d-4764-8bff-2e0ce7058dcb	4695594c-19e9-493f-86a9-dfe79941400e	f9de27d6-278c-4a9b-8056-2c158c066951	finished	500	500	10	30	50	12	\N	1	2026-10-01 11:19:43.341-03	2026-10-01 11:36:35.014687-03	2026-10-01 11:19:43.342437-03
a0409ce1-d7ef-4a15-8524-fc69afa9f8fb	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	f9de27d6-278c-4a9b-8056-2c158c066951	finished	500	500	10	30	50	3	\N	1	2026-08-31 11:31:50.833-03	2026-08-31 11:31:55.129902-03	2026-08-31 11:31:50.83522-03
654724c2-cb0c-46ef-9184-acb72a944c07	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	f9de27d6-278c-4a9b-8056-2c158c066951	finished	500	500	10	30	50	5	\N	1	2026-09-02 10:31:45.254-03	2026-09-02 10:33:43.100626-03	2026-09-02 10:31:47.325381-03
683a60b3-7ff5-4463-be95-5c09a37e5827	c9287e4b-399d-4764-8bff-2e0ce7058dcb	4695594c-19e9-493f-86a9-dfe79941400e	f9de27d6-278c-4a9b-8056-2c158c066951	finished	500	500	10	30	50	13	\N	1	2026-10-01 15:04:08.045-03	2026-10-01 15:05:49.696039-03	2026-10-01 15:04:08.041277-03
a7a47887-cc60-4413-8dad-4447e9d3b218	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	f9de27d6-278c-4a9b-8056-2c158c066951	finished	500	500	10	30	50	3	\N	1	2026-09-02 10:52:28.804-03	2026-09-02 10:52:44.756818-03	2026-09-02 10:52:30.932263-03
3249dcfd-1e4d-4a09-8f21-d6d43bf67f4a	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	f9de27d6-278c-4a9b-8056-2c158c066951	finished	500	500	10	30	50	9	\N	1	2026-09-15 08:45:08.066-03	2026-09-15 12:04:54.790192-03	2026-09-15 08:45:08.115872-03
c3953c8b-af1e-4cc7-a454-e097bfa265c0	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	f9de27d6-278c-4a9b-8056-2c158c066951	finished	500	500	10	30	50	9	\N	1	2026-09-16 11:16:35.056-03	2026-09-16 11:16:50.02807-03	2026-09-16 11:16:34.615128-03
65767144-09e9-4d6e-b8a7-54a65c161196	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	f9de27d6-278c-4a9b-8056-2c158c066951	finished	500	500	10	30	50	9	\N	1	2026-09-18 13:41:19.372-03	2026-09-18 13:41:32.77681-03	2026-09-18 13:41:19.374129-03
48b2b330-2d83-421f-be96-16840a579e44	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	f9de27d6-278c-4a9b-8056-2c158c066951	finished	500	500	10	30	50	5	\N	1	2026-09-18 16:47:44.654-03	2026-09-18 16:47:49.468628-03	2026-09-18 16:47:44.652983-03
3e35ec5a-b7e5-4997-a731-b06cccceaf7c	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	f9de27d6-278c-4a9b-8056-2c158c066951	finished	500	500	10	30	50	9	\N	1	2026-09-21 11:34:19.819-03	2026-09-21 11:35:23.776436-03	2026-09-21 11:34:21.775979-03
4f7afe70-74c4-4594-97c4-2dca10d91099	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	f9de27d6-278c-4a9b-8056-2c158c066951	finished	500	500	10	30	50	5	\N	1	2026-09-25 08:23:14.012-03	2026-09-25 08:27:06.521554-03	2026-09-25 08:23:14.009633-03
f522af1e-41a8-4110-abab-eea23e991e0a	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	f9de27d6-278c-4a9b-8056-2c158c066951	finished	500	500	10	30	50	9	\N	1	2026-09-25 10:53:39.626-03	2026-09-25 10:53:48.355626-03	2026-09-25 10:53:39.626511-03
da22c0b3-7641-4709-8135-01b2daa81c86	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	f9de27d6-278c-4a9b-8056-2c158c066951	finished	500	500	10	30	50	3	\N	1	2026-09-25 11:42:25.794-03	2026-09-25 11:43:40.992906-03	2026-09-25 11:42:25.794392-03
69ac454b-a080-4439-8cd6-cbe6f82862b6	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	f9de27d6-278c-4a9b-8056-2c158c066951	finished	500	500	10	30	50	15	\N	1	2026-09-25 11:53:25.749-03	2026-09-25 11:56:36.399258-03	2026-09-25 11:53:25.750293-03
455a3340-393c-4c7d-b35f-d4a6250b6973	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	f9de27d6-278c-4a9b-8056-2c158c066951	finished	500	500	10	30	50	15	\N	1	2026-09-25 13:40:53.718-03	2026-09-25 13:54:25.795367-03	2026-09-25 13:40:53.722079-03
800551cf-84ca-4d2d-a4ef-89720d7761df	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	f9de27d6-278c-4a9b-8056-2c158c066951	finished	500	500	10	30	50	5	\N	1	2026-09-25 15:47:13.265-03	2026-09-25 15:47:43.428847-03	2026-09-25 15:47:13.261387-03
088042a6-b718-4f2d-86a0-c84ab80bfff7	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	f9de27d6-278c-4a9b-8056-2c158c066951	finished	500	500	10	30	50	9	\N	1	2026-09-28 16:06:19.374-03	2026-09-28 16:34:30.328654-03	2026-09-28 16:06:19.377225-03
1db7a8c2-305d-4fc8-906a-372ad89409d8	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	f9de27d6-278c-4a9b-8056-2c158c066951	finished	500	500	10	30	50	3	\N	1	2026-09-28 17:13:37.384-03	2026-09-28 17:41:45.67115-03	2026-09-28 17:13:37.381175-03
b9d2e850-da9d-4802-bf02-29b98e3a7465	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	f9de27d6-278c-4a9b-8056-2c158c066951	finished	500	500	10	30	50	15	\N	1	2026-09-29 09:01:00.337-03	2026-09-29 09:02:37.587098-03	2026-09-29 09:01:00.333325-03
8c9b59c0-9b0f-446c-8ff4-aeace36a40fb	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	f9de27d6-278c-4a9b-8056-2c158c066951	finished	500	500	10	30	50	3	\N	1	2026-09-29 15:04:12.912-03	2026-09-29 15:05:06.729331-03	2026-09-29 15:04:12.914611-03
\.


--
-- Data for Name: pontoVerificacao; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."pontoVerificacao" ("checkpointId", "eventoId", nome, tipo, ip, zona, "corLed", points, status, "territorioDonoTimeId", "territorioTravadoAte", "territorioCooldownAte", "ultimoConquistadoEm", "criadoEm", "empresaId", "tagsAutorizadas", "ultimoVisto", location, proposito, "mapaX", "mapaY", "territorioDonosCriancaId") FROM stdin;
\.


--
-- Data for Name: pontuacoes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.pontuacoes ("pontuacaoId", "eventoId", "criancaId", "brincadeiraId", "checkpointId", pontos, "leituraId", "criadoEm", "empresaId") FROM stdin;
\.


--
-- Data for Name: pulseiras; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.pulseiras (codigo, status, crianca_id, created_at, empresa_id) FROM stdin;
\.


--
-- Data for Name: sessoesJogo; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."sessoesJogo" (id, evento_id, brincadeira_id, game_type, mode, status, started_at, finished_at, created_at, updated_at) FROM stdin;
db13e098-562a-4db6-8260-d7c32e2b91b7	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	treasure_hunt	\N	finished	2026-09-25 15:52:31.731377-03	2026-09-25 15:54:35.256428-03	2026-09-25 15:52:31.731377-03	2026-09-25 15:52:31.731377-03
9a5f5f02-f60b-4cec-87d6-51037b6cce8c	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	\N	finished	2026-09-22 11:38:42.973907-03	2026-09-22 11:39:11.555053-03	2026-09-22 11:38:42.973907-03	2026-09-22 11:38:42.973907-03
6fba31b1-56f5-48de-ac6c-4436ea2d35b6	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	\N	finished	2026-09-22 11:42:19.720106-03	2026-09-22 11:43:52.681875-03	2026-09-22 11:42:19.720106-03	2026-09-22 11:42:19.720106-03
6602f6ad-1010-4732-8653-79331b1b095d	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	team	finished	2026-09-25 15:54:35.260281-03	2026-09-25 15:54:37.887982-03	2026-09-25 15:54:35.260281-03	2026-09-25 15:54:35.260281-03
3fc0b2f3-e045-4e19-b829-737f87f788ea	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	\N	finished	2026-09-22 11:46:12.737324-03	2026-09-22 11:46:48.733301-03	2026-09-22 11:46:12.737324-03	2026-09-22 11:46:12.737324-03
726eaadb-8487-4a17-838b-597c2556f68b	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	\N	finished	2026-09-22 11:51:26.119203-03	2026-09-22 11:53:45.047867-03	2026-09-22 11:51:26.119203-03	2026-09-22 11:51:26.119203-03
fa999f24-0059-4a7c-9c28-bd71359aff80	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	f9de27d6-278c-4a9b-8056-2c158c066951	monster_hunt	\N	finished	2026-09-28 16:06:19.441907-03	2026-09-28 16:34:30.342942-03	2026-09-28 16:06:19.441907-03	2026-09-28 16:06:19.441907-03
44ae8953-6d44-43d8-88d0-4b09e1dceadd	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	zone_conquest	\N	finished	2026-09-22 12:08:41.067607-03	2026-09-22 12:08:58.006175-03	2026-09-22 12:08:41.067607-03	2026-09-22 12:08:41.067607-03
ea22333b-51b6-4358-a4b1-15f98a080fdc	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	zone_conquest	individual	finished	2026-09-22 13:33:56.069369-03	2026-09-22 13:34:26.024181-03	2026-09-22 13:33:56.069369-03	2026-09-22 13:33:56.069369-03
c68931b0-32e2-4f9c-9c39-b7e0c16de492	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	f9de27d6-278c-4a9b-8056-2c158c066951	monster_hunt	\N	finished	2026-09-28 17:13:37.43892-03	2026-09-28 17:41:45.68005-03	2026-09-28 17:13:37.43892-03	2026-09-28 17:13:37.43892-03
fa79ca45-da68-40a2-b309-918df3375381	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	zone_conquest	individual	finished	2026-09-22 13:47:46.989701-03	2026-09-22 13:47:56.225418-03	2026-09-22 13:47:46.989701-03	2026-09-22 13:47:46.989701-03
5968aabd-516f-40bc-9189-b768c0a6eae5	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	zone_conquest	individual	finished	2026-09-22 13:49:43.038087-03	2026-09-22 13:50:10.868433-03	2026-09-22 13:49:43.038087-03	2026-09-22 13:49:43.038087-03
c540f970-42b3-4f13-83ea-2a3f6e85de4d	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	f9de27d6-278c-4a9b-8056-2c158c066951	monster_hunt	\N	finished	2026-09-29 15:03:24.884417-03	2026-09-29 15:04:05.77044-03	2026-09-29 15:03:24.884417-03	2026-09-29 15:03:24.884417-03
50c05d1d-343d-4f12-9537-7a670ff29e09	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	zone_conquest	individual	finished	2026-09-25 08:21:20.397536-03	2026-09-25 08:22:08.35954-03	2026-09-25 08:21:20.397536-03	2026-09-25 08:21:20.397536-03
9218e6ca-fd08-43f0-8478-f208ec024cf8	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	zone_conquest	individual	finished	2026-09-25 08:29:12.763243-03	2026-09-25 08:30:27.427297-03	2026-09-25 08:29:12.763243-03	2026-09-25 08:29:12.763243-03
503b2e09-2c1f-461a-ac23-95149d5e11ef	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	treasure_hunt	\N	finished	2026-09-29 16:26:44.478814-03	2026-09-29 16:26:51.879712-03	2026-09-29 16:26:44.478814-03	2026-09-29 16:26:44.478814-03
ec52880a-d506-47f5-bb3c-1264ef544ba7	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	zone_conquest	individual	finished	2026-09-25 08:45:07.875296-03	2026-09-25 08:45:43.65013-03	2026-09-25 08:45:07.875296-03	2026-09-25 08:45:07.875296-03
61babd08-6e6b-41e5-be72-4d392da1179d	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	team	finished	2026-09-25 10:14:13.010755-03	2026-09-25 10:14:27.305099-03	2026-09-25 10:14:13.010755-03	2026-09-25 10:14:13.010755-03
930d576d-4914-4393-879f-bf7ab20c0e3d	4695594c-19e9-493f-86a9-dfe79941400e	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	team	finished	2026-10-01 08:22:01.710541-03	2026-10-01 08:22:28.300477-03	2026-10-01 08:22:01.710541-03	2026-10-01 08:22:01.710541-03
8a6d25a7-65ec-447a-8072-cbed3b290b16	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	treasure_hunt	team	finished	2026-09-25 10:27:59.653306-03	2026-09-25 10:28:19.333943-03	2026-09-25 10:27:59.653306-03	2026-09-25 10:27:59.653306-03
f95d1825-f565-4208-af09-f86405cfeafa	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	team	finished	2026-09-25 11:06:34.894933-03	2026-09-25 11:07:22.928147-03	2026-09-25 11:06:34.894933-03	2026-09-25 11:06:34.894933-03
e3e606c6-9d24-4409-8e7f-e5b12e50dae4	4695594c-19e9-493f-86a9-dfe79941400e	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	team	finished	2026-10-01 10:18:38.09242-03	2026-10-01 10:18:43.456008-03	2026-10-01 10:18:38.09242-03	2026-10-01 10:18:38.09242-03
37a56cec-6e35-445e-9e45-4022b5a7d2e5	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	zone_conquest	\N	finished	2026-09-25 13:56:22.464159-03	2026-09-25 13:57:09.719848-03	2026-09-25 13:56:22.464159-03	2026-09-25 13:56:22.464159-03
4ec340ae-2a47-470b-bb66-e4631371cff8	4695594c-19e9-493f-86a9-dfe79941400e	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	team	finished	2026-10-01 11:12:04.59118-03	2026-10-01 11:12:12.093853-03	2026-10-01 11:12:04.59118-03	2026-10-01 11:12:04.59118-03
b96efde2-867c-45bc-85e9-63743c6d8786	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	zone_conquest	individual	finished	2026-09-25 14:22:39.10074-03	2026-09-25 14:23:00.188042-03	2026-09-25 14:22:39.10074-03	2026-09-25 14:22:39.10074-03
d82c31a2-f272-472e-a100-f551262b560e	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	\N	finished	2026-09-21 11:28:01.668568-03	2026-09-21 13:46:40.84317-03	2026-09-21 11:28:01.668568-03	2026-09-21 11:28:01.668568-03
826dedf2-5e7b-4d94-a700-e54986bdc16e	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	zone_conquest	\N	finished	2026-09-21 11:31:54.801538-03	2026-09-21 13:46:40.84317-03	2026-09-21 11:31:54.801538-03	2026-09-21 11:31:54.801538-03
d24a6880-397f-4cfb-8027-81f03da6155c	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	\N	finished	2026-09-21 11:33:20.236801-03	2026-09-21 13:46:40.84317-03	2026-09-21 11:33:20.236801-03	2026-09-21 11:33:20.236801-03
765c4198-7b7f-47cd-9436-a74690184be3	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	f9de27d6-278c-4a9b-8056-2c158c066951	monster_hunt	\N	finished	2026-09-21 11:34:23.212333-03	2026-09-21 13:46:40.84317-03	2026-09-21 11:34:23.212333-03	2026-09-21 11:34:23.212333-03
4aee95e3-ae59-40d6-b208-045aec03b0d5	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	treasure_hunt	\N	finished	2026-09-21 11:35:37.576209-03	2026-09-21 13:46:40.84317-03	2026-09-21 11:35:37.576209-03	2026-09-21 11:35:37.576209-03
0cd57505-fbcf-42a2-a346-0c84ea1eea1c	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	\N	finished	2026-09-21 11:36:34.218006-03	2026-09-21 13:46:40.84317-03	2026-09-21 11:36:34.218006-03	2026-09-21 11:36:34.218006-03
5b8567f7-bcb6-4df3-9926-47d4dfbb4af1	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	\N	finished	2026-09-21 11:38:25.229522-03	2026-09-21 13:46:40.84317-03	2026-09-21 11:38:25.229522-03	2026-09-21 11:38:25.229522-03
d5bba0ee-2c4f-4167-bd4c-55be509bc3c8	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	\N	finished	2026-09-21 11:42:20.128172-03	2026-09-21 13:46:40.84317-03	2026-09-21 11:42:20.128172-03	2026-09-21 11:42:20.128172-03
d8afda94-d322-413e-b25d-9018653dc445	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	zone_conquest	individual	finished	2026-09-25 14:23:14.592561-03	2026-09-25 14:23:53.718596-03	2026-09-25 14:23:14.592561-03	2026-09-25 14:23:14.592561-03
92306001-c730-4520-8950-a62bb69fa8bf	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	zone_conquest	individual	finished	2026-09-25 14:37:32.36062-03	2026-09-25 14:38:32.609491-03	2026-09-25 14:37:32.36062-03	2026-09-25 14:37:32.36062-03
8f3ab98e-2e10-4314-9eaf-c4f4ac0133ab	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	zone_conquest	individual	finished	2026-09-25 14:43:28.610051-03	2026-09-25 14:43:51.063431-03	2026-09-25 14:43:28.610051-03	2026-09-25 14:43:28.610051-03
62ad89e5-0ec0-47e7-8d69-39d2feb6659b	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	team	finished	2026-09-25 14:50:56.386431-03	2026-09-25 14:51:26.465283-03	2026-09-25 14:50:56.386431-03	2026-09-25 14:50:56.386431-03
952a6860-79a0-40d7-bdcc-f1a7d1dee9a5	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	team	finished	2026-09-25 15:03:47.729243-03	2026-09-25 15:04:09.657939-03	2026-09-25 15:03:47.729243-03	2026-09-25 15:03:47.729243-03
42b4ece8-5829-40d3-90a2-134675bd8119	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	team	finished	2026-09-25 15:17:17.44541-03	2026-09-25 15:19:30.525537-03	2026-09-25 15:17:17.44541-03	2026-09-25 15:17:17.44541-03
d63793b4-54f9-462e-b868-0042ed3279bc	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	\N	finished	2026-09-21 11:44:45.262233-03	2026-09-21 13:46:40.84317-03	2026-09-21 11:44:45.262233-03	2026-09-21 11:44:45.262233-03
f644c7e8-ab04-4131-a6ab-749fbf8bfcd9	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	\N	finished	2026-09-21 11:46:32.564131-03	2026-09-21 13:46:40.84317-03	2026-09-21 11:46:32.564131-03	2026-09-21 11:46:32.564131-03
2eff904d-217c-4a7a-aa1b-fedf0d933f77	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	\N	finished	2026-09-21 11:48:13.529298-03	2026-09-21 13:46:40.84317-03	2026-09-21 11:48:13.529298-03	2026-09-21 11:48:13.529298-03
d6962e63-cee7-4078-9191-4be121e0786e	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	\N	finished	2026-09-21 11:53:56.846363-03	2026-09-21 13:46:40.84317-03	2026-09-21 11:53:56.846363-03	2026-09-21 11:53:56.846363-03
e7bfe422-e016-4624-a664-08b58aad88d1	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	\N	finished	2026-09-21 11:55:49.816997-03	2026-09-21 13:46:40.84317-03	2026-09-21 11:55:49.816997-03	2026-09-21 11:55:49.816997-03
6157e07e-545f-49e5-a00a-fe2f39c53c79	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	\N	finished	2026-09-21 12:00:16.92737-03	2026-09-21 13:46:40.84317-03	2026-09-21 12:00:16.92737-03	2026-09-21 12:00:16.92737-03
281b7fa0-6314-421e-b156-552d68d28477	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	\N	finished	2026-09-21 12:02:52.256536-03	2026-09-21 13:46:40.84317-03	2026-09-21 12:02:52.256536-03	2026-09-21 12:02:52.256536-03
80398158-455e-4d4b-8b0f-986e5f271382	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	\N	finished	2026-09-21 12:04:53.399624-03	2026-09-21 13:46:40.84317-03	2026-09-21 12:04:53.399624-03	2026-09-21 12:04:53.399624-03
b4323e43-c885-43b8-b9bd-d16c9efc39be	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	\N	finished	2026-09-21 12:05:40.481039-03	2026-09-21 13:46:40.84317-03	2026-09-21 12:05:40.481039-03	2026-09-21 12:05:40.481039-03
731f0aeb-529a-4334-87e4-1a2ffcbcb67b	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	\N	finished	2026-09-21 12:09:32.3894-03	2026-09-21 13:46:40.84317-03	2026-09-21 12:09:32.3894-03	2026-09-21 12:09:32.3894-03
4d23f46e-871b-4c08-a1b6-83a9a60c6e4a	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	\N	finished	2026-09-21 12:15:14.930178-03	2026-09-21 13:46:40.84317-03	2026-09-21 12:15:14.930178-03	2026-09-21 12:15:14.930178-03
ac934ebb-3268-4372-bf09-d06ae54da2ca	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	\N	finished	2026-09-21 12:18:30.807729-03	2026-09-21 13:46:40.84317-03	2026-09-21 12:18:30.807729-03	2026-09-21 12:18:30.807729-03
c04a3552-bb7a-446f-a294-3e6d000a68fc	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	\N	finished	2026-09-21 12:28:12.677419-03	2026-09-21 13:46:40.84317-03	2026-09-21 12:28:12.677419-03	2026-09-21 12:28:12.677419-03
d857de2d-916c-4979-a981-23dac9c58933	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	\N	finished	2026-09-21 13:12:10.601181-03	2026-09-21 13:46:40.84317-03	2026-09-21 13:12:10.601181-03	2026-09-21 13:12:10.601181-03
ddc4b799-1aed-451a-a7f8-87f3cccf0b26	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	\N	finished	2026-09-21 13:13:38.591166-03	2026-09-21 13:46:40.84317-03	2026-09-21 13:13:38.591166-03	2026-09-21 13:13:38.591166-03
3ea36dc5-d05c-4bdf-88ce-ec5349e0b89b	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	\N	finished	2026-09-21 13:15:35.593494-03	2026-09-21 13:46:40.84317-03	2026-09-21 13:15:35.593494-03	2026-09-21 13:15:35.593494-03
8f7aed7b-0d8f-48b7-a60d-19a2490ff0c2	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	\N	finished	2026-09-21 13:16:44.903786-03	2026-09-21 13:46:40.84317-03	2026-09-21 13:16:44.903786-03	2026-09-21 13:16:44.903786-03
b8a5302d-7f8d-45a5-8a1e-259e53153b17	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	\N	finished	2026-09-21 13:18:26.403301-03	2026-09-21 13:46:40.84317-03	2026-09-21 13:18:26.403301-03	2026-09-21 13:18:26.403301-03
7bfbb266-7828-4a49-93dc-7ed9fa7f4221	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	\N	finished	2026-09-21 13:21:28.767472-03	2026-09-21 13:46:40.84317-03	2026-09-21 13:21:28.767472-03	2026-09-21 13:21:28.767472-03
ff7b4a62-25f5-4673-8901-68f88144c5bd	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	\N	finished	2026-09-21 13:24:36.50224-03	2026-09-21 13:46:40.84317-03	2026-09-21 13:24:36.50224-03	2026-09-21 13:24:36.50224-03
fa2dd2c2-130d-4458-b45c-3da8f04ce8da	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	\N	finished	2026-09-21 13:32:06.270153-03	2026-09-21 13:46:40.84317-03	2026-09-21 13:32:06.270153-03	2026-09-21 13:32:06.270153-03
2e325b60-ff13-4a1c-9313-4aee27d1bd00	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	\N	finished	2026-09-21 13:35:01.016469-03	2026-09-21 13:46:40.84317-03	2026-09-21 13:35:01.016469-03	2026-09-21 13:35:01.016469-03
aabd05af-4717-40e9-b24d-75e09bc38186	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	treasure_hunt	\N	finished	2026-09-21 13:41:02.12755-03	2026-09-21 13:46:40.84317-03	2026-09-21 13:41:02.12755-03	2026-09-21 13:41:02.12755-03
d0f3bfeb-df33-418c-91d5-bebf167a84bf	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	\N	finished	2026-09-21 13:41:36.914711-03	2026-09-21 13:46:40.84317-03	2026-09-21 13:41:36.914711-03	2026-09-21 13:41:36.914711-03
101d4c89-23f8-4a83-84a1-ea7428283ce3	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	\N	finished	2026-09-21 13:45:51.891931-03	2026-09-21 13:46:40.84317-03	2026-09-21 13:45:51.891931-03	2026-09-21 13:45:51.891931-03
083761cc-055c-48db-91a2-44ab1af8aac3	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	\N	finished	2026-09-21 13:46:58.419972-03	2026-09-21 13:47:34.651109-03	2026-09-21 13:46:58.419972-03	2026-09-21 13:46:58.419972-03
602bf273-9ae3-48e5-bbfe-7e19fb675911	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	\N	finished	2026-09-21 13:50:19.123555-03	2026-09-21 13:50:42.614312-03	2026-09-21 13:50:19.123555-03	2026-09-21 13:50:19.123555-03
3ecc4b8a-53df-465e-8827-7077e658ad98	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	\N	finished	2026-09-21 13:56:15.553285-03	2026-09-21 13:57:28.667839-03	2026-09-21 13:56:15.553285-03	2026-09-21 13:56:15.553285-03
84f4077c-1013-4a97-bc64-eb0dbf9ef87c	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	\N	finished	2026-09-21 13:58:41.721606-03	2026-09-21 13:59:09.120967-03	2026-09-21 13:58:41.721606-03	2026-09-21 13:58:41.721606-03
6de137f6-d9fa-4d67-bf0b-dc671a6ffad9	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	\N	finished	2026-09-21 14:03:46.649448-03	2026-09-21 14:04:12.521619-03	2026-09-21 14:03:46.649448-03	2026-09-21 14:03:46.649448-03
dab43835-6528-42c0-9321-d947ee217370	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	\N	finished	2026-09-21 14:07:33.471261-03	2026-09-21 14:08:07.01535-03	2026-09-21 14:07:33.471261-03	2026-09-21 14:07:33.471261-03
c34effc1-1f39-473a-bf3f-13c12ebb0c31	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	\N	finished	2026-09-21 14:36:47.405676-03	2026-09-21 14:37:07.215538-03	2026-09-21 14:36:47.405676-03	2026-09-21 14:36:47.405676-03
ee798032-39bd-4e45-95be-6e5547fba5f9	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	\N	finished	2026-09-21 14:38:45.049691-03	2026-09-21 14:39:16.961052-03	2026-09-21 14:38:45.049691-03	2026-09-21 14:38:45.049691-03
09d8ff59-ad90-45b3-82ae-ba17a9350c83	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	\N	finished	2026-09-21 14:41:37.835138-03	2026-09-21 14:42:11.281651-03	2026-09-21 14:41:37.835138-03	2026-09-21 14:41:37.835138-03
0f8ad240-e9b0-4e99-b7fb-7a4b63cb2966	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	\N	finished	2026-09-21 14:43:48.697855-03	2026-09-21 14:45:02.015551-03	2026-09-21 14:43:48.697855-03	2026-09-21 14:43:48.697855-03
02a8bf37-832e-4305-a01f-47ab1444ff6e	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	\N	finished	2026-09-21 14:45:12.367641-03	2026-09-21 14:46:26.182931-03	2026-09-21 14:45:12.367641-03	2026-09-21 14:45:12.367641-03
53c4010f-9858-4941-b131-83e4f7d146f1	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	\N	finished	2026-09-21 14:46:34.471876-03	2026-09-21 14:47:35.318392-03	2026-09-21 14:46:34.471876-03	2026-09-21 14:46:34.471876-03
07350844-a3a6-4707-a108-abb6eb664260	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	\N	finished	2026-09-21 14:54:31.618525-03	2026-09-21 15:01:32.0628-03	2026-09-21 14:54:31.618525-03	2026-09-21 14:54:31.618525-03
a2814ca6-1f50-41b1-ba89-ed8fc8c77dca	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	\N	finished	2026-09-22 11:39:13.968234-03	2026-09-22 11:39:27.659766-03	2026-09-22 11:39:13.968234-03	2026-09-22 11:39:13.968234-03
6394d1c6-3ac0-4096-a606-1642917c1b90	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	\N	finished	2026-09-21 15:01:40.45307-03	2026-09-21 15:03:51.456641-03	2026-09-21 15:01:40.45307-03	2026-09-21 15:01:40.45307-03
c8803289-b09d-4cf3-bd4e-314a660966f7	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	team	finished	2026-09-25 15:54:40.717198-03	2026-09-25 15:55:52.196679-03	2026-09-25 15:54:40.717198-03	2026-09-25 15:54:40.717198-03
7fdf3f64-8a5a-49ff-9ad1-2bb4bd00d92e	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	\N	finished	2026-09-21 15:11:03.405872-03	2026-09-21 15:11:40.558085-03	2026-09-21 15:11:03.405872-03	2026-09-21 15:11:03.405872-03
2e1ccbff-d1e9-4e7b-b415-0e2ac95cb344	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	\N	finished	2026-09-22 11:43:56.687524-03	2026-09-22 11:44:09.344381-03	2026-09-22 11:43:56.687524-03	2026-09-22 11:43:56.687524-03
9fc3740d-3741-4aba-9c65-d4dbfaf9c332	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	\N	finished	2026-09-21 15:11:50.938325-03	2026-09-21 15:13:51.400311-03	2026-09-21 15:11:50.938325-03	2026-09-21 15:11:50.938325-03
786c08ad-896d-4db1-a0e6-0aab415c0d5d	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	f9de27d6-278c-4a9b-8056-2c158c066951	monster_hunt	\N	finished	2026-09-29 09:00:39.375969-03	2026-09-29 09:00:43.178934-03	2026-09-29 09:00:39.375969-03	2026-09-29 09:00:39.375969-03
0a81cbe7-9018-4918-b070-9198ccdf7915	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	\N	finished	2026-09-21 15:31:55.547922-03	2026-09-22 08:15:08.92582-03	2026-09-21 15:31:55.547922-03	2026-09-21 15:31:55.547922-03
6870f37e-6001-4705-9cde-f6516ab5f160	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	\N	finished	2026-09-22 11:48:28.010654-03	2026-09-22 11:48:35.125531-03	2026-09-22 11:48:28.010654-03	2026-09-22 11:48:28.010654-03
0841ea6c-9b38-45b2-be39-2bd104833f88	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	\N	finished	2026-09-22 11:59:54.785253-03	2026-09-22 11:59:59.508477-03	2026-09-22 11:59:54.785253-03	2026-09-22 11:59:54.785253-03
efeb753b-0dd2-42aa-920d-c2c27f75cd58	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	f9de27d6-278c-4a9b-8056-2c158c066951	monster_hunt	\N	finished	2026-09-29 09:01:00.385818-03	2026-09-29 09:02:37.603207-03	2026-09-29 09:01:00.385818-03	2026-09-29 09:01:00.385818-03
b5519c5f-f1e1-4355-9706-d490bcb74f88	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	\N	finished	2026-09-22 12:04:23.069227-03	2026-09-22 12:05:01.115563-03	2026-09-22 12:04:23.069227-03	2026-09-22 12:04:23.069227-03
2a2d50f6-bb63-4987-834e-693a0416a2ff	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	f9de27d6-278c-4a9b-8056-2c158c066951	monster_hunt	\N	finished	2026-09-29 15:04:12.966952-03	2026-09-29 15:05:06.750652-03	2026-09-29 15:04:12.966952-03	2026-09-29 15:04:12.966952-03
f27e18d6-4708-46ba-9a73-cfbf75ba63d8	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	zone_conquest	individual	finished	2026-09-22 12:13:02.782186-03	2026-09-22 12:13:45.609618-03	2026-09-22 12:13:02.782186-03	2026-09-22 12:13:02.782186-03
708ac203-7c30-4600-8d8a-8b88a0e4e9c5	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	team	finished	2026-09-29 16:26:55.576471-03	2026-09-29 16:27:18.174625-03	2026-09-29 16:26:55.576471-03	2026-09-29 16:26:55.576471-03
214018bf-d172-4d3e-9e80-2a76902360fd	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	zone_conquest	individual	finished	2026-09-22 12:16:31.757782-03	2026-09-22 12:16:49.476771-03	2026-09-22 12:16:31.757782-03	2026-09-22 12:16:31.757782-03
0a79add0-37f3-4fb2-b6b4-1b41631caa02	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	zone_conquest	individual	finished	2026-09-22 13:36:28.310821-03	2026-09-22 13:36:47.015452-03	2026-09-22 13:36:28.310821-03	2026-09-22 13:36:28.310821-03
b713c3fc-d95a-4e4d-96b6-6fa6e7419a56	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	zone_conquest	individual	finished	2026-09-29 16:27:21.567604-03	2026-09-29 16:27:59.668536-03	2026-09-29 16:27:21.567604-03	2026-09-29 16:27:21.567604-03
665a7829-5e64-42d2-96b2-b8c18c465602	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	zone_conquest	individual	finished	2026-09-22 13:39:12.323371-03	2026-09-22 13:39:34.33667-03	2026-09-22 13:39:12.323371-03	2026-09-22 13:39:12.323371-03
e1e3ef11-4483-41af-bfa7-594adc6e8af0	4695594c-19e9-493f-86a9-dfe79941400e	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	team	finished	2026-10-01 08:59:28.701287-03	2026-10-01 08:59:42.653451-03	2026-10-01 08:59:28.701287-03	2026-10-01 08:59:28.701287-03
2b3ff628-551d-4c6b-b9eb-6ce9b36e2018	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	zone_conquest	individual	finished	2026-09-22 13:52:49.728997-03	2026-09-22 13:53:34.403324-03	2026-09-22 13:52:49.728997-03	2026-09-22 13:52:49.728997-03
49f26a46-085b-4fb1-a6f6-69e4a59f39be	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	zone_conquest	individual	finished	2026-09-25 08:27:20.413454-03	2026-09-25 08:27:41.807951-03	2026-09-25 08:27:20.413454-03	2026-09-25 08:27:20.413454-03
2ea0ecaf-2923-4c8d-8675-c561cb9e4249	4695594c-19e9-493f-86a9-dfe79941400e	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	team	finished	2026-10-01 10:49:52.161978-03	2026-10-01 10:49:56.011607-03	2026-10-01 10:49:52.161978-03	2026-10-01 10:49:52.161978-03
8d733c50-4fe1-4298-8562-79e16fc881bd	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	zone_conquest	individual	finished	2026-09-25 08:33:40.522232-03	2026-09-25 08:34:17.737969-03	2026-09-25 08:33:40.522232-03	2026-09-25 08:33:40.522232-03
8f85c154-068d-4355-aca3-c055e0f055c4	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	zone_conquest	individual	finished	2026-09-25 08:37:46.051004-03	2026-09-25 08:38:28.43207-03	2026-09-25 08:37:46.051004-03	2026-09-25 08:37:46.051004-03
a946608a-4c4b-44b3-a095-d781de00f3e6	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	zone_conquest	individual	finished	2026-09-25 08:49:04.667108-03	2026-09-25 08:49:43.567248-03	2026-09-25 08:49:04.667108-03	2026-09-25 08:49:04.667108-03
c39f69c1-54d1-42b8-b6c0-0d5d622ecb74	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	zone_conquest	individual	finished	2026-09-25 08:53:17.425212-03	2026-09-25 08:53:40.556445-03	2026-09-25 08:53:17.425212-03	2026-09-25 08:53:17.425212-03
649dccaf-a14b-4be3-99c5-e92e139ae50a	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	zone_conquest	individual	finished	2026-09-25 10:25:00.734614-03	2026-09-25 10:25:20.353156-03	2026-09-25 10:25:00.734614-03	2026-09-25 10:25:00.734614-03
d724bb48-9368-45bb-a216-42f9aecfdf6d	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	team	finished	2026-09-25 10:25:23.356636-03	2026-09-25 10:25:42.569365-03	2026-09-25 10:25:23.356636-03	2026-09-25 10:25:23.356636-03
e2a372b7-08cf-4ea9-88c5-54b238faa149	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	zone_conquest	individual	finished	2026-09-25 10:28:32.736818-03	2026-09-25 10:28:51.212139-03	2026-09-25 10:28:32.736818-03	2026-09-25 10:28:32.736818-03
d4a0a9dd-930a-439d-8fb2-288d00cca336	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	team	finished	2026-09-25 10:45:48.087847-03	2026-09-25 10:50:34.9564-03	2026-09-25 10:45:48.087847-03	2026-09-25 10:45:48.087847-03
31cbd062-6242-4bfd-8093-8731e1d4b515	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	zone_conquest	individual	finished	2026-09-25 11:07:27.958314-03	2026-09-25 11:07:48.680358-03	2026-09-25 11:07:27.958314-03	2026-09-25 11:07:27.958314-03
539b0a1f-d415-40ca-8f46-40fc32d1b348	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	zone_conquest	individual	finished	2026-09-25 14:18:38.712757-03	2026-09-25 14:18:44.480213-03	2026-09-25 14:18:38.712757-03	2026-09-25 14:18:38.712757-03
5874448b-a795-4702-aeda-fbc758ccd0f7	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	zone_conquest	individual	finished	2026-09-25 14:23:56.355151-03	2026-09-25 14:24:59.566119-03	2026-09-25 14:23:56.355151-03	2026-09-25 14:23:56.355151-03
18f0b629-c27f-4c9a-95e0-fbe5a3e75fe3	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	team	finished	2026-09-25 14:44:01.653412-03	2026-09-25 14:44:41.344529-03	2026-09-25 14:44:01.653412-03	2026-09-25 14:44:01.653412-03
6bef315f-3043-4391-895b-8afeecf6abdf	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	team	finished	2026-09-25 14:57:51.243163-03	2026-09-25 14:58:43.456465-03	2026-09-25 14:57:51.243163-03	2026-09-25 14:57:51.243163-03
8933482c-3d65-4a33-a1df-4414c19da0c2	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	team	finished	2026-09-25 15:08:04.63267-03	2026-09-25 15:08:27.66361-03	2026-09-25 15:08:04.63267-03	2026-09-25 15:08:04.63267-03
54600fda-81ee-4127-9215-fb473b74ca3f	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	team	finished	2026-09-25 15:39:49.05717-03	2026-09-25 15:40:31.624226-03	2026-09-25 15:39:49.05717-03	2026-09-25 15:39:49.05717-03
892e1b40-a63c-4abd-9260-66ecc070d271	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	zone_conquest	individual	finished	2026-09-25 15:48:37.490269-03	2026-09-25 15:52:10.015606-03	2026-09-25 15:48:37.490269-03	2026-09-25 15:48:37.490269-03
9c6c4cb7-ec50-4366-aaf5-ae871b9168b8	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	\N	finished	2026-09-21 15:17:02.751076-03	2026-09-21 15:18:13.695981-03	2026-09-21 15:17:02.751076-03	2026-09-21 15:17:02.751076-03
0e67d067-6468-4173-a2f5-e53b4a044cfe	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	\N	finished	2026-09-21 15:26:07.590621-03	2026-09-21 15:27:01.556258-03	2026-09-21 15:26:07.590621-03	2026-09-21 15:26:07.590621-03
88c7a69b-cd04-4854-b371-8d88ef034532	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	zone_conquest	\N	finished	2026-09-22 11:39:30.778487-03	2026-09-22 11:40:14.59372-03	2026-09-22 11:39:30.778487-03	2026-09-22 11:39:30.778487-03
d1129e66-7792-4a3e-843d-8aa620b3a41b	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	\N	finished	2026-09-22 08:14:18.815779-03	2026-09-22 08:15:08.92582-03	2026-09-22 08:14:18.815779-03	2026-09-22 08:14:18.815779-03
9c66c927-e5d4-4060-b389-1091e53c7bcf	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	zone_conquest	individual	finished	2026-09-25 16:21:50.590352-03	2026-09-25 16:22:06.683452-03	2026-09-25 16:21:50.590352-03	2026-09-25 16:21:50.590352-03
bac34379-6f00-474c-aa57-0fdfeaec5bcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	\N	finished	2026-09-22 08:20:57.850903-03	2026-09-22 08:22:02.32401-03	2026-09-22 08:20:57.850903-03	2026-09-22 08:20:57.850903-03
28a9b8df-19a4-4058-981f-4ee1af2cb0a7	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	\N	finished	2026-09-22 11:44:11.929429-03	2026-09-22 11:44:28.104942-03	2026-09-22 11:44:11.929429-03	2026-09-22 11:44:11.929429-03
1e554ab4-a8ab-4c58-a292-b7e4c49b2f37	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	\N	finished	2026-09-22 11:29:51.273601-03	2026-09-22 11:30:46.215414-03	2026-09-22 11:29:51.273601-03	2026-09-22 11:29:51.273601-03
c4ab1b9e-1aab-45e0-8675-b285cc1d39ce	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	\N	finished	2026-09-22 11:32:36.17324-03	2026-09-22 11:33:21.142525-03	2026-09-22 11:32:36.17324-03	2026-09-22 11:32:36.17324-03
04b1b7c7-b64a-4abd-9b3e-37921718ea1a	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	\N	finished	2026-09-22 11:48:48.120952-03	2026-09-22 11:49:45.951186-03	2026-09-22 11:48:48.120952-03	2026-09-22 11:48:48.120952-03
f45b0864-f905-4a68-aab6-90952c9e1f37	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	\N	finished	2026-09-22 11:36:01.180838-03	2026-09-22 11:36:29.634322-03	2026-09-22 11:36:01.180838-03	2026-09-22 11:36:01.180838-03
11c533d8-15d5-40df-aa26-1161af5e1c1b	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	b58b6207-7348-40fe-b7fc-432212d08534	treasure_hunt	\N	finished	2026-09-29 09:00:46.375648-03	2026-09-29 09:00:52.419846-03	2026-09-29 09:00:46.375648-03	2026-09-29 09:00:46.375648-03
689c098b-36b9-49f9-a9db-7592444825a4	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	\N	finished	2026-09-22 11:58:38.371742-03	2026-09-22 11:59:24.20583-03	2026-09-22 11:58:38.371742-03	2026-09-22 11:58:38.371742-03
44407335-dbb7-4ae0-b9ad-f326aedd3f45	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	\N	finished	2026-09-22 12:05:03.320002-03	2026-09-22 12:06:02.698159-03	2026-09-22 12:05:03.320002-03	2026-09-22 12:05:03.320002-03
4ae422de-174a-4558-9992-ccde1eba571e	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	f9de27d6-278c-4a9b-8056-2c158c066951	monster_hunt	\N	finished	2026-09-29 16:26:20.742156-03	2026-09-29 16:26:40.604472-03	2026-09-29 16:26:20.742156-03	2026-09-29 16:26:20.742156-03
e062104f-d3fd-4d6d-8d8e-b90bea6dd657	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	zone_conquest	individual	finished	2026-09-22 13:33:30.457256-03	2026-09-22 13:33:42.780659-03	2026-09-22 13:33:30.457256-03	2026-09-22 13:33:30.457256-03
4b38ef63-ac0e-46f0-85f0-8b5007aa994e	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	zone_conquest	individual	finished	2026-09-22 13:41:35.672689-03	2026-09-22 13:41:49.867416-03	2026-09-22 13:41:35.672689-03	2026-09-22 13:41:35.672689-03
bc7f1ba9-945e-45c0-9280-029d76ee9224	4695594c-19e9-493f-86a9-dfe79941400e	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	team	finished	2026-09-30 18:05:48.240801-03	2026-09-30 18:06:01.296564-03	2026-09-30 18:05:48.240801-03	2026-09-30 18:05:48.240801-03
9765ea5e-7b61-42d3-9fd5-204cfb8fddd8	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	zone_conquest	individual	finished	2026-09-22 13:43:31.916617-03	2026-09-22 13:43:51.37138-03	2026-09-22 13:43:31.916617-03	2026-09-22 13:43:31.916617-03
0e60b048-4d3c-400c-8004-e7c95ae13a65	4695594c-19e9-493f-86a9-dfe79941400e	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	team	finished	2026-10-01 09:03:35.308805-03	2026-10-01 09:03:49.392838-03	2026-10-01 09:03:35.308805-03	2026-10-01 09:03:35.308805-03
12d8341a-e850-4aa0-ad27-0f291d70f694	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	zone_conquest	individual	finished	2026-09-22 13:45:21.387841-03	2026-09-22 13:45:36.650515-03	2026-09-22 13:45:21.387841-03	2026-09-22 13:45:21.387841-03
adb77ad2-d053-4288-811c-7908051f7534	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	zone_conquest	individual	finished	2026-09-22 14:05:32.745452-03	2026-09-22 14:05:53.304458-03	2026-09-22 14:05:32.745452-03	2026-09-22 14:05:32.745452-03
bb0b96f5-80e0-48f9-bd25-1b48701ef143	4695594c-19e9-493f-86a9-dfe79941400e	f9de27d6-278c-4a9b-8056-2c158c066951	monster_hunt	\N	finished	2026-10-01 11:16:11.822075-03	2026-10-01 11:17:12.935709-03	2026-10-01 11:16:11.822075-03	2026-10-01 11:16:11.822075-03
06a4eb8b-7647-48d2-81ec-7b0410db9bfa	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	zone_conquest	individual	finished	2026-09-22 14:06:03.072762-03	2026-09-22 14:06:26.745387-03	2026-09-22 14:06:03.072762-03	2026-09-22 14:06:03.072762-03
516ac0bc-650c-433c-8b4d-1986ab643590	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	zone_conquest	individual	finished	2026-09-25 08:27:49.902331-03	2026-09-25 08:28:36.117636-03	2026-09-25 08:27:49.902331-03	2026-09-25 08:27:49.902331-03
094b2d02-97d7-47cd-a4b9-b303b02fd70e	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	zone_conquest	individual	finished	2026-09-25 08:42:43.86924-03	2026-09-25 08:45:03.50661-03	2026-09-25 08:42:43.86924-03	2026-09-25 08:42:43.86924-03
fc1024bc-5f52-48c9-9777-3042439b58da	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	team	finished	2026-09-25 08:53:44.555635-03	2026-09-25 08:54:33.892235-03	2026-09-25 08:53:44.555635-03	2026-09-25 08:53:44.555635-03
120324b3-6181-4dfd-968d-c1c55fd05f4f	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	zone_conquest	individual	finished	2026-09-25 10:14:30.846677-03	2026-09-25 10:15:03.314566-03	2026-09-25 10:14:30.846677-03	2026-09-25 10:14:30.846677-03
bc404c43-8cca-4c6b-9c1a-324a23fafbc2	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	f9de27d6-278c-4a9b-8056-2c158c066951	monster_hunt	team	finished	2026-09-25 10:27:43.140249-03	2026-09-25 10:27:53.520364-03	2026-09-25 10:27:43.140249-03	2026-09-25 10:27:43.140249-03
26ae5149-c77d-430a-9085-99a03cefe3a8	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	team	finished	2026-09-25 10:56:12.4066-03	2026-09-25 10:57:20.273211-03	2026-09-25 10:56:12.4066-03	2026-09-25 10:56:12.4066-03
840b198e-9807-41eb-a05d-5984e37b33cb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	zone_conquest	\N	finished	2026-09-25 13:07:29.758792-03	2026-09-25 13:07:59.100553-03	2026-09-25 13:07:29.758792-03	2026-09-25 13:07:29.758792-03
cb530c91-df56-41b7-8b70-76b317af69fb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	zone_conquest	individual	finished	2026-09-25 14:18:47.112443-03	2026-09-25 14:19:10.952002-03	2026-09-25 14:18:47.112443-03	2026-09-25 14:18:47.112443-03
b18d1f16-1b5c-4b4b-89a9-d975e7ef0cdc	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	zone_conquest	individual	finished	2026-09-25 14:30:46.601945-03	2026-09-25 14:31:22.386693-03	2026-09-25 14:30:46.601945-03	2026-09-25 14:30:46.601945-03
d32ce845-5b59-4df4-8330-a2980ebbc783	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	team	finished	2026-09-25 14:50:38.744568-03	2026-09-25 14:50:53.27895-03	2026-09-25 14:50:38.744568-03	2026-09-25 14:50:38.744568-03
e8bdf9ac-5a9d-42c8-aa15-7916a61cdb74	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	zone_conquest	individual	finished	2026-09-25 14:58:46.97204-03	2026-09-25 14:59:36.121528-03	2026-09-25 14:58:46.97204-03	2026-09-25 14:58:46.97204-03
2fadb7cf-131c-43c6-a582-e4e445a50fb6	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	team	finished	2026-09-25 14:59:47.280578-03	2026-09-25 15:00:12.868183-03	2026-09-25 14:59:47.280578-03	2026-09-25 14:59:47.280578-03
efccfb5d-4992-4c2e-b755-08bd9526f525	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	team	finished	2026-09-25 15:07:52.553152-03	2026-09-25 15:08:01.854891-03	2026-09-25 15:07:52.553152-03	2026-09-25 15:07:52.553152-03
3cd3d1bc-6c08-4b88-aeb6-38225a20d7b0	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	team	finished	2026-09-25 15:12:56.726436-03	2026-09-25 15:13:36.920419-03	2026-09-25 15:12:56.726436-03	2026-09-25 15:12:56.726436-03
c67c3b50-c5ad-4a2d-9b6e-a57ee9a69868	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	f9de27d6-278c-4a9b-8056-2c158c066951	monster_hunt	\N	finished	2026-09-25 15:47:13.315918-03	2026-09-25 15:47:43.435943-03	2026-09-25 15:47:13.315918-03	2026-09-25 15:47:13.315918-03
18503b8b-bb8c-4a23-bc67-b2089bed02c9	4695594c-19e9-493f-86a9-dfe79941400e	f9de27d6-278c-4a9b-8056-2c158c066951	monster_hunt	\N	finished	2026-10-01 11:19:43.385887-03	2026-10-01 11:36:35.042127-03	2026-10-01 11:19:43.385887-03	2026-10-01 11:19:43.385887-03
6f1d7c80-fa02-400d-bd39-8c3e4902a73c	4695594c-19e9-493f-86a9-dfe79941400e	f9de27d6-278c-4a9b-8056-2c158c066951	monster_hunt	\N	finished	2026-10-01 11:37:00.381581-03	2026-10-01 11:51:59.528259-03	2026-10-01 11:37:00.381581-03	2026-10-01 11:37:00.381581-03
75fadff6-749d-4aaa-a9e6-808737a4fa18	4695594c-19e9-493f-86a9-dfe79941400e	f9de27d6-278c-4a9b-8056-2c158c066951	monster_hunt	\N	finished	2026-10-01 14:43:52.115241-03	2026-10-01 14:44:01.571288-03	2026-10-01 14:43:52.115241-03	2026-10-01 14:43:52.115241-03
7dbf1f67-7c87-4ccf-9186-a63c28bb2692	4695594c-19e9-493f-86a9-dfe79941400e	f9de27d6-278c-4a9b-8056-2c158c066951	monster_hunt	\N	finished	2026-10-01 14:44:59.366043-03	2026-10-01 14:46:12.434955-03	2026-10-01 14:44:59.366043-03	2026-10-01 14:44:59.366043-03
9439c202-549e-4e4f-9cac-961930537981	4695594c-19e9-493f-86a9-dfe79941400e	b58b6207-7348-40fe-b7fc-432212d08534	treasure_hunt	\N	finished	2026-10-01 14:46:21.356122-03	2026-10-01 14:53:06.787084-03	2026-10-01 14:46:21.356122-03	2026-10-01 14:46:21.356122-03
b9ab2197-9ae2-4af1-ad1b-670800872bbb	4695594c-19e9-493f-86a9-dfe79941400e	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	team	finished	2026-10-01 14:53:20.834009-03	2026-10-01 14:55:05.761179-03	2026-10-01 14:53:20.834009-03	2026-10-01 14:53:20.834009-03
009ddac4-ecd8-467f-97ea-83967bb36d2c	4695594c-19e9-493f-86a9-dfe79941400e	f9de27d6-278c-4a9b-8056-2c158c066951	monster_hunt	\N	finished	2026-10-01 15:04:08.093966-03	2026-10-01 15:05:49.715033-03	2026-10-01 15:04:08.093966-03	2026-10-01 15:04:08.093966-03
73eb75ad-6dad-4645-85ad-babc59883206	909bb418-82c5-4461-869e-72bc9bfbb3aa	f9de27d6-278c-4a9b-8056-2c158c066951	monster_hunt	\N	finished	2026-10-02 16:33:18.215694-03	2026-10-02 16:39:58.729063-03	2026-10-02 16:33:18.215694-03	2026-10-02 16:33:18.215694-03
040638f0-4376-4a2c-b7a1-4b8c2ca877c7	c920334b-c141-47ea-a791-dd2c9828be58	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	team	finished	2026-10-05 13:49:23.118862-03	2026-10-05 13:49:32.58101-03	2026-10-05 13:49:23.118862-03	2026-10-05 13:49:23.118862-03
9689d552-0d6d-4a80-ba87-b7b37cc920f5	c920334b-c141-47ea-a791-dd2c9828be58	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	zone_conquest	team	finished	2026-10-05 13:50:26.55788-03	2026-10-05 13:51:42.545813-03	2026-10-05 13:50:26.55788-03	2026-10-05 13:50:26.55788-03
24fa6e8b-a9eb-4a87-a13a-a046d7e2718e	c920334b-c141-47ea-a791-dd2c9828be58	6da6e7f8-0358-41e4-8dcd-253df10242bf	zone_conquest	individual	finished	2026-10-05 13:51:53.299363-03	2026-10-05 13:52:32.229405-03	2026-10-05 13:51:53.299363-03	2026-10-05 13:51:53.299363-03
256a4b8e-fe8a-413a-80db-77a0b009161c	c920334b-c141-47ea-a791-dd2c9828be58	b58b6207-7348-40fe-b7fc-432212d08534	treasure_hunt	\N	finished	2026-10-05 13:52:46.731053-03	2026-10-05 13:55:25.926529-03	2026-10-05 13:52:46.731053-03	2026-10-05 13:52:46.731053-03
\.


--
-- Data for Name: times; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.times ("timeId", evento_id, nome, cor, pontos, created_at, empresa_id) FROM stdin;
aea6e59c-7626-4e57-964a-5bf49620b671	4695594c-19e9-493f-86a9-dfe79941400e	Time 1	#0000FF	10	2026-10-01 11:14:08.887051-03	c9287e4b-399d-4764-8bff-2e0ce7058dcb
ABE94F1C-C463-43D7-A4FF-82B2ED69086E	1D7AA6F2-1438-4813-B4ED-4039AC985536	Time Azul	#0000FF	0	2026-07-13 09:20:29.2-03	\N
3e781f1a-bd88-426c-b2de-d47f2489cc65	c920334b-c141-47ea-a791-dd2c9828be58	Time 1	#1d7312	40	2026-10-05 09:48:51.909695-03	c9287e4b-399d-4764-8bff-2e0ce7058dcb
745f9a93-1cf4-4c27-bbb8-553ecdf93af4	cb2c9907-c412-4cf3-9b36-59b41e5e9d0b	Aguas	#00FFFF	0	2026-07-28 14:43:48.906894-03	c9287e4b-399d-4764-8bff-2e0ce7058dcb
fa43ca59-2c7f-4c9c-a876-89a00bb59203	cb2c9907-c412-4cf3-9b36-59b41e5e9d0b	Flores	#AA00FF	0	2026-07-28 14:44:01.232397-03	c9287e4b-399d-4764-8bff-2e0ce7058dcb
697df292-ec0f-40e5-97d5-1c77c6e539ff	c920334b-c141-47ea-a791-dd2c9828be58	Time 2	#81137d	280	2026-10-05 09:49:04.724429-03	c9287e4b-399d-4764-8bff-2e0ce7058dcb
647c6bb8-c2ee-4147-89bc-d632deff4d18	909bb418-82c5-4461-869e-72bc9bfbb3aa	Time 2	#FF0000	660	2026-10-02 15:12:42.328295-03	c9287e4b-399d-4764-8bff-2e0ce7058dcb
a8238112-f78c-4a80-95d3-4d18336f1318	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	CAVALEIROS	#FF6600	260	2026-07-20 11:52:36.263-03	c9287e4b-399d-4764-8bff-2e0ce7058dcb
ee6e06c5-e771-4390-b4ae-f038bf55edeb	\N	Time dos Monstros	#CD2323	0	2026-10-05 10:44:40.937099-03	c9287e4b-399d-4764-8bff-2e0ce7058dcb
aed1ada8-5e5f-4a9e-a07d-1ada4e392f48	\N	Time dos Heróis	#1B05C2	0	2026-10-05 10:45:11.338859-03	c9287e4b-399d-4764-8bff-2e0ce7058dcb
a860b67a-3be9-420f-a280-3ff62e71134a	c920334b-c141-47ea-a791-dd2c9828be58	Time dos Monstros	#CD2323	0	2026-10-05 11:30:24.868085-03	c9287e4b-399d-4764-8bff-2e0ce7058dcb
c96225d3-39b8-4f3c-ad62-2f958dab2e9e	c920334b-c141-47ea-a791-dd2c9828be58	Time dos Heróis	#1B05C2	0	2026-10-05 11:30:24.868085-03	c9287e4b-399d-4764-8bff-2e0ce7058dcb
e4feef99-4920-4c40-b3c2-1c3a31c62f08	4695594c-19e9-493f-86a9-dfe79941400e	Time 2	#FF0000	0	2026-10-01 11:14:13.761959-03	c9287e4b-399d-4764-8bff-2e0ce7058dcb
3218d5b4-372e-424e-9d91-dedea2b741f3	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	AGUIAS	#651881	420	2026-07-17 11:13:34.147-03	c9287e4b-399d-4764-8bff-2e0ce7058dcb
e36f8423-3467-4c88-8d45-238400074aab	909bb418-82c5-4461-869e-72bc9bfbb3aa	Time azul	#0000FF	70	2026-10-02 11:52:52.756485-03	c9287e4b-399d-4764-8bff-2e0ce7058dcb
\.


--
-- Data for Name: vinculoFamiliar; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."vinculoFamiliar" ("vinculoId", "loginId", "criancaId", "empresaId", relacionamento, status, "aprovadoPor", "aprovadoEm", "rejeitadoEm", "criadoEm") FROM stdin;
1095aa60-2228-4728-94cf-4096bfb2a694	218e9825-52fe-410d-9f0b-830bba985938	21270cc5-202f-4600-a6d0-c5acb1819c8b	c9287e4b-399d-4764-8bff-2e0ce7058dcb	responsável	approved	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-22 15:45:58.352903-03	\N	2026-09-22 14:32:29.766765-03
99a59917-2cce-43d7-8bee-93662eabd894	4ddf6bfd-072a-4bbe-b76a-d1681b0d2d13	b35dc997-34bf-4a71-8297-3867588be4cc	c9287e4b-399d-4764-8bff-2e0ce7058dcb	responsável	approved	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-22 15:45:59.831842-03	\N	2026-09-22 15:45:39.555267-03
62e88025-5b4e-4c7e-979b-c847a42abd13	c7234ca6-a5c5-403a-9528-45d964859785	3702367e-e183-4b87-8f7c-30bcba0df56f	c9287e4b-399d-4764-8bff-2e0ce7058dcb	responsável	approved	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-22 15:46:02.237308-03	\N	2026-09-22 14:35:15.224555-03
8469288b-5149-477d-a060-d4fc371dfd77	86fc3d17-3592-4c10-adb5-7e92a8ed0c21	c9a7d7a2-56b3-4ba5-801a-aacee92fd45a	c9287e4b-399d-4764-8bff-2e0ce7058dcb	responsável	rejected	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-15 17:12:55.894992-03	2026-09-22 11:49:33.498674-03	2026-09-15 16:43:27.700415-03
ed4a7b8d-fb97-4f4d-9f54-9bf9781fffb5	86fc3d17-3592-4c10-adb5-7e92a8ed0c21	5c02da21-8385-41e7-9f76-990d313adeef	c9287e4b-399d-4764-8bff-2e0ce7058dcb	responsável	rejected	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-15 17:12:58.836786-03	2026-09-22 11:49:34.924093-03	2026-09-15 17:00:54.90748-03
88177713-8509-487e-8823-94f3a0158733	b86f2f81-c54c-4618-a3eb-913c35fbc099	95084f3d-0f22-40f1-9092-75637c64d23a	c9287e4b-399d-4764-8bff-2e0ce7058dcb	responsável	approved	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-22 14:23:51.994712-03	\N	2026-09-22 14:19:08.784225-03
952d1a16-1eec-4f8d-a61d-b9f44e8cb544	b86f2f81-c54c-4618-a3eb-913c35fbc099	843c8267-a16c-4753-8bc8-dc7d22c89978	c9287e4b-399d-4764-8bff-2e0ce7058dcb	responsável	rejected	\N	\N	2026-09-22 14:24:01.499146-03	2026-09-22 14:21:10.044631-03
6c769012-a95c-45f4-a23e-3e8f8bbc1c70	86fc3d17-3592-4c10-adb5-7e92a8ed0c21	fc46b33d-f0fd-4ec2-8533-47026eccf79a	c9287e4b-399d-4764-8bff-2e0ce7058dcb	responsável	rejected	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-15 17:12:57.929845-03	2026-09-29 16:55:38.68689-03	2026-09-15 16:58:59.921012-03
3521a4d2-784d-4a6a-975f-54d224eb7b19	cf62d6f3-ddfe-4985-a9e8-5f733abe0bfd	816a3a4f-8146-448c-bddb-c4e58ba7c9d9	c9287e4b-399d-4764-8bff-2e0ce7058dcb	responsável	rejected	\N	\N	2026-09-29 16:55:40.175699-03	2026-09-25 15:36:52.073251-03
7dbdf223-a2fb-4c17-8da2-1efe15bbfabd	d88ce8f9-5e2a-4419-8d2a-d960135538a0	fc46b33d-f0fd-4ec2-8533-47026eccf79a	c9287e4b-399d-4764-8bff-2e0ce7058dcb	responsável	approved	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-29 17:18:37.286625-03	\N	2026-09-29 17:08:23.106171-03
58acc3fa-ca4b-46b9-9330-7b22dfaf7649	86fc3d17-3592-4c10-adb5-7e92a8ed0c21	1fd20c90-b3c8-4bc9-a556-fa88cea6865f	c9287e4b-399d-4764-8bff-2e0ce7058dcb	responsável	inactive	\N	\N	\N	2026-09-29 17:20:45.846337-03
e1d808a0-733a-48cc-98fa-2e23e0ec94ac	86fc3d17-3592-4c10-adb5-7e92a8ed0c21	2b46479e-8673-4461-b4dc-1c3a278a15e4	c9287e4b-399d-4764-8bff-2e0ce7058dcb	responsável	inactive	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-10-01 15:03:31.773876-03	\N	2026-10-01 15:00:41.794517-03
75b47641-66af-48e9-8566-68bd2302839d	554533a9-a324-42ee-8b30-21818c666ed7	5791eb07-e3f1-4233-aa7c-e3a93afa5502	c9287e4b-399d-4764-8bff-2e0ce7058dcb	responsável	approved	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-09-29 10:19:16.695739-03	\N	2026-09-29 10:18:52.497268-03
1daafab0-e0c9-4480-9585-15610787f74c	86fc3d17-3592-4c10-adb5-7e92a8ed0c21	749fc814-f8ec-4587-b1fb-4df04cf71a75	c9287e4b-399d-4764-8bff-2e0ce7058dcb	responsável	inactive	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-10-01 15:10:41.502332-03	\N	2026-09-15 16:44:57.696839-03
9bd84446-4b92-4421-bb91-f631fb1c82c4	eb308270-a0ea-46d5-a252-ad4847957d92	36130719-fb5c-4bad-aec2-2d95d27ac770	c9287e4b-399d-4764-8bff-2e0ce7058dcb	responsável	inactive	\N	\N	\N	2026-10-02 12:24:38.93426-03
830df108-8069-410b-a213-5d9c4460169b	86fc3d17-3592-4c10-adb5-7e92a8ed0c21	eab8abf2-ed02-4299-b063-980a9c966ec3	c9287e4b-399d-4764-8bff-2e0ce7058dcb	responsável	approved	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-10-02 16:57:12.786863-03	\N	2026-10-02 16:55:55.92317-03
af21ed15-d1fc-4d87-b7db-e59051abf586	eb308270-a0ea-46d5-a252-ad4847957d92	eab8abf2-ed02-4299-b063-980a9c966ec3	c9287e4b-399d-4764-8bff-2e0ce7058dcb	responsável	approved	f382c9d4-9c90-4369-baac-8feb8b5316c3	2026-10-02 16:58:13.48242-03	\N	2026-10-02 15:21:28.207163-03
\.


--
-- Data for Name: zonas; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.zonas ("zonaId", evento_id, nome, cor, x, y, width, height, created_at) FROM stdin;
\.


--
-- Data for Name: zonasConquistaEstadosCheckpoint; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."zonasConquistaEstadosCheckpoint" (id, partida_id, empresa_id, evento_id, checkpoint_id, current_owner_id, owner_type, protected_until, last_conquered_at, conquest_count, created_at, updated_at) FROM stdin;
31303638-98af-4d4f-8881-9d3869c5061f	413a7d61-093a-4cc3-96d2-3f67f48c7450	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	9	\N	team	\N	\N	0	2026-09-21 10:25:23.871822-03	2026-09-21 10:25:23.871822-03
a8a1cefa-48fd-4ab0-b2e0-4732aa3c2c20	413a7d61-093a-4cc3-96d2-3f67f48c7450	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3	\N	team	\N	\N	0	2026-09-21 10:25:23.871822-03	2026-09-21 10:25:23.871822-03
4ba1f2d9-c71f-46e7-b4b5-06c087ed19db	413a7d61-093a-4cc3-96d2-3f67f48c7450	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6	\N	team	\N	\N	0	2026-09-21 10:25:23.871822-03	2026-09-21 10:25:23.871822-03
dee92788-89fa-4af8-9c61-07eda902f9fa	413a7d61-093a-4cc3-96d2-3f67f48c7450	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	5	\N	team	\N	\N	0	2026-09-21 10:25:23.871822-03	2026-09-21 10:25:23.871822-03
b0ea07dd-b4a5-475c-afdc-b0c92400d882	413a7d61-093a-4cc3-96d2-3f67f48c7450	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	15	\N	team	\N	\N	0	2026-09-21 10:25:23.871822-03	2026-09-21 10:25:23.871822-03
a9d3d92f-d7e6-4aac-ab73-d3a22e5e55e0	413a7d61-093a-4cc3-96d2-3f67f48c7450	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	4	\N	team	\N	\N	0	2026-09-21 10:25:23.871822-03	2026-09-21 10:25:23.871822-03
886c104f-e681-447c-9478-c816cff380fd	e27b9bdf-4b17-4b38-b1d6-27d4c4e967ae	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	9	\N	team	\N	\N	0	2026-09-21 10:32:03.415908-03	2026-09-21 10:32:03.415908-03
8a40f6a2-57bc-49d3-838d-f39481b58329	e27b9bdf-4b17-4b38-b1d6-27d4c4e967ae	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6	\N	team	\N	\N	0	2026-09-21 10:32:03.415908-03	2026-09-21 10:32:03.415908-03
3f489821-a994-49b3-98cc-d9ddfc69f885	e27b9bdf-4b17-4b38-b1d6-27d4c4e967ae	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3	\N	team	\N	\N	0	2026-09-21 10:32:03.415908-03	2026-09-21 10:32:03.415908-03
e83a0e1b-51ee-4608-824f-e715649ed368	e27b9bdf-4b17-4b38-b1d6-27d4c4e967ae	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	15	\N	team	\N	\N	0	2026-09-21 10:32:03.415908-03	2026-09-21 10:32:03.415908-03
ff4823f3-94d9-43e2-9e1e-8fef2636100b	e27b9bdf-4b17-4b38-b1d6-27d4c4e967ae	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	4	\N	team	\N	\N	0	2026-09-21 10:32:03.415908-03	2026-09-21 10:32:03.415908-03
f522afd3-f288-4bc3-82c6-a0476af68f8a	e27b9bdf-4b17-4b38-b1d6-27d4c4e967ae	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	5	\N	team	\N	\N	0	2026-09-21 10:32:03.415908-03	2026-09-21 10:32:03.415908-03
9013e14b-15de-4020-b8d2-1e5fc104879f	8e759d84-9f3d-4954-9e1a-c3c65823ace5	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6	\N	team	\N	\N	0	2026-09-21 10:33:59.865033-03	2026-09-21 10:33:59.865033-03
42268e4e-bf88-4839-be5b-c7fb6d0ff58d	8e759d84-9f3d-4954-9e1a-c3c65823ace5	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3	\N	team	\N	\N	0	2026-09-21 10:33:59.865033-03	2026-09-21 10:33:59.865033-03
20f7089c-b58c-4139-83cb-40bc47ba36e7	8e759d84-9f3d-4954-9e1a-c3c65823ace5	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	9	\N	team	\N	\N	0	2026-09-21 10:33:59.865033-03	2026-09-21 10:33:59.865033-03
91c0d2c2-2bd4-4888-8cd8-9ddf288d81d4	8e759d84-9f3d-4954-9e1a-c3c65823ace5	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	5	\N	team	\N	\N	0	2026-09-21 10:33:59.865033-03	2026-09-21 10:33:59.865033-03
a2b91aae-c57b-4019-a835-00ae9a4562d8	8e759d84-9f3d-4954-9e1a-c3c65823ace5	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	4	\N	team	\N	\N	0	2026-09-21 10:33:59.865033-03	2026-09-21 10:33:59.865033-03
983ae80d-62a2-455e-9b5e-bcd1e1600337	8e759d84-9f3d-4954-9e1a-c3c65823ace5	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	15	\N	team	\N	\N	0	2026-09-21 10:33:59.865033-03	2026-09-21 10:33:59.865033-03
e0a083d2-cd92-4d2a-a192-30761bc602af	880572aa-0f11-4eb5-9449-c9ad1c28e387	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	9	\N	team	\N	\N	0	2026-09-21 10:42:55.775957-03	2026-09-21 10:42:55.775957-03
3df09edf-9a98-43d1-9cda-4ca1e50c0c5a	880572aa-0f11-4eb5-9449-c9ad1c28e387	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6	\N	team	\N	\N	0	2026-09-21 10:42:55.775957-03	2026-09-21 10:42:55.775957-03
df6265c1-b26d-4667-920b-4667d90deb55	880572aa-0f11-4eb5-9449-c9ad1c28e387	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3	\N	team	\N	\N	0	2026-09-21 10:42:55.775957-03	2026-09-21 10:42:55.775957-03
e12ac248-1a68-40d6-a353-eeada43eb1db	880572aa-0f11-4eb5-9449-c9ad1c28e387	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	15	\N	team	\N	\N	0	2026-09-21 10:42:55.775957-03	2026-09-21 10:42:55.775957-03
3bbcc854-2549-437e-9d4e-fd552fd0dcd6	880572aa-0f11-4eb5-9449-c9ad1c28e387	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	5	\N	team	\N	\N	0	2026-09-21 10:42:55.775957-03	2026-09-21 10:42:55.775957-03
ecde6a4c-94ca-4526-a772-c8db8f416cba	880572aa-0f11-4eb5-9449-c9ad1c28e387	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	4	\N	team	\N	\N	0	2026-09-21 10:42:55.775957-03	2026-09-21 10:42:55.775957-03
08af228a-2974-47ec-a8b4-899076329353	16b1c1e4-edb1-4229-bade-61ff312c41da	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6	\N	team	\N	\N	0	2026-09-21 10:43:34.934049-03	2026-09-21 10:43:34.934049-03
faa69c56-20a1-4eda-99ab-9615b10a1016	16b1c1e4-edb1-4229-bade-61ff312c41da	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	9	\N	team	\N	\N	0	2026-09-21 10:43:34.934049-03	2026-09-21 10:43:34.934049-03
0e8ec14a-2612-4d24-9cc9-7050a5c8baa3	16b1c1e4-edb1-4229-bade-61ff312c41da	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3	\N	team	\N	\N	0	2026-09-21 10:43:34.934049-03	2026-09-21 10:43:34.934049-03
def8c73f-3c7b-4171-afd6-99f1a8394562	16b1c1e4-edb1-4229-bade-61ff312c41da	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	5	\N	team	\N	\N	0	2026-09-21 10:43:34.934049-03	2026-09-21 10:43:34.934049-03
b7220206-580f-433b-9992-2a1423cc5258	16b1c1e4-edb1-4229-bade-61ff312c41da	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	15	\N	team	\N	\N	0	2026-09-21 10:43:34.934049-03	2026-09-21 10:43:34.934049-03
ef68bee5-df74-42a7-823d-4340c401d83b	16b1c1e4-edb1-4229-bade-61ff312c41da	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	4	\N	team	\N	\N	0	2026-09-21 10:43:34.934049-03	2026-09-21 10:43:34.934049-03
4dc8a66c-a9f9-481a-a611-225c4c60a316	bfc1b306-94f3-4385-b545-b9a1e53a9d3d	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6	\N	team	\N	\N	0	2026-09-21 11:19:51.206198-03	2026-09-21 11:19:51.206198-03
b587884b-fbe2-476d-baa2-381e234461fe	bfc1b306-94f3-4385-b545-b9a1e53a9d3d	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	9	\N	team	\N	\N	0	2026-09-21 11:19:51.206198-03	2026-09-21 11:19:51.206198-03
4361578e-0d48-4f08-84c7-dba8c8ffb512	bfc1b306-94f3-4385-b545-b9a1e53a9d3d	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3	\N	team	\N	\N	0	2026-09-21 11:19:51.206198-03	2026-09-21 11:19:51.206198-03
f5710b12-2c0c-4262-b93c-3cc0656fc796	bfc1b306-94f3-4385-b545-b9a1e53a9d3d	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	5	\N	team	\N	\N	0	2026-09-21 11:19:51.206198-03	2026-09-21 11:19:51.206198-03
30c2e784-b570-4504-83c9-e307bab9baad	bfc1b306-94f3-4385-b545-b9a1e53a9d3d	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	4	\N	team	\N	\N	0	2026-09-21 11:19:51.206198-03	2026-09-21 11:19:51.206198-03
99420f99-9ddb-4a49-8d7b-bfeee3c630c2	bfc1b306-94f3-4385-b545-b9a1e53a9d3d	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	15	\N	team	\N	\N	0	2026-09-21 11:19:51.206198-03	2026-09-21 11:19:51.206198-03
ef2fdbdc-c193-4233-9f4e-272f9aa7ab69	cea413da-015a-4065-bdb0-366e251614d4	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3	\N	team	\N	\N	0	2026-09-21 11:28:02.401519-03	2026-09-21 11:28:02.401519-03
512f1744-f74a-4ee5-a6f2-f8075d4f9a3c	cea413da-015a-4065-bdb0-366e251614d4	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6	\N	team	\N	\N	0	2026-09-21 11:28:02.401519-03	2026-09-21 11:28:02.401519-03
ebf22f2c-311f-46f7-a661-bdf114fb9cfc	cea413da-015a-4065-bdb0-366e251614d4	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	9	\N	team	\N	\N	0	2026-09-21 11:28:02.401519-03	2026-09-21 11:28:02.401519-03
551b3df3-bd27-469d-a7fe-3dfaa3627830	cea413da-015a-4065-bdb0-366e251614d4	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	15	\N	team	\N	\N	0	2026-09-21 11:28:02.401519-03	2026-09-21 11:28:02.401519-03
66de2681-1cf3-4542-ac6a-ca991aea3aa9	cea413da-015a-4065-bdb0-366e251614d4	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	5	\N	team	\N	\N	0	2026-09-21 11:28:02.401519-03	2026-09-21 11:28:02.401519-03
3d5b2399-9881-4068-b15d-1025da7c6f2a	cea413da-015a-4065-bdb0-366e251614d4	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	4	\N	team	\N	\N	0	2026-09-21 11:28:02.401519-03	2026-09-21 11:28:02.401519-03
f9da9af0-db66-4df4-83cd-c140ea530d55	f6b1dd2e-e588-4b51-9811-e6aa21342dd0	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6	\N	team	\N	\N	0	2026-09-21 11:31:55.504247-03	2026-09-21 11:31:55.504247-03
e290d990-a2d2-4e8f-a484-3d3540b1cb9f	f6b1dd2e-e588-4b51-9811-e6aa21342dd0	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	9	\N	team	\N	\N	0	2026-09-21 11:31:55.504247-03	2026-09-21 11:31:55.504247-03
6b1c4b1a-3b84-4ca7-b445-d2f243bd11b8	f6b1dd2e-e588-4b51-9811-e6aa21342dd0	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3	\N	team	\N	\N	0	2026-09-21 11:31:55.504247-03	2026-09-21 11:31:55.504247-03
015da7a1-d9db-446d-a427-a785930f06d4	f6b1dd2e-e588-4b51-9811-e6aa21342dd0	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	15	\N	team	\N	\N	0	2026-09-21 11:31:55.504247-03	2026-09-21 11:31:55.504247-03
a69dbfca-9020-4380-acda-b8a4cfe717d4	f6b1dd2e-e588-4b51-9811-e6aa21342dd0	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	5	\N	team	\N	\N	0	2026-09-21 11:31:55.504247-03	2026-09-21 11:31:55.504247-03
ba053b8b-f619-4fd4-bba7-c099cb63ad62	f6b1dd2e-e588-4b51-9811-e6aa21342dd0	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	4	\N	team	\N	\N	0	2026-09-21 11:31:55.504247-03	2026-09-21 11:31:55.504247-03
1cbac876-1aa4-49f1-ae9c-e4293f1e7f80	1224546b-a5f2-49c6-9e5e-8128765d4e4b	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6	\N	team	\N	\N	0	2026-09-21 11:33:20.957284-03	2026-09-21 11:33:20.957284-03
1fb031fa-d786-40d2-8167-5183b8594186	1224546b-a5f2-49c6-9e5e-8128765d4e4b	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	9	\N	team	\N	\N	0	2026-09-21 11:33:20.957284-03	2026-09-21 11:33:20.957284-03
b581aa8f-21c0-4ff4-bd2e-89eec2e5413e	1224546b-a5f2-49c6-9e5e-8128765d4e4b	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3	\N	team	\N	\N	0	2026-09-21 11:33:20.957284-03	2026-09-21 11:33:20.957284-03
031a56df-6ee8-4361-abdb-0b3db1e8bbdf	1224546b-a5f2-49c6-9e5e-8128765d4e4b	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	15	\N	team	\N	\N	0	2026-09-21 11:33:20.957284-03	2026-09-21 11:33:20.957284-03
4f7c69b5-0c12-4fca-900f-8df038940cf5	1224546b-a5f2-49c6-9e5e-8128765d4e4b	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	4	\N	team	\N	\N	0	2026-09-21 11:33:20.957284-03	2026-09-21 11:33:20.957284-03
2cfba813-07a9-4380-bb36-c7d6eee1783e	1224546b-a5f2-49c6-9e5e-8128765d4e4b	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	5	\N	team	\N	\N	0	2026-09-21 11:33:20.957284-03	2026-09-21 11:33:20.957284-03
e329447c-67d7-4ee7-849f-66b315dfa0ba	d1297826-b9a6-45e9-9bea-750856dd39d0	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6	\N	team	\N	\N	0	2026-09-21 11:36:34.937567-03	2026-09-21 11:36:34.937567-03
9319668a-95b5-479c-bf5e-39fdcdd389a5	d1297826-b9a6-45e9-9bea-750856dd39d0	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	9	\N	team	\N	\N	0	2026-09-21 11:36:34.937567-03	2026-09-21 11:36:34.937567-03
35562cce-8a57-4af3-a209-60ed2964b8be	d1297826-b9a6-45e9-9bea-750856dd39d0	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3	\N	team	\N	\N	0	2026-09-21 11:36:34.937567-03	2026-09-21 11:36:34.937567-03
db6eb1c8-8e09-4c02-bcee-baaa4c272f05	d1297826-b9a6-45e9-9bea-750856dd39d0	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	15	\N	team	\N	\N	0	2026-09-21 11:36:34.937567-03	2026-09-21 11:36:34.937567-03
eee9f4ef-d6f1-47af-b8e3-cfabb3fc5bd8	d1297826-b9a6-45e9-9bea-750856dd39d0	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	5	\N	team	\N	\N	0	2026-09-21 11:36:34.937567-03	2026-09-21 11:36:34.937567-03
779b6a01-4de3-4b25-bf99-bb031bc0185b	d1297826-b9a6-45e9-9bea-750856dd39d0	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	4	\N	team	\N	\N	0	2026-09-21 11:36:34.937567-03	2026-09-21 11:36:34.937567-03
a4fef768-54d7-4d2f-996c-02f79fca4de9	b25695c7-7610-4140-8717-9bb67e65c337	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6	\N	team	\N	\N	0	2026-09-21 11:38:25.799639-03	2026-09-21 11:38:25.799639-03
6d3ab7ec-a171-454c-b640-ebaba6d608fa	b25695c7-7610-4140-8717-9bb67e65c337	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	9	\N	team	\N	\N	0	2026-09-21 11:38:25.799639-03	2026-09-21 11:38:25.799639-03
7deb6ce4-a5e4-4696-853b-0d2f24bb9165	b25695c7-7610-4140-8717-9bb67e65c337	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3	\N	team	\N	\N	0	2026-09-21 11:38:25.799639-03	2026-09-21 11:38:25.799639-03
522e0cbd-8d3d-4e74-9573-ebb9eaf63c5b	b25695c7-7610-4140-8717-9bb67e65c337	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	5	\N	team	\N	\N	0	2026-09-21 11:38:25.799639-03	2026-09-21 11:38:25.799639-03
5596021b-8cec-4f08-94ea-a141e39cd1a5	b25695c7-7610-4140-8717-9bb67e65c337	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	15	\N	team	\N	\N	0	2026-09-21 11:38:25.799639-03	2026-09-21 11:38:25.799639-03
e96791cd-a45a-4d88-a8d6-4f312349e638	b25695c7-7610-4140-8717-9bb67e65c337	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	4	\N	team	\N	\N	0	2026-09-21 11:38:25.799639-03	2026-09-21 11:38:25.799639-03
fc6aaf42-7b17-492a-95d2-7a49e3a34f19	5e06422b-16a1-41ac-a1bd-8cad3fcfa1ff	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6	\N	team	\N	\N	0	2026-09-21 11:42:20.721016-03	2026-09-21 11:42:20.721016-03
574c3f2a-3bd2-4186-bd85-2c6a5feae753	5e06422b-16a1-41ac-a1bd-8cad3fcfa1ff	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	9	\N	team	\N	\N	0	2026-09-21 11:42:20.721016-03	2026-09-21 11:42:20.721016-03
31eb5a19-d6c2-4701-9903-f410046e7a72	5e06422b-16a1-41ac-a1bd-8cad3fcfa1ff	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3	\N	team	\N	\N	0	2026-09-21 11:42:20.721016-03	2026-09-21 11:42:20.721016-03
725892f0-b563-4877-b2d6-650119cdef2a	5e06422b-16a1-41ac-a1bd-8cad3fcfa1ff	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	15	\N	team	\N	\N	0	2026-09-21 11:42:20.721016-03	2026-09-21 11:42:20.721016-03
aadb4b80-f653-4ee1-92b8-3b1fb0964a41	5e06422b-16a1-41ac-a1bd-8cad3fcfa1ff	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	4	\N	team	\N	\N	0	2026-09-21 11:42:20.721016-03	2026-09-21 11:42:20.721016-03
ffd1fdc5-3044-4b09-8e2e-9812e852eae2	5e06422b-16a1-41ac-a1bd-8cad3fcfa1ff	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	5	\N	team	\N	\N	0	2026-09-21 11:42:20.721016-03	2026-09-21 11:42:20.721016-03
\.


--
-- Data for Name: zonasConquistaEstadosParticipanteIndividual; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."zonasConquistaEstadosParticipanteIndividual" (id, partida_id, empresa_id, evento_id, crianca_id, status, checkpoints_read, total_points, ranking, version, started_at, finished_at, created_at, updated_at, color) FROM stdin;
977df668-b0e8-440d-b30f-90d24716d440	9fe74eeb-5ba3-418b-9938-68ddb41f156b	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	c9a7d7a2-56b3-4ba5-801a-aacee92fd45a	finished	0	0.00	\N	0	2026-09-22 13:41:44.213-03	2026-09-25 14:18:38.734-03	2026-09-22 13:41:44.213-03	2026-09-22 13:41:44.213-03	\N
707e292f-e8cf-4e6e-9e94-f129772323ba	e3fe2b70-d59b-411f-83b1-10617346dfbe	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	c9a7d7a2-56b3-4ba5-801a-aacee92fd45a	finished	0	0.00	\N	0	2026-09-22 13:43:43.692-03	2026-09-25 14:18:38.734-03	2026-09-22 13:43:43.692-03	2026-09-22 13:43:43.692-03	\N
d2e5de0a-efc2-47af-b7ea-ec9c5559cbc5	1792f5a2-40e1-4791-86f6-9a91f8b75320	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	5c02da21-8385-41e7-9f76-990d313adeef	finished	1	0.00	\N	1	2026-09-25 08:21:46.745-03	2026-09-25 14:18:38.734-03	2026-09-25 08:21:46.745-03	2026-09-25 08:21:46.745-03	\N
7642fe4e-0aaf-483a-8cf4-7b1d78d14706	1455f0d0-4687-4e33-aae8-38f6d4a5aba7	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	c9a7d7a2-56b3-4ba5-801a-aacee92fd45a	finished	0	0.00	\N	0	2026-09-22 13:45:30.508-03	2026-09-25 14:18:38.734-03	2026-09-22 13:45:30.508-03	2026-09-22 13:45:30.508-03	\N
c8df6497-5f9a-474f-81f3-749e1caa86e1	d01842a2-6aa3-4cff-a11f-77c904f83ba1	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	c9a7d7a2-56b3-4ba5-801a-aacee92fd45a	finished	1	0.00	\N	1	2026-09-22 13:47:52.625-03	2026-09-25 14:18:38.734-03	2026-09-22 13:47:52.625-03	2026-09-22 13:47:52.625-03	\N
0dd472b1-213f-4482-8013-b9fd2b06bc0a	eccbabb7-c970-4b46-be98-2f2ade73529c	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	c9a7d7a2-56b3-4ba5-801a-aacee92fd45a	finished	1	0.00	\N	1	2026-09-22 13:49:48.344-03	2026-09-25 14:18:38.734-03	2026-09-22 13:49:48.344-03	2026-09-22 13:49:48.344-03	\N
dcfca6ea-1131-48eb-aac1-14a755cb754b	c57ba5ca-f7f6-4de0-ac41-78b702438290	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	c9a7d7a2-56b3-4ba5-801a-aacee92fd45a	finished	1	0.00	\N	1	2026-09-22 13:52:55.032-03	2026-09-25 14:18:38.734-03	2026-09-22 13:52:55.032-03	2026-09-22 13:52:55.032-03	\N
e2af7d66-fa8e-4fc3-86ec-b80bd7de2494	adcbf7dd-3b68-434b-ab67-d0091615ddfd	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	c9a7d7a2-56b3-4ba5-801a-aacee92fd45a	finished	1	0.00	\N	1	2026-09-22 14:05:38.519-03	2026-09-25 14:18:38.734-03	2026-09-22 14:05:38.519-03	2026-09-22 14:05:38.519-03	\N
d1df79e3-fed6-4835-a314-6e3959a16011	6aa22ffc-b34d-4dd9-af58-104a7722b8ec	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	c9a7d7a2-56b3-4ba5-801a-aacee92fd45a	finished	1	0.00	\N	1	2026-09-22 14:06:10.11-03	2026-09-25 14:18:38.734-03	2026-09-22 14:06:10.11-03	2026-09-22 14:06:10.11-03	\N
5cd9f500-2158-475f-9bea-af8b49164c20	1792f5a2-40e1-4791-86f6-9a91f8b75320	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	749fc814-f8ec-4587-b1fb-4df04cf71a75	finished	1	0.00	\N	1	2026-09-25 08:21:56.272-03	2026-09-25 14:18:38.734-03	2026-09-25 08:21:56.272-03	2026-09-25 08:21:56.272-03	\N
ddeee37f-4d3d-4324-8820-0cf0b1267570	015dd93d-e7d5-46be-968e-0ff0455bc869	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	5c02da21-8385-41e7-9f76-990d313adeef	finished	0	0.00	\N	0	2026-09-25 08:27:54.855-03	2026-09-25 14:18:38.734-03	2026-09-25 08:27:54.855-03	2026-09-25 08:27:54.855-03	\N
01a931a3-eadf-48b4-8d98-4ca70fc55fd5	0e42ba7b-4446-431f-a3d3-8c694800720e	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	5c02da21-8385-41e7-9f76-990d313adeef	finished	0	0.00	\N	0	2026-09-25 08:37:59.859-03	2026-09-25 14:18:38.734-03	2026-09-25 08:37:59.859-03	2026-09-25 08:37:59.859-03	\N
be1dfc41-6feb-47d3-bf5a-b5e1408b46a1	6aa22ffc-b34d-4dd9-af58-104a7722b8ec	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	fc46b33d-f0fd-4ec2-8533-47026eccf79a	finished	2	0.00	\N	2	2026-09-22 17:17:16.898-03	2026-09-25 14:18:38.734-03	2026-09-22 17:17:16.898-03	2026-09-22 17:18:06.637-03	\N
1448a404-3c8c-4a28-bded-0b140cac0530	6aa22ffc-b34d-4dd9-af58-104a7722b8ec	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	5c02da21-8385-41e7-9f76-990d313adeef	finished	2	0.00	\N	2	2026-09-22 17:17:11.678-03	2026-09-25 14:18:38.734-03	2026-09-22 17:17:11.678-03	2026-09-22 17:18:09.18-03	\N
395cfd70-9ad0-439e-8ff2-21ebb2977980	6aa22ffc-b34d-4dd9-af58-104a7722b8ec	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	749fc814-f8ec-4587-b1fb-4df04cf71a75	finished	5	0.00	\N	5	2026-09-22 17:17:05.638-03	2026-09-25 14:18:38.734-03	2026-09-22 17:17:05.638-03	2026-09-22 17:18:16.752-03	\N
f8e561fb-6990-49b0-8fa4-006c5a05e049	015dd93d-e7d5-46be-968e-0ff0455bc869	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	749fc814-f8ec-4587-b1fb-4df04cf71a75	finished	0	0.00	\N	0	2026-09-25 08:28:26.033-03	2026-09-25 14:18:38.734-03	2026-09-25 08:28:26.033-03	2026-09-25 08:28:26.033-03	\N
14c47d81-492e-47f9-80f9-75191a4518f9	5bada1c9-7ce6-4988-a3fe-a8a706252d9d	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	5c02da21-8385-41e7-9f76-990d313adeef	finished	2	0.00	\N	2	2026-09-25 08:53:19.932-03	2026-09-25 14:18:38.734-03	2026-09-25 08:53:19.932-03	2026-09-25 08:53:25.135-03	hsl(223, 70%, 60%)
b4663ae1-57c0-4e09-be95-c9ef5ed300e8	edbf11bf-8497-4bc7-8296-1cb2b32a4818	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	5c02da21-8385-41e7-9f76-990d313adeef	finished	0	0.00	\N	0	2026-09-25 08:29:18.716-03	2026-09-25 14:18:38.734-03	2026-09-25 08:29:18.716-03	2026-09-25 08:29:18.716-03	\N
3cf4c149-8b5b-4b27-9a0c-69bfe83d5c5f	6ff30257-c1a6-4872-bc5a-3492eda1b1fe	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	5c02da21-8385-41e7-9f76-990d313adeef	finished	2	0.00	\N	2	2026-09-25 08:45:11.302-03	2026-09-25 14:18:38.734-03	2026-09-25 08:45:11.302-03	2026-09-25 08:45:29.802-03	\N
6b265801-93c4-4de6-9a71-57d8cecc91c9	edbf11bf-8497-4bc7-8296-1cb2b32a4818	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	749fc814-f8ec-4587-b1fb-4df04cf71a75	finished	0	0.00	\N	0	2026-09-25 08:29:50.159-03	2026-09-25 14:18:38.734-03	2026-09-25 08:29:50.159-03	2026-09-25 08:29:50.159-03	\N
f28fe38c-a63e-4b6f-9496-5b75402e7b35	250d0651-2f3e-4668-a98c-0870a8fe8a77	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	5c02da21-8385-41e7-9f76-990d313adeef	finished	0	0.00	\N	0	2026-09-25 08:33:50.181-03	2026-09-25 14:18:38.734-03	2026-09-25 08:33:50.181-03	2026-09-25 08:33:50.181-03	\N
40ab4f4b-f59f-4874-8b16-04860125c19a	2e356c7a-e05f-444f-a716-77233db25642	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	5c02da21-8385-41e7-9f76-990d313adeef	finished	2	0.00	\N	2	2026-09-25 08:49:09.224-03	2026-09-25 14:18:38.734-03	2026-09-25 08:49:09.224-03	2026-09-25 08:49:17.009-03	hsl(223, 70%, 60%)
994fd310-2c14-4b5d-81c2-f8ef4a7f5cd4	92e51a53-999c-48f2-9ec9-852f0f6776a7	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	5c02da21-8385-41e7-9f76-990d313adeef	finished	2	0.00	\N	2	2026-09-25 10:14:33.294-03	2026-09-25 14:18:38.734-03	2026-09-25 10:14:33.294-03	2026-09-25 10:14:40.752-03	hsl(223, 70%, 60%)
62e6d1ab-ee01-4e58-9d51-4abcffd0395f	bd105d77-5407-4de7-9634-e4ac349d6ff8	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	5c02da21-8385-41e7-9f76-990d313adeef	finished	3	0.00	\N	3	2026-09-25 10:25:07.745-03	2026-09-25 14:18:38.734-03	2026-09-25 10:25:07.745-03	2026-09-25 10:25:14.612-03	hsl(223, 70%, 60%)
78f97e0d-c2fa-4d5c-8991-1e1053fcc064	667d4441-6d35-46ba-9866-13dffc6f44ed	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	c9a7d7a2-56b3-4ba5-801a-aacee92fd45a	finished	2	0.00	\N	2	2026-09-25 11:07:29.895-03	2026-09-25 14:18:38.734-03	2026-09-25 11:07:29.895-03	2026-09-25 11:07:38.122-03	hsl(106, 70%, 60%)
90cc815b-68bc-4b06-9344-b4758ab0f846	09bc52f7-7651-4ac8-bcaa-107acfeb7a51	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	fc46b33d-f0fd-4ec2-8533-47026eccf79a	finished	2	0.00	\N	2	2026-09-25 13:07:34.27-03	2026-09-25 14:18:38.734-03	2026-09-25 13:07:34.27-03	2026-09-25 13:07:40.003-03	hsl(327, 70%, 60%)
491e71a5-b022-44c6-b3ad-2b3d368e5f26	c81bc7b4-38b2-44db-96a6-f49371a4553f	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	fc46b33d-f0fd-4ec2-8533-47026eccf79a	finished	2	0.00	\N	2	2026-09-25 13:56:26.198-03	2026-09-25 14:18:38.734-03	2026-09-25 13:56:26.198-03	2026-09-25 13:56:31.77-03	hsl(327, 70%, 60%)
7e01f3be-b849-4aa3-afaf-3478dd92a7eb	606b966d-1b2b-44ad-aa5d-321494ea950f	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	fc46b33d-f0fd-4ec2-8533-47026eccf79a	finished	2	0.00	\N	2	2026-09-25 14:18:52.143-03	2026-09-25 14:19:10.972-03	2026-09-25 14:18:52.143-03	2026-09-25 14:19:00.736-03	hsl(327, 70%, 60%)
5d239400-56b6-4da7-b573-3dc4d60a8550	c374d9aa-df58-4f8d-9f2d-cf6e56f06b6e	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	fc46b33d-f0fd-4ec2-8533-47026eccf79a	finished	2	0.00	\N	2	2026-09-25 14:22:42.424-03	2026-09-25 14:23:00.206-03	2026-09-25 14:22:42.424-03	2026-09-25 14:22:47.724-03	hsl(327, 70%, 60%)
e26c04f4-9d9f-4384-85f1-37ae891d5de9	ac47673c-843e-4f86-9342-b70d6e441c4f	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	fc46b33d-f0fd-4ec2-8533-47026eccf79a	finished	2	0.00	\N	2	2026-09-25 14:23:17.843-03	2026-09-25 14:23:53.734-03	2026-09-25 14:23:17.843-03	2026-09-25 14:23:24.253-03	hsl(327, 70%, 60%)
171943ad-e169-4c47-a1cd-3e783f71d740	b0526759-0063-4a4d-9c31-a9680c1da759	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	fc46b33d-f0fd-4ec2-8533-47026eccf79a	finished	2	0.00	\N	2	2026-09-25 16:21:54.518-03	2026-09-25 16:22:06.711-03	2026-09-25 16:21:54.518-03	2026-09-25 16:22:03.26-03	hsl(327, 70%, 60%)
eb33a59f-149a-4f8c-8220-2bce69091732	1775d536-a4cf-405d-97a2-845fa7fc5b20	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	5c02da21-8385-41e7-9f76-990d313adeef	finished	2	0.00	\N	2	2026-09-25 14:59:05.709-03	2026-09-25 14:59:36.144-03	2026-09-25 14:59:05.709-03	2026-09-25 14:59:15.122-03	hsl(223, 70%, 60%)
6cb49d60-d35b-439d-98d8-636b215fb27a	1775d536-a4cf-405d-97a2-845fa7fc5b20	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	c9a7d7a2-56b3-4ba5-801a-aacee92fd45a	finished	2	0.00	\N	2	2026-09-25 14:58:52.9-03	2026-09-25 14:59:36.144-03	2026-09-25 14:58:52.9-03	2026-09-25 14:58:58.709-03	hsl(106, 70%, 60%)
5e24f36f-1d84-43ab-9335-52df404adba1	ce91bfb9-968c-4939-a7b0-56176454dfc2	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	fc46b33d-f0fd-4ec2-8533-47026eccf79a	finished	4	0.00	\N	4	2026-09-25 14:23:59.049-03	2026-09-25 14:24:59.584-03	2026-09-25 14:23:59.049-03	2026-09-25 14:24:52.358-03	hsl(327, 70%, 60%)
23e9eea1-b638-4f0b-89c4-303b24fbf298	ce91bfb9-968c-4939-a7b0-56176454dfc2	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	5c02da21-8385-41e7-9f76-990d313adeef	finished	2	0.00	\N	2	2026-09-25 14:24:11.74-03	2026-09-25 14:24:59.584-03	2026-09-25 14:24:11.74-03	2026-09-25 14:24:18.294-03	hsl(223, 70%, 60%)
d873e651-1fa9-4bd1-9345-d58bf53ea150	d607d2bb-dc06-48b1-9f5d-db4e1901a87f	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	c9a7d7a2-56b3-4ba5-801a-aacee92fd45a	finished	2	0.00	\N	2	2026-09-25 14:38:10.641-03	2026-09-25 14:38:32.632-03	2026-09-25 14:38:10.641-03	2026-09-25 14:38:13.23-03	hsl(106, 70%, 60%)
3e1be420-acc1-4dfd-b7f9-db3342b50ab8	d607d2bb-dc06-48b1-9f5d-db4e1901a87f	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	749fc814-f8ec-4587-b1fb-4df04cf71a75	finished	2	0.00	\N	2	2026-09-25 14:38:22.854-03	2026-09-25 14:38:32.632-03	2026-09-25 14:38:22.854-03	2026-09-25 14:38:25.005-03	hsl(63, 70%, 60%)
4635bebb-48f7-4160-8977-cf69425f3ea9	d607d2bb-dc06-48b1-9f5d-db4e1901a87f	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	5c02da21-8385-41e7-9f76-990d313adeef	finished	2	0.00	\N	2	2026-09-25 14:37:41.62-03	2026-09-25 14:38:32.632-03	2026-09-25 14:37:41.62-03	2026-09-25 14:37:48.247-03	hsl(223, 70%, 60%)
247c7ead-a3fe-4b26-bfd7-17460f70de10	d607d2bb-dc06-48b1-9f5d-db4e1901a87f	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	fc46b33d-f0fd-4ec2-8533-47026eccf79a	finished	2	0.00	\N	2	2026-09-25 14:37:55.837-03	2026-09-25 14:38:32.632-03	2026-09-25 14:37:55.837-03	2026-09-25 14:38:01.376-03	hsl(327, 70%, 60%)
7fc7d38f-23fe-4c0c-b271-7c1146addbe8	4539d949-c95b-4ab7-afbb-795355921d00	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	c9a7d7a2-56b3-4ba5-801a-aacee92fd45a	finished	2	0.00	\N	2	2026-09-25 14:30:50.242-03	2026-09-25 14:31:22.406-03	2026-09-25 14:30:50.242-03	2026-09-25 14:30:56.985-03	hsl(106, 70%, 60%)
86a07339-d97a-423e-9f7e-e5eedaa8d32a	4539d949-c95b-4ab7-afbb-795355921d00	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	fc46b33d-f0fd-4ec2-8533-47026eccf79a	finished	2	0.00	\N	2	2026-09-25 14:31:06.894-03	2026-09-25 14:31:22.406-03	2026-09-25 14:31:06.894-03	2026-09-25 14:31:13.349-03	hsl(327, 70%, 60%)
99aec356-0379-47f8-950a-dd405729b40a	708806d7-1508-4610-afdf-3210651f62d3	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	fc46b33d-f0fd-4ec2-8533-47026eccf79a	finished	2	0.00	\N	2	2026-09-25 15:48:46.5-03	2026-09-25 15:52:10.042-03	2026-09-25 15:48:46.5-03	2026-09-25 15:50:02.624-03	hsl(327, 70%, 60%)
0b28d027-fd9f-4794-beac-6d76221b0d8f	708806d7-1508-4610-afdf-3210651f62d3	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	c9a7d7a2-56b3-4ba5-801a-aacee92fd45a	finished	2	0.00	\N	2	2026-09-25 15:48:55.291-03	2026-09-25 15:52:10.042-03	2026-09-25 15:48:55.291-03	2026-09-25 15:50:07.744-03	hsl(106, 70%, 60%)
6fc22bac-4aea-4d57-b879-f2335f739a51	3cf5124d-404d-4960-9efd-87c5a58692de	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	fc46b33d-f0fd-4ec2-8533-47026eccf79a	finished	2	0.00	\N	2	2026-09-25 14:43:35.994-03	2026-09-25 14:43:51.095-03	2026-09-25 14:43:35.994-03	2026-09-25 14:43:42.246-03	hsl(327, 70%, 60%)
92187e50-d8dd-48da-99a5-b0906d53299e	708806d7-1508-4610-afdf-3210651f62d3	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	749fc814-f8ec-4587-b1fb-4df04cf71a75	finished	1	0.00	\N	1	2026-09-25 15:49:13.106-03	2026-09-25 15:52:10.042-03	2026-09-25 15:49:13.106-03	2026-09-25 15:49:13.106-03	hsl(63, 70%, 60%)
436573d7-c168-422d-9620-daa1af1eb7ec	708806d7-1508-4610-afdf-3210651f62d3	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	5c02da21-8385-41e7-9f76-990d313adeef	finished	2	0.00	\N	2	2026-09-25 15:50:26.266-03	2026-09-25 15:52:10.042-03	2026-09-25 15:50:26.266-03	2026-09-25 15:50:29.637-03	hsl(223, 70%, 60%)
1724fede-b19d-4b53-add8-5b5f451cf714	3fac69b6-378d-4ca4-9cd8-f2151f7d9759	c9287e4b-399d-4764-8bff-2e0ce7058dcb	c920334b-c141-47ea-a791-dd2c9828be58	b3ee6536-ebd0-431d-b106-4ebde945cc9b	finished	4	0.00	\N	4	2026-10-05 13:52:01.166-03	2026-10-05 13:52:33.401-03	2026-10-05 13:52:01.166-03	2026-10-05 13:52:20.356-03	hsl(48, 70%, 60%)
\.


--
-- Data for Name: zonasConquistaEstadosZona; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."zonasConquistaEstadosZona" (id, partida_id, empresa_id, evento_id, zone_id, current_owner_id, owner_type, is_disputed, checkpoints_count, checkpoints_owned, last_updated_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: zonasConquistaLeituraIndividual; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."zonasConquistaLeituraIndividual" (id, partida_id, empresa_id, evento_id, brincadeira_id, checkpoint_id, crianca_id, uid, leitura_id, points_awarded, version, scanned_at, created_at) FROM stdin;
fa1d1313-80bd-4244-befb-a4a254696f4b	d01842a2-6aa3-4cff-a11f-77c904f83ba1	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	5	c9a7d7a2-56b3-4ba5-801a-aacee92fd45a	C7DD6359	4ddf948c6434eb	10.00	1	2026-09-22 13:47:52.625-03	2026-09-22 13:47:52.695105-03
be62ba70-f8b1-4e1a-b653-e71ed255182d	eccbabb7-c970-4b46-be98-2f2ade73529c	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	5	c9a7d7a2-56b3-4ba5-801a-aacee92fd45a	C7DD6359	4ddf948c65f8f4	10.00	1	2026-09-22 13:49:48.344-03	2026-09-22 13:49:48.413092-03
69bc9fd4-1808-4898-8580-f319ae446b95	c57ba5ca-f7f6-4de0-ac41-78b702438290	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	5	c9a7d7a2-56b3-4ba5-801a-aacee92fd45a	C7DD6359	4ddf948c68d227	10.00	1	2026-09-22 13:52:55.032-03	2026-09-22 13:52:55.10134-03
3b68f2b1-7934-4ac8-8dd9-fe0668eb5aa1	adcbf7dd-3b68-434b-ab67-d0091615ddfd	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	5	c9a7d7a2-56b3-4ba5-801a-aacee92fd45a	C7DD6359	4ddf948c7478aa	10.00	1	2026-09-22 14:05:38.519-03	2026-09-22 14:05:38.619841-03
94e2f553-3687-43b6-9d21-817903bc0bc2	6aa22ffc-b34d-4dd9-af58-104a7722b8ec	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	5	c9a7d7a2-56b3-4ba5-801a-aacee92fd45a	C7DD6359	4ddf948c74f3eb	10.00	1	2026-09-22 14:06:10.11-03	2026-09-22 14:06:10.165183-03
ebbf598c-4610-4139-be8c-4f089c91b3c7	6aa22ffc-b34d-4dd9-af58-104a7722b8ec	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	5	749fc814-f8ec-4587-b1fb-4df04cf71a75	4CF30272	4ddf948c66ca	10.00	1	2026-09-22 17:17:05.638-03	2026-09-22 17:17:05.812544-03
9ee333a3-a38b-4710-9a88-79c54653af57	6aa22ffc-b34d-4dd9-af58-104a7722b8ec	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	4	5c02da21-8385-41e7-9f76-990d313adeef	17128659	4cdf948c7e62	10.00	1	2026-09-22 17:17:11.678-03	2026-09-22 17:17:11.741963-03
6796b02d-706d-419f-b741-301e2e036ecf	6aa22ffc-b34d-4dd9-af58-104a7722b8ec	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	3	fc46b33d-f0fd-4ec2-8533-47026eccf79a	D79D7859	4cdf948c92c2	10.00	1	2026-09-22 17:17:16.898-03	2026-09-22 17:17:16.962339-03
24647d93-4e60-4946-b5ad-1608278668e9	6aa22ffc-b34d-4dd9-af58-104a7722b8ec	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	3	749fc814-f8ec-4587-b1fb-4df04cf71a75	4CF30272	4cdf948c14ca5	10.00	2	2026-09-22 17:18:04.469-03	2026-09-22 17:18:04.533389-03
b56058d9-d6e8-4ff6-b38e-c5fcff19af58	6aa22ffc-b34d-4dd9-af58-104a7722b8ec	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	4	fc46b33d-f0fd-4ec2-8533-47026eccf79a	D79D7859	4cdf948c15507	10.00	2	2026-09-22 17:18:06.637-03	2026-09-22 17:18:06.695296-03
2dbb2b54-9f89-431c-a4f7-89f4712cb835	6aa22ffc-b34d-4dd9-af58-104a7722b8ec	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	5	5c02da21-8385-41e7-9f76-990d313adeef	17128659	4ddf948c15f06	10.00	2	2026-09-22 17:18:09.18-03	2026-09-22 17:18:09.23801-03
376af6ed-1a55-42df-b10c-84a170e3ca4b	6aa22ffc-b34d-4dd9-af58-104a7722b8ec	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	3	749fc814-f8ec-4587-b1fb-4df04cf71a75	4CF30272	4cdf948c1745b	10.00	3	2026-09-22 17:18:14.638-03	2026-09-22 17:18:14.703165-03
ced1aa1c-5451-4ac5-9c89-4a546bacf933	6aa22ffc-b34d-4dd9-af58-104a7722b8ec	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	4	749fc814-f8ec-4587-b1fb-4df04cf71a75	4CF30272	4cdf948c17a3d	10.00	4	2026-09-22 17:18:16.151-03	2026-09-22 17:18:16.209506-03
6f4d368c-141b-49fb-ac68-2ece84f6eb77	6aa22ffc-b34d-4dd9-af58-104a7722b8ec	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	5	749fc814-f8ec-4587-b1fb-4df04cf71a75	4CF30272	4ddf948c17ca1	10.00	5	2026-09-22 17:18:16.752-03	2026-09-22 17:18:16.810659-03
26f6b3a1-87ae-49b4-aa9a-482a7f5f56c6	1792f5a2-40e1-4791-86f6-9a91f8b75320	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	4	5c02da21-8385-41e7-9f76-990d313adeef	17128659	4cdf948c86a4d	10.00	1	2026-09-25 08:21:46.745-03	2026-09-25 08:21:46.806421-03
21857a7f-b375-4f94-b50c-7ed03eff96fe	1792f5a2-40e1-4791-86f6-9a91f8b75320	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	3	749fc814-f8ec-4587-b1fb-4df04cf71a75	4CF30272	4cdf948c88f7a	10.00	1	2026-09-25 08:21:56.272-03	2026-09-25 08:21:56.324308-03
b1c0e8f5-5c25-47ba-98b7-488e822f0846	6ff30257-c1a6-4872-bc5a-3492eda1b1fe	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	4	5c02da21-8385-41e7-9f76-990d313adeef	17128659	4cdf948c1dd8ec	10.00	1	2026-09-25 08:45:11.302-03	2026-09-25 08:45:11.38268-03
2434d009-c6f4-4ff6-beef-eba63118caba	6ff30257-c1a6-4872-bc5a-3492eda1b1fe	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	3	5c02da21-8385-41e7-9f76-990d313adeef	17128659	4cdf948c1e212b	10.00	2	2026-09-25 08:45:29.802-03	2026-09-25 08:45:29.859693-03
e3451125-308a-4cc4-a428-395ef4770282	2e356c7a-e05f-444f-a716-77233db25642	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	4	5c02da21-8385-41e7-9f76-990d313adeef	17128659	4cdf948c217a53	10.00	1	2026-09-25 08:49:09.224-03	2026-09-25 08:49:09.287302-03
43c09776-8b91-4d4d-a9b2-78660df47ac7	2e356c7a-e05f-444f-a716-77233db25642	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	3	5c02da21-8385-41e7-9f76-990d313adeef	17128659	4cdf948c2198a0	10.00	2	2026-09-25 08:49:17.009-03	2026-09-25 08:49:17.057982-03
511eb519-c121-40bd-b473-725fe41c0e5a	5bada1c9-7ce6-4988-a3fe-a8a706252d9d	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	4	5c02da21-8385-41e7-9f76-990d313adeef	17128659	4cdf948c254da3	10.00	1	2026-09-25 08:53:19.932-03	2026-09-25 08:53:20.024109-03
876f8ce0-718a-452d-b576-30b8ef53a712	5bada1c9-7ce6-4988-a3fe-a8a706252d9d	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	3	5c02da21-8385-41e7-9f76-990d313adeef	17128659	4cdf948c2561f3	10.00	2	2026-09-25 08:53:25.135-03	2026-09-25 08:53:25.211194-03
3d778133-2b1e-4d7c-ac1a-c1f4e435c028	92e51a53-999c-48f2-9ec9-852f0f6776a7	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	4	5c02da21-8385-41e7-9f76-990d313adeef	17128659	4cdf948c6faa3f	10.00	1	2026-09-25 10:14:33.294-03	2026-09-25 10:14:33.400812-03
328a7c37-e912-4c31-8853-2740861ed403	92e51a53-999c-48f2-9ec9-852f0f6776a7	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	3	5c02da21-8385-41e7-9f76-990d313adeef	17128659	4cdf948c6fc776	10.00	2	2026-09-25 10:14:40.752-03	2026-09-25 10:14:40.809371-03
85e3e34a-4cc7-47d3-83d4-8f5357b6991e	bd105d77-5407-4de7-9634-e4ac349d6ff8	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	4	5c02da21-8385-41e7-9f76-990d313adeef	17128659	4cdf948c7958ad	10.00	1	2026-09-25 10:25:07.745-03	2026-09-25 10:25:07.816684-03
aeaaec6e-3bc0-4b24-b900-153c6570fda7	bd105d77-5407-4de7-9634-e4ac349d6ff8	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	3	5c02da21-8385-41e7-9f76-990d313adeef	17128659	4cdf948c796eab	10.00	2	2026-09-25 10:25:13.376-03	2026-09-25 10:25:13.427559-03
617d5c3a-3232-47d6-b021-b684751adf70	bd105d77-5407-4de7-9634-e4ac349d6ff8	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	3	5c02da21-8385-41e7-9f76-990d313adeef	17128659	4cdf948c797372	10.00	3	2026-09-25 10:25:14.612-03	2026-09-25 10:25:14.678695-03
74521b1f-4512-43c2-9c7c-bbfa85db034f	667d4441-6d35-46ba-9866-13dffc6f44ed	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	4	c9a7d7a2-56b3-4ba5-801a-aacee92fd45a	C7DD6359	4cdf948ca0230c	10.00	1	2026-09-25 11:07:29.895-03	2026-09-25 11:07:29.963129-03
3d78a798-5fa9-4592-9fa3-4d3159476129	667d4441-6d35-46ba-9866-13dffc6f44ed	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	3	c9a7d7a2-56b3-4ba5-801a-aacee92fd45a	C7DD6359	4cdf948ca04320	10.00	2	2026-09-25 11:07:38.122-03	2026-09-25 11:07:38.177303-03
91c1ca6a-cec2-4726-9ab8-30e3a10f77d7	09bc52f7-7651-4ac8-bcaa-107acfeb7a51	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	4	fc46b33d-f0fd-4ec2-8533-47026eccf79a	D79D7859	4cdf948c10e1145	10.00	1	2026-09-25 13:07:34.27-03	2026-09-25 13:07:34.355914-03
e4b16752-200a-4cca-aedf-6cf71ccc8d79	09bc52f7-7651-4ac8-bcaa-107acfeb7a51	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	3	fc46b33d-f0fd-4ec2-8533-47026eccf79a	D79D7859	4cdf948c10e27a1	10.00	2	2026-09-25 13:07:40.003-03	2026-09-25 13:07:40.055488-03
bc08cf32-58cf-44dd-927c-6eccefd3899a	c81bc7b4-38b2-44db-96a6-f49371a4553f	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	4	fc46b33d-f0fd-4ec2-8533-47026eccf79a	D79D7859	4cdf948c13ace27	10.00	1	2026-09-25 13:56:26.198-03	2026-09-25 13:56:26.282954-03
83a80df3-3342-44be-bfe3-e64ae3a11ef2	c81bc7b4-38b2-44db-96a6-f49371a4553f	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	3	fc46b33d-f0fd-4ec2-8533-47026eccf79a	D79D7859	4cdf948c13ae3f5	10.00	2	2026-09-25 13:56:31.77-03	2026-09-25 13:56:31.823087-03
3a8b0368-d01f-4fc9-b48d-38655177b807	606b966d-1b2b-44ad-aa5d-321494ea950f	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	4	fc46b33d-f0fd-4ec2-8533-47026eccf79a	D79D7859	4cdf948c14f57d1	10.00	1	2026-09-25 14:18:52.143-03	2026-09-25 14:18:52.217939-03
40e29fdf-ff55-4437-9d9b-c913d519b741	606b966d-1b2b-44ad-aa5d-321494ea950f	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	3	fc46b33d-f0fd-4ec2-8533-47026eccf79a	D79D7859	4cdf948c14f7964	10.00	2	2026-09-25 14:19:00.736-03	2026-09-25 14:19:00.800618-03
1ffe6836-6c94-4ce7-a61f-855d73a7f643	c374d9aa-df58-4f8d-9f2d-cf6e56f06b6e	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	4	fc46b33d-f0fd-4ec2-8533-47026eccf79a	D79D7859	4cdf948c152db60	10.00	1	2026-09-25 14:22:42.424-03	2026-09-25 14:22:42.508212-03
9ca68244-3b16-488b-99fc-667ea1f8e2fb	c374d9aa-df58-4f8d-9f2d-cf6e56f06b6e	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	3	fc46b33d-f0fd-4ec2-8533-47026eccf79a	D79D7859	4cdf948c152f010	10.00	2	2026-09-25 14:22:47.724-03	2026-09-25 14:22:47.779847-03
bd17e29a-4db9-43ee-8861-d6002699f67d	ac47673c-843e-4f86-9342-b70d6e441c4f	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	4	fc46b33d-f0fd-4ec2-8533-47026eccf79a	D79D7859	4cdf948c15365bc	10.00	1	2026-09-25 14:23:17.843-03	2026-09-25 14:23:17.91155-03
80c36f5a-b9a9-48e2-bb64-b3c95348fe35	ce91bfb9-968c-4939-a7b0-56176454dfc2	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	4	fc46b33d-f0fd-4ec2-8533-47026eccf79a	D79D7859	4cdf948c15406a8	10.00	1	2026-09-25 14:23:59.049-03	2026-09-25 14:23:59.105654-03
1923bbaa-ceed-4361-a503-31a4b8dd75d5	ac47673c-843e-4f86-9342-b70d6e441c4f	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	3	fc46b33d-f0fd-4ec2-8533-47026eccf79a	D79D7859	4cdf948c1537ec2	10.00	2	2026-09-25 14:23:24.253-03	2026-09-25 14:23:24.310414-03
bd5c6fd4-0f01-4f9e-ad82-da785b64cbbe	d607d2bb-dc06-48b1-9f5d-db4e1901a87f	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	3	fc46b33d-f0fd-4ec2-8533-47026eccf79a	D79D7859	4cdf948c160e08f	10.00	2	2026-09-25 14:38:01.376-03	2026-09-25 14:38:01.423746-03
99b918d1-23d0-41e5-abd3-758437289b4f	d607d2bb-dc06-48b1-9f5d-db4e1901a87f	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	4	c9a7d7a2-56b3-4ba5-801a-aacee92fd45a	C7DD6359	4cdf948c16104f5	10.00	1	2026-09-25 14:38:10.641-03	2026-09-25 14:38:10.694374-03
90a3e003-dffa-46c5-ae44-fec08c49d507	d607d2bb-dc06-48b1-9f5d-db4e1901a87f	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	4	749fc814-f8ec-4587-b1fb-4df04cf71a75	4CF30272	4cdf948c16134f7	10.00	1	2026-09-25 14:38:22.854-03	2026-09-25 14:38:22.911781-03
36fe09a0-0e76-49f1-b508-992b6b9c9217	ce91bfb9-968c-4939-a7b0-56176454dfc2	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	3	fc46b33d-f0fd-4ec2-8533-47026eccf79a	D79D7859	4cdf948c1541e3f	10.00	2	2026-09-25 14:24:05.088-03	2026-09-25 14:24:05.156937-03
8956f17a-f786-4847-9d0a-867d1a5ad257	ce91bfb9-968c-4939-a7b0-56176454dfc2	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	3	5c02da21-8385-41e7-9f76-990d313adeef	17128659	4cdf948c154383b	10.00	1	2026-09-25 14:24:11.74-03	2026-09-25 14:24:11.829365-03
e358f1f1-3691-4ec1-83c4-6101fca4735e	ce91bfb9-968c-4939-a7b0-56176454dfc2	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	4	fc46b33d-f0fd-4ec2-8533-47026eccf79a	D79D7859	4cdf948c154be26	10.00	3	2026-09-25 14:24:46.016-03	2026-09-25 14:24:46.069245-03
f3f00984-a305-4ae1-81f6-ff6273a4e8b7	ce91bfb9-968c-4939-a7b0-56176454dfc2	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	4	5c02da21-8385-41e7-9f76-990d313adeef	17128659	4cdf948c15451d7	10.00	2	2026-09-25 14:24:18.294-03	2026-09-25 14:24:18.365458-03
818a028a-ab2c-4e49-bfda-71a209ed1cb3	ce91bfb9-968c-4939-a7b0-56176454dfc2	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	3	fc46b33d-f0fd-4ec2-8533-47026eccf79a	D79D7859	4cdf948c154d6e9	10.00	4	2026-09-25 14:24:52.358-03	2026-09-25 14:24:52.413023-03
001a40a5-4e5e-49fa-aa7c-bf882a705981	4539d949-c95b-4ab7-afbb-795355921d00	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	4	c9a7d7a2-56b3-4ba5-801a-aacee92fd45a	C7DD6359	4cdf948c15a4ca3	10.00	1	2026-09-25 14:30:50.242-03	2026-09-25 14:30:50.315024-03
fc3cef0c-fe68-4019-be2a-b5c1b19d286f	4539d949-c95b-4ab7-afbb-795355921d00	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	3	c9a7d7a2-56b3-4ba5-801a-aacee92fd45a	C7DD6359	4cdf948c15a6740	10.00	2	2026-09-25 14:30:56.985-03	2026-09-25 14:30:57.053288-03
31d9f3cd-2e36-41c0-aea0-a6b8dc5dbde3	4539d949-c95b-4ab7-afbb-795355921d00	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	4	fc46b33d-f0fd-4ec2-8533-47026eccf79a	D79D7859	4cdf948c15a8de1	10.00	1	2026-09-25 14:31:06.894-03	2026-09-25 14:31:06.959133-03
ff7d6661-ba56-43a6-9e64-9d3ef7a267b9	4539d949-c95b-4ab7-afbb-795355921d00	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	3	fc46b33d-f0fd-4ec2-8533-47026eccf79a	D79D7859	4cdf948c15aa72e	10.00	2	2026-09-25 14:31:13.349-03	2026-09-25 14:31:13.404913-03
98bfaab8-3b26-40b5-ac80-6983bf4cee07	d607d2bb-dc06-48b1-9f5d-db4e1901a87f	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	4	5c02da21-8385-41e7-9f76-990d313adeef	17128659	4cdf948c16093d7	10.00	1	2026-09-25 14:37:41.62-03	2026-09-25 14:37:41.696229-03
b6d6d10f-c6e4-4679-b820-18f57e57685c	d607d2bb-dc06-48b1-9f5d-db4e1901a87f	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	3	5c02da21-8385-41e7-9f76-990d313adeef	17128659	4cdf948c160acba	10.00	2	2026-09-25 14:37:48.247-03	2026-09-25 14:37:48.304509-03
7f6e9959-d7e1-4109-83ac-a91e144e2f5c	d607d2bb-dc06-48b1-9f5d-db4e1901a87f	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	4	fc46b33d-f0fd-4ec2-8533-47026eccf79a	D79D7859	4cdf948c160cb62	10.00	1	2026-09-25 14:37:55.837-03	2026-09-25 14:37:55.89278-03
96b342d1-7451-40ac-9a31-1b0b8a084766	d607d2bb-dc06-48b1-9f5d-db4e1901a87f	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	3	c9a7d7a2-56b3-4ba5-801a-aacee92fd45a	C7DD6359	4cdf948c1610f57	10.00	2	2026-09-25 14:38:13.23-03	2026-09-25 14:38:13.28118-03
0cdf53d8-2467-4441-9e8b-57dd3baa4023	d607d2bb-dc06-48b1-9f5d-db4e1901a87f	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	3	749fc814-f8ec-4587-b1fb-4df04cf71a75	4CF30272	4cdf948c1613d52	10.00	2	2026-09-25 14:38:25.005-03	2026-09-25 14:38:25.050914-03
bb8b930d-4b85-48e5-afd9-9bbac06aacca	3cf5124d-404d-4960-9efd-87c5a58692de	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	4	fc46b33d-f0fd-4ec2-8533-47026eccf79a	D79D7859	4cdf948c165fc23	10.00	1	2026-09-25 14:43:35.994-03	2026-09-25 14:43:36.077746-03
73b23328-9d30-40be-b2f8-8581db55282c	3cf5124d-404d-4960-9efd-87c5a58692de	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	3	fc46b33d-f0fd-4ec2-8533-47026eccf79a	D79D7859	4cdf948c166148a	10.00	2	2026-09-25 14:43:42.246-03	2026-09-25 14:43:42.29864-03
dc9fce26-c516-41ce-8468-4ce0c25fb814	1775d536-a4cf-405d-97a2-845fa7fc5b20	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	4	c9a7d7a2-56b3-4ba5-801a-aacee92fd45a	C7DD6359	4cdf948c173f9db	10.00	1	2026-09-25 14:58:52.9-03	2026-09-25 14:58:52.976549-03
a1be613d-1f8f-47e3-b2e9-c933388e76a6	1775d536-a4cf-405d-97a2-845fa7fc5b20	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	3	c9a7d7a2-56b3-4ba5-801a-aacee92fd45a	C7DD6359	4cdf948c1740f71	10.00	2	2026-09-25 14:58:58.709-03	2026-09-25 14:58:58.775577-03
b43727a8-3ca6-4d49-a908-4cb00ef83a50	1775d536-a4cf-405d-97a2-845fa7fc5b20	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	4	5c02da21-8385-41e7-9f76-990d313adeef	17128659	4cdf948c1742bd9	10.00	1	2026-09-25 14:59:05.709-03	2026-09-25 14:59:05.78706-03
7ace3be8-a084-4744-b359-34ca8f653e60	1775d536-a4cf-405d-97a2-845fa7fc5b20	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	3	5c02da21-8385-41e7-9f76-990d313adeef	17128659	4cdf948c174509e	10.00	2	2026-09-25 14:59:15.122-03	2026-09-25 14:59:15.181515-03
b2c9d05b-0df3-4806-a834-91d1f83387cf	708806d7-1508-4610-afdf-3210651f62d3	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	4	fc46b33d-f0fd-4ec2-8533-47026eccf79a	D79D7859	4cdf948c1a1a7a7	10.00	1	2026-09-25 15:48:46.5-03	2026-09-25 15:48:46.595651-03
2be044f4-b0d3-4174-ba55-eff55084eefc	708806d7-1508-4610-afdf-3210651f62d3	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	3	c9a7d7a2-56b3-4ba5-801a-aacee92fd45a	C7DD6359	4cdf948c1a1c9fc	10.00	1	2026-09-25 15:48:55.291-03	2026-09-25 15:48:55.361467-03
371fa996-9fb3-4013-b9c7-fdd6bcb284e3	708806d7-1508-4610-afdf-3210651f62d3	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	4	749fc814-f8ec-4587-b1fb-4df04cf71a75	4CF30272	4cdf948c1a20f92	10.00	1	2026-09-25 15:49:13.106-03	2026-09-25 15:49:13.164377-03
57f7c486-e290-47d9-9bae-c2c1082ea5ee	708806d7-1508-4610-afdf-3210651f62d3	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	3	fc46b33d-f0fd-4ec2-8533-47026eccf79a	D79D7859	4cdf948c1a2d100	10.00	2	2026-09-25 15:50:02.624-03	2026-09-25 15:50:02.668295-03
15c7c054-e447-467e-abae-3bed5991cb21	708806d7-1508-4610-afdf-3210651f62d3	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	4	c9a7d7a2-56b3-4ba5-801a-aacee92fd45a	C7DD6359	4cdf948c1a2e506	10.00	2	2026-09-25 15:50:07.744-03	2026-09-25 15:50:07.794489-03
e87608b3-3ba7-4447-9021-9bee1d80ee61	708806d7-1508-4610-afdf-3210651f62d3	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	4	5c02da21-8385-41e7-9f76-990d313adeef	17128659	4cdf948c1a32d62	10.00	1	2026-09-25 15:50:26.266-03	2026-09-25 15:50:26.348426-03
fcd988c6-1745-4e27-8ba2-54343f4be83f	708806d7-1508-4610-afdf-3210651f62d3	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	3	5c02da21-8385-41e7-9f76-990d313adeef	17128659	4cdf948c1a33a88	10.00	2	2026-09-25 15:50:29.637-03	2026-09-25 15:50:29.695443-03
89d935d1-be87-4c74-9a08-ba537e5133e6	b0526759-0063-4a4d-9c31-a9680c1da759	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	3	fc46b33d-f0fd-4ec2-8533-47026eccf79a	D79D7859	4cdf948c1bffd6c	10.00	1	2026-09-25 16:21:54.518-03	2026-09-25 16:21:54.586828-03
d75626f7-d62f-461d-bdd0-7e70ba5fa22a	b0526759-0063-4a4d-9c31-a9680c1da759	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	4	fc46b33d-f0fd-4ec2-8533-47026eccf79a	D79D7859	4cdf948c1c01f86	10.00	2	2026-09-25 16:22:03.26-03	2026-09-25 16:22:03.342531-03
9f223f2d-5bdd-4688-bad7-90366a8a2877	3fac69b6-378d-4ca4-9cd8-f2151f7d9759	c9287e4b-399d-4764-8bff-2e0ce7058dcb	c920334b-c141-47ea-a791-dd2c9828be58	6da6e7f8-0358-41e4-8dcd-253df10242bf	15	b3ee6536-ebd0-431d-b106-4ebde945cc9b	04F0B45ABB2190	2ca4b702dfbc	10.00	1	2026-10-05 13:52:01.166-03	2026-10-05 13:52:01.265339-03
a88ef7aa-0883-4926-affc-66a550d07e76	3fac69b6-378d-4ca4-9cd8-f2151f7d9759	c9287e4b-399d-4764-8bff-2e0ce7058dcb	c920334b-c141-47ea-a791-dd2c9828be58	6da6e7f8-0358-41e4-8dcd-253df10242bf	10	b3ee6536-ebd0-431d-b106-4ebde945cc9b	04F0B45ABB2190	4ddf948c77386	10.00	2	2026-10-05 13:52:09.616-03	2026-10-05 13:52:09.673908-03
e616ea6e-2fe1-4dad-b363-ab5824a77a69	3fac69b6-378d-4ca4-9cd8-f2151f7d9759	c9287e4b-399d-4764-8bff-2e0ce7058dcb	c920334b-c141-47ea-a791-dd2c9828be58	6da6e7f8-0358-41e4-8dcd-253df10242bf	12	b3ee6536-ebd0-431d-b106-4ebde945cc9b	04F0B45ABB2190	d1abc31c74ccf	10.00	3	2026-10-05 13:52:15.65-03	2026-10-05 13:52:15.711266-03
06d42f45-ee5a-45b1-a8c4-a20420ed07b3	3fac69b6-378d-4ca4-9cd8-f2151f7d9759	c9287e4b-399d-4764-8bff-2e0ce7058dcb	c920334b-c141-47ea-a791-dd2c9828be58	6da6e7f8-0358-41e4-8dcd-253df10242bf	14	b3ee6536-ebd0-431d-b106-4ebde945cc9b	04F0B45ABB2190	89a99b206c703	10.00	4	2026-10-05 13:52:20.356-03	2026-10-05 13:52:20.423622-03
\.


--
-- Data for Name: zonasConquistaLeituraTime; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."zonasConquistaLeituraTime" (id, partida_id, empresa_id, evento_id, brincadeira_id, round_number, checkpoint_id, crianca_id, time_id, uid, leitura_id, points_awarded, scanned_at, created_at) FROM stdin;
a10e0190-9cb6-44c0-bbb0-b4881335f65b	549f9e45-f4c3-4a48-a912-53ed2a5a13c4	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	1	5	fc46b33d-f0fd-4ec2-8533-47026eccf79a	3218d5b4-372e-424e-9d91-dedea2b741f3	D79D7859	4ddf948cb46c	10.00	2026-09-22 08:12:59.773-03	2026-09-22 08:12:59.847624-03
1219f115-8f1b-4f36-ada4-3f11751c2bc3	5e72a237-18b0-4755-a51a-15017adf189c	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	1	5	fc46b33d-f0fd-4ec2-8533-47026eccf79a	3218d5b4-372e-424e-9d91-dedea2b741f3	D79D7859	4ddf948c2108f	10.00	2026-09-22 08:14:28.889-03	2026-09-22 08:14:28.938999-03
e9788972-86b3-47ce-8622-d97249b3d550	cbfec570-a760-42e8-b913-6688d55655fc	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	1	5	fc46b33d-f0fd-4ec2-8533-47026eccf79a	3218d5b4-372e-424e-9d91-dedea2b741f3	D79D7859	4ddf948c81b36	10.00	2026-09-22 08:21:04.869-03	2026-09-22 08:21:04.923148-03
c61e23cf-16c3-45b1-84d0-7dcd1c384ae1	2cdb4abd-3050-4ce3-97c8-96a3f834edbd	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	1	5	fc46b33d-f0fd-4ec2-8533-47026eccf79a	3218d5b4-372e-424e-9d91-dedea2b741f3	D79D7859	4ddf948c3ce72	10.00	2026-09-22 11:29:59.356-03	2026-09-22 11:29:59.40296-03
c4542c99-b729-457c-8a7e-0c02bc9e4c70	42e4bd2d-679e-4e74-b07f-8c5b7f53d527	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	1	5	c9a7d7a2-56b3-4ba5-801a-aacee92fd45a	3218d5b4-372e-424e-9d91-dedea2b741f3	C7DD6359	4ddf948c647d6	10.00	2026-09-22 11:32:41.509-03	2026-09-22 11:32:41.552576-03
b0137a3c-0d2c-41af-9ca8-34ef672c06e2	67d3edfb-1580-4575-a6fe-c2cb684d7ebb	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	1	5	c9a7d7a2-56b3-4ba5-801a-aacee92fd45a	3218d5b4-372e-424e-9d91-dedea2b741f3	C7DD6359	4ddf948c962bf	10.00	2026-09-22 11:36:04.982-03	2026-09-22 11:36:05.032688-03
2d40a60d-185a-4a19-947f-aa2519fb90cb	a6fe972b-85d0-4f78-9941-840a6bc87cf5	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	1	5	c9a7d7a2-56b3-4ba5-801a-aacee92fd45a	3218d5b4-372e-424e-9d91-dedea2b741f3	C7DD6359	4ddf948cc04bf	10.00	2026-09-22 11:38:57.539-03	2026-09-22 11:38:57.601815-03
45dccce6-7fb1-4784-b715-59da924f5729	f2806b3f-f9eb-4fd1-a1cf-69f7fda3ab9c	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	1	5	fc46b33d-f0fd-4ec2-8533-47026eccf79a	3218d5b4-372e-424e-9d91-dedea2b741f3	D79D7859	4ddf948cc504e	10.00	2026-09-22 11:39:16.887-03	2026-09-22 11:39:16.934615-03
3cd33a6b-e568-46ac-9628-4e5325a3d230	dc3271ef-b186-43fe-837c-3939b802c36f	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	1	5	fc46b33d-f0fd-4ec2-8533-47026eccf79a	3218d5b4-372e-424e-9d91-dedea2b741f3	D79D7859	4ddf948cc8eab	10.00	2026-09-22 11:39:32.837-03	2026-09-22 11:39:32.890064-03
52fff777-93f2-430e-9405-40ed21247d70	a164ea54-0091-42c8-80a5-554ffe5f2e41	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	1	5	fc46b33d-f0fd-4ec2-8533-47026eccf79a	3218d5b4-372e-424e-9d91-dedea2b741f3	D79D7859	4ddf948cf370f	10.00	2026-09-22 11:42:27.018-03	2026-09-22 11:42:27.10749-03
a8a475d2-f45a-445c-818e-4eb289827d1a	b475df40-b829-4a2d-aad0-2bd8f0a263ff	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	1	5	fc46b33d-f0fd-4ec2-8533-47026eccf79a	3218d5b4-372e-424e-9d91-dedea2b741f3	D79D7859	4ddf948c10ae2c	10.00	2026-09-22 11:44:03.028-03	2026-09-22 11:44:03.088829-03
5079dfaa-814a-4854-b73b-6c1f0f87a3e4	12a6a4ed-7a4c-4e67-942f-b406feadeffb	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	1	5	c9a7d7a2-56b3-4ba5-801a-aacee92fd45a	3218d5b4-372e-424e-9d91-dedea2b741f3	C7DD6359	4ddf948c10e52a	10.00	2026-09-22 11:44:17.113-03	2026-09-22 11:44:17.172338-03
e4545c1c-ab3a-495d-9ff1-0fe90c20897d	313717f0-47f8-4012-80ce-80d5dabe2af3	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	1	5	c9a7d7a2-56b3-4ba5-801a-aacee92fd45a	3218d5b4-372e-424e-9d91-dedea2b741f3	C7DD6359	4ddf948c12bc92	10.00	2026-09-22 11:46:17.797-03	2026-09-22 11:46:17.846623-03
57b7626f-e909-4641-ab15-2da21aa8eb0b	3d888b76-9d76-45c0-822e-d24c56b0993e	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	1	5	c9a7d7a2-56b3-4ba5-801a-aacee92fd45a	3218d5b4-372e-424e-9d91-dedea2b741f3	C7DD6359	4ddf948c151149	10.00	2026-09-22 11:48:50.535-03	2026-09-22 11:48:50.583935-03
e8b5334f-f85b-4f5e-9c0f-cf9a5378d7fe	d487e00a-5ac2-42cd-ac8a-4f6354dee36e	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	1	5	c9a7d7a2-56b3-4ba5-801a-aacee92fd45a	3218d5b4-372e-424e-9d91-dedea2b741f3	C7DD6359	4ddf948c17a642	10.00	2026-09-22 11:51:39.797-03	2026-09-22 11:51:39.849075-03
b177b691-4001-4982-bc04-29b27d424e99	706d444f-f542-4d54-8e2d-79c5e8956222	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	1	5	fc46b33d-f0fd-4ec2-8533-47026eccf79a	3218d5b4-372e-424e-9d91-dedea2b741f3	D79D7859	4ddf948c4dae	10.00	2026-09-22 11:58:45.539-03	2026-09-22 11:58:45.600578-03
6bd5b620-3c17-4768-a301-7284c26b7517	706d444f-f542-4d54-8e2d-79c5e8956222	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	1	4	c9a7d7a2-56b3-4ba5-801a-aacee92fd45a	3218d5b4-372e-424e-9d91-dedea2b741f3	C7DD6359	4cdf948c5c5d	10.00	2026-09-22 11:58:49.313-03	2026-09-22 11:58:49.364559-03
c703affd-846d-48ee-82d6-8c533633ea3b	706d444f-f542-4d54-8e2d-79c5e8956222	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	1	3	c9a7d7a2-56b3-4ba5-801a-aacee92fd45a	3218d5b4-372e-424e-9d91-dedea2b741f3	C7DD6359	4cdf948ccd86	10.00	2026-09-22 11:59:18.282-03	2026-09-22 11:59:18.331916-03
381f6b96-559a-46fe-b797-c27bb368403e	fcbfcdc8-dbfd-4a6b-b53f-bb34adb7a0c7	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	1	5	fc46b33d-f0fd-4ec2-8533-47026eccf79a	3218d5b4-372e-424e-9d91-dedea2b741f3	D79D7859	4ddf948c5cd80	10.00	2026-09-22 12:04:45.939-03	2026-09-22 12:04:46.426863-03
ae584770-b44a-412f-93be-d67a214381c8	fcbfcdc8-dbfd-4a6b-b53f-bb34adb7a0c7	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	1	4	fc46b33d-f0fd-4ec2-8533-47026eccf79a	3218d5b4-372e-424e-9d91-dedea2b741f3	D79D7859	4cdf948c5e125	10.00	2026-09-22 12:04:50.994-03	2026-09-22 12:04:51.039733-03
fcd7179f-bf20-4832-8c8b-2ed34564fbeb	fcbfcdc8-dbfd-4a6b-b53f-bb34adb7a0c7	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	1	3	fc46b33d-f0fd-4ec2-8533-47026eccf79a	3218d5b4-372e-424e-9d91-dedea2b741f3	D79D7859	4cdf948c5ee41	10.00	2026-09-22 12:04:54.34-03	2026-09-22 12:04:54.411856-03
016fbaf3-cadf-4732-a8d0-0d72c0127c73	a90f8754-2632-41ab-a583-f0d2514056f2	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	1	5	fc46b33d-f0fd-4ec2-8533-47026eccf79a	3218d5b4-372e-424e-9d91-dedea2b741f3	D79D7859	4ddf948c6b338	10.00	2026-09-22 12:05:44.745-03	2026-09-22 12:05:44.789752-03
91831627-4964-4b95-8539-38cbafae8033	a90f8754-2632-41ab-a583-f0d2514056f2	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	1	4	c9a7d7a2-56b3-4ba5-801a-aacee92fd45a	3218d5b4-372e-424e-9d91-dedea2b741f3	C7DD6359	4cdf948c6c3bb	10.00	2026-09-22 12:05:49.004-03	2026-09-22 12:05:49.048436-03
31b02327-743c-4829-8c3a-103c73e12306	a90f8754-2632-41ab-a583-f0d2514056f2	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	1	3	c9a7d7a2-56b3-4ba5-801a-aacee92fd45a	3218d5b4-372e-424e-9d91-dedea2b741f3	C7DD6359	4cdf948c6c73c	10.00	2026-09-22 12:05:50.061-03	2026-09-22 12:05:50.113276-03
4b6e2918-3fb6-45f8-9475-b5b13832ebce	d84c3270-08e1-4ab7-9b21-1d049ceba5d6	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	1	4	c9a7d7a2-56b3-4ba5-801a-aacee92fd45a	3218d5b4-372e-424e-9d91-dedea2b741f3	C7DD6359	4cdf948c9702e	10.00	2026-09-22 12:08:44.45-03	2026-09-22 12:08:44.516123-03
28fb4a07-95cd-4058-aa61-3632b81c13cd	d84c3270-08e1-4ab7-9b21-1d049ceba5d6	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	1	3	c9a7d7a2-56b3-4ba5-801a-aacee92fd45a	3218d5b4-372e-424e-9d91-dedea2b741f3	C7DD6359	4cdf948c981e6	10.00	2026-09-22 12:08:48.823-03	2026-09-22 12:08:48.870815-03
42090242-59f9-49a2-b009-ade4b90eb302	a8e37425-5b60-4b9d-be92-720c1d083aae	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	1	4	c9a7d7a2-56b3-4ba5-801a-aacee92fd45a	3218d5b4-372e-424e-9d91-dedea2b741f3	C7DD6359	4cdf948c8ce9e3	10.00	2026-09-25 10:46:30.094-03	2026-09-25 10:46:30.142963-03
b91fa345-73c1-40e1-93e0-3ef18741f2f8	a8e37425-5b60-4b9d-be92-720c1d083aae	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	1	3	c9a7d7a2-56b3-4ba5-801a-aacee92fd45a	3218d5b4-372e-424e-9d91-dedea2b741f3	C7DD6359	4cdf948c8d0717	10.00	2026-09-25 10:46:37.584-03	2026-09-25 10:46:37.637896-03
a67b44e8-4412-444c-b66d-b6fee8272b7a	2841bbc6-1586-45d0-a1cd-7d90527c4702	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	1	4	c9a7d7a2-56b3-4ba5-801a-aacee92fd45a	3218d5b4-372e-424e-9d91-dedea2b741f3	C7DD6359	4cdf948c963f8b	10.00	2026-09-25 10:56:41.85-03	2026-09-25 10:56:41.898555-03
88b2ccec-7b54-4fff-b2a6-89c9aac558f6	2841bbc6-1586-45d0-a1cd-7d90527c4702	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	1	3	c9a7d7a2-56b3-4ba5-801a-aacee92fd45a	3218d5b4-372e-424e-9d91-dedea2b741f3	C7DD6359	4cdf948c9665f1	10.00	2026-09-25 10:56:51.683-03	2026-09-25 10:56:51.729537-03
65b8a746-3525-42ea-9417-4ab8e3713f8e	2b6dc512-a630-468d-9bd4-5ad086931084	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	1	4	c9a7d7a2-56b3-4ba5-801a-aacee92fd45a	3218d5b4-372e-424e-9d91-dedea2b741f3	C7DD6359	4cdf948c9f81a4	10.00	2026-09-25 11:06:48.59-03	2026-09-25 11:06:48.649044-03
93bfae42-70e9-4ec7-9c22-87ea28820f3f	2b6dc512-a630-468d-9bd4-5ad086931084	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	1	3	c9a7d7a2-56b3-4ba5-801a-aacee92fd45a	3218d5b4-372e-424e-9d91-dedea2b741f3	C7DD6359	4cdf948c9fb06d	10.00	2026-09-25 11:07:00.568-03	2026-09-25 11:07:00.615923-03
fb51a76a-9c48-436c-a230-05d6ae4f6e63	4ec542f8-a98e-4d6f-a22f-ad8e02492811	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	1	4	c9a7d7a2-56b3-4ba5-801a-aacee92fd45a	3218d5b4-372e-424e-9d91-dedea2b741f3	C7DD6359	4cdf948c17c76ed	10.00	2026-09-25 15:08:09.224-03	2026-09-25 15:08:09.280886-03
5ae8abb0-a787-4b08-8c87-3a93c8e63da4	4ec542f8-a98e-4d6f-a22f-ad8e02492811	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	1	3	c9a7d7a2-56b3-4ba5-801a-aacee92fd45a	3218d5b4-372e-424e-9d91-dedea2b741f3	C7DD6359	4cdf948c17c83af	10.00	2026-09-25 15:08:12.474-03	2026-09-25 15:08:12.514643-03
b8201b10-095a-4472-9206-7e93b030ea3d	c7a89a0d-6c98-425f-a2ce-a76c1298bda6	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	1	4	c9a7d7a2-56b3-4ba5-801a-aacee92fd45a	3218d5b4-372e-424e-9d91-dedea2b741f3	C7DD6359	4cdf948c1998af7	10.00	2026-09-25 15:39:54.871-03	2026-09-25 15:39:54.92129-03
b7fc117c-4c54-4283-bebb-fe02d49384c1	c7a89a0d-6c98-425f-a2ce-a76c1298bda6	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	1	3	5c02da21-8385-41e7-9f76-990d313adeef	a8238112-f78c-4a80-95d3-4d18336f1318	17128659	4cdf948c199981f	10.00	2026-09-25 15:39:58.243-03	2026-09-25 15:39:58.289724-03
76786768-3a4d-4315-9a0d-2618aeb2ed10	c7a89a0d-6c98-425f-a2ce-a76c1298bda6	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	1	4	5c02da21-8385-41e7-9f76-990d313adeef	a8238112-f78c-4a80-95d3-4d18336f1318	17128659	4cdf948c199a8fb	10.00	2026-09-25 15:40:02.56-03	2026-09-25 15:40:02.604624-03
21d155c0-e840-4508-aaa7-744f80fb4ec8	c7a89a0d-6c98-425f-a2ce-a76c1298bda6	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	1	3	c9a7d7a2-56b3-4ba5-801a-aacee92fd45a	3218d5b4-372e-424e-9d91-dedea2b741f3	C7DD6359	4cdf948c199b75a	10.00	2026-09-25 15:40:06.222-03	2026-09-25 15:40:06.26911-03
495c9688-bb2d-4fa7-8d4f-db0b9c56e41d	c7a89a0d-6c98-425f-a2ce-a76c1298bda6	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	1	3	fc46b33d-f0fd-4ec2-8533-47026eccf79a	3218d5b4-372e-424e-9d91-dedea2b741f3	D79D7859	4cdf948c199dfba	10.00	2026-09-25 15:40:16.561-03	2026-09-25 15:40:16.604364-03
b7171ff4-226e-4869-84b9-f8fa8f680f84	c7a89a0d-6c98-425f-a2ce-a76c1298bda6	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	1	4	749fc814-f8ec-4587-b1fb-4df04cf71a75	a8238112-f78c-4a80-95d3-4d18336f1318	4CF30272	4cdf948c199f424	10.00	2026-09-25 15:40:21.781-03	2026-09-25 15:40:21.826089-03
c5e29382-3ed7-4eca-a21f-df69546205b2	c7a89a0d-6c98-425f-a2ce-a76c1298bda6	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	1	3	749fc814-f8ec-4587-b1fb-4df04cf71a75	a8238112-f78c-4a80-95d3-4d18336f1318	4CF30272	4cdf948c19a081a	10.00	2026-09-25 15:40:26.905-03	2026-09-25 15:40:26.960904-03
7a86ed74-81a0-41ae-b8f7-5afc1f4718c8	e3c791bf-f725-4ff3-a28f-223be5fda429	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	1	4	749fc814-f8ec-4587-b1fb-4df04cf71a75	a8238112-f78c-4a80-95d3-4d18336f1318	4CF30272	4cdf948c1a72cc4	10.00	2026-09-25 15:54:48.276-03	2026-09-25 15:54:48.311913-03
37fb3684-c562-46f0-b874-b787f591ae53	e3c791bf-f725-4ff3-a28f-223be5fda429	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	1	3	749fc814-f8ec-4587-b1fb-4df04cf71a75	a8238112-f78c-4a80-95d3-4d18336f1318	4CF30272	4cdf948c1a75111	10.00	2026-09-25 15:54:57.546-03	2026-09-25 15:54:57.58316-03
f3f65dd0-4b02-45dd-85d0-f95baf8c172c	49521227-c098-4e6b-b819-8d0976a8a74a	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	1	4	c9a7d7a2-56b3-4ba5-801a-aacee92fd45a	3218d5b4-372e-424e-9d91-dedea2b741f3	C7DD6359	4cdf948c2087	10.00	2026-09-29 16:27:02.65-03	2026-09-29 16:27:02.713915-03
c5c002ee-7d16-4290-a7a3-7a326bbe696d	7c21fbbb-5f23-4e04-9d4c-3475225c6a19	c9287e4b-399d-4764-8bff-2e0ce7058dcb	c920334b-c141-47ea-a791-dd2c9828be58	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	1	10	d70cac9b-1fb5-4444-a350-a6fadc61c300	3e781f1a-bd88-426c-b2de-d47f2489cc65	0455525ABB2190	4ddf948c5fea9	10.00	2026-10-05 13:50:34.192-03	2026-10-05 13:50:34.281614-03
47cfd991-3ddf-4c47-92dd-7b59d83688c2	7c21fbbb-5f23-4e04-9d4c-3475225c6a19	c9287e4b-399d-4764-8bff-2e0ce7058dcb	c920334b-c141-47ea-a791-dd2c9828be58	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	1	15	d70cac9b-1fb5-4444-a350-a6fadc61c300	3e781f1a-bd88-426c-b2de-d47f2489cc65	0455525ABB2190	2ca4b7019d54	10.00	2026-10-05 13:50:38.654-03	2026-10-05 13:50:38.707176-03
4fc81744-dd5a-460a-ad84-3b329971fe08	7c21fbbb-5f23-4e04-9d4c-3475225c6a19	c9287e4b-399d-4764-8bff-2e0ce7058dcb	c920334b-c141-47ea-a791-dd2c9828be58	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	1	12	d70cac9b-1fb5-4444-a350-a6fadc61c300	3e781f1a-bd88-426c-b2de-d47f2489cc65	0455525ABB2190	d1abc31c5ea38	10.00	2026-10-05 13:50:44.881-03	2026-10-05 13:50:44.931739-03
ba24fa3f-eb87-4752-b499-757eb83ed30a	7c21fbbb-5f23-4e04-9d4c-3475225c6a19	c9287e4b-399d-4764-8bff-2e0ce7058dcb	c920334b-c141-47ea-a791-dd2c9828be58	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	1	14	d70cac9b-1fb5-4444-a350-a6fadc61c300	3e781f1a-bd88-426c-b2de-d47f2489cc65	0455525ABB2190	89a99b205773c	10.00	2026-10-05 13:50:54.404-03	2026-10-05 13:50:54.468017-03
f9de49a8-dd95-4c42-845a-bdc410ad657a	7c21fbbb-5f23-4e04-9d4c-3475225c6a19	c9287e4b-399d-4764-8bff-2e0ce7058dcb	c920334b-c141-47ea-a791-dd2c9828be58	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	1	15	b3ee6536-ebd0-431d-b106-4ebde945cc9b	697df292-ec0f-40e5-97d5-1c77c6e539ff	04F0B45ABB2190	2ca4b7021016	10.00	2026-10-05 13:51:08.015-03	2026-10-05 13:51:08.068868-03
a7d7d4f2-fa53-4221-a6bc-00fe6b4bc23c	7c21fbbb-5f23-4e04-9d4c-3475225c6a19	c9287e4b-399d-4764-8bff-2e0ce7058dcb	c920334b-c141-47ea-a791-dd2c9828be58	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	1	10	b3ee6536-ebd0-431d-b106-4ebde945cc9b	697df292-ec0f-40e5-97d5-1c77c6e539ff	04F0B45ABB2190	4ddf948c69483	10.00	2026-10-05 13:51:12.53-03	2026-10-05 13:51:12.598378-03
f312daac-4e4c-4af4-bf1f-bc0c1f2d3ea6	7c21fbbb-5f23-4e04-9d4c-3475225c6a19	c9287e4b-399d-4764-8bff-2e0ce7058dcb	c920334b-c141-47ea-a791-dd2c9828be58	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	1	12	b3ee6536-ebd0-431d-b106-4ebde945cc9b	697df292-ec0f-40e5-97d5-1c77c6e539ff	04F0B45ABB2190	d1abc31c673c9	10.00	2026-10-05 13:51:20.098-03	2026-10-05 13:51:20.148663-03
87103187-4cfa-4139-a208-4dcbd309cb39	7c21fbbb-5f23-4e04-9d4c-3475225c6a19	c9287e4b-399d-4764-8bff-2e0ce7058dcb	c920334b-c141-47ea-a791-dd2c9828be58	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	1	14	b3ee6536-ebd0-431d-b106-4ebde945cc9b	697df292-ec0f-40e5-97d5-1c77c6e539ff	04F0B45ABB2190	89a99b205f2cf	10.00	2026-10-05 13:51:26.044-03	2026-10-05 13:51:26.091023-03
\.


--
-- Data for Name: zonasConquistaPartidaIndividual; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."zonasConquistaPartidaIndividual" (id, empresa_id, evento_id, brincadeira_id, status, version, started_at, finished_at, created_at, updated_at) FROM stdin;
015dd93d-e7d5-46be-968e-0ff0455bc869	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	finished	0	2026-09-25 08:27:49.922-03	\N	2026-09-25 08:27:49.922-03	2026-09-25 08:27:49.922-03
edbf11bf-8497-4bc7-8296-1cb2b32a4818	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	finished	0	2026-09-25 08:29:12.786-03	\N	2026-09-25 08:29:12.786-03	2026-09-25 08:29:12.786-03
0e42ba7b-4446-431f-a3d3-8c694800720e	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	finished	0	2026-09-25 08:37:46.074-03	\N	2026-09-25 08:37:46.074-03	2026-09-25 08:37:46.074-03
1455f0d0-4687-4e33-aae8-38f6d4a5aba7	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	finished	0	2026-09-22 13:45:21.408-03	\N	2026-09-22 13:45:21.408-03	2026-09-22 13:45:21.408-03
1792f5a2-40e1-4791-86f6-9a91f8b75320	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	finished	0	2026-09-25 08:21:20.432-03	\N	2026-09-25 08:21:20.432-03	2026-09-25 08:21:20.432-03
250d0651-2f3e-4668-a98c-0870a8fe8a77	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	finished	0	2026-09-25 08:33:40.568-03	\N	2026-09-25 08:33:40.568-03	2026-09-25 08:33:40.568-03
2e356c7a-e05f-444f-a716-77233db25642	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	finished	0	2026-09-25 08:49:04.692-03	\N	2026-09-25 08:49:04.692-03	2026-09-25 08:49:04.692-03
5bada1c9-7ce6-4988-a3fe-a8a706252d9d	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	finished	0	2026-09-25 08:53:17.476-03	\N	2026-09-25 08:53:17.476-03	2026-09-25 08:53:17.476-03
6aa22ffc-b34d-4dd9-af58-104a7722b8ec	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	finished	0	2026-09-22 14:06:03.088-03	\N	2026-09-22 14:06:03.088-03	2026-09-22 14:06:03.088-03
6ff30257-c1a6-4872-bc5a-3492eda1b1fe	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	finished	0	2026-09-25 08:45:07.898-03	\N	2026-09-25 08:45:07.898-03	2026-09-25 08:45:07.898-03
7d456a2f-0aa9-4cfe-aa7a-59220cc4c421	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	finished	0	2026-09-25 10:28:32.753-03	\N	2026-09-25 10:28:32.753-03	2026-09-25 10:28:32.753-03
92e51a53-999c-48f2-9ec9-852f0f6776a7	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	finished	0	2026-09-25 10:14:30.87-03	\N	2026-09-25 10:14:30.87-03	2026-09-25 10:14:30.87-03
9fe74eeb-5ba3-418b-9938-68ddb41f156b	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	finished	0	2026-09-22 13:41:35.694-03	\N	2026-09-22 13:41:35.694-03	2026-09-22 13:41:35.694-03
adcbf7dd-3b68-434b-ab67-d0091615ddfd	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	finished	0	2026-09-22 14:05:32.779-03	\N	2026-09-22 14:05:32.779-03	2026-09-22 14:05:32.779-03
bd105d77-5407-4de7-9634-e4ac349d6ff8	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	finished	0	2026-09-25 10:25:00.758-03	\N	2026-09-25 10:25:00.758-03	2026-09-25 10:25:00.758-03
c57ba5ca-f7f6-4de0-ac41-78b702438290	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	finished	0	2026-09-22 13:52:49.743-03	\N	2026-09-22 13:52:49.743-03	2026-09-22 13:52:49.743-03
d01842a2-6aa3-4cff-a11f-77c904f83ba1	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	finished	0	2026-09-22 13:47:47.008-03	\N	2026-09-22 13:47:47.008-03	2026-09-22 13:47:47.008-03
dd60e35d-c5e5-4d34-83ab-76d1b7ca958b	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	finished	0	2026-09-25 08:27:20.441-03	\N	2026-09-25 08:27:20.441-03	2026-09-25 08:27:20.441-03
e3fe2b70-d59b-411f-83b1-10617346dfbe	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	finished	0	2026-09-22 13:43:31.949-03	\N	2026-09-22 13:43:31.949-03	2026-09-22 13:43:31.949-03
eccbabb7-c970-4b46-be98-2f2ade73529c	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	finished	0	2026-09-22 13:49:43.054-03	\N	2026-09-22 13:49:43.054-03	2026-09-22 13:49:43.054-03
667d4441-6d35-46ba-9866-13dffc6f44ed	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	finished	0	2026-09-25 11:07:27.974-03	2026-09-25 14:18:38.734-03	2026-09-25 11:07:27.974-03	2026-09-25 11:07:27.974-03
09bc52f7-7651-4ac8-bcaa-107acfeb7a51	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	finished	0	2026-09-25 13:07:29.802-03	2026-09-25 14:18:38.734-03	2026-09-25 13:07:29.802-03	2026-09-25 13:07:29.802-03
c81bc7b4-38b2-44db-96a6-f49371a4553f	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	finished	0	2026-09-25 13:56:22.487-03	2026-09-25 14:18:38.734-03	2026-09-25 13:56:22.487-03	2026-09-25 13:56:22.487-03
a1247ea9-7292-45cf-b981-5069f7369545	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	finished	0	2026-09-25 14:18:38.766-03	2026-09-25 14:18:44.511-03	2026-09-25 14:18:38.766-03	2026-09-25 14:18:38.766-03
606b966d-1b2b-44ad-aa5d-321494ea950f	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	finished	0	2026-09-25 14:18:47.143-03	2026-09-25 14:19:10.972-03	2026-09-25 14:18:47.143-03	2026-09-25 14:18:47.143-03
c374d9aa-df58-4f8d-9f2d-cf6e56f06b6e	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	finished	0	2026-09-25 14:22:39.138-03	2026-09-25 14:23:00.206-03	2026-09-25 14:22:39.138-03	2026-09-25 14:22:39.138-03
ac47673c-843e-4f86-9342-b70d6e441c4f	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	finished	0	2026-09-25 14:23:14.621-03	2026-09-25 14:23:53.734-03	2026-09-25 14:23:14.621-03	2026-09-25 14:23:14.621-03
ce91bfb9-968c-4939-a7b0-56176454dfc2	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	finished	0	2026-09-25 14:23:56.384-03	2026-09-25 14:24:59.584-03	2026-09-25 14:23:56.384-03	2026-09-25 14:23:56.384-03
4539d949-c95b-4ab7-afbb-795355921d00	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	finished	0	2026-09-25 14:30:46.633-03	2026-09-25 14:31:22.406-03	2026-09-25 14:30:46.633-03	2026-09-25 14:30:46.633-03
d607d2bb-dc06-48b1-9f5d-db4e1901a87f	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	finished	0	2026-09-25 14:37:32.41-03	2026-09-25 14:38:32.632-03	2026-09-25 14:37:32.41-03	2026-09-25 14:37:32.41-03
3cf5124d-404d-4960-9efd-87c5a58692de	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	finished	0	2026-09-25 14:43:28.644-03	2026-09-25 14:43:51.095-03	2026-09-25 14:43:28.644-03	2026-09-25 14:43:28.644-03
1775d536-a4cf-405d-97a2-845fa7fc5b20	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	finished	0	2026-09-25 14:58:47.015-03	2026-09-25 14:59:36.144-03	2026-09-25 14:58:47.015-03	2026-09-25 14:58:47.015-03
708806d7-1508-4610-afdf-3210651f62d3	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	finished	0	2026-09-25 15:48:37.53-03	2026-09-25 15:52:10.042-03	2026-09-25 15:48:37.53-03	2026-09-25 15:48:37.53-03
b0526759-0063-4a4d-9c31-a9680c1da759	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	finished	0	2026-09-25 16:21:50.665-03	2026-09-25 16:22:06.711-03	2026-09-25 16:21:50.665-03	2026-09-25 16:21:50.665-03
f7c65394-83f9-4f3c-a1d0-a10969f3d475	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	finished	0	2026-09-29 16:27:21.592-03	2026-09-29 16:27:59.688-03	2026-09-29 16:27:21.592-03	2026-09-29 16:27:21.592-03
3fac69b6-378d-4ca4-9cd8-f2151f7d9759	c9287e4b-399d-4764-8bff-2e0ce7058dcb	c920334b-c141-47ea-a791-dd2c9828be58	6da6e7f8-0358-41e4-8dcd-253df10242bf	finished	0	2026-10-05 13:51:55.088-03	2026-10-05 13:52:33.401-03	2026-10-05 13:51:55.088-03	2026-10-05 13:51:55.088-03
\.


--
-- Data for Name: zonasConquistaPartidaTime; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."zonasConquistaPartidaTime" (id, empresa_id, evento_id, brincadeira_id, status, round_number, current_team_id, started_at, finished_at, created_at, updated_at) FROM stdin;
bcc88fd4-b2dd-4859-a0f4-2a4757eac905	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-25 08:53:44.578378-03	2026-09-25 08:54:33.896994-03	2026-09-25 08:53:44.578378-03	2026-09-25 08:53:44.578378-03
861ea013-2ec6-41db-9b85-a73c7b37d2dc	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-25 10:25:23.37258-03	2026-09-25 10:25:42.573143-03	2026-09-25 10:25:23.37258-03	2026-09-25 10:25:23.37258-03
2841bbc6-1586-45d0-a1cd-7d90527c4702	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-25 10:56:12.426913-03	2026-09-25 10:57:20.277694-03	2026-09-25 10:56:12.426913-03	2026-09-25 10:56:12.426913-03
d824b250-193d-459d-9c4b-7e974475cb7c	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-25 15:07:52.615284-03	2026-09-25 15:08:01.866-03	2026-09-25 15:07:52.615284-03	2026-09-25 15:07:52.615284-03
2b39ec03-fe9c-466d-81f7-44b395d5c3d3	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-25 15:17:17.50954-03	2026-09-25 15:19:30.54-03	2026-09-25 15:17:17.50954-03	2026-09-25 15:17:17.50954-03
718a6b2e-5402-40bd-9c9b-f3ca11da73a6	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-25 15:54:35.286719-03	2026-09-25 15:54:37.898-03	2026-09-25 15:54:35.286719-03	2026-09-25 15:54:35.286719-03
49521227-c098-4e6b-b819-8d0976a8a74a	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-29 16:26:55.609168-03	2026-09-29 16:27:18.181-03	2026-09-29 16:26:55.609168-03	2026-09-29 16:26:55.609168-03
3a7f8c54-c6ec-4880-a43a-fe9e468d5580	c9287e4b-399d-4764-8bff-2e0ce7058dcb	4695594c-19e9-493f-86a9-dfe79941400e	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	\N	2026-10-01 08:22:02.858688-03	2026-10-01 08:22:29.998-03	2026-10-01 08:22:02.858688-03	2026-10-01 08:22:02.858688-03
216917de-d21d-458f-b5c8-1b7abdbc53eb	c9287e4b-399d-4764-8bff-2e0ce7058dcb	4695594c-19e9-493f-86a9-dfe79941400e	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	\N	2026-10-01 08:59:29.782478-03	2026-10-01 08:59:44.344-03	2026-10-01 08:59:29.782478-03	2026-10-01 08:59:29.782478-03
d83298f0-bb19-44a5-8cd9-b9cd3bde2ee5	c9287e4b-399d-4764-8bff-2e0ce7058dcb	4695594c-19e9-493f-86a9-dfe79941400e	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	\N	2026-10-01 09:03:37.35762-03	2026-10-01 09:03:51.113-03	2026-10-01 09:03:37.35762-03	2026-10-01 09:03:37.35762-03
486f5062-5333-49f3-a563-0b574befe962	c9287e4b-399d-4764-8bff-2e0ce7058dcb	4695594c-19e9-493f-86a9-dfe79941400e	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	\N	2026-10-01 10:18:38.134795-03	2026-10-01 10:18:43.461-03	2026-10-01 10:18:38.134795-03	2026-10-01 10:18:38.134795-03
60dc6a3a-9832-424c-83c7-1a27028482ca	c9287e4b-399d-4764-8bff-2e0ce7058dcb	4695594c-19e9-493f-86a9-dfe79941400e	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	\N	2026-10-01 10:49:52.215174-03	2026-10-01 10:49:56.02-03	2026-10-01 10:49:52.215174-03	2026-10-01 10:49:52.215174-03
ba86f6ee-5f8b-4faf-804e-fcc90c75cd4c	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-21 11:48:14.060387-03	2026-09-21 13:46:40.996281-03	2026-09-21 11:48:14.060387-03	2026-09-21 11:48:14.060387-03
77ba4b68-f98f-46b0-b5a6-b9e0ed219577	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-21 11:53:57.427454-03	2026-09-21 13:46:40.996281-03	2026-09-21 11:53:57.427454-03	2026-09-21 11:53:57.427454-03
2e58d671-8e9e-42cc-9518-c2b3e6a53c14	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-21 11:55:50.39495-03	2026-09-21 13:46:40.996281-03	2026-09-21 11:55:50.39495-03	2026-09-21 11:55:50.39495-03
39379ff2-7b6f-4b94-a558-47f436e5f203	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-21 12:00:17.503145-03	2026-09-21 13:46:40.996281-03	2026-09-21 12:00:17.503145-03	2026-09-21 12:00:17.503145-03
6a8531dc-96b3-43b0-8a06-25b3f72dbac9	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-21 12:02:52.839608-03	2026-09-21 13:46:40.996281-03	2026-09-21 12:02:52.839608-03	2026-09-21 12:02:52.839608-03
1db5c636-4858-4570-aab6-6994a47de234	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-21 12:04:53.955584-03	2026-09-21 13:46:40.996281-03	2026-09-21 12:04:53.955584-03	2026-09-21 12:04:53.955584-03
b262e36d-7fac-49dd-8636-69f46569d12a	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-21 12:05:41.010548-03	2026-09-21 13:46:40.996281-03	2026-09-21 12:05:41.010548-03	2026-09-21 12:05:41.010548-03
e185ca61-b0b0-46bb-a969-59a9f4532a00	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-21 12:09:32.983382-03	2026-09-21 13:46:40.996281-03	2026-09-21 12:09:32.983382-03	2026-09-21 12:09:32.983382-03
f1578d58-23ad-47d5-9a96-b6592a2fe3bc	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-21 12:15:15.54832-03	2026-09-21 13:46:40.996281-03	2026-09-21 12:15:15.54832-03	2026-09-21 12:15:15.54832-03
e77f7567-936c-4307-9b44-18c9bb8a1ec7	c9287e4b-399d-4764-8bff-2e0ce7058dcb	4695594c-19e9-493f-86a9-dfe79941400e	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	\N	2026-10-01 11:12:04.661755-03	2026-10-01 11:12:12.105-03	2026-10-01 11:12:04.661755-03	2026-10-01 11:12:04.661755-03
0517fc83-ca5e-42d7-81e3-8b5262934e48	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-21 13:56:16.095634-03	2026-09-21 13:57:28.814029-03	2026-09-21 13:56:16.095634-03	2026-09-21 13:56:16.095634-03
aa8127a0-d52c-4640-b476-ce591cdd3e70	c9287e4b-399d-4764-8bff-2e0ce7058dcb	4695594c-19e9-493f-86a9-dfe79941400e	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	aea6e59c-7626-4e57-964a-5bf49620b671	2026-10-01 14:53:20.866209-03	2026-10-01 14:55:05.772-03	2026-10-01 14:53:20.866209-03	2026-10-01 14:53:20.866209-03
d3020904-ba10-4fc6-8b46-bc3967d34a8d	c9287e4b-399d-4764-8bff-2e0ce7058dcb	c920334b-c141-47ea-a791-dd2c9828be58	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3e781f1a-bd88-426c-b2de-d47f2489cc65	2026-10-05 13:49:24.220869-03	2026-10-05 13:49:33.216-03	2026-10-05 13:49:24.220869-03	2026-10-05 13:49:24.220869-03
7c21fbbb-5f23-4e04-9d4c-3475225c6a19	c9287e4b-399d-4764-8bff-2e0ce7058dcb	c920334b-c141-47ea-a791-dd2c9828be58	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3e781f1a-bd88-426c-b2de-d47f2489cc65	2026-10-05 13:50:27.641573-03	2026-10-05 13:51:43.198-03	2026-10-05 13:50:27.641573-03	2026-10-05 13:50:27.641573-03
dceac1c5-b094-4c26-b810-e77ac017a317	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-21 12:18:31.375249-03	2026-09-21 13:46:40.996281-03	2026-09-21 12:18:31.375249-03	2026-09-21 12:18:31.375249-03
4115f7b7-c548-44a3-ba76-c25004e15971	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-21 12:28:13.215948-03	2026-09-21 13:46:40.996281-03	2026-09-21 12:28:13.215948-03	2026-09-21 12:28:13.215948-03
d88e705c-f666-446c-a574-a2ed9496d8ea	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-21 13:12:11.210046-03	2026-09-21 13:46:40.996281-03	2026-09-21 13:12:11.210046-03	2026-09-21 13:12:11.210046-03
5af3f927-8175-45b9-9367-c9b5260b0385	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-21 13:13:39.228042-03	2026-09-21 13:46:40.996281-03	2026-09-21 13:13:39.228042-03	2026-09-21 13:13:39.228042-03
79f6ff35-e569-41fe-a1cd-48457591390b	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-21 13:15:36.166217-03	2026-09-21 13:46:40.996281-03	2026-09-21 13:15:36.166217-03	2026-09-21 13:15:36.166217-03
b2a9f481-908b-4025-a3b8-7a1ecc6e705e	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-21 13:16:45.458646-03	2026-09-21 13:46:40.996281-03	2026-09-21 13:16:45.458646-03	2026-09-21 13:16:45.458646-03
82ba226e-c091-4056-b219-3b60ac892566	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-21 13:18:26.93706-03	2026-09-21 13:46:40.996281-03	2026-09-21 13:18:26.93706-03	2026-09-21 13:18:26.93706-03
6b945f1d-071f-4f64-bf16-e0977d7590a4	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-21 13:21:29.304477-03	2026-09-21 13:46:40.996281-03	2026-09-21 13:21:29.304477-03	2026-09-21 13:21:29.304477-03
4df60e2e-0516-4b1c-a021-81688b47b1e5	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-21 13:24:37.077889-03	2026-09-21 13:46:40.996281-03	2026-09-21 13:24:37.077889-03	2026-09-21 13:24:37.077889-03
d6b0692d-5618-4bc9-ba4b-e0e5fd71bda2	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-21 13:32:06.811422-03	2026-09-21 13:46:40.996281-03	2026-09-21 13:32:06.811422-03	2026-09-21 13:32:06.811422-03
3f303e74-137f-47c5-8817-90329e23dcb5	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-21 13:35:01.590384-03	2026-09-21 13:46:40.996281-03	2026-09-21 13:35:01.590384-03	2026-09-21 13:35:01.590384-03
70bbc3e7-af2e-4f57-abb7-6135550c65f2	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-21 13:41:37.487077-03	2026-09-21 13:46:40.996281-03	2026-09-21 13:41:37.487077-03	2026-09-21 13:41:37.487077-03
b96f8e10-6fe6-4bf0-bd9c-790407acd8d8	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-21 13:45:52.464197-03	2026-09-21 13:46:40.996281-03	2026-09-21 13:45:52.464197-03	2026-09-21 13:45:52.464197-03
ba600358-dedf-4783-af3b-22e2bca13345	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-21 13:46:59.000172-03	2026-09-21 13:47:34.793955-03	2026-09-21 13:46:59.000172-03	2026-09-21 13:46:59.000172-03
4d4cfc63-6e4c-4928-94da-4794c92eedfe	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-21 13:50:19.66471-03	2026-09-21 13:50:42.747953-03	2026-09-21 13:50:19.66471-03	2026-09-21 13:50:19.66471-03
127eb500-552f-4740-86ba-219ac4a8a77a	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-21 13:58:42.293566-03	2026-09-21 13:59:09.255039-03	2026-09-21 13:58:42.293566-03	2026-09-21 13:58:42.293566-03
0e1e2706-fd99-4a39-b51b-c472605221aa	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-21 14:03:47.214623-03	2026-09-21 14:04:12.653715-03	2026-09-21 14:03:47.214623-03	2026-09-21 14:03:47.214623-03
ed2aceb7-9062-43da-bbe1-b0ce1fb1b9a4	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-21 14:07:34.049528-03	2026-09-21 14:08:07.156206-03	2026-09-21 14:07:34.049528-03	2026-09-21 14:07:34.049528-03
3b14cc04-06e2-4300-9c87-09ea999cb8df	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-21 14:36:47.986179-03	2026-09-21 14:37:07.361005-03	2026-09-21 14:36:47.986179-03	2026-09-21 14:36:47.986179-03
0ff4fd01-c055-4ebb-ad55-230861a7f5f9	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-21 14:38:45.623215-03	2026-09-21 14:39:17.089386-03	2026-09-21 14:38:45.623215-03	2026-09-21 14:38:45.623215-03
72a0140d-79c9-472a-872a-cdaf48488a3f	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-21 14:41:38.365784-03	2026-09-21 14:42:11.43076-03	2026-09-21 14:41:38.365784-03	2026-09-21 14:41:38.365784-03
ad09c2d4-0393-445f-8a0b-83cbd846a885	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-21 14:43:49.303799-03	2026-09-21 14:45:02.166864-03	2026-09-21 14:43:49.303799-03	2026-09-21 14:43:49.303799-03
1414fe31-9054-46f8-8409-71ae40689913	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-21 14:45:12.929077-03	2026-09-21 14:46:26.316767-03	2026-09-21 14:45:12.929077-03	2026-09-21 14:45:12.929077-03
bd427d72-ef77-40cb-98a6-de06ed9ad59d	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-21 14:46:35.016495-03	2026-09-21 14:47:35.463927-03	2026-09-21 14:46:35.016495-03	2026-09-21 14:46:35.016495-03
4e90904a-c6fc-4c1e-88ec-c14740312b3b	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-21 14:54:32.191695-03	2026-09-21 15:01:32.200757-03	2026-09-21 14:54:32.191695-03	2026-09-21 14:54:32.191695-03
9c249ca4-0d82-4943-a596-cbcc9ad9bba4	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-21 15:01:40.987689-03	2026-09-21 15:03:51.597443-03	2026-09-21 15:01:40.987689-03	2026-09-21 15:01:40.987689-03
e1dd591f-8dd5-4d78-a3a7-a9211ea60257	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-21 15:11:04.011818-03	2026-09-21 15:11:40.71949-03	2026-09-21 15:11:04.011818-03	2026-09-21 15:11:04.011818-03
a9b7b584-b53f-4daf-82b0-2e27d6f29186	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-21 15:11:51.518831-03	2026-09-21 15:13:51.543442-03	2026-09-21 15:11:51.518831-03	2026-09-21 15:11:51.518831-03
92166e8e-312a-4daa-93dd-2de923194aff	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-21 15:17:03.339272-03	2026-09-21 15:18:13.835696-03	2026-09-21 15:17:03.339272-03	2026-09-21 15:17:03.339272-03
d7c0aefc-b372-4940-b6f0-3ca5f0567e70	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-21 15:26:08.191152-03	2026-09-21 15:27:01.703109-03	2026-09-21 15:26:08.191152-03	2026-09-21 15:26:08.191152-03
0918a1b1-25ac-40ac-bb84-8c80f015f4b6	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-25 10:14:13.06392-03	2026-09-25 10:14:27.312615-03	2026-09-25 10:14:13.06392-03	2026-09-25 10:14:13.06392-03
549f9e45-f4c3-4a48-a912-53ed2a5a13c4	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-21 15:31:56.120879-03	2026-09-22 08:15:09.059565-03	2026-09-21 15:31:56.120879-03	2026-09-21 15:31:56.120879-03
5e72a237-18b0-4755-a51a-15017adf189c	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-22 08:14:19.359552-03	2026-09-22 08:15:09.059565-03	2026-09-22 08:14:19.359552-03	2026-09-22 08:14:19.359552-03
a8e37425-5b60-4b9d-be92-720c1d083aae	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-25 10:45:48.117695-03	2026-09-25 10:50:34.960883-03	2026-09-25 10:45:48.117695-03	2026-09-25 10:45:48.117695-03
cbfec570-a760-42e8-b913-6688d55655fc	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-22 08:20:57.869615-03	2026-09-22 08:22:02.33004-03	2026-09-22 08:20:57.869615-03	2026-09-22 08:20:57.869615-03
2b6dc512-a630-468d-9bd4-5ad086931084	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-25 11:06:34.936494-03	2026-09-25 11:07:22.933673-03	2026-09-25 11:06:34.936494-03	2026-09-25 11:06:34.936494-03
2cdb4abd-3050-4ce3-97c8-96a3f834edbd	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-22 11:29:51.298162-03	2026-09-22 11:30:46.220181-03	2026-09-22 11:29:51.298162-03	2026-09-22 11:29:51.298162-03
42e4bd2d-679e-4e74-b07f-8c5b7f53d527	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-22 11:32:36.1904-03	2026-09-22 11:33:21.146281-03	2026-09-22 11:32:36.1904-03	2026-09-22 11:32:36.1904-03
4ec542f8-a98e-4d6f-a22f-ad8e02492811	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-25 15:08:04.656917-03	2026-09-25 15:08:27.674-03	2026-09-25 15:08:04.656917-03	2026-09-25 15:08:12.474-03
67d3edfb-1580-4575-a6fe-c2cb684d7ebb	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-22 11:36:01.207157-03	2026-09-22 11:36:29.638566-03	2026-09-22 11:36:01.207157-03	2026-09-22 11:36:01.207157-03
c7a89a0d-6c98-425f-a2ce-a76c1298bda6	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-25 15:39:49.114138-03	2026-09-25 15:40:31.635-03	2026-09-25 15:39:49.114138-03	2026-09-25 15:39:49.114138-03
a6fe972b-85d0-4f78-9941-840a6bc87cf5	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-22 11:38:43.004932-03	2026-09-22 11:39:11.559118-03	2026-09-22 11:38:43.004932-03	2026-09-22 11:38:43.004932-03
f2806b3f-f9eb-4fd1-a1cf-69f7fda3ab9c	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-22 11:39:13.984326-03	2026-09-22 11:39:27.6635-03	2026-09-22 11:39:13.984326-03	2026-09-22 11:39:13.984326-03
dc3271ef-b186-43fe-837c-3939b802c36f	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-22 11:39:30.792539-03	2026-09-22 11:40:14.59742-03	2026-09-22 11:39:30.792539-03	2026-09-22 11:39:30.792539-03
e3c791bf-f725-4ff3-a28f-223be5fda429	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-25 15:54:40.739124-03	2026-09-25 15:55:52.207-03	2026-09-25 15:54:40.739124-03	2026-09-25 15:54:40.739124-03
a164ea54-0091-42c8-80a5-554ffe5f2e41	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-22 11:42:19.743-03	2026-09-22 11:43:52.688625-03	2026-09-22 11:42:19.743-03	2026-09-22 11:42:19.743-03
b475df40-b829-4a2d-aad0-2bd8f0a263ff	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-22 11:43:56.707723-03	2026-09-22 11:44:09.349032-03	2026-09-22 11:43:56.707723-03	2026-09-22 11:43:56.707723-03
31644d89-b32b-4ed4-8620-b32c6b46fa90	c9287e4b-399d-4764-8bff-2e0ce7058dcb	4695594c-19e9-493f-86a9-dfe79941400e	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	\N	2026-09-30 18:05:49.402914-03	2026-09-30 18:06:02.672-03	2026-09-30 18:05:49.402914-03	2026-09-30 18:05:49.402914-03
12a6a4ed-7a4c-4e67-942f-b406feadeffb	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-22 11:44:11.950234-03	2026-09-22 11:44:28.109656-03	2026-09-22 11:44:11.950234-03	2026-09-22 11:44:11.950234-03
313717f0-47f8-4012-80ce-80d5dabe2af3	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-22 11:46:12.752485-03	2026-09-22 11:46:48.738095-03	2026-09-22 11:46:12.752485-03	2026-09-22 11:46:12.752485-03
228c0a06-8455-4ab3-bd28-d0a6c1c53649	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-22 11:48:28.032114-03	2026-09-22 11:48:35.226117-03	2026-09-22 11:48:28.032114-03	2026-09-22 11:48:28.032114-03
3d888b76-9d76-45c0-822e-d24c56b0993e	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-22 11:48:48.143015-03	2026-09-22 11:49:45.95926-03	2026-09-22 11:48:48.143015-03	2026-09-22 11:48:48.143015-03
d487e00a-5ac2-42cd-ac8a-4f6354dee36e	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-22 11:51:26.13385-03	2026-09-22 11:53:45.054662-03	2026-09-22 11:51:26.13385-03	2026-09-22 11:51:26.13385-03
706d444f-f542-4d54-8e2d-79c5e8956222	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-22 11:58:38.38907-03	2026-09-22 11:59:24.211666-03	2026-09-22 11:58:38.38907-03	2026-09-22 11:58:38.38907-03
bbb463ac-3116-4921-99f9-d36e774b8169	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-22 11:59:54.80371-03	2026-09-22 11:59:59.51258-03	2026-09-22 11:59:54.80371-03	2026-09-22 11:59:54.80371-03
fcbfcdc8-dbfd-4a6b-b53f-bb34adb7a0c7	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-22 12:04:23.08273-03	2026-09-22 12:05:01.121639-03	2026-09-22 12:04:23.08273-03	2026-09-22 12:04:23.08273-03
a90f8754-2632-41ab-a583-f0d2514056f2	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-22 12:05:03.337331-03	2026-09-22 12:06:02.702162-03	2026-09-22 12:05:03.337331-03	2026-09-22 12:05:03.337331-03
d84c3270-08e1-4ab7-9b21-1d049ceba5d6	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	finished	1	3218d5b4-372e-424e-9d91-dedea2b741f3	2026-09-22 12:08:41.085646-03	2026-09-22 12:08:58.010471-03	2026-09-22 12:08:41.085646-03	2026-09-22 12:08:41.085646-03
\.


--
-- Data for Name: zonasConquistaProtecaoCheckpointIndividual; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."zonasConquistaProtecaoCheckpointIndividual" (id, partida_id, checkpoint_id, crianca_id, protection_until, created_at) FROM stdin;
\.


--
-- Data for Name: zonasConquistaTempoTime; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."zonasConquistaTempoTime" (id, partida_id, empresa_id, evento_id, time_id, status, zones_dominated, checkpoints_read, total_points, started_at, completed_at, elapsed_ms, created_at, updated_at) FROM stdin;
671a834a-f7bb-46e7-8713-f57d72199170	2b39ec03-fe9c-466d-81f7-44b395d5c3d3	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	finished	0	0	0.00	2026-09-25 15:17:17.518552-03	2026-09-25 15:19:30.54-03	\N	2026-09-25 15:17:17.518552-03	2026-09-25 15:17:17.518552-03
0eabd660-c0cf-494e-8361-edf9515f976a	2b39ec03-fe9c-466d-81f7-44b395d5c3d3	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	finished	0	0	0.00	2026-09-25 15:17:17.526299-03	2026-09-25 15:19:30.54-03	\N	2026-09-25 15:17:17.526299-03	2026-09-25 15:17:17.526299-03
2277c6b7-7fe8-4df0-9469-35259b8b995c	49521227-c098-4e6b-b819-8d0976a8a74a	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	finished	0	1	10.00	2026-09-29 16:26:55.61861-03	2026-09-29 16:27:18.181-03	\N	2026-09-29 16:26:55.61861-03	2026-09-29 16:27:02.65-03
c2b4a0d0-d586-4400-ac73-eca382e593a0	49521227-c098-4e6b-b819-8d0976a8a74a	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	finished	0	0	0.00	2026-09-29 16:26:55.627343-03	2026-09-29 16:27:18.181-03	\N	2026-09-29 16:26:55.627343-03	2026-09-29 16:26:55.627343-03
2c4d2e35-8479-43b3-9828-cdcb117ea303	aa8127a0-d52c-4640-b476-ce591cdd3e70	c9287e4b-399d-4764-8bff-2e0ce7058dcb	4695594c-19e9-493f-86a9-dfe79941400e	aea6e59c-7626-4e57-964a-5bf49620b671	finished	0	0	0.00	2026-10-01 14:53:20.872806-03	2026-10-01 14:55:05.772-03	\N	2026-10-01 14:53:20.872806-03	2026-10-01 14:53:20.872806-03
09b52c04-8301-48f8-b2f5-08bc1c706c06	aa8127a0-d52c-4640-b476-ce591cdd3e70	c9287e4b-399d-4764-8bff-2e0ce7058dcb	4695594c-19e9-493f-86a9-dfe79941400e	e4feef99-4920-4c40-b3c2-1c3a31c62f08	finished	0	0	0.00	2026-10-01 14:53:20.880855-03	2026-10-01 14:55:05.772-03	\N	2026-10-01 14:53:20.880855-03	2026-10-01 14:53:20.880855-03
8cc1c02d-782a-43da-9574-0656550913f4	c7a89a0d-6c98-425f-a2ce-a76c1298bda6	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	finished	0	3	30.00	2026-09-25 15:39:49.121734-03	2026-09-25 15:40:31.635-03	\N	2026-09-25 15:39:49.121734-03	2026-09-25 15:40:16.561-03
58773065-ce1c-43b7-8daa-c6c01bff1bb4	c7a89a0d-6c98-425f-a2ce-a76c1298bda6	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	finished	0	4	40.00	2026-09-25 15:39:49.125738-03	2026-09-25 15:40:31.635-03	\N	2026-09-25 15:39:49.125738-03	2026-09-25 15:40:26.905-03
bc9b627d-6cac-49a2-bec3-162ea68ce443	718a6b2e-5402-40bd-9c9b-f3ca11da73a6	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	finished	0	0	0.00	2026-09-25 15:54:35.293067-03	2026-09-25 15:54:37.898-03	\N	2026-09-25 15:54:35.293067-03	2026-09-25 15:54:35.293067-03
32e1e4a7-5de5-48c5-ad59-1d0b045c09c1	718a6b2e-5402-40bd-9c9b-f3ca11da73a6	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	finished	0	0	0.00	2026-09-25 15:54:35.297732-03	2026-09-25 15:54:37.898-03	\N	2026-09-25 15:54:35.297732-03	2026-09-25 15:54:35.297732-03
16fcff94-26f5-430e-8ba9-c01066fd4a2c	d3020904-ba10-4fc6-8b46-bc3967d34a8d	c9287e4b-399d-4764-8bff-2e0ce7058dcb	c920334b-c141-47ea-a791-dd2c9828be58	3e781f1a-bd88-426c-b2de-d47f2489cc65	finished	0	0	0.00	2026-10-05 13:49:24.358298-03	2026-10-05 13:49:33.216-03	\N	2026-10-05 13:49:24.358298-03	2026-10-05 13:49:24.358298-03
3f871130-7dfb-495d-8c1c-056611eda9f9	e3c791bf-f725-4ff3-a28f-223be5fda429	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	finished	0	0	0.00	2026-09-25 15:54:40.742511-03	2026-09-25 15:55:52.207-03	\N	2026-09-25 15:54:40.742511-03	2026-09-25 15:54:40.742511-03
04bde8de-d5f0-46a4-930a-5d0917ce543f	e3c791bf-f725-4ff3-a28f-223be5fda429	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	finished	0	2	20.00	2026-09-25 15:54:40.747331-03	2026-09-25 15:55:52.207-03	\N	2026-09-25 15:54:40.747331-03	2026-09-25 15:54:57.546-03
1adbf4f5-eaff-4aef-a2ce-178a65efb53f	d3020904-ba10-4fc6-8b46-bc3967d34a8d	c9287e4b-399d-4764-8bff-2e0ce7058dcb	c920334b-c141-47ea-a791-dd2c9828be58	697df292-ec0f-40e5-97d5-1c77c6e539ff	finished	0	0	0.00	2026-10-05 13:49:24.535725-03	2026-10-05 13:49:33.216-03	\N	2026-10-05 13:49:24.535725-03	2026-10-05 13:49:24.535725-03
c3f83e81-5b8b-4d57-894d-90b0b1a443ab	7c21fbbb-5f23-4e04-9d4c-3475225c6a19	c9287e4b-399d-4764-8bff-2e0ce7058dcb	c920334b-c141-47ea-a791-dd2c9828be58	3e781f1a-bd88-426c-b2de-d47f2489cc65	finished	0	4	40.00	2026-10-05 13:50:27.778652-03	2026-10-05 13:51:43.198-03	\N	2026-10-05 13:50:27.778652-03	2026-10-05 13:50:54.404-03
980eaebc-4606-4856-bc49-8986a75ca473	7c21fbbb-5f23-4e04-9d4c-3475225c6a19	c9287e4b-399d-4764-8bff-2e0ce7058dcb	c920334b-c141-47ea-a791-dd2c9828be58	697df292-ec0f-40e5-97d5-1c77c6e539ff	finished	0	4	40.00	2026-10-05 13:50:27.912406-03	2026-10-05 13:51:43.198-03	\N	2026-10-05 13:50:27.912406-03	2026-10-05 13:51:26.044-03
\.


--
-- Data for Name: zonasEquipesEstadosTime; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."zonasEquipesEstadosTime" (id, partida_id, empresa_id, evento_id, time_id, status, version, defeated_at, victory_at, created_at) FROM stdin;
142321a4-241c-4b2f-a6fb-ceff91a6cd05	1e786539-e8d9-446c-9e40-65f302754df8	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	finished	1	\N	\N	2026-09-22 17:14:41.364284-03
8b9d11e1-2807-4360-bfe8-7c6e85e5e1f8	1e786539-e8d9-446c-9e40-65f302754df8	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	finished	1	\N	\N	2026-09-22 17:14:41.364284-03
afbcc066-c1b0-4faa-9542-443ea77b4c00	0a192366-b1c7-4561-9a90-b77b4794d362	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	finished	1	\N	\N	2026-09-22 17:17:52.280737-03
b1853bec-2905-457b-aa16-4d4c77276167	0a192366-b1c7-4561-9a90-b77b4794d362	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	finished	1	\N	\N	2026-09-22 17:17:52.280737-03
a51d02d6-3b61-49dc-a4b5-ea258dcb4bb5	4183ad9b-01ca-4c15-aee6-54ff2e9f3fcf	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	finished	2	\N	2026-09-23 15:30:29.563-03	2026-09-23 15:29:43.362006-03
915f7b08-ee16-4f1e-bb7c-53d921dbf02b	4183ad9b-01ca-4c15-aee6-54ff2e9f3fcf	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	finished	2	2026-09-23 15:30:29.563-03	\N	2026-09-23 15:29:43.362006-03
f4f27708-685f-409b-911d-6ed64d675ddb	b95d92c2-47c9-49e1-9f7f-0be7dc22256b	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	finished	2	\N	2026-09-23 15:30:53.15-03	2026-09-23 15:30:35.018748-03
d06a7525-69bc-4596-b91b-957dc9bad825	b95d92c2-47c9-49e1-9f7f-0be7dc22256b	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	finished	2	2026-09-23 15:30:53.15-03	\N	2026-09-23 15:30:35.018748-03
e17f90f5-58b3-4682-8f18-d0e0c542faa2	5d0cba16-e5af-4911-af8c-4d0b8e8ba34c	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	finished	1	\N	\N	2026-09-23 17:17:05.790133-03
2b664564-96d1-44a0-8fce-ff818f001507	5d0cba16-e5af-4911-af8c-4d0b8e8ba34c	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	finished	1	\N	\N	2026-09-23 17:17:05.790133-03
6762d392-c459-403e-aca6-d4e17e9d69b3	01057af7-0bf5-48f8-a015-b8262ad2820c	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	finished	2	2026-09-25 11:44:04.791-03	\N	2026-09-25 11:43:46.106113-03
888e3f8d-8a08-45c9-8d0b-35f9f4ad74a1	01057af7-0bf5-48f8-a015-b8262ad2820c	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	finished	2	\N	2026-09-25 11:44:04.791-03	2026-09-25 11:43:46.106113-03
1c034a9f-821e-4607-9728-e60358ee7a24	3c17fe62-5a34-4800-9d2f-5b28096c0003	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	finished	2	\N	2026-09-25 10:54:55.315-03	2026-09-25 10:54:29.065269-03
8dc2bb91-a808-41a2-b1b6-4b3373e5bd99	3c17fe62-5a34-4800-9d2f-5b28096c0003	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	finished	2	2026-09-25 10:54:55.315-03	\N	2026-09-25 10:54:29.065269-03
72a2051c-9e2a-4456-a19b-3b17b9f0cfa6	1e47fc5c-0bc9-4450-9736-64023282efeb	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	3218d5b4-372e-424e-9d91-dedea2b741f3	finished	1	\N	\N	2026-09-25 11:46:45.801652-03
f0d15780-4382-4862-b463-af3463d14f15	1e47fc5c-0bc9-4450-9736-64023282efeb	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a8238112-f78c-4a80-95d3-4d18336f1318	finished	1	\N	\N	2026-09-25 11:46:45.801652-03
\.


--
-- Data for Name: zonasEquipesPartidas; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."zonasEquipesPartidas" (id, empresa_id, evento_id, brincadeira_id, status, version, started_at, finished_at, created_at) FROM stdin;
1e786539-e8d9-446c-9e40-65f302754df8	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	finished	1	2026-09-22 17:14:41.373-03	2026-09-22 17:17:40.687653-03	2026-09-22 17:14:41.364284-03
0a192366-b1c7-4561-9a90-b77b4794d362	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	finished	1	2026-09-22 17:17:52.289-03	2026-09-22 17:18:33.031652-03	2026-09-22 17:17:52.280737-03
4183ad9b-01ca-4c15-aee6-54ff2e9f3fcf	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	finished	1	2026-09-23 15:29:43.376-03	2026-09-23 15:30:29.578142-03	2026-09-23 15:29:43.362006-03
b95d92c2-47c9-49e1-9f7f-0be7dc22256b	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	finished	1	2026-09-23 15:30:35.03-03	2026-09-23 15:30:53.166552-03	2026-09-23 15:30:35.018748-03
5d0cba16-e5af-4911-af8c-4d0b8e8ba34c	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	finished	1	2026-09-23 17:17:05.802-03	2026-09-23 17:17:16.059986-03	2026-09-23 17:17:05.790133-03
3c17fe62-5a34-4800-9d2f-5b28096c0003	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	finished	1	2026-09-25 10:54:29.085-03	2026-09-25 10:54:55.34151-03	2026-09-25 10:54:29.065269-03
01057af7-0bf5-48f8-a015-b8262ad2820c	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	finished	1	2026-09-25 11:43:46.128-03	2026-09-25 11:44:04.809272-03	2026-09-25 11:43:46.106113-03
1e47fc5c-0bc9-4450-9736-64023282efeb	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	finished	1	2026-09-25 11:46:45.815-03	2026-09-25 11:46:56.111149-03	2026-09-25 11:46:45.801652-03
\.


--
-- Data for Name: zonasEquipesScans; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."zonasEquipesScans" (id, partida_id, empresa_id, evento_id, brincadeira_id, checkpoint_id, crianca_id, time_id, uid, leitura_id, version, scanned_at) FROM stdin;
ef31a221-c496-43c5-afd8-764b1b088541	4183ad9b-01ca-4c15-aee6-54ff2e9f3fcf	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	5	c9a7d7a2-56b3-4ba5-801a-aacee92fd45a	3218d5b4-372e-424e-9d91-dedea2b741f3	C7DD6359	4ddf948cca91d6	0	2026-09-23 15:29:54.796-03
3ccfc51f-314a-4e73-9435-2928ddf1603b	4183ad9b-01ca-4c15-aee6-54ff2e9f3fcf	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	5	c9a7d7a2-56b3-4ba5-801a-aacee92fd45a	3218d5b4-372e-424e-9d91-dedea2b741f3	C7DD6359	4ddf948ccaa56a	0	2026-09-23 15:29:59.782-03
f8afdaca-6ee9-40f9-9890-efeeb4143ad6	4183ad9b-01ca-4c15-aee6-54ff2e9f3fcf	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	5	c9a7d7a2-56b3-4ba5-801a-aacee92fd45a	3218d5b4-372e-424e-9d91-dedea2b741f3	C7DD6359	4ddf948ccace9c	0	2026-09-23 15:30:10.345-03
55728fd1-7713-46a6-913a-65e0be53294a	4183ad9b-01ca-4c15-aee6-54ff2e9f3fcf	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	5	c9a7d7a2-56b3-4ba5-801a-aacee92fd45a	3218d5b4-372e-424e-9d91-dedea2b741f3	C7DD6359	4ddf948ccaf28e	0	2026-09-23 15:30:19.545-03
3723a01f-44c9-439c-acd6-2193b7ee9d42	4183ad9b-01ca-4c15-aee6-54ff2e9f3fcf	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	5	c9a7d7a2-56b3-4ba5-801a-aacee92fd45a	3218d5b4-372e-424e-9d91-dedea2b741f3	C7DD6359	4ddf948ccb15b9	0	2026-09-23 15:30:28.531-03
ac5d545c-5388-494e-98f2-c6dd98f39d74	b95d92c2-47c9-49e1-9f7f-0be7dc22256b	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	5	c9a7d7a2-56b3-4ba5-801a-aacee92fd45a	3218d5b4-372e-424e-9d91-dedea2b741f3	C7DD6359	4ddf948ccb3fb9	0	2026-09-23 15:30:39.299-03
c58cc46f-026f-4c59-9339-884dcd72032c	b95d92c2-47c9-49e1-9f7f-0be7dc22256b	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	a456cd5f-cfc3-4e93-96c2-4232578f9ea2	5	c9a7d7a2-56b3-4ba5-801a-aacee92fd45a	3218d5b4-372e-424e-9d91-dedea2b741f3	C7DD6359	4ddf948ccb62ed	0	2026-09-23 15:30:48.304-03
428f7631-5880-4a07-9dd0-452cd5171308	3c17fe62-5a34-4800-9d2f-5b28096c0003	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	5	749fc814-f8ec-4587-b1fb-4df04cf71a75	a8238112-f78c-4a80-95d3-4d18336f1318	4CF30272	4ddf948c9473365	0	2026-09-25 10:54:33.371-03
ce88211e-763d-4334-889b-f6fd6889004b	3c17fe62-5a34-4800-9d2f-5b28096c0003	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	5	fc46b33d-f0fd-4ec2-8533-47026eccf79a	3218d5b4-372e-424e-9d91-dedea2b741f3	D79D7859	4ddf948c9474b3a	0	2026-09-25 10:54:39.471-03
305a4aa9-9721-48c4-9ca5-78a4df7cb21d	3c17fe62-5a34-4800-9d2f-5b28096c0003	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	6da6e7f8-0358-41e4-8dcd-253df10242bf	5	fc46b33d-f0fd-4ec2-8533-47026eccf79a	3218d5b4-372e-424e-9d91-dedea2b741f3	D79D7859	4ddf948c94773a1	0	2026-09-25 10:54:49.815-03
cffed448-d732-4830-8ef5-8f42c5d030ac	01057af7-0bf5-48f8-a015-b8262ad2820c	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	f9de27d6-278c-4a9b-8056-2c158c066951	5	749fc814-f8ec-4587-b1fb-4df04cf71a75	a8238112-f78c-4a80-95d3-4d18336f1318	4CF30272	4ddf948c974519f	0	2026-09-25 11:43:50.136-03
704ae46e-7a2b-4c14-b640-c3cb4bdf1f75	01057af7-0bf5-48f8-a015-b8262ad2820c	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	f9de27d6-278c-4a9b-8056-2c158c066951	5	fc46b33d-f0fd-4ec2-8533-47026eccf79a	3218d5b4-372e-424e-9d91-dedea2b741f3	D79D7859	4ddf948c9746686	0	2026-09-25 11:43:55.496-03
32913d21-7f0f-42db-98f5-2a939ee4abb7	01057af7-0bf5-48f8-a015-b8262ad2820c	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	f9de27d6-278c-4a9b-8056-2c158c066951	5	5c02da21-8385-41e7-9f76-990d313adeef	a8238112-f78c-4a80-95d3-4d18336f1318	17128659	4ddf948c974700e	0	2026-09-25 11:43:58.044-03
e109ca6a-95fe-446b-bc84-9e1bb08be067	01057af7-0bf5-48f8-a015-b8262ad2820c	c9287e4b-399d-4764-8bff-2e0ce7058dcb	9ba04dda-8cd4-4d44-a37b-3042a0b8519a	f9de27d6-278c-4a9b-8056-2c158c066951	5	c9a7d7a2-56b3-4ba5-801a-aacee92fd45a	3218d5b4-372e-424e-9d91-dedea2b741f3	C7DD6359	4ddf948c9748285	0	2026-09-25 11:44:02.657-03
\.


--
-- Data for Name: schema_migrations; Type: TABLE DATA; Schema: realtime; Owner: -
--

COPY realtime.schema_migrations (version, inserted_at) FROM stdin;
20211116024918	2026-07-24 14:06:47
20211116045059	2026-07-24 14:06:47
20211116050929	2026-07-24 14:06:47
20211116051442	2026-07-24 14:06:47
20211116212300	2026-07-24 14:06:47
20211116213355	2026-07-24 14:06:47
20211116213934	2026-07-24 14:06:47
20211116214523	2026-07-24 14:06:47
20211122062447	2026-07-24 14:06:47
20211124070109	2026-07-24 14:06:47
20211202204204	2026-07-24 14:06:47
20211202204605	2026-07-24 14:06:47
20211210212804	2026-07-24 14:06:47
20211228014915	2026-07-24 14:06:47
20220107221237	2026-07-24 14:06:47
20220228202821	2026-07-24 14:06:47
20220312004840	2026-07-24 14:06:47
20220603231003	2026-07-24 14:06:47
20220603232444	2026-07-24 14:06:47
20220615214548	2026-07-24 14:06:47
20220712093339	2026-07-24 14:06:47
20220908172859	2026-07-24 14:06:47
20220916233421	2026-07-24 14:06:47
20230119133233	2026-07-24 14:06:47
20230128025114	2026-07-24 14:06:47
20230128025212	2026-07-24 14:06:47
20230227211149	2026-07-24 14:06:47
20230228184745	2026-07-24 14:06:47
20230308225145	2026-07-24 14:06:47
20230328144023	2026-07-24 14:06:47
20231018144023	2026-07-24 14:06:47
20231204144023	2026-07-24 14:06:47
20231204144024	2026-07-24 14:06:47
20231204144025	2026-07-24 14:06:47
20240108234812	2026-07-24 14:06:47
20240109165339	2026-07-24 14:06:47
20240227174441	2026-07-24 14:06:47
20240311171622	2026-07-24 14:06:47
20240321100241	2026-07-24 14:06:47
20240401105812	2026-07-24 14:06:47
20240418121054	2026-07-24 14:06:47
20240523004032	2026-07-24 14:06:47
20240618124746	2026-07-24 14:06:47
20240801235015	2026-07-24 14:06:47
20240805133720	2026-07-24 14:06:47
20240827160934	2026-07-24 14:06:47
20240919163303	2026-07-24 14:06:47
20240919163305	2026-07-24 14:06:47
20241019105805	2026-07-24 14:06:47
20241030150047	2026-07-24 14:06:47
20241108114728	2026-07-24 14:06:47
20241121104152	2026-07-24 14:06:47
20241130184212	2026-07-24 14:06:47
20241220035512	2026-07-24 14:06:47
20241220123912	2026-07-24 14:06:47
20241224161212	2026-07-24 14:06:47
20250107150512	2026-07-24 14:06:47
20250110162412	2026-07-24 14:06:47
20250123174212	2026-07-24 14:06:47
20250128220012	2026-07-24 14:06:47
20250506224012	2026-07-24 14:06:47
20250523164012	2026-07-24 14:06:47
20250714121412	2026-07-24 14:06:47
20250905041441	2026-07-24 14:06:47
20251103001201	2026-07-24 14:06:47
20251120212548	2026-07-24 14:06:47
20251120215549	2026-07-24 14:06:47
20260218120000	2026-07-24 14:06:47
20260326120000	2026-07-24 14:06:47
20260514120000	2026-07-24 14:06:47
20260527120000	2026-07-24 14:06:47
20260528120000	2026-07-24 14:06:47
20260603120000	2026-07-24 14:06:47
20260605120000	2026-07-24 14:06:47
20260606110000	2026-07-24 14:06:47
20260616120000	2026-07-24 14:06:47
20260624120000	2026-07-24 14:06:47
20260626120000	2026-07-24 14:06:47
20260706120000	2026-07-24 14:06:47
20260707120000	2026-07-24 14:06:47
20260709120000	2026-07-24 14:06:47
20260714120000	2026-09-14 10:54:33
20260827120000	2026-09-16 20:18:31
20260914120000	2026-09-22 12:45:12
20260916120000	2026-09-22 12:45:12
20260922120000	2026-09-29 12:09:09
20260925120000	2026-10-05 12:00:51
20260928120000	2026-10-05 12:00:51
\.


--
-- Data for Name: subscription; Type: TABLE DATA; Schema: realtime; Owner: -
--

COPY realtime.subscription (id, subscription_id, entity, filters, claims, created_at, action_filter, selected_columns) FROM stdin;
\.


--
-- Data for Name: buckets; Type: TABLE DATA; Schema: storage; Owner: -
--

COPY storage.buckets (id, name, owner, created_at, updated_at, public, avif_autodetection, file_size_limit, allowed_mime_types, owner_id, type, versioning_status, lifecycle_configuration, lifecycle_configuration_generation) FROM stdin;
\.


--
-- Data for Name: buckets_analytics; Type: TABLE DATA; Schema: storage; Owner: -
--

COPY storage.buckets_analytics (name, type, format, created_at, updated_at, id, deleted_at) FROM stdin;
\.


--
-- Data for Name: buckets_vectors; Type: TABLE DATA; Schema: storage; Owner: -
--

COPY storage.buckets_vectors (id, type, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: migrations; Type: TABLE DATA; Schema: storage; Owner: -
--

COPY storage.migrations (id, name, hash, executed_at) FROM stdin;
0	create-migrations-table	e18db593bcde2aca2a408c4d1100f6abba2195df	2026-07-24 14:06:50.723071
1	initialmigration	6ab16121fbaa08bbd11b712d05f358f9b555d777	2026-07-24 14:06:50.730741
2	storage-schema	f6a1fa2c93cbcd16d4e487b362e45fca157a8dbd	2026-07-24 14:06:50.736715
3	pathtoken-column	2cb1b0004b817b29d5b0a971af16bafeede4b70d	2026-07-24 14:06:50.749153
4	add-migrations-rls	427c5b63fe1c5937495d9c635c263ee7a5905058	2026-07-24 14:06:50.76248
5	add-size-functions	79e081a1455b63666c1294a440f8ad4b1e6a7f84	2026-07-24 14:06:50.766985
6	change-column-name-in-get-size	ded78e2f1b5d7e616117897e6443a925965b30d2	2026-07-24 14:06:50.772151
7	add-rls-to-buckets	e7e7f86adbc51049f341dfe8d30256c1abca17aa	2026-07-24 14:06:50.776992
8	add-public-to-buckets	fd670db39ed65f9d08b01db09d6202503ca2bab3	2026-07-24 14:06:50.78145
9	fix-search-function	af597a1b590c70519b464a4ab3be54490712796b	2026-07-24 14:06:50.786273
10	search-files-search-function	b595f05e92f7e91211af1bbfe9c6a13bb3391e16	2026-07-24 14:06:50.790946
11	add-trigger-to-auto-update-updated_at-column	7425bdb14366d1739fa8a18c83100636d74dcaa2	2026-07-24 14:06:50.79679
12	add-automatic-avif-detection-flag	8e92e1266eb29518b6a4c5313ab8f29dd0d08df9	2026-07-24 14:06:50.80226
13	add-bucket-custom-limits	cce962054138135cd9a8c4bcd531598684b25e7d	2026-07-24 14:06:50.807196
14	use-bytes-for-max-size	941c41b346f9802b411f06f30e972ad4744dad27	2026-07-24 14:06:50.812181
15	add-can-insert-object-function	934146bc38ead475f4ef4b555c524ee5d66799e5	2026-07-24 14:06:50.834375
16	add-version	76debf38d3fd07dcfc747ca49096457d95b1221b	2026-07-24 14:06:50.839602
17	drop-owner-foreign-key	f1cbb288f1b7a4c1eb8c38504b80ae2a0153d101	2026-07-24 14:06:50.844087
18	add_owner_id_column_deprecate_owner	e7a511b379110b08e2f214be852c35414749fe66	2026-07-24 14:06:50.848647
19	alter-default-value-objects-id	02e5e22a78626187e00d173dc45f58fa66a4f043	2026-07-24 14:06:50.854775
20	list-objects-with-delimiter	cd694ae708e51ba82bf012bba00caf4f3b6393b7	2026-07-24 14:06:50.859532
21	s3-multipart-uploads	8c804d4a566c40cd1e4cc5b3725a664a9303657f	2026-07-24 14:06:50.866495
22	s3-multipart-uploads-big-ints	9737dc258d2397953c9953d9b86920b8be0cdb73	2026-07-24 14:06:50.88012
23	optimize-search-function	9d7e604cddc4b56a5422dc68c9313f4a1b6f132c	2026-07-24 14:06:50.890237
24	operation-function	8312e37c2bf9e76bbe841aa5fda889206d2bf8aa	2026-07-24 14:06:50.895787
25	custom-metadata	d974c6057c3db1c1f847afa0e291e6165693b990	2026-07-24 14:06:50.900838
26	objects-prefixes	215cabcb7f78121892a5a2037a09fedf9a1ae322	2026-07-24 14:06:50.905838
27	search-v2	859ba38092ac96eb3964d83bf53ccc0b141663a6	2026-07-24 14:06:50.911786
28	object-bucket-name-sorting	c73a2b5b5d4041e39705814fd3a1b95502d38ce4	2026-07-24 14:06:50.916242
29	create-prefixes	ad2c1207f76703d11a9f9007f821620017a66c21	2026-07-24 14:06:50.920689
30	update-object-levels	2be814ff05c8252fdfdc7cfb4b7f5c7e17f0bed6	2026-07-24 14:06:50.925041
31	objects-level-index	b40367c14c3440ec75f19bbce2d71e914ddd3da0	2026-07-24 14:06:50.929349
32	backward-compatible-index-on-objects	e0c37182b0f7aee3efd823298fb3c76f1042c0f7	2026-07-24 14:06:50.933718
33	backward-compatible-index-on-prefixes	b480e99ed951e0900f033ec4eb34b5bdcb4e3d49	2026-07-24 14:06:50.938718
34	optimize-search-function-v1	ca80a3dc7bfef894df17108785ce29a7fc8ee456	2026-07-24 14:06:50.942933
35	add-insert-trigger-prefixes	458fe0ffd07ec53f5e3ce9df51bfdf4861929ccc	2026-07-24 14:06:50.947192
36	optimise-existing-functions	6ae5fca6af5c55abe95369cd4f93985d1814ca8f	2026-07-24 14:06:50.951574
37	add-bucket-name-length-trigger	3944135b4e3e8b22d6d4cbb568fe3b0b51df15c1	2026-07-24 14:06:50.955809
38	iceberg-catalog-flag-on-buckets	02716b81ceec9705aed84aa1501657095b32e5c5	2026-07-24 14:06:50.960988
39	add-search-v2-sort-support	6706c5f2928846abee18461279799ad12b279b78	2026-07-24 14:06:50.969178
40	fix-prefix-race-conditions-optimized	7ad69982ae2d372b21f48fc4829ae9752c518f6b	2026-07-24 14:06:50.973461
41	add-object-level-update-trigger	07fcf1a22165849b7a029deed059ffcde08d1ae0	2026-07-24 14:06:50.977841
42	rollback-prefix-triggers	771479077764adc09e2ea2043eb627503c034cd4	2026-07-24 14:06:50.982175
43	fix-object-level	84b35d6caca9d937478ad8a797491f38b8c2979f	2026-07-24 14:06:50.986745
44	vector-bucket-type	99c20c0ffd52bb1ff1f32fb992f3b351e3ef8fb3	2026-07-24 14:06:50.990997
45	vector-buckets	049e27196d77a7cb76497a85afae669d8b230953	2026-07-24 14:06:50.99612
46	buckets-objects-grants	fedeb96d60fefd8e02ab3ded9fbde05632f84aed	2026-07-24 14:06:51.009629
47	iceberg-table-metadata	649df56855c24d8b36dd4cc1aeb8251aa9ad42c2	2026-07-24 14:06:51.014833
48	iceberg-catalog-ids	e0e8b460c609b9999ccd0df9ad14294613eed939	2026-07-24 14:06:51.019372
49	buckets-objects-grants-postgres	072b1195d0d5a2f888af6b2302a1938dd94b8b3d	2026-07-24 14:06:51.034468
50	search-v2-optimised	6323ac4f850aa14e7387eb32102869578b5bd478	2026-07-24 14:06:51.039587
51	index-backward-compatible-search	2ee395d433f76e38bcd3856debaf6e0e5b674011	2026-07-24 14:06:51.395892
52	drop-not-used-indexes-and-functions	5cc44c8696749ac11dd0dc37f2a3802075f3a171	2026-07-24 14:06:51.398207
53	drop-index-lower-name	d0cb18777d9e2a98ebe0bc5cc7a42e57ebe41854	2026-07-24 14:06:51.409429
54	drop-index-object-level	6289e048b1472da17c31a7eba1ded625a6457e67	2026-07-24 14:06:51.412124
55	prevent-direct-deletes	262a4798d5e0f2e7c8970232e03ce8be695d5819	2026-07-24 14:06:51.41368
56	fix-optimized-search-function	b823ed1e418101032fa01374edc9a436e54e3ed4	2026-07-24 14:06:51.419103
57	s3-multipart-uploads-metadata	f127886e00d1b374fadbc7c6b31e09336aad5287	2026-07-24 14:06:51.425002
58	operation-ergonomics	00ca5d483b3fe0d522133d9002ccc5df98365120	2026-07-24 14:06:51.42964
59	drop-unused-functions	38456f13e39691c2bbb4b5151d0d1cdbabd4a8c4	2026-07-24 14:06:51.435064
60	optimize-existing-functions-again	db35e1c91a9201e59f4fef8d972c2f277d68b157	2026-07-24 14:06:51.43999
61	mark-filename-immutable	fe0096517ae9d60aaec1d110172ba9036dc66bb7	2026-08-11 13:09:57.895334
62	object-versioning-core	0b855f00ff3be0bfca91efee02a9858912491a9a	2026-09-14 10:54:33.558246
63	fix-search-name-relative-to-prefix	c7485e417624f795ce8bb2da21927f48e088904d	2026-09-14 10:54:33.579534
64	fix-search-by-timestamp-sqli	0af424ecd388a39bb1645184b222185a12149675	2026-09-14 10:54:33.588704
66	objects-current-version-index	191466c93aa2c46a00e36505577c5fcab8d7cb4b	2026-09-14 10:54:34.348066
67	objects-null-version-index	15bfe8c35b66642b6c78ba60060fa8793bd2207a	2026-09-14 10:54:34.354772
65	objects-key-version-index	da319c4b89ba800ce795d1b699f3a70675138058	2026-09-14 10:54:34.33944
68	bucket-lifecycle-configuration	3c08f6f889922f399519722a932b51007c11bebc	2026-09-16 20:18:32.461459
69	validate-bucket-lifecycle-constraints	4febacaaaa0e61e2b783bef081fe03a287e65eb3	2026-09-16 20:18:32.895714
70	list-objects-with-versions	5c17c3777616cd8d7b18b82835525fa3205af57b	2026-09-16 20:18:32.904257
71	objects-delete-marker-index	6d14858e66c66f8d6accf8a2630aefd1527fddba	2026-09-16 20:18:33.575768
72	drop-bucketid-objname-index	302beb09e1b469d7d4db19566f2389d280b64aa3	2026-09-16 20:18:33.59081
\.


--
-- Data for Name: objects; Type: TABLE DATA; Schema: storage; Owner: -
--

COPY storage.objects (id, bucket_id, name, owner, created_at, updated_at, last_accessed_at, metadata, version, owner_id, user_metadata, archived_at, is_delete_marker, is_versioned) FROM stdin;
\.


--
-- Data for Name: s3_multipart_uploads; Type: TABLE DATA; Schema: storage; Owner: -
--

COPY storage.s3_multipart_uploads (id, in_progress_size, upload_signature, bucket_id, key, version, owner_id, created_at, user_metadata, metadata) FROM stdin;
\.


--
-- Data for Name: s3_multipart_uploads_parts; Type: TABLE DATA; Schema: storage; Owner: -
--

COPY storage.s3_multipart_uploads_parts (id, upload_id, size, part_number, bucket_id, key, etag, owner_id, version, created_at) FROM stdin;
\.


--
-- Data for Name: vector_indexes; Type: TABLE DATA; Schema: storage; Owner: -
--

COPY storage.vector_indexes (id, name, bucket_id, data_type, dimension, distance_metric, metadata_configuration, created_at, updated_at) FROM stdin;
\.


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE SET; Schema: auth; Owner: -
--

SELECT pg_catalog.setval('auth.refresh_tokens_id_seq', 1, false);


--
-- Name: checkpoint_tags_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.checkpoint_tags_id_seq', 1, false);


--
-- Name: logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.logs_id_seq', 1, false);


--
-- Name: settings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.settings_id_seq', 17, true);


--
-- Name: subscription_id_seq; Type: SEQUENCE SET; Schema: realtime; Owner: -
--

SELECT pg_catalog.setval('realtime.subscription_id_seq', 1, false);


--
-- Name: mfa_amr_claims amr_id_pk; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT amr_id_pk PRIMARY KEY (id);


--
-- Name: audit_log_entries audit_log_entries_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.audit_log_entries
    ADD CONSTRAINT audit_log_entries_pkey PRIMARY KEY (id);


--
-- Name: custom_oauth_providers custom_oauth_providers_identifier_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.custom_oauth_providers
    ADD CONSTRAINT custom_oauth_providers_identifier_key UNIQUE (identifier);


--
-- Name: custom_oauth_providers custom_oauth_providers_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.custom_oauth_providers
    ADD CONSTRAINT custom_oauth_providers_pkey PRIMARY KEY (id);


--
-- Name: flow_state flow_state_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.flow_state
    ADD CONSTRAINT flow_state_pkey PRIMARY KEY (id);


--
-- Name: identities identities_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_pkey PRIMARY KEY (id);


--
-- Name: identities identities_provider_id_provider_unique; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_provider_id_provider_unique UNIQUE (provider_id, provider);


--
-- Name: instances instances_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.instances
    ADD CONSTRAINT instances_pkey PRIMARY KEY (id);


--
-- Name: mfa_amr_claims mfa_amr_claims_session_id_authentication_method_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT mfa_amr_claims_session_id_authentication_method_pkey UNIQUE (session_id, authentication_method);


--
-- Name: mfa_challenges mfa_challenges_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_challenges
    ADD CONSTRAINT mfa_challenges_pkey PRIMARY KEY (id);


--
-- Name: mfa_factors mfa_factors_last_challenged_at_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_last_challenged_at_key UNIQUE (last_challenged_at);


--
-- Name: mfa_factors mfa_factors_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_pkey PRIMARY KEY (id);


--
-- Name: mfa_recovery_code_sets mfa_recovery_code_sets_mfa_factor_id_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_recovery_code_sets
    ADD CONSTRAINT mfa_recovery_code_sets_mfa_factor_id_key UNIQUE (mfa_factor_id);


--
-- Name: mfa_recovery_code_sets mfa_recovery_code_sets_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_recovery_code_sets
    ADD CONSTRAINT mfa_recovery_code_sets_pkey PRIMARY KEY (id);


--
-- Name: mfa_recovery_code_sets mfa_recovery_code_sets_user_id_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_recovery_code_sets
    ADD CONSTRAINT mfa_recovery_code_sets_user_id_key UNIQUE (user_id);


--
-- Name: mfa_recovery_codes mfa_recovery_codes_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_recovery_codes
    ADD CONSTRAINT mfa_recovery_codes_pkey PRIMARY KEY (id);


--
-- Name: oauth_authorizations oauth_authorizations_authorization_code_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_authorization_code_key UNIQUE (authorization_code);


--
-- Name: oauth_authorizations oauth_authorizations_authorization_id_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_authorization_id_key UNIQUE (authorization_id);


--
-- Name: oauth_authorizations oauth_authorizations_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_pkey PRIMARY KEY (id);


--
-- Name: oauth_client_states oauth_client_states_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_client_states
    ADD CONSTRAINT oauth_client_states_pkey PRIMARY KEY (id);


--
-- Name: oauth_clients oauth_clients_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_clients
    ADD CONSTRAINT oauth_clients_pkey PRIMARY KEY (id);


--
-- Name: oauth_consents oauth_consents_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_pkey PRIMARY KEY (id);


--
-- Name: oauth_consents oauth_consents_user_client_unique; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_user_client_unique UNIQUE (user_id, client_id);


--
-- Name: one_time_tokens one_time_tokens_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.one_time_tokens
    ADD CONSTRAINT one_time_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_token_unique; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_token_unique UNIQUE (token);


--
-- Name: saml_providers saml_providers_entity_id_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_entity_id_key UNIQUE (entity_id);


--
-- Name: saml_providers saml_providers_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_pkey PRIMARY KEY (id);


--
-- Name: saml_relay_states saml_relay_states_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: scim_tokens scim_tokens_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.scim_tokens
    ADD CONSTRAINT scim_tokens_pkey PRIMARY KEY (id);


--
-- Name: scim_users scim_users_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.scim_users
    ADD CONSTRAINT scim_users_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: sso_domains sso_domains_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sso_domains
    ADD CONSTRAINT sso_domains_pkey PRIMARY KEY (id);


--
-- Name: sso_providers sso_providers_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sso_providers
    ADD CONSTRAINT sso_providers_pkey PRIMARY KEY (id);


--
-- Name: users users_phone_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_phone_key UNIQUE (phone);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: webauthn_challenges webauthn_challenges_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.webauthn_challenges
    ADD CONSTRAINT webauthn_challenges_pkey PRIMARY KEY (id);


--
-- Name: webauthn_credentials webauthn_credentials_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.webauthn_credentials
    ADD CONSTRAINT webauthn_credentials_pkey PRIMARY KEY (id);


--
-- Name: acessos UQ__logins__AB6E61641C935B6A; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acessos
    ADD CONSTRAINT "UQ__logins__AB6E61641C935B6A" UNIQUE (email);


--
-- Name: cacaTesourScans UQ_caca_tesouro_scan_crianca; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."cacaTesourScans"
    ADD CONSTRAINT "UQ_caca_tesouro_scan_crianca" UNIQUE ("partidaId", "numeroRonda", "criancaId");


--
-- Name: cacaTesourTempos UQ_caca_tesouro_tempo_equipe; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."cacaTesourTempos"
    ADD CONSTRAINT "UQ_caca_tesouro_tempo_equipe" UNIQUE ("partidaId", "timeId");


--
-- Name: etiquetasCheckpoint UQ_checkpoint_tag; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."etiquetasCheckpoint"
    ADD CONSTRAINT "UQ_checkpoint_tag" UNIQUE ("checkpointId", "tagUid");


--
-- Name: brincadeiras brincadeiras_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brincadeiras
    ADD CONSTRAINT brincadeiras_pkey PRIMARY KEY ("brincadeiraId");


--
-- Name: cacaTesourPartidas caca_tesouro_partidas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."cacaTesourPartidas"
    ADD CONSTRAINT caca_tesouro_partidas_pkey PRIMARY KEY ("partidaId");


--
-- Name: cacaTesourScans caca_tesouro_scans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."cacaTesourScans"
    ADD CONSTRAINT caca_tesouro_scans_pkey PRIMARY KEY ("scanId");


--
-- Name: cacaTesourTempos caca_tesouro_tempos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."cacaTesourTempos"
    ADD CONSTRAINT caca_tesouro_tempos_pkey PRIMARY KEY ("tempoId");


--
-- Name: etiquetasCheckpoint checkpoint_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."etiquetasCheckpoint"
    ADD CONSTRAINT checkpoint_tags_pkey PRIMARY KEY ("tagId");


--
-- Name: pontoVerificacao checkpoints_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."pontoVerificacao"
    ADD CONSTRAINT checkpoints_pkey PRIMARY KEY ("checkpointId");


--
-- Name: clientes clientes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_pkey PRIMARY KEY ("clienteId");


--
-- Name: conquistas conquistas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conquistas
    ADD CONSTRAINT conquistas_pkey PRIMARY KEY ("conquistaId");


--
-- Name: criancaConquistas crianca_conquistas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."criancaConquistas"
    ADD CONSTRAINT crianca_conquistas_pkey PRIMARY KEY ("criancaId", "conquistaId");


--
-- Name: criancas criancas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.criancas
    ADD CONSTRAINT criancas_pkey PRIMARY KEY ("criancaId");


--
-- Name: criancas criancas_qr_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.criancas
    ADD CONSTRAINT criancas_qr_code_key UNIQUE (qr_code);


--
-- Name: empresaEventoControle empresa_event_control_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."empresaEventoControle"
    ADD CONSTRAINT empresa_event_control_pkey PRIMARY KEY (empresa_id);


--
-- Name: empresas empresas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresas
    ADD CONSTRAINT empresas_pkey PRIMARY KEY ("empresaId");


--
-- Name: estadoJogoEvento event_game_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."estadoJogoEvento"
    ADD CONSTRAINT event_game_state_pkey PRIMARY KEY (evento_id);


--
-- Name: eventoBrincadeiras evento_brincadeiras_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."eventoBrincadeiras"
    ADD CONSTRAINT evento_brincadeiras_pkey PRIMARY KEY ("eventoId", "brincadeiraId");


--
-- Name: eventos eventos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eventos
    ADD CONSTRAINT eventos_pkey PRIMARY KEY ("eventoId");


--
-- Name: vinculoFamiliar family_child_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."vinculoFamiliar"
    ADD CONSTRAINT family_child_links_pkey PRIMARY KEY ("vinculoId");


--
-- Name: conviteFamilia family_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."conviteFamilia"
    ADD CONSTRAINT family_invites_pkey PRIMARY KEY ("conviteId");


--
-- Name: codigosVinculoFamiliar family_linking_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."codigosVinculoFamiliar"
    ADD CONSTRAINT family_linking_codes_pkey PRIMARY KEY (id);


--
-- Name: codigosVinculoFamiliar family_linking_codes_qr_code_value_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."codigosVinculoFamiliar"
    ADD CONSTRAINT family_linking_codes_qr_code_value_key UNIQUE (qr_code_value);


--
-- Name: sessoesJogo game_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."sessoesJogo"
    ADD CONSTRAINT game_sessions_pkey PRIMARY KEY (id);


--
-- Name: bonusVencedorJogo game_winner_bonuses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."bonusVencedorJogo"
    ADD CONSTRAINT game_winner_bonuses_pkey PRIMARY KEY (id);


--
-- Name: leituras leituras_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leituras
    ADD CONSTRAINT leituras_pkey PRIMARY KEY ("leituraId");


--
-- Name: acessos logins_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acessos
    ADD CONSTRAINT logins_email_key UNIQUE (email);


--
-- Name: acessos logins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acessos
    ADD CONSTRAINT logins_pkey PRIMARY KEY ("loginId");


--
-- Name: logs logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logs
    ADD CONSTRAINT logs_pkey PRIMARY KEY ("logId");


--
-- Name: mensagensDisplay mensagens_display_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."mensagensDisplay"
    ADD CONSTRAINT mensagens_display_pkey PRIMARY KEY ("mensagemId");


--
-- Name: monsterCacaPartidas monster_hunt_partidas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."monsterCacaPartidas"
    ADD CONSTRAINT monster_hunt_partidas_pkey PRIMARY KEY (id);


--
-- Name: monsterCacaLeituras monster_hunt_scans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."monsterCacaLeituras"
    ADD CONSTRAINT monster_hunt_scans_pkey PRIMARY KEY (id);


--
-- Name: monsterCacaEstadosTime monster_hunt_team_states_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."monsterCacaEstadosTime"
    ADD CONSTRAINT monster_hunt_team_states_pkey PRIMARY KEY (id);


--
-- Name: pontuacoes pontuacoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pontuacoes
    ADD CONSTRAINT pontuacoes_pkey PRIMARY KEY ("pontuacaoId");


--
-- Name: pulseiras pulseiras_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pulseiras
    ADD CONSTRAINT pulseiras_pkey PRIMARY KEY (codigo);


--
-- Name: configuracoes settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.configuracoes
    ADD CONSTRAINT settings_pkey PRIMARY KEY ("settingId");


--
-- Name: chamadosSuport support_tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."chamadosSuport"
    ADD CONSTRAINT support_tickets_pkey PRIMARY KEY ("ticketId");


--
-- Name: times times_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.times
    ADD CONSTRAINT times_pkey PRIMARY KEY ("timeId");


--
-- Name: cacaTesourScans uq_caca_tesouro_scan_crianca; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."cacaTesourScans"
    ADD CONSTRAINT uq_caca_tesouro_scan_crianca UNIQUE ("partidaId", "numeroRonda", "criancaId");


--
-- Name: cacaTesourTempos uq_caca_tesouro_tempo_equipe; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."cacaTesourTempos"
    ADD CONSTRAINT uq_caca_tesouro_tempo_equipe UNIQUE ("partidaId", "timeId");


--
-- Name: etiquetasCheckpoint uq_checkpoint_tag; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."etiquetasCheckpoint"
    ADD CONSTRAINT uq_checkpoint_tag UNIQUE ("checkpointId", "tagUid");


--
-- Name: zonasEquipesPartidas zonas_equipes_partidas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."zonasEquipesPartidas"
    ADD CONSTRAINT zonas_equipes_partidas_pkey PRIMARY KEY (id);


--
-- Name: zonasEquipesScans zonas_equipes_scans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."zonasEquipesScans"
    ADD CONSTRAINT zonas_equipes_scans_pkey PRIMARY KEY (id);


--
-- Name: zonasEquipesEstadosTime zonas_equipes_teams_states_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."zonasEquipesEstadosTime"
    ADD CONSTRAINT zonas_equipes_teams_states_pkey PRIMARY KEY (id);


--
-- Name: zonas zonas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zonas
    ADD CONSTRAINT zonas_pkey PRIMARY KEY ("zonaId");


--
-- Name: zonasConquistaEstadosCheckpoint zone_conquest_checkpoint_states_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."zonasConquistaEstadosCheckpoint"
    ADD CONSTRAINT zone_conquest_checkpoint_states_pkey PRIMARY KEY (id);


--
-- Name: zonasConquistaProtecaoCheckpointIndividual zone_conquest_individual_checkpoint_protection_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."zonasConquistaProtecaoCheckpointIndividual"
    ADD CONSTRAINT zone_conquest_individual_checkpoint_protection_pkey PRIMARY KEY (id);


--
-- Name: zonasConquistaEstadosParticipanteIndividual zone_conquest_individual_participant_states_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."zonasConquistaEstadosParticipanteIndividual"
    ADD CONSTRAINT zone_conquest_individual_participant_states_pkey PRIMARY KEY (id);


--
-- Name: zonasConquistaPartidaIndividual zone_conquest_individual_partidas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."zonasConquistaPartidaIndividual"
    ADD CONSTRAINT zone_conquest_individual_partidas_pkey PRIMARY KEY (id);


--
-- Name: zonasConquistaLeituraIndividual zone_conquest_individual_scans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."zonasConquistaLeituraIndividual"
    ADD CONSTRAINT zone_conquest_individual_scans_pkey PRIMARY KEY (id);


--
-- Name: zonasConquistaPartidaTime zone_conquest_team_partidas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."zonasConquistaPartidaTime"
    ADD CONSTRAINT zone_conquest_team_partidas_pkey PRIMARY KEY (id);


--
-- Name: zonasConquistaLeituraTime zone_conquest_team_scans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."zonasConquistaLeituraTime"
    ADD CONSTRAINT zone_conquest_team_scans_pkey PRIMARY KEY (id);


--
-- Name: zonasConquistaTempoTime zone_conquest_team_tempos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."zonasConquistaTempoTime"
    ADD CONSTRAINT zone_conquest_team_tempos_pkey PRIMARY KEY (id);


--
-- Name: zonasConquistaEstadosZona zone_conquest_zone_states_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."zonasConquistaEstadosZona"
    ADD CONSTRAINT zone_conquest_zone_states_pkey PRIMARY KEY (id);


--
-- Name: messages messages_payload_exclusive; Type: CHECK CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE realtime.messages
    ADD CONSTRAINT messages_payload_exclusive CHECK (((payload IS NULL) OR (binary_payload IS NULL))) NOT VALID;


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: subscription pk_subscription; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.subscription
    ADD CONSTRAINT pk_subscription PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: buckets_analytics buckets_analytics_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.buckets_analytics
    ADD CONSTRAINT buckets_analytics_pkey PRIMARY KEY (id);


--
-- Name: buckets buckets_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.buckets
    ADD CONSTRAINT buckets_pkey PRIMARY KEY (id);


--
-- Name: buckets_vectors buckets_vectors_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.buckets_vectors
    ADD CONSTRAINT buckets_vectors_pkey PRIMARY KEY (id);


--
-- Name: migrations migrations_name_key; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.migrations
    ADD CONSTRAINT migrations_name_key UNIQUE (name);


--
-- Name: migrations migrations_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.migrations
    ADD CONSTRAINT migrations_pkey PRIMARY KEY (id);


--
-- Name: objects objects_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.objects
    ADD CONSTRAINT objects_pkey PRIMARY KEY (id);


--
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_pkey PRIMARY KEY (id);


--
-- Name: s3_multipart_uploads s3_multipart_uploads_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads
    ADD CONSTRAINT s3_multipart_uploads_pkey PRIMARY KEY (id);


--
-- Name: vector_indexes vector_indexes_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.vector_indexes
    ADD CONSTRAINT vector_indexes_pkey PRIMARY KEY (id);


--
-- Name: audit_logs_instance_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX audit_logs_instance_id_idx ON auth.audit_log_entries USING btree (instance_id);


--
-- Name: confirmation_token_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX confirmation_token_idx ON auth.users USING btree (confirmation_token) WHERE ((confirmation_token)::text !~ '^[0-9 ]*$'::text);


--
-- Name: custom_oauth_providers_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX custom_oauth_providers_created_at_idx ON auth.custom_oauth_providers USING btree (created_at);


--
-- Name: custom_oauth_providers_enabled_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX custom_oauth_providers_enabled_idx ON auth.custom_oauth_providers USING btree (enabled);


--
-- Name: custom_oauth_providers_identifier_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX custom_oauth_providers_identifier_idx ON auth.custom_oauth_providers USING btree (identifier);


--
-- Name: custom_oauth_providers_provider_type_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX custom_oauth_providers_provider_type_idx ON auth.custom_oauth_providers USING btree (provider_type);


--
-- Name: email_change_token_current_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX email_change_token_current_idx ON auth.users USING btree (email_change_token_current) WHERE ((email_change_token_current)::text !~ '^[0-9 ]*$'::text);


--
-- Name: email_change_token_new_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX email_change_token_new_idx ON auth.users USING btree (email_change_token_new) WHERE ((email_change_token_new)::text !~ '^[0-9 ]*$'::text);


--
-- Name: factor_id_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX factor_id_created_at_idx ON auth.mfa_factors USING btree (user_id, created_at);


--
-- Name: flow_state_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX flow_state_created_at_idx ON auth.flow_state USING btree (created_at DESC);


--
-- Name: identities_email_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX identities_email_idx ON auth.identities USING btree (email text_pattern_ops);


--
-- Name: INDEX identities_email_idx; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON INDEX auth.identities_email_idx IS 'Auth: Ensures indexed queries on the email column';


--
-- Name: identities_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX identities_user_id_idx ON auth.identities USING btree (user_id);


--
-- Name: idx_auth_code; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_auth_code ON auth.flow_state USING btree (auth_code);


--
-- Name: idx_oauth_client_states_created_at; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_oauth_client_states_created_at ON auth.oauth_client_states USING btree (created_at);


--
-- Name: idx_user_id_auth_method; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_user_id_auth_method ON auth.flow_state USING btree (user_id, authentication_method);


--
-- Name: idx_users_created_at_desc; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_users_created_at_desc ON auth.users USING btree (created_at DESC);


--
-- Name: idx_users_email; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_users_email ON auth.users USING btree (email);


--
-- Name: idx_users_last_sign_in_at_desc; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_users_last_sign_in_at_desc ON auth.users USING btree (last_sign_in_at DESC);


--
-- Name: idx_users_name; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_users_name ON auth.users USING btree (((raw_user_meta_data ->> 'name'::text))) WHERE ((raw_user_meta_data ->> 'name'::text) IS NOT NULL);


--
-- Name: mfa_challenge_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX mfa_challenge_created_at_idx ON auth.mfa_challenges USING btree (created_at DESC);


--
-- Name: mfa_factors_user_friendly_name_unique; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX mfa_factors_user_friendly_name_unique ON auth.mfa_factors USING btree (friendly_name, user_id) WHERE (TRIM(BOTH FROM friendly_name) <> ''::text);


--
-- Name: mfa_factors_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX mfa_factors_user_id_idx ON auth.mfa_factors USING btree (user_id);


--
-- Name: mfa_recovery_codes_set_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX mfa_recovery_codes_set_id_idx ON auth.mfa_recovery_codes USING btree (mfa_recovery_code_set_id);


--
-- Name: oauth_auth_pending_exp_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_auth_pending_exp_idx ON auth.oauth_authorizations USING btree (expires_at) WHERE (status = 'pending'::auth.oauth_authorization_status);


--
-- Name: oauth_clients_deleted_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_clients_deleted_at_idx ON auth.oauth_clients USING btree (deleted_at);


--
-- Name: oauth_consents_active_client_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_consents_active_client_idx ON auth.oauth_consents USING btree (client_id) WHERE (revoked_at IS NULL);


--
-- Name: oauth_consents_active_user_client_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_consents_active_user_client_idx ON auth.oauth_consents USING btree (user_id, client_id) WHERE (revoked_at IS NULL);


--
-- Name: oauth_consents_user_order_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_consents_user_order_idx ON auth.oauth_consents USING btree (user_id, granted_at DESC);


--
-- Name: one_time_tokens_relates_to_hash_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX one_time_tokens_relates_to_hash_idx ON auth.one_time_tokens USING hash (relates_to);


--
-- Name: one_time_tokens_token_hash_hash_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX one_time_tokens_token_hash_hash_idx ON auth.one_time_tokens USING hash (token_hash);


--
-- Name: one_time_tokens_user_id_token_type_key; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX one_time_tokens_user_id_token_type_key ON auth.one_time_tokens USING btree (user_id, token_type);


--
-- Name: reauthentication_token_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX reauthentication_token_idx ON auth.users USING btree (reauthentication_token) WHERE ((reauthentication_token)::text !~ '^[0-9 ]*$'::text);


--
-- Name: recovery_token_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX recovery_token_idx ON auth.users USING btree (recovery_token) WHERE ((recovery_token)::text !~ '^[0-9 ]*$'::text);


--
-- Name: refresh_tokens_instance_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_instance_id_idx ON auth.refresh_tokens USING btree (instance_id);


--
-- Name: refresh_tokens_instance_id_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_instance_id_user_id_idx ON auth.refresh_tokens USING btree (instance_id, user_id);


--
-- Name: refresh_tokens_parent_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_parent_idx ON auth.refresh_tokens USING btree (parent);


--
-- Name: refresh_tokens_session_id_revoked_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_session_id_revoked_idx ON auth.refresh_tokens USING btree (session_id, revoked);


--
-- Name: refresh_tokens_updated_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_updated_at_idx ON auth.refresh_tokens USING btree (updated_at DESC);


--
-- Name: saml_providers_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_providers_sso_provider_id_idx ON auth.saml_providers USING btree (sso_provider_id);


--
-- Name: saml_relay_states_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_relay_states_created_at_idx ON auth.saml_relay_states USING btree (created_at DESC);


--
-- Name: saml_relay_states_for_email_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_relay_states_for_email_idx ON auth.saml_relay_states USING btree (for_email);


--
-- Name: saml_relay_states_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_relay_states_sso_provider_id_idx ON auth.saml_relay_states USING btree (sso_provider_id);


--
-- Name: scim_tokens_expires_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX scim_tokens_expires_at_idx ON auth.scim_tokens USING btree (expires_at);


--
-- Name: scim_tokens_revoked_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX scim_tokens_revoked_at_idx ON auth.scim_tokens USING btree (revoked_at);


--
-- Name: scim_tokens_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX scim_tokens_sso_provider_id_idx ON auth.scim_tokens USING btree (sso_provider_id);


--
-- Name: scim_tokens_token_hash_key; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX scim_tokens_token_hash_key ON auth.scim_tokens USING btree (token_hash);


--
-- Name: scim_users_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX scim_users_created_at_idx ON auth.scim_users USING btree (sso_provider_id, created_at, id) WHERE (deleted_at IS NULL);


--
-- Name: scim_users_deleted_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX scim_users_deleted_at_idx ON auth.scim_users USING btree (deleted_at);


--
-- Name: scim_users_external_id_key; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX scim_users_external_id_key ON auth.scim_users USING btree (sso_provider_id, external_id) WHERE ((external_id IS NOT NULL) AND (deleted_at IS NULL));


--
-- Name: scim_users_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX scim_users_id_idx ON auth.scim_users USING btree (sso_provider_id, id) WHERE (deleted_at IS NULL);


--
-- Name: scim_users_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX scim_users_sso_provider_id_idx ON auth.scim_users USING btree (sso_provider_id);


--
-- Name: scim_users_updated_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX scim_users_updated_at_idx ON auth.scim_users USING btree (sso_provider_id, updated_at, id) WHERE (deleted_at IS NULL);


--
-- Name: scim_users_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX scim_users_user_id_idx ON auth.scim_users USING btree (user_id);


--
-- Name: scim_users_user_name_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX scim_users_user_name_idx ON auth.scim_users USING btree (sso_provider_id, user_name COLLATE "C", id) WHERE (deleted_at IS NULL);


--
-- Name: scim_users_user_name_key; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX scim_users_user_name_key ON auth.scim_users USING btree (sso_provider_id, user_name) WHERE (deleted_at IS NULL);


--
-- Name: sessions_not_after_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sessions_not_after_idx ON auth.sessions USING btree (not_after DESC);


--
-- Name: sessions_oauth_client_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sessions_oauth_client_id_idx ON auth.sessions USING btree (oauth_client_id);


--
-- Name: sessions_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sessions_user_id_idx ON auth.sessions USING btree (user_id);


--
-- Name: sso_domains_domain_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX sso_domains_domain_idx ON auth.sso_domains USING btree (lower(domain));


--
-- Name: sso_domains_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sso_domains_sso_provider_id_idx ON auth.sso_domains USING btree (sso_provider_id);


--
-- Name: sso_providers_resource_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX sso_providers_resource_id_idx ON auth.sso_providers USING btree (lower(resource_id));


--
-- Name: sso_providers_resource_id_pattern_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sso_providers_resource_id_pattern_idx ON auth.sso_providers USING btree (resource_id text_pattern_ops);


--
-- Name: unique_phone_factor_per_user; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX unique_phone_factor_per_user ON auth.mfa_factors USING btree (user_id, phone);


--
-- Name: user_id_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX user_id_created_at_idx ON auth.sessions USING btree (user_id, created_at);


--
-- Name: users_email_partial_key; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX users_email_partial_key ON auth.users USING btree (email) WHERE (is_sso_user = false);


--
-- Name: INDEX users_email_partial_key; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON INDEX auth.users_email_partial_key IS 'Auth: A partial unique index that applies only when is_sso_user is false';


--
-- Name: users_instance_id_email_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX users_instance_id_email_idx ON auth.users USING btree (instance_id, lower((email)::text));


--
-- Name: users_instance_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX users_instance_id_idx ON auth.users USING btree (instance_id);


--
-- Name: users_is_anonymous_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX users_is_anonymous_idx ON auth.users USING btree (is_anonymous);


--
-- Name: webauthn_challenges_expires_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX webauthn_challenges_expires_at_idx ON auth.webauthn_challenges USING btree (expires_at);


--
-- Name: webauthn_challenges_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX webauthn_challenges_user_id_idx ON auth.webauthn_challenges USING btree (user_id);


--
-- Name: webauthn_credentials_credential_id_key; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX webauthn_credentials_credential_id_key ON auth.webauthn_credentials USING btree (credential_id);


--
-- Name: webauthn_credentials_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX webauthn_credentials_user_id_idx ON auth.webauthn_credentials USING btree (user_id);


--
-- Name: idx_event_game_state_empresa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_game_state_empresa ON public."estadoJogoEvento" USING btree (empresa_id);


--
-- Name: idx_flc_crianca; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_flc_crianca ON public."codigosVinculoFamiliar" USING btree (crianca_id);


--
-- Name: idx_flc_empresa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_flc_empresa ON public."codigosVinculoFamiliar" USING btree (empresa_id);


--
-- Name: idx_flc_qr_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_flc_qr_code ON public."codigosVinculoFamiliar" USING btree (qr_code_value);


--
-- Name: idx_flc_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_flc_status ON public."codigosVinculoFamiliar" USING btree (status);


--
-- Name: idx_game_sessions_brincadeira; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_game_sessions_brincadeira ON public."sessoesJogo" USING btree (brincadeira_id);


--
-- Name: idx_game_sessions_evento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_game_sessions_evento ON public."sessoesJogo" USING btree (evento_id);


--
-- Name: idx_game_sessions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_game_sessions_status ON public."sessoesJogo" USING btree (status);


--
-- Name: idx_game_winner_bonuses_evento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_game_winner_bonuses_evento ON public."bonusVencedorJogo" USING btree (evento_id);


--
-- Name: idx_leituras_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leituras_session_id ON public.leituras USING btree (session_id);


--
-- Name: idx_monster_hunt_partidas_evento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_monster_hunt_partidas_evento ON public."monsterCacaPartidas" USING btree (empresa_id, evento_id, status);


--
-- Name: idx_monster_hunt_scans_checkpoint; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_monster_hunt_scans_checkpoint ON public."monsterCacaLeituras" USING btree (partida_id, checkpoint_id, scanned_at);


--
-- Name: idx_monster_hunt_scans_evento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_monster_hunt_scans_evento ON public."monsterCacaLeituras" USING btree (empresa_id, evento_id, partida_id);


--
-- Name: idx_monster_hunt_team_states_evento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_monster_hunt_team_states_evento ON public."monsterCacaEstadosTime" USING btree (empresa_id, evento_id, partida_id);


--
-- Name: idx_zcip_evento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zcip_evento ON public."zonasConquistaPartidaIndividual" USING btree (evento_id);


--
-- Name: idx_zcip_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zcip_status ON public."zonasConquistaPartidaIndividual" USING btree (status);


--
-- Name: idx_zcips_crianca; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zcips_crianca ON public."zonasConquistaEstadosParticipanteIndividual" USING btree (crianca_id);


--
-- Name: idx_zcips_partida; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zcips_partida ON public."zonasConquistaEstadosParticipanteIndividual" USING btree (partida_id);


--
-- Name: idx_zcis_crianca; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zcis_crianca ON public."zonasConquistaLeituraIndividual" USING btree (crianca_id);


--
-- Name: idx_zcis_leitura; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zcis_leitura ON public."zonasConquistaLeituraIndividual" USING btree (leitura_id);


--
-- Name: idx_zcis_partida; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zcis_partida ON public."zonasConquistaLeituraIndividual" USING btree (partida_id);


--
-- Name: idx_zonas_equipes_partidas_evento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zonas_equipes_partidas_evento ON public."zonasEquipesPartidas" USING btree (empresa_id, evento_id, status);


--
-- Name: idx_zonas_equipes_scans_checkpoint; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zonas_equipes_scans_checkpoint ON public."zonasEquipesScans" USING btree (partida_id, checkpoint_id, scanned_at);


--
-- Name: idx_zonas_equipes_scans_evento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zonas_equipes_scans_evento ON public."zonasEquipesScans" USING btree (empresa_id, evento_id, partida_id);


--
-- Name: idx_zonas_equipes_team_states_evento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zonas_equipes_team_states_evento ON public."zonasEquipesEstadosTime" USING btree (empresa_id, evento_id, partida_id);


--
-- Name: idx_zone_checkpoint_state_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zone_checkpoint_state_owner ON public."zonasConquistaEstadosCheckpoint" USING btree (partida_id, current_owner_id);


--
-- Name: idx_zone_checkpoint_state_partida; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zone_checkpoint_state_partida ON public."zonasConquistaEstadosCheckpoint" USING btree (partida_id, checkpoint_id);


--
-- Name: idx_zone_individual_partidas_evento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zone_individual_partidas_evento ON public."zonasConquistaPartidaIndividual" USING btree (evento_id, status);


--
-- Name: idx_zone_individual_protection_checkpoint; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zone_individual_protection_checkpoint ON public."zonasConquistaProtecaoCheckpointIndividual" USING btree (checkpoint_id, protection_until);


--
-- Name: idx_zone_individual_scans_partida; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zone_individual_scans_partida ON public."zonasConquistaLeituraIndividual" USING btree (partida_id, crianca_id);


--
-- Name: idx_zone_individual_states_partida; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zone_individual_states_partida ON public."zonasConquistaEstadosParticipanteIndividual" USING btree (partida_id, crianca_id);


--
-- Name: idx_zone_team_partidas_evento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zone_team_partidas_evento ON public."zonasConquistaPartidaTime" USING btree (evento_id, status);


--
-- Name: idx_zone_team_scans_partida; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zone_team_scans_partida ON public."zonasConquistaLeituraTime" USING btree (partida_id, round_number);


--
-- Name: idx_zone_team_tempos_partida; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zone_team_tempos_partida ON public."zonasConquistaTempoTime" USING btree (partida_id, time_id);


--
-- Name: idx_zone_zone_state_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zone_zone_state_owner ON public."zonasConquistaEstadosZona" USING btree (partida_id, current_owner_id);


--
-- Name: idx_zone_zone_state_partida; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zone_zone_state_partida ON public."zonasConquistaEstadosZona" USING btree (partida_id, zone_id);


--
-- Name: uqFamilyChildLink; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uqFamilyChildLink" ON public."vinculoFamiliar" USING btree ("loginId", "criancaId");


--
-- Name: uqFamilyInvitesTokenHash; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uqFamilyInvitesTokenHash" ON public."conviteFamilia" USING btree ("hashToken");


--
-- Name: uq_clientes_empresa_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_clientes_empresa_id ON public.clientes USING btree (empresa_id) WHERE (empresa_id IS NOT NULL);


--
-- Name: uq_game_winner_bonus_partida; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_game_winner_bonus_partida ON public."bonusVencedorJogo" USING btree (partida_id, game_type);


--
-- Name: uq_monster_hunt_scan_reading; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_monster_hunt_scan_reading ON public."monsterCacaLeituras" USING btree (leitura_id) WHERE (leitura_id IS NOT NULL);


--
-- Name: uq_monster_hunt_team_state; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_monster_hunt_team_state ON public."monsterCacaEstadosTime" USING btree (partida_id, time_id);


--
-- Name: uq_settings_empresa_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_settings_empresa_key ON public.configuracoes USING btree (COALESCE(empresa_id, ''::text), setting_key);


--
-- Name: uq_zonas_equipes_scan_reading; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_zonas_equipes_scan_reading ON public."zonasEquipesScans" USING btree (leitura_id) WHERE (leitura_id IS NOT NULL);


--
-- Name: uq_zonas_equipes_team_state; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_zonas_equipes_team_state ON public."zonasEquipesEstadosTime" USING btree (partida_id, time_id);


--
-- Name: uq_zone_individual_scan_reading; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_zone_individual_scan_reading ON public."zonasConquistaLeituraIndividual" USING btree (leitura_id) WHERE (leitura_id IS NOT NULL);


--
-- Name: uq_zone_team_scan_reading; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_zone_team_scan_reading ON public."zonasConquistaLeituraTime" USING btree (leitura_id) WHERE (leitura_id IS NOT NULL);


--
-- Name: ix_realtime_subscription_entity; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX ix_realtime_subscription_entity ON realtime.subscription USING btree (entity);


--
-- Name: messages_inserted_at_topic_index; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_inserted_at_topic_index ON ONLY realtime.messages USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: subscription_subscription_id_entity_filters_action_filter_selec; Type: INDEX; Schema: realtime; Owner: -
--

CREATE UNIQUE INDEX subscription_subscription_id_entity_filters_action_filter_selec ON realtime.subscription USING btree (subscription_id, entity, filters, action_filter, COALESCE(selected_columns, '{}'::text[]));


--
-- Name: bname; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX bname ON storage.buckets USING btree (name);


--
-- Name: buckets_analytics_unique_name_idx; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX buckets_analytics_unique_name_idx ON storage.buckets_analytics USING btree (name) WHERE (deleted_at IS NULL);


--
-- Name: idx_multipart_uploads_list; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX idx_multipart_uploads_list ON storage.s3_multipart_uploads USING btree (bucket_id, key, created_at);


--
-- Name: idx_objects_bucket_id_name; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX idx_objects_bucket_id_name ON storage.objects USING btree (bucket_id, name COLLATE "C");


--
-- Name: idx_objects_bucket_id_name_lower; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX idx_objects_bucket_id_name_lower ON storage.objects USING btree (bucket_id, lower(name) COLLATE "C");


--
-- Name: idx_objects_current_version; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX idx_objects_current_version ON storage.objects USING btree (bucket_id, name COLLATE "C") WHERE (archived_at IS NULL);


--
-- Name: idx_objects_delete_markers; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX idx_objects_delete_markers ON storage.objects USING btree (bucket_id, name COLLATE "C") WHERE is_delete_marker;


--
-- Name: idx_objects_null_version; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX idx_objects_null_version ON storage.objects USING btree (bucket_id, name COLLATE "C") WHERE (NOT is_versioned);


--
-- Name: name_prefix_search; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX name_prefix_search ON storage.objects USING btree (name text_pattern_ops);


--
-- Name: objects_bucket_id_name_version_key; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX objects_bucket_id_name_version_key ON storage.objects USING btree (bucket_id, name COLLATE "C", version) NULLS NOT DISTINCT;


--
-- Name: vector_indexes_name_bucket_id_idx; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX vector_indexes_name_bucket_id_idx ON storage.vector_indexes USING btree (name, bucket_id);


--
-- Name: subscription tr_check_filters; Type: TRIGGER; Schema: realtime; Owner: -
--

CREATE TRIGGER tr_check_filters BEFORE INSERT OR UPDATE ON realtime.subscription FOR EACH ROW EXECUTE FUNCTION realtime.subscription_check_filters();


--
-- Name: buckets enforce_bucket_name_length_trigger; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER enforce_bucket_name_length_trigger BEFORE INSERT OR UPDATE OF name ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.enforce_bucket_name_length();


--
-- Name: buckets protect_bucket_control_insert; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER protect_bucket_control_insert BEFORE INSERT ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.protect_bucket_control_columns('service_role');


--
-- Name: buckets protect_bucket_control_update; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER protect_bucket_control_update BEFORE UPDATE OF lifecycle_configuration, lifecycle_configuration_generation ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.protect_bucket_control_columns();


--
-- Name: buckets protect_bucket_control_update_role; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER protect_bucket_control_update_role AFTER UPDATE OF lifecycle_configuration, lifecycle_configuration_generation ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.enforce_bucket_lifecycle_service_role('service_role');


--
-- Name: buckets protect_buckets_delete; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER protect_buckets_delete BEFORE DELETE ON storage.buckets FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();


--
-- Name: objects protect_objects_delete; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER protect_objects_delete BEFORE DELETE ON storage.objects FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();


--
-- Name: objects update_objects_updated_at; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER update_objects_updated_at BEFORE UPDATE ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.update_updated_at_column();


--
-- Name: identities identities_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: mfa_amr_claims mfa_amr_claims_session_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT mfa_amr_claims_session_id_fkey FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE;


--
-- Name: mfa_challenges mfa_challenges_auth_factor_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_challenges
    ADD CONSTRAINT mfa_challenges_auth_factor_id_fkey FOREIGN KEY (factor_id) REFERENCES auth.mfa_factors(id) ON DELETE CASCADE;


--
-- Name: mfa_factors mfa_factors_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: mfa_recovery_code_sets mfa_recovery_code_sets_mfa_factor_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_recovery_code_sets
    ADD CONSTRAINT mfa_recovery_code_sets_mfa_factor_id_fkey FOREIGN KEY (mfa_factor_id) REFERENCES auth.mfa_factors(id) ON DELETE CASCADE;


--
-- Name: mfa_recovery_code_sets mfa_recovery_code_sets_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_recovery_code_sets
    ADD CONSTRAINT mfa_recovery_code_sets_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: mfa_recovery_codes mfa_recovery_codes_mfa_recovery_code_set_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_recovery_codes
    ADD CONSTRAINT mfa_recovery_codes_mfa_recovery_code_set_id_fkey FOREIGN KEY (mfa_recovery_code_set_id) REFERENCES auth.mfa_recovery_code_sets(id) ON DELETE CASCADE;


--
-- Name: oauth_authorizations oauth_authorizations_client_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_client_id_fkey FOREIGN KEY (client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;


--
-- Name: oauth_authorizations oauth_authorizations_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: oauth_consents oauth_consents_client_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_client_id_fkey FOREIGN KEY (client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;


--
-- Name: oauth_consents oauth_consents_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: one_time_tokens one_time_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.one_time_tokens
    ADD CONSTRAINT one_time_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: refresh_tokens refresh_tokens_session_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_session_id_fkey FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE;


--
-- Name: saml_providers saml_providers_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: saml_relay_states saml_relay_states_flow_state_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_flow_state_id_fkey FOREIGN KEY (flow_state_id) REFERENCES auth.flow_state(id) ON DELETE CASCADE;


--
-- Name: saml_relay_states saml_relay_states_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: scim_tokens scim_tokens_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.scim_tokens
    ADD CONSTRAINT scim_tokens_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: scim_users scim_users_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.scim_users
    ADD CONSTRAINT scim_users_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: scim_users scim_users_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.scim_users
    ADD CONSTRAINT scim_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: sessions sessions_oauth_client_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_oauth_client_id_fkey FOREIGN KEY (oauth_client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: sso_domains sso_domains_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sso_domains
    ADD CONSTRAINT sso_domains_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: webauthn_challenges webauthn_challenges_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.webauthn_challenges
    ADD CONSTRAINT webauthn_challenges_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: webauthn_credentials webauthn_credentials_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.webauthn_credentials
    ADD CONSTRAINT webauthn_credentials_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: etiquetasCheckpoint FK__checkpoin__check__01142BA1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."etiquetasCheckpoint"
    ADD CONSTRAINT "FK__checkpoin__check__01142BA1" FOREIGN KEY ("checkpointId") REFERENCES public."pontoVerificacao"("checkpointId");


--
-- Name: pontoVerificacao FK__checkpoin__event__7B5B524B; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."pontoVerificacao"
    ADD CONSTRAINT "FK__checkpoin__event__7B5B524B" FOREIGN KEY ("eventoId") REFERENCES public.eventos("eventoId");


--
-- Name: pontoVerificacao FK__checkpoin__owner_crianca; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."pontoVerificacao"
    ADD CONSTRAINT "FK__checkpoin__owner_crianca" FOREIGN KEY ("territorioDonosCriancaId") REFERENCES public.criancas("criancaId");


--
-- Name: pontoVerificacao FK__checkpoin__terri__7C4F7684; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."pontoVerificacao"
    ADD CONSTRAINT "FK__checkpoin__terri__7C4F7684" FOREIGN KEY ("territorioDonoTimeId") REFERENCES public.times("timeId");


--
-- Name: criancaConquistas FK__crianca_c__conqu__17F790F9; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."criancaConquistas"
    ADD CONSTRAINT "FK__crianca_c__conqu__17F790F9" FOREIGN KEY ("conquistaId") REFERENCES public.conquistas("conquistaId");


--
-- Name: criancaConquistas FK__crianca_c__crian__17036CC0; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."criancaConquistas"
    ADD CONSTRAINT "FK__crianca_c__crian__17036CC0" FOREIGN KEY ("criancaId") REFERENCES public.criancas("criancaId");


--
-- Name: criancas FK__criancas__evento__6E01572D; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.criancas
    ADD CONSTRAINT "FK__criancas__evento__6E01572D" FOREIGN KEY ("eventoId") REFERENCES public.eventos("eventoId");


--
-- Name: criancas FK__criancas__time_i__6EF57B66; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.criancas
    ADD CONSTRAINT "FK__criancas__time_i__6EF57B66" FOREIGN KEY ("timeId") REFERENCES public.times("timeId");


--
-- Name: eventoBrincadeiras FK__evento_br__brinc__619B8048; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."eventoBrincadeiras"
    ADD CONSTRAINT "FK__evento_br__brinc__619B8048" FOREIGN KEY ("brincadeiraId") REFERENCES public.brincadeiras("brincadeiraId");


--
-- Name: eventoBrincadeiras FK__evento_br__event__60A75C0F; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."eventoBrincadeiras"
    ADD CONSTRAINT "FK__evento_br__event__60A75C0F" FOREIGN KEY ("eventoId") REFERENCES public.eventos("eventoId");


--
-- Name: eventos FK__eventos__cliente__5441852A; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eventos
    ADD CONSTRAINT "FK__eventos__cliente__5441852A" FOREIGN KEY ("clienteId") REFERENCES public.clientes("clienteId");


--
-- Name: leituras FK__leituras__checkp__06CD04F7; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leituras
    ADD CONSTRAINT "FK__leituras__checkp__06CD04F7" FOREIGN KEY ("checkpointId") REFERENCES public."pontoVerificacao"("checkpointId");


--
-- Name: leituras FK__leituras__crianc__07C12930; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leituras
    ADD CONSTRAINT "FK__leituras__crianc__07C12930" FOREIGN KEY ("criancaId") REFERENCES public.criancas("criancaId");


--
-- Name: acessos FK__logins__empresa___6BE40491; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acessos
    ADD CONSTRAINT "FK__logins__empresa___6BE40491" FOREIGN KEY ("empresaId") REFERENCES public.empresas("empresaId");


--
-- Name: logs FK__logs__cliente_id__208CD6FA; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logs
    ADD CONSTRAINT "FK__logs__cliente_id__208CD6FA" FOREIGN KEY ("clienteId") REFERENCES public.clientes("clienteId");


--
-- Name: logs FK__logs__evento_id__2180FB33; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logs
    ADD CONSTRAINT "FK__logs__evento_id__2180FB33" FOREIGN KEY ("eventoId") REFERENCES public.eventos("eventoId");


--
-- Name: mensagensDisplay FK__mensagens__event__1CBC4616; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."mensagensDisplay"
    ADD CONSTRAINT "FK__mensagens__event__1CBC4616" FOREIGN KEY ("eventoId") REFERENCES public.eventos("eventoId");


--
-- Name: pontuacoes FK__pontuacoe__check__0F624AF8; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pontuacoes
    ADD CONSTRAINT "FK__pontuacoe__check__0F624AF8" FOREIGN KEY ("checkpointId") REFERENCES public."pontoVerificacao"("checkpointId");


--
-- Name: pontuacoes FK__pontuacoe__crian__0D7A0286; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pontuacoes
    ADD CONSTRAINT "FK__pontuacoe__crian__0D7A0286" FOREIGN KEY ("criancaId") REFERENCES public.criancas("criancaId");


--
-- Name: pontuacoes FK__pontuacoe__event__0C85DE4D; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pontuacoes
    ADD CONSTRAINT "FK__pontuacoe__event__0C85DE4D" FOREIGN KEY ("eventoId") REFERENCES public.eventos("eventoId");


--
-- Name: pulseiras FK__pulseiras__crian__73BA3083; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pulseiras
    ADD CONSTRAINT "FK__pulseiras__crian__73BA3083" FOREIGN KEY (crianca_id) REFERENCES public.criancas("criancaId");


--
-- Name: times FK__times__evento_id__66603565; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.times
    ADD CONSTRAINT "FK__times__evento_id__66603565" FOREIGN KEY (evento_id) REFERENCES public.eventos("eventoId");


--
-- Name: zonas FK__zonas__evento_id__25518C17; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zonas
    ADD CONSTRAINT "FK__zonas__evento_id__25518C17" FOREIGN KEY (evento_id) REFERENCES public.eventos("eventoId");


--
-- Name: brincadeiras FK_brincadeiras_empresas; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brincadeiras
    ADD CONSTRAINT "FK_brincadeiras_empresas" FOREIGN KEY ("empresaId") REFERENCES public.empresas("empresaId");


--
-- Name: pontoVerificacao FK_checkpoints_empresas; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."pontoVerificacao"
    ADD CONSTRAINT "FK_checkpoints_empresas" FOREIGN KEY ("empresaId") REFERENCES public.empresas("empresaId");


--
-- Name: criancas FK_criancas_empresas; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.criancas
    ADD CONSTRAINT "FK_criancas_empresas" FOREIGN KEY ("empresaId") REFERENCES public.empresas("empresaId");


--
-- Name: eventos FK_eventos_empresas; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eventos
    ADD CONSTRAINT "FK_eventos_empresas" FOREIGN KEY ("empresaId") REFERENCES public.empresas("empresaId");


--
-- Name: leituras FK_leituras_empresas; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leituras
    ADD CONSTRAINT "FK_leituras_empresas" FOREIGN KEY ("empresaId") REFERENCES public.empresas("empresaId");


--
-- Name: pontuacoes FK_pontuacoes_empresas; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pontuacoes
    ADD CONSTRAINT "FK_pontuacoes_empresas" FOREIGN KEY ("empresaId") REFERENCES public.empresas("empresaId");


--
-- Name: pulseiras FK_pulseiras_empresas; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pulseiras
    ADD CONSTRAINT "FK_pulseiras_empresas" FOREIGN KEY (empresa_id) REFERENCES public.empresas("empresaId");


--
-- Name: times FK_times_empresas; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.times
    ADD CONSTRAINT "FK_times_empresas" FOREIGN KEY (empresa_id) REFERENCES public.empresas("empresaId");


--
-- Name: codigosVinculoFamiliar family_linking_codes_crianca_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."codigosVinculoFamiliar"
    ADD CONSTRAINT family_linking_codes_crianca_id_fkey FOREIGN KEY (crianca_id) REFERENCES public.criancas("criancaId");


--
-- Name: codigosVinculoFamiliar family_linking_codes_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."codigosVinculoFamiliar"
    ADD CONSTRAINT family_linking_codes_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas("empresaId");


--
-- Name: codigosVinculoFamiliar family_linking_codes_evento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."codigosVinculoFamiliar"
    ADD CONSTRAINT family_linking_codes_evento_id_fkey FOREIGN KEY (evento_id) REFERENCES public.eventos("eventoId");


--
-- Name: codigosVinculoFamiliar family_linking_codes_used_by_login_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."codigosVinculoFamiliar"
    ADD CONSTRAINT family_linking_codes_used_by_login_id_fkey FOREIGN KEY (used_by_login_id) REFERENCES public.acessos("loginId");


--
-- Name: brincadeiras fk_brincadeiras_empresas; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brincadeiras
    ADD CONSTRAINT fk_brincadeiras_empresas FOREIGN KEY ("empresaId") REFERENCES public.empresas("empresaId");


--
-- Name: etiquetasCheckpoint fk_checkpoint_tags_checkpoint; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."etiquetasCheckpoint"
    ADD CONSTRAINT fk_checkpoint_tags_checkpoint FOREIGN KEY ("checkpointId") REFERENCES public."pontoVerificacao"("checkpointId");


--
-- Name: pontoVerificacao fk_checkpoints_empresas; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."pontoVerificacao"
    ADD CONSTRAINT fk_checkpoints_empresas FOREIGN KEY ("empresaId") REFERENCES public.empresas("empresaId");


--
-- Name: pontoVerificacao fk_checkpoints_evento; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."pontoVerificacao"
    ADD CONSTRAINT fk_checkpoints_evento FOREIGN KEY ("eventoId") REFERENCES public.eventos("eventoId");


--
-- Name: pontoVerificacao fk_checkpoints_owner_crianca; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."pontoVerificacao"
    ADD CONSTRAINT fk_checkpoints_owner_crianca FOREIGN KEY ("territorioDonosCriancaId") REFERENCES public.criancas("criancaId");


--
-- Name: pontoVerificacao fk_checkpoints_owner_time; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."pontoVerificacao"
    ADD CONSTRAINT fk_checkpoints_owner_time FOREIGN KEY ("territorioDonoTimeId") REFERENCES public.times("timeId");


--
-- Name: criancaConquistas fk_crianca_conquistas_conquista; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."criancaConquistas"
    ADD CONSTRAINT fk_crianca_conquistas_conquista FOREIGN KEY ("conquistaId") REFERENCES public.conquistas("conquistaId");


--
-- Name: criancaConquistas fk_crianca_conquistas_crianca; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."criancaConquistas"
    ADD CONSTRAINT fk_crianca_conquistas_crianca FOREIGN KEY ("criancaId") REFERENCES public.criancas("criancaId");


--
-- Name: criancas fk_criancas_empresas; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.criancas
    ADD CONSTRAINT fk_criancas_empresas FOREIGN KEY ("empresaId") REFERENCES public.empresas("empresaId");


--
-- Name: criancas fk_criancas_evento; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.criancas
    ADD CONSTRAINT fk_criancas_evento FOREIGN KEY ("eventoId") REFERENCES public.eventos("eventoId");


--
-- Name: criancas fk_criancas_time; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.criancas
    ADD CONSTRAINT fk_criancas_time FOREIGN KEY ("timeId") REFERENCES public.times("timeId");


--
-- Name: eventoBrincadeiras fk_evento_brincadeiras_brincadeira; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."eventoBrincadeiras"
    ADD CONSTRAINT fk_evento_brincadeiras_brincadeira FOREIGN KEY ("brincadeiraId") REFERENCES public.brincadeiras("brincadeiraId");


--
-- Name: eventoBrincadeiras fk_evento_brincadeiras_evento; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."eventoBrincadeiras"
    ADD CONSTRAINT fk_evento_brincadeiras_evento FOREIGN KEY ("eventoId") REFERENCES public.eventos("eventoId");


--
-- Name: eventos fk_eventos_cliente; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eventos
    ADD CONSTRAINT fk_eventos_cliente FOREIGN KEY ("clienteId") REFERENCES public.clientes("clienteId");


--
-- Name: eventos fk_eventos_empresas; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eventos
    ADD CONSTRAINT fk_eventos_empresas FOREIGN KEY ("empresaId") REFERENCES public.empresas("empresaId");


--
-- Name: leituras fk_leituras_checkpoint; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leituras
    ADD CONSTRAINT fk_leituras_checkpoint FOREIGN KEY ("checkpointId") REFERENCES public."pontoVerificacao"("checkpointId");


--
-- Name: leituras fk_leituras_crianca; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leituras
    ADD CONSTRAINT fk_leituras_crianca FOREIGN KEY ("criancaId") REFERENCES public.criancas("criancaId");


--
-- Name: leituras fk_leituras_empresas; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leituras
    ADD CONSTRAINT fk_leituras_empresas FOREIGN KEY ("empresaId") REFERENCES public.empresas("empresaId");


--
-- Name: acessos fk_logins_empresa; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acessos
    ADD CONSTRAINT fk_logins_empresa FOREIGN KEY ("empresaId") REFERENCES public.empresas("empresaId");


--
-- Name: logs fk_logs_cliente; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logs
    ADD CONSTRAINT fk_logs_cliente FOREIGN KEY ("clienteId") REFERENCES public.clientes("clienteId");


--
-- Name: logs fk_logs_evento; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logs
    ADD CONSTRAINT fk_logs_evento FOREIGN KEY ("eventoId") REFERENCES public.eventos("eventoId");


--
-- Name: mensagensDisplay fk_mensagens_display_evento; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."mensagensDisplay"
    ADD CONSTRAINT fk_mensagens_display_evento FOREIGN KEY ("eventoId") REFERENCES public.eventos("eventoId");


--
-- Name: pontuacoes fk_pontuacoes_checkpoint; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pontuacoes
    ADD CONSTRAINT fk_pontuacoes_checkpoint FOREIGN KEY ("checkpointId") REFERENCES public."pontoVerificacao"("checkpointId");


--
-- Name: pontuacoes fk_pontuacoes_crianca; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pontuacoes
    ADD CONSTRAINT fk_pontuacoes_crianca FOREIGN KEY ("criancaId") REFERENCES public.criancas("criancaId");


--
-- Name: pontuacoes fk_pontuacoes_empresas; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pontuacoes
    ADD CONSTRAINT fk_pontuacoes_empresas FOREIGN KEY ("empresaId") REFERENCES public.empresas("empresaId");


--
-- Name: pontuacoes fk_pontuacoes_evento; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pontuacoes
    ADD CONSTRAINT fk_pontuacoes_evento FOREIGN KEY ("eventoId") REFERENCES public.eventos("eventoId");


--
-- Name: pulseiras fk_pulseiras_crianca; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pulseiras
    ADD CONSTRAINT fk_pulseiras_crianca FOREIGN KEY (crianca_id) REFERENCES public.criancas("criancaId");


--
-- Name: pulseiras fk_pulseiras_empresas; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pulseiras
    ADD CONSTRAINT fk_pulseiras_empresas FOREIGN KEY (empresa_id) REFERENCES public.empresas("empresaId");


--
-- Name: times fk_times_empresas; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.times
    ADD CONSTRAINT fk_times_empresas FOREIGN KEY (empresa_id) REFERENCES public.empresas("empresaId");


--
-- Name: times fk_times_evento; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.times
    ADD CONSTRAINT fk_times_evento FOREIGN KEY (evento_id) REFERENCES public.eventos("eventoId");


--
-- Name: zonas fk_zonas_evento; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zonas
    ADD CONSTRAINT fk_zonas_evento FOREIGN KEY (evento_id) REFERENCES public.eventos("eventoId");


--
-- Name: objects objects_bucketId_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.objects
    ADD CONSTRAINT "objects_bucketId_fkey" FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- Name: s3_multipart_uploads s3_multipart_uploads_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads
    ADD CONSTRAINT s3_multipart_uploads_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_upload_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_upload_id_fkey FOREIGN KEY (upload_id) REFERENCES storage.s3_multipart_uploads(id) ON DELETE CASCADE;


--
-- Name: vector_indexes vector_indexes_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.vector_indexes
    ADD CONSTRAINT vector_indexes_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets_vectors(id);


--
-- Name: audit_log_entries; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.audit_log_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: flow_state; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.flow_state ENABLE ROW LEVEL SECURITY;

--
-- Name: identities; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.identities ENABLE ROW LEVEL SECURITY;

--
-- Name: instances; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.instances ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_amr_claims; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.mfa_amr_claims ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_challenges; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.mfa_challenges ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_factors; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.mfa_factors ENABLE ROW LEVEL SECURITY;

--
-- Name: one_time_tokens; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.one_time_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: refresh_tokens; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.refresh_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: saml_providers; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.saml_providers ENABLE ROW LEVEL SECURITY;

--
-- Name: saml_relay_states; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.saml_relay_states ENABLE ROW LEVEL SECURITY;

--
-- Name: schema_migrations; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.schema_migrations ENABLE ROW LEVEL SECURITY;

--
-- Name: sessions; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: sso_domains; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.sso_domains ENABLE ROW LEVEL SECURITY;

--
-- Name: sso_providers; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.sso_providers ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;

--
-- Name: messages; Type: ROW SECURITY; Schema: realtime; Owner: -
--

ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: buckets; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;

--
-- Name: buckets_analytics; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.buckets_analytics ENABLE ROW LEVEL SECURITY;

--
-- Name: buckets_vectors; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.buckets_vectors ENABLE ROW LEVEL SECURITY;

--
-- Name: migrations; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.migrations ENABLE ROW LEVEL SECURITY;

--
-- Name: objects; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

--
-- Name: s3_multipart_uploads; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.s3_multipart_uploads ENABLE ROW LEVEL SECURITY;

--
-- Name: s3_multipart_uploads_parts; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.s3_multipart_uploads_parts ENABLE ROW LEVEL SECURITY;

--
-- Name: vector_indexes; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.vector_indexes ENABLE ROW LEVEL SECURITY;

--
-- Name: supabase_realtime; Type: PUBLICATION; Schema: -; Owner: -
--

CREATE PUBLICATION supabase_realtime WITH (publish = 'insert, update, delete, truncate');


--
-- Name: issue_graphql_placeholder; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_graphql_placeholder ON sql_drop
         WHEN TAG IN ('DROP EXTENSION')
   EXECUTE FUNCTION extensions.set_graphql_placeholder();


--
-- Name: issue_pg_cron_access; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_pg_cron_access ON ddl_command_end
         WHEN TAG IN ('CREATE EXTENSION')
   EXECUTE FUNCTION extensions.grant_pg_cron_access();


--
-- Name: issue_pg_graphql_access; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_pg_graphql_access ON ddl_command_end
         WHEN TAG IN ('CREATE EXTENSION')
   EXECUTE FUNCTION extensions.grant_pg_graphql_access();


--
-- Name: issue_pg_net_access; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_pg_net_access ON ddl_command_end
         WHEN TAG IN ('CREATE EXTENSION')
   EXECUTE FUNCTION extensions.grant_pg_net_access();


--
-- Name: pgrst_ddl_watch; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER pgrst_ddl_watch ON ddl_command_end
   EXECUTE FUNCTION extensions.pgrst_ddl_watch();


--
-- Name: pgrst_drop_watch; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER pgrst_drop_watch ON sql_drop
   EXECUTE FUNCTION extensions.pgrst_drop_watch();


--
-- PostgreSQL database dump complete
--

\unrestrict qWHWhNfEoldX3YXiCSFPpOaloETHLxCmkkFhEsRm3xR5rTPwPWNbk05rm4RLYnn

