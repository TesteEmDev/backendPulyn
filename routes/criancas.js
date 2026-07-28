const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { query, queryOne, allQuery } = require('../database');
const { verifyToken, isMaster } = require('../utils/middleware');
const { normalizeUid, uidSqlExpression } = require('../utils/uid');

router.use(verifyToken, (req, res, next) => {
  if (req.user?.role === 'family') return res.status(403).json({ error: 'Famílias devem usar os endpoints de vínculo familiar' });
  next();
});

// Listar crianças de um evento
router.get('/eventos/:evento_id/criancas', verifyToken, async (req, res) => {
  try {
    // ✅ NOVO: Extrair empresa_id do token para validação
    const empresaId = req.user?.empresa_id;
    
    const criancas = await allQuery(`
      SELECT c.*, t.name as time_name, t.color as time_color 
      FROM criancas c
      LEFT JOIN times t ON c.time_id = t.id
      WHERE c.evento_id = @evento_id
      AND c.empresa_id = @empresa_id
      ORDER BY c.scores DESC
    `, { evento_id: req.params.evento_id, empresa_id: empresaId });
    res.json(criancas);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Criar criança
router.post('/eventos/:evento_id/criancas', verifyToken, async (req, res) => {
  try {
    const { name, nickname, age, avatar, braceletCode, timeId } = req.body;
    const normalizedBraceletCode = braceletCode ? normalizeUid(braceletCode) : null;
    const { evento_id } = req.params;
    const id = uuidv4();

    if (braceletCode && !normalizedBraceletCode) {
      return res.status(400).json({ error: 'Código da pulseira inválido' });
    }
    
    // ✅ NOVO: Obter empresa_id do evento
    const evento = await queryOne('SELECT empresa_id FROM eventos WHERE id = @evento_id', { evento_id });
    if (!evento) {
      return res.status(404).json({ error: 'Evento não encontrado' });
    }
    const empresaId = evento.empresa_id;

    if (req.user.empresa_id !== empresaId) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence à sua empresa' });
    }
    
    if (normalizedBraceletCode) {
      const existing = await queryOne(
        `SELECT id FROM criancas WHERE ${uidSqlExpression('bracelet_code')} = @code`,
        { code: normalizedBraceletCode }
      );
      if (existing) {
        return res.status(400).json({ error: 'Pulseira já está vinculada a outra criança' });
      }
    }
    
    // ✅ CORRIGIDO: Incluir empresa_id na INSERT
    await query(
      `INSERT INTO criancas (id, evento_id, empresa_id, time_id, name, nickname, age, avatar, bracelet_code) 
       VALUES (@id, @evento_id, @empresa_id, @timeId, @name, @nickname, @age, @avatar, @braceletCode)`,
      { id, evento_id, empresa_id: empresaId, timeId, name, nickname, age: parseInt(age), avatar: avatar || '👤', braceletCode: normalizedBraceletCode }
    );
    
    if (normalizedBraceletCode) {
      await query(
        `UPDATE pulseiras SET status = @status, crianca_id = @crianca_id
         WHERE ${uidSqlExpression('code')} = @code AND empresa_id = @empresa_id`,
        { status: 'em_uso', crianca_id: id, code: normalizedBraceletCode, empresa_id: empresaId }
      );
    }
    
    await query(
      `UPDATE times SET points = (SELECT ISNULL(SUM(scores), 0) FROM criancas WHERE time_id = @timeId) 
       WHERE id = @timeId`,
      { timeId }
    );
    
    res.json({ id, name, nickname, age, avatar, braceletCode: normalizedBraceletCode, timeId, scores: 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Buscar criança por pulseira
router.get('/criancas/by-bracelet/:code', verifyToken, async (req, res) => {
  try {
    const normalizedCode = normalizeUid(req.params.code);
    if (!normalizedCode) {
      return res.status(400).json({ error: 'Código da pulseira inválido' });
    }

    const empresaId = req.user.empresa_id;
    const crianca = await queryOne(`
      SELECT c.*, t.name as time_name, t.color as time_color 
      FROM criancas c
      LEFT JOIN times t ON c.time_id = t.id
      WHERE ${uidSqlExpression('c.bracelet_code')} = @code
        AND (c.empresa_id = @empresaId OR @isMaster = 1)
    `, { code: normalizedCode, empresaId, isMaster: isMaster(req) ? 1 : 0 });
    
    if (!crianca) {
      return res.status(404).json({ error: 'Criança não encontrada' });
    }
    res.json(crianca);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Atualizar criança
router.put('/eventos/:evento_id/criancas/:crianca_id', verifyToken, async (req, res) => {
  try {
    const { name, nickname, age, avatar, braceletCode, timeId } = req.body;
    const normalizedBraceletCode = braceletCode ? normalizeUid(braceletCode) : null;
    const { evento_id, crianca_id } = req.params;
    
    console.log(`📝 [RECEBIDO] Atualizando criança ${crianca_id}`);
    console.log(`   - evento_id: ${evento_id}`);
    console.log(`   - braceletCode recebido: "${braceletCode}"`);
    console.log(`   - timeId: ${timeId}`);
    console.log(`   - name: ${name}`);
    
    // Verificar se criança existe
    const crianca = await queryOne('SELECT * FROM criancas WHERE id = @id AND evento_id = @evento_id AND (empresa_id = @empresaId OR @isMaster = 1)', 
      { id: crianca_id, evento_id, empresaId: req.user.empresa_id, isMaster: isMaster(req) ? 1 : 0 });
    
    if (!crianca) {
      return res.status(404).json({ error: 'Criança não encontrada' });
    }

    const nextTimeId = timeId === undefined ? crianca.time_id : (timeId || null);
    if (nextTimeId) {
      const targetTime = await queryOne(
        `SELECT id FROM times
         WHERE id = @timeId
           AND evento_id = @eventoId
           AND (empresa_id = @empresaId OR @isMaster = 1)`,
        {
          timeId: nextTimeId,
          eventoId: evento_id,
          empresaId: crianca.empresa_id,
          isMaster: isMaster(req) ? 1 : 0,
        }
      );
      if (!targetTime) {
        return res.status(400).json({ error: 'Time não pertence ao evento selecionado' });
      }
    }
    
    // Se está mudando de pulseira, verificar se a nova pulseira existe e está disponível
    if (normalizedBraceletCode && normalizedBraceletCode !== normalizeUid(crianca.bracelet_code || '')) {
      // Verificar se outra criança já tem essa pulseira
      const existing = await queryOne(
        `SELECT id FROM criancas WHERE ${uidSqlExpression('bracelet_code')} = @code AND id != @criancaId`, 
        { code: normalizedBraceletCode, criancaId: crianca_id }
      );
      if (existing) {
        console.error(`❌ Pulseira ${normalizedBraceletCode} já vinculada a outra criança`);
        return res.status(400).json({ error: 'Pulseira já está vinculada a outra criança' });
      }
      
      // Verificar se pulseira existe
      const pulseira = await queryOne(
        `SELECT * FROM pulseiras WHERE ${uidSqlExpression('code')} = @code AND empresa_id = @empresaId`,
        { code: normalizedBraceletCode, empresaId: crianca.empresa_id }
      );
      if (!pulseira) {
        console.error(`❌ Pulseira ${normalizedBraceletCode} não encontrada`);
        return res.status(400).json({ error: 'Pulseira não encontrada' });
      }
      
      // Atualizar status da pulseira antiga para 'disponível' (se existia)
      if (crianca.bracelet_code) {
        const oldCode = normalizeUid(crianca.bracelet_code);
        await query(
          `UPDATE pulseiras SET status = @status, crianca_id = NULL
           WHERE ${uidSqlExpression('code')} = @code AND empresa_id = @empresaId`,
          { status: 'disponivel', code: oldCode, empresaId: crianca.empresa_id }
        );
        console.log(`   → Pulseira anterior ${oldCode} marcada como disponível`);
      }
      
      // Marcar pulseira nova como 'em_uso'
      await query(
        `UPDATE pulseiras SET status = @status, crianca_id = @criancaId
         WHERE ${uidSqlExpression('code')} = @code AND empresa_id = @empresaId`,
        { status: 'em_uso', criancaId: crianca_id, code: normalizedBraceletCode, empresaId: crianca.empresa_id }
      );
      console.log(`   → Pulseira ${normalizedBraceletCode} marcada como em_uso`);
    }
    
    // Atualizar criança
    await query(
      `UPDATE criancas SET 
        name = @name, 
        nickname = @nickname, 
        age = @age, 
        avatar = @avatar, 
        bracelet_code = @braceletCode,
        time_id = @timeId
       WHERE id = @criancaId 
       AND evento_id = @eventoId
       AND empresa_id = @empresaId`,
      { 
        name: name || crianca.name, 
        nickname: nickname || crianca.nickname, 
        age: age ? parseInt(age) : crianca.age, 
        avatar: avatar || crianca.avatar,
        braceletCode: normalizedBraceletCode,
        criancaId: crianca_id,
        eventoId: evento_id,
        empresaId: crianca.empresa_id,
        timeId: nextTimeId
      }
    );

    const affectedTeamIds = [...new Set([crianca.time_id, nextTimeId].filter(Boolean))];
    for (const affectedTeamId of affectedTeamIds) {
      await query(
        `UPDATE times
         SET points = (SELECT ISNULL(SUM(scores), 0) FROM criancas WHERE time_id = @timeId)
         WHERE id = @timeId`,
        { timeId: affectedTeamId }
      );
    }
    
    console.log(`✅ Criança ${crianca.name} atualizada com pulseira ${normalizedBraceletCode}`);
    res.json({ ok: true, message: 'Criança atualizada com sucesso' });
  } catch (err) {
    console.error('❌ Erro ao atualizar criança:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Excluir participante do evento
router.delete('/eventos/:evento_id/criancas/:crianca_id', verifyToken, async (req, res) => {
  try {
    const allowedRoles = ['admin', 'reception', 'game_master'];
    if (!isMaster(req) && !allowedRoles.includes(req.user?.role)) {
      return res.status(403).json({ error: 'Acesso negado para excluir participantes' });
    }

    const { evento_id, crianca_id } = req.params;
    const crianca = await queryOne(
      `SELECT * FROM criancas
       WHERE id = @criancaId
       AND evento_id = @eventoId
       AND (empresa_id = @empresaId OR @isMaster = 1)`,
      {
        criancaId: crianca_id,
        eventoId: evento_id,
        empresaId: req.user.empresa_id,
        isMaster: isMaster(req) ? 1 : 0
      }
    );

    if (!crianca) {
      return res.status(404).json({ error: 'Participante não encontrado' });
    }

    // Liberar a pulseira antes de remover a criança por causa da FK pulseiras.crianca_id.
    await query(
      `UPDATE pulseiras
       SET status = @status, crianca_id = NULL
       WHERE crianca_id = @criancaId
       AND empresa_id = @empresaId`,
      { status: 'disponivel', criancaId: crianca_id, empresaId: crianca.empresa_id }
    );

    // Remover registros que possuem FK obrigatória para a criança.
    await query('DELETE FROM crianca_conquistas WHERE crianca_id = @criancaId', { criancaId: crianca_id });
    await query('DELETE FROM caca_tesouro_scans WHERE crianca_id = @criancaId', { criancaId: crianca_id });
    await query('DELETE FROM pontuacoes WHERE crianca_id = @criancaId', { criancaId: crianca_id });
    await query('DELETE FROM leituras WHERE crianca_id = @criancaId', { criancaId: crianca_id });

    // Manter a pontuação do time consistente com a remoção do participante.
    if (crianca.time_id && crianca.scores) {
      await query(
        `UPDATE times
         SET points = CASE
           WHEN points >= @scores THEN points - @scores
           ELSE 0
         END
         WHERE id = @timeId AND evento_id = @eventoId`,
        { scores: crianca.scores, timeId: crianca.time_id, eventoId: evento_id }
      );
    }

    await query(
      `DELETE FROM criancas
       WHERE id = @criancaId
       AND evento_id = @eventoId
       AND empresa_id = @empresaId`,
      { criancaId: crianca_id, eventoId: evento_id, empresaId: crianca.empresa_id }
    );

    console.log(`✅ Participante ${crianca.name} (${crianca_id}) excluído do evento ${evento_id}`);
    res.json({ ok: true, message: 'Participante excluído com sucesso' });
  } catch (err) {
    console.error('❌ Erro ao excluir participante:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Desvincular pulseira
router.post('/:crianca_id/unassign-bracelet', verifyToken, async (req, res) => {
  try {
    const { crianca_id } = req.params;
    
    // Verificar se criança existe e tem pulseira
    const crianca = await queryOne('SELECT * FROM criancas WHERE id = @id', { id: crianca_id });
    
    if (!crianca) {
      return res.status(404).json({ error: 'Criança não encontrada' });
    }
    
    if (!crianca.bracelet_code) {
      return res.status(400).json({ error: 'Criança não possui pulseira associada' });
    }
    
    const braceletCode = crianca.bracelet_code;
    
    // Desvincular pulseira da criança
    await query('UPDATE criancas SET bracelet_code = NULL WHERE id = @criancaId', { criancaId: crianca_id });
    
    // ✅ NOVO: Atualizar status da pulseira de volta para "disponível"
    await query(
      `UPDATE pulseiras SET status = @status, crianca_id = NULL
       WHERE ${uidSqlExpression('code')} = @code AND empresa_id = @empresaId`,
      { status: 'disponivel', code: normalizeUid(braceletCode), empresaId: crianca.empresa_id }
    );
    
    console.log(`✅ Pulseira ${braceletCode} desvinculada de ${crianca.name} e marcada como disponível`);
    
    res.json({ ok: true, message: 'Pulseira desvinculada com sucesso' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
