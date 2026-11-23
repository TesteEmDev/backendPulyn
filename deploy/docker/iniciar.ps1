# iniciar.ps1 - sobe (ou atualiza) o Pulyn. Rode dentro da pasta deploy\docker.
$ErrorActionPreference = 'Stop'
if (-not (Test-Path '..\..\.env.docker')) { throw 'Falta o arquivo ..\..\.env.docker (copie de .env.docker.example e preencha).' }
if (-not (Test-Path '.\certs\server.crt')) { throw 'Falta o certificado: rode .\gerar-certificado.ps1 -Ip SEU_IP' }
if (-not (Test-Path '.\site\index.html')) { throw 'Falta o site: rode .\gerar-site.ps1' }
docker compose --env-file ..\..\.env.docker up -d --build
docker compose --env-file ..\..\.env.docker ps
Write-Host 'Pronto. Acesse https://SEU_IP/' -ForegroundColor Green
