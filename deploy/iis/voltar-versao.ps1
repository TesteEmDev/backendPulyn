# voltar-versao.ps1 - volta o Pulyn para a versao que estava no ar antes da ultima atualizacao (Administrador).
# E o que a opcao "Voltar a versao anterior" do setup roda. Nao precisa de internet.
#   1. confere a versao guardada em C:\Pulyn\anterior (cada atualizacao guarda ali a versao que estava no ar)
#   2. faz backup do banco
#   3. troca o backend, as telas e os scripts pela versao guardada; a versao que estava no ar fica guardada no lugar dela
#      (rodar de novo volta para ela)
#   4. testa o backend; se ele nao subir, desfaz a troca e o sistema continua como estava
# O banco de dados NAO volta: os dados continuam como estao. O .env, as senhas e o certificado tambem nao mudam.
#
#   -SemPausa   nao espera Enter no final
param([switch]$SemPausa)
. "$PSScriptRoot\config.ps1"
Exigir-Admin

foreach ($p in $Raiz, $Logs) { if (-not (Test-Path $p)) { New-Item -ItemType Directory -Path $p | Out-Null } }
$log = Join-Path $Logs ('voltar-versao-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.log')
Start-Transcript -Path $log -Append | Out-Null
$troca = Join-Path $Raiz 'anterior-troca'
$sucesso = $false
# Enquanto for $true, $troca e a unica copia da versao que estava no ar: nao pode ser apagada.
$trocaNecessaria = $false
# Etapas numeradas: o setup.exe usa o [n/4] para a barra de progresso.
$passo = 0
function Proximo-Passo($texto) {
    $script:passo++
    Write-Host ''
    Write-Host ('[' + $script:passo + '/4] ' + $texto) -ForegroundColor Magenta
}

function Primeira-Linha($arquivo) {
    if (-not (Test-Path $arquivo)) { return '(versao sem identificacao)' }
    $l = @(Get-Content $arquivo -Encoding UTF8 | Where-Object { $_.Trim() })
    if ($l.Count -eq 0) { return '(versao sem identificacao)' }
    return $l[0].Trim()
}

function Parar-Servico {
    $svc = Get-Service $NomeServico -ErrorAction SilentlyContinue
    if ($svc -and $svc.Status -ne 'Stopped') { Stop-Service $NomeServico -Force; $svc.WaitForStatus('Stopped', '00:00:30') }
}

function Backend-Responde {
    for ($i = 0; $i -lt 40; $i++) {
        $codigo = & curl.exe -s -o NUL -w '%{http_code}' ('http://127.0.0.1:' + $PortaBackend + '/api/internal/pool-stats')
        if ($codigo -eq '200') { return $true }
        Start-Sleep -Seconds 1
    }
    return $false
}

# Desfaz a troca: poe de volta a versao que estava no ar (guardada em $troca).
function Desfazer-Troca {
    Write-Host '    desfazendo a troca...'
    Parar-Servico
    Restaurar-Publicado $troca
    Start-Service $NomeServico
    $script:trocaNecessaria = $false
}

