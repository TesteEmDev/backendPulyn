# atualizar.ps1 - publica uma versao nova (Administrador). Faz backup do banco, guarda a versao que esta no ar em
# C:\Pulyn\anterior (para "Voltar a versao anterior" no setup ou voltar-versao.ps1) e depois roda 04-publicar.ps1.
# Antes de rodar: atualize o repositorio (git pull / troque de branch) para o codigo que deve ir ao ar.
. "$PSScriptRoot\config.ps1"
Exigir-Admin
Escrever-Passo 'Backup do banco antes de atualizar'
& "$PSScriptRoot\backup-banco.ps1"

Escrever-Passo 'Guardando a versao que esta no ar (para poder voltar a ela)'
if (Versao-Completa $Raiz) {
    Guardar-Publicado $Anterior
    Escrever-Ok ('guardada em ' + $Anterior)
} else { Escrever-Ok 'nada publicado ainda' }

& "$PSScriptRoot\04-publicar.ps1"

# Registra o que foi ao ar (o atualizar-github.ps1 regrava com a branch do GitHub logo depois).
$git = Achar-Git
$linhas = @(('Pulyn atualizado em ' + (Get-Date -Format 'dd/MM/yyyy HH:mm')), ('Origem ' + $RepoRaiz))
foreach ($r in @(@('BackEnd', $RepoBackend), @('FrontEnd', $RepoFront))) {
    if (-not $git -or -not $r[1]) { break }
    try {
        $branch = (& $git -C $r[1] rev-parse --abbrev-ref HEAD).Trim()
        $commit = (& $git -C $r[1] rev-parse --short HEAD).Trim()
        if ($LASTEXITCODE -eq 0 -and $commit) { $linhas += ($r[0] + ' ' + $branch + ' @ ' + $commit) }
    } catch { }
    $global:LASTEXITCODE = 0
}
$pasta = Split-Path $ArquivoVersao -Parent
if (-not (Test-Path $pasta)) { New-Item -ItemType Directory -Path $pasta | Out-Null }
Gravar-TextoUtf8 $ArquivoVersao (($linhas -join "`r`n") + "`r`n")
