# criar-admin.ps1 - cria a empresa (buffet) e o primeiro usuário administrador no banco do Docker.
# Rode dentro da pasta deploy\docker, com os containers no ar (iniciar.ps1).
# Uso:
#   powershell -ExecutionPolicy Bypass -File .\criar-admin.ps1 -Email dono@buffet.com.br -Senha "SenhaForte123" -NomeEmpresa "Buffet Alegria" -NomeUsuario "Maria"
# Se a empresa já existir (mesmo nome), o usuário é criado nela. Se o e-mail já existir, nada é alterado.
param(
    [Parameter(Mandatory = $true)][string]$Email,
    [Parameter(Mandatory = $true)][string]$Senha,
    [Parameter(Mandatory = $true)][string]$NomeEmpresa,
    [string]$NomeUsuario = 'Administrador',
    [ValidateSet('admin', 'reception', 'game_master', 'master')][string]$Perfil = 'admin'
)
$ErrorActionPreference = 'Stop'
if ($Senha.Length -lt 8) { throw 'A senha precisa ter pelo menos 8 caracteres.' }

# O script Node vai para dentro do container como arquivo (passar código longo como argumento quebra no Windows).
$js = @'
const { Client } = require('pg');
const { randomUUID } = require('crypto');
const { hashSenha } = require('./utils/senhas');
(async () => {
  const email = process.env.ADM_EMAIL.trim().toLowerCase();
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    const existe = await c.query('SELECT 1 FROM login WHERE email = $1', [email]);
    if (existe.rowCount > 0) { console.log('Já existe um usuário com este e-mail. Nada foi alterado.'); return; }
    const emp = await c.query('SELECT "empresaId" FROM empresa WHERE nome = $1 LIMIT 1', [process.env.ADM_EMPRESA]);
    let empresaId;
    if (emp.rowCount > 0) {
      empresaId = emp.rows[0].empresaId;
    } else {
      empresaId = randomUUID();
      await c.query('INSERT INTO empresa ("empresaId", nome, plano, status) VALUES ($1, $2, $3, $4)',
        [empresaId, process.env.ADM_EMPRESA, 'professional', 'active']);
    }
    await c.query('INSERT INTO login ("loginId", "empresaId", email, senha, status, perfil, "nomeFamilia") VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [randomUUID(), empresaId, email, hashSenha(process.env.ADM_SENHA), 'active', process.env.ADM_PERFIL, process.env.ADM_NOME]);
    console.log('Usuário criado: ' + email + ' (perfil ' + process.env.ADM_PERFIL + ') na empresa ' + process.env.ADM_EMPRESA + '.');
  } finally {
    await c.end();
  }
})().catch(e => { console.error('Erro: ' + e.message); process.exit(1); });
'@

$arquivoLocal = Join-Path $env:TEMP 'pulyn-criar-admin.js'
[System.IO.File]::WriteAllText($arquivoLocal, $js, (New-Object System.Text.UTF8Encoding $false))
try {
    docker cp $arquivoLocal pulyn-backend:/app/criar-admin-tmp.js
    if ($LASTEXITCODE -ne 0) { throw 'Não consegui copiar o script para o container. Confira se o pulyn-backend está rodando.' }
    docker exec -e "ADM_EMAIL=$Email" -e "ADM_SENHA=$Senha" -e "ADM_EMPRESA=$NomeEmpresa" -e "ADM_NOME=$NomeUsuario" -e "ADM_PERFIL=$Perfil" pulyn-backend node criar-admin-tmp.js
    $codigo = $LASTEXITCODE
} finally {
    docker exec pulyn-backend rm -f /app/criar-admin-tmp.js 2>$null
    Remove-Item $arquivoLocal -ErrorAction SilentlyContinue
}
if ($codigo -ne 0) { throw 'Não foi possível criar o usuário. Veja a mensagem acima.' }
