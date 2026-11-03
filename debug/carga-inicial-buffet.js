// debug/carga-inicial-buffet.js - primeira carga de dados de um buffet, a partir da nuvem.
//
// Use depois de criar o banco local com o schema da nuvem (ver o guia de instalação). Ele copia para o banco local tudo
// o que a nuvem tem desta empresa. Não é a sincronização de rotina: serve uma vez, numa instalação nova.
//
// Sem confirmação, só mostra o plano e as contagens. Com APLICAR_CARGA=YES, grava.
// Variáveis: DATABASE_URL (banco local), SYNC_NUVEM_URL (usuário do buffet na nuvem), SYNC_EMPRESA_ID,
//            APLICAR_CARGA=YES, SYNC_NUVEM_SSL (padrão true), DB_SSL (padrão true).
const pg = require('pg');
const { criarSincronizador, tiposSemPerdaDePrecisao } = require('../utils/sincronizacao');

const local = process.env.DATABASE_URL;
const nuvem = process.env.SYNC_NUVEM_URL;
const empresaId = process.env.SYNC_EMPRESA_ID;
if (!local || !nuvem || !empresaId) throw new Error('Defina DATABASE_URL, SYNC_NUVEM_URL e SYNC_EMPRESA_ID.');
const sslLocal = String(process.env.DB_SSL || 'true').toLowerCase() !== 'false';
const sslNuvem = String(process.env.SYNC_NUVEM_SSL || 'true').toLowerCase() !== 'false';
const aplicar = process.env.APLICAR_CARGA === 'YES';

const types = tiposSemPerdaDePrecisao(pg);
const poolLocal = new pg.Pool({ connectionString: local, ssl: sslLocal ? { rejectUnauthorized: false } : false, max: 3, types });
const poolNuvem = new pg.Pool({ connectionString: nuvem, ssl: sslNuvem ? { rejectUnauthorized: false } : false, max: 3, types });
const log = { warn: (m) => console.warn(m), info: (m) => console.log(m), error: (m) => console.error(m) };

async function main() {
  const { rows: [{ c: eventosNuvem }] } = await poolNuvem.query('SELECT count(*) AS c FROM "evento" WHERE "empresaId" = $1', [empresaId]);
  const { rows: [{ c: eventosLocal }] } = await poolLocal.query('SELECT count(*) AS c FROM "evento"');
  console.log(`Empresa: ${empresaId}`);
  console.log(`Eventos na nuvem desta empresa: ${eventosNuvem}`);
  console.log(`Eventos no banco local hoje: ${eventosLocal}`);
  if (!aplicar) {
    console.log('\nNada foi gravado. Para carregar, defina APLICAR_CARGA=YES no mesmo comando.');
    return;
  }
  if (Number(eventosLocal) > 0) throw new Error('O banco local já tem eventos. A carga inicial só roda em banco vazio.');

  const sync = criarSincronizador({ local: poolLocal, nuvem: poolNuvem, empresaId, log, margemNuvemSegundos: 0 });
  await sync.recarregarAgora();
  const { rows: [{ c: depois }] } = await poolLocal.query('SELECT count(*) AS c FROM "evento"');
  console.log(`Carga feita. Eventos no banco local: ${depois}`);
  if (Number(depois) !== Number(eventosNuvem)) throw new Error('A contagem de eventos não bate com a nuvem.');
}

main()
  .catch((erro) => { console.error('❌', erro.message); process.exitCode = 1; })
  .finally(() => Promise.allSettled([poolLocal.end(), poolNuvem.end()]));
