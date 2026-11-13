// utils/pulseiraKiosk.js - Regra da pulseira no kiosk: só vale a que o buffet recebeu.
//
// "Recebida" = a pulseira está cadastrada no estoque DO BUFFET (linha em `pulseira` com o empresaId dele) e livre.
// O kiosk não cria pulseira nova no cadastro: pulseira que não está no estoque é recusada logo ao ser aproximada,
// com o motivo na tela. (Antes ela era aceita na leitura e criada na hora de cadastrar; se essa criação falhasse,
// a criança montava o personagem inteiro e só no fim o kiosk "não reconhecia" a pulseira.)
const MOTIVO = Object.freeze({
  FORA_DO_ESTOQUE: 'fora_do_estoque',
  EM_USO: 'em_uso',
  INDISPONIVEL: 'indisponivel',
});

const MENSAGEM = Object.freeze({
  [MOTIVO.FORA_DO_ESTOQUE]: 'Esta pulseira não está cadastrada neste buffet. Aproxime outra pulseira.',
  [MOTIVO.EM_USO]: 'Esta pulseira já está vinculada a outra criança. Aproxime outra pulseira.',
  [MOTIVO.INDISPONIVEL]: 'Esta pulseira está indisponível. Aproxime outra pulseira.',
});

// `pulseira` é a linha do estoque do buffet ({ codigo, status, criancaId }) ou null/undefined se não existir.
function avaliarPulseira(pulseira) {
  if (!pulseira) {
    return { exists: false, status: null, available: false, motivo: MOTIVO.FORA_DO_ESTOQUE, mensagem: MENSAGEM[MOTIVO.FORA_DO_ESTOQUE] };
  }
  const status = String(pulseira.status || '').trim().toLowerCase();
  const available = status === 'disponivel' && !pulseira.criancaId;
  const motivo = available ? null : (status === 'em_uso' || pulseira.criancaId ? MOTIVO.EM_USO : MOTIVO.INDISPONIVEL);
  return { exists: true, status: pulseira.status ?? null, available, motivo, mensagem: motivo ? MENSAGEM[motivo] : null };
}

module.exports = { MOTIVO, MENSAGEM, avaliarPulseira };
