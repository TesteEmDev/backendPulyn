// utils/checkpointTransferencia.js - checkpoint cadastrado pelo super admin e transferido para um buffet
//
// Ciclo de vida (pontoVerificacao.statusTransferencia):
//   estoque  -> cadastrado pelo super admin, ainda sem buffet (empresaId NULL)
//   pendente -> transferido para um buffet (empresaDestinoId), à espera do aceite do admin dele
//   aceito   -> o buffet aceitou: empresaId preenchido, num_check definido por ele
// Os checkpoints que já existiam antes deste fluxo ficam como 'aceito'.

const STATUS = Object.freeze({ ESTOQUE: 'estoque', PENDENTE: 'pendente', ACEITO: 'aceito' });
const PROPOSITOS = ['game', 'reception'];

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

const podeTransferir = (status) => status === STATUS.ESTOQUE;
const podeCancelarTransferencia = (status) => status === STATUS.PENDENTE;
// O buffet só responde (aceita ou recusa) ao que está pendente para ele.
const podeAceitar = (status) => status === STATUS.PENDENTE;
const podeRecusar = (status) => status === STATUS.PENDENTE;
const podeExcluir = (status) => status === STATUS.ESTOQUE;

// O ID do checkpoint é gerado pelo banco (migrations/checkpointIdNumerico.js): `id` é o inteiro autoincremento e
// `checkpointId` é o mesmo número escrito como texto, que as rotas e as tabelas de jogos usam como chave.
// As telas usam `id` como apelido de checkpointId (FrontEnd/src/services/api.ts só cria o apelido quando a linha não
// tem `id`), e um `id` numérico quebraria as comparações com texto. Por isso ele sai das respostas com linhas cruas
// (SELECT *) de pontoVerificacao; as rotas do master o expõem de propósito.
function semIdNovo(linhas) {
  const tirar = (linha) => {
    if (!linha || typeof linha !== 'object') return linha;
    const { id, ...resto } = linha;
    return resto;
  };
  return Array.isArray(linhas) ? linhas.map(tirar) : tirar(linhas);
}

module.exports = {
  STATUS,
  semIdNovo,
  PROPOSITOS,
  normalizarMac,
  validarNumCheck,
  podeTransferir,
  podeCancelarTransferencia,
  podeAceitar,
  podeRecusar,
  podeExcluir,
};
