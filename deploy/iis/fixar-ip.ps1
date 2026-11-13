# fixar-ip.ps1 - deixa o IP desta maquina fixo no Windows (desliga o DHCP da placa de rede principal), mantendo a
# mascara, o gateway e o DNS que ela usa agora. Rode como Administrador. O setup.exe roda este script quando a pessoa
# marca "Fixar este IP no Windows".
# Prefira a reserva de DHCP no roteador. Use isto quando nao der para mexer no roteador, e escolha um IP FORA da faixa que
# o roteador distribui: senao ele pode entregar o mesmo IP a outro aparelho e os dois ficam sem rede.
#
#   -Ip        IP que a maquina deve ter (padrao: o atual). Precisa estar na mesma rede da placa.
#   -Simular   so mostra o que seria feito, sem mudar nada (nao precisa de administrador)
#   -Desfazer  volta a placa para o IP automatico (DHCP)
param([string]$Ip, [switch]$Simular, [switch]$Desfazer)
. "$PSScriptRoot\config.ps1"
if (-not $Simular) { Exigir-Admin }

function Ip-Numero([string]$texto) {
    $b = ([Net.IPAddress]::Parse($texto)).GetAddressBytes()
    return ([int64]$b[0] * 16777216) + ([int64]$b[1] * 65536) + ([int64]$b[2] * 256) + [int64]$b[3]
}
function Mesma-Rede([string]$a, [string]$b, [int]$prefixo) {
    $bloco = [int64][math]::Pow(2, 32 - $prefixo)
    return [math]::Floor((Ip-Numero $a) / $bloco) -eq [math]::Floor((Ip-Numero $b) / $bloco)
}
function Prefixo-Mascara([int]$prefixo) {
    $n = [int64][math]::Pow(2, 32) - [int64][math]::Pow(2, 32 - $prefixo)
    return ((24, 16, 8, 0) | ForEach-Object { [string](([int64][math]::Floor($n / [math]::Pow(2, $_))) % 256) }) -join '.'
}
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
if ($dns.Count -eq 0) { $dns = @($gateway) }
$dhcp = (Get-NetIPInterface -InterfaceIndex $idx -AddressFamily IPv4).Dhcp

if ($Desfazer) {
    if ($Simular) { Escrever-Ok ('a placa "' + $placa + '" voltaria para o IP automatico'); return }
    Voltar-Dhcp $idx
    Escrever-Ok ('placa "' + $placa + '" de volta ao IP automatico (DHCP)')
    return
}

if (-not $Ip) { $Ip = $ipAtual }
if ($Ip -notmatch '^\d{1,3}(\.\d{1,3}){3}$') { throw ('IP invalido: ' + $Ip) }
if (-not (Mesma-Rede $Ip $ipAtual $prefixo)) {
    throw ('O IP ' + $Ip + ' nao e da rede desta maquina (' + $ipAtual + '/' + $prefixo + '). Use um IP que comece igual ao atual.')
}
if ($Ip -eq $gateway) { throw ('O IP ' + $Ip + ' e o do roteador. Escolha outro.') }
$mascara = Prefixo-Mascara $prefixo
Write-Host ('    placa "' + $placa + '": IP ' + $Ip + ', mascara ' + $mascara + ', gateway ' + $gateway + ', DNS ' + ($dns -join ', '))

if ($dhcp -eq 'Disabled' -and $Ip -eq $ipAtual) { Escrever-Ok ('o IP ' + $Ip + ' ja esta fixo'); return }
if ($Ip -ne $ipAtual -and (Test-Connection -ComputerName $Ip -Count 2 -Quiet)) {
    throw ('O IP ' + $Ip + ' ja esta sendo usado por outro aparelho da rede. Escolha outro.')
}
if ($Simular) { Escrever-Ok ('(simulacao) o DHCP da placa seria desligado e o IP ' + $Ip + ' ficaria fixo'); return }

try {
    Set-NetIPInterface -InterfaceIndex $idx -AddressFamily IPv4 -Dhcp Disabled
    Get-NetIPAddress -InterfaceIndex $idx -AddressFamily IPv4 -ErrorAction SilentlyContinue | Remove-NetIPAddress -Confirm:$false -ErrorAction SilentlyContinue
    Get-NetRoute -InterfaceIndex $idx -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Remove-NetRoute -Confirm:$false -ErrorAction SilentlyContinue
    New-NetIPAddress -InterfaceIndex $idx -AddressFamily IPv4 -IPAddress $Ip -PrefixLength $prefixo -DefaultGateway $gateway | Out-Null
    Set-DnsClientServerAddress -InterfaceIndex $idx -ServerAddresses $dns
    # Espera o Windows ativar o endereco (se outro aparelho ja usa o IP, ele fica "Duplicate" e nunca ativa).
    $ativo = $false
    for ($t = 0; $t -lt 20 -and -not $ativo; $t++) {
        Start-Sleep -Seconds 1
        $ativo = [bool](Get-NetIPAddress -InterfaceIndex $idx -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -eq $Ip -and $_.AddressState -eq 'Preferred' })
    }
    if (-not $ativo) { throw ('o Windows nao ativou o IP ' + $Ip + ' (outro aparelho da rede pode estar usando)') }
} catch {
    $motivo = $_.Exception.Message
    try { Voltar-Dhcp $idx } catch { }
    throw ('Nao consegui fixar o IP: ' + $motivo + '. A placa voltou para o IP automatico.')
}
Escrever-Ok ('IP ' + $Ip + ' fixo na placa "' + $placa + '" (DHCP desligado)')
if (Test-Connection -ComputerName $gateway -Count 2 -Quiet) { Escrever-Ok ('roteador ' + $gateway + ' respondendo') }
else { Escrever-Aviso ('o roteador ' + $gateway + ' nao respondeu ao ping (alguns roteadores nao respondem; confira a internet)') }
