# 04-publicar.ps1 - publica o Pulyn no IIS (rode como Administrador). Serve tanto para a primeira
# instalacao quanto para atualizar depois (use atualizar.ps1, que faz backup do banco antes).
#   1. gera o build do frontend (API no mesmo endereco do site: /api)
#   2. copia o backend para C:\Pulyn\backend e instala as dependencias de producao
#   3. registra/reinicia o servico do Windows PulynBackend (Node em 127.0.0.1:3100, sobe junto com o Windows)
#   4. cria/atualiza o site "Pulyn" no IIS (HTTPS) + regras de proxy + firewall (so rede local)
#   5. testa o site, a API e o WebSocket
param([switch]$SemBuild)   # -SemBuild: reaproveita o build do frontend ja gerado em C:\Pulyn\site-build
. "$PSScriptRoot\config.ps1"
Exigir-Admin
Exigir-Repo

$appcmd = Join-Path $env:windir 'system32\inetsrv\appcmd.exe'
$siteBuild = Join-Path $Raiz 'site-build'
$exeServico = Join-Path $Servico ($NomeServico + '.exe')
$xmlServico = Join-Path $Servico ($NomeServico + '.xml')

Escrever-Passo 'Conferindo pre-requisitos'
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { throw 'Node.js nao encontrado no PATH.' }
if (-not (Test-Path (Join-Path $env:windir 'system32\inetsrv\rewrite.dll'))) { throw 'URL Rewrite nao instalado: rode 01-preparar-iis.ps1.' }
if (-not (Test-Path $Backend)) { New-Item -ItemType Directory -Path $Backend | Out-Null }
$envProd = Join-Path $Backend '.env'
if (-not (Test-Path $envProd)) { throw ('Nao achei ' + $envProd + ': rode 02-banco-producao.ps1.') }
$jwt = Ler-Env $envProd 'JWT_SECRET'
if (-not $jwt -or $jwt -eq 'sua-chave-secreta-super-segura-2026') { throw 'JWT_SECRET ausente ou padrao no .env de producao.' }
$cert = Get-ChildItem Cert:\LocalMachine\My | Where-Object { $_.Subject -eq ('CN=' + $NomeCertSrv) -and $_.NotAfter -gt (Get-Date) } |
        Sort-Object NotAfter -Descending | Select-Object -First 1
if (-not $cert) { throw 'Certificado do servidor nao encontrado: rode 03-certificado.ps1.' }
foreach ($p in $Site, $Servico, $Logs, $Backups, $Instaladores, $Scripts) { if (-not (Test-Path $p)) { New-Item -ItemType Directory -Path $p | Out-Null } }
Escrever-Ok 'tudo no lugar'

# Outro site do IIS usando a mesma porta HTTPS? Nao mexemos em sites alheios.
Import-Module WebAdministration
$conflito = Get-Website | Where-Object { $_.Name -ne $NomeSite } | ForEach-Object {
    $s = $_; $s.bindings.Collection | Where-Object { $_.bindingInformation -match (':' + $PortaHttps + ':') } | ForEach-Object { $s.Name }
}
if ($conflito) { throw ('A porta ' + $PortaHttps + ' ja e usada pelo site IIS "' + ($conflito -join ', ') + '". Mude $PortaHttps em config.ps1.') }

# ---------------------------------------------------------------- frontend
if (-not $SemBuild) {
    Escrever-Passo 'Gerando o frontend'
    Push-Location $RepoFront
    try {
        if (-not (Test-Path 'node_modules')) { & npm.cmd ci --no-audit --no-fund; Conferir-Saida 'npm ci do frontend falhou' }
        $env:VITE_API_URL = '/api'
        Remove-Item Env:\VITE_WS_URL -ErrorAction SilentlyContinue
        & npm.cmd run build -- --outDir $siteBuild --emptyOutDir
        Conferir-Saida 'O build do frontend falhou'
    } finally { Pop-Location; Remove-Item Env:\VITE_API_URL -ErrorAction SilentlyContinue }
    Escrever-Ok 'build gerado'
}
if (-not (Test-Path (Join-Path $siteBuild 'index.html'))) { throw ('Sem build em ' + $siteBuild + '.') }

# ---------------------------------------------------------------- backend
Escrever-Passo 'Parando o servico (se existir) e copiando o backend'
$svc = Get-Service $NomeServico -ErrorAction SilentlyContinue
if ($svc -and $svc.Status -ne 'Stopped') { Stop-Service $NomeServico -Force; $svc.WaitForStatus('Stopped', '00:00:30') }
# /MIR apaga em C:\Pulyn\backend o que nao existe mais no repositorio; o .env e o node_modules ficam de fora.
& robocopy $RepoBackend $Backend /MIR /XD node_modules .git test logs /XF .env '.env.*' '*.log' /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw ('robocopy do backend falhou (codigo ' + $LASTEXITCODE + ')') }
$global:LASTEXITCODE = 0
Escrever-Ok ('backend copiado para ' + $Backend)

