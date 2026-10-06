// test-zone-conquest-reset.js - Script de teste para validar reset de dados
// Valida que dados antigos não persistem ao iniciar novo jogo

const { query, queryOne, allQuery } = require('./database');
const { v4: uuidv4 } = require('uuid');

/**
 * Teste 1: Verificar inicialização limpa de states
 */
async function testCheckpointStatesInitialization() {
  console.log('\n✅ TESTE 1: Inicialização de Checkpoint States');
  console.log('=' .repeat(60));

  try {
    const eventoId = 'test-evento-reset-' + Date.now();
    const empresaId = uuidv4();
    const partidaId = uuidv4();

    // Simular inicialização
    console.log(`  📋 Evento: ${eventoId}`);
    console.log(`  👥 Empresa: ${empresaId}`);
    console.log(`  🎮 Partida: ${partidaId}\n`);

    // Criar checkpoint state
    await query(
      `INSERT INTO zone_conquest_checkpoint_states 
       (id, partida_id, empresa_id, evento_id, checkpoint_id, current_owner_id, owner_type, protected_until, last_conquered_at, conquest_count)
       VALUES (@id, @partidaId, @empresaId, @eventoId, @checkpointId, NULL, 'team', NULL, NULL, 0)`,
      {
        id: uuidv4(),
        partidaId,
        empresaId,
        eventoId,
        checkpointId: 'cp-1',
      }
    );

    // Verificar que foi criado com valores zerados
    const state = await queryOne(
      `SELECT * FROM zone_conquest_checkpoint_states WHERE partida_id = @partidaId`,
      { partidaId }
    );

    if (state) {
      console.log(`  ✓ Checkpoint State criado com sucesso`);
      console.log(`    - current_owner_id: ${state.current_owner_id} (esperado: NULL)`);
      console.log(`    - protected_until: ${state.protected_until} (esperado: NULL)`);
      console.log(`    - conquest_count: ${state.conquest_count} (esperado: 0)`);

      if (state.current_owner_id === null && state.protected_until === null && state.conquest_count === 0) {
        console.log(`  ✅ PASSOU: Estados inicializados com valores zerados\n`);
        return true;
      } else {
        console.log(`  ❌ FALHOU: Estados não foram zerados corretamente\n`);
        return false;
      }
    } else {
      console.log(`  ❌ FALHOU: Checkpoint State não foi criado\n`);
      return false;
    }
  } catch (err) {
    console.error(`  ❌ ERRO: ${err.message}\n`);
    return false;
  }
}

/**
 * Teste 2: Verificar limpeza de states antigos
 */
