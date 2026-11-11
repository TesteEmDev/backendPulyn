const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { withTransaction } = require('../database');
const { verifyToken, requireRole } = require('../utils/middleware');
const { normalizeUid, uidSqlExpression } = require('../utils/uid');
const { isAvatarValido } = require('../utils/avatar');
const { escolherAvatar, avataresEmUso, MENSAGEM_AVATAR_EM_USO } = require('../utils/avatarEvento');
const { normalizarCor, escolherCor, coresEmUso, MENSAGEM_COR_EM_USO } = require('../utils/corParticipante');
const {
  criarPerfil, buscarPerfil, registrarVolta, buscarPerfisParaKiosk, idadeValida, copiarVinculosParaParticipacao,
} = require('../utils/perfilCrianca');
const { normalizarDataNascimento, idadeNaData } = require('../utils/nascimento');

const router = express.Router();
const CLOSED_EVENT_STATUSES = new Set(['completed', 'cancelled', 'canceled', 'finished']);

function isOpenEvent(event) {
  return event && !CLOSED_EVENT_STATUSES.has(String(event.status || '').trim().toLowerCase());
}

function httpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function isDuplicateKeyError(error) {
  return error?.code === '23505' || error?.number === 2601 || error?.number === 2627;
}

// O kiosk tem uma superfície de API própria e não recebe acesso às rotas administrativas.
// A recepção também consulta as leituras do leitor (fallback do Check-in quando o WebSocket cai); o resto é só do kiosk.
const RECEPTION_READINGS = /^\/events\/[^/]+\/reception-readings\/?$/;
router.use(verifyToken, (req, res, next) => (
  req.method === 'GET' && RECEPTION_READINGS.test(req.path)
    ? requireRole('kiosk', 'reception')(req, res, next)
    : requireRole('kiosk')(req, res, next)
));

// Leitores de recepção das telas de autoatendimento (R2, R3...): um para cada tela (/reception/kiosk/<número>). O R1 é do balcão.
router.get('/receptions', async (req, res) => {
  try {
    const { allQuery } = require('../database');
    const { statusEfetivo } = require('../utils/statusCheckpoint');
    const { numeroDeRecepcao } = require('../utils/checkpointTransferencia');
    const linhas = await allQuery(
      `SELECT numCheck, nome, status, ultimoVisto FROM pontoVerificacao
       WHERE empresaId = @empresaId AND LOWER(COALESCE(proposito, 'game')) = 'reception' AND numCheck IS NOT NULL`,
      { empresaId: req.user.empresaId }
    );
    const telas = linhas
      // O R1 é do balcão (check-in); as telas de autoatendimento são do R2 em diante
      .filter((linha) => numeroDeRecepcao(linha.numCheck) && String(linha.numCheck).toUpperCase() !== 'R1')
      .map((linha) => ({
        numero: Number(String(linha.numCheck).slice(1)),
        numCheck: String(linha.numCheck).toUpperCase(),
        nome: linha.nome,
        online: statusEfetivo(linha.status, linha.ultimoVisto) === 'online',
      }))
      .sort((a, b) => a.numero - b.numero);
    res.json(telas);
  } catch (error) {
    console.error('❌ Kiosk: erro ao listar os leitores de recepção:', error.message);
    res.status(500).json({ error: 'Não foi possível listar as telas de autoatendimento' });
  }
});

// Eventos abertos da própria empresa, com somente os campos necessários ao visor.
router.get('/events', async (req, res) => {
  try {
    const events = await require('../database').allQuery(
      `SELECT e.eventoId, e.nome, e.data, e.hora, e.duracao, e.status,
              CASE WHEN EXISTS (
                SELECT 1
                FROM pontoVerificacao c
                WHERE c.eventoId = e.eventoId
                  AND LOWER(COALESCE(c.proposito, 'game')) = 'reception'
              ) THEN 1 ELSE 0 END AS has_reception_checkpoint
       FROM evento e
       WHERE e.empresaId = @empresaId
         AND LOWER(COALESCE(e.status, 'scheduled')) NOT IN ('completed', 'cancelled', 'canceled', 'finished')
       ORDER BY e.data DESC`,
      { empresaId: req.user.empresaId }
    );
    res.json(events || []);
  } catch (error) {
    console.error('❌ Kiosk: erro ao carregar evento:', error.message);
    res.status(500).json({ error: 'Não foi possível carregar os evento' });
  }
});

