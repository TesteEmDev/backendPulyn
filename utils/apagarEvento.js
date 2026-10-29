// utils/apagarEvento.js - exclui um evento e tudo o que pertence só a ele
//
// O banco recusa apagar um evento que tem participantes, times, zonas, pontos etc. (chaves estrangeiras), então a rota
// antiga respondia 500 em qualquer evento usado. Aqui a exclusão é feita na ordem certa, numa transação (tudo ou nada):
//   - apaga: participantes, times, zonas, pontuação, leituras, conquistas, mensagens do display, códigos de família,
//     eventos que famílias adicionaram pelo convite (familiaEvento), vínculos de jogos e o estado/partidas dos jogos do evento;
//   - mantém: os cadastros permanentes (perfilCrianca, brincadeira), as pulseiras (voltam a ficar disponíveis), o log
//     (perde só o vínculo com o evento) e os checkpoints com MAC, que são aparelhos do buffet: voltam a ficar "sem evento".
//     Checkpoint sem MAC (cadastro antigo, só configuração) é apagado junto.
const { query, allQuery, withTransaction } = require('../database');
const { releaseBraceletsWith } = require('./braceletRelease');
const { recalcularUltimoEvento } = require('./perfilCrianca');

// Tabelas de jogos cujo eventoId não é chave estrangeira: toda linha do evento é apagada, nesta ordem.
const TABELAS_DE_JOGO = [
  '"bonusVencedorJogo"', '"vencedorBrincadeiraParalela"', '"brincadeiraParalela"',
  '"cacaTesourScan"', '"cacaTesourTempo"', '"cacaTesourPartida"',
  '"monsterCacaLeitura"', '"monsterCacaEstadoTime"', '"monsterCacaPartida"',
  '"zonaConquistaLeituraIndividual"', '"zonaConquistaLeituraTime"', '"zonaConquistaEstadoParticipanteIndividual"',
  '"zonaConquistaEstadoCheckpoint"', '"zonaConquistaEstadoZona"', '"zonaConquistaTempoTime"',
  '"zonaConquistaPartidaIndividual"', '"zonaConquistaPartidaTime"',
  '"estadoJogoEvento"', '"sessaoJogo"', '"conviteFamilia"',
];

const contar = (resultado) => Number(resultado?.rowsAffected?.[0] || 0);

// Roda dentro de uma transação já aberta. Devolve o que foi apagado, para o aviso na tela.
async function apagarEventoDentroDaTransacao(eventoId) {
  const p = { eventoId };
  const daCrianca = 'SELECT criancaId FROM crianca WHERE LOWER(eventoId) = LOWER(@eventoId)';
  const resumo = {};

  const perfis = await allQuery(
    'SELECT DISTINCT perfilCriancaId FROM crianca WHERE LOWER(eventoId) = LOWER(@eventoId) AND perfilCriancaId IS NOT NULL', p
  );

  // As pulseiras dos participantes voltam a ficar disponíveis (a FK pulseira.criancaId impediria apagá-los).
  const pulseiras = await releaseBraceletsWith({ query }, eventoId);
  resumo.pulseirasLiberadas = pulseiras.braceletsReleased;

  // Checkpoints: o território conquistado no evento acaba com ele.
  await query(
    `UPDATE pontoVerificacao SET territorioDonoTimeId = NULL, territorioDonosCriancaId = NULL,
            territorioTravadoAte = NULL, territorioCooldownAte = NULL
     WHERE LOWER(eventoId) = LOWER(@eventoId)
        OR territorioDonoTimeId IN (SELECT timeId FROM "time" WHERE LOWER(eventoId) = LOWER(@eventoId))`, p
  );
  const semMac = 'SELECT checkpointId FROM pontoVerificacao WHERE LOWER(eventoId) = LOWER(@eventoId) AND macAddress IS NULL';
  await query(`DELETE FROM "etiquetaCheckpoint" WHERE checkpointId IN (${semMac})`, p);
  await query(`DELETE FROM leitura WHERE checkpointId IN (${semMac})`, p);
  await query(`DELETE FROM pontuacao WHERE checkpointId IN (${semMac})`, p);
  resumo.checkpointsApagados = contar(await query(
    'DELETE FROM pontoVerificacao WHERE LOWER(eventoId) = LOWER(@eventoId) AND macAddress IS NULL', p
  ));
  resumo.checkpointsLiberados = contar(await query(
    'UPDATE pontoVerificacao SET eventoId = NULL WHERE LOWER(eventoId) = LOWER(@eventoId)', p
  ));

  // Jogos: estado, partidas e leituras do evento. Os jogos em si (brincadeira) continuam no cadastro do buffet.
  for (const tabela of TABELAS_DE_JOGO) {
    await query(`DELETE FROM ${tabela} WHERE LOWER("eventoId") = LOWER(@eventoId)`, p);
  }
  await query('DELETE FROM "eventoBrincadeira" WHERE LOWER(eventoId) = LOWER(@eventoId)', p);
  await query('UPDATE brincadeira SET eventoId = NULL WHERE LOWER(eventoId) = LOWER(@eventoId)', p);

  // Participantes e o que depende deles.
  await query(`DELETE FROM "codigoVinculoFamiliar" WHERE LOWER(eventoId) = LOWER(@eventoId) OR criancaId IN (${daCrianca})`, p);
  await query(`DELETE FROM "criancaConquista" WHERE criancaId IN (${daCrianca})`, p);
  await query(`DELETE FROM leitura WHERE criancaId IN (${daCrianca})`, p);
  await query(`DELETE FROM pontuacao WHERE LOWER(eventoId) = LOWER(@eventoId) OR criancaId IN (${daCrianca})`, p);
  resumo.participantesApagados = contar(await query('DELETE FROM crianca WHERE LOWER(eventoId) = LOWER(@eventoId)', p));
  resumo.timesApagados = contar(await query('DELETE FROM "time" WHERE LOWER(eventoId) = LOWER(@eventoId)', p));
  await query('DELETE FROM zona WHERE LOWER(eventoId) = LOWER(@eventoId)', p);
  await query('DELETE FROM "mensagemDisplay" WHERE LOWER(eventoId) = LOWER(@eventoId)', p);
  // partidaBomba e partidaRefem saem sozinhas (ON DELETE CASCADE); o log fica, sem o vínculo com o evento.
  await query('UPDATE log SET eventoId = NULL WHERE LOWER(eventoId) = LOWER(@eventoId)', p);
  await query('DELETE FROM "controleEventoEmpresa" WHERE LOWER(eventoId) = LOWER(@eventoId)', p);
  await query('DELETE FROM "familiaEvento" WHERE LOWER(eventoId) = LOWER(@eventoId)', p);

  resumo.eventosApagados = contar(await query('DELETE FROM evento WHERE LOWER(eventoId) = LOWER(@eventoId)', p));

  // O cadastro permanente da criança continua; o "último evento" dela volta para o mais recente que sobrou.
  for (const { perfilCriancaId } of perfis) await recalcularUltimoEvento(perfilCriancaId);
  return resumo;
}

function apagarEvento(eventoId) {
  return withTransaction(() => apagarEventoDentroDaTransacao(eventoId));
}

module.exports = { apagarEvento, apagarEventoDentroDaTransacao, TABELAS_DE_JOGO };
