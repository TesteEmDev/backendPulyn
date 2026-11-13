# Instalador do Pulyn (setup.exe)

Um único `Pulyn-Setup-<versão>.exe` instala o Pulyn inteiro no computador do buffet: Node.js, PostgreSQL 18, IIS (WebSocket, URL Rewrite e ARR), banco de dados limpo, certificado HTTPS, o serviço `PulynBackend`, o site `Pulyn` e o backup diário. O mesmo arquivo atualiza um buffet já instalado, e o desinstalador remove o sistema.

## Gerar o instalador

O gerador baixa o código do **GitHub** e monta o setup.exe com tudo dentro:
- o backend vem do `backendPulyn`, branch `main`;
- o frontend vem do `frontenPulyn`, branch `main`.

O computador do cliente não precisa de internet nem de nenhum arquivo do projeto.

1. Deixe a `main` dos dois repositórios com a versão que deve ir para os buffets (PRs mergeados).
2. Gere o instalador:
   `powershell -ExecutionPolicy Bypass -File BackEnd\deploy\instalador\gerar-instalador.ps1`

Outras opções:
- `-Branch <nome>` gera de outra branch nos dois repositórios. Para usar uma branch diferente só no frontend, acrescente `-BranchFront <nome>`.
- `-Origem Local` usa o último commit do BackEnd desta máquina e a pasta FrontEnd como está. Serve para testar antes de enviar ao GitHub.

O instalador e os scripts (`deploy/instalador` e `deploy/iis`) vêm junto com o backend baixado. Por isso a branch escolhida precisa tê-los; se não tiver, o gerador para e avisa.

Se o banco ganhou tabelas novas, gere de novo a estrutura antes do commit:
`powershell -ExecutionPolicy Bypass -File BackEnd\deploy\iis\gerar-banco-base.ps1`

O arquivo sai em `BackEnd\deploy\instalador\saida\`. O `C:\Pulyn\pacote\VERSAO.txt`, que o setup grava no computador do cliente, mostra a versão, a origem e a branch e o commit de cada repositório. Para gerar, é preciso:
- **Inno Setup 6** e **git**;
- os instaladores do Node.js (`node-v*-x64.msi`) e do PostgreSQL 18 (`postgresql-18*-windows-x64.exe`) na pasta Downloads, ou indicados com `-NodeMsi` e `-PostgresExe`;
- `rewrite_amd64_en-US.msi`, `requestRouter_amd64.msi`, `WinSW-x64.exe` e o Git portátil `MinGit-*-64-bit.zip` em `C:\Pulyn\instaladores` (ou `-PastaIis`);
- internet, para baixar do GitHub e para o `npm ci`.

## As telas do assistente

O assistente usa o visual do Pulyn: fundo escuro, logo e mascote. As imagens ficam em `imagens/`. Na segunda tela você escolhe o que fazer:

- **Primeira instalação.** Só aparece liberada se o Pulyn ainda não estiver instalado.
- **Atualizar.** Só aparece liberada se o Pulyn já estiver instalado. Sempre baixa a versão mais nova pela internet; o sistema que veio dentro do setup.exe só é usado na primeira instalação.
- **Desinstalar.** Aparece liberada se existir alguma coisa do Pulyn no computador.

A tela mostra a situação do computador e a versão instalada.

Para ver as telas sem instalar nada (não pede administrador e não executa nada), compile uma prévia:
`ISCC.exe /DPrevia /DVersao=previa /DMontagem=<pasta com pacote\BackEnd\deploy\iis\{desinstalar,atualizar-github,config,backup-banco}.ps1 e extras\MinGit.zip> Pulyn.iss`

## Instalar no buffet

1. Ligue o computador no roteador por cabo e reserve o IP dele no roteador. O Windows precisa ser Pro, Enterprise ou Server.
2. Rode o `Pulyn-Setup-<versão>.exe`. Ele pede permissão de administrador.
3. O assistente pede três coisas:
   - o **IP** da máquina (já vem preenchido). Se não der para reservar o IP no roteador, marque **Deixar o IP atual fixo no Windows**: a placa de rede deste computador passa de automático (DHCP) para fixo, com o mesmo IP, a mesma máscara, o mesmo gateway e os mesmos DNS. O campo do IP fica travado no IP atual. Se o Windows não aceitar, a placa volta para o automático e a instalação para. Para desfazer depois: `C:\Pulyn\scripts\fixar-ip.ps1 -Desfazer` (como administrador);
   - a **senha do postgres**: se o PostgreSQL ainda não estiver instalado, é a senha que será criada; se já estiver, é a senha que ele já usa. Nesse caso, o assistente confere a senha antes de começar;
   - o **e-mail e a senha do usuário master**.
4. O andamento aparece na própria tela do instalador: a etapa atual, a barra de progresso e os detalhes logo abaixo. Nenhuma janela do PowerShell é aberta. No fim aparece o endereço `https://IP/`; se algo der errado, a última tela mostra o motivo e onde está o registro.

