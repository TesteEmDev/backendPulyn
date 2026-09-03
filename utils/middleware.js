// utils/middleware.js - Middlewares compartilhados
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'sua-chave-secreta-super-segura-2026';

function verifyToken(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    console.log('❌ Token não fornecido');
    return res.status(401).json({ error: 'Token não fornecido' });
  }

  try {
    // Verificar JWT
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    console.log('❌ Token inválido:', err.message);
    res.status(401).json({ error: 'Token inválido' });
  }
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
