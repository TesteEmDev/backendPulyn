# Instalação do Pulyn no buffet com Docker

Esta instalação roda o banco, o servidor e o site em containers, no próprio PC do buffet. O site é entregue por HTTPS na rede local (necessário para o NFC dos tablets).

## 1. O que o PC do buffet precisa

- **Windows 10 ou 11** (versão Pro, Enterprise ou Home com WSL 2).
- **Docker Desktop**: https://www.docker.com/products/docker-desktop/
  - Na instalação, deixe marcada a opção de usar o WSL 2.
  - Depois de instalar, abra o Docker Desktop e espere o ícone da baleia ficar parado (motor pronto).
- **Node.js LTS** (só para gerar o site, uma vez): https://nodejs.org
- **PowerShell** (já vem no Windows).
- **IP fixo** para o PC, reservado no roteador (ex.: `192.168.0.60`). Se o IP mudar, o certificado precisa ser gerado de novo.
- O PC e os tablets na **mesma rede Wi-Fi**.

## 2. Copiar o sistema

Copie a pasta do projeto para o PC do buffet (por exemplo, `C:\Pulyn`). Dentro dela, o caminho usado nesta instalação é `backendPulyn\deploy\docker`.

Na pasta `backendPulyn`, instale as dependências do backend (uma vez):

```
cd C:\Pulyn\backendPulyn
npm ci --omit=dev
```

## 3. Configurar o `.env.docker`

Na pasta `backendPulyn`, copie o modelo e preencha:

```
copy .env.docker.example .env.docker
notepad .env.docker
```

Preencha pelo menos (os campos marcados com `TROQUE` no modelo):
- `POSTGRES_PASSWORD`: uma senha forte para o banco.
- `JWT_SECRET`: um texto longo e aleatório. Gere os dois com:
  `node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"`
- `FRONTEND_URL`: `https://IP_DO_PC` (ex.: `https://192.168.0.60`).
- `SYNC_*`: só se o buffet for sincronizar com a nuvem (veja o guia de sincronização).
- `BREVO_API_KEY`, `EMAIL_REMETENTE`, `EMAIL_REMETENTE_NOME`: para o envio de e-mails (confirmação de cadastro e recuperação de senha).

**Não envie o `.env.docker` para o GitHub.**

## 4. Gerar o certificado HTTPS

Na pasta `backendPulyn\deploy\docker`, rode (troque pelo IP do PC):

```
powershell -ExecutionPolicy Bypass -File .\gerar-certificado.ps1 -Ip 192.168.0.60
```

Isso cria a pasta `certs` com:
- `server.crt` e `server.key`: usados pelo servidor web.
- `PulynCA.cer`: o certificado que os tablets e celulares precisam confiar.

### Instalar o certificado no PC do buffet
Clique com o botão direito em `PulynCA.cer` > **Instalar certificado** > **Computador local** > **Colocar todos os certificados no repositório a seguir** > **Autoridades de Certificação Raiz Confiáveis**.

### Instalar nos tablets e celulares
- **Android:** Configurações > Segurança > Criptografia e credenciais > Instalar certificado > **Certificado de CA**. Escolha o arquivo `PulynCA.cer` (copie para o aparelho antes).
- **iPhone/iPad:** abra o arquivo `PulynCA.cer`, instale o perfil, e depois ative em Ajustes > Geral > Sobre > Configurações de certificado confiáveis.

## 5. Gerar o site

Na pasta `backendPulyn\deploy\docker`:

```
powershell -ExecutionPolicy Bypass -File .\gerar-site.ps1
```

Isso gera o site na pasta `site`. Precisa do Node.js instalado. Repita este passo quando houver uma versão nova do app/site.

## 6. Subir o sistema

Na pasta `backendPulyn\deploy\docker`:

```
powershell -ExecutionPolicy Bypass -File .\iniciar.ps1
```

A primeira vez demora alguns minutos (baixa as imagens e cria o banco). No final aparece a lista dos containers, todos como `running` (o banco como `healthy`).

Teste no próprio PC: abra `https://localhost/` no navegador (aviso de certificado é esperado se a CA não estiver instalada) e depois `https://IP_DO_PC/`.

Confira também que `http://localhost/` redireciona para `https://`. Se o HTTPS não abrir no PC do buffet (o TLS é derrubado antes de chegar ao nginx), veja o item 9.

## 7. Dia a dia

| O que fazer | Comando (na pasta `deploy\docker`) |
|---|---|
| Ver se está tudo rodando | `docker compose --env-file ..\..\.env.docker ps` |
| Ver o log do servidor | `docker logs -f pulyn-backend` |
| Reiniciar tudo | `docker compose --env-file ..\..\.env.docker restart` |
| Parar tudo | `docker compose --env-file ..\..\.env.docker down` |
| Fazer backup do banco | `powershell -ExecutionPolicy Bypass -File .\backup.ps1` |
| Atualizar a versão | `git pull` (no repositório), depois `gerar-site.ps1` e `iniciar.ps1` |

Os containers sobem sozinhos quando o Windows liga (o Docker Desktop precisa estar configurado para iniciar com o Windows: **Settings > General > Start Docker Desktop when you sign in**).

## 8. Backup automático

Crie uma tarefa agendada do Windows que roda o backup todo dia, por exemplo às 03:00:

```
schtasks /Create /SC DAILY /ST 03:00 /TN "Pulyn backup" /TR "powershell -ExecutionPolicy Bypass -File C:\Pulyn\backendPulyn\deploy\docker\backup.ps1"
```

Copie a pasta `backups` de tempos em tempos para outro disco ou computador. O backup fica na mesma máquina do banco.

## 9. Problemas comuns

- **"Falta o certificado" ou "Falta o site"**: rode os passos 4 e 5.
- **Tablet não lê NFC / aviso de certificado**: a CA (`PulynCA.cer`) não foi instalada naquele aparelho (passo 4).
- **Site abre, mas o login falha**: veja `docker logs pulyn-backend`.
- **Docker não inicia**: abra o Docker Desktop e espere o motor ficar pronto. Se pedir reinício do WSL, reinicie o PC.
- **Mudou o IP do PC**: gere o certificado de novo com o IP novo (passo 4), ajuste `FRONTEND_URL` no `.env.docker` e rode `iniciar.ps1`.
- **`http://localhost` responde, mas `https://` fecha a conexão ("Connection was reset" / "conexão subjacente foi fechada")**: nesse caso o nginx nem recebe a conexão (não aparece nada no `docker logs pulyn-web`). Foi o que aconteceu no PC de teste, inclusive com uma porta alternativa (8443), então é o caminho Windows → Docker Desktop para TLS, não o sistema. Tente: reiniciar o Docker Desktop; fechar programas de antivírus/proxy que inspecionam HTTPS; conferir se outro serviço usa a porta 443 (`netstat -ano | findstr :443`). Se persistir, anote a versão do Docker Desktop e do Windows antes de mudar a configuração.
- **Dentro do container o HTTPS funciona, mas o navegador não abre**: teste de dentro com `docker exec pulyn-web wget -S -O /dev/null --no-check-certificate https://127.0.0.1/`. Se responder 200 ali, o problema está entre o PC e o Docker, como no item anterior.

## 10. Observações

- O banco começa com a estrutura do sistema (pasta `docker\init`). Para o buffet real, os dados da empresa vêm pela sincronização com a nuvem ou pela carga inicial (guia de sincronização).
- Dados de teste não devem ficar na instalação do buffet.