// Recupera leitura recentes caso o navegador perca o broadcast WebSocket.
// A fila é somente do processo atual e fica limitada às leitura recentes.
router.get('/events/:eventId/reception-readings', async (req, res) => {
  try {
    const { queryOne } = require('../database');
    const event = await queryOne(
      `SELECT eventoId, empresaId, status FROM evento
       WHERE eventoId = @eventId AND empresaId = @empresaId`,
      { eventId: req.params.eventId, empresaId: req.user.empresaId }
    );
    if (!event) return res.status(404).json({ error: 'Evento não encontrado' });
    if (!isOpenEvent(event)) return res.status(409).json({ error: 'Este evento não está aberto' });

    const since = Number(req.query.since || 0);
    const eventKey = String(event.eventoId).trim().toLowerCase();
    const queue = global.receptionReadingQueues?.get(eventKey) || [];
    const readings = queue.filter(reading => Number(reading.receivedAt || 0) > since);
    res.json({ readings });
  } catch (error) {
    console.error('❌ Kiosk: erro ao recuperar leitura de recepção:', error.message);
    res.status(500).json({ error: 'Não foi possível recuperar a leitura' });
  }
});

// Times do evento selecionado, sempre limitados ao tenant do token.
router.get('/events/:eventId/teams', async (req, res) => {
  try {
    const { queryOne, allQuery } = require('../database');
    const event = await queryOne(
      `SELECT eventoId, empresaId, status FROM evento
       WHERE eventoId = @eventId AND empresaId = @empresaId`,
      { eventId: req.params.eventId, empresaId: req.user.empresaId }
    );
    if (!event) return res.status(404).json({ error: 'Evento não encontrado' });
    if (!isOpenEvent(event)) return res.status(409).json({ error: 'Este evento não está aberto para cadastro' });

    const teams = await allQuery(
      `SELECT timeId, nome, cor, pontos
       FROM "time"
       WHERE eventoId = @eventId AND empresaId = @empresaId
       ORDER BY nome`,
      { eventId: event.eventoId, empresaId: req.user.empresaId }
    );
    res.json(teams || []);
  } catch (error) {
    console.error('❌ Kiosk: erro ao carregar time:', error.message);
    res.status(500).json({ error: 'Não foi possível carregar os time' });
  }
});

// Consulta mínima de uma pulseira; não expõe inventário ou dados de crianças.
router.get('/bracelets/:codigo', async (req, res) => {
  try {
    const codigo = normalizeUid(req.params.codigo);
    if (!codigo) return res.status(400).json({ error: 'Código da pulseira inválido' });

    const { queryOne } = require('../database');
    const bracelet = await queryOne(
      `SELECT codigo, status, criancaId, empresaId
       FROM pulseira
       WHERE ${uidSqlExpression('codigo')} = @codigo AND LOWER(empresaId) = LOWER(@empresaId)`,
      { codigo, empresaId: req.user.empresaId }
    );

    if (!bracelet) {
      return res.json({ codigo, exists: false, status: null, available: true });
    }

    const available = String(bracelet.status || '').toLowerCase() === 'disponivel' && !bracelet.criancaId;
    res.json({ codigo: bracelet.codigo, exists: true, status: bracelet.status, available });
  } catch (error) {
    console.error('❌ Kiosk: erro ao consultar pulseira:', error.message);
    res.status(500).json({ error: 'Não foi possível verificar a pulseira' });
  }
});

