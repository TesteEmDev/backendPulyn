// Ensaio da exclusão de cliente: roda no banco de dev DENTRO de uma transação e a DESFAZ (ROLLBACK).
// Cria um buffet com um checkpoint com MAC (aceito), um sem MAC e um pendente, e confere:
//  1. buffet com evento é recusado com a lista do que impede, sem alterar nada;
//  2. buffet sem pendências é apagado, os checkpoints com MAC (aceito e pendente) voltam ao estoque e o sem MAC é apagado.
// Uso: node debug/ensaio-apagar-cliente.js
require('dotenv').config();
const assert = require('node:assert/strict');
const crypto = require('crypto');
const database = require('../database');
const { queryOne, closeDB } = database;
const { apagarClienteDentroDaTransacao } = require('../utils/apagarCliente');

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

      // 1) buffet com evento: recusa
      const comEvento = await nova('Ensaio com evento');
      await q.query(`INSERT INTO evento (eventoId, empresaId, nome, data, hora, duracao, status) VALUES (@id, @e, 'Ensaio', '2030-01-01', '10:00', 60, 'scheduled')`, { id: crypto.randomUUID(), e: comEvento });
      const preso = await cp(comEvento, { mac: 'AA:00:00:00:00:01', status: 'aceito' });
      const r1 = await apagarClienteDentroDaTransacao(comEvento, [], q);
      assert.equal(r1.bloqueios.length, 1);
      assert.equal(r1.bloqueios[0].rotulo, 'evento(s)');
      assert.equal((await linha(preso)).empresaId, comEvento, 'nada foi alterado');
      assert.ok(await queryOne('SELECT 1 AS x FROM empresa WHERE empresaId = @e', { e: comEvento }), 'empresa continua');
      console.log('  ✔ buffet com evento: exclusão recusada, lista o que impede e não mexe em nada');

      // 2) buffet limpo: apaga e devolve
      const limpo = await nova('Ensaio limpo');
      const comMac = await cp(limpo, { mac: 'AA:00:00:00:00:02', status: 'aceito' });
      const pendente = await cp(limpo, { mac: 'AA:00:00:00:00:03', status: 'pendente' });
      const semMac = await cp(limpo, { mac: null, status: 'aceito' });
      const r2 = await apagarClienteDentroDaTransacao(limpo, [], q);
      assert.equal(r2.bloqueios.length, 0);
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
