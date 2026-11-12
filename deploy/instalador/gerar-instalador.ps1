# gerar-instalador.ps1 - gera o setup.exe do Pulyn (Pulyn-Setup-<versao>.exe) na pasta "saida".
# Roda na maquina de desenvolvimento (nao precisa de administrador; precisa de internet para o npm).
#   1. backend: arquivos do ultimo COMMIT (git archive: sem .env, sem arquivos locais) + dependencias de producao
#   2. frontend: build com a API em /api (mesmo endereco do site)
#   3. instaladores: Node.js (.msi), PostgreSQL 18 (.exe), URL Rewrite, ARR e WinSW
#   4. Inno Setup (ISCC) compila Pulyn.iss
# Parametros (todos opcionais):
#   -Versao       padrao: data e hora (ex.: 2026.11.12.1700)
#   -NodeMsi      instalador do Node.js LTS x64 (padrao: o mais novo node-v*-x64.msi em Downloads)
#   -PostgresExe  instalador do PostgreSQL 18 x64 (padrao: o mais novo postgresql-18*-windows-x64.exe em Downloads)
#   -PastaIis     pasta com rewrite_amd64_en-US.msi, requestRouter_amd64.msi e WinSW-x64.exe (padrao C:\Pulyn\instaladores)
#   -Iscc         caminho do ISCC.exe (padrao: Inno Setup 6 do usuario ou de Arquivos de Programas)
param(
    [string]$Versao = (Get-Date -Format 'yyyy.MM.dd.HHmm'),
    [string]$NodeMsi,
    [string]$PostgresExe,
    [string]$PastaIis = 'C:\Pulyn\instaladores',
    [string]$Iscc
)
$ErrorActionPreference = 'Stop'

function Passo($t) { Write-Host ''; Write-Host ('==> ' + $t) -ForegroundColor Cyan }
function Ok($t)    { Write-Host ('    ok: ' + $t) -ForegroundColor Green }
function Aviso($t) { Write-Host ('    atencao: ' + $t) -ForegroundColor Yellow }
function Conferir($m) { if ($LASTEXITCODE -ne 0) { throw ($m + ' (codigo ' + $LASTEXITCODE + ')') } }

$repoBack  = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$repoFront = Join-Path (Split-Path $repoBack -Parent) 'FrontEnd'
$montagem  = Join-Path $PSScriptRoot 'montagem'
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
if (-not $NodeMsi) { $NodeMsi = Get-ChildItem $downloads -Filter 'node-v*-x64.msi' -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName }
if (-not $PostgresExe) { $PostgresExe = Get-ChildItem $downloads -Filter 'postgresql-18*-windows-x64.exe' -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName }
if (-not $NodeMsi -or -not (Test-Path $NodeMsi)) { throw 'Instalador do Node.js (node-v*-x64.msi) nao encontrado: informe -NodeMsi.' }
if (-not $PostgresExe -or -not (Test-Path $PostgresExe)) { throw 'Instalador do PostgreSQL 18 (postgresql-18*-windows-x64.exe) nao encontrado: informe -PostgresExe.' }
$arquivosIis = 'rewrite_amd64_en-US.msi', 'requestRouter_amd64.msi', 'WinSW-x64.exe'
foreach ($a in $arquivosIis) { if (-not (Test-Path (Join-Path $PastaIis $a))) { throw ('Falta ' + $a + ' em ' + $PastaIis + ' (informe -PastaIis).') } }
Ok ('Inno Setup: ' + $Iscc)
Ok ('Node.js: ' + (Split-Path $NodeMsi -Leaf) + ' | PostgreSQL: ' + (Split-Path $PostgresExe -Leaf))

# O pacote leva o ULTIMO COMMIT do backend; o frontend sai da pasta como esta. Avisa se houver alteracao sem commit.
$pendBack = & git -C $repoBack status --porcelain --untracked-files=no
$pendFront = & git -C $repoFront status --porcelain --untracked-files=no
if ($pendBack) { Aviso 'o BackEnd tem alteracoes sem commit: elas NAO entram no instalador.' }
if ($pendFront) { Aviso 'o FrontEnd tem alteracoes sem commit: elas ENTRAM no instalador (o build usa a pasta como esta).' }
$commitBack = (& git -C $repoBack rev-parse --short HEAD).Trim()
$commitFront = (& git -C $repoFront rev-parse --short HEAD).Trim()

