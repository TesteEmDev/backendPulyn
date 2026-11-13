# atualizar-github.ps1 - atualiza o Pulyn deste computador puxando do GitHub so o que mudou (como o atualizar.ps1 da
# maquina de desenvolvimento). E o que o atalho "Atualizar Pulyn" e a opcao "Atualizar pela internet" do setup rodam.
#   1. git pull (fetch + reset) da branch main dos dois repositorios em C:\Pulyn\fonte (na primeira vez, clona)
#   2. se nada mudou, avisa e para (use -Forcar para publicar mesmo assim)
#   3. instala as dependencias do frontend so se o package-lock.json mudou
#   4. roda o atualizar.ps1 que veio do GitHub: backup do banco + 04-publicar.ps1 (build das telas e publicacao)
# Precisa de internet. O banco, o .env, as senhas e o certificado nao mudam.
#
#   -Branch      branch dos dois repositorios (padrao: main)
#   -Forcar      publica mesmo sem mudancas
#   -MinGitZip   MinGit (.zip) para instalar o Git em C:\Pulyn\git se ele ainda nao existir (o setup passa este arquivo)
#   -SemPausa    nao espera Enter no final
param(
    [string]$Branch = 'main',
    [switch]$Forcar,
    [string]$MinGitZip,
    [switch]$SemPausa,
    [string]$RepoBackUrl = 'https://github.com/TesteEmDev/backendPulyn.git',
    [string]$RepoFrontUrl = 'https://github.com/TesteEmDev/frontenPulyn.git'
)
. "$PSScriptRoot\config.ps1"

# Atalho da area de trabalho: pede administrador sozinho.
$id = [Security.Principal.WindowsIdentity]::GetCurrent()
if (-not ([Security.Principal.WindowsPrincipal]$id).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    $argumentos = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $PSCommandPath + '"'))
    foreach ($p in $PSBoundParameters.GetEnumerator()) {
        if ($p.Value -is [switch]) { if ($p.Value) { $argumentos += ('-' + $p.Key) } }
        else { $argumentos += ('-' + $p.Key); $argumentos += ('"' + $p.Value + '"') }
    }
    Start-Process powershell.exe -Verb RunAs -ArgumentList $argumentos
    exit 0
}
try { $Host.UI.RawUI.WindowTitle = 'Pulyn - atualizacao pelo GitHub' } catch { }

foreach ($p in $Raiz, $Logs) { if (-not (Test-Path $p)) { New-Item -ItemType Directory -Path $p | Out-Null } }
$log = Join-Path $Logs ('atualizacao-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.log')
Start-Transcript -Path $log -Append | Out-Null
$fonte = Join-Path $Raiz 'fonte'
$sucesso = $false

function Achar-Git {
    $local = Join-Path $Raiz 'git\cmd\git.exe'
    if (Test-Path $local) { return $local }
    $cmd = Get-Command git -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    return $null
}

# Deixa a pasta igual a branch do GitHub e devolve o commit de antes e o de depois.
function Sincronizar($git, $pasta, $url) {
    $antes = $null
    $arvoreAntes = $null
    if (-not (Test-Path (Join-Path $pasta '.git'))) {
        if (Test-Path $pasta) { Remove-Item $pasta -Recurse -Force }
        Write-Host ('    baixando ' + $url + ' (primeira vez)...')
        & $git clone --quiet --depth 1 --single-branch --branch $Branch $url $pasta
        Conferir-Saida ('Nao consegui baixar ' + $url + ' (confira a internet)')
    } else {
        $antes = (& $git -C $pasta rev-parse HEAD).Trim()
        $arvoreAntes = (& $git -C $pasta rev-parse 'HEAD^{tree}').Trim()
        & $git -C $pasta fetch --quiet --depth 1 origin $Branch
        Conferir-Saida ('Nao consegui buscar as mudancas de ' + $url + ' (confira a internet)')
        & $git -C $pasta reset --quiet --hard FETCH_HEAD
        Conferir-Saida 'git reset falhou'
        # Tira arquivos soltos que nao estao no GitHub (node_modules fica: ele e ignorado pelo git).
        & $git -C $pasta clean -q -fd
    }
    $depois = (& $git -C $pasta rev-parse HEAD).Trim()
    $arvoreDepois = (& $git -C $pasta rev-parse 'HEAD^{tree}').Trim()
    # Mudou = o CONTEUDO mudou (um merge sem alteracao gera commit novo com os mesmos arquivos).
    $mudou = (-not $antes) -or ($arvoreAntes -ne $arvoreDepois)
    return @{ Antes = $antes; Depois = $depois; Mudou = $mudou }
}

function Resumo($git, $pasta, $nome, $r) {
    $curto = $r.Depois.Substring(0, 7)
    if (-not $r.Antes) { Escrever-Ok ($nome + ': ' + $curto + ' (baixado agora)'); return }
    if (-not $r.Mudou) { Escrever-Ok ($nome + ': ' + $curto + ' (sem mudancas)'); return }
    $stat = ''
    try { $stat = (& $git -C $pasta diff --shortstat $r.Antes $r.Depois 2>$null) } catch { $stat = '' }
    Escrever-Ok ($nome + ': ' + $r.Antes.Substring(0, 7) + ' -> ' + $curto + $(if ($stat) { ' (' + $stat.Trim() + ')' } else { '' }))
}