// Procura o cadastro de uma criança que já esteve em outro evento da empresa.
// Devolve só o necessário para ela se reconhecer (nome abreviado, apelido, idade e avatar).
router.get('/profiles', async (req, res) => {
  try {
    const eventId = String(req.query.eventId || '').trim();
    if (!eventId) return res.status(400).json({ error: 'Evento é obrigatório' });
    const perfis = await buscarPerfisParaKiosk({
      empresaId: req.user.empresaId,
      eventoId: eventId,
      termo: req.query.busca,
    });
    res.json(perfis);
  } catch (error) {
    console.error('❌ Kiosk: erro ao buscar cadastros:', error.message);
    res.status(500).json({ error: 'Não foi possível buscar o cadastro' });
  }
});

// Avatares que os participantes do evento já usam (o kiosk os mostra indisponíveis e escolhe um livre de início).
router.get('/events/:eventId/avatars-in-use', async (req, res) => {
  try {
    const banco = require('../database');
    const event = await banco.queryOne(
      'SELECT eventoId FROM evento WHERE eventoId = @eventId AND empresaId = @empresaId',
      { eventId: req.params.eventId, empresaId: req.user.empresaId }
    );
    if (!event) return res.status(404).json({ error: 'Evento não encontrado' });
    res.json({
      avatares: [...new Set(await avataresEmUso(banco, event.eventoId))],
      cores: [...new Set(await coresEmUso(banco, event.eventoId))],
    });
  } catch (error) {
    console.error('❌ Kiosk: erro ao listar avatares em uso:', error.message);
    res.status(500).json({ error: 'Não foi possível carregar os avatares' });
  }
});

// A pulseira lida precisa estar livre; se o buffet ainda não a tinha, ela é cadastrada agora.
async function garantirPulseiraLivre(tx, codigo, empresaId) {
  let bracelet = await tx.queryOne(
    `SELECT codigo, status, criancaId, empresaId
     FROM pulseira
     WHERE ${uidSqlExpression('codigo')} = @codigo AND LOWER(empresaId) = LOWER(@empresaId)`,
    { codigo, empresaId }
  );
  if (!bracelet) {
    await tx.query(
      `INSERT INTO pulseira (codigo, status, empresaId, criadoEm)
       VALUES (@codigo, 'disponivel', @empresaId, GETDATE())`,
      { codigo, empresaId }
    );
    bracelet = { codigo, status: 'disponivel', criancaId: null, empresaId };
  }
  if (String(bracelet.status || '').toLowerCase() !== 'disponivel' || bracelet.criancaId) {
    throw httpError('Esta pulseira não está disponível para vínculo', 409);
  }
  return bracelet;
}

