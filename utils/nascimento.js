// utils/nascimento.js - Data de nascimento da criança (no lugar da idade digitada)
//
// O cadastro passa a guardar a data de nascimento; a idade é calculada dela (no dia do cadastro) e continua gravada em
// `idade` para as telas e relatórios que já a usam. Quem ainda manda só a idade (versões antigas do app) segue aceito.
const EVENT_TIMEZONE = process.env.EVENT_TIMEZONE || 'America/Sao_Paulo';

// Quem está nos eventos infantis: até esta idade (completa) a data é aceita.
const IDADE_MAXIMA = 18;

// Data de hoje no fuso do buffet, como [ano, mês, dia]. O servidor roda em UTC, então a conversão evita errar a data à noite.
function hoje(agora = new Date()) {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: EVENT_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(agora);
  const valor = (tipo) => Number(partes.find((p) => p.type === tipo).value);
  return [valor('year'), valor('month'), valor('day')];
}

function diaExiste(ano, mes, dia) {
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  return data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia;
}

// Aceita 'AAAA-MM-DD', 'DD/MM/AAAA' e 'DDMMAAAA'. Devolve { data: 'AAAA-MM-DD' } ou { erro }.
function normalizarDataNascimento(valor, agora = new Date()) {
  const texto = String(valor ?? '').trim();
  let ano; let mes; let dia;
  let casou = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (casou) { [, ano, mes, dia] = casou; } else {
    casou = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto) || /^(\d{2})(\d{2})(\d{4})$/.exec(texto);
    if (casou) { [, dia, mes, ano] = casou; }
  }
  if (!casou) return { erro: 'Informe a data de nascimento no formato dia/mês/ano.' };
  ano = Number(ano); mes = Number(mes); dia = Number(dia);
  if (!diaExiste(ano, mes, dia)) return { erro: 'A data de nascimento não existe.' };

  const [anoHoje, mesHoje, diaHoje] = hoje(agora);
  const noFuturo = ano > anoHoje || (ano === anoHoje && (mes > mesHoje || (mes === mesHoje && dia > diaHoje)));
  if (noFuturo) return { erro: 'A data de nascimento não pode ser no futuro.' };

  const data = `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  if (idadeNaData(data, agora) > IDADE_MAXIMA) return { erro: `A data de nascimento indica mais de ${IDADE_MAXIMA} anos.` };
  return { data };
}

// Idade em anos completos de uma data 'AAAA-MM-DD' (ou Date) no dia de `agora`.
function idadeNaData(data, agora = new Date()) {
  // O driver devolve uma coluna `date` como Date à meia-noite LOCAL: ler pelos campos locais (toISOString poderia voltar um dia)
  const dois = (n) => String(n).padStart(2, '0');
  const texto = data instanceof Date
    ? `${data.getFullYear()}-${dois(data.getMonth() + 1)}-${dois(data.getDate())}`
    : String(data || '').slice(0, 10);
  const casou = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (!casou) return null;
  const [ano, mes, dia] = [Number(casou[1]), Number(casou[2]), Number(casou[3])];
  const [anoHoje, mesHoje, diaHoje] = hoje(agora);
  let idade = anoHoje - ano;
  if (mesHoje < mes || (mesHoje === mes && diaHoje < dia)) idade -= 1;
  return Math.max(0, idade);
}

module.exports = { IDADE_MAXIMA, normalizarDataNascimento, idadeNaData };
