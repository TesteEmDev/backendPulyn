// utils/eventosFamilia.js - Eventos da família: os que ela adicionou pelo código de convite e os das crianças vinculadas.
//
// Antes só aparecia para a família o evento de uma criança vinculada. Agora o responsável também digita o código do
// convite no app e o evento entra na conta dele (tabela familiaEvento), mesmo sem criança vinculada a ele ainda.
const { eventoAberto } = require('./preCadastroFamilia');

// Convite que um responsável JÁ logado usa para adicionar um evento. { ok } ou { ok:false, status, error }.
function avaliarConviteParaEntrar(invite, emailDoUsuario) {
  if (!invite) return { ok: false, status: 404, error: 'Convite não encontrado' };
  if (invite.status !== 'pending') {
    return { ok: false, status: 410, error: invite.status === 'expired' ? 'Convite expirado' : 'Convite já utilizado' };
  }
  const emailDoConvite = String(invite.email || '').trim().toLowerCase();
  if (emailDoConvite && emailDoConvite !== String(emailDoUsuario || '').trim().toLowerCase()) {
    return { ok: false, status: 403, error: 'Este convite foi feito para outro e-mail' };
  }
  return { ok: true };
}

const dataEmMs = (valor) => {
  const ms = new Date(valor).getTime();
  return Number.isNaN(ms) ? 0 : ms;
};

// Junta as duas origens num item por evento. Os mais recentes primeiro (sem data vão para o fim).
//   porConvite: linhas de familiaEvento    -> { eventoId, nome, data, status, buffetNome }
//   porCrianca: linhas de vinculo+crianca  -> { eventoId, nome, data, status, buffetNome, criancaId, criancaNome, apelido, pontos }
function montarEventosDaFamilia(porConvite = [], porCrianca = []) {
  const eventos = new Map();
  const garantir = (linha, adicionadoPorConvite) => {
    let evento = eventos.get(linha.eventoId);
    if (!evento) {
      evento = {
        id: linha.eventoId,
        nome: linha.nome || 'Evento',
        data: linha.data || null,
        status: linha.status || null,
        encerrado: !eventoAberto(linha),
        buffetNome: linha.buffetNome || null,
        adicionadoPorConvite: false,
        criancas: [],
        totalPontos: 0,
      };
      eventos.set(linha.eventoId, evento);
    }
    if (adicionadoPorConvite) evento.adicionadoPorConvite = true;
    return evento;
  };

  for (const linha of porConvite) garantir(linha, true);
  for (const linha of porCrianca) {
    const evento = garantir(linha, false);
    if (evento.criancas.some((c) => c.id === linha.criancaId)) continue;
    const pontos = Number(linha.pontos || 0);
    evento.criancas.push({ id: linha.criancaId, nome: linha.criancaNome, apelido: linha.apelido || null, pontos });
    evento.totalPontos += pontos;
  }

  return [...eventos.values()].sort((a, b) => dataEmMs(b.data) - dataEmMs(a.data));
}

module.exports = { avaliarConviteParaEntrar, montarEventosDaFamilia };
