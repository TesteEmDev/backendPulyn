// Ensaio da exclusão de cliente: roda no banco de dev DENTRO de uma transação e a DESFAZ (ROLLBACK).
// Confere: 1. buffet com evento em andamento tem o evento encerrado e apagado junto; 2. buffet sem eventos é apagado, os checkpoints com MAC (aceito e pendente) voltam ao estoque e o sem MAC é apagado.
// Uso: node debug/ensaio-apagar-cliente.js
require('dotenv').config();
const assert = require('node:assert/strict');
const crypto = require('crypto');
const database = require('../database');
const { queryOne, closeDB } = database;
const { apagarClienteDentroDaTransacao, resumoDoCliente, encerrarEventosEmAndamento } = require('../utils/apagarCliente');

class Desfazer extends Error {}

async function main() {
  try {
    await database.withTransaction(async (q) => {
      const colunas = await q.allQuery("SELECT column_name FROM information_schema.columns WHERE table_name = 'empresa' AND is_nullable = 'NO' AND column_default IS NULL");
      const modelo = await queryOne('SELECT * FROM empresa LIMIT 1');
      assert.ok(modelo, 'existe uma empresa para servir de modelo');
      const nova = async (nome) => {
        const empresaId = crypto.randomUUID();
        const linha = { ...modelo, empresaId };
        for (const k of Object.keys(linha)) if (/^(cnpj|email|slug|dominio|codigo)/i.test(k) && linha[k]) linha[k] = `${empresaId.replace(/-/g, '')}${linha[k]}`.slice(0, String(linha[k]).length);
        if ('nome' in linha) linha.nome = nome;
        const cols = Object.keys(linha);
        await q.query(`INSERT INTO empresa (${cols.map((c) => `"${c}"`).join(',')}) VALUES (${cols.map((c) => `@${c}`).join(',')})`, linha);
        return empresaId;
      };
      const cp = async (empresaId, { mac, status, destino = null }) => {
        const checkpointId = String(900000000 + Math.floor(Math.random() * 99999999));
        await q.query(
          `INSERT INTO pontoVerificacao (id, checkpointId, empresaId, empresaDestinoId, nome, macAddress, statusTransferencia, numCheck)
           VALUES (CAST(@checkpointId AS integer), @checkpointId, @empresaId, @destino, 'Ensaio', @mac, @status, @num)`,
          { checkpointId, empresaId: status === 'pendente' ? null : empresaId, destino: status === 'pendente' ? empresaId : destino, mac, status, num: status === 'aceito' ? checkpointId : null });
        return checkpointId;
      };
      const linha = (id) => queryOne('SELECT * FROM pontoVerificacao WHERE checkpointId = @id', { id });
      void colunas;

      // 1) buffet com evento em andamento, participante e pulseira: encerra, apaga tudo e devolve o checkpoint
      const comEvento = await nova('Ensaio com evento');
      const eventoId = crypto.randomUUID();
      await q.query(`INSERT INTO evento (eventoId, empresaId, nome, data, hora, duracao, status) VALUES (@id, @e, 'Ensaio', '2030-01-01', '10:00', 60, 'active')`, { id: eventoId, e: comEvento });
      await q.query(`INSERT INTO evento (eventoId, empresaId, nome, data, hora, duracao, status) VALUES (@id, @e, 'Ensaio 2', '2030-01-02', '10:00', 60, 'scheduled')`, { id: crypto.randomUUID(), e: comEvento });
      const preso = await cp(comEvento, { mac: 'AA:00:00:00:00:01', status: 'aceito' });
      await q.query(`UPDATE pontoVerificacao SET eventoId = @ev WHERE checkpointId = @id`, { ev: eventoId, id: preso });
      const resumo = await resumoDoCliente(comEvento, q);
      assert.equal(resumo.eventos, 2);
      assert.equal(resumo.eventosEmAndamento, 1);
      assert.equal(resumo.checkpointsParaEstoque, 1);
      const encerrados = await encerrarEventosEmAndamento(comEvento, q, {});
      assert.equal(encerrados, 1);
      assert.equal((await queryOne('SELECT status FROM evento WHERE eventoId = @id', { id: eventoId })).status, 'finished');
      const r1 = await apagarClienteDentroDaTransacao(comEvento, [], q);
      assert.equal(r1.eventosApagados, 2);
      assert.ok(!(await queryOne('SELECT 1 AS x FROM evento WHERE eventoId = @id', { id: eventoId })), 'evento apagado');
      assert.ok(!(await queryOne('SELECT 1 AS x FROM empresa WHERE empresaId = @e', { e: comEvento })), 'empresa apagada');
      const volta = await linha(preso);
      assert.equal(volta.statusTransferencia, 'estoque');
      assert.equal(volta.empresaId, null);
      assert.equal(volta.eventoId, null);
      console.log('  ✔ buffet com evento em andamento: evento encerrado e apagado, cliente apagado, checkpoint de volta ao estoque');

      // 2) buffet limpo: apaga e devolve
      const limpo = await nova('Ensaio limpo');
      const comMac = await cp(limpo, { mac: 'AA:00:00:00:00:02', status: 'aceito' });
      const pendente = await cp(limpo, { mac: 'AA:00:00:00:00:03', status: 'pendente' });
      const semMac = await cp(limpo, { mac: null, status: 'aceito' });
      const r2 = await apagarClienteDentroDaTransacao(limpo, [], q);
            assert.equal(r2.checkpoints.devolvidos, 2);
      assert.equal(r2.checkpoints.apagados, 1);
      assert.ok(!(await queryOne('SELECT 1 AS x FROM empresa WHERE empresaId = @e', { e: limpo })), 'empresa apagada');
      for (const id of [comMac, pendente]) {
        const c = await linha(id);
        assert.equal(c.statusTransferencia, 'estoque');
        assert.equal(c.empresaId, null);
        assert.equal(c.empresaDestinoId, null);
        assert.equal(c.numCheck, null);
      }
      assert.ok(!(await linha(semMac)), 'checkpoint antigo (sem MAC) apagado');
      console.log('  ✔ buffet limpo: apagado; checkpoints com MAC (aceito e pendente) voltaram ao estoque; o sem MAC foi apagado');
      throw new Desfazer();
    });
  } catch (e) {
    if (!(e instanceof Desfazer)) throw e;
  }
  console.log('ROLLBACK ok (nada foi gravado)');
}

main().then(() => closeDB()).catch((e) => { console.error('❌ ENSAIO FALHOU:', e); process.exit(1); });
