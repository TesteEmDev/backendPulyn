// Ensaio da solicitação de checkpoints: roda no banco de dev DENTRO de uma transação e a DESFAZ (ROLLBACK).
// Confere que as colunas novas do chamado existem e que o insert/leitura da solicitação funciona.
// Uso: node debug/ensaio-solicitar-checkpoints.js
require('dotenv').config();
const assert = require('node:assert/strict');
const crypto = require('crypto');
const database = require('../database');

class Desfazer extends Error {}

async function main() {
  try {
    await database.withTransaction(async (q) => {
      await q.query(`CREATE TABLE IF NOT EXISTS chamadoSuport (
        ticketId varchar(36) PRIMARY KEY, empresaId varchar(36), cliente varchar(255) NOT NULL, assunto varchar(255) NOT NULL,
        status varchar(20) NOT NULL DEFAULT 'aberto', prioridade varchar(20) NOT NULL DEFAULT 'media', descricao text,
        atribuidoPara varchar(255), criadoEm timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP, atualizadoEm timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
      await q.query("ALTER TABLE chamadoSuport ADD COLUMN IF NOT EXISTS tipoChamado varchar(20) NOT NULL DEFAULT 'chamado'");
      await q.query('ALTER TABLE chamadoSuport ADD COLUMN IF NOT EXISTS itens text');
      const id = crypto.randomUUID();
      const itens = JSON.stringify([{ tipo: 'NFC', quantidade: 5 }, { tipo: 'UHF', quantidade: 2 }]);
      await q.query(`INSERT INTO chamadoSuport (ticketId, empresaId, cliente, assunto, status, prioridade, descricao, atribuidoPara, tipoChamado, itens)
        VALUES (@id, NULL, 'Teste', 'Solicitação de checkpoints: 5 × NFC/RFID, 2 × UHF', 'aberto', 'media', NULL, 'Atribuir', 'checkpoint', @itens)`, { id, itens });
      const linha = await q.queryOne('SELECT ticketId, tipoChamado, itens FROM chamadoSuport WHERE ticketId = @id', { id });
      assert.equal(linha.tipoChamado, 'checkpoint');
      assert.deepEqual(JSON.parse(linha.itens), [{ tipo: 'NFC', quantidade: 5 }, { tipo: 'UHF', quantidade: 2 }]);
      console.log('✅ ensaio ok (desfeito)');
      throw new Desfazer();
    });
  } catch (e) {
    if (!(e instanceof Desfazer)) throw e;
  } finally {
    await database.closeDB();
  }
}
main().catch((e) => { console.error('❌', e); process.exit(1); });
