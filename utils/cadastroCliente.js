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

// Edição pelo master: só valida os campos que vieram no corpo (os demais ficam como estão). Um campo que veio
// em branco é erro: os dados do cadastro são todos obrigatórios. Plano e status são tratados na rota.
function validarEdicaoCliente(corpo) {
  const veio = (campo) => corpo?.[campo] !== undefined && corpo?.[campo] !== null;
  const valores = {};

  if (veio('nome')) {
    const nome = texto(corpo.nome);
    if (!nome) return { erro: 'Informe o nome do buffet' };
    if (nome.length > 100) return { erro: 'Nome do buffet excede 100 caracteres' };
    valores.nome = nome;
  }
  if (veio('cnpj')) {
    const cnpj = normalizeCnpj(corpo.cnpj);
    if (!cnpj) return { erro: 'Informe o CNPJ' };
    if (!isValidCnpj(cnpj)) return { erro: 'CNPJ inválido. Confira os 14 dígitos.' };
    valores.cnpj = cnpj;
  }
  if (veio('endereco')) {
    const endereco = texto(corpo.endereco);
    if (!endereco) return { erro: 'Informe o endereço' };
    if (endereco.length > 255) return { erro: 'Endereço excede 255 caracteres' };
    valores.endereco = endereco;
  }
  if (veio('cidade')) {
    const cidade = texto(corpo.cidade);
    if (!cidade) return { erro: 'Informe a cidade' };
    valores.cidade = cidade;
  }
  if (veio('estado')) {
    const estado = texto(corpo.estado).toUpperCase();
    if (!estado) return { erro: 'Informe o estado (UF)' };
    if (!ESTADOS.has(estado)) return { erro: 'Estado inválido. Use a sigla da UF, por exemplo SP.' };
    valores.estado = estado;
  }
  if (veio('email')) {
    const email = texto(corpo.email);
    if (!email) return { erro: 'Informe o e-mail' };
    if (email.length > 100 || !EMAIL_PATTERN.test(email)) return { erro: 'E-mail inválido' };
    valores.email = email;
  }
  if (veio('telefone')) {
    const telefone = texto(corpo.telefone);
    if (!telefone) return { erro: 'Informe o telefone' };
    const problemaTelefone = phoneError(telefone);
    if (problemaTelefone) return { erro: problemaTelefone };
    if (telefone.length > 20) return { erro: 'Telefone excede 20 caracteres' };
    valores.telefone = telefone;
  }

  return { valores };
}

module.exports = { validarCadastroCliente, validarEdicaoCliente, ESTADOS };
