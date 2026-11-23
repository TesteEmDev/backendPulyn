# gerar-site.ps1 - gera o site (frontend) apontando para a API no mesmo endereço (/api) e copia para .\site.
# Precisa do Node.js instalado (uma vez, na máquina que faz a instalação). Rode dentro da pasta deploy\docker.
$ErrorActionPreference = 'Stop'
$front = Join-Path $PSScriptRoot '..\..\..\frontenPulyn'
if (-not (Test-Path (Join-Path $front 'package.json'))) { throw "Não achei o frontend em $front" }
Push-Location $front
try {
    if (-not (Test-Path 'node_modules')) { npm ci --no-audit --no-fund }
    $env:VITE_API_URL = '/api'
    # Zera o VITE_WS_URL do .env do frontend (ws://localhost:3001 seria gravado no site).
    # Vazio = WebSocket na mesma origem do site (wss://IP_DO_PC, roteado pelo nginx).
    $env:VITE_WS_URL = ''
    # O vite escreve avisos (ex.: Browserslist) no stderr; com 'Stop' o PowerShell 5.1 trata isso como erro.
    # Por isso o build roda com 'Continue' e o resultado é conferido pelo código de saída.
    $ErrorActionPreference = 'Continue'
    npx vite build
    $codigo = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    if ($codigo -ne 0) { throw 'Falha no build do site.' }
} finally {
    Remove-Item Env:\VITE_API_URL -ErrorAction SilentlyContinue
    Remove-Item Env:\VITE_WS_URL -ErrorAction SilentlyContinue
    Pop-Location
}
$destino = Join-Path $PSScriptRoot 'site'
Remove-Item -Recurse -Force $destino -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $destino | Out-Null
Copy-Item -Recurse -Force (Join-Path $front 'dist\*') $destino
Write-Host "Site gerado em $destino" -ForegroundColor Green
