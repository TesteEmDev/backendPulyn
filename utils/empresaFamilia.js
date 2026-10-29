// utils/empresaFamilia.js - Buffet de uma conta de família
//
// A conta criada pelo cadastro aberto (/auth/register) ganha uma "empresa" própria, sem planta, zonas nem leitores;
// o buffet de verdade é o das crianças vinculadas a ela. Para o perfil family, as rotas que dependem do buffet usam
// a empresa do vínculo aprovado (o do evento pedido, ou o mais recente).
const { queryOne } = require('../database');
const { eventoDaFamilia } = require('./acessoEventoFamilia');

async function empresaDaFamilia(req, { eventoId } = {}) {
  if (req.user?.role !== 'family') return req.user?.empresaId;
  const filtroEvento = eventoId ? 'AND LOWER(c.eventoId) = LOWER(@eventoId)' : '';
  const vinculo = await queryOne(
    `SELECT v.empresaId FROM vinculoFamiliar v JOIN crianca c ON c.criancaId = v.criancaId
      WHERE v.loginId = @loginId AND v.status = 'approved' ${filtroEvento}
      ORDER BY COALESCE(v.aprovadoEm, v.criadoEm) DESC
      LIMIT 1`,
    { loginId: req.user.id, eventoId }
  );
  if (vinculo?.empresaId) return vinculo.empresaId;

  // Evento adicionado pelo código de convite e ainda sem criança vinculada: o buffet é o do evento
  if (eventoId) {
    const evento = await eventoDaFamilia(req.user, eventoId);
    if (evento) return evento.empresaId;
  }
  return req.user.empresaId;
}

module.exports = { empresaDaFamilia };