// Criança que a recepção cadastrou no check-in sem pulseira e agora se identifica no Kiosk: a participação continua a
// mesma (pontos, time, vínculos da família) e só ganha a pulseira. Avatar, cor, apelido e time podem ser trocados agora.
async function vincularPulseiraAoCadastroDoCheckin(tx, { event, participacao, perfilCriancaId, codigo, avatarPedido, corPedida, apelido, timeId }) {
  await garantirPulseiraLivre(tx, codigo, event.empresaId);

  let team = null;
  if (timeId) {
    team = await tx.queryOne(
      `SELECT timeId, nome FROM "time" WHERE timeId = @timeId AND eventoId = @eventId AND empresaId = @empresaId`,
      { timeId, eventId: event.eventoId, empresaId: event.empresaId }
    );
    if (!team) throw httpError('Time não pertence ao evento selecionado', 400);
  }

  // Os outros participantes é que contam como "em uso": o avatar e a cor da própria criança continuam dela
  const escolhaAvatar = escolherAvatar({
    pedido: avatarPedido,
    preferido: participacao.avatar,
    emUso: await avataresEmUso(tx, event.eventoId, participacao.criancaId),
  });
  if (escolhaAvatar.conflito) {
    const erro = httpError(MENSAGEM_AVATAR_EM_USO, 409);
    erro.avataresLivres = escolhaAvatar.livres;
    throw erro;
  }
  const escolhaCor = escolherCor({
    pedido: corPedida || participacao.cor || null,
    emUso: await coresEmUso(tx, event.eventoId, participacao.criancaId),
  });
  if (escolhaCor.conflito) {
    const erro = httpError(MENSAGEM_COR_EM_USO, 409);
    erro.coresLivres = escolhaCor.livres;
    throw erro;
  }

  const apelidoFinal = String(apelido || '').trim() || participacao.apelido || String(participacao.nome).split(/\s+/)[0];
  await tx.query(
    `UPDATE crianca
     SET codigoPulseira = @codigo, avatar = @avatar, cor = @cor, apelido = @apelido, timeId = COALESCE(@timeId, timeId)
     WHERE criancaId = @id`,
    { codigo, avatar: escolhaAvatar.avatar, cor: escolhaCor.cor, apelido: apelidoFinal, timeId: team ? team.timeId : null, id: participacao.criancaId }
  );
  const vinculo = await tx.query(
    `UPDATE pulseira
     SET status = 'em_uso', criancaId = @childId
     WHERE ${uidSqlExpression('codigo')} = @codigo
       AND empresaId = @empresaId
       AND status = 'disponivel'
       AND criancaId IS NULL`,
    { codigo, childId: participacao.criancaId, empresaId: event.empresaId }
  );
  if ((vinculo.rowsAffected?.[0] || 0) === 0) {
    throw httpError('Esta pulseira acabou de ser vinculada. Aproxime outra pulseira', 409);
  }
  await registrarVolta({ perfilCriancaId, eventoId: event.eventoId, apelido: apelidoFinal, idade: participacao.idade, avatar: escolhaAvatar.avatar });

  const total = await tx.queryOne(
    'SELECT COALESCE(SUM(pontos), 0) AS pontosTotais FROM crianca WHERE perfilCriancaId = @perfilId',
    { perfilId: perfilCriancaId }
  );
  const timeAtual = team ?? (participacao.timeId
    ? await tx.queryOne('SELECT timeId, nome FROM "time" WHERE timeId = @timeId', { timeId: participacao.timeId })
    : null);
  return {
    id: participacao.criancaId,
    perfilCriancaId,
    retornando: true,
    pontosTotais: Number(total?.pontosTotais) || 0,
    name: participacao.nome,
    nickname: apelidoFinal,
    age: participacao.idade,
    birthDate: null,
    avatar: escolhaAvatar.avatar,
    color: escolhaCor.cor,
    braceletCode: codigo,
    timeId: timeAtual ? timeAtual.timeId : null,
    teamName: timeAtual ? timeAtual.nome : null,
    scores: Number(participacao.pontos) || 0,
  };
}

