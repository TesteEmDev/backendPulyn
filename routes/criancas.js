const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { query, queryOne, allQuery, withTransaction } = require('../database');
const { verifyToken, isMaster } = require('../utils/middleware');
const { normalizeUid, uidSqlExpression } = require('../utils/uid');
const { isAvatarValido } = require('../utils/avatar');
const { escolherAvatar, avataresEmUso, MENSAGEM_AVATAR_EM_USO } = require('../utils/avatarEvento');
const { normalizarDataNascimento, idadeNaData } = require('../utils/nascimento');
const { normalizarCor, escolherCor, coresEmUso, MENSAGEM_COR_EM_USO } = require('../utils/corParticipante');
const { createQRCodeForChild, generateQRCode, generateParentTrackingUrl } = require('../utils/qrcode');
const { validarEdicaoPerfil } = require('../utils/preCadastroFamilia');
const { perfilTemParticipacao, editarPerfilSemParticipacao, excluirPerfil } = require('../utils/perfilCrianca');
const { criarPerfil, buscarPerfil, registrarVolta, atualizarDadosDoPerfil, recalcularUltimoEvento, pontosDoPerfil, copiarVinculosParaParticipacao } = require('../utils/perfilCrianca');

router.use(verifyToken, (req, res, next) => {
  if (req.user?.role === 'family') return res.status(403).json({ error: 'Famílias devem usar os endpoints de vínculo familiar' });
  next();
});

// Listar as crianças de TODOS os evento do buffet (com nome do evento e do time).
// Escopo sempre pela empresa do token.
router.get('/', verifyToken, async (req, res) => {
  try {
    const crianca = await allQuery(`
      SELECT TOP 5000
        c.*,
        CAST((SELECT COALESCE(SUM(x.pontos), 0) FROM crianca x WHERE x.perfilCriancaId = c.perfilCriancaId) AS INTEGER) AS pontosTotais,
        t.nome AS time_nome,
        t.cor AS time_color,
        e.nome AS evento_nome,
        e.status AS evento_status,
        e.data AS evento_date
      FROM crianca c
      LEFT JOIN "time" t ON c.timeId = t.timeId
      LEFT JOIN evento e ON c.eventoId = e.eventoId
      WHERE c.empresaId = @empresaId
      ORDER BY e.data DESC, c.pontos DESC
    `, { empresaId: req.user?.empresaId });
    res.json(crianca);
  } catch (err) {
    console.error('❌ Erro ao listar crianças de todos os evento:', err);
    res.status(500).json({ error: err.message });
  }
});

// Cadastros permanentes (perfis) do buffet, com o último evento de cada criança e quantas participações ela tem.
// Quem tem 0 participações foi cadastrada sem evento (check-in sem evento aberto ou pré-cadastro do app).
router.get('/cadastros', async (req, res) => {
  try {
    const rows = await allQuery(`
      SELECT TOP 5000
        p.perfilCriancaId, p.nome, p.apelido, p.idade, p.avatar, p.nomeResponsavel, p.parentescoResponsavel,
        CAST(p.dataNascimento AS text) AS dataNascimento, p.criadoEm,
        p.ultimoEventoId, e.nome AS ultimoEventoNome, e.data AS ultimoEventoData,
        CAST((SELECT COUNT(*) FROM crianca c WHERE c.perfilCriancaId = p.perfilCriancaId) AS INTEGER) AS participacoes
      FROM perfilCrianca p
      LEFT JOIN evento e ON e.eventoId = p.ultimoEventoId
      WHERE p.empresaId = @empresaId
      ORDER BY p.criadoEm DESC
    `, { empresaId: req.user?.empresaId });
    res.json(rows.map((row) => ({
      ...row,
      // Com a data de nascimento a idade é a de hoje
      idade: row.dataNascimento ? idadeNaData(row.dataNascimento) : row.idade,
    })));
  } catch (err) {
    console.error('❌ Erro ao listar cadastros das crianças:', err);
    res.status(500).json({ error: err.message });
  }
});

// Recepção: edita/exclui um cadastro que ainda não entrou em nenhum evento (só do próprio buffet).
async function perfilEditavelDaRecepcao(req, res) {
  const perfil = await buscarPerfil(req.params.perfilCriancaId, req.user?.empresaId);
  if (!perfil) { res.status(404).json({ error: 'Cadastro da criança não encontrado' }); return null; }
  if (await perfilTemParticipacao(perfil.perfilCriancaId)) {
    res.status(409).json({ error: 'Esta criança já entrou em um evento: edite ou exclua pela lista do evento' });
    return null;
  }
  return perfil.perfilCriancaId;
}

