# 03-certificado.ps1 - cria a autoridade certificadora propria (CA) e o certificado HTTPS do servidor
# (rode como Administrador). HTTPS e necessario para o tablet ler NFC (Web NFC so funciona em contexto seguro).
# A CA fica confiavel neste computador; para os tablets, instale C:\Pulyn\certs\PulynCA.cer (veja README-IIS.md).
# Rode de novo (com -Renovar) se o IP do servidor mudar ou o certificado estiver perto de vencer.
param(
    [string]$Ip,            # IP do servidor na rede (padrao: detectado). Deve ser fixo/reservado no roteador.
    [string]$Nome,          # nome opcional (ex.: pulyn.local) para tambem constar no certificado
    [switch]$Renovar        # emite um certificado novo mesmo que o atual ainda sirva
)
. "$PSScriptRoot\config.ps1"
Exigir-Admin

if (-not $Ip) { $Ip = Obter-IpLan }
Escrever-Passo ('Certificado para o IP ' + $Ip + $(if ($Nome) { ' e o nome ' + $Nome } else { '' }))
foreach ($p in $Raiz, $Certs) { if (-not (Test-Path $p)) { New-Item -ItemType Directory -Path $p | Out-Null } }

# 1) CA propria (10 anos). Reaproveita se ja existir.
$ca = Get-ChildItem Cert:\LocalMachine\My | Where-Object { $_.Subject -eq ('CN=' + $NomeCa) -and $_.NotAfter -gt (Get-Date).AddDays(60) } |
      Sort-Object NotAfter -Descending | Select-Object -First 1
if ($ca) {
    Escrever-Ok ('CA existente (vence em ' + $ca.NotAfter.ToString('yyyy-MM-dd') + ')')
} else {
    $ca = New-SelfSignedCertificate -Subject ('CN=' + $NomeCa) -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 `
        -KeyUsage CertSign, CRLSign, DigitalSignature -KeyExportPolicy Exportable -CertStoreLocation Cert:\LocalMachine\My `
        -NotAfter (Get-Date).AddYears(10) -TextExtension @('2.5.29.19={critical}{text}CA=true')
    Escrever-Ok 'CA criada'
}
$arquivoCa = Join-Path $Certs 'PulynCA.cer'
Export-Certificate -Cert $ca -FilePath $arquivoCa -Type CERT | Out-Null
Copy-Item $arquivoCa (Join-Path $Certs 'PulynCA.crt') -Force
# Este computador passa a confiar na CA (assim o navegador daqui tambem aceita o site).
$jaConfiavel = Get-ChildItem Cert:\LocalMachine\Root | Where-Object { $_.Thumbprint -eq $ca.Thumbprint }
if (-not $jaConfiavel) { Import-Certificate -FilePath $arquivoCa -CertStoreLocation Cert:\LocalMachine\Root | Out-Null }
Escrever-Ok ('CA para os tablets: ' + $arquivoCa)

# 2) Certificado do servidor (825 dias: limite aceito por iOS/macOS), com o IP na lista de nomes (SAN).
$nomes = @('DNS=localhost', ('IPAddress=' + $Ip), 'IPAddress=127.0.0.1')
if ($Nome) { $nomes = @('DNS=' + $Nome) + $nomes }
$san = '2.5.29.17={text}' + ($nomes -join '&')

$srv = $null
if (-not $Renovar) {
    $srv = Get-ChildItem Cert:\LocalMachine\My | Where-Object {
        $_.Subject -eq ('CN=' + $NomeCertSrv) -and $_.NotAfter -gt (Get-Date).AddDays(30) -and $_.Issuer -eq $ca.Subject -and
        ($_.DnsNameList.Unicode -contains 'localhost') -and
        (($_.Extensions | Where-Object { $_.Oid.Value -eq '2.5.29.17' } | ForEach-Object { $_.Format($false) }) -match [regex]::Escape($Ip)) -and
        ((-not $Nome) -or ($_.DnsNameList.Unicode -contains $Nome))
    } | Sort-Object NotAfter -Descending | Select-Object -First 1
}
if ($srv) {
    Escrever-Ok ('certificado do servidor existente serve (vence em ' + $srv.NotAfter.ToString('yyyy-MM-dd') + '); use -Renovar para trocar')
} else {
    $srv = New-SelfSignedCertificate -Subject ('CN=' + $NomeCertSrv) -Signer $ca -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 `
        -KeyUsage DigitalSignature, KeyEncipherment -KeyExportPolicy Exportable -CertStoreLocation Cert:\LocalMachine\My `
        -NotAfter (Get-Date).AddDays(825) -TextExtension @($san, '2.5.29.37={text}1.3.6.1.5.5.7.3.1')
    Escrever-Ok ('certificado do servidor criado (vence em ' + $srv.NotAfter.ToString('yyyy-MM-dd') + ')')
}
Write-Host ('    nomes no certificado: ' + ($nomes -join ', '))
Write-Host ('    impressao digital: ' + $srv.Thumbprint)

Write-Host ''
Write-Host 'Pronto. Proximo passo: 04-publicar.ps1' -ForegroundColor Green
Write-Host ('Lembre: o IP ' + $Ip + ' precisa ser fixo (reserva de DHCP no roteador ou IP estatico), senao o certificado deixa de valer.') -ForegroundColor Yellow