// Cadastro atômico: cria (se necessário) e vincula a pulseira junto com a criança.
// Criança nova: cria o cadastro permanente (perfilCrianca) e a participação no evento.
// Criança que volta (perfilCriancaId): reaproveita o cadastro e só cria a participação no evento.
router.post('/participants', async (req, res) => {
  try {
    const { eventId, nome, apelido, avatar, braceletCode, timeId, perfilCriancaId } = req.body || {};
    // Data de nascimento (no lugar da idade): a idade é calculada dela; sem ela vale a idade informada (versões antigas)
    let dataNascimento = null;
    if (req.body?.dataNascimento) {
      const nascimento = normalizarDataNascimento(req.body.dataNascimento, new Date(), { limiteIdade: null });
      if (nascimento.erro) return res.status(400).json({ error: nascimento.erro });
      dataNascimento = nascimento.data;
    }
    const idadeInformada = dataNascimento ? idadeNaData(dataNascimento) : (req.body?.idade ?? req.body?.age);
    const codigo = normalizeUid(braceletCode);
    let cleanName = String(nome || '').trim();
    // Avatar escolhido (opcional): sem ele, entra um livre; em uso por outro participante do evento, a recusa avisa (409)
    const avatarPedido = avatar ? String(avatar) : null;

    if (avatarPedido && !isAvatarValido(avatarPedido)) {
      return res.status(400).json({ error: 'Avatar inválido' });
    }
    // Cor escolhida (opcional): sem ela, entra uma livre
    const corPedida = req.body?.cor ? normalizarCor(req.body.cor) : null;
    if (req.body?.cor && !corPedida) {
      return res.status(400).json({ error: 'Cor inválida' });
    }
    if (!perfilCriancaId && (idadeValida(idadeInformada) === null)) {
      return res.status(400).json({ error: 'A data de nascimento é obrigatória' });
    }

    // O time é opcional: o recreacionista define (ou sorteia) os time depois do cadastro.
    if (!eventId || (!cleanName && !perfilCriancaId) || !codigo) {
      return res.status(400).json({ error: 'Evento, nome e pulseira são obrigatórios' });
    }
    if (cleanName.length > 100 || String(apelido || '').trim().length > 100) {
      return res.status(400).json({ error: 'Nome ou apelido excede o limite permitido' });
    }

    const participant = await withTransaction(async (tx) => {
      const event = await tx.queryOne(
        `SELECT eventoId, empresaId, status FROM evento
         WHERE eventoId = @eventId AND empresaId = @empresaId`,
        { eventId, empresaId: req.user.empresaId }
      );
      if (!event) throw httpError('Evento não encontrado', 404);
      if (!isOpenEvent(event)) throw httpError('Este evento não está aberto para cadastro', 409);

      // Criança que volta: o nome vem do cadastro dela e ela não pode estar duas vezes no mesmo evento.
      let perfilExistente = null;
      if (perfilCriancaId) {
        perfilExistente = await buscarPerfil(perfilCriancaId, event.empresaId);
        if (!perfilExistente) throw httpError('Cadastro não encontrado', 404);
        const jaNoEvento = await tx.queryOne(
          `SELECT criancaId, nome, apelido, idade, avatar, cor, timeId, pontos, codigoPulseira
           FROM crianca WHERE perfilCriancaId = @perfilCriancaId AND eventoId = @eventId`,
          { perfilCriancaId, eventId: event.eventoId }
        );
        if (jaNoEvento && jaNoEvento.codigoPulseira) throw httpError('Esta criança já está cadastrada neste evento', 409);
        // Cadastrada na recepção (check-in) sem pulseira: não cria outra participação, só vincula a pulseira a ela
        if (jaNoEvento) return vincularPulseiraAoCadastroDoCheckin(tx, {
          event, participacao: jaNoEvento, perfilCriancaId, codigo, avatarPedido, corPedida, apelido, timeId,
        });
        cleanName = perfilExistente.nome;
      }

      let team = null;
      if (timeId) {
        team = await tx.queryOne(
          `SELECT timeId, nome FROM "time"
           WHERE timeId = @timeId AND eventoId = @eventId AND empresaId = @empresaId`,
          { timeId, eventId, empresaId: event.empresaId }
        );
        if (!team) throw httpError('Time não pertence ao evento selecionado', 400);
      }

      await garantirPulseiraLivre(tx, codigo, event.empresaId);

      // Avatar sem repetir no evento: quem volta tenta manter o do cadastro (se outro já o usa, entra um livre)
      const escolhaAvatar = escolherAvatar({
        pedido: avatarPedido,
        preferido: perfilExistente?.avatar,
        emUso: await avataresEmUso(tx, event.eventoId),
      });
      if (escolhaAvatar.conflito) {
        const erro = httpError(MENSAGEM_AVATAR_EM_USO, 409);
        erro.avataresLivres = escolhaAvatar.livres;
        throw erro;
      }
      const avatarValue = escolhaAvatar.avatar;

      const escolhaCor = escolherCor({ pedido: corPedida, emUso: await coresEmUso(tx, event.eventoId) });
      if (escolhaCor.conflito) {
        const erro = httpError(MENSAGEM_COR_EM_USO, 409);
        erro.coresLivres = escolhaCor.livres;
        throw erro;
      }
      const corValue = escolhaCor.cor;

      // Quem volta mantém o apelido, a idade e o avatar do cadastro, a menos que tenha escolhido outros agora.
      const apelidoFinal = String(apelido || '').trim() || perfilExistente?.apelido || cleanName.split(/\s+/)[0];
      // Quem volta e já tem data de nascimento no cadastro: a idade é a de hoje
      const nascimentoFinal = dataNascimento || (perfilExistente?.dataNascimento ? String(perfilExistente.dataNascimento).slice(0, 10) : null);
      const idadeFinal = (nascimentoFinal ? idadeNaData(nascimentoFinal) : null) ?? idadeValida(idadeInformada) ?? perfilExistente?.idade ?? 0;

      let perfilId = perfilExistente?.perfilCriancaId;
      if (perfilId) {
        await registrarVolta({ perfilCriancaId: perfilId, eventoId: event.eventoId, apelido: apelidoFinal, idade: idadeFinal, avatar: avatarValue, dataNascimento });
      } else {
        perfilId = await criarPerfil({
          empresaId: event.empresaId, eventoId: event.eventoId,
          nome: cleanName, apelido: apelidoFinal, idade: idadeFinal, avatar: avatarValue, dataNascimento,
        });
      }

      const childId = uuidv4();
      await tx.query(
        `INSERT INTO crianca
          (criancaId, eventoId, empresaId, timeId, nome, apelido, idade, dataNascimento, avatar, cor, codigoPulseira, pontos, perfilCriancaId)
         VALUES (@id, @eventId, @empresaId, @timeId, @nome, @apelido, @age, @dataNascimento, @avatar, @cor, @codigo, 0, @perfilId)`,
        {
          id: childId,
          eventId: event.eventoId,
          empresaId: event.empresaId,
          timeId: team ? team.timeId : null,
          nome: cleanName,
          apelido: apelidoFinal,
          age: idadeFinal,
          dataNascimento: nascimentoFinal,
          avatar: avatarValue,
          cor: corValue,
          codigo,
          perfilId,
        }
      );
      await copiarVinculosParaParticipacao({ perfilCriancaId: perfilId, criancaId: childId, empresaId: event.empresaId });

      const braceletUpdate = await tx.query(
        `UPDATE pulseira
         SET status = 'em_uso', criancaId = @childId
         WHERE ${uidSqlExpression('codigo')} = @codigo
           AND empresaId = @empresaId
           AND status = 'disponivel'
           AND criancaId IS NULL`,
        { codigo, childId, empresaId: event.empresaId }
      );
      if ((braceletUpdate.rowsAffected?.[0] || 0) === 0) {
        throw httpError('Esta pulseira acabou de ser vinculada. Aproxime outra pulseira', 409);
      }

      const total = await tx.queryOne(
        'SELECT COALESCE(SUM(pontos), 0) AS pontosTotais FROM crianca WHERE perfilCriancaId = @perfilId',
        { perfilId }
      );

      return {
        id: childId,
        perfilCriancaId: perfilId,
        retornando: Boolean(perfilExistente),
        pontosTotais: Number(total?.pontosTotais) || 0,
        name: cleanName,
        nickname: apelidoFinal,
        age: idadeFinal,
        birthDate: nascimentoFinal,
        avatar: avatarValue,
        color: corValue,
        braceletCode: codigo,
        timeId: team ? team.timeId : null,
        teamName: team ? team.nome : null,
        scores: 0,
      };
    });

    res.status(201).json(participant);
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message, ...(error.avataresLivres ? { avataresLivres: error.avataresLivres } : {}), ...(error.coresLivres ? { coresLivres: error.coresLivres } : {}) });
    if (isDuplicateKeyError(error)) return res.status(409).json({ error: 'Esta pulseira já foi cadastrada. Aproxime-a novamente para atualizar o estado.' });
    console.error('❌ Kiosk: erro ao cadastrar participante:', error.message);
    res.status(500).json({ error: 'Não foi possível concluir o cadastro' });
  }
});

module.exports = router;
