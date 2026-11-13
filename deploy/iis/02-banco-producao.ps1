# 02-banco-producao.ps1 - cria o banco de producao (AdvPulyn) com uma copia dos dados do banco de trabalho
# (AdvPulynDev), cria o usuario pulyn_app e gera o .env de producao em C:\Pulyn\backend.
# Nao precisa de administrador do Windows. NAO sobrescreve um banco existente: para refazer a copia use -Recriar
# (faz um backup do banco de producao antes e pede confirmacao digitada).
# O banco de producao fica no PostgreSQL DESTA maquina (localhost). Os dados saem do servidor do DATABASE_URL do .env de
# desenvolvimento: se ele for outra maquina da rede, o script le de la (so leitura) e grava aqui, usando o usuario
# administrador do PostgreSQL local (-AdminLocal, padrao postgres) - a senha e pedida, ou vem de PULYN_PG_ADMIN_SENHA.
#
# -BancoLimpo: instalacao de um buffet novo. NAO copia o desenvolvimento: cria o banco so com a estrutura (banco-base.sql),
# cadastra a empresa da Pulyn e o usuario master (-EmailMaster; a senha vem de PULYN_MASTER_SENHA ou e pedida) e gera o
# .env sem sincronizacao com a nuvem. Nao precisa do .env de desenvolvimento.
#
# -Confirmado: com -Recriar, nao pede a confirmacao digitada (o setup.exe ja perguntou na tela dele).
param([switch]$Recriar, [string]$AdminLocal = 'postgres', [int]$PortaLocal = 5432, [switch]$BancoLimpo, [string]$EmailMaster, [string]$Ip,
      [switch]$Confirmado)
. "$PSScriptRoot\config.ps1"
Exigir-Repo

$psql = Join-Path $PgBin 'psql.exe'
$pgDump = Join-Path $PgBin 'pg_dump.exe'
$pgRestore = Join-Path $PgBin 'pg_restore.exe'

if ($BancoLimpo) {
    $arquivoBase = Join-Path $PSScriptRoot 'banco-base.sql'
    if (-not (Test-Path $arquivoBase)) { throw ('Nao achei ' + $arquivoBase + ' (gere com gerar-banco-base.ps1).') }
    if (-not $EmailMaster) { $EmailMaster = Read-Host '    E-mail do usuario master' }
    $senhaMaster = $env:PULYN_MASTER_SENHA
    if (-not $senhaMaster) {
        $s1 = [Net.NetworkCredential]::new('', (Read-Host '    Senha do usuario master (minimo 6 caracteres)' -AsSecureString)).Password
        $s2 = [Net.NetworkCredential]::new('', (Read-Host '    Repita a senha do master' -AsSecureString)).Password
        if ($s1 -cne $s2) { throw 'As senhas do master nao conferem.' }
        $senhaMaster = $s1
    }
    if ($senhaMaster.Length -lt 6) { throw 'A senha do master precisa ter pelo menos 6 caracteres.' }
    $envDev = $null
    $dev = $null
    $connOrigem = $null
} else {
    Escrever-Passo 'Credenciais do PostgreSQL (do .env de desenvolvimento)'
    $envDev = Join-Path $RepoBackend '.env'
    $urlDev = Ler-Env $envDev 'DATABASE_URL'
    $dev = if ($urlDev) { Ler-UrlPostgres $urlDev } else { $null }
    if (-not $dev) { throw ('Nao achei DATABASE_URL em ' + $envDev + '.') }
    if ($dev.Banco -ne $BancoOrigem) { Escrever-Aviso ('o banco do .env de desenvolvimento e "' + $dev.Banco + '", e a origem da copia sera "' + $BancoOrigem + '".') }
    $connOrigem = @('-h', $dev.Servidor, '-p', $dev.Porta, '-U', $dev.Usuario)
    Escrever-Ok ('origem dos dados: ' + $dev.Usuario + '@' + $dev.Servidor + ':' + $dev.Porta)
}

