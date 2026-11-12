# Instalador do Pulyn (setup.exe)

Um único `Pulyn-Setup-<versão>.exe` instala o Pulyn inteiro no computador do buffet: Node.js, PostgreSQL 18, IIS (WebSocket, URL Rewrite e ARR), banco de dados limpo, certificado HTTPS, o serviço `PulynBackend`, o site `Pulyn` e o backup diário.

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

Rode o setup.exe da versão nova. Se existir `C:\Pulyn\backend\.env`, o assistente não pede senhas. Ele faz backup do banco e publica a versão nova. O banco, o `.env` e o certificado continuam os mesmos.

## Se der erro

Corrija o problema e rode o setup.exe de novo: o que já foi feito é reaproveitado. Se a instalação parou depois de criar o banco e antes de gravar o `.env`, o banco é recriado vazio. Isso só acontece depois de um backup e depois que você digita a confirmação pedida na janela.

O setup não tem desinstalador, porque remover só o pacote deixaria o IIS, o serviço e o banco pela metade. Para remover, apague o site `Pulyn` no IIS, rode `C:\Pulyn\servico\PulynBackend.exe uninstall` e remova o banco `AdvPulyn`.
