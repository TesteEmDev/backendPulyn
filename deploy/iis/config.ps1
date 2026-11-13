# config.ps1 - valores comuns dos scripts de implantacao no IIS (use com: . "$PSScriptRoot\config.ps1").
# Os scripts sao ASCII de proposito: o Windows PowerShell 5.1 le arquivos sem BOM como ANSI.
$ErrorActionPreference = 'Stop'

$Raiz         = if ($env:PULYN_RAIZ) { $env:PULYN_RAIZ } else { 'C:\Pulyn' }   # PULYN_RAIZ: so para ensaios
$Backend      = Join-Path $Raiz 'backend'       # codigo do backend + .env de producao
$Site         = Join-Path $Raiz 'site'          # build do frontend + web.config
$Servico      = Join-Path $Raiz 'servico'       # executavel do servico do Windows (WinSW)
$Logs         = Join-Path $Raiz 'logs'
$Backups      = Join-Path $Raiz 'backups'
$Certs        = Join-Path $Raiz 'certs'
$Instaladores = Join-Path $Raiz 'instaladores'
$Scripts      = Join-Path $Raiz 'scripts'       # copia destes scripts (usada pela tarefa de backup)
$Anterior     = Join-Path $Raiz 'anterior'      # versao que estava no ar antes da ultima atualizacao (voltar-versao.ps1)
$ArquivoVersao = Join-Path $Raiz 'pacote\VERSAO.txt'   # qual versao esta no ar (o setup mostra a primeira linha)

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
if ($RepoRaiz -and -not (Test-Path (Join-Path $RepoRaiz 'BackEnd\index.js'))) { $RepoRaiz = $null }
$RepoBackend  = if ($RepoRaiz) { Join-Path $RepoRaiz 'BackEnd' } else { $null }
$RepoFront    = if ($RepoRaiz) { Join-Path $RepoRaiz 'FrontEnd' } else { $null }

# Saida capturada (o setup.exe roda os scripts escondidos e mostra o andamento na propria tela): UTF-8, para os acentos
# das mensagens do Windows chegarem certos.
try { if ([Console]::IsOutputRedirected) { [Console]::OutputEncoding = New-Object Text.UTF8Encoding $false } } catch { }

function Exigir-Admin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    if (-not ([Security.Principal.WindowsPrincipal]$id).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Este script precisa rodar como Administrador (botao direito no PowerShell > Executar como administrador).'
    }
}

