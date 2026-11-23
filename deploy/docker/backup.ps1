# backup.ps1 - copia de segurança do banco (formato do pg_dump). Rode dentro da pasta deploy\docker.
$ErrorActionPreference = 'Stop'
$pasta = Join-Path $PSScriptRoot 'backups'
New-Item -ItemType Directory -Force -Path $pasta | Out-Null
$arquivo = Join-Path $pasta ("AdvPulyn-" + (Get-Date -Format 'yyyyMMdd-HHmm') + ".dump")
docker exec pulyn-db sh -c 'pg_dump -U pulyn -Fc AdvPulyn > /tmp/backup.dump'
docker cp pulyn-db:/tmp/backup.dump $arquivo
docker exec pulyn-db rm -f /tmp/backup.dump
# mantém só os 14 backups mais recentes
Get-ChildItem $pasta -Filter 'AdvPulyn-*.dump' | Sort-Object LastWriteTime -Descending | Select-Object -Skip 14 | Remove-Item -Force
Write-Host "Backup salvo em $arquivo" -ForegroundColor Green
