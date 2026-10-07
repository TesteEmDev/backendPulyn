# status.ps1 - mostra se o Pulyn esta no ar (nao precisa de administrador, exceto para ler o IIS).
. "$PSScriptRoot\config.ps1"

function Linha($nome, $ok, $detalhe) {
    $cor = if ($ok) { 'Green' } else { 'Red' }
    Write-Host ('{0,-26}{1}  {2}' -f $nome, $(if ($ok) { 'OK ' } else { 'ERRO' }), $detalhe) -ForegroundColor $cor
}

$pg = Get-Service $PgServico -ErrorAction SilentlyContinue
Linha 'PostgreSQL' ($pg -and $pg.Status -eq 'Running') $(if ($pg) { [string]$pg.Status } else { 'servico nao encontrado' })
$sv = Get-Service $NomeServico -ErrorAction SilentlyContinue
Linha 'Servico PulynBackend' ($sv -and $sv.Status -eq 'Running') $(if ($sv) { [string]$sv.Status } else { 'nao instalado' })
$w3 = Get-Service W3SVC -ErrorAction SilentlyContinue
Linha 'IIS (W3SVC)' ($w3 -and $w3.Status -eq 'Running') $(if ($w3) { [string]$w3.Status } else { 'nao encontrado' })

$cod = & curl.exe -s -o NUL -w '%{http_code}' --max-time 5 ('http://127.0.0.1:' + $PortaBackend + '/api/internal/pool-stats')
Linha ('Backend :' + $PortaBackend) ($cod -eq '200') ('HTTP ' + $cod)
$cod = & curl.exe -sk -o NUL -w '%{http_code}' --max-time 5 ('https://127.0.0.1:' + $PortaHttps + '/')
Linha 'Site (HTTPS)' ($cod -eq '200') ('HTTP ' + $cod)
$corpo = & curl.exe -sk --max-time 5 ('https://127.0.0.1:' + $PortaHttps + '/api/rota-que-nao-existe')
Linha 'API pelo IIS' ($corpo -match 'Rota') ([string]$corpo)

$cert = Get-ChildItem Cert:\LocalMachine\My -ErrorAction SilentlyContinue | Where-Object { $_.Subject -eq ('CN=' + $NomeCertSrv) } | Sort-Object NotAfter -Descending | Select-Object -First 1
if ($cert) {
    $dias = [int]($cert.NotAfter - (Get-Date)).TotalDays
    Linha 'Certificado' ($dias -gt 30) ('vence em ' + $cert.NotAfter.ToString('yyyy-MM-dd') + ' (' + $dias + ' dias)')
} else { Linha 'Certificado' $false 'nao encontrado (03-certificado.ps1)' }

$ultimo = Get-ChildItem $Backups -Filter ($BancoProd + '-????????-????.dump') -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($ultimo) {
    $idade = [int]((Get-Date) - $ultimo.LastWriteTime).TotalHours
    Linha 'Ultimo backup' ($idade -lt 48) ($ultimo.Name + ' (ha ' + $idade + ' h)')
} else { Linha 'Ultimo backup' $false 'nenhum (backup-banco.ps1 -Agendar)' }

Write-Host ''
Write-Host ('IP atual: ' + (Obter-IpLan) + '   |   logs: ' + $Logs)
$log = Get-ChildItem $Logs -Filter ($NomeServico + '.out.log') -ErrorAction SilentlyContinue | Select-Object -First 1
if ($log) { Write-Host '--- ultimas linhas do log do backend'; Get-Content $log.FullName -Tail 8 }
