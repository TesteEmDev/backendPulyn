# config.ps1 - valores comuns dos scripts de implantacao no IIS (use com: . "$PSScriptRoot\config.ps1").
# Os scripts sao ASCII de proposito: o Windows PowerShell 5.1 le arquivos sem BOM como ANSI.
$ErrorActionPreference = 'Stop'

$Raiz         = 'C:\Pulyn'
$Backend      = Join-Path $Raiz 'backend'       # codigo do backend + .env de producao
$Site         = Join-Path $Raiz 'site'          # build do frontend + web.config
$Servico      = Join-Path $Raiz 'servico'       # executavel do servico do Windows (WinSW)
$Logs         = Join-Path $Raiz 'logs'
$Backups      = Join-Path $Raiz 'backups'
$Certs        = Join-Path $Raiz 'certs'
$Instaladores = Join-Path $Raiz 'instaladores'
$Scripts      = Join-Path $Raiz 'scripts'       # copia destes scripts (usada pela tarefa de backup)

$NomeSite     = 'Pulyn'
$NomePool     = 'Pulyn'
$NomeServico  = 'PulynBackend'
$PortaBackend = 3100                            # so escuta em 127.0.0.1; quem fala com a rede e o IIS
$PortaHttps   = 443

$BancoProd    = 'AdvPulyn'
$BancoOrigem  = 'AdvPulynDev'
$UsuarioApp   = 'pulyn_app'

$PgBin        = 'C:\Program Files\PostgreSQL\18\bin'
$PgServico    = 'postgresql-x64-18'

$NomeCa       = 'Pulyn Local CA'
$NomeCertSrv  = 'Pulyn Servidor'

# Pasta do repositorio (so existe quando o script roda de dentro dele, nao na copia em C:\Pulyn\scripts).
$RepoRaiz = $null
try { $RepoRaiz = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..') -ErrorAction Stop).Path } catch { }
if ($RepoRaiz -and -not (Test-Path (Join-Path $RepoRaiz 'backendPulyn\index.js'))) { $RepoRaiz = $null }
$RepoBackend  = if ($RepoRaiz) { Join-Path $RepoRaiz 'backendPulyn' } else { $null }
$RepoFront    = if ($RepoRaiz) { Join-Path $RepoRaiz 'front-pulyn' } else { $null }

function Exigir-Admin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    if (-not ([Security.Principal.WindowsPrincipal]$id).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Este script precisa rodar como Administrador (botao direito no PowerShell > Executar como administrador).'
    }
}

function Exigir-Repo {
    if (-not $RepoRaiz) { throw 'Rode este script a partir da pasta backendPulyn\deploy\iis do repositorio.' }
}

function Escrever-Passo($texto) { Write-Host ''; Write-Host ('==> ' + $texto) -ForegroundColor Cyan }
function Escrever-Ok($texto)    { Write-Host ('    ok: ' + $texto) -ForegroundColor Green }
function Escrever-Aviso($texto) { Write-Host ('    atencao: ' + $texto) -ForegroundColor Yellow }

# Se o comando nativo anterior falhou, interrompe com a mensagem.
function Conferir-Saida($mensagem) {
    if ($LASTEXITCODE -ne 0) { throw ($mensagem + ' (codigo ' + $LASTEXITCODE + ')') }
}

function Novo-Segredo([int]$bytes = 24) {
    $b = New-Object byte[] $bytes
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($b); $rng.Dispose()
    return (($b | ForEach-Object { $_.ToString('x2') }) -join '')
}

# IPv4 da placa que tem rota para a rede (ignora adaptadores virtuais sem gateway).
function Obter-IpLan {
    $cfg = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } | Select-Object -First 1
    if (-not $cfg) { throw 'Nao achei a placa de rede principal. Informe o IP com -Ip.' }
    return $cfg.IPv4Address[0].IPAddress
}

# Le CHAVE=valor de um arquivo .env (sem aspas), ou $null.
function Ler-Env($arquivo, $chave) {
    if (-not (Test-Path $arquivo)) { return $null }
    foreach ($linha in Get-Content $arquivo -Encoding UTF8) {
        if ($linha -match ('^\s*' + [regex]::Escape($chave) + '\s*=\s*(.*)$')) { return $Matches[1].Trim().Trim('"').Trim("'") }
    }
    return $null
}

# Quebra postgresql://usuario:senha@host:porta/banco em partes.
function Ler-UrlPostgres($url) {
    if ($url -notmatch '^postgres(?:ql)?://([^:@]+):([^@]*)@([^:/]+)(?::(\d+))?/([^?]+)') { return $null }
    $porta = if ($Matches[4]) { $Matches[4] } else { '5432' }
    return @{
        Usuario = [uri]::UnescapeDataString($Matches[1]); Senha = [uri]::UnescapeDataString($Matches[2])
        Servidor = $Matches[3]; Porta = $porta; Banco = $Matches[5]
    }
}

function Gravar-TextoUtf8($caminho, $texto) {
    [IO.File]::WriteAllText($caminho, $texto, (New-Object Text.UTF8Encoding($false)))
}