try {
    Write-Host ''
    Write-Host ('ATUALIZACAO do Pulyn pelo GitHub (branch ' + $Branch + '): baixa so o que mudou e publica.') -ForegroundColor Cyan
    Write-Host 'O banco, as senhas e o certificado ficam como estao.' -ForegroundColor Cyan
    Write-Host ('Registro: ' + $log)
    if (-not (Test-Path (Join-Path $Backend '.env'))) { throw 'O Pulyn nao esta instalado neste computador (falta C:\Pulyn\backend\.env). Use a Primeira instalacao do setup.' }

    Escrever-Passo 'Git'
    $git = Achar-Git
    if (-not $git) {
        if (-not $MinGitZip -or -not (Test-Path $MinGitZip)) { throw 'O Git nao esta instalado. Rode o setup do Pulyn e escolha "Atualizar pela internet" (ele instala o Git).' }
        Expand-Archive -Path $MinGitZip -DestinationPath (Join-Path $Raiz 'git') -Force
        $git = Achar-Git
        if (-not $git) { throw 'Nao consegui instalar o Git em C:\Pulyn\git.' }
    }
    Escrever-Ok ((& $git --version) + ' em ' + $git)

    Escrever-Passo 'Buscando as mudancas no GitHub'
    if (-not (Test-Path $fonte)) { New-Item -ItemType Directory -Path $fonte | Out-Null }
    $back = Sincronizar $git (Join-Path $fonte 'BackEnd') $RepoBackUrl
    $front = Sincronizar $git (Join-Path $fonte 'FrontEnd') $RepoFrontUrl
    Resumo $git (Join-Path $fonte 'BackEnd') 'BackEnd' $back
    Resumo $git (Join-Path $fonte 'FrontEnd') 'FrontEnd' $front

    $semMudanca = (-not $back.Mudou) -and (-not $front.Mudou)
    if ($semMudanca -and -not $Forcar) {
        Write-Host ''
        Write-Host 'O Pulyn ja esta na versao mais nova do GitHub. Nada foi alterado.' -ForegroundColor Green
        throw 'SEM_MUDANCAS'
    }

    $atualizarRepo = Join-Path $fonte 'BackEnd\deploy\iis\atualizar.ps1'
    if (-not (Test-Path $atualizarRepo)) { throw ('A branch ' + $Branch + ' do GitHub nao tem deploy\iis\atualizar.ps1.') }

    Escrever-Passo 'Dependencias das telas'
    $repoFront = Join-Path $fonte 'FrontEnd'
    $lock = Join-Path $repoFront 'package-lock.json'
    $marca = Join-Path $repoFront 'node_modules\.pulyn-lock-hash'
    $hash = (Get-FileHash $lock -Algorithm SHA256).Hash
    if ((Test-Path $marca) -and ((Get-Content $marca -Raw).Trim() -eq $hash)) {
        Escrever-Ok 'ja estavam em dia'
    } else {
        Write-Host '    instalando (na primeira vez pode levar alguns minutos)...'
        $logNpm = Join-Path $Logs 'npm-frontend.log'
        Push-Location $repoFront
        try {
            & cmd.exe /c ('npm.cmd ci --no-audit --no-fund > "' + $logNpm + '" 2>&1')
            if ($LASTEXITCODE -ne 0) { Get-Content $logNpm -Tail 20 | ForEach-Object { Write-Host ('    ' + $_) }; throw ('npm ci das telas falhou; log em ' + $logNpm) }
        } finally { Pop-Location }
        Gravar-TextoUtf8 $marca $hash
        Escrever-Ok 'dependencias instaladas'
    }

    # Backup do banco + build das telas + publicacao, com os scripts que vieram do GitHub.
    & $atualizarRepo

    $pacote = Join-Path $Raiz 'pacote'
    if (-not (Test-Path $pacote)) { New-Item -ItemType Directory -Path $pacote | Out-Null }
    Gravar-TextoUtf8 (Join-Path $pacote 'VERSAO.txt') (
        'Pulyn GitHub ' + $Branch + ' ' + (Get-Date -Format 'yyyy-MM-dd HH:mm') + "`r`n" +
        "Origem GitHub`r`n" +
        'BackEnd ' + $Branch + ' @ ' + $back.Depois.Substring(0, 7) + "`r`n" +
        'FrontEnd ' + $Branch + ' @ ' + $front.Depois.Substring(0, 7) + "`r`n")

    $sucesso = $true
    Write-Host ''
    Write-Host '==================================================================' -ForegroundColor Green
    Write-Host ' Pulyn atualizado com a versao do GitHub.' -ForegroundColor Green
    Write-Host '==================================================================' -ForegroundColor Green
    Write-Host 'Tablets, celulares e placas continuam funcionando sem mudar nada.'
} catch {
    if ($_.Exception.Message -eq 'SEM_MUDANCAS') {
        $sucesso = $true
    } else {
        Write-Host ''
        Write-Host ('ERRO: ' + $_.Exception.Message) -ForegroundColor Red
        Write-Host ('A atualizacao parou. O registro completo esta em ' + $log) -ForegroundColor Yellow
        Write-Host 'Se o erro aconteceu antes da publicacao, o sistema que estava no ar continua como estava.' -ForegroundColor Yellow
    }
} finally {
    Stop-Transcript | Out-Null
}

if (-not $SemPausa) { Read-Host 'Pressione Enter para fechar' | Out-Null }
if ($sucesso) { exit 0 } else { exit 1 }
