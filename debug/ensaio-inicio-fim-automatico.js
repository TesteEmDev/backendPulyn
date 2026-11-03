// Ensaio do início e encerramento automáticos dos eventos: roda no banco de dev DENTRO de uma transação e a DESFAZ (ROLLBACK).
// Cria um evento agendado que já devia ter começado (autoInicio) e um evento ativo que já passou da duração (autoFim),
// roda uma varredura de verdade (runLifecycleTick) e confere o que mudou. Também confere os casos que NÃO devem mudar.
// Uso: node debug/ensaio-inicio-fim-automatico.js
require('dotenv').config();
const assert = require('node:assert/strict');
const crypto = require('crypto');
const database = require('../database');
const { query, queryOne, closeDB } = database;
const withTransaction = database.withTransaction;
const { runLifecycleTick, wallClockNow } = require('../utils/eventLifecycle');

class Desfazer extends Error {}

const dois = (n) => String(n).padStart(2, '0');
// Data e hora de parede (fuso do buffet) a `minutos` de agora
function agendaEm(minutos) {
  const d = new Date(wallClockNow() + minutos * 60000);
  return { data: `${d.getUTCFullYear()}-${dois(d.getUTCMonth() + 1)}-${dois(d.getUTCDate())}`, hora: `${dois(d.getUTCHours())}:${dois(d.getUTCMinutes())}` };
}

async function main() {
  const base = await queryOne("SELECT empresaId FROM evento WHERE nome = 'Festa do João'");
  assert.ok(base, 'a Festa do João existe');

  async function criar({ nome, minutos, duracao, status = 'scheduled', autoInicio = 0, autoFim = 0, iniciadoHaMin = null }) {
    const id = crypto.randomUUID();
    const { data, hora } = agendaEm(minutos);
    await query(
      `INSERT INTO evento (eventoId, empresaId, nome, data, hora, duracao, status, autoInicio, autoFim, iniciadoEm)
       VALUES (@id, @empresaId, @nome, @data, @hora, @duracao, @status, @autoInicio, @autoFim,
               CASE WHEN CAST(@iniciadoHa AS integer) IS NULL THEN NULL ELSE CURRENT_TIMESTAMP - (CAST(@iniciadoHa AS integer) * INTERVAL '1 minute') END)`,
      { id, empresaId: base.empresaId, nome, data, hora, duracao, status, autoInicio, autoFim, iniciadoHa: iniciadoHaMin },
    );
    return id;
  }
  const statusDe = async (id) => (await queryOne('SELECT status, iniciadoEm, finalizadoEm FROM evento WHERE eventoId = @id', { id }));

  try {
    await withTransaction(async () => {
      const comecaAgora = await criar({ nome: 'Ensaio começa', minutos: -2, duracao: 60, autoInicio: 1 });
      const aindaNaoChegou = await criar({ nome: 'Ensaio futuro', minutos: 30, duracao: 60, autoInicio: 1 });
      const janelaPassou = await criar({ nome: 'Ensaio janela passou', minutos: -180, duracao: 60, autoInicio: 1 });
      const manualAgendado = await criar({ nome: 'Ensaio manual', minutos: -2, duracao: 60, autoInicio: 0 });
      const passouDaDuracao = await criar({ nome: 'Ensaio termina', minutos: -90, duracao: 60, status: 'active', autoFim: 1, iniciadoHaMin: 75 });
      const dentroDaDuracao = await criar({ nome: 'Ensaio em andamento', minutos: -30, duracao: 60, status: 'active', autoFim: 1, iniciadoHaMin: 30 });
      const fimManual = await criar({ nome: 'Ensaio fim manual', minutos: -90, duracao: 60, status: 'active', autoFim: 0, iniciadoHaMin: 75 });

      const acoes = await runLifecycleTick({});
      const feitas = Object.fromEntries(acoes.map((a) => [a.eventoId, a.action]));

      assert.equal(feitas[comecaAgora], 'start');
      const iniciado = await statusDe(comecaAgora);
      assert.equal(iniciado.status, 'active');
      assert.ok(iniciado.iniciadoEm, 'guarda o início real');
      console.log('  ✔ agendado com início automático e horário já chegado: ficou ativo, com o início real gravado');

      assert.equal((await statusDe(aindaNaoChegou)).status, 'scheduled');
      assert.equal((await statusDe(janelaPassou)).status, 'scheduled');
      assert.equal((await statusDe(manualAgendado)).status, 'scheduled');
      console.log('  ✔ não inicia: horário ainda não chegou, janela inteira já passou, nem evento de início manual');

      assert.equal(feitas[passouDaDuracao], 'finish');
      const encerrado = await statusDe(passouDaDuracao);
      assert.equal(encerrado.status, 'finished');
      assert.ok(encerrado.finalizadoEm, 'guarda o fim');
      console.log('  ✔ ativo com encerramento automático que passou da duração (contada do início real): encerrado');

      assert.equal((await statusDe(dentroDaDuracao)).status, 'active');
      assert.equal((await statusDe(fimManual)).status, 'active');
      console.log('  ✔ não encerra: ainda dentro da duração, nem evento de encerramento manual');

      throw new Desfazer();
    });
  } catch (e) {
    if (!(e instanceof Desfazer)) throw e;
  }
  console.log('ROLLBACK ok (nada foi gravado)');
}

main().then(() => closeDB()).catch((e) => { console.error('❌ ENSAIO FALHOU:', e); process.exit(1); });