Escrever-Passo 'Instalando dependencias de producao do backend'
# So reinstala quando o package-lock.json mudou desde a ultima instalacao (marca guardada em node_modules).
$lockHash = (Get-FileHash (Join-Path $Backend 'package-lock.json') -Algorithm SHA256).Hash
$marca = Join-Path $Backend 'node_modules\.pulyn-lock-hash'
if ((Test-Path $marca) -and ((Get-Content $marca -Raw).Trim() -eq $lockHash)) {
    Escrever-Ok 'dependencias ja estavam em dia'
} else {
    $logNpm = Join-Path $Logs 'npm-backend.log'
    Push-Location $Backend
    try {
        # cmd /c evita que os avisos do npm (stderr) virem erro do PowerShell.
        & cmd.exe /c ('npm.cmd ci --omit=dev --no-audit --no-fund > "' + $logNpm + '" 2>&1')
        if ($LASTEXITCODE -ne 0) { Get-Content $logNpm -Tail 20 | ForEach-Object { Write-Host ('    ' + $_) }; throw ('npm ci do backend falhou (codigo ' + $LASTEXITCODE + '); log em ' + $logNpm) }
    } finally { Pop-Location }
    Gravar-TextoUtf8 $marca $lockHash
    Escrever-Ok 'dependencias instaladas'
}

# ---------------------------------------------------------------- servico do Windows
Escrever-Passo 'Servico do Windows (WinSW)'
if (-not (Test-Path $exeServico)) {
    $baixado = Join-Path $Instaladores 'WinSW-x64.exe'
    if (-not (Test-Path $baixado)) {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri 'https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW-x64.exe' -OutFile $baixado -UseBasicParsing
    }
    Copy-Item $baixado $exeServico
}
$depende = if (Get-Service $PgServico -ErrorAction SilentlyContinue) { '  <depend>' + $PgServico + '</depend>' } else { '' }
$xml = @"
<service>
  <id>$NomeServico</id>
  <name>Pulyn Backend</name>
  <description>API e WebSocket do Pulyn (Node.js). O IIS repassa as requisicoes para ca.</description>
  <executable>$($node.Source)</executable>
  <arguments>index.js</arguments>
  <workingdirectory>$Backend</workingdirectory>
  <env name="NODE_ENV" value="production" />
  <startmode>Automatic</startmode>
$depende
  <onfailure action="restart" delay="10 sec" />
  <onfailure action="restart" delay="30 sec" />
  <onfailure action="restart" delay="60 sec" />
  <resetfailure>1 hour</resetfailure>
  <logpath>$Logs</logpath>
  <log mode="roll-by-size">
    <sizeThreshold>10240</sizeThreshold>
    <keepFiles>8</keepFiles>
  </log>
</service>
"@
Gravar-TextoUtf8 $xmlServico $xml
if (-not (Get-Service $NomeServico -ErrorAction SilentlyContinue)) {
    & $exeServico install
    Conferir-Saida 'Nao consegui registrar o servico'
    Escrever-Ok 'servico registrado'
}
Start-Service $NomeServico
Escrever-Ok 'servico iniciado'

# ---------------------------------------------------------------- site no IIS
Escrever-Passo 'Copiando o frontend para o site'
& robocopy $siteBuild $Site /MIR /XF web.config /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw ('robocopy do frontend falhou (codigo ' + $LASTEXITCODE + ')') }
$global:LASTEXITCODE = 0
Copy-Item (Join-Path $PSScriptRoot 'web.config') (Join-Path $Site 'web.config') -Force
# O web.config guarda a porta do backend: mantem em sincronia com config.ps1.
$wc = Get-Content (Join-Path $Site 'web.config') -Raw -Encoding UTF8
Gravar-TextoUtf8 (Join-Path $Site 'web.config') ($wc.Replace('127.0.0.1:3100', '127.0.0.1:' + $PortaBackend))
Escrever-Ok ('site em ' + $Site)

