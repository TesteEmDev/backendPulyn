// database.js - camada de acesso com suporte opt-in a SQL Server e PostgreSQL
const path = require('path');
const { AsyncLocalStorage } = require('async_hooks');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const sql = require('mssql');

const DB_DRIVER = String(process.env.DB_DRIVER || 'sqlserver').toLowerCase();
const isPostgres = DB_DRIVER === 'postgres' || DB_DRIVER === 'postgresql';

const sqlServerConfig = {
  server: process.env.DB_SERVER || 'localhost',
  database: process.env.DB_NAME || 'PulynDB',
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || '123456',
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true
  },
  connectionTimeout: Number(process.env.DB_TIMEOUT || 30000),
  requestTimeout: Number(process.env.DB_TIMEOUT || 30000)
};

let pool = null;
const transactionStorage = new AsyncLocalStorage();

function postgresConfig() {
  const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  const sslEnabled = String(process.env.DB_SSL || 'true').toLowerCase() !== 'false';
  return {
    ...(connectionString ? { connectionString } : {}),
    ...(!connectionString ? {
      host: process.env.PGHOST || 'localhost',
      port: Number(process.env.PGPORT || 5432),
      database: process.env.PGDATABASE || 'postgres',
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD
    } : {}),
    ssl: sslEnabled ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: Number(process.env.DB_TIMEOUT || 30000),
    max: Number(process.env.PG_POOL_MAX || 10)
  };
}

function bindNamedParameters(sqlQuery, params = {}) {
  const values = [];
  const indexes = new Map();
  let text = '';
  let quote = null;

  for (let index = 0; index < sqlQuery.length; index += 1) {
    const character = sqlQuery[index];
    const next = sqlQuery[index + 1];

    if (quote) {
      text += character;
      if (character === quote && next === quote) {
        text += next;
        index += 1;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }

    if (character === "'" || character === '"') {
      quote = character;
      text += character;
      continue;
    }

    if (character === '@' && /[A-Za-z_]/.test(next || '')) {
      let end = index + 1;
      while (end < sqlQuery.length && /[A-Za-z0-9_]/.test(sqlQuery[end])) end += 1;
      const name = sqlQuery.slice(index + 1, end);
      if (!Object.prototype.hasOwnProperty.call(params, name)) {
        throw new Error(`Parâmetro PostgreSQL ausente: ${name}`);
      }
      if (!indexes.has(name)) {
        indexes.set(name, values.length + 1);
        values.push(params[name]);
      }
      text += `$${indexes.get(name)}`;
      index = end - 1;
      continue;
    }

    text += character;
  }

  return { text, values };
}

function adaptPostgresSql(sqlQuery) {
  let text = sqlQuery
    .replace(/\[([^\]]+)\]/g, '"$1"')
    .replace(/\bGETDATE\s*\(\s*\)/gi, 'CURRENT_TIMESTAMP')
    .replace(/\bISNULL\s*\(/gi, 'COALESCE(')
    .replace(/\bCHAR\s*\(\s*9\s*\)/gi, 'CHR(9)')
    .replace(/\bNEWID\s*\(\s*\)/gi, 'gen_random_uuid()')
    .replace(/CAST\s*\(\s*CURRENT_TIMESTAMP\s+AS\s+DATE\s*\)/gi, 'CURRENT_DATE')
    .replace(/FORMAT\s*\(\s*CURRENT_TIMESTAMP\s*,\s*'HH:mm'\s*\)/gi, "TO_CHAR(CURRENT_TIMESTAMP, 'HH24:MI')")
    .replace(/CONVERT\s*\(\s*NVARCHAR\s*\(\s*\d+\s*\)\s*,\s*([A-Za-z_][A-Za-z0-9_.]*)\s*\)/gi, 'CAST($1 AS TEXT)')
    .replace(/CONVERT\s*\(\s*VARCHAR\s*\(\s*7\s*\)\s*,\s*([A-Za-z_][A-Za-z0-9_.]*)\s*,\s*120\s*\)/gi, "TO_CHAR($1, 'YYYY-MM')");

  text = text.replace(/DATEDIFF_BIG\s*\(\s*MILLISECOND\s*,\s*([^,]+),\s*([^\)]+)\)/gi,
    'EXTRACT(EPOCH FROM ($2 - $1)) * 1000');
  text = text.replace(/DATEDIFF\s*\(\s*MINUTE\s*,\s*([^,]+),\s*([^\)]+)\)/gi,
    'EXTRACT(EPOCH FROM ($2 - $1)) / 60');

  const topMatch = text.match(/(SELECT\s+)(DISTINCT\s+)?TOP\s+(\([^)]*\)|\d+)\s+/i);
  if (topMatch) {
    text = text.replace(topMatch[0], `${topMatch[1]}${topMatch[2] || ''}`);
    const limit = topMatch[3].replace(/[()]/g, '');
    const semicolon = /;\s*$/.test(text) ? ';' : '';
    text = text.replace(/;\s*$/, '').trimEnd() + ` LIMIT ${limit}${semicolon}`;
  }

  return text;
}

