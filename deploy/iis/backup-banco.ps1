# backup-banco.ps1 - copia de seguranca do banco de producao (formato do pg_dump, restaura com pg_restore).
#   .\backup-banco.ps1              faz um backup agora em C:\Pulyn\backups e apaga os de mais de 14 dias
#   .\backup-banco.ps1 -Agendar     (Administrador) cria a tarefa diaria as 03:00 do Windows (outro horario: -Hora 12:00)
# Importante: o backup fica NA MESMA MAQUINA do banco. Copie a pasta para outro disco/computador de vez em quando.
param([int]$Dias = 14, [switch]$Agendar, [string]$Hora = '03:00')
. "$PSScriptRoot\config.ps1"

if ($Agendar) {
    Exigir-Admin
    $copia = Join-Path $Scripts 'backup-banco.ps1'
    if (-not (Test-Path $copia)) { throw ('Rode 04-publicar.ps1 antes (ele copia os scripts para ' + $Scripts + ').') }
    $acao = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -ExecutionPolicy Bypass -File "' + $copia + '" -Dias ' + $Dias)
    $gatilho = New-ScheduledTaskTrigger -Daily -At $Hora
    Register-ScheduledTask -TaskName 'Pulyn - backup do banco' -Action $acao -Trigger $gatilho -User 'SYSTEM' -RunLevel Highest -Force | Out-Null
    Escrever-Ok ('tarefa diaria criada (' + $Hora + ')')
    return
}

$url = Ler-Env (Join-Path $Backend '.env') 'DATABASE_URL'
$c = if ($url) { Ler-UrlPostgres $url } else { $null }
if (-not $c) { throw ('Nao achei DATABASE_URL em ' + (Join-Path $Backend '.env')) }
if (-not (Test-Path $Backups)) { New-Item -ItemType Directory -Path $Backups | Out-Null }

$destino = Join-Path $Backups ($c.Banco + '-' + (Get-Date -Format 'yyyyMMdd-HHmm') + '.dump')
# Traduz o erro do pg_dump no que fazer (so texto: nao muda o que o script faz). O PostgreSQL responde no idioma do Windows,
# por isso cada frase vem em ingles e em portugues (o '.' cobre as letras acentuadas, para o script continuar ASCII).
function Dica-PgDump($texto) {
    if ($texto -match 'password authentication failed|no password supplied|senha falhou|nenhuma senha') { return ' >> A senha do DATABASE_URL (' + (Join-Path $Backend '.env') + ') nao e a do usuario no PostgreSQL.' }
    if ($texto -match 'could not connect|Connection refused|10061|timeout expired|could not translate host|n.o foi poss.vel conectar|recusou') { return ' >> O PostgreSQL nao respondeu em ' + $c.Servidor + ':' + $c.Porta + '. Veja se o servico esta rodando: Get-Service postgresql*' }
    if ($texto -match 'permission denied|permiss.o negada') { return ' >> O usuario do DATABASE_URL (' + $c.Usuario + ') nao tem permissao em alguma tabela (outro usuario e o dono dela). Rode: .\corrigir-permissoes-banco.ps1 (pede a senha do postgres) e depois o backup de novo.' }
    if ($texto -match 'database .* does not exist|banco de dados .* n.o existe') { return ' >> O banco ' + $c.Banco + ' nao existe nesse PostgreSQL (confira o DATABASE_URL).' }
    if ($texto -match 'server version mismatch|aborting because of|vers.o do servidor|incompatibilidade') { return ' >> O pg_dump e mais antigo que o servidor. Instale o PostgreSQL mais novo ou aponte PgBin (config.ps1) para a pasta bin da mesma versao do servidor.' }
    return ''
}

$pgdump = Join-Path $PgBin 'pg_dump.exe'
if (-not (Test-Path $pgdump)) { throw ('Nao achei o pg_dump em ' + $PgBin + '. O PostgreSQL esta instalado nessa pasta?') }
$versaoPgDump = ((& $pgdump --version) -join ' ').Trim()
$env:PGPASSWORD = $c.Senha
try {
    Executar-Nativo $pgdump @('-h', $c.Servidor, '-p', $c.Porta, '-U', $c.Usuario, '-Fc', '-f', $destino, $c.Banco) ('pg_dump falhou [' + $versaoPgDump + '; servidor ' + $c.Servidor + ':' + $c.Porta + '; banco ' + $c.Banco + '; usuario ' + $c.Usuario + ']') | Out-Null
} catch {
    if (Test-Path $destino) { Remove-Item $destino -Force -ErrorAction SilentlyContinue }   # nao deixa um arquivo vazio parecendo backup
    throw ($_.Exception.Message + (Dica-PgDump $_.Exception.Message))
} finally { $env:PGPASSWORD = $null }
if ((Get-Item $destino).Length -lt 1024) { throw 'O backup saiu vazio.' }
Escrever-Ok ('backup: ' + $destino + ' (' + [math]::Round((Get-Item $destino).Length / 1MB, 1) + ' MB)')

# Rotina: apaga so os backups automaticos antigos (nao mexe nos "antes-de-recriar" nem nas copias de origem).
Get-ChildItem $Backups -Filter ($c.Banco + '-????????-????.dump') | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$Dias) } | Remove-Item -Force