function Exigir-Repo {
    if (-not $RepoRaiz) { throw 'Rode este script a partir da pasta BackEnd\deploy\iis do repositorio.' }
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

function Achar-Git {
    $local = Join-Path $Raiz 'git\cmd\git.exe'
    if (Test-Path $local) { return $local }
    $cmd = Get-Command git -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    return $null
}

# ---------------------------------------------------------------- versao anterior (para poder voltar)
# robocopy /MIR: deixa $para igual a $de (apaga o que sobra), menos o que $extras excluir.
# /IS /IT: copia mesmo os arquivos com o mesmo tamanho e a mesma data. Sem isso o robocopy os pula, e o npm grava todo
# arquivo do node_modules com a mesma data (1985): uma dependencia que mudou sem mudar de tamanho ficaria misturada.
function Robocopiar($de, $para, [string[]]$extras = @()) {
    & robocopy $de $para /MIR /IS /IT /R:2 /W:2 /NFL /NDL /NJH /NJS /NP @extras | Out-Null
    $codigo = $LASTEXITCODE
    $global:LASTEXITCODE = 0
    if ($codigo -ge 8) { throw ('Falha ao copiar ' + $de + ' para ' + $para + ' (robocopy ' + $codigo + ')') }
}

# O que forma uma versao publicada: o backend (com node_modules, sem o .env), as telas, os scripts e o VERSAO.txt.
$ExcluirDoBackend = @('/XD', 'logs', '/XF', '.env', '.env.*', '*.log')

# Copia a versao que esta no ar para $destino (ex.: $Anterior).
function Guardar-Publicado($destino) {
    if (-not (Test-Path $destino)) { New-Item -ItemType Directory -Path $destino | Out-Null }
    Robocopiar $Backend (Join-Path $destino 'backend') $ExcluirDoBackend
    Robocopiar $Site (Join-Path $destino 'site')
    if (Test-Path $Scripts) { Robocopiar $Scripts (Join-Path $destino 'scripts') }
    $v = Join-Path $destino 'VERSAO.txt'
    if (Test-Path $ArquivoVersao) { Copy-Item $ArquivoVersao $v -Force } elseif (Test-Path $v) { Remove-Item $v -Force }
}

# Poe no ar a versao guardada em $origem. O .env do backend continua o mesmo. O servico precisa estar parado.
function Restaurar-Publicado($origem) {
    Robocopiar (Join-Path $origem 'backend') $Backend $ExcluirDoBackend
    Robocopiar (Join-Path $origem 'site') $Site
    if (Test-Path (Join-Path $origem 'scripts')) { Robocopiar (Join-Path $origem 'scripts') $Scripts }
    $v = Join-Path $origem 'VERSAO.txt'
    if (Test-Path $v) {
        $pasta = Split-Path $ArquivoVersao -Parent
        if (-not (Test-Path $pasta)) { New-Item -ItemType Directory -Path $pasta | Out-Null }
        Copy-Item $v $ArquivoVersao -Force
    }
}

# Uma pasta guardada so serve se tiver o backend e as telas.
function Versao-Completa($pasta) {
    return (Test-Path (Join-Path $pasta 'backend\index.js')) -and (Test-Path (Join-Path $pasta 'site\index.html'))
}

# Commit publicado de um repositorio ("BackEnd branch @ abc1234" no VERSAO.txt), ou $null.
function Commit-Publicado($nome) {
    if (-not (Test-Path $ArquivoVersao)) { return $null }
    foreach ($linha in Get-Content $ArquivoVersao -Encoding UTF8) {
        if ($linha -match ('^' + $nome + ' .* @ ([0-9a-f]{7,40})\s*$')) { return $Matches[1] }
    }
    return $null
}

# Todas as chaves que o backend le no .env de producao, na ordem do arquivo. Padrao vazio = o backend usa o valor
# padrao dele (todas sao lidas com "valor || padrao"). Secao = titulo de um bloco; Nota = comentario acima da chave.
function Modelo-Env {
    $m = @()
    $m += [pscustomobject]@{ Secao = 'Servidor' }
    $m += [pscustomobject]@{ Chave = 'NODE_ENV'; Padrao = 'production' }
    $m += [pscustomobject]@{ Chave = 'PORT'; Padrao = [string]$PortaBackend; Nota = 'Porta do Node (o IIS repassa para ela). Se mudar, mude tambem o web.config.' }
    $m += [pscustomobject]@{ Chave = 'HOST'; Padrao = '127.0.0.1' }
    $m += [pscustomobject]@{ Chave = 'FRONTEND_URL'; Padrao = ''; Nota = 'Endereco do site, usado nos QR codes e nos convites de familia. Se o IP mudar, use trocar-rede.ps1.' }
    $m += [pscustomobject]@{ Chave = 'CHECKPOINT_SERVER_URL'; Padrao = ''; Nota = 'Endereco que os checkpoints usam para falar com o servidor (ex.: https://192.168.0.50). Vazio: descobre sozinho.' }
    $m += [pscustomobject]@{ Chave = 'EVENT_TIMEZONE'; Padrao = 'America/Sao_Paulo'; Nota = 'Fuso horario dos eventos.' }
    $m += [pscustomobject]@{ Chave = 'EXIGIR_TELEFONE_RESPONSAVEL'; Padrao = '0'; Nota = '1 = o cadastro da familia exige o telefone do responsavel.' }
    $m += [pscustomobject]@{ Secao = 'Banco de dados (gerado pelo instalador: a senha tambem esta no PostgreSQL, nao mude so aqui)' }
    $m += [pscustomobject]@{ Chave = 'DB_DRIVER'; Padrao = 'postgres' }
    $m += [pscustomobject]@{ Chave = 'DATABASE_URL'; Padrao = '' }
    $m += [pscustomobject]@{ Chave = 'DB_SSL'; Padrao = 'false' }
    $m += [pscustomobject]@{ Chave = 'DB_TIMEOUT'; Padrao = '30000'; Nota = 'Tempo maximo para conectar, em milissegundos.' }
    $m += [pscustomobject]@{ Chave = 'PG_POOL_MAX'; Padrao = '10'; Nota = 'Maximo de conexoes abertas com o banco.' }
    $m += [pscustomobject]@{ Secao = 'Seguranca' }
    $m += [pscustomobject]@{ Chave = 'JWT_SECRET'; Padrao = ''; Nota = 'Assina os logins. Se mudar, todo mundo precisa entrar de novo.' }
    $m += [pscustomobject]@{ Secao = 'E-mail (Brevo): confirmacao de cadastro e "Esqueci minha senha". Vazio: nenhum e-mail e enviado' }
    $m += [pscustomobject]@{ Chave = 'BREVO_API_KEY'; Padrao = ''; Nota = 'Chave de API da conta Brevo.' }
    $m += [pscustomobject]@{ Chave = 'EMAIL_REMETENTE'; Padrao = ''; Nota = 'E-mail remetente ja validado no Brevo.' }
    $m += [pscustomobject]@{ Chave = 'EMAIL_REMETENTE_NOME'; Padrao = 'Pulyn'; Nota = 'Nome que aparece para quem recebe.' }
    $m += [pscustomobject]@{ Chave = 'EMAIL_LOGO_URL'; Padrao = ''; Nota = 'Endereco publico da logo usada nos e-mails. Vazio: logo padrao do Pulyn.' }
    $m += [pscustomobject]@{ Secao = 'Sincronizacao com a nuvem (Supabase). So UM backend pode sincronizar com a mesma nuvem (veja README-IIS.md)' }
    $m += [pscustomobject]@{ Chave = 'SYNC_ENABLED'; Padrao = '0'; Nota = '1 = liga a sincronizacao (precisa do SYNC_NUVEM_URL).' }
    $m += [pscustomobject]@{ Chave = 'SYNC_NUVEM_URL'; Padrao = ''; Nota = 'postgresql://usuario:senha@servidor:porta/banco da nuvem.' }
    $m += [pscustomobject]@{ Chave = 'SYNC_NUVEM_SSL'; Padrao = 'true' }
    $m += [pscustomobject]@{ Chave = 'SYNC_EMPRESA_ID'; Padrao = ''; Nota = 'Sincroniza so esta empresa. Vazio: todas.' }
    $m += [pscustomobject]@{ Chave = 'SYNC_INTERVALO_MS'; Padrao = '15000' }
    $m += [pscustomobject]@{ Chave = 'SYNC_LOTE'; Padrao = '500' }
    $m += [pscustomobject]@{ Chave = 'SYNC_RETENCAO_DIAS'; Padrao = '7' }
    $m += [pscustomobject]@{ Chave = 'SYNC_MARGEM_SEGUNDOS'; Padrao = '60' }
    $m += [pscustomobject]@{ Chave = 'SYNC_RECARGA'; Padrao = '0' }
    return $m
}

# Texto do .env completo. $Valores (hashtable CHAVE -> valor) substitui o padrao das chaves geradas na instalacao.
function Montar-Env([hashtable]$Valores, [string]$Cabecalho) {
    $linhas = @($Cabecalho, '# Valor vazio = o sistema usa o padrao. Depois de mudar algo: Restart-Service PulynBackend')
    foreach ($item in Modelo-Env) {
        if ($item.Secao) { $linhas += ''; $linhas += ('# --- ' + $item.Secao + ' ---'); continue }
        if ($item.Nota) { $linhas += ('# ' + $item.Nota) }
        $valor = if ($Valores -and $Valores.ContainsKey($item.Chave)) { [string]$Valores[$item.Chave] } else { $item.Padrao }
        $linhas += ($item.Chave + '=' + $valor)
    }
    return (($linhas -join "`r`n") + "`r`n")
}

# Acrescenta no fim de um .env existente as chaves do modelo que faltam nele (com o valor padrao, que equivale a nao ter
# a chave). Nao muda nem apaga nenhuma linha que ja existe. Devolve quantas chaves foram acrescentadas.
function Completar-Env($arquivo) {
    if (-not (Test-Path $arquivo)) { return 0 }
    $existentes = @{}
    foreach ($linha in Get-Content $arquivo -Encoding UTF8) {
        if ($linha -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=') { $existentes[$Matches[1]] = $true }
    }
    $novas = @()
    foreach ($item in Modelo-Env) {
        if ($item.Secao -or $existentes.ContainsKey($item.Chave)) { continue }
        if ($item.Nota) { $novas += ('# ' + $item.Nota) }
        $novas += ($item.Chave + '=' + $item.Padrao)
    }
    $qtd = @($novas | Where-Object { $_ -notlike '#*' }).Count
    if ($qtd -eq 0) { return 0 }
    $texto = Get-Content $arquivo -Raw -Encoding UTF8
    $inicio = if ($texto -and -not $texto.EndsWith("`n")) { "`r`n" } else { '' }
    $bloco = $inicio + "`r`n# --- Chaves acrescentadas em " + (Get-Date -Format 'dd/MM/yyyy HH:mm') +
             ' (valor vazio = o sistema usa o padrao) ---' + "`r`n" + ($novas -join "`r`n") + "`r`n"
    [IO.File]::AppendAllText($arquivo, $bloco, (New-Object Text.UTF8Encoding($false)))
    return $qtd
}
