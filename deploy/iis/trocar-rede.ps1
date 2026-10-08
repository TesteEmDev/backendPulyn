# trocar-rede.ps1 - ajusta o Pulyn quando o servidor muda de rede (novo IP).
# Rode como Administrador, JA conectado na rede nova:
#     powershell -ExecutionPolicy Bypass -File C:\Pulyn\scripts\trocar-rede.ps1 -Ip 192.168.1.60
# O que faz:
#   1) emite um certificado HTTPS novo (mesma CA, entao os tablets que ja instalaram a CA continuam valendo)
#      com o IP novo + os IPs que o certificado atual ja tinha + o IP atual da placa;
#   2) troca o certificado do site IIS "Pulyn";
#   3) atualiza FRONTEND_URL no .env do backend (QR codes e convites de familia) e reinicia o servico;
#   4) testa o site.
# Nao mexe em banco, frontend nem nos outros sites do IIS.
param(
    [Parameter(Mandatory = $true)][string]$Ip
)
. "$PSScriptRoot\config.ps1"
Exigir-Admin
Import-Module WebAdministration

if ($Ip -notmatch '^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$') { throw ('IP invalido: ' + $Ip) }

# ---------------------------------------------------------------- 1) certificado
Escrever-Passo ('Certificado para o IP ' + $Ip)
$ca = Get-ChildItem Cert:\LocalMachine\My | Where-Object { $_.Subject -eq ('CN=' + $NomeCa) -and $_.HasPrivateKey -and $_.NotAfter -gt (Get-Date).AddDays(30) } |
      Sort-Object NotAfter -Descending | Select-Object -First 1
if (-not $ca) { throw 'CA do Pulyn nao encontrada neste computador (Cert:\LocalMachine\My).' }
Escrever-Ok ('CA encontrada (vence em ' + $ca.NotAfter.ToString('yyyy-MM-dd') + ')')

$ips = New-Object System.Collections.Generic.List[string]
$ips.Add($Ip)
$atual = Get-ChildItem Cert:\LocalMachine\My | Where-Object { $_.Subject -eq ('CN=' + $NomeCertSrv) -and $_.Issuer -eq $ca.Subject } |
         Sort-Object NotAfter -Descending | Select-Object -First 1
if ($atual) {
    $ext = $atual.Extensions | Where-Object { $_.Oid.Value -eq '2.5.29.17' }
    if ($ext) { foreach ($m in [regex]::Matches($ext.Format($false), '\d{1,3}(?:\.\d{1,3}){3}')) { $ips.Add($m.Value) } }
}
$lan = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } | Select-Object -First 1
if ($lan) { $ips.Add($lan.IPv4Address[0].IPAddress) }
$ips.Add('127.0.0.1')
$ips = $ips | Select-Object -Unique

$nomes = @('DNS=localhost') + ($ips | ForEach-Object { 'IPAddress=' + $_ })
$san = '2.5.29.17={text}' + ($nomes -join '&')
$srv = New-SelfSignedCertificate -Subject ('CN=' + $NomeCertSrv) -Signer $ca -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 `
    -KeyUsage DigitalSignature, KeyEncipherment -KeyExportPolicy Exportable -CertStoreLocation Cert:\LocalMachine\My `
    -NotAfter (Get-Date).AddDays(825) -TextExtension @($san, '2.5.29.37={text}1.3.6.1.5.5.7.3.1')
Escrever-Ok ('certificado criado (vence em ' + $srv.NotAfter.ToString('yyyy-MM-dd') + ')')
Write-Host ('    nomes no certificado: ' + ($nomes -join ', '))

# ---------------------------------------------------------------- 2) IIS
Escrever-Passo 'Trocando o certificado no site IIS'
$sslPath = 'IIS:\SslBindings\0.0.0.0!' + $PortaHttps
if (Test-Path $sslPath) { Remove-Item $sslPath -Force }
(Get-WebBinding -Name $NomeSite -Protocol https).AddSslCertificate($srv.Thumbprint, 'My')
Escrever-Ok ('certificado associado (' + $srv.Thumbprint.Substring(0, 8) + '...)')

# ---------------------------------------------------------------- 3) FRONTEND_URL
Escrever-Passo 'Atualizando FRONTEND_URL no .env do backend'
$envProd = Join-Path $Backend '.env'
$novaUrl = 'https://' + $Ip
$texto = [IO.File]::ReadAllText($envProd)
if ($texto -match '(?m)^\s*FRONTEND_URL\s*=') {
    $texto = [regex]::Replace($texto, '(?m)^(\s*FRONTEND_URL\s*=).*?(\r?)$', ('${1}' + $novaUrl + '${2}'))
} else {
    $texto = $texto.TrimEnd() + "`r`nFRONTEND_URL=" + $novaUrl + "`r`n"
}
Gravar-TextoUtf8 $envProd $texto
Escrever-Ok ('FRONTEND_URL = ' + $novaUrl)
Restart-Service $NomeServico -Force
Escrever-Ok ('servico ' + $NomeServico + ': ' + (Get-Service $NomeServico).Status)

# ---------------------------------------------------------------- 4) testes
Escrever-Passo 'Testando'
Start-Sleep -Seconds 5
$home_ = & curl.exe -s -o NUL -w '%{http_code}' --cacert (Join-Path $Certs 'PulynCA.cer') ('https://' + $Ip + '/')
$api   = & curl.exe -s -o NUL -w '%{http_code}' --cacert (Join-Path $Certs 'PulynCA.cer') ('https://' + $Ip + '/api/rota-que-nao-existe')
if ($home_ -eq '200') { Escrever-Ok ('https://' + $Ip + '/ respondeu 200') } else { Escrever-Aviso ('https://' + $Ip + '/ respondeu ' + $home_ + ' (o IP esta mesmo neste computador?)') }
if ($api -eq '404') { Escrever-Ok 'API passando pelo IIS ate o backend' } else { Escrever-Aviso ('API respondeu ' + $api + ' (esperado 404 para rota inexistente)') }

Write-Host ''
Write-Host ('Pronto. Acesse https://' + $Ip + '/') -ForegroundColor Green
Write-Host 'Proximos passos: reconfigurar cada ESP32 pelo portal (Wi-Fi novo + servidor https://' -NoNewline -ForegroundColor Yellow
Write-Host ($Ip + ') e instalar PulynCA.cer nos aparelhos que ainda nao tem.') -ForegroundColor Yellow
