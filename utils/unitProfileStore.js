// Leitura e gravação dos dados da unidade (tabela clientes, espelhando empresas).
const { v4: uuidv4 } = require('uuid');
const { normalizeClientText } = require('./platformClients');
const { formatCnpj } = require('./cnpj');
const { unitEmailDomain } = require('./unitEmail');

// `db` expõe queryOne/allQuery/query (o módulo database ou o executor de uma transação).
// O cadastro do buffet em `clientes` não tinha vínculo com a empresa: casa por empresaId e,
// se ainda não houver, pelo mesmo critério já usado no sistema (nome + cidade).
async function findCliente(db, empresa) {
  const linked = await db.queryOne('SELECT * FROM cliente WHERE empresaId = @empresaId', { empresaId: empresa.empresaId });
  if (linked) return linked;
  const candidates = await db.allQuery('SELECT * FROM cliente WHERE empresaId IS NULL ORDER BY criadoEm');
  return candidates.find((c) =>
    normalizeClientText(c.nome) === normalizeClientText(empresa.nome) &&
    normalizeClientText(c.cidade) === normalizeClientText(empresa.cidade)) || null;
}

function toProfile(empresa, cliente) {
  const name = cliente?.nome || empresa.nome || '';
  return {
    id: empresa.empresaId,
    name,
    // Domínio dos e-mails dos usuários do buffet (ex.: "buffetadv.com"); null se o nome não gera um.
    emailDomain: unitEmailDomain(name),
    email: cliente?.email || '',
    phone: cliente?.telefone ?? empresa.telefone ?? '',
    address: cliente?.endereco || '',
    city: cliente?.cidade || empresa.cidade || '',
    state: cliente?.estado || empresa.estado || '',
    backupFrequency: cliente?.frequenciaBackup || 'daily',
    cnpj: empresa.cnpj ? formatCnpj(empresa.cnpj) : '',
  };
}

async function loadUnitProfile(db, empresaId) {
  const empresa = await db.queryOne(
    'SELECT empresaId, nome, cnpj, cidade, estado, telefone FROM empresa WHERE empresaId = @id',
    { id: empresaId }
  );
  if (!empresa) return null;
  return toProfile(empresa, await findCliente(db, empresa));
}

// Grava em `clientes` (cria o cadastro se a empresa ainda não tiver) e espelha nome e
// telefone em `empresas`, como o restante do sistema já faz. `cnpj` (14 dígitos ou null)
// só é alterado quando informado, e fica em `empresas`.
async function saveUnitProfile(db, empresaId, values, { cnpj, fallbackEmail } = {}) {
  const empresa = await db.queryOne(
    'SELECT empresaId, nome, cnpj, cidade, estado, telefone, plano, status FROM empresa WHERE empresaId = @id',
    { id: empresaId }
  );
  if (!empresa) return null;

  const cliente = await findCliente(db, empresa);
  const columns = {
    name: 'name', email: 'email', phone: 'phone', address: 'address', backupFrequency: 'frequenciaBackup',
  };

  if (cliente) {
    const sets = ['empresaId = @empresaId'];
    const params = { id: cliente.clienteId, empresaId: empresa.empresaId };
    for (const [key, column] of Object.entries(columns)) {
      if (key in values) {
        sets.push(`${column} = @${key}`);
        params[key] = values[key];
      }
    }
    await db.query(`UPDATE cliente SET ${sets.join(', ')} WHERE clienteId = @id`, params);
  } else {
    await db.query(
      `INSERT INTO cliente (clienteId, nome, cidade, estado, email, telefone, plano, status, empresaId, endereco, frequenciaBackup)
       VALUES (@id, @name, @city, @state, @email, @phone, @plano, @status, @empresaId, @address, @backupFrequency)`,
      {
        id: uuidv4(),
        name: values.name ?? empresa.nome,
        city: empresa.cidade || null,
        state: empresa.estado || null,
        email: values.email ?? fallbackEmail ?? '',
        phone: values.phone ?? empresa.telefone ?? null,
        plano: empresa.plano || 'starter',
        status: empresa.status || 'active',
        empresaId: empresa.empresaId,
        address: values.address ?? null,
        backupFrequency: values.backupFrequency ?? 'daily',
      }
    );
  }

  const empresaSets = ['data_atualizacao = GETDATE()'];
  const empresaParams = { id: empresa.empresaId };
  if ('name' in values) { empresaSets.push('nome = @nome'); empresaParams.nome = values.name; }
  if ('phone' in values) { empresaSets.push('telefone = @telefone'); empresaParams.telefone = values.phone; }
  if (cnpj !== undefined) { empresaSets.push('cnpj = @cnpj'); empresaParams.cnpj = cnpj; }
  await db.query(`UPDATE empresa SET ${empresaSets.join(', ')} WHERE empresaId = @id`, empresaParams);

  return loadUnitProfile(db, empresa.empresaId);
}

// Logo da unidade: fica em clientes (logoDados/logoNome/logoTipo), fora do perfil porque é pesada.
async function loadLogo(db, empresaId) {
  const row = await db.queryOne(
    'SELECT logoDados, logoNome, logoTipo FROM cliente WHERE empresaId = @empresaId',
    { empresaId }
  );
  if (!row?.logoDados) return null;
  return { dataUrl: row.logoDados, name: row.logoNome || '', type: row.logoTipo || '' };
}

// Grava a logo (ou remove, com logo = null). Garante o cadastro em clientes e o vínculo
// com a empresa, como no salvamento do perfil.
async function saveLogo(db, empresaId, logo, { fallbackEmail } = {}) {
  const profile = await saveUnitProfile(db, empresaId, {}, { fallbackEmail });
  if (!profile) return false;
  await db.query(
    `UPDATE cliente SET logoDados = @data, logoNome = @name, logoTipo = @type WHERE empresaId = @empresaId`,
    { data: logo?.dataUrl ?? null, name: logo?.name ?? null, type: logo?.type ?? null, empresaId }
  );
  return true;
}

module.exports = { findCliente, loadUnitProfile, saveUnitProfile, loadLogo, saveLogo };
