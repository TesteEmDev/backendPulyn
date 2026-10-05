// Dados da unidade (buffet) editados pelo admin na tela de Configurações.
// Ficam na tabela `clientes`; o CNPJ continua em `empresas` (ver routes/empresa.js).
const { phoneError } = require('./phone');

const BACKUP_FREQUENCIES = new Set(['hourly', 'daily', 'weekly', 'manual']);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const text = (value) => String(value ?? '').trim();

// Valida só os campos presentes em `body` (atualização parcial).
// Retorna { values } com os campos normalizados (chaves camelCase) ou { error }.
function parseUnitProfile(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Envie os dados da unidade como objeto' };
  }
  const values = {};

  if ('name' in body) {
    const name = text(body.name);
    if (!name) return { error: 'Informe o nome da unidade' };
    if (name.length > 100) return { error: 'Nome da unidade excede 100 caracteres' };
    values.name = name;
  }

  if ('email' in body) {
    const email = text(body.email);
    if (!email) return { error: 'Informe o e-mail da unidade' };
    if (email.length > 100 || !EMAIL_PATTERN.test(email)) return { error: 'E-mail inválido' };
    values.email = email;
  }

  if ('phone' in body) {
    const phone = text(body.phone);
    const problem = phoneError(phone);
    if (problem) return { error: problem };
    if (phone.length > 20) return { error: 'Telefone excede 20 caracteres' };
    values.phone = phone;
  }

  if ('address' in body) {
    const address = text(body.address);
    if (address.length > 255) return { error: 'Endereço excede 255 caracteres' };
    values.address = address;
  }

  if ('backupFrequency' in body) {
    const frequency = text(body.backupFrequency);
    if (!BACKUP_FREQUENCIES.has(frequency)) return { error: 'Frequência de backup inválida' };
    values.backupFrequency = frequency;
  }

  return { values };
}

module.exports = { parseUnitProfile, BACKUP_FREQUENCIES };
