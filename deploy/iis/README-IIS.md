# Pulyn no IIS (rede local, HTTPS)

Tudo roda nesta máquina: PostgreSQL (banco `AdvPulyn`), backend Node (serviço do Windows, só em `127.0.0.1:3100`) e frontend (site IIS `Pulyn`, HTTPS na 443). O IIS entrega o frontend e repassa `/api` e o WebSocket ao backend. O site `suporte` que já existe no IIS não é alterado.

Pastas: `C:\Pulyn\backend` (código + `.env`), `site`, `servico`, `logs`, `backups`, `certs`, `scripts`.

## Instalação (nesta ordem, PowerShell)

Os scripts ficam em `backendPulyn\deploy\iis`. Se o PowerShell bloquear scripts, use `powershell -ExecutionPolicy Bypass -File .\arquivo.ps1`.

| Passo | Script | Administrador? | Situação |
|---|---|---|---|
| 1 | `01-preparar-iis.ps1` | sim | pendente. Habilita recursos do IIS (WebSocket), instala URL Rewrite e ARR, liga o proxy. Pode reiniciar o IIS por alguns segundos (o `suporte` cai nesse intervalo). |
| 2 | `02-banco-producao.ps1` | não | **já executado**: banco `AdvPulyn` criado com cópia do `AdvPulynDev` e `.env` gerado. |
| 3 | `03-certificado.ps1` | sim | pendente. Cria a CA própria e o certificado do servidor (com o IP da máquina). |
| 4 | `04-publicar.ps1` | sim | pendente. Build do frontend, cópia do backend, serviço `PulynBackend`, site IIS, firewall (só sub-rede local) e testes. |

Depois: `status.ps1` mostra o estado de tudo; `backup-banco.ps1 -Agendar` (administrador) cria o backup diário às 03:00.

## Tablets e celulares (necessário para NFC)

O Web NFC só funciona em HTTPS confiável. Copie `C:\Pulyn\certs\PulynCA.cer` para o aparelho e instale como **certificado de CA** (Android: Configurações > Segurança > Criptografia e credenciais > Instalar certificado > Certificado de CA; iOS: abrir o arquivo, instalar o perfil e ativar em Ajustes > Geral > Sobre > Configurações de certificado). Depois acesse `https://<IP da máquina>/`.

## Atualizar uma versão

Atualize o repositório (git pull / branch desejada) e rode `atualizar.ps1` como administrador. Ele faz backup do banco e republica. O `.env` de produção nunca é sobrescrito.

## Pontos de atenção

- **IP fixo**: o certificado e o `FRONTEND_URL` (links de QR code e convites) usam o IP. Reserve o IP no roteador. Se mudar: `03-certificado.ps1 -Renovar -Ip <novo>`, ajuste `FRONTEND_URL` em `C:\Pulyn\backend\.env` e rode `04-publicar.ps1`.
- **Sincronização com o Supabase**: o `.env` de produção vem com `SYNC_ENABLED=0`. Só um backend pode sincronizar. Quando a produção estiver no ar: coloque `SYNC_ENABLED=0` no `.env` de desenvolvimento, `SYNC_ENABLED=1` no de produção, reinicie o serviço (`Restart-Service PulynBackend`) e confira com `npm run sync:conferir`.
- **Dados da cópia**: o banco de produção é uma cópia de um instante. Para refazer a partir do desenvolvimento use `02-banco-producao.ps1 -Recriar` (faz backup e pede para digitar `APAGAR AdvPulyn`). Depois de ir ao ar, nunca recrie.
- **Backups ficam na mesma máquina**: copie `C:\Pulyn\backups` para outro disco de tempos em tempos. Restaurar: `pg_restore -d AdvPulyn --clean --if-exists arquivo.dump`.
- **Segredos**: `C:\Pulyn\backend\.env` guarda a senha do banco e o `JWT_SECRET`; o acesso é restrito a administradores. Troque a senha do Supabase (ela apareceu em conversa).
- Desenvolvimento continua em `3001`; produção usa `3100`.

## Problemas

- **Site abre, mas login falha / API dá erro**: `status.ps1`; veja `C:\Pulyn\logs\PulynBackend.out.log` e `.err.log`.
- **`/api` devolve HTML ou 404 do IIS**: URL Rewrite/ARR não instalados ou proxy desligado (rode o passo 1 de novo).
- **WebSocket não conecta** (o `04` avisa): confirme que o recurso "IIS-WebSockets" está habilitado e o proxy do ARR ativo. O teste manual é `node testar-websocket.js wss://127.0.0.1/` com `NODE_PATH=C:\Pulyn\backend\node_modules`. Resposta 200 de HTML significa que o IIS não repassou o `Upgrade`.
- **Navegador avisa que o certificado não é confiável**: a CA não foi instalada naquele aparelho (ou o acesso foi por um nome/IP que não consta no certificado).
