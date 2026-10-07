# atualizar.ps1 - publica uma versao nova (Administrador). Faz backup do banco antes e depois roda 04-publicar.ps1.
# Antes de rodar: atualize o repositorio (git pull / troque de branch) para o codigo que deve ir ao ar.
. "$PSScriptRoot\config.ps1"
Exigir-Admin
Escrever-Passo 'Backup do banco antes de atualizar'
& "$PSScriptRoot\backup-banco.ps1"
& "$PSScriptRoot\04-publicar.ps1"