async function connectDB() {
  if (pool) return pool;

  try {
    if (isPostgres) {
      let Pool;
      try {
        ({ Pool } = require('pg'));
      } catch {
        throw new Error('Driver PostgreSQL ausente. Execute "npm install pg" no backend antes de usar DB_DRIVER=postgres.');
      }

      const config = postgresConfig();
      console.log('📡 Conectando ao PostgreSQL/Supabase...');
      console.log(`🎯 Host: ${config.host || 'definido pela string de conexão'}`);
      console.log(`💾 Banco: ${config.database || 'definido pela string de conexão'}`);
      pool = new Pool(config);
      await pool.query('SELECT 1');
      console.log('✅ Conectado ao PostgreSQL/Supabase com sucesso!');
      return pool;
    }

    console.log('📡 Conectando ao SQL Server...');
    console.log(`🎯 Servidor: ${sqlServerConfig.server}`);
    console.log(`💾 Banco: ${sqlServerConfig.database}`);
    console.log(`👤 Usuário: ${sqlServerConfig.user}`);
    console.log(`⏱️  Timeout: ${sqlServerConfig.connectionTimeout}ms`);
    pool = await sql.connect(sqlServerConfig);
    console.log('✅ Conectado ao SQL Server com sucesso!');
    return pool;
  } catch (err) {
    console.error(`❌ Erro ao conectar ao ${isPostgres ? 'PostgreSQL/Supabase' : 'SQL Server'}:`, err.message);
    throw err;
  }
}

function normalizePostgresResult(result) {
  return {
    ...result,
    recordset: result.rows,
    rowsAffected: [result.rowCount || 0]
  };
}

function createSqlServerExecutor(requestFactory) {
  return {
    async query(sqlQuery, params = {}) {
      const request = requestFactory();
      Object.keys(params).forEach(key => request.input(key, params[key]));
      return request.query(sqlQuery);
    },
    async queryOne(sqlQuery, params = {}) {
      const result = await this.query(sqlQuery, params);
      return result.recordset[0];
    },
    async allQuery(sqlQuery, params = {}) {
      const result = await this.query(sqlQuery, params);
      return result.recordset;
    }
  };
}

function createPostgresExecutor(client) {
  return {
    async query(sqlQuery, params = {}) {
      const bound = bindNamedParameters(adaptPostgresSql(sqlQuery), params);
      return normalizePostgresResult(await client.query(bound.text, bound.values));
    },
    async queryOne(sqlQuery, params = {}) {
      const result = await this.query(sqlQuery, params);
      return result.recordset[0];
    },
    async allQuery(sqlQuery, params = {}) {
      const result = await this.query(sqlQuery, params);
      return result.recordset;
    }
  };
}

async function query(sqlQuery, params = {}) {
  const activeTransaction = transactionStorage.getStore();
  if (activeTransaction) {
    return activeTransaction.query(sqlQuery, params);
  }

  if (!pool) await connectDB();

  if (isPostgres) {
    const bound = bindNamedParameters(adaptPostgresSql(sqlQuery), params);
    return normalizePostgresResult(await pool.query(bound.text, bound.values));
  }

  return createSqlServerExecutor(() => pool.request()).query(sqlQuery, params);
}

async function queryOne(sqlQuery, params = {}) {
  const result = await query(sqlQuery, params);
  return result.recordset[0];
}

async function allQuery(sqlQuery, params = {}) {
  const result = await query(sqlQuery, params);
  return result.recordset;
}

// Executa várias operações na mesma conexão/transação. O callback recebe
// query/queryOne/allQuery transacionais e não deve usar os helpers globais.
async function withTransaction(work) {
  if (!pool) await connectDB();

  if (isPostgres) {
    const client = await pool.connect();
    const executor = createPostgresExecutor(client);
    try {
      await client.query('BEGIN');
      const result = await transactionStorage.run(executor, () => work(executor));
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('❌ Erro ao desfazer transação PostgreSQL:', rollbackError.message);
      }
      throw error;
    } finally {
      client.release();
    }
  }

  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  const executor = createSqlServerExecutor(() => new sql.Request(transaction));
  try {
    const result = await transactionStorage.run(executor, () => work(executor));
    await transaction.commit();
    return result;
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      console.error('❌ Erro ao desfazer transação SQL Server:', rollbackError.message);
    }
    throw error;
  }
}

async function closeDB() {
  if (!pool) return;
  if (isPostgres) {
    await pool.end();
  } else {
    await pool.close();
  }
  pool = null;
}

module.exports = { connectDB, closeDB, query, queryOne, allQuery, withTransaction, sql, DB_DRIVER };