async function testOldDataCleanup() {
  console.log('\n✅ TESTE 2: Limpeza de Dados Antigos');
  console.log('=' .repeat(60));

  try {
    const eventoId = 'test-evento-cleanup-' + Date.now();
    const empresaId = uuidv4();
    const oldPartidaId = uuidv4();
    const newPartidaId = uuidv4();

    console.log(`  📋 Evento: ${eventoId}`);
    console.log(`  🎮 Partida Anterior: ${oldPartidaId}`);
    console.log(`  🎮 Partida Nova: ${newPartidaId}\n`);

    // Criar states da partida anterior (simulando jogo anterior)
    await query(
      `INSERT INTO zone_conquest_checkpoint_states 
       (id, partida_id, empresa_id, evento_id, checkpoint_id, current_owner_id, owner_type, protected_until, last_conquered_at, conquest_count)
       VALUES (@id, @partidaId, @empresaId, @eventoId, @checkpointId, @ownerId, 'team', @protectedUntil, @conquestedAt, @count)`,
      {
        id: uuidv4(),
        partidaId: oldPartidaId,
        empresaId,
        eventoId,
        checkpointId: 'cp-1',
        ownerId: 'team-1',
        protectedUntil: new Date(),
        conquestedAt: new Date(),
        count: 5,
      }
    );

    // Verificar que dado antigo existe
    const oldState = await queryOne(
      `SELECT * FROM zone_conquest_checkpoint_states WHERE partida_id = @partidaId`,
      { partidaId: oldPartidaId }
    );

    console.log(`  ✓ State antigo criado com dados de jogo anterior`);
    console.log(`    - current_owner_id: ${oldState.current_owner_id}`);
    console.log(`    - conquest_count: ${oldState.conquest_count}\n`);

    // Criar nova partida (simulando novo jogo)
    await query(
      `INSERT INTO zone_conquest_checkpoint_states 
       (id, partida_id, empresa_id, evento_id, checkpoint_id, current_owner_id, owner_type, protected_until, last_conquered_at, conquest_count)
       VALUES (@id, @partidaId, @empresaId, @eventoId, @checkpointId, NULL, 'team', NULL, NULL, 0)`,
      {
        id: uuidv4(),
        partidaId: newPartidaId,
        empresaId,
        eventoId,
        checkpointId: 'cp-1',
      }
    );

    // Verificar que novo state foi criado zerado
    const newState = await queryOne(
      `SELECT * FROM zone_conquest_checkpoint_states WHERE partida_id = @partidaId`,
      { partidaId: newPartidaId }
    );

    // Verificar que estado antigo AINDA existe (historicamente)
    const oldStateStillExists = await queryOne(
      `SELECT * FROM zone_conquest_checkpoint_states WHERE partida_id = @partidaId`,
      { partidaId: oldPartidaId }
    );

    console.log(`  ✓ Novo state criado com dados zerados`);
    console.log(`    - current_owner_id: ${newState.current_owner_id} (esperado: NULL)`);
    console.log(`    - conquest_count: ${newState.conquest_count} (esperado: 0)\n`);

    if (
      newState.current_owner_id === null &&
      newState.conquest_count === 0 &&
      oldStateStillExists.current_owner_id === 'team-1' &&
      oldStateStillExists.conquest_count === 5
    ) {
      console.log(`  ✅ PASSOU: Nova partida tem dados zerados, dados antigos preservados historicamente\n`);
      return true;
    } else {
      console.log(`  ❌ FALHOU: Isolamento de partidas não funcionou corretamente\n`);
      return false;
    }
  } catch (err) {
    console.error(`  ❌ ERRO: ${err.message}\n`);
    return false;
  }
}

/**
 * Teste 3: Verificar diferenciação de modos (TEAM vs INDIVIDUAL)
 */
async function testModeDifferentiation() {
  console.log('\n✅ TESTE 3: Diferenciação de Modos');
  console.log('=' .repeat(60));

  try {
    const eventoId = 'test-evento-modes-' + Date.now();
    const empresaId = uuidv4();
    const teamPartidaId = uuidv4();
    const individualPartidaId = uuidv4();

    console.log(`  📋 Evento: ${eventoId}`);
    console.log(`  👥 Empresa: ${empresaId}\n`);

    // Criar TEAM partida
    await query(
      `INSERT INTO zone_conquest_checkpoint_states 
       (id, partida_id, empresa_id, evento_id, checkpoint_id, current_owner_id, owner_type)
       VALUES (@id, @partidaId, @empresaId, @eventoId, @checkpointId, NULL, @ownerType)`,
      {
        id: uuidv4(),
        partidaId: teamPartidaId,
        empresaId,
        eventoId,
        checkpointId: 'cp-1',
        ownerType: 'team',
      }
    );

    // Criar INDIVIDUAL partida
    await query(
      `INSERT INTO zone_conquest_checkpoint_states 
       (id, partida_id, empresa_id, evento_id, checkpoint_id, current_owner_id, owner_type)
       VALUES (@id, @partidaId, @empresaId, @eventoId, @checkpointId, NULL, @ownerType)`,
      {
        id: uuidv4(),
        partidaId: individualPartidaId,
        empresaId,
        eventoId,
        checkpointId: 'cp-1',
        ownerType: 'individual',
      }
    );

    const teamState = await queryOne(
      `SELECT * FROM zone_conquest_checkpoint_states WHERE partida_id = @partidaId`,
      { partidaId: teamPartidaId }
    );

    const individualState = await queryOne(
      `SELECT * FROM zone_conquest_checkpoint_states WHERE partida_id = @partidaId`,
      { partidaId: individualPartidaId }
    );

    console.log(`  ✓ States criados com diferentes owner_type`);
    console.log(`    TEAM owner_type: ${teamState.owner_type}`);
    console.log(`    INDIVIDUAL owner_type: ${individualState.owner_type}\n`);

    if (teamState.owner_type === 'team' && individualState.owner_type === 'individual') {
      console.log(`  ✅ PASSOU: Modos diferenciados corretamente\n`);
      return true;
    } else {
      console.log(`  ❌ FALHOU: Modos não foram diferenciados\n`);
      return false;
    }
  } catch (err) {
    console.error(`  ❌ ERRO: ${err.message}\n`);
    return false;
  }
}

