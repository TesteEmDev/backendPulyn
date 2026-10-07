# 02-banco-producao.ps1 - cria o banco de producao (AdvPulyn) com uma copia dos dados do banco de trabalho
# (AdvPulynDev), cria o usuario pulyn_app e gera o .env de producao em C:\Pulyn\backend.
# Nao precisa de administrador. NAO sobrescreve um banco existente: para refazer a copia use -Recriar
# (faz um backup do banco de producao antes e pede confirmacao digitada).
param([switch]$Recriar)
. "$PSScriptRoot\config.ps1"
Exigir-Repo

$psql = Join-Path $PgBin 'psql.exe'
$pgDump = Join-Path $PgBin 'pg_dump.exe'
$pgRestore = Join-Path $PgBin 'pg_restore.exe'

Escrever-Passo 'Credenciais do PostgreSQL (do .env de desenvolvimento)'
$envDev = Join-Path $RepoBackend '.env'
$urlDev = Ler-Env $envDev 'DATABASE_URL'
$dev = if ($urlDev) { Ler-UrlPostgres $urlDev } else { $null }
if (-not $dev) { throw ('Nao achei DATABASE_URL em ' + $envDev + '.') }
if ($dev.Banco -ne $BancoOrigem) { Escrever-Aviso ('o banco do .env de desenvolvimento e "' + $dev.Banco + '", e a origem da copia sera "' + $BancoOrigem + '".') }
$env:PGPASSWORD = $dev.Senha
$conn = @('-h', $dev.Servidor, '-p', $dev.Porta, '-U', $dev.Usuario)
Escrever-Ok ($dev.Usuario + '@' + $dev.Servidor + ':' + $dev.Porta)

function Rodar-Sql($banco, $sql) {
    $arq = Join-Path $env:TEMP ('pulyn-' + [guid]::NewGuid().ToString('N') + '.sql')
    Gravar-TextoUtf8 $arq $sql
    try { & $psql @conn -d $banco -v ON_ERROR_STOP=1 -q -f $arq | Out-Null; Conferir-Saida ('Falha ao executar SQL em ' + $banco) }
    finally { Remove-Item $arq -ErrorAction SilentlyContinue }
}
function Consultar($banco, $sql) { return (& $psql @conn -d $banco -At -c $sql) }

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
    & $pgDump @conn -Fc -f $seg $BancoProd
    Conferir-Saida 'Falha no backup de seguranca'
    Escrever-Ok $seg
    Write-Host ''
    Write-Host ('    Isto vai APAGAR o banco "' + $BancoProd + '" (os dados de producao atuais) e refazer a copia.') -ForegroundColor Yellow
    $conf = Read-Host ('    Digite APAGAR ' + $BancoProd + ' para confirmar')
    if ($conf -cne ('APAGAR ' + $BancoProd)) { Write-Host 'Cancelado, nada foi apagado.'; return }
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

Escrever-Passo ('Copiando os dados de ' + $BancoOrigem)
$dump = Join-Path $Backups ($BancoOrigem + '-copia-' + $carimbo + '.dump')
& $pgDump @conn -Fc --no-owner --no-acl -f $dump $BancoOrigem
Conferir-Saida 'Falha ao ler o banco de origem'
# Tudo roda com o papel pulyn_app, entao o app e dono dos objetos (as migracoes do backend precisam disso).
& $pgRestore @conn -d $BancoProd --no-owner --no-acl --role=$UsuarioApp --single-transaction --exit-on-error $dump
Conferir-Saida 'Falha ao restaurar a copia (o banco de producao foi criado mas esta incompleto: rode de novo com -Recriar)'
Escrever-Ok ('copia gravada em ' + $dump)

Escrever-Passo 'Conferindo linha a linha (contagem por tabela)'
$sqlContagem = "select table_name || '=' || (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text " +
               "from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' and table_name not like 'sincronizacao%' order by 1"
