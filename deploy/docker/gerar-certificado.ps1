# gerar-certificado.ps1 - cria a CA prÃ³pria e o certificado HTTPS do servidor, dentro de um container (nÃ£o precisa de OpenSSL instalado).
# Uso (PowerShell): .\gerar-certificado.ps1 -Ip 192.168.0.60
# Gera em .\certs: server.crt, server.key (usados pelo nginx) e PulynCA.cer (instalar nos tablets e celulares).
param(
    [Parameter(Mandatory = $true)][string]$Ip
)
$ErrorActionPreference = 'Stop'
$pasta = Join-Path $PSScriptRoot 'certs'
New-Item -ItemType Directory -Force -Path $pasta | Out-Null

$comando = @"
cd /certs &&
openssl req -x509 -newkey rsa:2048 -nodes -keyout ca.key -out PulynCA.crt -days 3650 -subj '/CN=Pulyn Local CA' &&
openssl req -newkey rsa:2048 -nodes -keyout server.key -out server.csr -subj '/CN=$Ip' &&
printf 'subjectAltName=IP:$Ip,DNS:localhost' > san.ext &&
openssl x509 -req -in server.csr -CA PulynCA.crt -CAkey ca.key -CAcreateserial -out server.crt -days 825 -sha256 -extfile san.ext &&
cp PulynCA.crt PulynCA.cer && rm -f server.csr san.ext
"@

$ErrorActionPreference = 'Continue'
docker run --rm --entrypoint sh -v "${pasta}:/certs" alpine/openssl -c $comando
$ErrorActionPreference = 'Stop'
if (-not (Test-Path (Join-Path $pasta 'server.crt')) -or -not (Test-Path (Join-Path $pasta 'server.key'))) { throw 'Falha ao gerar o certificado.' }
Write-Host "Certificado criado para o IP $Ip em $pasta" -ForegroundColor Green
Write-Host 'Instale PulynCA.cer nos tablets e celulares (como certificado de CA).'


