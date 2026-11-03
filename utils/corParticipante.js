// utils/corParticipante.js - Cor que o participante escolhe para si (mapa e ranking dos jogos individuais)
//
// Antes a cor saía de um cálculo sobre o id (parecia aleatória). Agora o participante escolhe uma da paleta no cadastro.
// Como o avatar, a cor não se repete entre os participantes do evento enquanto houver cor livre (a cor identifica quem
// domina cada checkpoint na Zona individual). A paleta tem 12 cores; só com todas em uso a repetição é permitida.
// ATENÇÃO: a mesma lista existe no front (FrontEnd/src/utils/coresParticipante.ts); mantenha as duas iguais.
const { escolherAvatar } = require('./avatarEvento');

const CORES_PARTICIPANTE = Object.freeze([
  '#EF4444', '#F97316', '#F59E0B', '#EAB308', '#84CC16', '#22C55E',
  '#14B8A6', '#06B6D4', '#3B82F6', '#8B5CF6', '#D946EF', '#EC4899',
]);

const MENSAGEM_COR_EM_USO = 'Esta cor já foi escolhida por outro participante do evento. Escolha outra.';

// Devolve a cor da paleta (em maiúsculas) ou null quando não é uma delas.
function normalizarCor(valor) {
  const cor = String(valor ?? '').trim().toUpperCase();
  return CORES_PARTICIPANTE.includes(cor) ? cor : null;
}

// Mesma regra dos avatares: pedido em uso = conflito; sem pedido, uma cor livre; todas em uso, a menos usada.
function escolherCor({ pedido = null, emUso = [], aleatorio = Math.random }) {
  const escolha = escolherAvatar({ pedido, emUso, ids: CORES_PARTICIPANTE, aleatorio });
  return escolha.conflito ? escolha : { cor: escolha.avatar };
}

// Cores dos participantes do evento (menos a de `excetoCriancaId`). `db` é o banco ou a transação.
async function coresEmUso(db, eventoId, excetoCriancaId = null) {
  const linhas = excetoCriancaId
    ? await db.allQuery(
      'SELECT cor FROM crianca WHERE eventoId = @eventoId AND cor IS NOT NULL AND criancaId <> @exceto',
      { eventoId, exceto: excetoCriancaId }
    )
    : await db.allQuery('SELECT cor FROM crianca WHERE eventoId = @eventoId AND cor IS NOT NULL', { eventoId });
  return linhas.map((linha) => String(linha.cor).toUpperCase());
}

module.exports = { CORES_PARTICIPANTE, MENSAGEM_COR_EM_USO, normalizarCor, escolherCor, coresEmUso };
