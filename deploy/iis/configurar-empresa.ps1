# configurar-empresa.ps1 - troca, num Pulyn ja instalado, o ID da empresa e a conexao da nuvem (sem abrir o .env).
# O setup.exe roda este script antes de atualizar, quando a pessoa muda a tela "Empresa do buffet". Rode como Administrador.
#
# Entradas (variaveis de ambiente, nunca na linha de comando, porque a conexao tem senha):
#   PULYN_EMPRESA_ID   id da empresa do buffet
#   PULYN_NUVEM_URL    conexao (postgresql://...) do usuario desse buffet na nuvem
#
# O que faz:
#   1. confere na nuvem se a conexao funciona e se a empresa existe (carga-empresa.js --conferir, da versao instalada);
#   2. grava no .env SYNC_EMPRESA_ID, SYNC_NUVEM_URL e SYNC_ENABLED=1 (as outras linhas ficam como estao);
#   3. reinicia o servico PulynBackend.
# Nao copia dados: o banco local continua com o que ja tinha. Se nada mudou, nao mexe em nada.
param([switch]$SemPausa)
. "$PSScriptRoot\config.ps1"
Exigir-Admin

$empresaId = ([string]$env:PULYN_EMPRESA_ID).Trim()
$nuvemUrl = ([string]$env:PULYN_NUVEM_URL).Trim()
$envProd = Join-Path $Backend '.env'

# Grava CHAVE=valor no .env: troca a linha da chave ou acrescenta no fim. (MatchEvaluator: um "$" na senha nao vira referencia.)
function Definir-Env($texto, $chave, $valor) {
    $padrao = '(?m)^[ \t]*' + [regex]::Escape($chave) + '[ \t]*=[^\r\n]*'
    $linha = $chave + '=' + $valor
    if ([regex]::IsMatch($texto, $padrao)) {
        return [regex]::Replace($texto, $padrao, [Text.RegularExpressions.MatchEvaluator] { param($m) $linha })
    }
    if ($texto -and -not $texto.EndsWith("`n")) { $texto += "`r`n" }
    return $texto + $linha + "`r`n"
}

# Confere a conexao e a empresa com o carga-empresa.js da versao instalada (ele usa o node_modules e o utils do backend).
function Conferir-Nuvem {
    $carga = Join-Path $Backend 'deploy\iis\carga-empresa.js'
    if (-not (Test-Path $carga)) {
        Escrever-Aviso 'a versao instalada nao tem o carga-empresa.js: a conexao nao foi conferida agora (o servico avisa no log se ela falhar)'
        return
    }
    $sslNuvem = Ler-Env $envProd 'SYNC_NUVEM_SSL'
    $env:SYNC_NUVEM_URL = $nuvemUrl
    $env:SYNC_EMPRESA_ID = $empresaId
    $env:SYNC_NUVEM_SSL = $(if ($sslNuvem) { $sslNuvem } else { 'true' })
    try {
        $saida = Executar-Nativo 'node' @($carga, '--conferir') 'A conferencia da nuvem falhou. Corrija o ID da empresa ou a conexao e rode de novo'
        $saida | Where-Object { $_ -and $_.Trim() } | ForEach-Object { Write-Host ('    ' + $_) }
    } finally { Remove-Item Env:\SYNC_NUVEM_URL, Env:\SYNC_EMPRESA_ID, Env:\SYNC_NUVEM_SSL -ErrorAction SilentlyContinue }
    Escrever-Ok 'nuvem e empresa conferidas'
}

$sucesso = $false
try {
    Escrever-Passo 'Empresa e conexao da nuvem'
    if (-not (Test-Path $envProd)) { throw ('O Pulyn nao esta instalado neste computador (falta ' + $envProd + ').') }
    if (-not $empresaId -or -not $nuvemUrl) { throw 'Falta o ID da empresa ou a conexao da nuvem (PULYN_EMPRESA_ID e PULYN_NUVEM_URL).' }
    if ($empresaId -notmatch '^[^\s"''\\/]+$') { throw 'O ID da empresa nao pode ter espacos, aspas nem barras.' }
    if ($nuvemUrl -notmatch '^postgres(ql)?://[^\s"'']+@[^\s"'']+$') { throw 'A conexao da nuvem deve comecar com postgresql:// e nao pode ter espacos nem aspas.' }

    $idAtual = Ler-Env $envProd 'SYNC_EMPRESA_ID'
    $urlAtual = Ler-Env $envProd 'SYNC_NUVEM_URL'
    $ligado = (Ler-Env $envProd 'SYNC_ENABLED') -eq '1'

    if (($idAtual -ceq $empresaId) -and ($urlAtual -ceq $nuvemUrl) -and $ligado) {
        Escrever-Ok ('nada mudou: empresa ' + $empresaId + ', sincronizacao ligada')
    } else {
        if ($idAtual -and ($idAtual -cne $empresaId)) {
            Escrever-Aviso ('a empresa muda de ' + $idAtual + ' para ' + $empresaId + '. O banco deste computador continua com os dados que ja tinha.')
        }
        Conferir-Nuvem

        # O arquivo e reescrito no lugar: as permissoes dele (so administradores) continuam as mesmas.
        $texto = [IO.File]::ReadAllText($envProd)
        $texto = Definir-Env $texto 'SYNC_EMPRESA_ID' $empresaId
        $texto = Definir-Env $texto 'SYNC_NUVEM_URL' $nuvemUrl
        $texto = Definir-Env $texto 'SYNC_ENABLED' '1'
        Gravar-TextoUtf8 $envProd $texto
        Escrever-Ok ('.env atualizado: SYNC_EMPRESA_ID=' + $empresaId + ', SYNC_NUVEM_URL (conexao informada) e SYNC_ENABLED=1')

        # O servico le o .env so quando inicia.
        if (Get-Service $NomeServico -ErrorAction SilentlyContinue) {
            Restart-Service $NomeServico -Force
            Escrever-Ok ('servico ' + $NomeServico + ' reiniciado')
        } else {
            Escrever-Aviso ('o servico ' + $NomeServico + ' nao existe: o .env vale quando ele for criado')
        }
    }
    $sucesso = $true
} catch {
    Write-Host ''
    Write-Host ('ERRO: ' + $_.Exception.Message) -ForegroundColor Red
}

if (-not $SemPausa) { Read-Host 'Pressione Enter para fechar' | Out-Null }
if ($sucesso) { exit 0 } else { exit 1 }