# O servidor do desenvolvimento e esta maquina? Se nao, o banco de producao e criado aqui com o administrador local.
$enderecosLocais = @('localhost', '127.0.0.1', '::1') + @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | ForEach-Object { $_.IPAddress })
if ((-not $BancoLimpo) -and ($enderecosLocais -contains $dev.Servidor)) {
    $destino = $dev
    $connDestino = $connOrigem
} else {
    if ($BancoLimpo) { Escrever-Passo 'O banco sera criado no PostgreSQL desta maquina' }
    else { Escrever-Passo ('O banco de desenvolvimento esta em ' + $dev.Servidor + '. O de producao sera criado no PostgreSQL desta maquina') }
    $senhaAdmin = $env:PULYN_PG_ADMIN_SENHA
    if (-not $senhaAdmin) {
        $seguro = Read-Host ('    Senha do usuario "' + $AdminLocal + '" do PostgreSQL local') -AsSecureString
        $senhaAdmin = [Net.NetworkCredential]::new('', $seguro).Password
    }
    $destino = @{ Usuario = $AdminLocal; Senha = $senhaAdmin; Servidor = 'localhost'; Porta = [string]$PortaLocal }
    $connDestino = @('-h', 'localhost', '-p', [string]$PortaLocal, '-U', $AdminLocal)
    Escrever-Ok ('destino: ' + $AdminLocal + '@localhost:' + $PortaLocal)
}
# O PGPASSWORD vale por comando: troca a senha conforme o servidor que vai ser usado.
function Usar-Origem  { $env:PGPASSWORD = $dev.Senha }
function Usar-Destino { $env:PGPASSWORD = $destino.Senha }

function Rodar-Sql($banco, $sql) {
    $arq = Join-Path $env:TEMP ('pulyn-' + [guid]::NewGuid().ToString('N') + '.sql')
    Gravar-TextoUtf8 $arq $sql
    Usar-Destino
    try { & $psql @connDestino -d $banco -v ON_ERROR_STOP=1 -q -f $arq | Out-Null; Conferir-Saida ('Falha ao executar SQL em ' + $banco) }
    finally { Remove-Item $arq -ErrorAction SilentlyContinue }
}
function Consultar($banco, $sql) { Usar-Destino; return (& $psql @connDestino -d $banco -At -c $sql) }
function Consultar-Origem($banco, $sql) { Usar-Origem; return (& $psql @connOrigem -d $banco -At -c $sql) }

foreach ($p in $Raiz, $Backend, $Backups) { if (-not (Test-Path $p)) { New-Item -ItemType Directory -Path $p | Out-Null } }

$existe = Consultar 'postgres' ("select 1 from pg_database where datname = '" + $BancoProd + "'")
$carimbo = Get-Date -Format 'yyyyMMdd-HHmmss'

if ($existe -and -not $Recriar) {
    throw ('O banco "' + $BancoProd + '" ja existe. Nao vou sobrescrever. Se quer refazer a copia a partir de "' + $BancoOrigem + '", rode com -Recriar.')
}
if (-not $existe -and $Recriar) { Escrever-Aviso 'o banco de producao nao existia; -Recriar ignorado.' }

