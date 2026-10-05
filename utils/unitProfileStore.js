// Leitura e gravação dos dados da unidade (tabela clientes, espelhando empresas).
const { v4: uuidv4 } = require('uuid');
const { normalizeClientText } = require('./platformClients');
const { formatCnpj } = require('./cnpj');

// `db` expõe queryOne/allQuery/query (o módulo database ou o executor de uma transação).
// O cadastro do buffet em `clientes` não tinha vínculo com a empresa: casa por empresa_id e,
// se ainda não houver, pelo mesmo critério já usado no sistema (nome + cidade).
async function findCliente(db, empresa) {
  const linked = await db.queryOne('SELECT * FROM clientes WHERE empresa_id = @empresaId', { empresaId: empresa.id });
  if (linked) return linked;
  const candidates = await db.allQuery('SELECT * FROM clientes WHERE empresa_id IS NULL ORDER BY created_at');
  return candidates.find((c) =>
    normalizeClientText(c.name) === normalizeClientText(empresa.nome) &&
    normalizeClientText(c.city) === normalizeClientText(empresa.cidade)) || null;
}

function toProfile(empresa, cliente) {
  return {
    id: empresa.id,
    name: cliente?.name || empresa.nome || '',
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
    'SELECT id, nome, cnpj, cidade, estado, telefone FROM empresas WHERE id = @id',
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
    'SELECT id, nome, cnpj, cidade, estado, telefone, plano, status FROM empresas WHERE id = @id',
    { id: empresaId }
  );
  if (!empresa) return null;

  const cliente = await findCliente(db, empresa);
  const columns = {
    name: 'name', email: 'email', phone: 'phone', address: 'address', backupFrequency: 'backup_frequency',
  };

  if (cliente) {
    const sets = ['empresa_id = @empresaId'];
    const params = { id: cliente.id, empresaId: empresa.id };
    for (const [key, column] of Object.entries(columns)) {
      if (key in values) {
        sets.push(`${column} = @${key}`);
        params[key] = values[key];
      }
    }
    await db.query(`UPDATE clientes SET ${sets.join(', ')} WHERE id = @id`, params);
  } else {
    await db.query(
      `INSERT INTO clientes (id, name, city, state, email, phone, plano, status, empresa_id, address, backup_frequency)
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

  const empresaSets = ['data_atualizacao = GETDATE()'];
  const empresaParams = { id: empresa.id };
  if ('name' in values) { empresaSets.push('nome = @nome'); empresaParams.nome = values.name; }
  if ('phone' in values) { empresaSets.push('telefone = @telefone'); empresaParams.telefone = values.phone; }
  if (cnpj !== undefined) { empresaSets.push('cnpj = @cnpj'); empresaParams.cnpj = cnpj; }
  await db.query(`UPDATE empresas SET ${empresaSets.join(', ')} WHERE id = @id`, empresaParams);

  return loadUnitProfile(db, empresa.id);
}

module.exports = { findCliente, loadUnitProfile, saveUnitProfile };
