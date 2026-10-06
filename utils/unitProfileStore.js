// Leitura e gravação dos dados da unidade (tabela clientes, espelhando empresas).
const { v4: uuidv4 } = require('uuid');
const { normalizeClientText } = require('./platformClients');
const { formatCnpj } = require('./cnpj');
const { unitEmailDomain } = require('./unitEmail');

// `db` expõe queryOne/allQuery/query (o módulo database ou o executor de uma transação).
// O cadastro do buffet em `clientes` não tinha vínculo com a empresa: casa por empresa_id e,
// se ainda não houver, pelo mesmo critério já usado no sistema (nome + cidade).
async function findCliente(db, empresa) {
  const linked = await db.queryOne('SELECT * FROM cliente WHERE empresaId = @empresaId', { empresaId: empresa.id });
  if (linked) return linked;
  const candidates = await db.allQuery('SELECT * FROM cliente WHERE empresaId IS NULL ORDER BY criadoEm');
  return candidates.find((c) =>
    normalizeClientText(c.name) === normalizeClientText(empresa.nome) &&
    normalizeClientText(c.city) === normalizeClientText(empresa.cidade)) || null;
}

function toProfile(empresa, cliente) {
  const name = cliente?.name || empresa.nome || '';
  return {
    id: empresa.id,
    name,
    // Domínio dos e-mails dos usuários do buffet (ex.: "buffetadv.com"); null se o nome não gera um.
    emailDomain: unitEmailDomain(name),
    email: cliente?.email || '',
    phone: cliente?.phone ?? empresa.telefone ?? '',
    address: cliente?.address || '',
    city: cliente?.city || empresa.cidade || '',
    state: cliente?.state || empresa.estado || '',
    backupFrequency: cliente?.backup_frequency || 'daily',
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
    name: 'nome', email: 'email', phone: 'telefone', address: 'endereco', backupFrequency: 'frequenciaBackup',
  };

  if (cliente) {
    const sets = ['empresaId = @empresaId'];
    const params = { id: cliente.id, empresaId: empresa.id };
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
        empresaId: empresa.id,
        address: values.address ?? null,
        backupFrequency: values.backupFrequency ?? 'daily',
      }
    );
  }

  const empresaSets = ['dataAtualizacao = GETDATE()'];
  const empresaParams = { id: empresa.id };
  if ('name' in values) { empresaSets.push('nome = @nome'); empresaParams.nome = values.name; }
  if ('phone' in values) { empresaSets.push('telefone = @telefone'); empresaParams.telefone = values.phone; }
  if (cnpj !== undefined) { empresaSets.push('cnpj = @cnpj'); empresaParams.cnpj = cnpj; }
  await db.query(`UPDATE empresa SET ${empresaSets.join(', ')} WHERE empresaId = @id`, empresaParams);

  return loadUnitProfile(db, empresa.id);
}

// Logo da unidade: fica em clientes (logo_data/logo_name/logo_type), fora do perfil porque é pesada.
async function loadLogo(db, empresaId) {
  const row = await db.queryOne(
    'SELECT logoDados, logoNome, logoTipo FROM cliente WHERE empresaId = @empresaId',
    { empresaId }
  );
  if (!row?.logo_data) return null;
  return { dataUrl: row.logo_data, name: row.logo_name || '', type: row.logo_type || '' };
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