if (Test-Path $montagem) { Remove-Item $montagem -Recurse -Force }
New-Item -ItemType Directory -Path (Join-Path $pacote 'BackEnd'), (Join-Path $pacote 'terceiros') -Force | Out-Null

# ------------------------------------------------------------------ backend
Passo ('Backend (commit ' + $commitBack + ')')
$tar = Join-Path $montagem 'backend.tar'
& git -C $repoBack archive --format=tar -o $tar HEAD
Conferir 'git archive falhou'
& tar.exe -xf $tar -C (Join-Path $pacote 'BackEnd')
Conferir 'tar falhou'
Remove-Item $tar
# Fora do pacote: testes e os .sql soltos da raiz (dumps e seeds de desenvolvimento, alguns com dados).
Remove-Item (Join-Path $pacote 'BackEnd\test') -Recurse -Force -ErrorAction SilentlyContinue
Get-ChildItem (Join-Path $pacote 'BackEnd') -Filter '*.sql' -File | Remove-Item -Force
if (-not (Test-Path (Join-Path $pacote 'BackEnd\deploy\iis\banco-base.sql'))) { throw 'banco-base.sql nao esta no commit (rode deploy\iis\gerar-banco-base.ps1 e faca o commit).' }
Push-Location (Join-Path $pacote 'BackEnd')
try {
    & cmd.exe /c 'npm.cmd ci --omit=dev --no-audit --no-fund > npm-ci.log 2>&1'
    if ($LASTEXITCODE -ne 0) { Get-Content npm-ci.log -Tail 20; throw 'npm ci do backend falhou' }
    Remove-Item npm-ci.log
} finally { Pop-Location }
Ok 'backend e dependencias de producao'

# ------------------------------------------------------------------ frontend
Passo ('Frontend (commit ' + $commitFront + ')')
$siteBuild = Join-Path $pacote 'site-build'
Push-Location $repoFront
try {
    if (-not (Test-Path 'node_modules')) { & npm.cmd ci --no-audit --no-fund; Conferir 'npm ci do frontend falhou' }
    $env:VITE_API_URL = '/api'
    Remove-Item Env:\VITE_WS_URL -ErrorAction SilentlyContinue
    & cmd.exe /c ('npm.cmd run build -- --outDir "' + $siteBuild + '" --emptyOutDir > "' + (Join-Path $montagem 'build-front.log') + '" 2>&1')
    if ($LASTEXITCODE -ne 0) { Get-Content (Join-Path $montagem 'build-front.log') -Tail 20; throw 'build do frontend falhou' }
} finally { Pop-Location; Remove-Item Env:\VITE_API_URL -ErrorAction SilentlyContinue }
if (-not (Test-Path (Join-Path $siteBuild 'index.html'))) { throw 'o build do frontend nao gerou index.html' }
Ok 'frontend compilado'

# ------------------------------------------------------------------ instaladores
Passo 'Instaladores'
Copy-Item $NodeMsi, $PostgresExe (Join-Path $pacote 'terceiros')
foreach ($a in $arquivosIis) { Copy-Item (Join-Path $PastaIis $a) (Join-Path $pacote 'terceiros') }
[IO.File]::WriteAllText((Join-Path $pacote 'VERSAO.txt'), ('Pulyn ' + $Versao + "`r`nBackEnd " + $commitBack + "`r`nFrontEnd " + $commitFront + "`r`nGerado em " + (Get-Date -Format 'yyyy-MM-dd HH:mm') + "`r`n"))
Ok 'Node.js, PostgreSQL, URL Rewrite, ARR e WinSW'

# ------------------------------------------------------------------ setup.exe
Passo 'Compilando o setup.exe (alguns minutos)'
if (-not (Test-Path $saida)) { New-Item -ItemType Directory -Path $saida | Out-Null }
& $Iscc /Q ('/DVersao=' + $Versao) ('/DMontagem=' + $montagem) ('/O' + $saida) (Join-Path $PSScriptRoot 'Pulyn.iss')
Conferir 'o Inno Setup falhou'
$exe = Join-Path $saida ('Pulyn-Setup-' + $Versao + '.exe')
Ok ($exe + ' (' + [math]::Round((Get-Item $exe).Length / 1MB) + ' MB)')
Remove-Item $montagem -Recurse -Force
