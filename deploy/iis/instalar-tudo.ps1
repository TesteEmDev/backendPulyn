# instalar-tudo.ps1 - instalacao completa do Pulyn numa maquina Windows (Administrador). E o que o setup.exe roda.
# Faz, na ordem do guia de instalacao:
#   1. confere o Windows (precisa ter IIS: Pro, Enterprise ou Server)
#   2. instala o Node.js e o PostgreSQL 18, se ainda nao estiverem instalados
#   3. 01-preparar-iis.ps1   (IIS, WebSocket, URL Rewrite, ARR)
#   4. 02-banco-producao.ps1 -BancoLimpo (banco so com a estrutura + usuario master + .env)
#   5. 03-certificado.ps1    (CA propria e certificado HTTPS com o IP)
#   6. 04-publicar.ps1 -SemBuild (frontend ja compilado, backend com as dependencias ja inclusas)
#   7. backup diario as 03:00
# Se o Pulyn ja estiver instalado (existe C:\Pulyn\backend\.env), vira uma ATUALIZACAO: faz backup do banco e republica,
# sem mexer no banco, no .env nem no certificado.
#
# Parametros:
#   -Ip            IP fixo da maquina na rede do buffet (padrao: detectado)
#   -EmailMaster   e-mail do usuario master (so na instalacao nova)
#   -Terceiros     pasta com os instaladores (Node .msi, PostgreSQL .exe, URL Rewrite, ARR, WinSW)
#   -SiteBuild     pasta com o frontend ja compilado
#   -SemPausa      nao espera Enter no final
# Senhas (por variavel de ambiente, nunca na linha de comando):
#   PULYN_PG_ADMIN_SENHA  senha do usuario postgres (a que ja existe, ou a que sera criada na instalacao do PostgreSQL)
#   PULYN_MASTER_SENHA    senha do usuario master
#   -Modo          Instalar ou Atualizar (o que a pessoa escolheu no setup). Sem ele, decide sozinho pelo .env.
param(
    [string]$Ip,
    [string]$EmailMaster,
    [string]$Terceiros,
    [string]$SiteBuild,
    [ValidateSet('', 'Instalar', 'Atualizar')][string]$Modo = '',
    [switch]$SemPausa
)
. "$PSScriptRoot\config.ps1"
Exigir-Admin
Exigir-Repo
try { $Host.UI.RawUI.WindowTitle = 'Pulyn - instalacao' } catch { }

foreach ($p in $Raiz, $Logs, $Instaladores) { if (-not (Test-Path $p)) { New-Item -ItemType Directory -Path $p | Out-Null } }
$log = Join-Path $Logs ('instalacao-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.log')
Start-Transcript -Path $log -Append | Out-Null

$envProdArquivo = Join-Path $Backend '.env'
$atualizacao = Test-Path $envProdArquivo
$modoErrado = $null
if ($Modo -eq 'Instalar' -and $atualizacao) { $modoErrado = 'O Pulyn ja esta instalado neste computador. Para publicar uma versao nova, escolha Atualizar.' }
if ($Modo -eq 'Atualizar' -and -not $atualizacao) { $modoErrado = 'O Pulyn nao esta instalado neste computador (falta ' + $envProdArquivo + '). Escolha Primeira instalacao.' }
# Atualizacao sem -Ip: usa o endereco que o sistema ja usa (FRONTEND_URL), para o certificado continuar o mesmo.
if ($atualizacao -and -not $Ip) {
    $urlFront = Ler-Env $envProdArquivo 'FRONTEND_URL'
    if ($urlFront -match '^https?://(\d{1,3}(\.\d{1,3}){3})') { $Ip = $Matches[1] }
}
$totalPassos = if ($atualizacao) { 6 } else { 7 }
$passo = 0
function Proximo-Passo($texto) {
    $script:passo++
    Write-Host ''
    Write-Host ('[' + $script:passo + '/' + $totalPassos + '] ' + $texto) -ForegroundColor Magenta
}
function Atualizar-Path {
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}
function Achar-Arquivo($pasta, $filtro) {
    if (-not $pasta -or -not (Test-Path $pasta)) { return $null }
    return Get-ChildItem $pasta -Filter $filtro -File | Sort-Object Name -Descending | Select-Object -First 1
}