Escrever-Passo 'Site "Pulyn" no IIS'
if (-not (Test-Path ('IIS:\AppPools\' + $NomePool))) { New-WebAppPool -Name $NomePool | Out-Null }
Set-ItemProperty ('IIS:\AppPools\' + $NomePool) -Name managedRuntimeVersion -Value ''
Set-ItemProperty ('IIS:\AppPools\' + $NomePool) -Name startMode -Value 'AlwaysRunning'
Set-ItemProperty ('IIS:\AppPools\' + $NomePool) -Name processModel.idleTimeout -Value ([TimeSpan]::Zero)
& icacls $Site /grant ('IIS AppPool\' + $NomePool + ':(OI)(CI)RX') | Out-Null

if (-not (Get-Website -Name $NomeSite -ErrorAction SilentlyContinue)) {
    New-Website -Name $NomeSite -PhysicalPath $Site -ApplicationPool $NomePool -Port $PortaHttps -Ssl | Out-Null
    Escrever-Ok 'site criado'
} else {
    Set-ItemProperty ('IIS:\Sites\' + $NomeSite) -Name physicalPath -Value $Site
    Set-ItemProperty ('IIS:\Sites\' + $NomeSite) -Name applicationPool -Value $NomePool
    if (-not (Get-WebBinding -Name $NomeSite -Protocol https)) { New-WebBinding -Name $NomeSite -Protocol https -Port $PortaHttps | Out-Null }
    Escrever-Ok 'site ja existia: atualizado'
}
# Associa o certificado ao endereco 0.0.0.0:porta (so troca se for outro certificado).
$sslPath = 'IIS:\SslBindings\0.0.0.0!' + $PortaHttps
$atual = if (Test-Path $sslPath) { (Get-Item $sslPath).Thumbprint } else { $null }
if ($atual -ne $cert.Thumbprint) {
    if ($atual) { Remove-Item $sslPath -Force }
    (Get-WebBinding -Name $NomeSite -Protocol https).AddSslCertificate($cert.Thumbprint, 'My')
    Escrever-Ok ('certificado associado (' + $cert.Thumbprint.Substring(0, 8) + '...)')
} else { Escrever-Ok 'certificado ja associado' }
if ((Get-Website -Name $NomeSite).State -ne 'Started') { Start-Website -Name $NomeSite }

Escrever-Passo 'Firewall (somente a rede local)'
if (-not (Get-NetFirewallRule -DisplayName 'Pulyn HTTPS' -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName 'Pulyn HTTPS' -Direction Inbound -Protocol TCP -LocalPort $PortaHttps -Action Allow -Profile Any -RemoteAddress LocalSubnet | Out-Null
    Escrever-Ok ('porta ' + $PortaHttps + ' liberada para a sub-rede local')
} else { Escrever-Ok 'regra ja existia' }

Copy-Item (Join-Path $PSScriptRoot '*') $Scripts -Recurse -Force -Exclude 'node_modules'

# ---------------------------------------------------------------- testes
Escrever-Passo 'Testando'
$ok = $false
for ($i = 0; $i -lt 40 -and -not $ok; $i++) {
    $codigo = & curl.exe -s -o NUL -w '%{http_code}' ('http://127.0.0.1:' + $PortaBackend + '/api/internal/pool-stats')
    if ($codigo -eq '200') { $ok = $true } else { Start-Sleep -Seconds 1 }
}
if (-not $ok) {
    Escrever-Aviso ('o backend nao respondeu em 40 s. Ultimas linhas do log (' + $Logs + '):')
    Get-ChildItem $Logs -Filter ($NomeServico + '*.log') | Sort-Object LastWriteTime -Descending | Select-Object -First 2 | ForEach-Object {
        Write-Host ('--- ' + $_.Name); Get-Content $_.FullName -Tail 25
    }
    throw 'Backend nao subiu.'
}
Escrever-Ok ('backend respondendo em 127.0.0.1:' + $PortaBackend)

$base = 'https://127.0.0.1:' + $PortaHttps
$paginaInicial = & curl.exe -sk -o NUL -w '%{http_code}' ($base + '/')
$rotaReact     = & curl.exe -sk -o NUL -w '%{http_code}' ($base + '/admin/dashboard')
$api           = & curl.exe -sk ($base + '/api/rota-que-nao-existe')
$interna       = & curl.exe -sk -o NUL -w '%{http_code}' ($base + '/api/internal/pool-stats')
if ($paginaInicial -eq '200') { Escrever-Ok 'pagina inicial: 200' } else { Escrever-Aviso ('pagina inicial respondeu ' + $paginaInicial) }
if ($rotaReact -eq '200') { Escrever-Ok 'rota do React (/admin/dashboard): 200' } else { Escrever-Aviso ('/admin/dashboard respondeu ' + $rotaReact) }
if ($api -match 'Rota') { Escrever-Ok 'API passando pelo IIS ate o backend' } else { Escrever-Aviso ('a API nao respondeu pelo IIS. Resposta: ' + $api + ' - veja README-IIS.md (Problemas)') }
if ($interna -eq '403') { Escrever-Ok 'rota interna bloqueada para a rede (403)' } else { Escrever-Aviso ('/api/internal respondeu ' + $interna + ' (esperado 403)') }

$env:NODE_PATH = Join-Path $Backend 'node_modules'
& node (Join-Path $PSScriptRoot 'testar-websocket.js') ('wss://127.0.0.1:' + $PortaHttps + '/')
if ($LASTEXITCODE -ne 0) { Escrever-Aviso 'WebSocket nao passou: veja README-IIS.md (secao WebSocket).' }
$global:LASTEXITCODE = 0
Remove-Item Env:\NODE_PATH -ErrorAction SilentlyContinue

$ip = Obter-IpLan
Write-Host ''
Write-Host ('Publicado. Acesse: https://' + $ip + '/') -ForegroundColor Green
Write-Host ('Nos tablets/celulares instale antes o certificado ' + (Join-Path $Certs 'PulynCA.cer') + ' (README-IIS.md).') -ForegroundColor Yellow
