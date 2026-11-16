# corrigir-permissoes-banco.ps1 - faz o usuario do Pulyn (o do DATABASE_URL, normalmente pulyn_app) ser DONO de todas as
# tabelas, sequencias e views do banco. Quando usar: o backup (backup-banco.ps1) ou o sistema falha com
# "permission denied for table ..." (o usuario nao consegue ler/alterar uma tabela que outro usuario criou, por exemplo
# uma tabela que veio numa copia feita pelo administrador do PostgreSQL). Nao apaga nem altera dados: so troca o dono.
#   .\corrigir-permissoes-banco.ps1              pede a senha do administrador do PostgreSQL (postgres) e conserta
#   .\corrigir-permissoes-banco.ps1 -Verificar   so mostra o que esta com outro dono (nao altera nada)
#   -AdminLocal  usuario administrador do PostgreSQL (padrao: postgres)
#   -SenhaAdmin  a senha dele como SecureString (so para automacao; sem isso o script pergunta)
param([string]$AdminLocal = 'postgres', [switch]$Verificar, [securestring]$SenhaAdmin)
. "$PSScriptRoot\config.ps1"

$url = Ler-Env (Join-Path $Backend '.env') 'DATABASE_URL'
$c = if ($url) { Ler-UrlPostgres $url } else { $null }
if (-not $c) { throw ('Nao achei DATABASE_URL em ' + (Join-Path $Backend '.env')) }
$psql = Join-Path $PgBin 'psql.exe'
if (-not (Test-Path $psql)) { throw ('Nao achei o psql em ' + $PgBin + '. O PostgreSQL esta instalado nessa pasta?') }

Escrever-Passo ('Banco ' + $c.Banco + ' em ' + $c.Servidor + ':' + $c.Porta + ' - dono esperado: ' + $c.Usuario)
$senha = if ($SenhaAdmin) { $SenhaAdmin } else { Read-Host ('Senha do usuario ' + $AdminLocal + ' do PostgreSQL') -AsSecureString }
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($senha)
$env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
$sqlArquivo = Join-Path $env:TEMP ('pulyn-permissoes-' + [guid]::NewGuid().ToString('N') + '.sql')
try {
    $conexao = @('-h', $c.Servidor, '-p', $c.Porta, '-U', $AdminLocal, '-d', $c.Banco, '-v', ('dono=' + $c.Usuario), '-X', '-q')

    # Tabelas, sequencias e views que NAO sao do usuario do Pulyn.
    $listar = @"
select 'tabela ' || tablename || ' (dono: ' || tableowner || ')' from pg_tables where schemaname = 'public' and tableowner <> :'dono'
union all
select 'sequencia ' || c.relname || ' (dono: ' || pg_get_userbyid(c.relowner) || ')' from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'S' and pg_get_userbyid(c.relowner) <> :'dono'
union all
select 'view ' || viewname || ' (dono: ' || viewowner || ')' from pg_views where schemaname = 'public' and viewowner <> :'dono'
order by 1;
"@
    Gravar-TextoUtf8 $sqlArquivo $listar
    $fora = @(Executar-Nativo $psql ($conexao + @('-At', '-f', $sqlArquivo)) 'Nao consegui consultar o banco (confira a senha do administrador)' | Where-Object { $_ -and $_.Trim() })
    if ($fora.Count -eq 0) { Escrever-Ok ('tudo ja pertence a ' + $c.Usuario + ': nada a fazer'); return }
    Write-Host ('    ' + $fora.Count + ' objeto(s) com outro dono:')
    $fora | Select-Object -First 15 | ForEach-Object { Write-Host ('      ' + $_) }
    if ($fora.Count -gt 15) { Write-Host ('      ... e mais ' + ($fora.Count - 15)) }
    if ($Verificar) { Escrever-Aviso 'modo -Verificar: nada foi alterado. Rode sem -Verificar para consertar.'; return }

    $consertar = @"
select format('alter table %I.%I owner to %I', schemaname, tablename, :'dono') from pg_tables where schemaname = 'public' and tableowner <> :'dono' \gexec
select format('alter sequence %I.%I owner to %I', n.nspname, c.relname, :'dono') from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'S' and pg_get_userbyid(c.relowner) <> :'dono' \gexec
select format('alter view %I.%I owner to %I', schemaname, viewname, :'dono') from pg_views where schemaname = 'public' and viewowner <> :'dono' \gexec
"@
    Gravar-TextoUtf8 $sqlArquivo $consertar
    Executar-Nativo $psql ($conexao + @('-v', 'ON_ERROR_STOP=1', '-f', $sqlArquivo)) 'Nao consegui trocar o dono dos objetos' | Out-Null
    Escrever-Ok ($fora.Count.ToString() + ' objeto(s) agora pertencem a ' + $c.Usuario)
    Write-Host '    Rode o backup/atualizacao de novo.'
} finally {
    $env:PGPASSWORD = $null
    if (Test-Path $sqlArquivo) { Remove-Item $sqlArquivo -Force -ErrorAction SilentlyContinue }
}
