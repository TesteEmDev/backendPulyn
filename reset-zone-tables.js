#!/usr/bin/env node
const { query, DB_DRIVER } = require('./database');

async function resetZoneTables() {
  console.log('🧹 Resetando tabelas de Zone Conquest...');

  if (DB_DRIVER === 'postgres' || DB_DRIVER === 'postgresql') {
    try {
      console.log('  Dropando zonas_equipes_scans...');
      await query('DROP TABLE IF EXISTS zonas_equipes_scans CASCADE');

      console.log('  Dropando zonas_equipes_teams_states...');
      await query('DROP TABLE IF EXISTS zonas_equipes_teams_states CASCADE');

      console.log('  Dropando zonas_equipes_partidas...');
      await query('DROP TABLE IF EXISTS zonas_equipes_partidas CASCADE');

      console.log('✅ Tabelas removidas com sucesso!');
      console.log('👉 Agora execute: npm start');
      process.exit(0);
    } catch (err) {
      console.error('❌ Erro:', err.message);
      process.exit(1);
    }
  } else {
    console.log('⚠️  Suporte para SQL Server ainda não implementado neste script');
    process.exit(1);
  }
}

resetZoneTables();
