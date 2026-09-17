const { query, queryOne, transaction } = require('../database');
const { v4: uuidv4 } = require('uuid');

const ZONE_CONQUEST_GAME_TYPE = 'zone';

async function startZoneConquestGame(eventoId, brincadeiraId) {
  const resultado = await transaction(async (tx) => {
    // Buscar evento e jogo
    const evento = await tx.queryOne('SELECT * FROM eventos WHERE id = @id', { id: eventoId });
    if (!evento) throw new Error('Evento não encontrado');

    const game = await tx.queryOne(
      'SELECT * FROM brincadeiras WHERE id = @id',
      { id: brincadeiraId }
    );
    if (!game) throw new Error('Jogo não encontrado');

    const now = new Date();
    const partidaId = uuidv4();

    // 1. Finalizar qualquer partida ativa anterior
    await tx.query(`
      UPDATE zonas_equipes_teams_states
      SET status = 'finished', version = version + 1
      WHERE LOWER(evento_id) = LOWER(@eventoId) AND status = 'active'`, { eventoId });
    
    await tx.query(`
      UPDATE zonas_equipes_partidas
      SET status = 'finished', finished_at = GETDATE(), version = version + 1
      WHERE LOWER(evento_id) = LOWER(@eventoId) AND status = 'active'`, { eventoId });

    // 2. Criar nova partida
    await tx.query(`
      INSERT INTO zonas_equipes_partidas
        (id, empresa_id, evento_id, brincadeira_id, status, version, started_at)
      VALUES (@id, @empresaId, @eventoId, @brincadeiraId, 'active', 0, @startedAt)`, {
      id: partidaId,
      empresaId: evento.empresa_id,
      eventoId,
      brincadeiraId,
      startedAt: now,
    });

    // 3. Buscar todas as equipes participantes
    const participatingTeams = await tx.query(`
      SELECT DISTINCT t.id, t.name
      FROM times t
      WHERE t.evento_id = @eventoId
      ORDER BY t.name`, { eventoId });

    // 4. Criar state para cada equipe
    for (const team of participatingTeams) {
      await tx.query(`
        INSERT INTO zonas_equipes_teams_states
          (id, partida_id, empresa_id, evento_id, time_id, status, version)
        VALUES (@id, @partidaId, @empresaId, @eventoId, @timeId, 'active', 0)`, {
        id: uuidv4(),
        partidaId,
        empresaId: evento.empresa_id,
        eventoId,
        timeId: team.id,
      });
    }

    return {
      id: partidaId,
      eventoId,
      brincadeiraId,
      gameType: ZONE_CONQUEST_GAME_TYPE,
      startedAt: now.toISOString(),
      status: 'active',
      teams: participatingTeams.map(t => ({
        id: t.id,
        name: t.name,
        status: 'active',
      })),
    };
  });

  return resultado;
}

async function stopZoneConquestGame(eventoId) {
  try {
    // 1. Calcular vencedor e salvar resultados
    await calculateAndSaveZoneConquestResults(eventoId);
  } catch (err) {
    console.warn('⚠️ Erro ao calcular resultados de Zone Conquest:', err.message);
  }

  // 2. Finalizar team states
  await query(`
    UPDATE zonas_equipes_teams_states
    SET status = 'finished', version = version + 1
    WHERE LOWER(evento_id) = LOWER(@eventoId) AND status = 'active'`, { eventoId });

  // 3. Finalizar partida
  await query(`
    UPDATE zonas_equipes_partidas
    SET status = 'finished', finished_at = GETDATE(), version = version + 1
    WHERE LOWER(evento_id) = LOWER(@eventoId) AND status = 'active'`, { eventoId });
}