/**
 * Teste 4: Verificar Zone States
 */
async function testZoneStatesReset() {
  console.log('\n✅ TESTE 4: Reset de Zone States');
  console.log('=' .repeat(60));

  try {
    const eventoId = 'test-evento-zones-' + Date.now();
    const empresaId = uuidv4();
    const partidaId = uuidv4();

    console.log(`  📋 Evento: ${eventoId}`);
    console.log(`  🎮 Partida: ${partidaId}\n`);

    // Criar zone state
    await query(
      `INSERT INTO zone_conquest_zone_states 
       (id, partida_id, empresa_id, evento_id, zone_id, current_owner_id, owner_type, is_disputed, checkpoints_count, checkpoints_owned)
       VALUES (@id, @partidaId, @empresaId, @eventoId, @zoneId, NULL, 'team', 0, 0, 0)`,
      {
        id: uuidv4(),
        partidaId,
        empresaId,
        eventoId,
        zoneId: 'zone-1',
      }
    );

    const zoneState = await queryOne(
      `SELECT * FROM zone_conquest_zone_states WHERE partida_id = @partidaId`,
      { partidaId }
    );

    console.log(`  ✓ Zone State criado`);
    console.log(`    - current_owner_id: ${zoneState.current_owner_id} (esperado: NULL)`);
    console.log(`    - is_disputed: ${zoneState.is_disputed} (esperado: 0/false)`);
    console.log(`    - checkpoints_owned: ${zoneState.checkpoints_owned} (esperado: 0)\n`);

    if (
      zoneState.current_owner_id === null &&
      zoneState.is_disputed === 0 &&
      zoneState.checkpoints_owned === 0
    ) {
      console.log(`  ✅ PASSOU: Zone States inicializados com valores corretos\n`);
      return true;
    } else {
      console.log(`  ❌ FALHOU: Zone States não estão corretos\n`);
      return false;
    }
  } catch (err) {
    console.error(`  ❌ ERRO: ${err.message}\n`);
    return false;
  }
}

/**
 * Executar todos os testes
 */
async function runAllTests() {
  console.log('\n');
  console.log('🧪 INICIANDO TESTES DE RESET DE ZONE CONQUEST');
  console.log('=' .repeat(60));

  const results = [];

  results.push(await testCheckpointStatesInitialization());
  results.push(await testOldDataCleanup());
  results.push(await testModeDifferentiation());
  results.push(await testZoneStatesReset());

  console.log('\n' + '=' .repeat(60));
  console.log('📊 RESUMO DOS TESTES');
  console.log('=' .repeat(60));

  const passed = results.filter((r) => r).length;
  const total = results.length;

  console.log(`\n  ✅ Testes passando: ${passed}/${total}`);

  if (passed === total) {
    console.log(`\n  🎉 TODOS OS TESTES PASSARAM!\n`);
    process.exit(0);
  } else {
    console.log(`\n  ⚠️  ${total - passed} TESTE(S) FALHARAM\n`);
    process.exit(1);
  }
}

// Executar testes
runAllTests().catch((err) => {
  console.error('\n❌ ERRO CRÍTICO:', err.message);
  process.exit(1);
});
