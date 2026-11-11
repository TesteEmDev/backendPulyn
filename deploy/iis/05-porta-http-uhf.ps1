# 05-porta-http-uhf.ps1 - abre uma porta HTTP (padrao 8080) so para o leitor UHF enviar lotes (rode como Administrador).
# Por que: o ESP32 do leitor UHF tem pouca memoria livre (~25 KB com Wi-Fi + Bluetooth) e nao consegue o handshake HTTPS
# com o IIS ("connection refused"). Nessa porta o IIS aceita SOMENTE POST /api/uhf/lote (regra no web.config, que responde
# 403 para qualquer outro caminho); o backend continua exigindo o ID do modulo e a chave do leitor.
# Site, login e o resto da API continuam so em HTTPS (porta 443). O firewall libera a porta so para a rede local.
#   .\05-porta-http-uhf.ps1            usa a porta 8080
#   .\05-porta-http-uhf.ps1 -Porta 8081   (mude tambem o ^8080$ no web.config)
param([int]$Porta = 8080)
. "$PSScriptRoot\config.ps1"
Exigir-Admin
Import-Module WebAdministration

Escrever-Passo ('Porta HTTP ' + $Porta + ' para o leitor UHF')
if (-not (Get-Website -Name $NomeSite -ErrorAction SilentlyContinue)) { throw ('Site "' + $NomeSite + '" nao encontrado. Rode 04-publicar.ps1 antes.') }
$ocupada = Get-Website | Where-Object { $_.Name -ne $NomeSite } | ForEach-Object {
    $s = $_; $s.bindings.Collection | Where-Object { $_.bindingInformation -match (':' + $Porta + ':') } | ForEach-Object { $s.Name }
}
if ($ocupada) { throw ('A porta ' + $Porta + ' ja e usada pelo site IIS "' + ($ocupada -join ', ') + '". Use -Porta com outro numero.') }

# web.config novo (com a regra da porta) para o site publicado
Copy-Item (Join-Path $PSScriptRoot 'web.config') (Join-Path $Site 'web.config') -Force
Escrever-Ok 'web.config publicado'
if (-not (Get-WebBinding -Name $NomeSite -Protocol http -Port $Porta -ErrorAction SilentlyContinue)) {
    New-WebBinding -Name $NomeSite -Protocol http -Port $Porta | Out-Null
    Escrever-Ok ('binding HTTP ' + $Porta + ' criado')
} else { Escrever-Ok ('binding HTTP ' + $Porta + ' ja existia') }

if (-not (Get-NetFirewallRule -DisplayName 'Pulyn HTTP UHF' -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName 'Pulyn HTTP UHF' -Direction Inbound -Protocol TCP -LocalPort $Porta -Action Allow -Profile Any -RemoteAddress LocalSubnet | Out-Null
    Escrever-Ok ('porta ' + $Porta + ' liberada para a sub-rede local')
}

Escrever-Passo 'Teste'
$ip = Obter-IpLan
$cod = & curl.exe -s -o NUL -w '%{http_code}' --max-time 8 -X POST -H 'Content-Type: application/json' -H 'X-Module-Id: teste' -H 'Authorization: Bearer teste' -d '{}' ('http://127.0.0.1:' + $Porta + '/api/uhf/lote')
Escrever-Ok ('POST /api/uhf/lote sem chave valida -> HTTP ' + $cod + ' (esperado 401 ou 404: chegou no backend)')
$cod = & curl.exe -s -o NUL -w '%{http_code}' --max-time 8 ('http://127.0.0.1:' + $Porta + '/')
Escrever-Ok ('GET / na porta ' + $Porta + ' -> HTTP ' + $cod + ' (esperado 403: o site nao e servido por HTTP)')
Write-Host ''
Write-Host ('No leitor UHF (app Middleware Manager) use a URL: http://' + $ip + ':' + $Porta + '/api/uhf/lote') -ForegroundColor Green
