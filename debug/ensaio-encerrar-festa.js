// Ensaio do encerramento da festa: roda no banco de dev DENTRO de uma transação e a DESFAZ (ROLLBACK).
// Ao finalizar o evento, o vínculo de todas as pulseiras dele acaba na hora; as de outro evento ficam como estavam.
// Uso: node debug/ensaio-encerrar-festa.js
require('dotenv').config();
const assert = require('node:assert/strict');
const crypto = require('crypto');
const database = require('../database');
const { query, queryOne, allQuery, closeDB } = database;
const withTransaction = database.withTransaction;
// A liberação abre a própria transação; no ensaio ela entra na transação externa (a que será desfeita).
database.withTransaction = (trabalho) => trabalho(database);
const { finishEvent } = require('../utils/eventLifecycle');

class Desfazer extends Error {}

async function main() {
  const evento = await queryOne("SELECT eventoId, empresaId, nome, status FROM evento WHERE nome = 'Festa do João'");
  assert.ok(evento, 'a Festa do João existe');
  const outro = await queryOne('SELECT eventoId, empresaId FROM evento WHERE eventoId <> @e AND empresaId IS NOT NULL LIMIT 1', { e: evento.eventoId });
  assert.ok(outro, 'há outro evento no banco de dev');

  try {
    await withTransaction(async () => {
      await query("UPDATE evento SET status = 'active', finalizadoEm = NULL WHERE eventoId = @e", { e: evento.eventoId });

      const criar = async (eventoId, empresaId, codigo, pontos) => {
        const id = crypto.randomUUID();
        await query(
          `INSERT INTO pulseira (codigo, status, empresaId, criadoEm) VALUES (@codigo, 'em_uso', @emp, CURRENT_TIMESTAMP)`,
          { codigo, emp: empresaId }
        );
        await query(
          `INSERT INTO crianca (criancaId, eventoId, empresaId, nome, apelido, idade, pontos, status, codigoPulseira)
           VALUES (@id, @e, @emp, @nome, @nome, 8, @pontos, 'active', @codigo)`,
          { id, e: eventoId, emp: empresaId, nome: `Ensaio ${codigo}`, pontos, codigo }
        );
        await query('UPDATE pulseira SET criancaId = @id WHERE codigo = @codigo AND empresaId = @emp', { id, codigo, emp: empresaId });
        return id;
      };
      const daFesta = [await criar(evento.eventoId, evento.empresaId, 'ZZENSAIO01', 30), await criar(evento.eventoId, evento.empresaId, 'ZZENSAIO02', 0), await criar(evento.eventoId, evento.empresaId, 'ZZENSAIO03', 15)];
      const doOutro = await criar(outro.eventoId, outro.empresaId, 'ZZENSAIO99', 5);

      const resultado = await finishEvent(evento.eventoId, { source: 'manual' });
      assert.equal(resultado.changed, true);
      assert.ok(resultado.braceletsReleased >= 3, `liberou as pulseiras da festa (${resultado.braceletsReleased})`);

      const status = await queryOne('SELECT status FROM evento WHERE eventoId = @e', { e: evento.eventoId });
      assert.equal(String(status.status).toLowerCase(), 'finished');

      for (const [i, id] of daFesta.entries()) {
        const codigo = `ZZENSAIO0${i + 1}`;
        const crianca = await queryOne('SELECT codigoPulseira, ultimaPulseira, pontos FROM crianca WHERE criancaId = @id', { id });
        assert.equal(crianca.codigoPulseira, null, 'a criança não tem mais pulseira vinculada');
        assert.equal(crianca.ultimaPulseira, codigo, 'a pulseira usada fica no histórico (relatórios)');
        const pulseira = await queryOne('SELECT status, criancaId FROM pulseira WHERE codigo = @codigo AND empresaId = @emp', { codigo, emp: evento.empresaId });
        assert.equal(pulseira.status, 'disponivel');
        assert.equal(pulseira.criancaId, null);
      }
      assert.equal(Number((await queryOne('SELECT pontos FROM crianca WHERE criancaId = @id', { id: daFesta[0] })).pontos), 30, 'os pontos ficam');
      console.log(`  ✔ ao encerrar a festa: ${daFesta.length} pulseiras voltam a ficar disponíveis na hora, a criança guarda a pulseira usada e os pontos`);

      const outraCrianca = await queryOne('SELECT codigoPulseira FROM crianca WHERE criancaId = @id', { id: doOutro });
      const outraPulseira = await queryOne("SELECT status, criancaId FROM pulseira WHERE codigo = 'ZZENSAIO99' AND empresaId = @emp", { emp: outro.empresaId });
      assert.equal(outraCrianca.codigoPulseira, 'ZZENSAIO99');
      assert.equal(outraPulseira.status, 'em_uso');
      assert.equal(outraPulseira.criancaId, doOutro);
      console.log('  ✔ a pulseira de participante de outro evento não é mexida');

      const denovo = await finishEvent(evento.eventoId, { source: 'manual' });
      assert.equal(denovo.changed, false, 'encerrar de novo não faz nada');
      console.log('  ✔ encerrar uma festa já encerrada não repete a liberação');

      throw new Desfazer();
    });
  } catch (e) {
    if (!(e instanceof Desfazer)) throw e;
  }
  const igual = await queryOne('SELECT status FROM evento WHERE eventoId = @e', { e: evento.eventoId });
  assert.equal(String(igual.status), String(evento.status));
  console.log('ROLLBACK ok (nada foi gravado)');
}

main().then(() => closeDB()).catch((e) => { console.error('❌ ENSAIO FALHOU:', e); process.exit(1); });
