// utils/cadastroCliente.js - Cadastro de um buffet feito pelo master: todos os dados são obrigatórios
//
// Estes dados ficam fixos: o admin do buffet os vê em Configurações, mas só o master os define.
const { normalizeCnpj, isValidCnpj } = require('./cnpj');
const { phoneError } = require('./phone');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ESTADOS = new Set(['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']);

const texto = (valor) => String(valor ?? '').trim();

// Valida o corpo do cadastro. Devolve { erro } ou { valores } com tudo normalizado (cnpj só com os 14 dígitos).
function validarCadastroCliente(corpo) {
  const nome = texto(corpo?.nome);
  const cnpj = normalizeCnpj(corpo?.cnpj);
  const endereco = texto(corpo?.endereco);
  const cidade = texto(corpo?.cidade);
  const estado = texto(corpo?.estado).toUpperCase();
  const email = texto(corpo?.email);
  const telefone = texto(corpo?.telefone);
  const senha = String(corpo?.senha ?? '');

  if (!nome) return { erro: 'Informe o nome do buffet' };
  if (nome.length > 100) return { erro: 'Nome do buffet excede 100 caracteres' };
  if (!cnpj) return { erro: 'Informe o CNPJ' };
  if (!isValidCnpj(cnpj)) return { erro: 'CNPJ inválido. Confira os 14 dígitos.' };
  if (!endereco) return { erro: 'Informe o endereço' };
  if (endereco.length > 255) return { erro: 'Endereço excede 255 caracteres' };
  if (!cidade) return { erro: 'Informe a cidade' };
  if (!estado) return { erro: 'Informe o estado (UF)' };
  if (!ESTADOS.has(estado)) return { erro: 'Estado inválido. Use a sigla da UF, por exemplo SP.' };
  if (!email) return { erro: 'Informe o e-mail' };
  if (email.length > 100 || !EMAIL_PATTERN.test(email)) return { erro: 'E-mail inválido' };
  if (!telefone) return { erro: 'Informe o telefone' };
  const problemaTelefone = phoneError(telefone);
  if (problemaTelefone) return { erro: problemaTelefone };
  if (telefone.length > 20) return { erro: 'Telefone excede 20 caracteres' };
  if (!senha) return { erro: 'Informe a senha inicial' };
  if (senha.length < 6) return { erro: 'Senha deve ter pelo menos 6 caracteres' };

  return { valores: { nome, cnpj, endereco, cidade, estado, email, telefone, senha } };
}

module.exports = { validarCadastroCliente, ESTADOS };
