# desinstalar.ps1 - remove o Pulyn deste computador (Administrador). E o que o desinstalador do setup.exe roda.
# Remove: servico PulynBackend, site e pool "Pulyn" no IIS (e o certificado associado a porta 443), regras de firewall do
# Pulyn, tarefa de backup, certificados do Pulyn (CA e servidor) e as pastas em C:\Pulyn.
# NAO remove: Node.js, PostgreSQL, os recursos do IIS, URL Rewrite e ARR (podem servir a outros sites, como o "suporte"),
# nem a pasta C:\Pulyn\backups.
#
#   -ApagarBanco  apaga tambem o banco AdvPulyn (TODOS os dados). Antes faz um backup em C:\Pulyn\backups.
#                 Sem esta opcao o banco fica, e o C:\Pulyn\backend\.env tambem (tem a senha do banco): instalar de novo
#                 depois volta o sistema com os mesmos dados.
#   -Sim          nao pede confirmacao (o desinstalador do setup ja perguntou)
#   -SemPausa     nao espera Enter no final
param([switch]$ApagarBanco, [switch]$Sim, [switch]$SemPausa)
. "$PSScriptRoot\config.ps1"
Exigir-Admin
try { $Host.UI.RawUI.WindowTitle = 'Pulyn - desinstalacao' } catch { }

$log =Join-Path $env:TEMP ('pulyn-desinstalacao-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.log')
Start-Transcript -Path $log -Append | Out-Null
$envProd = Join-Path $Backend '.env'
$sucesso = $false
$avisos = 0

# Cada etapa continua mesmo que outra falhe: a ideia e tirar o maximo possivel e dizer o que sobrou.
# Etapas numeradas: o setup.exe usa o [n/total] para a barra de progresso.
$totalEtapas = if ($ApagarBanco) { 7 } else { 6 }
$etapa = 0
function Etapa($texto, [scriptblock]$acao) {
    $script:etapa++
    Write-Host ''
    Write-Host ('[' + $script:etapa + '/' + $totalEtapas + '] ' + $texto) -ForegroundColor Cyan
    try { & $acao } catch { $script:avisos++; Escrever-Aviso ($_.Exception.Message) }
}

