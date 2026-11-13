# gerar-instalador.ps1 - gera o setup.exe do Pulyn (Pulyn-Setup-<versao>.exe) na pasta "saida".
# Roda na maquina de quem gera o instalador (nao precisa de administrador; precisa de internet).
#   1. baixa do GitHub o backend (backendPulyn) e o frontend (frontenPulyn) da branch escolhida (padrao: main)
#   2. backend: arquivos do commit baixado (sem .git, testes e .sql de desenvolvimento) + dependencias de producao
#   3. frontend: build com a API em /api (mesmo endereco do site)
#   4. instaladores: Node.js (.msi), PostgreSQL 18 (.exe), URL Rewrite, ARR e WinSW
#   5. Inno Setup (ISCC) compila o Pulyn.iss que veio junto com o backend baixado
# O setup.exe leva tudo dentro dele: o computador do cliente nao precisa de internet nem de nenhum arquivo do projeto.
#
# Parametros (todos opcionais):
#   -Branch       branch dos dois repositorios no GitHub (padrao: main)
#   -BranchFront  branch so do frontend, se for diferente (padrao: a mesma de -Branch)
#   -Origem       GitHub (padrao) ou Local: Local usa o ultimo commit do BackEnd desta maquina e a pasta FrontEnd
#                 como esta (para testar antes de enviar ao GitHub)
#   -Versao       padrao: data e hora (ex.: 2026.11.12.1700)
#   -NodeMsi      instalador do Node.js LTS x64 (padrao: o mais novo node-v*-x64.msi em Downloads)
#   -PostgresExe  instalador do PostgreSQL 18 x64 (padrao: o mais novo postgresql-18*-windows-x64.exe em Downloads)
#   -PastaIis     pasta com rewrite_amd64_en-US.msi, requestRouter_amd64.msi e WinSW-x64.exe (padrao C:\Pulyn\instaladores)
#   -MinGitZip    Git portatil para a atualizacao pela internet (padrao: o mais novo MinGit-*-64-bit.zip em -PastaIis)
#   -Iscc         caminho do ISCC.exe (padrao: Inno Setup 6 do usuario ou de Arquivos de Programas)
param(
    [string]$Branch = 'main',
    [string]$BranchFront,
    [ValidateSet('GitHub', 'Local')][string]$Origem = 'GitHub',
    [string]$Versao = (Get-Date -Format 'yyyy.MM.dd.HHmm'),
    [string]$NodeMsi,
    [string]$PostgresExe,
    [string]$PastaIis = 'C:\Pulyn\instaladores',
    [string]$Iscc,
    [string]$MinGitZip,
    [string]$RepoBackUrl = 'https://github.com/TesteEmDev/backendPulyn.git',
    [string]$RepoFrontUrl = 'https://github.com/TesteEmDev/frontenPulyn.git'
)
$ErrorActionPreference = 'Stop'
if (-not $BranchFront) { $BranchFront = $Branch }

function Passo($t) { Write-Host ''; Write-Host ('==> ' + $t) -ForegroundColor Cyan }
function Ok($t)    { Write-Host ('    ok: ' + $t) -ForegroundColor Green }
function Aviso($t) { Write-Host ('    atencao: ' + $t) -ForegroundColor Yellow }
function Conferir($m) { if ($LASTEXITCODE -ne 0) { throw ($m + ' (codigo ' + $LASTEXITCODE + ')') } }

$montagem  = Join-Path $PSScriptRoot 'montagem'
$fontes    = Join-Path $montagem 'fontes'
$pacote    = Join-Path $montagem 'pacote'
$saida     = Join-Path $PSScriptRoot 'saida'
$downloads = Join-Path $env:USERPROFILE 'Downloads'