try {
    Write-Host ''
    Write-Host 'VOLTAR A VERSAO ANTERIOR do Pulyn (nao precisa de internet).' -ForegroundColor Cyan
    Write-Host 'O banco de dados, as senhas e o certificado ficam como estao.' -ForegroundColor Cyan
    Write-Host ('Registro: ' + $log)

    Proximo-Passo 'Conferindo a versao anterior'
    if (-not (Test-Path (Join-Path $Backend '.env'))) { throw 'O Pulyn nao esta instalado neste computador (falta C:\Pulyn\backend\.env).' }
    if (-not (Versao-Completa $Anterior)) { throw ('Nao ha versao anterior guardada em ' + $Anterior + '. Ela e guardada a cada atualizacao.') }
    if (Versao-Completa $troca) {
        throw ('Uma troca de versao anterior nao terminou e deixou uma copia em ' + $troca + '. Confira qual versao esta no ar e apague essa pasta antes de tentar de novo.')
    }
    $versaoAgora = Primeira-Linha $ArquivoVersao
    $versaoAnterior = Primeira-Linha (Join-Path $Anterior 'VERSAO.txt')
    Escrever-Ok ('no ar agora: ' + $versaoAgora)
    Escrever-Ok ('vai voltar para: ' + $versaoAnterior)

    Proximo-Passo 'Backup do banco'
    & "$PSScriptRoot\backup-banco.ps1"

    Proximo-Passo 'Trocando pela versao anterior'
    # Primeiro guarda a versao que esta no ar: se algo der errado, ela volta; se der certo, vira a "anterior".
    if (Test-Path $troca) { Remove-Item $troca -Recurse -Force }
    Guardar-Publicado $troca
    Escrever-Ok 'versao atual guardada'
    $trocaNecessaria = $true
    Parar-Servico
    try {
        Restaurar-Publicado $Anterior
    } catch {
        $motivo = $_.Exception.Message
        try { Desfazer-Troca } catch { Escrever-Aviso ('nao consegui desfazer a troca: ' + $_.Exception.Message) }
        throw ('Nao consegui trocar os arquivos (' + $motivo + '). O sistema continuou na versao que estava.')
    }
    Start-Service $NomeServico
    Escrever-Ok 'arquivos trocados e servico iniciado'

    Proximo-Passo 'Testando'
    if (-not (Backend-Responde)) {
        Escrever-Aviso 'a versao anterior nao respondeu em 40 s'
        Get-ChildItem $Logs -Filter ($NomeServico + '*.log') | Sort-Object LastWriteTime -Descending | Select-Object -First 1 | ForEach-Object {
            Get-Content $_.FullName -Tail 15 | ForEach-Object { Write-Host ('    ' + $_) }
        }
        Desfazer-Troca
        if (Backend-Responde) { throw 'A versao anterior nao funcionou neste computador. O sistema continuou na versao que estava.' }
        throw 'A versao anterior nao funcionou e a versao que estava tambem nao respondeu depois de desfazer a troca. Veja o registro.'
    }
    Escrever-Ok ('backend respondendo em 127.0.0.1:' + $PortaBackend)
    $pagina = & curl.exe -sk -o NUL -w '%{http_code}' ('https://127.0.0.1:' + $PortaHttps + '/')
    if ($pagina -eq '200') { Escrever-Ok 'site respondendo' } else { Escrever-Aviso ('a pagina inicial respondeu ' + $pagina) }

    # Deu certo: a versao que estava no ar passa a ser a "anterior" (rodar de novo volta para ela).
    Remove-Item $Anterior -Recurse -Force
    Rename-Item $troca (Split-Path $Anterior -Leaf)
    $trocaNecessaria = $false

    $sucesso = $true
    Write-Host ''
    Write-Host '==================================================================' -ForegroundColor Green
    Write-Host (' Pulyn de volta a versao anterior: ' + $versaoAnterior) -ForegroundColor Green
    Write-Host '==================================================================' -ForegroundColor Green
    Write-Host ('A versao que estava no ar ficou guardada (' + $versaoAgora + '): rode esta opcao de novo para voltar a ela, ou use Atualizar.')
} catch {
    Write-Host ''
    Write-Host ('ERRO: ' + $_.Exception.Message) -ForegroundColor Red
    Write-Host ('O registro completo esta em ' + $log) -ForegroundColor Yellow
} finally {
    if ($trocaNecessaria) { Write-Host ('atencao: a versao que estava no ar ficou guardada em ' + $troca + ' (nao apague).') -ForegroundColor Yellow }
    elseif (Test-Path $troca) { try { Remove-Item $troca -Recurse -Force } catch { } }
    Stop-Transcript | Out-Null
}

if (-not $SemPausa) { Read-Host 'Pressione Enter para fechar' | Out-Null }
if ($sucesso) { exit 0 } else { exit 1 }