O banco começa vazio, só com a estrutura e o usuário master. Não há dados de teste nem sincronização com a nuvem (`SYNC_ENABLED=0`). Depois da instalação, siga o guia a partir da seção 5 (cadastrar o buffet, tablets e placas).

O registro de cada execução fica em `C:\Pulyn\logs\instalacao-*.log`.

### O arquivo `.env`

O setup.exe não leva nenhum `.env`: ele cria `C:\Pulyn\backend\.env` no buffet, com **todas** as chaves que o backend lê, separadas em blocos comentados. Cada chave tem uma explicação.
- **Geradas na instalação:** `DATABASE_URL` (senha aleatória do usuário `pulyn_app`), `JWT_SECRET` (aleatório, diferente em cada buffet) e `FRONTEND_URL` (`https://IP`).
- **Vazias, para preencher depois:** o e-mail (`BREVO_API_KEY` e `EMAIL_REMETENTE`; sem elas, o "Esqueci minha senha" não envia o código), a nuvem (`SYNC_NUVEM_URL` e `SYNC_EMPRESA_ID`; `SYNC_ENABLED` fica `0`), `CHECKPOINT_SERVER_URL` e `EMAIL_LOGO_URL`.
- **As demais** vêm com o valor padrão do sistema.

Uma chave vazia funciona como se não existisse. Para mudar alguma coisa, abra o Bloco de Notas como administrador, edite o arquivo e rode `Restart-Service PulynBackend`. O acesso ao arquivo é só de administradores.

A atualização nunca muda nem apaga linhas do `.env`. Se uma versão nova do sistema tiver chaves que o arquivo ainda não tem, elas são acrescentadas no fim, com o valor padrão. A lista de chaves fica em `Modelo-Env`, no `deploy/iis/config.ps1`.

## Atualizar um buffet já instalado

Use o atalho **Atualizar Pulyn**, que fica na área de trabalho e no menu Iniciar. Também dá para rodar o setup e escolher **Atualizar**. Funciona como o `atualizar.ps1`:
1. Faz `git pull` da `main` dos dois repositórios em `C:\Pulyn\fonte`. Baixa só o que mudou; na primeira vez, baixa o código todo.
2. Se o conteúdo não mudou, avisa e para, sem mexer no sistema. Para publicar mesmo assim, use `-Forcar`.
3. Instala as dependências das telas, só se o `package-lock.json` mudou. Na primeira vez isso leva alguns minutos.
4. Roda o `atualizar.ps1` que veio do GitHub: backup do banco, compilação das telas e publicação.

O Git portátil fica em `C:\Pulyn\git`. Precisa de internet. O registro fica em `C:\Pulyn\logs\atualizacao-*.log`. Para usar outra branch: `C:\Pulyn\scripts\atualizar-github.ps1 -Branch <nome>`.

O banco, o `.env`, as senhas e o certificado continuam os mesmos, e o Node.js, o PostgreSQL e o IIS não são reinstalados.

## Desinstalar

Há dois caminhos:
- rode o setup.exe e escolha **Desinstalar**, marcando ou não "Apagar também o banco de dados";
- ou use **Configurações > Aplicativos > Pulyn > Desinstalar**. Esse caminho pergunta se o banco também deve ser apagado, e a resposta padrão é **Não**.

- **Sempre remove:** o serviço `PulynBackend`, o site e o pool `Pulyn` do IIS, o certificado da porta 443, as regras de firewall `Pulyn HTTPS` e `Pulyn HTTP UHF`, a tarefa de backup, os certificados do Pulyn (CA e servidor), o atalho "Atualizar Pulyn" e as pastas em `C:\Pulyn`, incluindo o código baixado (`fonte`) e o Git portátil (`git`).
- **Banco, se você responder Sim:** faz um backup em `C:\Pulyn\backups` e depois apaga o banco `AdvPulyn`.
- **Banco, se você responder Não:** o banco fica, e o `C:\Pulyn\backend\.env` também, porque ele guarda a senha do banco. Se você instalar de novo, o sistema volta com os mesmos dados. Os tablets vão precisar do certificado novo.
- **Não remove nunca:** Node.js, PostgreSQL, os recursos do IIS, URL Rewrite e ARR (podem servir a outros sites, como o `suporte`), nem a pasta `C:\Pulyn\backups`.

O registro da remoção fica em `%TEMP%\pulyn-desinstalacao-*.log`. Sem o setup, dá para remover com `C:\Pulyn\scripts\desinstalar.ps1` (como administrador; acrescente `-ApagarBanco` para apagar o banco).

O desinstalador só aparece nos Aplicativos depois que o Pulyn for instalado (ou atualizado) por um setup.exe desta versão em diante.

## Se der erro

Corrija o problema e rode o setup.exe de novo: o que já foi feito é reaproveitado. Se a instalação parou depois de criar o banco e antes de gravar o `.env`, o assistente avisa que o banco `AdvPulyn` já existe e pergunta se ele pode ser recriado vazio. Ele só é recriado se você confirmar, e sempre depois de um backup.

Os scripts rodam sem janela e não podem fazer perguntas: se algum tentar perguntar algo, ele para com erro em vez de ficar esperando.