# ------------------------------------------------------------------ ferramentas e arquivos
Passo 'Conferindo ferramentas e instaladores'
if (-not $Iscc) {
    $Iscc = @((Join-Path $env:LOCALAPPDATA 'Programs\Inno Setup 6\ISCC.exe'), 'C:\Program Files (x86)\Inno Setup 6\ISCC.exe', 'C:\Program Files\Inno Setup 6\ISCC.exe') |
            Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $Iscc -or -not (Test-Path $Iscc)) { throw 'Inno Setup 6 (ISCC.exe) nao encontrado. Instale de jrsoftware.org ou informe -Iscc.' }
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'git nao encontrado no PATH.' }
if (-not $NodeMsi) { $NodeMsi = Get-ChildItem $downloads -Filter 'node-v*-x64.msi' -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName }
if (-not $PostgresExe) { $PostgresExe = Get-ChildItem $downloads -Filter 'postgresql-18*-windows-x64.exe' -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName }
if (-not $NodeMsi -or -not (Test-Path $NodeMsi)) { throw 'Instalador do Node.js (node-v*-x64.msi) nao encontrado: informe -NodeMsi.' }
if (-not $PostgresExe -or -not (Test-Path $PostgresExe)) { throw 'Instalador do PostgreSQL 18 (postgresql-18*-windows-x64.exe) nao encontrado: informe -PostgresExe.' }
$arquivosIis = 'rewrite_amd64_en-US.msi', 'requestRouter_amd64.msi', 'WinSW-x64.exe'
foreach ($a in $arquivosIis) { if (-not (Test-Path (Join-Path $PastaIis $a))) { throw ('Falta ' + $a + ' em ' + $PastaIis + ' (informe -PastaIis).') } }
if (-not $MinGitZip) { $MinGitZip = Get-ChildItem $PastaIis -Filter 'MinGit-*-64-bit.zip' -File -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1 -ExpandProperty FullName }
if (-not $MinGitZip -or -not (Test-Path $MinGitZip)) { throw ('MinGit (MinGit-*-64-bit.zip) nao encontrado em ' + $PastaIis + ': baixe de github.com/git-for-windows/git/releases ou informe -MinGitZip.') }
Ok ('Git portatil: ' + (Split-Path $MinGitZip -Leaf))
Ok ('Inno Setup: ' + $Iscc)
Ok ('Node.js: ' + (Split-Path $NodeMsi -Leaf) + ' | PostgreSQL: ' + (Split-Path $PostgresExe -Leaf))

if (Test-Path $montagem) { Remove-Item $montagem -Recurse -Force }
New-Item -ItemType Directory -Path $fontes, (Join-Path $pacote 'BackEnd'), (Join-Path $pacote 'terceiros'), (Join-Path $montagem 'extras') -Force | Out-Null

# ------------------------------------------------------------------ codigo-fonte
if ($Origem -eq 'GitHub') {
    Passo ('Baixando do GitHub (backend: ' + $Branch + ', frontend: ' + $BranchFront + ')')
    $repoBack = Join-Path $fontes 'BackEnd'
    $repoFront = Join-Path $fontes 'FrontEnd'
    & git clone --quiet --depth 1 --single-branch --branch $Branch $RepoBackUrl $repoBack
    Conferir ('Nao consegui baixar a branch "' + $Branch + '" de ' + $RepoBackUrl)
    & git clone --quiet --depth 1 --single-branch --branch $BranchFront $RepoFrontUrl $repoFront
    Conferir ('Nao consegui baixar a branch "' + $BranchFront + '" de ' + $RepoFrontUrl)
    $origemTexto = 'GitHub'
} else {
    Passo 'Usando os repositorios desta maquina (-Origem Local)'
    $repoBack = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
    $repoFront = Join-Path (Split-Path $repoBack -Parent) 'FrontEnd'
    if (& git -C $repoBack status --porcelain --untracked-files=no) { Aviso 'o BackEnd tem alteracoes sem commit: elas NAO entram no instalador.' }
    if (& git -C $repoFront status --porcelain --untracked-files=no) { Aviso 'o FrontEnd tem alteracoes sem commit: elas ENTRAM no instalador (o build usa a pasta como esta).' }
    $Branch = (& git -C $repoBack rev-parse --abbrev-ref HEAD).Trim()
    $BranchFront = (& git -C $repoFront rev-parse --abbrev-ref HEAD).Trim()
    $origemTexto = 'local'
}
$commitBack = (& git -C $repoBack rev-parse --short HEAD).Trim()
$commitFront = (& git -C $repoFront rev-parse --short HEAD).Trim()
Ok ('backend ' + $Branch + ' @ ' + $commitBack + ' | frontend ' + $BranchFront + ' @ ' + $commitFront)

# O instalador e os scripts vem junto com o backend: a branch precisa te-los.
$faltando = @('deploy\instalador\Pulyn.iss', 'deploy\iis\instalar-tudo.ps1', 'deploy\iis\desinstalar.ps1', 'deploy\iis\atualizar-github.ps1', 'deploy\iis\voltar-versao.ps1', 'deploy\iis\banco-base.sql', 'deploy\iis\criar-master.js') |
            Where-Object { -not (Test-Path (Join-Path $repoBack $_)) }
if ($faltando) {
    throw ('A branch "' + $Branch + '" do backend ainda nao tem o instalador (falta: ' + ($faltando -join ', ') + '). ' +
           'Envie a branch com o instalador e faca o merge na ' + $Branch + ', ou gere com -Branch <outra branch>.')
}
$iss = Join-Path $repoBack 'deploy\instalador\Pulyn.iss'

