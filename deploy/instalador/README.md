# Instalador do Pulyn (setup.exe)

Um único `Pulyn-Setup-<versão>.exe` instala o Pulyn inteiro no computador do buffet: Node.js, PostgreSQL 18, IIS (WebSocket, URL Rewrite e ARR), banco de dados limpo, certificado HTTPS, o serviço `PulynBackend`, o site `Pulyn` e o backup diário. O mesmo arquivo atualiza um buffet já instalado, e o desinstalador remove o sistema.

## Gerar o instalador (na máquina de desenvolvimento)

1. Faça o commit do BackEnd: o pacote leva o **último commit** do backend. O frontend é compilado da pasta como ela está.
2. Se o banco ganhou tabelas novas, gere de novo a estrutura e faça o commit:
   `powershell -ExecutionPolicy Bypass -File BackEnd\deploy\iis\gerar-banco-base.ps1`
3. Gere o instalador:
   `powershell -ExecutionPolicy Bypass -File BackEnd\deploy\instalador\gerar-instalador.ps1`

O arquivo sai em `BackEnd\deploy\instalador\saida\`. Para gerar, é preciso:
- **Inno Setup 6**;
- os instaladores do Node.js (`node-v*-x64.msi`) e do PostgreSQL 18 (`postgresql-18*-windows-x64.exe`) na pasta Downloads, ou indicados com `-NodeMsi` e `-PostgresExe`;
- `rewrite_amd64_en-US.msi`, `requestRouter_amd64.msi` e `WinSW-x64.exe` em `C:\Pulyn\instaladores` (ou `-PastaIis`);
- internet, para o `npm ci`.

## As telas do assistente

O assistente usa o visual do Pulyn: fundo escuro, logo e mascote. As imagens ficam em `imagens/`. Na segunda tela você escolhe o que fazer:

- **Primeira instalação.** Só aparece liberada se o Pulyn ainda não estiver instalado.
- **Atualizar.** Só aparece liberada se o Pulyn já estiver instalado.
- **Desinstalar.** Aparece liberada se existir alguma coisa do Pulyn no computador.

A tela mostra a situação do computador e a versão instalada.

Para ver as telas sem instalar nada (não pede administrador e não executa nada), compile uma prévia:
`ISCC.exe /DPrevia /DVersao=previa /DMontagem=<pasta com pacote\BackEnd\deploy\iis\{desinstalar,config,backup-banco}.ps1> Pulyn.iss`

## Instalar no buffet

1. Ligue o computador no roteador por cabo e reserve o IP dele no roteador. O Windows precisa ser Pro, Enterprise ou Server.
2. Rode o `Pulyn-Setup-<versão>.exe`. Ele pede permissão de administrador.
3. O assistente pede três coisas:
   - o **IP** da máquina (já vem preenchido);
   - a **senha do postgres**: se o PostgreSQL ainda não estiver instalado, é a senha que será criada; se já estiver, é a senha que ele já usa;
   - o **e-mail e a senha do usuário master**.
4. Uma janela do PowerShell mostra cada etapa. No fim aparece o endereço `https://IP/`.

O banco começa vazio, só com a estrutura e o usuário master. Não há dados de teste nem sincronização com a nuvem (`SYNC_ENABLED=0`). Depois da instalação, siga o guia a partir da seção 5 (cadastrar o buffet, tablets e placas).

O registro de cada execução fica em `C:\Pulyn\logs\instalacao-*.log`.

## Atualizar um buffet já instalado

Rode o setup.exe da versão nova. Se existir `C:\Pulyn\backend\.env`, o assistente não pede senhas. Ele faz backup do banco e publica a versão nova. O banco, o `.env` e o certificado continuam os mesmos. O Node.js e o PostgreSQL não são reinstalados.

## Desinstalar

Há dois caminhos:
- rode o setup.exe e escolha **Desinstalar**, marcando ou não "Apagar também o banco de dados";
- ou use **Configurações > Aplicativos > Pulyn > Desinstalar**. Esse caminho pergunta se o banco também deve ser apagado, e a resposta padrão é **Não**.

- **Sempre remove:** o serviço `PulynBackend`, o site e o pool `Pulyn` do IIS, o certificado da porta 443, as regras de firewall `Pulyn HTTPS` e `Pulyn HTTP UHF`, a tarefa de backup, os certificados do Pulyn (CA e servidor) e as pastas em `C:\Pulyn`.
- **Banco, se você responder Sim:** faz um backup em `C:\Pulyn\backups` e depois apaga o banco `AdvPulyn`.
- **Banco, se você responder Não:** o banco fica, e o `C:\Pulyn\backend\.env` também, porque ele guarda a senha do banco. Se você instalar de novo, o sistema volta com os mesmos dados. Os tablets vão precisar do certificado novo.
- **Não remove nunca:** Node.js, PostgreSQL, os recursos do IIS, URL Rewrite e ARR (podem servir a outros sites, como o `suporte`), nem a pasta `C:\Pulyn\backups`.

O registro da remoção fica em `%TEMP%\pulyn-desinstalacao-*.log`. Sem o setup, dá para remover com `C:\Pulyn\scripts\desinstalar.ps1` (como administrador; acrescente `-ApagarBanco` para apagar o banco).

O desinstalador só aparece nos Aplicativos depois que o Pulyn for instalado (ou atualizado) por um setup.exe desta versão em diante.

## Se der erro

Corrija o problema e rode o setup.exe de novo: o que já foi feito é reaproveitado. Se a instalação parou depois de criar o banco e antes de gravar o `.env`, o banco é recriado vazio. Isso só acontece depois de um backup e depois que você digita a confirmação pedida na janela.
