# 01-preparar-iis.ps1 - prepara o IIS para hospedar o Pulyn (rode como Administrador).
# Nao altera os sites que ja existem (ex.: "suporte"). Instala o que falta: recursos do IIS (incluindo
# WebSocket), URL Rewrite e ARR (proxy reverso). A instalacao dos modulos pode reiniciar o IIS por alguns
# segundos; os sites existentes ficam fora do ar nesse intervalo.
param([switch]$Sim)   # -Sim: nao pergunta antes de instalar
. "$PSScriptRoot\config.ps1"
Exigir-Admin

$urlRewrite = 'https://download.microsoft.com/download/1/2/8/128E2E22-C1B9-44A4-BE2A-5859ED1D4592/rewrite_amd64_en-US.msi'
$urlArr     = 'https://download.microsoft.com/download/E/9/8/E9849D6A-020E-47E4-9FD0-A023E99B54EB/requestRouter_amd64.msi'
$appcmd     = Join-Path $env:windir 'system32\inetsrv\appcmd.exe'
$dllRewrite = Join-Path $env:windir 'system32\inetsrv\rewrite.dll'
$dllArr     = 'C:\Program Files\IIS\Application Request Routing\requestRouter.dll'

Escrever-Passo 'Pastas em C:\Pulyn'
foreach ($p in $Raiz, $Backend, $Site, $Servico, $Logs, $Backups, $Certs, $Instaladores, $Scripts) {
    if (-not (Test-Path $p)) { New-Item -ItemType Directory -Path $p | Out-Null }
}
Escrever-Ok $Raiz

Escrever-Passo 'Recursos do IIS'
$recursos = 'IIS-WebServerRole', 'IIS-WebServer', 'IIS-CommonHttpFeatures', 'IIS-StaticContent', 'IIS-DefaultDocument',
            'IIS-HttpErrors', 'IIS-RequestFiltering', 'IIS-HttpCompressionStatic', 'IIS-WebSockets',
            'IIS-ManagementConsole', 'IIS-ManagementScriptingTools'
$faltam = @()
foreach ($r in $recursos) {
    $f = Get-WindowsOptionalFeature -Online -FeatureName $r -ErrorAction SilentlyContinue
    if ($f -and $f.State -ne 'Enabled') { $faltam += $r }
}
$precisaModulos = (-not (Test-Path $dllRewrite)) -or (-not (Test-Path $dllArr))

if ($faltam.Count -eq 0 -and -not $precisaModulos) {
    Escrever-Ok 'tudo ja estava instalado'
} else {
    if ($faltam.Count) { Write-Host ('    vao ser habilitados: ' + ($faltam -join ', ')) }
    if ($precisaModulos) { Write-Host '    vao ser instalados: URL Rewrite e Application Request Routing (ARR)' }
    if (-not $Sim) {
        $resp = Read-Host '    Isso pode reiniciar o IIS por alguns segundos (o site "suporte" cai nesse intervalo). Continuar? (S/N)'
        if ($resp -notmatch '^[sS]') { Write-Host 'Cancelado.'; return }
    }
    foreach ($r in $faltam) {
        Enable-WindowsOptionalFeature -Online -FeatureName $r -All -NoRestart | Out-Null
        Escrever-Ok ('habilitado ' + $r)
    }
}

function Instalar-Msi($nome, $url, $arquivo, $dllEsperada) {
    if (Test-Path $dllEsperada) { Escrever-Ok ($nome + ' ja instalado'); return }
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $destino = Join-Path $Instaladores $arquivo
    if (-not (Test-Path $destino)) {
        Write-Host ('    baixando ' + $nome + '...')
        Invoke-WebRequest -Uri $url -OutFile $destino -UseBasicParsing
    }
    $proc = Start-Process msiexec.exe -ArgumentList @('/i', ('"' + $destino + '"'), '/qn', '/norestart') -Wait -PassThru
    if ($proc.ExitCode -ne 0 -and $proc.ExitCode -ne 3010) { throw ($nome + ': a instalacao falhou (codigo ' + $proc.ExitCode + ')') }
    if (-not (Test-Path $dllEsperada)) { throw ($nome + ': instalado, mas nao achei ' + $dllEsperada) }
    Escrever-Ok ($nome + ' instalado')
}

Escrever-Passo 'URL Rewrite e ARR'
Instalar-Msi 'URL Rewrite' $urlRewrite 'rewrite_amd64_en-US.msi' $dllRewrite
Instalar-Msi 'ARR (proxy reverso)' $urlArr 'requestRouter_amd64.msi' $dllArr

Escrever-Passo 'Ativando o proxy do ARR'
# So liga o recurso e define o tempo limite; as regras que usam o proxy ficam no web.config do site Pulyn.
& $appcmd set config -section:system.webServer/proxy /enabled:"True" /timeout:"00:02:00" /reverseRewriteHostInResponseHeaders:"False" /commit:apphost | Out-Null
Conferir-Saida 'Nao consegui ativar o proxy do ARR'
Escrever-Ok 'proxy ativo'

Escrever-Passo 'Conferindo o Node.js e o PostgreSQL'
$node = (Get-Command node -ErrorAction SilentlyContinue)
if (-not $node) { throw 'Node.js nao encontrado no PATH. Instale o Node.js LTS e rode de novo.' }
Escrever-Ok ('node ' + (& node -v) + ' em ' + $node.Source)
if (-not (Test-Path (Join-Path $PgBin 'psql.exe'))) { throw ('psql nao encontrado em ' + $PgBin + ' (ajuste $PgBin em config.ps1).') }
$svc = Get-Service $PgServico -ErrorAction SilentlyContinue
if (-not $svc) { Escrever-Aviso ('servico ' + $PgServico + ' nao encontrado: ajuste $PgServico em config.ps1') } else { Escrever-Ok ($PgServico + ': ' + $svc.Status) }

Write-Host ''
Write-Host 'Pronto. Proximo passo: 02-banco-producao.ps1' -ForegroundColor Green
