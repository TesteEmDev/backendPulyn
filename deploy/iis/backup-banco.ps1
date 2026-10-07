# backup-banco.ps1 - copia de seguranca do banco de producao (formato do pg_dump, restaura com pg_restore).
#   .\backup-banco.ps1              faz um backup agora em C:\Pulyn\backups e apaga os de mais de 14 dias
#   .\backup-banco.ps1 -Agendar     (Administrador) cria a tarefa diaria as 03:00 do Windows
# Importante: o backup fica NA MESMA MAQUINA do banco. Copie a pasta para outro disco/computador de vez em quando.
param([int]$Dias = 14, [switch]$Agendar)
. "$PSScriptRoot\config.ps1"

if ($Agendar) {
    Exigir-Admin
    $copia = Join-Path $Scripts 'backup-banco.ps1'
    if (-not (Test-Path $copia)) { throw ('Rode 04-publicar.ps1 antes (ele copia os scripts para ' + $Scripts + ').') }
    $acao = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -ExecutionPolicy Bypass -File "' + $copia + '" -Dias ' + $Dias)
    $gatilho = New-ScheduledTaskTrigger -Daily -At '03:00'
    Register-ScheduledTask -TaskName 'Pulyn - backup do banco' -Action $acao -Trigger $gatilho -User 'SYSTEM' -RunLevel Highest -Force | Out-Null
    Escrever-Ok 'tarefa diaria criada (03:00)'
    return
}

$url = Ler-Env (Join-Path $Backend '.env') 'DATABASE_URL'
$c = if ($url) { Ler-UrlPostgres $url } else { $null }
if (-not $c) { throw ('Nao achei DATABASE_URL em ' + (Join-Path $Backend '.env')) }
if (-not (Test-Path $Backups)) { New-Item -ItemType Directory -Path $Backups | Out-Null }

$destino = Join-Path $Backups ($c.Banco + '-' + (Get-Date -Format 'yyyyMMdd-HHmm') + '.dump')
$env:PGPASSWORD = $c.Senha
try {
    & (Join-Path $PgBin 'pg_dump.exe') -h $c.Servidor -p $c.Porta -U $c.Usuario -Fc -f $destino $c.Banco
    Conferir-Saida 'pg_dump falhou'
} finally { $env:PGPASSWORD = $null }
if ((Get-Item $destino).Length -lt 1024) { throw 'O backup saiu vazio.' }
Escrever-Ok ('backup: ' + $destino + ' (' + [math]::Round((Get-Item $destino).Length / 1MB, 1) + ' MB)')

# Rotina: apaga so os backups automaticos antigos (nao mexe nos "antes-de-recriar" nem nas copias de origem).
Get-ChildItem $Backups -Filter ($c.Banco + '-????????-????.dump') | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$Dias) } | Remove-Item -Force
