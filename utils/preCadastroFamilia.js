// utils/preCadastroFamilia.js - Pré-cadastro de criança feito pelo responsável no app, antes do buffet.
//
// O cadastro nasce num evento aberto escolhido pelo pai; o buffet dele é o do evento, nunca o que o app manda.
// Sem evento não há buffet, e sem buffet a recepção não enxerga o cadastro (isolamento entre empresas).
const { idadeValida } = require('./perfilCrianca');

const EVENTOS_FECHADOS = new Set(['completed', 'cancelled', 'canceled', 'finished']);

function eventoAberto(evento) {
  return Boolean(evento) && !EVENTOS_FECHADOS.has(String(evento.status || '').trim().toLowerCase());
}

// Devolve { ok, error, value } com os campos já limpos. Os mesmos limites do check-in da recepção.
function validarPreCadastro(body = {}) {
  const eventoId = String(body.eventoId || '').trim();
  if (!eventoId) return { ok: false, error: 'Escolha o evento' };

  const nome = String(body.nome || '').trim();
  if (!nome) return { ok: false, error: 'Nome da criança é obrigatório' };
  if (nome.length > 100) return { ok: false, error: 'Nome excede o limite de 100 caracteres' };

  const apelido = String(body.apelido || '').trim();
  if (apelido.length > 100) return { ok: false, error: 'Apelido excede o limite de 100 caracteres' };

  const idade = idadeValida(body.idade ?? body.age);
  if (idade === null) return { ok: false, error: 'Idade é obrigatória' };

  return { ok: true, value: { eventoId, nome, apelido: apelido || null, idade } };
}

module.exports = { eventoAberto, validarPreCadastro };