if ($existe -and $Recriar) {
    Escrever-Passo 'Recriar: backup de seguranca do banco de producao atual'
    $seg = Join-Path $Backups ($BancoProd + '-antes-de-recriar-' + $carimbo + '.dump')
    Usar-Destino
    & $pgDump @connDestino -Fc -f $seg $BancoProd
    Conferir-Saida 'Falha no backup de seguranca'
    Escrever-Ok $seg
    if (-not $Confirmado) {
        Write-Host ''
        Write-Host ('    Isto vai APAGAR o banco "' + $BancoProd + '" (os dados de producao atuais) e refazer a copia.') -ForegroundColor Yellow
        $conf = Read-Host ('    Digite APAGAR ' + $BancoProd + ' para confirmar')
        if ($conf -cne ('APAGAR ' + $BancoProd)) { Write-Host 'Cancelado, nada foi apagado.'; return }
    }
    Rodar-Sql 'postgres' ('select pg_terminate_backend(pid) from pg_stat_activity where datname = ''' + $BancoProd + ''' and pid <> pg_backend_pid(); drop database "' + $BancoProd + '";')
    Escrever-Ok 'banco antigo removido'
}

Escrever-Passo ('Usuario ' + $UsuarioApp + ' e banco ' + $BancoProd)
$senhaApp = Novo-Segredo 20
$usuarioExiste = Consultar 'postgres' ("select 1 from pg_roles where rolname = '" + $UsuarioApp + "'")
if ($usuarioExiste) {
    Rodar-Sql 'postgres' ('alter role ' + $UsuarioApp + ' login password ''' + $senhaApp + ''';')
    Escrever-Ok 'usuario ja existia: senha trocada'
} else {
    Rodar-Sql 'postgres' ('create role ' + $UsuarioApp + ' login password ''' + $senhaApp + ''';')
    Escrever-Ok 'usuario criado'
}
Rodar-Sql 'postgres' ('create database "' + $BancoProd + '" owner ' + $UsuarioApp + ' encoding ''UTF8'';')
Escrever-Ok 'banco criado'

if ($BancoLimpo) {
    Escrever-Passo 'Criando a estrutura do banco (sem dados)'
    # Aplica como pulyn_app (dono do banco), numa transacao so: se algo falhar, o banco fica vazio e da para rodar com -Recriar.
    $env:PGPASSWORD = $senhaApp
    try {
        & $psql -h localhost -p ([string]$destino.Porta) -U $UsuarioApp -d $BancoProd -v ON_ERROR_STOP=1 -q -1 -f $arquivoBase | Out-Null
        Conferir-Saida 'Falha ao criar a estrutura do banco (rode de novo com -Recriar)'
        $qtdTabelas = & $psql -h localhost -p ([string]$destino.Porta) -U $UsuarioApp -d $BancoProd -At -c "select count(*) from information_schema.tables where table_schema = 'public'"
    } finally { $env:PGPASSWORD = $null }
    Escrever-Ok ([string]$qtdTabelas + ' tabelas criadas')

    Escrever-Passo 'Usuario master'
    $env:DATABASE_URL = 'postgresql://' + $UsuarioApp + ':' + $senhaApp + '@localhost:' + $destino.Porta + '/' + $BancoProd
    $env:MASTER_EMAIL = $EmailMaster
    $env:MASTER_SENHA = $senhaMaster
    try {
        & node (Join-Path $PSScriptRoot 'criar-master.js')
        Conferir-Saida 'Nao consegui criar o usuario master'
    } finally { Remove-Item Env:\DATABASE_URL, Env:\MASTER_EMAIL, Env:\MASTER_SENHA -ErrorAction SilentlyContinue }
    $senhaMaster = $null
} else {
Escrever-Passo ('Copiando os dados de ' + $BancoOrigem)
$dump = Join-Path $Backups ($BancoOrigem + '-copia-' + $carimbo + '.dump')
Usar-Origem
& $pgDump @connOrigem -Fc --no-owner --no-acl -f $dump $BancoOrigem
Conferir-Saida 'Falha ao ler o banco de origem'
# Tudo roda com o papel pulyn_app, entao o app e dono dos objetos (as migracoes do backend precisam disso).
Usar-Destino
& $pgRestore @connDestino -d $BancoProd --no-owner --no-acl --role=$UsuarioApp --single-transaction --exit-on-error $dump
Conferir-Saida 'Falha ao restaurar a copia (o banco de producao foi criado mas esta incompleto: rode de novo com -Recriar)'
Escrever-Ok ('copia gravada em ' + $dump)

Escrever-Passo 'Conferindo linha a linha (contagem por tabela)'
$sqlContagem = "select table_name || '=' || (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text " +
               "from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' and table_name not like 'sincronizacao%' order by 1"
$a = @(Consultar-Origem $BancoOrigem $sqlContagem)
$b = @(Consultar $BancoProd $sqlContagem)
$dif = Compare-Object $a $b
if ($dif) { $dif | ForEach-Object { Write-Host ('    ' + $_.SideIndicator + ' ' + $_.InputObject) }; throw 'A contagem de linhas difere entre origem e producao.' }
Escrever-Ok ([string]$a.Count + ' tabelas com a mesma quantidade de linhas')
}

Escrever-Passo 'Arquivo .env de producao'
$envProd = Join-Path $Backend '.env'
if (Test-Path $envProd) {
    # Mantem o JWT_SECRET e demais ajustes; so troca a conexao com o banco.
    $texto = Get-Content $envProd -Raw -Encoding UTF8
    $novaUrl = 'DATABASE_URL=postgresql://' + $UsuarioApp + ':' + $senhaApp + '@localhost:' + $destino.Porta + '/' + $BancoProd
    if ($texto -match '(?m)^DATABASE_URL=.*$') { $texto = [regex]::Replace($texto, '(?m)^DATABASE_URL=.*$', $novaUrl) } else { $texto += "`r`n" + $novaUrl + "`r`n" }
    Gravar-TextoUtf8 $envProd $texto
    Escrever-Ok 'DATABASE_URL atualizado no .env existente (o resto foi mantido)'
    $acrescentadas = Completar-Env $envProd
    if ($acrescentadas -gt 0) { Escrever-Ok ([string]$acrescentadas + ' chave(s) que faltavam acrescentadas no fim, com o valor padrao') }
} else {
    $ip = if ($Ip) { $Ip } else { Obter-IpLan }
    # Todas as chaves vao para o arquivo; as que nao sao geradas aqui ficam vazias ou com o padrao, prontas para preencher.
    $valores = @{
        DATABASE_URL = 'postgresql://' + $UsuarioApp + ':' + $senhaApp + '@localhost:' + $destino.Porta + '/' + $BancoProd
        JWT_SECRET   = Novo-Segredo 32
        FRONTEND_URL = 'https://' + $ip
    }
    # Buffet novo (banco limpo) nao herda a nuvem do desenvolvimento: os dados dele iriam para o Supabase da Pulyn.
    $nuvemUrl = if ($envDev) { Ler-Env $envDev 'SYNC_NUVEM_URL' } else { $null }
    $nuvemSsl = if ($envDev) { Ler-Env $envDev 'SYNC_NUVEM_SSL' } else { $null }
    if ($nuvemUrl) { $valores.SYNC_NUVEM_URL = $nuvemUrl }
    if ($nuvemSsl) { $valores.SYNC_NUVEM_SSL = $nuvemSsl }
    Gravar-TextoUtf8 $envProd (Montar-Env $valores ('# Producao (IIS). Gerado por 02-banco-producao.ps1 em ' + (Get-Date -Format 'dd/MM/yyyy HH:mm')))
    Escrever-Ok ('criado ' + $envProd + ' (todas as chaves; e-mail e nuvem ficam vazios, para preencher depois)')
    Escrever-Aviso ('FRONTEND_URL ficou https://' + $ip + ' (IP atual desta maquina). Se o IP mudar, ajuste aqui.')
}
# Restringe o arquivo (tem senha do banco e segredo dos tokens): Administradores, SYSTEM e quem rodou este script.
# (SIDs em vez de nomes: o grupo se chama "Administradores" em Windows em portugues.)
& icacls $envProd /inheritance:r /grant:r '*S-1-5-32-544:(F)' '*S-1-5-18:(F)' ($env:USERNAME + ':(F)') | Out-Null
Conferir-Saida 'Nao consegui restringir o acesso ao .env'
$env:PGPASSWORD = $null

Write-Host ''
Write-Host 'Pronto. Proximo passo: 03-certificado.ps1 (como Administrador)' -ForegroundColor Green