# ------------------------------------------------------------------ backend
Passo 'Backend'
$tar = Join-Path $montagem 'backend.tar'
& git -C $repoBack archive --format=tar -o $tar HEAD
Conferir 'git archive falhou'
& tar.exe -xf $tar -C (Join-Path $pacote 'BackEnd')
Conferir 'tar falhou'
Remove-Item $tar
# Fora do pacote: testes e os .sql soltos da raiz (dumps e seeds de desenvolvimento, alguns com dados).
Remove-Item (Join-Path $pacote 'BackEnd\test') -Recurse -Force -ErrorAction SilentlyContinue
Get-ChildItem (Join-Path $pacote 'BackEnd') -Filter '*.sql' -File | Remove-Item -Force
Push-Location (Join-Path $pacote 'BackEnd')
try {
    & cmd.exe /c 'npm.cmd ci --omit=dev --no-audit --no-fund > npm-ci.log 2>&1'
    if ($LASTEXITCODE -ne 0) { Get-Content npm-ci.log -Tail 20; throw 'npm ci do backend falhou' }
    Remove-Item npm-ci.log
} finally { Pop-Location }
Ok 'backend e dependencias de producao'

# ------------------------------------------------------------------ frontend
Passo 'Frontend'
$siteBuild = Join-Path $pacote 'site-build'
$logFront = Join-Path $montagem 'build-front.log'
Push-Location $repoFront
try {
    if (-not (Test-Path 'node_modules')) {
        & cmd.exe /c ('npm.cmd ci --no-audit --no-fund > "' + $logFront + '" 2>&1')
        if ($LASTEXITCODE -ne 0) { Get-Content $logFront -Tail 20; throw 'npm ci do frontend falhou' }
    }
    $env:VITE_API_URL = '/api'
    Remove-Item Env:\VITE_WS_URL -ErrorAction SilentlyContinue
    & cmd.exe /c ('npm.cmd run build -- --outDir "' + $siteBuild + '" --emptyOutDir > "' + $logFront + '" 2>&1')
    if ($LASTEXITCODE -ne 0) { Get-Content $logFront -Tail 20; throw 'build do frontend falhou' }
} finally { Pop-Location; Remove-Item Env:\VITE_API_URL -ErrorAction SilentlyContinue }
if (-not (Test-Path (Join-Path $siteBuild 'index.html'))) { throw 'o build do frontend nao gerou index.html' }
Ok 'frontend compilado'

# ------------------------------------------------------------------ instaladores
Passo 'Instaladores'
Copy-Item $NodeMsi, $PostgresExe (Join-Path $pacote 'terceiros')
foreach ($a in $arquivosIis) { Copy-Item (Join-Path $PastaIis $a) (Join-Path $pacote 'terceiros') }
Copy-Item $MinGitZip (Join-Path $montagem 'extras\MinGit.zip')
[IO.File]::WriteAllText((Join-Path $pacote 'VERSAO.txt'), (
    'Pulyn ' + $Versao + "`r`n" +
    'Origem ' + $origemTexto + "`r`n" +
    'BackEnd ' + $Branch + ' @ ' + $commitBack + "`r`n" +
    'FrontEnd ' + $BranchFront + ' @ ' + $commitFront + "`r`n" +
    'Gerado em ' + (Get-Date -Format 'yyyy-MM-dd HH:mm') + "`r`n"))
Ok 'Node.js, PostgreSQL, URL Rewrite, ARR, WinSW e Git'

# ------------------------------------------------------------------ setup.exe
Passo 'Compilando o setup.exe (alguns minutos)'
if (-not (Test-Path $saida)) { New-Item -ItemType Directory -Path $saida | Out-Null }
& $Iscc /Q ('/DVersao=' + $Versao) ('/DMontagem=' + $montagem) ('/O' + $saida) $iss
Conferir 'o Inno Setup falhou'
$exe = Join-Path $saida ('Pulyn-Setup-' + $Versao + '.exe')
Ok ($exe + ' (' + [math]::Round((Get-Item $exe).Length / 1MB) + ' MB)')
Write-Host ('    conteudo: backend ' + $Branch + ' @ ' + $commitBack + ', frontend ' + $BranchFront + ' @ ' + $commitFront + ' (' + $origemTexto + ')')
# A pasta de montagem e so temporaria; o antivirus as vezes segura um arquivo por alguns segundos.
for ($i = 0; $i -lt 5 -and (Test-Path $montagem); $i++) {
    Start-Sleep -Seconds 2
    Remove-Item $montagem -Recurse -Force -ErrorAction SilentlyContinue
}
if (Test-Path $montagem) { Aviso ('nao consegui apagar ' + $montagem + ' (apague depois; ela e recriada na proxima geracao).') }
