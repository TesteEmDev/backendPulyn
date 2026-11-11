// utils/checkpointTransferencia.js - checkpoint cadastrado pelo super admin e transferido para um buffet
//
// Ciclo de vida (pontoVerificacao.statusTransferencia):
//   estoque  -> cadastrado pelo super admin, ainda sem buffet (empresaId NULL)
//   aceito   -> transferido para um buffet (empresaId preenchido). Não há aceite: o admin do buffet só define o
//               num_check depois, na tela local, e o checkpoint pode ficar sem número até lá.
// Os checkpoints que já existiam antes deste fluxo ficam como 'aceito'.

const STATUS = Object.freeze({ ESTOQUE: 'estoque', ACEITO: 'aceito' });
// game = jogo; reception = leitor da recepção; score = leitor do totem de consulta de pontuação
const PROPOSITOS = ['game', 'reception', 'score'];

// "aa-bb-cc-dd-ee-ff", "AABBCCDDEEFF" ou "aa:bb:cc:dd:ee:ff" -> "AA:BB:CC:DD:EE:FF". null se não for um MAC.
function normalizarMac(valor) {
  const hex = String(valor ?? '').replace(/[\s:.-]/g, '').toUpperCase();
  if (!/^[0-9A-F]{12}$/.test(hex)) return null;
  return hex.match(/.{2}/g).join(':');
}

// O num_check é o número que o recreacionista dá ao checkpoint. Mesma regra do ID de antes (até 40 caracteres, sem
// espaços nem / \ ? # %). Vazio é permitido: o buffet o define ao aceitar.
function validarNumCheck(valor) {
  if (valor === undefined || valor === null) return { ok: true, valor: null };
  const texto = String(valor).trim();
  if (texto === '') return { ok: true, valor: null };
  if (texto.length > 40 || /[\s/\\?#%]/.test(texto)) {
    return { ok: false, erro: 'O número do checkpoint deve ter até 40 caracteres, sem espaços nem os símbolos / \\ ? # %' };
  }
  return { ok: true, valor: texto };
}

// Número dos checkpoints de recepção (R1, R2, R3...) e de pontuação (P1, P2, P3...). O número depois da letra diz qual tela
// recebe as leituras daquele leitor: o R1 é o balcão; /reception/kiosk/2 ouve o R2; /score-kiosk/1 ouve o P1.
// Os checkpoints de jogo não podem usar nenhum desses formatos, nem um tipo usar o formato do outro.
const NUMERO_DE_RECEPCAO = /^R\d{1,3}$/i;
const NUMERO_DE_PONTUACAO = /^P\d{1,3}$/i;
const numeroDeRecepcao = (numero) => NUMERO_DE_RECEPCAO.test(String(numero ?? '').trim());
const numeroDePontuacao = (numero) => NUMERO_DE_PONTUACAO.test(String(numero ?? '').trim());

// Confere o número escolhido para um checkpoint conforme a finalidade dele. Devolve { ok, valor } (já normalizado) ou { ok: false, erro }.
function validarNumeroPorFinalidade(proposito, numero) {
  const texto = String(numero ?? '').trim();
  const finalidade = String(proposito || 'game').toLowerCase();
  if (finalidade === 'reception') {
    if (!numeroDeRecepcao(texto)) return { ok: false, erro: 'O número de um checkpoint de recepção é R1, R2, R3 e assim por diante (a letra R e o número do leitor)' };
    return { ok: true, valor: texto.toUpperCase() };
  }
  if (finalidade === 'score') {
    if (!numeroDePontuacao(texto)) return { ok: false, erro: 'O número de um checkpoint de pontuação é P1, P2, P3 e assim por diante (a letra P e o número da tela de pontuação)' };
    return { ok: true, valor: texto.toUpperCase() };
  }
  if (numeroDeRecepcao(texto) || numeroDePontuacao(texto)) {
    return { ok: false, erro: 'Números como R1, R2... (recepção) e P1, P2... (pontuação) são reservados a esses leitores. Use outro número para este checkpoint' };
  }
  return { ok: true, valor: texto };
}

const podeTransferir = (status) => status === STATUS.ESTOQUE;
const podeExcluir = (status) => status === STATUS.ESTOQUE;

// EPC do checkpoint (tag UHF que o identifica): só os ÚLTIMOS 6 dígitos hexadecimais, em maiúsculas. Aceita o EPC inteiro
// (com espaço, dois-pontos ou hífen) e guarda só o final. Vazio = sem EPC (null). Devolve { ok, valor } ou { ok: false, erro }.
const EPC_DIGITOS = 6;
function normalizarEpc(valor) {
  const bruto = String(valor ?? '').trim();
  if (!bruto) return { ok: true, valor: null };
  const hex = bruto.replace(/[\s:-]/g, '').toUpperCase();
  if (!/^[0-9A-F]+$/.test(hex) || hex.length < EPC_DIGITOS) {
    return { ok: false, erro: `EPC inválido: informe os últimos ${EPC_DIGITOS} dígitos hexadecimais (0-9 e A-F)` };
  }
  return { ok: true, valor: hex.slice(-EPC_DIGITOS) };
}

// O ID do checkpoint é gerado pelo banco (migrations/checkpointIdNumerico.js): `id` é o inteiro autoincremento e
// `checkpointId` é o mesmo número escrito como texto, que as rotas e as tabelas de jogos usam como chave.
// As telas usam `id` como apelido de checkpointId (FrontEnd/src/services/api.ts só cria o apelido quando a linha não
// tem `id`), e um `id` numérico quebraria as comparações com texto. Por isso ele sai das respostas com linhas cruas
// (SELECT *) de pontoVerificacao; as rotas do master o expõem de propósito.
// O `epc` também sai: é um dado só do master (o buffet nunca o vê), e essas respostas vão para o buffet.
function semIdNovo(linhas) {
  const tirar = (linha) => {
    if (!linha || typeof linha !== 'object') return linha;
    const { id, epc, ...resto } = linha;
    return resto;
  };
  return Array.isArray(linhas) ? linhas.map(tirar) : tirar(linhas);
}

module.exports = {
  STATUS,
  semIdNovo,
  PROPOSITOS,
  normalizarMac,
  normalizarEpc,
  validarNumCheck,
  validarNumeroPorFinalidade,
  numeroDeRecepcao,
  numeroDePontuacao,
  podeTransferir,
  podeExcluir,
};
