# fixar-ip.ps1 - passa o IP desta maquina de automatico (DHCP) para fixo, SEM mudar nada: o mesmo IP, a mesma mascara, o
# mesmo gateway e os mesmos DNS que a placa de rede principal usa agora. Rode como Administrador. O setup.exe roda este
# script quando a pessoa marca "Fixar o IP atual no Windows".
# O roteador nao fica sabendo: se puder, reserve tambem este IP nele, para ele nao entregar o mesmo IP a outro aparelho.
#
#   -Ip        so confere: se o IP atual da maquina nao for este, para com erro (nada e mudado)
#   -Simular   so mostra o que seria feito, sem mudar nada (nao precisa de administrador)
#   -Desfazer  volta a placa para o IP automatico (DHCP)
param([string]$Ip, [switch]$Simular, [switch]$Desfazer)
. "$PSScriptRoot\config.ps1"
if (-not $Simular) { Exigir-Admin }

# Volta a placa para o automatico (usado no -Desfazer e se algo der errado no meio).
function Voltar-Dhcp($idx) {
    Get-NetIPAddress -InterfaceIndex $idx -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.PrefixOrigin -eq 'Manual' } |
        Remove-NetIPAddress -Confirm:$false -ErrorAction SilentlyContinue
    Get-NetRoute -InterfaceIndex $idx -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0' -PolicyStore PersistentStore -ErrorAction SilentlyContinue |
        Remove-NetRoute -Confirm:$false -ErrorAction SilentlyContinue
    Set-NetIPInterface -InterfaceIndex $idx -AddressFamily IPv4 -Dhcp Enabled
    Set-DnsClientServerAddress -InterfaceIndex $idx -ResetServerAddresses
}

Escrever-Passo 'IP fixo no Windows'
$cfg = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } | Select-Object -First 1
if (-not $cfg) { throw 'Nao achei a placa de rede principal (ligada e com gateway).' }
$idx = $cfg.InterfaceIndex
$placa = $cfg.InterfaceAlias
$ipAtual = $cfg.IPv4Address[0].IPAddress
$prefixo = [int]$cfg.IPv4Address[0].PrefixLength
$gateway = @($cfg.IPv4DefaultGateway)[0].NextHop
$dns = @((Get-DnsClientServerAddress -InterfaceIndex $idx -AddressFamily IPv4).ServerAddresses | Where-Object { $_ })
$dhcp = (Get-NetIPInterface -InterfaceIndex $idx -AddressFamily IPv4).Dhcp

if ($Desfazer) {
    if ($Simular) { Escrever-Ok ('a placa "' + $placa + '" voltaria para o IP automatico'); return }
    Voltar-Dhcp $idx
    Escrever-Ok ('placa "' + $placa + '" de volta ao IP automatico (DHCP)')
    return
}

if ($Ip -and $Ip -ne $ipAtual) { throw ('O IP desta maquina agora e ' + $ipAtual + ', e nao ' + $Ip + '. Nada foi mudado.') }
if ($dns.Count -eq 0) { throw 'A placa nao tem DNS configurado; nada foi mudado.' }
Write-Host ('    placa "' + $placa + '": IP ' + $ipAtual + '/' + $prefixo + ', gateway ' + $gateway + ', DNS ' + ($dns -join ', '))
if ($dhcp -eq 'Disabled') { Escrever-Ok ('o IP ' + $ipAtual + ' ja esta fixo'); return }
if ($Simular) { Escrever-Ok '(simulacao) o IP passaria de automatico para fixo, com os mesmos valores'; return }

try {
    # Ao desligar o DHCP o Windows apaga o endereco que veio do roteador; ele e recriado logo em seguida, igual.
    Set-NetIPInterface -InterfaceIndex $idx -AddressFamily IPv4 -Dhcp Disabled
    Get-NetIPAddress -InterfaceIndex $idx -AddressFamily IPv4 -ErrorAction SilentlyContinue | Remove-NetIPAddress -Confirm:$false -ErrorAction SilentlyContinue
    Get-NetRoute -InterfaceIndex $idx -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Remove-NetRoute -Confirm:$false -ErrorAction SilentlyContinue
    New-NetIPAddress -InterfaceIndex $idx -AddressFamily IPv4 -IPAddress $ipAtual -PrefixLength $prefixo -DefaultGateway $gateway | Out-Null
    Set-DnsClientServerAddress -InterfaceIndex $idx -ServerAddresses $dns
    $ativo = $false
    for ($t = 0; $t -lt 20 -and -not $ativo; $t++) {
        Start-Sleep -Seconds 1
        $ativo = [bool](Get-NetIPAddress -InterfaceIndex $idx -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -eq $ipAtual -and $_.AddressState -eq 'Preferred' })
    }
    if (-not $ativo) { throw ('o Windows nao ativou o IP ' + $ipAtual) }
} catch {
    $motivo = $_.Exception.Message
    try { Voltar-Dhcp $idx } catch { }
    throw ('Nao consegui fixar o IP: ' + $motivo + '. A placa voltou para o IP automatico.')
}
Escrever-Ok ('IP ' + $ipAtual + ' agora e fixo na placa "' + $placa + '" (mesma mascara, gateway e DNS)')
if (Test-Connection -ComputerName $gateway -Count 2 -Quiet) { Escrever-Ok ('roteador ' + $gateway + ' respondendo') }
else { Escrever-Aviso ('o roteador ' + $gateway + ' nao respondeu ao ping (alguns roteadores nao respondem; confira a internet)') }
