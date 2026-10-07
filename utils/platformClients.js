// utils/platformClients.js - lista única de clientes da plataforma (visão master)
//
// Os clientes vivem em duas tabelas: `empresas` (quem tem login/eventos, escopo
// multi-tenant) e `clientes` (cadastro legado, que hoje ainda guarda clientes
// que nunca ganharam empresa). As telas do master liam só `empresas`, por isso
// clientes cadastrados em `clientes` nunca apareciam. Aqui as duas são unidas,
// sem alterar nada no banco: `empresas` tem prioridade e um cliente é o mesmo
// que uma empresa quando nome + cidade coincidem.
//
// Contas de família (plano 'family', criadas no auto-cadastro do app das
// famílias) também vivem em `empresas`, mas não são clientes/buffets; ficam de
// fora por padrão.
const { allQuery } = require('../database');

const normalize = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();

async function listPlatformClients({ includeFamily = false } = {}) {
  const [empresas, finishedEvents, clientes] = await Promise.all([
    allQuery(`
      SELECT
        e.empresaId,
        e.nome,
        e.cidade,
        e.estado,
        e.telefone,
        e.plano,
        e.status,
        e.dataCriacao,
        COALESCE(MIN(CASE WHEN l.perfil = 'admin' THEN l.email END), MIN(l.email)) AS email,
        MAX(l.ultimoAcesso) AS ultimoAcesso
      FROM empresa e
      LEFT JOIN login l ON e.empresaId = l.empresaId
      WHERE e.nome <> 'Master Admin'
        ${includeFamily ? '' : "AND LOWER(COALESCE(e.plano, '')) <> 'family'"}
      GROUP BY e.empresaId, e.nome, e.cidade, e.estado, e.telefone, e.plano, e.status, e.dataCriacao
    `),
    allQuery(`
      SELECT empresaId, COUNT(*) AS total
      FROM "evento"
      WHERE LOWER(COALESCE(status, '')) IN ('finished', 'completed')
      GROUP BY empresaId
    `),
    allQuery(`
      SELECT clienteId, nome, cidade, estado, email, telefone, plano, status, eventosRealizados, ultimoAcesso, criadoEm
      FROM cliente
    `),
  ]);

  const finishedByEmpresa = new Map(finishedEvents.map((row) => [String(row.empresaId), Number(row.total) || 0]));

  const result = empresas.map((e) => ({
    id: e.empresaId,
    empresaId: e.empresaId,
    origin: 'empresa',
    name: e.nome,
    city: e.cidade || '',
    state: e.estado || '',
    phone: e.telefone || '',
    plan: e.plano || 'starter',
    status: e.status || 'active',
    email: e.email || '',
    lastAccess: e.ultimoAcesso || null,
    eventsDone: finishedByEmpresa.get(String(e.empresaId)) || 0,
    createdAt: e.dataCriacao || null,
  }));

  const seenByNameCity = new Set(result.map((r) => `${normalize(r.name)}|${normalize(r.city)}`));
  // Empresa sem cidade cadastrada casa só pelo nome, para não duplicar o cliente legado dela.
  const seenByNameOnly = new Set(result.filter((r) => !normalize(r.city)).map((r) => normalize(r.name)));

  clientes.forEach((c) => {
    if (seenByNameCity.has(`${normalize(c.nome)}|${normalize(c.cidade)}`)) return;
    if (seenByNameOnly.has(normalize(c.nome))) return;
    result.push({
      id: c.clienteId,
      empresaId: null,
      origin: 'cliente',
      name: c.nome,
      city: c.cidade || '',
      state: c.estado || '',
      phone: c.telefone || '',
      plan: c.plano || 'starter',
      status: c.status || 'active',
      email: c.email || '',
      lastAccess: c.ultimoAcesso || null,
      // eventosRealizados no legado tem valores negativos de teste
      eventsDone: Math.max(0, Number(c.eventosRealizados) || 0),
      createdAt: c.criadoEm || null,
    });
  });

  return result.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
}

module.exports = { listPlatformClients, normalizeClientText: normalize };