$sucesso = $false
try {
    if ($modoErrado) { throw $modoErrado }
    Write-Host ''
    if ($atualizacao) {
        Write-Host 'ATUALIZACAO do Pulyn: publica so a versao nova do sistema.' -ForegroundColor Cyan
        Write-Host 'Nao reinstala Node.js, PostgreSQL nem IIS; o banco, as senhas e o certificado ficam como estao.' -ForegroundColor Cyan
    }
    else { Write-Host 'Instalacao nova do Pulyn.' -ForegroundColor Cyan }
    Write-Host ('Registro desta instalacao: ' + $log)

    # ------------------------------------------------------------------ 1
    Proximo-Passo 'Conferindo o Windows'
    $iis = Get-WindowsOptionalFeature -Online -FeatureName 'IIS-WebServerRole' -ErrorAction SilentlyContinue
    if (-not $iis) { throw 'Este Windows nao tem IIS (edicao Home?). O Pulyn precisa do Windows Pro, Enterprise ou Server.' }
    if (-not $Ip) { $Ip = Obter-IpLan }
    if ($Ip -notmatch '^\d{1,3}(\.\d{1,3}){3}$') { throw ('IP invalido: ' + $Ip) }
    Escrever-Ok ('Windows com IIS; IP do servidor: ' + $Ip)

    # ------------------------------------------------------------------ 2
    Atualizar-Path
    $psql = Join-Path $PgBin 'psql.exe'
    if ($atualizacao) {
        # Atualizacao: Node.js e PostgreSQL ja estao instalados (o setup nem traz os instaladores deles); so confere.
        Proximo-Passo 'Conferindo o Node.js e o PostgreSQL (ja instalados)'
        if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'O Node.js nao esta instalado neste computador. Reinstale o Node.js LTS e rode a atualizacao de novo.' }
        if (-not (Test-Path $psql)) { throw ('O PostgreSQL nao esta em ' + $PgBin + '.') }
        Escrever-Ok ('Node.js ' + (& node -v) + ' e PostgreSQL 18')
    } else {
    Proximo-Passo 'Node.js e PostgreSQL'
    if (Get-Command node -ErrorAction SilentlyContinue) {
        Escrever-Ok ('Node.js ja instalado: ' + (& node -v))
    } else {
        $msi = Achar-Arquivo $Terceiros 'node-v*-x64.msi'
        if (-not $msi) { throw 'Node.js nao esta instalado e o instalador dele nao veio no pacote.' }
        Write-Host ('    instalando ' + $msi.Name + '...')
        $proc = Start-Process msiexec.exe -ArgumentList @('/i', ('"' + $msi.FullName + '"'), '/qn', '/norestart') -Wait -PassThru
        if ($proc.ExitCode -ne 0 -and $proc.ExitCode -ne 3010) { throw ('Node.js: a instalacao falhou (codigo ' + $proc.ExitCode + ')') }
        Atualizar-Path
        if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js instalado, mas o comando node nao apareceu. Reinicie o computador e rode o instalador de novo.' }
        Escrever-Ok ('Node.js instalado: ' + (& node -v))
    }

    if (Test-Path $psql) {
        Escrever-Ok ('PostgreSQL ja instalado em ' + $PgBin)
    } else {
        if ($atualizacao) { throw ('O Pulyn esta instalado, mas o PostgreSQL nao esta em ' + $PgBin + '.') }
        $exe = Achar-Arquivo $Terceiros 'postgresql-18*-windows-x64.exe'
        if (-not $exe) { throw 'PostgreSQL 18 nao esta instalado e o instalador dele nao veio no pacote.' }
        if (-not $env:PULYN_PG_ADMIN_SENHA) { throw 'Falta a senha do postgres (PULYN_PG_ADMIN_SENHA).' }
        Write-Host ('    instalando ' + $exe.Name + ' (alguns minutos)...')
        # A senha vai num arquivo de opcoes temporario (so administradores leem), nao na linha de comando.
        $opcoes = Join-Path $env:TEMP ('pulyn-pg-' + [guid]::NewGuid().ToString('N') + '.txt')
        Gravar-TextoUtf8 $opcoes ('superpassword=' + $env:PULYN_PG_ADMIN_SENHA + "`n")
        & icacls $opcoes /inheritance:r /grant:r '*S-1-5-32-544:(F)' '*S-1-5-18:(F)' | Out-Null
        try {
            $argumentosPg = @('--mode', 'unattended', '--unattendedmodeui', 'none', '--optionfile', ('"' + $opcoes + '"'),
                              '--serverport', '5432', '--servicename', $PgServico, '--disable-components', 'pgAdmin,stackbuilder')
            $proc = Start-Process $exe.FullName -ArgumentList $argumentosPg -Wait -PassThru
        } finally { Remove-Item $opcoes -Force -ErrorAction SilentlyContinue }
        if ($proc.ExitCode -ne 0) { throw ('PostgreSQL: a instalacao falhou (codigo ' + $proc.ExitCode + '). Veja os logs em ' + $env:TEMP + ' (install-postgresql.log).') }
        if (-not (Test-Path $psql)) { throw ('PostgreSQL instalado, mas nao achei ' + $psql) }
        Escrever-Ok 'PostgreSQL 18 instalado'
    }
    }
    $svcPg = Get-Service $PgServico -ErrorAction SilentlyContinue
    if ($svcPg -and $svcPg.Status -ne 'Running') { Start-Service $PgServico; Escrever-Ok ($PgServico + ' iniciado') }

    if (-not $atualizacao) {
        # Confere a senha do postgres agora, antes de mexer no IIS (erro de senha e o mais comum).
        if (-not $env:PULYN_PG_ADMIN_SENHA) { throw 'Falta a senha do postgres (PULYN_PG_ADMIN_SENHA).' }
        $env:PGPASSWORD = $env:PULYN_PG_ADMIN_SENHA
        # (no PowerShell 5.1, o que o psql escreve no stderr vira excecao: senha errada cai no catch)
        try { $teste = & $psql -h localhost -p 5432 -U postgres -d postgres -At -c 'select 1' 2>$null } catch { $teste = $null } finally { $env:PGPASSWORD = $null }
        if ($teste -ne '1') { throw 'Nao consegui entrar no PostgreSQL com o usuario postgres. Confira a senha do postgres e rode o instalador de novo.' }
        Escrever-Ok 'senha do postgres conferida'
    }

    # Instaladores do IIS e do servico: o 01 e o 04 usam os de C:\Pulyn\instaladores em vez de baixar.
    foreach ($nome in 'rewrite_amd64_en-US.msi', 'requestRouter_amd64.msi', 'WinSW-x64.exe') {
        $origem = if ($Terceiros) { Join-Path $Terceiros $nome } else { $null }
        if ($origem -and (Test-Path $origem) -and -not (Test-Path (Join-Path $Instaladores $nome))) { Copy-Item $origem $Instaladores }
    }

    # ------------------------------------------------------------------ 3
    # Na atualizacao o IIS ja esta pronto (o 04 confere o URL Rewrite de qualquer forma).
    if (-not $atualizacao) {
        Proximo-Passo 'Preparando o IIS'
        & "$PSScriptRoot\01-preparar-iis.ps1" -Sim
    }

    # ------------------------------------------------------------------ 4
    if ($atualizacao) {
        Proximo-Passo 'Backup do banco antes de atualizar (os dados nao sao alterados)'
        & "$PSScriptRoot\backup-banco.ps1"
    } else {
        Proximo-Passo 'Criando o banco de dados'
        if (-not $EmailMaster) { throw 'Falta o e-mail do usuario master.' }
        # Banco que sobrou de uma instalacao que parou no meio (sem .env): o 02 recria, mas so depois de um backup
        # e de a pessoa digitar a confirmacao.
        $env:PGPASSWORD = $env:PULYN_PG_ADMIN_SENHA
        try { $bancoExiste = & $psql -h localhost -p 5432 -U postgres -d postgres -At -c ("select 1 from pg_database where datname = '" + $BancoProd + "'") 2>$null } catch { $bancoExiste = $null } finally { $env:PGPASSWORD = $null }
        if ($bancoExiste -eq '1') {
            Escrever-Aviso ('o banco ' + $BancoProd + ' ja existe, mas o Pulyn nao terminou de ser instalado. Ele sera recriado vazio.')
            & "$PSScriptRoot\02-banco-producao.ps1" -BancoLimpo -Recriar -EmailMaster $EmailMaster -Ip $Ip
        } else {
            & "$PSScriptRoot\02-banco-producao.ps1" -BancoLimpo -EmailMaster $EmailMaster -Ip $Ip
        }
        if (-not (Test-Path (Join-Path $Backend '.env'))) { throw 'O banco nao foi criado (o .env nao apareceu).' }
    }

    # ------------------------------------------------------------------ 5
    Proximo-Passo $(if ($atualizacao) { 'Certificado HTTPS (o atual continua valendo)' } else { 'Certificado HTTPS' })
    & "$PSScriptRoot\03-certificado.ps1" -Ip $Ip

    # ------------------------------------------------------------------ 6
    Proximo-Passo $(if ($atualizacao) { 'Publicando a versao nova' } else { 'Publicando o sistema' })
    # Frontend ja compilado no pacote.
    if (-not $SiteBuild -or -not (Test-Path (Join-Path $SiteBuild 'index.html'))) { throw 'O frontend compilado nao veio no pacote.' }
    $destinoBuild = Join-Path $Raiz 'site-build'
    & robocopy $SiteBuild $destinoBuild /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { throw ('copia do frontend falhou (codigo ' + $LASTEXITCODE + ')') }
    $global:LASTEXITCODE = 0
    # Dependencias do backend ja vem no pacote: o 04 ve a marca e nao precisa de internet para o npm.
    $nmPacote = Join-Path $RepoBackend 'node_modules'
    if (Test-Path $nmPacote) {
        if (-not (Test-Path $Backend)) { New-Item -ItemType Directory -Path $Backend | Out-Null }
        $svc = Get-Service $NomeServico -ErrorAction SilentlyContinue
        if ($svc -and $svc.Status -ne 'Stopped') { Stop-Service $NomeServico -Force; $svc.WaitForStatus('Stopped', '00:00:30') }
        & robocopy $nmPacote (Join-Path $Backend 'node_modules') /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
        if ($LASTEXITCODE -ge 8) { throw ('copia das dependencias do backend falhou (codigo ' + $LASTEXITCODE + ')') }
        $global:LASTEXITCODE = 0
        $hash = (Get-FileHash (Join-Path $RepoBackend 'package-lock.json') -Algorithm SHA256).Hash
        Gravar-TextoUtf8 (Join-Path $Backend 'node_modules\.pulyn-lock-hash') $hash
        Escrever-Ok 'dependencias do backend copiadas'
    }
    & "$PSScriptRoot\04-publicar.ps1" -SemBuild

    # ------------------------------------------------------------------ 7
    Proximo-Passo 'Backup diario'
    & "$PSScriptRoot\backup-banco.ps1" -Agendar

    $sucesso = $true
    Write-Host ''
    Write-Host '==================================================================' -ForegroundColor Green
    Write-Host (' Pulyn ' + $(if ($atualizacao) { 'atualizado' } else { 'instalado' }) + '. Acesse: https://' + $Ip + '/') -ForegroundColor Green
    Write-Host '==================================================================' -ForegroundColor Green
    if ($atualizacao) {
        Write-Host 'Tablets, celulares e placas continuam funcionando sem mudar nada.'
    } else {
        Write-Host ('Tablets e celulares: instale o certificado ' + (Join-Path $Certs 'PulynCA.cer') + ' (guia, secao 6).')
        Write-Host ('O IP ' + $Ip + ' precisa ficar fixo (reserva no roteador).')
        Write-Host ('Entre com o master (' + $EmailMaster + ') e cadastre o buffet em Master > Clientes.')
    }
} catch {
    Write-Host ''
    Write-Host ('ERRO: ' + $_.Exception.Message) -ForegroundColor Red
    Write-Host ('A instalacao parou. O registro completo esta em ' + $log) -ForegroundColor Yellow
    Write-Host 'Corrija o problema e rode o instalador de novo: o que ja foi feito e reaproveitado.' -ForegroundColor Yellow
} finally {
    Stop-Transcript | Out-Null
}

if (-not $SemPausa) { Read-Host 'Pressione Enter para fechar' | Out-Null }
if ($sucesso) { exit 0 } else { exit 1 }