router.put('/perfil/:perfilCriancaId', async (req, res) => {
  try {
    const perfilCriancaId = await perfilEditavelDaRecepcao(req, res);
    if (!perfilCriancaId) return;
    const dados = validarEdicaoPerfil(req.body, { comResponsavel: true });
    if (!dados.ok) return res.status(400).json({ error: dados.error });
    await editarPerfilSemParticipacao(perfilCriancaId, dados.value);
    res.json({ perfilCriancaId, ...dados.value });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/perfil/:perfilCriancaId', async (req, res) => {
  try {
    const perfilCriancaId = await perfilEditavelDaRecepcao(req, res);
    if (!perfilCriancaId) return;
    await withTransaction(async () => { await excluirPerfil(perfilCriancaId); });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cadastro permanente da criança: dados, pontos totais (todos os eventos) e pontos por evento.
router.get('/perfil/:perfilCriancaId', verifyToken, async (req, res) => {
  try {
    const perfil = await pontosDoPerfil(req.params.perfilCriancaId, req.user.empresaId);
    if (!perfil) return res.status(404).json({ error: 'Cadastro da criança não encontrado' });
    res.json(perfil);
  } catch (err) {
    console.error('❌ Erro ao carregar o cadastro da criança:', err);
    res.status(500).json({ error: err.message });
  }
});

// Listar crianças de um evento
router.get('/evento/:eventoId/crianca', verifyToken, async (req, res) => {
  try {
    // ✅ NOVO: Extrair empresaId do token para validação
    const empresaId = req.user?.empresaId;
    
    const crianca = await allQuery(`
      SELECT c.*, t.nome as time_nome, t.cor as time_color,
        CAST((SELECT COALESCE(SUM(x.pontos), 0) FROM crianca x WHERE x.perfilCriancaId = c.perfilCriancaId) AS INTEGER) AS pontosTotais
      FROM crianca c
      LEFT JOIN "time" t ON c.timeId = t.timeId
      WHERE c.eventoId = @eventoId
      AND c.empresaId = @empresaId
      ORDER BY c.pontos DESC
    `, { eventoId: req.params.eventoId, empresaId: empresaId });
    res.json(crianca);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Avatares que os participantes do evento já usam (a tela de cadastro os mostra indisponíveis)
router.get('/evento/:eventoId/avatares-em-uso', async (req, res) => {
  try {
    const evento = await queryOne('SELECT eventoId, empresaId FROM evento WHERE eventoId = @eventoId', { eventoId: req.params.eventoId });
    if (!evento) return res.status(404).json({ error: 'Evento não encontrado' });
    if (!isMaster(req) && String(req.user.empresaId).toLowerCase() !== String(evento.empresaId).toLowerCase()) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence à sua empresa' });
    }
    res.json({
      avatares: [...new Set(await avataresEmUso({ allQuery }, evento.eventoId))],
      cores: [...new Set(await coresEmUso({ allQuery }, evento.eventoId))],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Check-in sem evento aberto: guarda só o cadastro permanente da criança (perfil), sem time nem pulseira.
// Ela se vincula ao evento depois, pelo autoatendimento (Kiosk). O buffet é sempre o do token.
router.post('/perfil', async (req, res) => {
  try {
    const empresaId = req.user.empresaId;
    if (!empresaId) return res.status(400).json({ error: 'Sua conta não está ligada a um buffet' });
    const nome = String(req.body.nome || '').trim();
    if (!nome) return res.status(400).json({ error: 'Nome da criança é obrigatório' });
    if (nome.length > 100) return res.status(400).json({ error: 'Nome excede o limite de 100 caracteres' });
    const nascimento = normalizarDataNascimento(req.body.dataNascimento, new Date(), { limiteIdade: null });
    if (nascimento.erro) return res.status(400).json({ error: nascimento.erro });
    const avatar = req.body.avatar ? String(req.body.avatar) : null;
    if (avatar && !isAvatarValido(avatar)) return res.status(400).json({ error: 'Avatar inválido' });

    const apelido = String(req.body.apelido || '').trim().slice(0, 100) || null;
    const nomeResponsavel = String(req.body.nomeResponsavel || '').trim().slice(0, 200) || null;
    const parentescoResponsavel = String(req.body.parentescoResponsavel || '').trim().slice(0, 50) || null;
    const perfilCriancaId = await criarPerfil({
      empresaId, eventoId: null, nome, apelido, idade: idadeNaData(nascimento.data), avatar,
      dataNascimento: nascimento.data, nomeResponsavel, parentescoResponsavel,
    });
    res.status(201).json({ perfilCriancaId, nome, apelido, dataNascimento: nascimento.data, nomeResponsavel, parentescoResponsavel, avatar });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Criar criança
router.post('/evento/:eventoId/crianca', verifyToken, async (req, res) => {
  try {
    const { nome, apelido, avatar, braceletCode, timeId, perfilCriancaId } = req.body;
    // Data de nascimento (no lugar da idade): a idade é calculada dela; sem ela vale a `age` enviada (versões antigas)
    let dataNascimento = null;
    if (req.body.dataNascimento) {
      const nascimento = normalizarDataNascimento(req.body.dataNascimento, new Date(), { limiteIdade: null });
      if (nascimento.erro) return res.status(400).json({ error: nascimento.erro });
      dataNascimento = nascimento.data;
    }
    const age = dataNascimento ? idadeNaData(dataNascimento) : req.body.age;
    // Nome do pai/responsavel (opcional): fica no cadastro permanente da crianca
    const nomeResponsavel = String(req.body.nomeResponsavel || '').trim().slice(0, 200) || null;
    const parentescoResponsavel = String(req.body.parentescoResponsavel || '').trim().slice(0, 50) || null;
    const normalizedBraceletCode = braceletCode ? normalizeUid(braceletCode) : null;
    // Avatar escolhido (opcional): sem ele, entra um livre; em uso por outro participante do evento, a recusa avisa (409)
    const avatarPedido = avatar ? String(avatar) : null;
    const { eventoId } = req.params;
    const id = uuidv4();

    if (avatarPedido && !isAvatarValido(avatarPedido)) {
      return res.status(400).json({ error: 'Avatar inválido' });
    }
    // Cor escolhida (opcional): sem ela, entra uma livre
    const corPedida = req.body.cor ? normalizarCor(req.body.cor) : null;
    if (req.body.cor && !corPedida) {
      return res.status(400).json({ error: 'Cor inválida' });
    }

    if (!perfilCriancaId && (!nome || !String(nome).trim())) {
      return res.status(400).json({ error: 'Nome da criança é obrigatório' });
    }

    if (braceletCode && !normalizedBraceletCode) {
      return res.status(400).json({ error: 'Código da pulseira inválido' });
    }
    
    // ✅ NOVO: Obter empresaId do evento
    const evento = await queryOne('SELECT empresaId FROM evento WHERE eventoId = @eventoId', { eventoId });
    if (!evento) {
      return res.status(404).json({ error: 'Evento não encontrado' });
    }
    const empresaId = evento.empresaId;

    if (!isMaster(req) && String(req.user.empresaId) !== String(empresaId)) {
      return res.status(403).json({ error: 'Acesso negado: evento não pertence à sua empresa' });
    }

    if (timeId) {
      const time = await queryOne(
        `SELECT timeId FROM "time"
         WHERE timeId = @timeId AND eventoId = @eventoId
           AND (empresaId = @empresaId OR @isMaster = 1)`,
        { timeId, eventoId: eventoId, empresaId, isMaster: isMaster(req) ? 1 : 0 }
      );
      if (!time) return res.status(400).json({ error: 'Time não pertence ao evento selecionado' });
    }

    if (normalizedBraceletCode) {
      const pulseira = await queryOne(
        `SELECT codigo, status FROM pulseira
         WHERE ${uidSqlExpression('codigo')} = @codigo AND empresaId = @empresaId`,
        { codigo: normalizedBraceletCode, empresaId }
      );
      if (!pulseira) return res.status(400).json({ error: 'Pulseira não encontrada nesta empresa' });
      if (pulseira.status !== 'disponivel') return res.status(400).json({ error: 'Pulseira não está disponível' });
    }
    
    if (normalizedBraceletCode) {
      const existing = await queryOne(
        `SELECT criancaId FROM crianca WHERE ${uidSqlExpression('codigoPulseira')} = @codigo AND empresaId = @empresaId`,
        { codigo: normalizedBraceletCode, empresaId }
      );
      if (existing) {
        return res.status(400).json({ error: 'Pulseira já está vinculada a outra criança' });
      }
    }
    
    // Cadastro permanente: criança que volta reaproveita o perfil; criança nova ganha um perfil.
    let nomeFinal = nome;
    let perfilId = null;
    let perfilDaCrianca = null;
    if (perfilCriancaId) {
      const perfil = await buscarPerfil(perfilCriancaId, empresaId);
      if (!perfil) return res.status(404).json({ error: 'Cadastro da criança não encontrado' });
      perfilDaCrianca = perfil;
      const jaNoEvento = await queryOne(
        'SELECT criancaId FROM crianca WHERE perfilCriancaId = @perfilCriancaId AND eventoId = @eventoId',
        { perfilCriancaId, eventoId }
      );
      if (jaNoEvento) return res.status(409).json({ error: 'Esta criança já está cadastrada neste evento' });
      nomeFinal = perfil.nome;
      perfilId = perfil.perfilCriancaId;
    }

    // Avatar sem repetir no evento: quem volta tenta manter o do cadastro (se outro já o usa, entra um livre)
    const escolhaAvatar = escolherAvatar({
      pedido: avatarPedido,
      preferido: perfilDaCrianca?.avatar,
      emUso: await avataresEmUso({ allQuery }, eventoId),
    });
    if (escolhaAvatar.conflito) {
      return res.status(409).json({ error: MENSAGEM_AVATAR_EM_USO, avataresLivres: escolhaAvatar.livres });
    }
    const avatarValue = escolhaAvatar.avatar;

    const escolhaCor = escolherCor({ pedido: corPedida, emUso: await coresEmUso({ allQuery }, eventoId) });
    if (escolhaCor.conflito) {
      return res.status(409).json({ error: MENSAGEM_COR_EM_USO, coresLivres: escolhaCor.livres });
    }
    const corValue = escolhaCor.cor;

    if (perfilDaCrianca) {
      await registrarVolta({ perfilCriancaId: perfilId, eventoId, apelido: apelido || perfil.apelido, idade: age, avatar: avatarValue, dataNascimento, nomeResponsavel, parentescoResponsavel });
    } else {
      perfilId = await criarPerfil({ empresaId, eventoId, nome, apelido, idade: age, avatar: avatarValue, dataNascimento, nomeResponsavel, parentescoResponsavel });
    }

    // ✅ CORRIGIDO: Incluir empresaId na INSERT
    await query(
      `INSERT INTO crianca (criancaId, eventoId, empresaId, timeId, nome, apelido, idade, dataNascimento, avatar, cor, codigoPulseira, perfilCriancaId) 
       VALUES (@id, @eventoId, @empresaId, @timeId, @nome, @apelido, @age, @dataNascimento, @avatar, @cor, @braceletCode, @perfilId)`,
      { id, eventoId, empresaId: empresaId, timeId, nome: nomeFinal, apelido, age: parseInt(age), dataNascimento, avatar: avatarValue, cor: corValue, braceletCode: normalizedBraceletCode, perfilId }
    );
    // O pai NÃO é vinculado automaticamente: o vínculo nasce quando ele lê a pulseira no app (POST /family/bracelet/validate).
    
    if (normalizedBraceletCode) {
      await query(
        `UPDATE pulseira SET status = @status, criancaId = @criancaId
         WHERE ${uidSqlExpression('codigo')} = @codigo AND empresaId = @empresaId`,
        { status: 'em_uso', criancaId: id, codigo: normalizedBraceletCode, empresaId: empresaId }
      );
    }
    
    await query(
      `UPDATE "time" SET pontos = (SELECT ISNULL(SUM(pontos), 0) FROM crianca WHERE timeId = @timeId) 
       WHERE timeId = @timeId`,
      { timeId }
    );
    
    res.json({ id, perfilCriancaId: perfilId, nome: nomeFinal, apelido, age, dataNascimento, nomeResponsavel, parentescoResponsavel, avatar: avatarValue, color: corValue, braceletCode: normalizedBraceletCode, timeId, scores: 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Buscar criança por pulseira
router.get('/crianca/by-bracelet/:codigo', verifyToken, async (req, res) => {
  try {
    const normalizedCode = normalizeUid(req.params.codigo);
    if (!normalizedCode) {
      return res.status(400).json({ error: 'Código da pulseira inválido' });
    }

    const empresaId = req.user.empresaId;
    const crianca = await queryOne(`
      SELECT c.*, t.nome as time_nome, t.cor as time_color 
      FROM crianca c
      LEFT JOIN "time" t ON c.timeId = t.timeId
      WHERE ${uidSqlExpression('c.codigoPulseira')} = @codigo
        AND (c.empresaId = @empresaId OR @isMaster = 1)
    `, { codigo: normalizedCode, empresaId, isMaster: isMaster(req) ? 1 : 0 });
    
    if (!crianca) {
      return res.status(404).json({ error: 'Criança não encontrada' });
    }
    res.json(crianca);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Atualizar criança
router.put('/evento/:eventoId/crianca/:criancaId', verifyToken, async (req, res) => {
  try {
    const { nome, apelido, avatar, braceletCode, timeId } = req.body;
    // Data de nascimento (no lugar da idade): a idade é calculada dela; sem ela vale a `age` enviada
    let dataNascimento = null;
    if (req.body.dataNascimento) {
      const nascimento = normalizarDataNascimento(req.body.dataNascimento, new Date(), { limiteIdade: null });
      if (nascimento.erro) return res.status(400).json({ error: nascimento.erro });
      dataNascimento = nascimento.data;
    }
    const age = dataNascimento ? idadeNaData(dataNascimento) : req.body.age;
    const normalizedBraceletCode = braceletCode ? normalizeUid(braceletCode) : null;
    const { eventoId, criancaId } = req.params;
    
    console.log(`📝 [RECEBIDO] Atualizando criança ${criancaId}`);
    console.log(`   - eventoId: ${eventoId}`);
    console.log(`   - braceletCode recebido: "${braceletCode}"`);
    console.log(`   - timeId: ${timeId}`);
    console.log(`   - name: ${nome}`);
    
    // Verificar se criança existe
    const crianca = await queryOne('SELECT * FROM crianca WHERE criancaId = @id AND eventoId = @eventoId AND (empresaId = @empresaId OR @isMaster = 1)', 
      { id: criancaId, eventoId, empresaId: req.user.empresaId, isMaster: isMaster(req) ? 1 : 0 });
    
    if (!crianca) {
      return res.status(404).json({ error: 'Criança não encontrada' });
    }

    const nextAvatar = avatar === undefined || avatar === crianca.avatar
      ? crianca.avatar
      : (isAvatarValido(avatar) ? avatar : null);
    if (nextAvatar === null) {
      return res.status(400).json({ error: 'Avatar inválido' });
    }
    // Cor (opcional): trocar para uma que outro participante do evento já usa não vale
    let nextCor = crianca.cor || null;
    if (req.body.cor !== undefined && req.body.cor !== null && req.body.cor !== '') {
      const corPedida = normalizarCor(req.body.cor);
      if (!corPedida) return res.status(400).json({ error: 'Cor inválida' });
      if (corPedida !== String(crianca.cor || '').toUpperCase()) {
        const escolhaCor = escolherCor({ pedido: corPedida, emUso: await coresEmUso({ allQuery }, eventoId, criancaId) });
        if (escolhaCor.conflito) return res.status(409).json({ error: MENSAGEM_COR_EM_USO, coresLivres: escolhaCor.livres });
      }
      nextCor = corPedida;
    }
    // Trocar para um avatar que outro participante do evento já usa não vale
    if (nextAvatar !== crianca.avatar) {
      const escolha = escolherAvatar({ pedido: nextAvatar, emUso: await avataresEmUso({ allQuery }, eventoId, criancaId) });
      if (escolha.conflito) return res.status(409).json({ error: MENSAGEM_AVATAR_EM_USO, avataresLivres: escolha.livres });
    }

    const nextTimeId = timeId === undefined ? crianca.timeId : (timeId || null);
    if (nextTimeId) {
      const targetTime = await queryOne(
        `SELECT timeId FROM "time"
         WHERE timeId = @timeId
           AND eventoId = @eventoId
           AND (empresaId = @empresaId OR @isMaster = 1)`,
        {
          timeId: nextTimeId,
          eventoId: eventoId,
          empresaId: crianca.empresaId,
          isMaster: isMaster(req) ? 1 : 0,
        }
      );
      if (!targetTime) {
        return res.status(400).json({ error: 'Time não pertence ao evento selecionado' });
      }
    }
    
    // Se está mudando de pulseira, verificar se a nova pulseira existe e está disponível
    if (normalizedBraceletCode && normalizedBraceletCode !== normalizeUid(crianca.codigoPulseira || '')) {
      // Verificar se outra criança já tem essa pulseira
      const existing = await queryOne(
        `SELECT criancaId FROM crianca WHERE ${uidSqlExpression('codigoPulseira')} = @codigo AND criancaId != @criancaId AND empresaId = @empresaId`, 
        { codigo: normalizedBraceletCode, criancaId: criancaId, empresaId: crianca.empresaId }
      );
      if (existing) {
        console.error(`❌ Pulseira ${normalizedBraceletCode} já vinculada a outra criança`);
        return res.status(400).json({ error: 'Pulseira já está vinculada a outra criança' });
      }
      
      // Verificar se pulseira existe
      const pulseira = await queryOne(
        `SELECT * FROM pulseira WHERE ${uidSqlExpression('codigo')} = @codigo AND empresaId = @empresaId`,
        { codigo: normalizedBraceletCode, empresaId: crianca.empresaId }
      );
      if (!pulseira) {
        console.error(`❌ Pulseira ${normalizedBraceletCode} não encontrada`);
        return res.status(400).json({ error: 'Pulseira não encontrada' });
      }
      
      // Atualizar status da pulseira antiga para 'disponível' (se existia)
      if (crianca.codigoPulseira) {
        const oldCode = normalizeUid(crianca.codigoPulseira);
        await query(
          `UPDATE pulseira SET status = @status, criancaId = NULL
           WHERE ${uidSqlExpression('codigo')} = @codigo AND empresaId = @empresaId`,
          { status: 'disponivel', codigo: oldCode, empresaId: crianca.empresaId }
        );
        console.log(`   → Pulseira anterior ${oldCode} marcada como disponível`);
      }
      
      // Marcar pulseira nova como 'em_uso'
      await query(
        `UPDATE pulseira SET status = @status, criancaId = @criancaId
         WHERE ${uidSqlExpression('codigo')} = @codigo AND empresaId = @empresaId`,
        { status: 'em_uso', criancaId: criancaId, codigo: normalizedBraceletCode, empresaId: crianca.empresaId }
      );
      console.log(`   → Pulseira ${normalizedBraceletCode} marcada como em_uso`);
    }
    
    // Atualizar criança
    await query(
      `UPDATE crianca SET 
        nome = @nome, 
        apelido = @apelido, 
        idade = @age, 
        dataNascimento = COALESCE(@dataNascimento, dataNascimento),
        avatar = @avatar, 
        cor = @cor,
        codigoPulseira = @braceletCode,
        timeId = @timeId
       WHERE criancaId = @criancaId 
       AND eventoId = @eventoId
       AND empresaId = @empresaId`,
      { 
        nome: nome || crianca.nome, 
        apelido: apelido || crianca.apelido, 
        age: age !== undefined && age !== null && age !== '' ? parseInt(age) : crianca.idade, 
        dataNascimento,
        avatar: nextAvatar,
        cor: nextCor,
        braceletCode: normalizedBraceletCode,
        criancaId: criancaId,
        eventoId: eventoId,
        empresaId: crianca.empresaId,
        timeId: nextTimeId
      }
    );

    await atualizarDadosDoPerfil(crianca.perfilCriancaId, { nome, apelido, idade: age, avatar: nextAvatar, dataNascimento });

    const affectedTeamIds = [...new Set([crianca.timeId, nextTimeId].filter(Boolean))];
    for (const affectedTeamId of affectedTeamIds) {
      await query(
        `UPDATE "time"
         SET pontos = (SELECT ISNULL(SUM(pontos), 0) FROM crianca WHERE timeId = @timeId)
         WHERE timeId = @timeId`,
        { timeId: affectedTeamId }
      );
    }
    
    console.log(`✅ Criança ${crianca.nome} atualizada com pulseira ${normalizedBraceletCode}`);
    res.json({ ok: true, message: 'Criança atualizada com sucesso' });
  } catch (err) {
    console.error('❌ Erro ao atualizar criança:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Excluir participante do evento
router.delete('/evento/:eventoId/crianca/:criancaId', verifyToken, async (req, res) => {
  try {
    const allowedRoles = ['admin', 'reception', 'game_master'];
    if (!isMaster(req) && !allowedRoles.includes(req.user?.role)) {
      return res.status(403).json({ error: 'Acesso negado para excluir participantes' });
    }

    const { eventoId, criancaId } = req.params;
    const crianca = await queryOne(
      `SELECT * FROM crianca
       WHERE criancaId = @criancaId
       AND eventoId = @eventoId
       AND (empresaId = @empresaId OR @isMaster = 1)`,
      {
        criancaId: criancaId,
        eventoId: eventoId,
        empresaId: req.user.empresaId,
        isMaster: isMaster(req) ? 1 : 0
      }
    );

    if (!crianca) {
      return res.status(404).json({ error: 'Participante não encontrado' });
    }

    // Liberar a pulseira antes de remover a criança por causa da FK pulseira.criancaId.
    await query(
      `UPDATE pulseira
       SET status = @status, criancaId = NULL
       WHERE criancaId = @criancaId
       AND empresaId = @empresaId`,
      { status: 'disponivel', criancaId: criancaId, empresaId: crianca.empresaId }
    );

    // Remover registros que possuem FK obrigatória para a criança.
    await query('DELETE FROM criancaConquista WHERE criancaId = @criancaId', { criancaId: criancaId });
    await query('DELETE FROM cacaTesourScan WHERE criancaId = @criancaId', { criancaId: criancaId });
    await query('DELETE FROM pontuacao WHERE criancaId = @criancaId', { criancaId: criancaId });
    await query('DELETE FROM leitura WHERE criancaId = @criancaId', { criancaId: criancaId });

    // Manter a pontuação do time consistente com a remoção do participante.
    if (crianca.timeId && crianca.pontos) {
      await query(
        `UPDATE "time"
         SET pontos = CASE
           WHEN pontos >= @scores THEN pontos - @scores
           ELSE 0
         END
         WHERE timeId = @timeId AND eventoId = @eventoId`,
        { scores: crianca.pontos, timeId: crianca.timeId, eventoId: eventoId }
      );
    }

    await query(
      `DELETE FROM crianca
       WHERE criancaId = @criancaId
       AND eventoId = @eventoId
       AND empresaId = @empresaId`,
      { criancaId: criancaId, eventoId: eventoId, empresaId: crianca.empresaId }
    );

    // O cadastro permanente continua; só o "último evento" volta para o mais recente que sobrou.
    await recalcularUltimoEvento(crianca.perfilCriancaId);

    console.log(`✅ Participante ${crianca.nome} (${criancaId}) excluído do evento ${eventoId}`);
    res.json({ ok: true, message: 'Participante excluído com sucesso' });
  } catch (err) {
    console.error('❌ Erro ao excluir participante:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Desvincular pulseira
router.post('/:criancaId/unassign-bracelet', verifyToken, async (req, res) => {
  try {
    const allowedRoles = ['admin', 'reception', 'game_master'];
    if (!isMaster(req) && !allowedRoles.includes(req.user?.role)) {
      return res.status(403).json({ error: 'Acesso negado para desvincular pulseira' });
    }
    const { criancaId } = req.params;
    const crianca = await queryOne(
      `SELECT * FROM crianca
       WHERE criancaId = @id AND (empresaId = @empresaId OR @isMaster = 1)`,
      { id: criancaId, empresaId: req.user.empresaId, isMaster: isMaster(req) ? 1 : 0 }
    );
    
    if (!crianca) {
      return res.status(404).json({ error: 'Criança não encontrada' });
    }
    
    if (!crianca.codigoPulseira) {
      return res.status(400).json({ error: 'Criança não possui pulseira associada' });
    }
    
    const braceletCode = crianca.codigoPulseira;
    
    await query(
      `UPDATE crianca SET ultimaPulseira = codigoPulseira, codigoPulseira = NULL
       WHERE criancaId = @criancaId AND (empresaId = @empresaId OR @isMaster = 1)`,
      { criancaId: criancaId, empresaId: crianca.empresaId, isMaster: isMaster(req) ? 1 : 0 }
    );
    
    // ✅ NOVO: Atualizar status da pulseira de volta para "disponível"
    await query(
      `UPDATE pulseira SET status = @status, criancaId = NULL
       WHERE ${uidSqlExpression('codigo')} = @codigo AND empresaId = @empresaId`,
      { status: 'disponivel', codigo: normalizeUid(braceletCode), empresaId: crianca.empresaId }
    );
    
    console.log(`✅ Pulseira ${braceletCode} desvinculada de ${crianca.nome} e marcada como disponível`);
    
    res.json({ ok: true, message: 'Pulseira desvinculada com sucesso' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ NOVO: Gerar/Regenerar QR Code para uma criança
router.post('/:criancaId/generate-qrcode', verifyToken, async (req, res) => {
  try {
    const { criancaId } = req.params;
    
    // Validar acesso
    const crianca = await queryOne(
      `SELECT * FROM crianca
       WHERE criancaId = @id AND (empresaId = @empresaId OR @isMaster = 1)`,
      { id: criancaId, empresaId: req.user.empresaId, isMaster: isMaster(req) ? 1 : 0 }
    );
    
    if (!crianca) {
      return res.status(404).json({ error: 'Criança não encontrada' });
    }

    // Gerar novo QR Code
    const qrCodeData = await createQRCodeForChild(criancaId);

    // Salvar na tabela crianca
    await query(
      `UPDATE crianca SET codigoQr = @qrcode 
       WHERE criancaId = @criancaId AND (empresaId = @empresaId OR @isMaster = 1)`,
      { 
        qrcode: qrCodeData.qrCode, 
        criancaId, 
        empresaId: req.user.empresaId,
        isMaster: isMaster(req) ? 1 : 0
      }
    );

    console.log(`✅ QR Code gerado para criança ${crianca.nome} (${criancaId}): ${qrCodeData.qrCode}`);

    res.json({
      ok: true,
      message: 'QR Code gerado com sucesso',
      qrCode: qrCodeData.qrCode,
      trackingUrl: qrCodeData.trackingUrl,
    });
  } catch (err) {
    console.error('❌ Erro ao gerar QR Code:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ✅ NOVO: Obter imagem do QR Code de uma criança
router.get('/:criancaId/qrcode-image', verifyToken, async (req, res) => {
  try {
    const { criancaId } = req.params;
    
    // Validar acesso
    const crianca = await queryOne(
      `SELECT * FROM crianca
       WHERE criancaId = @id AND (empresaId = @empresaId OR @isMaster = 1)`,
      { id: criancaId, empresaId: req.user.empresaId, isMaster: isMaster(req) ? 1 : 0 }
    );
    
    if (!crianca) {
      return res.status(404).json({ error: 'Criança não encontrada' });
    }

    // Se não tem QR Code, gerar um
    let qrCode = crianca.codigoQr;
    if (!qrCode) {
      const qrCodeData = await createQRCodeForChild(criancaId);
      qrCode = qrCodeData.qrCode;
      
      // Salvar na tabela
      await query(
        `UPDATE crianca SET codigoQr = @qrcode 
         WHERE criancaId = @criancaId AND (empresaId = @empresaId OR @isMaster = 1)`,
        { 
          qrcode: qrCode, 
          criancaId, 
          empresaId: req.user.empresaId,
          isMaster: isMaster(req) ? 1 : 0
        }
      );
      
      console.log(`✅ QR Code auto-gerado para criança ${crianca.nome} (${criancaId}): ${qrCode}`);
    }

    // Gerar imagem do QR Code existente
    const { generateQRCodeImage } = require('../utils/qrcode');
    const trackingUrl = generateParentTrackingUrl(qrCode, criancaId);
    const qrCodeImage = await generateQRCodeImage(trackingUrl);

    // Retornar imagem PNG
    res.type('image/png');
    res.send(qrCodeImage);
  } catch (err) {
    console.error('❌ Erro ao obter imagem QR Code:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ✅ NOVO: Gerar QR Code para todas as crianças NULL em um evento (batch)
router.post('/evento/:eventoId/generate-qrcodes-batch', verifyToken, async (req, res) => {
  try {
    const allowedRoles = ['admin', 'reception', 'game_master'];
    if (!isMaster(req) && !allowedRoles.includes(req.user?.role)) {
      return res.status(403).json({ error: 'Acesso negado para esta operação em lote' });
    }

    const { eventoId } = req.params;

    // Validar que o evento pertence à empresa
    const evento = await queryOne('SELECT * FROM evento WHERE eventoId = @eventoId AND (empresaId = @empresaId OR @isMaster = 1)', 
      { eventoId, empresaId: req.user.empresaId, isMaster: isMaster(req) ? 1 : 0 });
    
    if (!evento) {
      return res.status(404).json({ error: 'Evento não encontrado' });
    }

    // Buscar todas as crianças sem QR Code
    const criancasSemQR = await allQuery(
      `SELECT criancaId, nome FROM crianca 
       WHERE eventoId = @eventoId 
       AND (codigoQr IS NULL OR codigoQr = '')
       AND empresaId = @empresaId`,
      { eventoId, empresaId: evento.empresaId }
    );

    if (criancasSemQR.length === 0) {
      return res.json({ 
        ok: true, 
        message: 'Todas as crianças já possuem QR Code',
        generated: 0,
        total: 0
      });
    }

    // Gerar QR Code para cada criança
    const results = [];
    for (const crianca of criancasSemQR) {
      try {
        const qrCodeData = await createQRCodeForChild(crianca.criancaId);
        
        await query(
          `UPDATE crianca SET codigoQr = @qrcode 
           WHERE criancaId = @criancaId`,
          { qrcode: qrCodeData.qrCode, criancaId: crianca.criancaId }
        );

        results.push({
          criancaId: crianca.criancaId,
          crianca_name: crianca.nome,
          qrCode: qrCodeData.qrCode,
          success: true,
        });

        console.log(`✅ QR Code gerado para ${crianca.nome}: ${qrCodeData.qrCode}`);
      } catch (err) {
        console.error(`❌ Erro ao gerar QR Code para ${crianca.nome}:`, err.message);
        results.push({
          criancaId: crianca.criancaId,
          crianca_name: crianca.nome,
          success: false,
          error: err.message,
        });
      }
    }

    const successCount = results.filter(r => r.success).length;

    res.json({
      ok: true,
      message: `${successCount} QR Code(s) gerado(s) com sucesso`,
      generated: successCount,
      total: criancasSemQR.length,
      results,
    });
  } catch (err) {
    console.error('❌ Erro ao gerar QR Codes em lote:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