try {
    if (-not $Sim) {
        Write-Host ''
        Write-Host 'Isto remove o Pulyn deste computador (servico, site no IIS, certificados e arquivos).' -ForegroundColor Yellow
        if ($ApagarBanco) { Write-Host 'O BANCO DE DADOS TAMBEM SERA APAGADO (com backup antes).' -ForegroundColor Red }
        $resp = Read-Host 'Continuar? (S/N)'
        if ($resp -notmatch '^[sS]') { Write-Host 'Cancelado.'; $sucesso = $true; return }
    }

    Etapa 'Parando o servico PulynBackend' {
        $svc = Get-Service $NomeServico -ErrorAction SilentlyContinue
        if (-not $svc) { Escrever-Ok 'o servico nao existe'; return }
        if ($svc.Status -ne 'Stopped') { Stop-Service $NomeServico -Force; $svc.WaitForStatus('Stopped', '00:00:30') }
        Escrever-Ok 'parado'
    }

    $bancoApagado = $false
    if ($ApagarBanco) {
        Etapa 'Banco de dados: backup e remocao' {
            $url = Ler-Env $envProd 'DATABASE_URL'
            $c = if ($url) { Ler-UrlPostgres $url } else { $null }
            if (-not $c) { throw ('nao achei o DATABASE_URL em ' + $envProd + ': o banco NAO foi apagado (remova pelo pgAdmin se quiser).') }
            # Sem backup, nao apaga: se o backup falhar, a excecao para esta etapa aqui.
            & "$PSScriptRoot\backup-banco.ps1" -Dias 36500
            $env:PGPASSWORD = $c.Senha
            try {
                # O dono do banco (pulyn_app) pode apaga-lo, conectado em outro banco.
                & (Join-Path $PgBin 'psql.exe') -h $c.Servidor -p $c.Porta -U $c.Usuario -d postgres -v ON_ERROR_STOP=1 -q -c ('drop database "' + $c.Banco + '"')
                Conferir-Saida ('o banco ' + $c.Banco + ' NAO foi apagado (feche o pgAdmin ou outra conexao com ele). O backup ficou em ' + $Backups)
            } finally { $env:PGPASSWORD = $null }
            $script:bancoApagado = $true
            Escrever-Ok ('banco ' + $c.Banco + ' apagado (o backup ficou em ' + $Backups + ')')
            Escrever-Ok ('o usuario ' + $c.Usuario + ' continua no PostgreSQL, sem banco; uma instalacao nova troca a senha dele')
        }
    }

    Etapa 'Removendo o servico' {
        if (-not (Get-Service $NomeServico -ErrorAction SilentlyContinue)) { Escrever-Ok 'o servico nao existe'; return }
        $exe = Join-Path $Servico ($NomeServico + '.exe')
        if (Test-Path $exe) { & $exe uninstall | Out-Null } else { & sc.exe delete $NomeServico | Out-Null }
        Start-Sleep -Seconds 2
        if (Get-Service $NomeServico -ErrorAction SilentlyContinue) { throw 'o servico ainda aparece (sera removido ao reiniciar o Windows)' }
        Escrever-Ok 'servico removido'
    }

    Etapa 'Removendo o site do IIS' {
        Import-Module WebAdministration
        # Certificado na porta HTTPS: so tira se for o do Pulyn.
        $sslPath = 'IIS:\SslBindings\0.0.0.0!' + $PortaHttps
        if (Test-Path $sslPath) {
            $tp = (Get-Item $sslPath).Thumbprint
            $cert = Get-ChildItem Cert:\LocalMachine\My | Where-Object { $_.Thumbprint -eq $tp }
            if ($cert -and $cert.Subject -eq ('CN=' + $NomeCertSrv)) { Remove-Item $sslPath -Force; Escrever-Ok ('certificado tirado da porta ' + $PortaHttps) }
        }
        if (Get-Website -Name $NomeSite -ErrorAction SilentlyContinue) { Remove-Website -Name $NomeSite; Escrever-Ok ('site ' + $NomeSite + ' removido') } else { Escrever-Ok 'o site nao existe' }
        if (Test-Path ('IIS:\AppPools\' + $NomePool)) { Remove-WebAppPool -Name $NomePool; Escrever-Ok ('pool ' + $NomePool + ' removido') }
    }

    Etapa 'Firewall e tarefa de backup' {
        foreach ($regra in 'Pulyn HTTPS', 'Pulyn HTTP UHF') {
            if (Get-NetFirewallRule -DisplayName $regra -ErrorAction SilentlyContinue) { Remove-NetFirewallRule -DisplayName $regra; Escrever-Ok ('regra "' + $regra + '" removida') }
        }
        $tarefa = 'Pulyn - backup do banco'
        if (Get-ScheduledTask -TaskName $tarefa -ErrorAction SilentlyContinue) { Unregister-ScheduledTask -TaskName $tarefa -Confirm:$false; Escrever-Ok 'tarefa de backup removida' }
    }

    Etapa 'Certificados do Pulyn' {
        $qtd = 0
        foreach ($loja in 'Cert:\LocalMachine\My', 'Cert:\LocalMachine\Root') {
            Get-ChildItem $loja | Where-Object { $_.Subject -eq ('CN=' + $NomeCertSrv) -or $_.Subject -eq ('CN=' + $NomeCa) } | ForEach-Object {
                Remove-Item (Join-Path $loja $_.Thumbprint) -Force -DeleteKey -ErrorAction SilentlyContinue
                if (Test-Path (Join-Path $loja $_.Thumbprint)) { Remove-Item (Join-Path $loja $_.Thumbprint) -Force }
                $qtd++
            }
        }
        Escrever-Ok ([string]$qtd + ' certificado(s) removido(s). Nos tablets a CA antiga pode ser apagada nas configuracoes de seguranca.')
    }

    Etapa 'Apagando os arquivos em C:\Pulyn' {
        # Fica: backups, o pacote do setup (o proprio desinstalador apaga) e, se o banco ficou, o .env com a senha dele.
        $manterEnv = (-not $bancoApagado) -and (Test-Path $envProd)
        # fonte = repositorios baixados do GitHub (atualizacao pela internet); git = Git portatil
        # anterior = versao guardada para "Voltar a versao anterior"
        foreach ($pasta in $Site, (Join-Path $Raiz 'site-build'), $Servico, $Scripts, $Certs, $Instaladores, $Logs, (Join-Path $Raiz 'fonte'), (Join-Path $Raiz 'git'),
                           (Join-Path $Raiz 'anterior'), (Join-Path $Raiz 'anterior-troca')) {
            if (Test-Path $pasta) { Remove-Item $pasta -Recurse -Force }
        }
        if (Test-Path $Backend) {
            if ($manterEnv) {
                Get-ChildItem $Backend -Force | Where-Object { $_.Name -ne '.env' } | Remove-Item -Recurse -Force
                Escrever-Ok ('mantido ' + $envProd + ' (senha do banco que ficou)')
            } else { Remove-Item $Backend -Recurse -Force }
        }
        Escrever-Ok 'arquivos apagados'
    }

    $sucesso = ($avisos -eq 0)
    Write-Host ''
    if ($sucesso) { Write-Host 'Pulyn removido.' -ForegroundColor Green } else { Write-Host ('Pulyn removido, com ' + $avisos + ' aviso(s) acima.') -ForegroundColor Yellow }
    Write-Host ('Ficaram: Node.js, PostgreSQL, IIS (com URL Rewrite e ARR) e a pasta ' + $Backups + '.')
    if (-not $bancoApagado) { Write-Host ('O banco ' + $BancoProd + ' continua no PostgreSQL. Instalando o Pulyn de novo, o sistema volta com os mesmos dados.') }
} catch {
    Write-Host ''
    Write-Host ('ERRO: ' + $_.Exception.Message) -ForegroundColor Red
} finally {
    Write-Host ('Registro: ' + $log)
    Stop-Transcript | Out-Null
}

if (-not $SemPausa) { Read-Host 'Pressione Enter para fechar' | Out-Null }
if ($sucesso) { exit 0 } else { exit 1 }
