// utils/preCadastroFamilia.js - Pré-cadastro de criança feito pelo responsável no app, antes do buffet.
//
// O cadastro nasce num evento aberto escolhido pelo pai; o buffet dele é o do evento, nunca o que o app manda.
// Sem evento não há buffet, e sem buffet a recepção não enxerga o cadastro (isolamento entre empresas).
const { idadeValida, idadeDeNascimento, normalizarBusca } = require('./perfilCrianca');

const EVENTOS_FECHADOS = new Set(['completed', 'cancelled', 'canceled', 'finished']);

function eventoAberto(evento) {
  return Boolean(evento) && !EVENTOS_FECHADOS.has(String(evento.status || '').trim().toLowerCase());
}

// Devolve { ok, error, value } com os campos já limpos. Os mesmos limites do check-in da recepção.
function validarPreCadastro(body = {}) {
  const nome = String(body.nome || '').trim();
  if (!nome) return { ok: false, error: 'Nome da criança é obrigatório' };
  if (nome.length > 100) return { ok: false, error: 'Nome excede o limite de 100 caracteres' };

  const apelido = String(body.apelido || '').trim();
  if (apelido.length > 100) return { ok: false, error: 'Apelido excede o limite de 100 caracteres' };

  // Com data de nascimento, a idade sai dela. Sem data, a idade continua valendo (cadastros antigos do app).
  const dataNascimento = String(body.dataNascimento || '').trim() || null;
  let idade;
  if (dataNascimento) {
    idade = idadeDeNascimento(dataNascimento);
    if (idade === null) return { ok: false, error: 'Data de nascimento inválida' };
    if (idade > 17) return { ok: false, error: 'A criança precisa ter até 17 anos' };
  } else {
    idade = idadeValida(body.idade ?? body.age);
    if (idade === null) return { ok: false, error: 'Informe a data de nascimento da criança' };
  }

  return { ok: true, value: { nome, apelido: apelido || null, idade, dataNascimento } };
}

// Dois nomes de responsável "batem" quando são iguais (sem acento/maiúscula) ou quando todas as palavras do mais curto
// estão no mais longo ("Carlos Almeida" x "Carlos Almeida Silva"): a recepção e o pai nem sempre digitam o nome completo.
function responsaveisParecidos(a, b) {
  const palavrasA = normalizarBusca(a).split(' ').filter(Boolean);
  const palavrasB = normalizarBusca(b).split(' ').filter(Boolean);
  if (!palavrasA.length || !palavrasB.length) return false;
  const [curto, longo] = palavrasA.length <= palavrasB.length ? [palavrasA, palavrasB] : [palavrasB, palavrasA];
  return curto.every((palavra) => longo.includes(palavra));
}

module.exports = { eventoAberto, validarPreCadastro, responsaveisParecidos };