async function calculateAndSaveZoneConquestResults(eventoId) {
  // 1. Buscar partida ativa
  const partida = await queryOne(`
    SELECT id FROM zonas_equipes_partidas
    WHERE LOWER(evento_id) = LOWER(@eventoId) AND status = 'active'`, { eventoId });

  if (!partida) return;

  // 2. Contar checkpoints dominados por cada equipe
  const checkpointsByTeam = await query(`
    SELECT 
      t.id AS time_id,
      t.name AS time_name,
      COUNT(DISTINCT c.id) AS checkpoints_dominados
    FROM times t
    LEFT JOIN (
      SELECT DISTINCT checkpoint_id, time_id
      FROM zonas_equipes_scans
      WHERE partida_id = @partidaId
      GROUP BY checkpoint_id, time_id
      HAVING COUNT(*) = (
        SELECT COUNT(*)
        FROM zonas_equipes_scans s2
        WHERE s2.partida_id = @partidaId
        AND s2.checkpoint_id = zonas_equipes_scans.checkpoint_id
        GROUP BY s2.checkpoint_id
        ORDER BY COUNT(*) DESC
        LIMIT 1
      )
    ) c ON c.time_id = t.id
    WHERE t.evento_id = @eventoId
    GROUP BY t.id, t.name
    ORDER BY checkpoints_dominados DESC`, { partidaId: partida.id, eventoId });

  if (checkpointsByTeam.length === 0) return;

  // 3. Determinar vencedor (equipe com mais checkpoints)
  const winningTeam = checkpointsByTeam[0];
  const now = new Date();

  // 4. Atualizar partida com vencedor
  await query(`
    UPDATE zonas_equipes_partidas
    SET version = version + 1
    WHERE id = @partidaId`, { partidaId: partida.id });

  // 5. Atualizar team states com vitória/derrota
  for (const teamData of checkpointsByTeam) {
    const isWinner = teamData.time_id === winningTeam.time_id;
    await query(`
      UPDATE zonas_equipes_teams_states
      SET ${isWinner ? 'victory_at = @now' : 'defeated_at = @now'}, version = version + 1
      WHERE partida_id = @partidaId AND time_id = @timeId`, {
      partidaId: partida.id,
      timeId: teamData.time_id,
      now,
    });
  }

  // 6. Atualizar checkpoints com territory_owner_time_id
  const checkpointsWithOwner = await query(`
    SELECT DISTINCT c.id, c.checkpoint_id, c.time_id, ROW_NUMBER() OVER (PARTITION BY c.checkpoint_id ORDER BY COUNT(*) DESC, MIN(c.scanned_at) ASC) as rn
    FROM zonas_equipes_scans c
    WHERE c.partida_id = @partidaId
    GROUP BY c.checkpoint_id, c.time_id, c.id, c.scanned_at`, { partidaId: partida.id });

  for (const ckpt of checkpointsWithOwner) {
    if (ckpt.rn === 1) {
      await query(`
        UPDATE checkpoints
        SET territory_owner_time_id = @timeId, last_conquered_at = @now
        WHERE id = @checkpointId`, {
        checkpointId: ckpt.checkpoint_id,
        timeId: ckpt.time_id,
        now,
      }).catch(() => {});
    }
  }

  console.log(`✅ Resultados salvos para Zone Conquest - Vencedor: ${winningTeam.time_name} (${winningTeam.checkpoints_dominados} checkpoints)`);
}

async function recordZoneConquestScan(eventoId, checkpointId, criancaId, timeId, leituraId, uid) {
  // 1. Buscar partida ativa
  const partida = await queryOne(`
    SELECT id FROM zonas_equipes_partidas
    WHERE LOWER(evento_id) = LOWER(@eventoId) AND status = 'active'`, { eventoId });

  if (!partida) {
    throw new Error('Nenhuma partida de zona conquest ativa para este evento');
  }

  // 2. Buscar jogo ativo
  const brincadeira = await queryOne(`
    SELECT id FROM brincadeiras
    WHERE evento_id = @eventoId AND status = 'active'`, { eventoId });

  // 3. Registrar scan
  const scanId = uuidv4();
  const now = new Date();

  await query(`
    INSERT INTO zonas_equipes_scans
      (id, partida_id, empresa_id, evento_id, brincadeira_id, checkpoint_id,
       crianca_id, time_id, uid, leitura_id, version, scanned_at)
    VALUES (@id, @partidaId, @empresaId, @eventoId, @brincadeiraId, @checkpointId,
            @criancaId, @timeId, @uid, @leituraId, 0, @scannedAt)`, {
    id: scanId,
    partidaId: partida.id,
    empresaId: null, // Será preenchido pelo backend
    eventoId,
    brincadeiraId: brincadeira ? brincadeira.id : null,
    checkpointId,
    criancaId,
    timeId,
    uid,
    leituraId,
    scannedAt: now,
  });

  return scanId;
}

async function getZoneConquestPartidaAtiva(eventoId) {
  return queryOne(`
    SELECT id, status, started_at
    FROM zonas_equipes_partidas
    WHERE LOWER(evento_id) = LOWER(@eventoId) AND status = 'active'`, { eventoId });
}

async function getZoneConquestScans(partidaId, checkpointId) {
  return query(`
    SELECT *
    FROM zonas_equipes_scans
    WHERE partida_id = @partidaId AND checkpoint_id = @checkpointId
    ORDER BY scanned_at ASC`, { partidaId, checkpointId });
}

module.exports = {
  startZoneConquestGame,
  stopZoneConquestGame,
  recordZoneConquestScan,
  getZoneConquestPartidaAtiva,
  getZoneConquestScans,
  ZONE_CONQUEST_GAME_TYPE,
};
