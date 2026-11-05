// utils/middleware.js - Middlewares compartilhados
const jwt = require('jsonwebtoken');
const { queryOne } = require('../database');

const JWT_SECRET = process.env.JWT_SECRET || 'sua-chave-secreta-super-segura-2026';

async function verifyToken(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    console.log('❌ Token não fornecido');
    return res.status(401).json({ error: 'Token não fornecido' });
  }

  let decoded;
  try {
    // Verificar JWT
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    console.log('❌ Token inválido:', err.message);
    return res.status(401).json({ error: 'Token inválido' });
  }

  // Token com versão (claim `tv`): a conta precisa existir, não ter sido excluída e a versão precisa ser a atual.
  // Trocar a senha ou excluir a conta derruba as sessões abertas.
  // A sessão do telão (/auth/telao) não é uma conta: o id é o do buffet. Os tokens antigos dela saíam com tv: 0 e eram
  // recusados aqui por não haver conta; o telão não tem conta para conferir, então fica de fora.
  const sessaoDeTelao = decoded.role === 'display' && decoded.email === 'telao';
  if (decoded.tv !== undefined && !sessaoDeTelao) {
    try {
      const conta = await queryOne('SELECT status, tokenVersao FROM login WHERE loginId = @id', { id: decoded.id });
      if (!conta || conta.status === 'excluida' || Number(conta.tokenVersao) !== Number(decoded.tv)) {
        return res.status(401).json({ error: 'Sessão encerrada. Entre de novo.', codigo: 'SESSAO_ENCERRADA' });
      }
    } catch (err) {
      console.error('❌ Erro ao conferir sessão:', err.message);
      return res.status(500).json({ error: 'Não foi possível conferir a sessão' });
    }
  }

  req.user = decoded;
  next();
}

// Helper para verificar se o usuário é master
function isMaster(req) {
  return req.user && req.user.role === 'master';
}

function requireRole(...roles) {
  const allowedRoles = new Set(roles.flat());
  return (req, res, next) => {
    if (!req.user || !allowedRoles.has(req.user.role)) {
      return res.status(403).json({ error: 'Permissão insuficiente para esta operação' });
    }
    next();
  };
}

function broadcast(data) {
  if (global.wsServer) {
    global.wsServer.clients.forEach((client) => {
      if (client.readyState === 1) {
        client.send(JSON.stringify(data));
      }
    });
  }
}

module.exports = {
  verifyToken,
  requireRole,
  isMaster,
  broadcast,
};
