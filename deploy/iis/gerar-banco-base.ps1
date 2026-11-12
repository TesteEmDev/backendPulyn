# gerar-banco-base.ps1 - gera banco-base.sql: so a ESTRUTURA do banco (tabelas, indices, funcoes), sem nenhum dado.
# E o ponto de partida do banco de um buffet novo (02-banco-producao.ps1 -BancoLimpo e o instalador usam este arquivo).
# Le a estrutura do banco de desenvolvimento (DATABASE_URL do .env do BackEnd). Nao altera nada nele.
# Rode de novo sempre que o banco ganhar tabelas novas antes de gerar um instalador.
. "$PSScriptRoot\config.ps1"
Exigir-Repo

$pgDump = Join-Path $PgBin 'pg_dump.exe'
if (-not (Test-Path $pgDump)) { throw ('pg_dump nao encontrado em ' + $PgBin) }

$envDev = Join-Path $RepoBackend '.env'
$urlDev = Ler-Env $envDev 'DATABASE_URL'
$dev = if ($urlDev) { Ler-UrlPostgres $urlDev } else { $null }
if (-not $dev) { throw ('Nao achei DATABASE_URL em ' + $envDev + '.') }

Escrever-Passo ('Lendo a estrutura de ' + $dev.Banco + ' em ' + $dev.Servidor)
$tmp = Join-Path $env:TEMP ('pulyn-base-' + [guid]::NewGuid().ToString('N') + '.sql')
$env:PGPASSWORD = $dev.Senha
try {
    & $pgDump -h $dev.Servidor -p $dev.Porta -U $dev.Usuario --schema-only --no-owner --no-acl --no-comments -f $tmp $dev.Banco
    Conferir-Saida 'pg_dump falhou'
} finally { $env:PGPASSWORD = $null }

# Tira os comandos do psql (\restrict etc., que mudam a cada dump).
$linhas = Get-Content $tmp -Encoding UTF8 | Where-Object { -not $_.StartsWith('\') }
Remove-Item $tmp -ErrorAction SilentlyContinue
$texto = ($linhas -join "`n")
if ($texto -notmatch 'CREATE TABLE') { throw 'O dump veio sem tabelas.' }

$cabecalho = @(
    ('-- banco-base.sql - estrutura do banco do Pulyn, SEM DADOS. Gerado por gerar-banco-base.ps1 em ' + (Get-Date -Format 'yyyy-MM-dd HH:mm') + '.'),
    '-- Nao edite a mao: gere de novo. As migracoes do backend completam o que faltar quando o servico sobe.',
    ''
) -join "`n"
$destino = Join-Path $PSScriptRoot 'banco-base.sql'
Gravar-TextoUtf8 $destino ($cabecalho + $texto + "`n")
$qtd = ([regex]::Matches($texto, 'CREATE TABLE')).Count
Escrever-Ok ($destino + ' (' + $qtd + ' tabelas)')