$a = @(Consultar $BancoOrigem $sqlContagem)
$b = @(Consultar $BancoProd $sqlContagem)
$dif = Compare-Object $a $b
if ($dif) { $dif | ForEach-Object { Write-Host ('    ' + $_.SideIndicator + ' ' + $_.InputObject) }; throw 'A contagem de linhas difere entre origem e producao.' }
Escrever-Ok ([string]$a.Count + ' tabelas com a mesma quantidade de linhas')

Escrever-Passo 'Arquivo .env de producao'
$envProd = Join-Path $Backend '.env'
if (Test-Path $envProd) {
    # Mantem o JWT_SECRET e demais ajustes; so troca a conexao com o banco.
    $texto = Get-Content $envProd -Raw -Encoding UTF8
    $novaUrl = 'DATABASE_URL=postgresql://' + $UsuarioApp + ':' + $senhaApp + '@localhost:' + $dev.Porta + '/' + $BancoProd
    if ($texto -match '(?m)^DATABASE_URL=.*$') { $texto = [regex]::Replace($texto, '(?m)^DATABASE_URL=.*$', $novaUrl) } else { $texto += "`r`n" + $novaUrl + "`r`n" }
    Gravar-TextoUtf8 $envProd $texto
    Escrever-Ok 'DATABASE_URL atualizado no .env existente (o resto foi mantido)'
} else {
    $ip = Obter-IpLan
    $nuvemUrl = Ler-Env $envDev 'SYNC_NUVEM_URL'
    $nuvemSsl = Ler-Env $envDev 'SYNC_NUVEM_SSL'
    if (-not $nuvemSsl) { $nuvemSsl = 'true' }
    # Atencao: cada elemento com "+" precisa de parenteses (a virgula tem precedencia sobre o +).
    $linhas = @(
        ('# Producao (IIS). Gerado por 02-banco-producao.ps1 em ' + (Get-Date -Format 'yyyy-MM-dd HH:mm')),
        'NODE_ENV=production',
        ('PORT=' + $PortaBackend),
        'HOST=127.0.0.1',
        'DB_DRIVER=postgres',
        ('DATABASE_URL=postgresql://' + $UsuarioApp + ':' + $senhaApp + '@localhost:' + $dev.Porta + '/' + $BancoProd),
        'DB_SSL=false',
        ('JWT_SECRET=' + (Novo-Segredo 32)),
        ('FRONTEND_URL=https://' + $ip),
        '',
        '# Sincronizacao com a nuvem: so UM backend deve sincronizar com o Supabase.',
        '# Deixe 0 ate desligar a sincronizacao do ambiente de desenvolvimento (veja README-IIS.md).',
        'SYNC_ENABLED=0',
        'SYNC_INTERVALO_MS=15000'
    )
    if ($nuvemUrl) { $linhas += 'SYNC_NUVEM_URL=' + $nuvemUrl; $linhas += 'SYNC_NUVEM_SSL=' + $nuvemSsl }
    Gravar-TextoUtf8 $envProd (($linhas -join "`r`n") + "`r`n")
    Escrever-Ok ('criado ' + $envProd)
    Escrever-Aviso ('FRONTEND_URL ficou https://' + $ip + ' (IP atual desta maquina). Se o IP mudar, ajuste aqui.')
}
# Restringe o arquivo (tem senha do banco e segredo dos tokens): Administradores, SYSTEM e quem rodou este script.
# (SIDs em vez de nomes: o grupo se chama "Administradores" em Windows em portugues.)
& icacls $envProd /inheritance:r /grant:r '*S-1-5-32-544:(F)' '*S-1-5-18:(F)' ($env:USERNAME + ':(F)') | Out-Null
Conferir-Saida 'Nao consegui restringir o acesso ao .env'
$env:PGPASSWORD = $null

Write-Host ''
Write-Host 'Pronto. Proximo passo: 03-certificado.ps1 (como Administrador)' -ForegroundColor Green
