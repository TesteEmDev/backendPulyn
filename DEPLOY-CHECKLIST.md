# ✅ Deploy Checklist - Pulyn Backend

## 🏠 Antes de Sair do Desenvolvimento Local

```
[ ] .env.local criado com npm run setup-env
[ ] npm install executado
[ ] npm run test-postgres ou test-connection passou
[ ] npm run dev executa sem erros
[ ] API responde em http://localhost:3001
[ ] Endpoints testados localmente
[ ] Erros SQL corrigidos
[ ] Migrations aplicadas (se houver)
[ ] Sem console.log de debug ativo
```

---

## 🚀 Antes de Fazer Deploy

### Código & Git

```
[ ] git status limpo (sem arquivos não versionados importantes)
[ ] .env NÃO está em staging (git status show .env?)
[ ] .gitignore verificado (.env* em ignore)
[ ] .env.example atualizado com todas as variáveis
[ ] .env.production.example preenchido corretamente
[ ] package.json salvo (se mudou dependências)
[ ] Última commit com mensagem descritiva
[ ] Branch feito de main/master atualizado
```

### Variáveis de Ambiente

```
[ ] NODE_ENV=production (não development)
[ ] JWT_SECRET gerado e complexo (min 32 chars)
    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
[ ] DATABASE_URL correta e testada
[ ] FRONTEND_URL aponta para domínio correto
[ ] Todas as variáveis obrigatórias preenchidas
```

### Banco de Dados

```
[ ] PostgreSQL/Supabase access verificado
[ ] Backup do banco atual feito
[ ] Migrations testadas localmente
[ ] Schema de produção é o mesmo que desenvolvimento
[ ] Credenciais de produção testadas
[ ] Timeout configurado adequadamente
[ ] Pool de conexões ok
```

### Segurança

```
[ ] Sem credenciais em código fonte
[ ] JWT_SECRET não é padrão
[ ] CORS configurado para seu domínio
[ ] Rate limiting habilitado (opcional)
[ ] Logs configurados (sem expor senhas)
[ ] SSL/HTTPS habilitado (produção)
[ ] Dependências atualizadas (npm audit fix)
```

---

## 🔧 Setup em Produção

### Opção 1: Heroku

```bash
# 1. Login
heroku login

# 2. Criar app
heroku create seu-app-name

# 3. Configurar variáveis
heroku config:set NODE_ENV=production
heroku config:set JWT_SECRET=seu-valor-aleatorio
heroku config:set DATABASE_URL=postgresql://...
heroku config:set FRONTEND_URL=https://seu-front.herokuapp.com

# 4. Deploy
git push heroku main

# 5. Verificar logs
heroku logs --tail

# 6. Testar
curl https://seu-app-name.herokuapp.com/api/health
```

### Opção 2: Railway

```bash
# 1. Ir em railway.app
# 2. Criar novo projeto
# 3. Conectar repositório GitHub
# 4. Em "Variables", adicionar:
#    - NODE_ENV = production
#    - JWT_SECRET = seu-valor
#    - DATABASE_URL = postgresql://...
#    - FRONTEND_URL = https://seu-dominio

# 5. Deploy automático ao fazer git push
```

### Opção 3: Render

```bash
# 1. Criar Web Service em render.com
# 2. Conectar seu GitHub repo
# 3. Em "Environment", adicionar variáveis
# 4. Start Command: npm start
# 5. Deploy

# Deploy automático com git push
```

### Opção 4: Docker (VPS/AWS/DigitalOcean)

```bash
# 1. Build image
docker build -t pulyn-backend:latest .

# 2. Run container
docker run \
  -e NODE_ENV=production \
  -e DATABASE_URL=postgresql://... \
  -e JWT_SECRET=seu-valor \
  -p 3001:3001 \
  pulyn-backend:latest

# 3. Ou usar docker-compose
docker-compose up -d
```

---

## 📊 Depois do Deploy

### Verificações Imediatas

```
[ ] Servidor respondendo (HTTP 200)
[ ] Logs sem erros críticos
[ ] Conectando ao banco de dados
[ ] JWT funcionando corretamente
[ ] CORS permitindo seu frontend
[ ] Endpoints principais funcionando:
    - [ ] GET /api/health
    - [ ] POST /api/auth/login
    - [ ] GET /api/eventos (com token)
```

### Monitoramento 24h

```
[ ] Verificar logs a cada 2 horas
[ ] Testar endpoints aleatoriamente
[ ] Monitorar performance do banco
[ ] Verificar erros não tratados
[ ] Validar logs de autenticação
```

### Relatório de Saúde

```
[ ] CPU/Memória em limites aceitáveis
[ ] Conexões de banco estáveis
[ ] Sem memory leaks aparentes
[ ] Tempo de resposta aceitável (< 500ms)
[ ] Taxa de erro < 0.1%
```

---

## 🔍 Monitoramento Pós-Deploy

### Logs

```
tail -f /var/log/pulyn-backend.log          # Se em VPS

# Heroku
heroku logs --tail

# Docker
docker logs -f seu-container-id
```

### Health Check

```bash
curl https://seu-dominio.com/api/health

# Resposta esperada:
# { "status": "ok", "database": "connected" }
```

### Performance

```bash
# Testar tempo de resposta
time curl https://seu-dominio.com/api/eventos

# Testar concorrência
ab -n 100 -c 10 https://seu-dominio.com/api/health
```

---

## 🚨 Rollback de Emergência

### Se der ruim...

```bash
# Heroku
heroku rollback

# Railway
git revert HEAD
git push

# Docker
docker run -d --name pulyn-old pulyn-backend:versao-anterior
docker stop pulyn-backend
docker rename pulyn-old pulyn-backend
docker start pulyn-backend
```

---

## 📋 Variáveis de Produção - Resumo

```env
# OBRIGATÓRIAS
NODE_ENV=production
PORT=3001
JWT_SECRET=<gerado-aleatorio-32-chars>
DATABASE_URL=postgresql://usuario:senha@host:5432/db
FRONTEND_URL=https://seu-dominio.com

# OPCIONAIS
DB_TIMEOUT=30000
PG_POOL_MAX=20
DB_SSL=true
```

---

## ✅ Versão Simplificada (TL;DR)

```bash
# Gera JWT
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Variaveis no seu host:
NODE_ENV=production
JWT_SECRET=<output-do-comando-acima>
DATABASE_URL=<sua-url-postgres>
FRONTEND_URL=<seu-dominio>

# Deploy
git push origin main
# (ou heroku/railway/render faz deploy automático)

# Testar
curl https://seu-dominio/api/health
```

---

## 🎓 Próximas Lições

1. Configurar CI/CD (GitHub Actions)
2. Adicionar Sentry para error tracking
3. Configurar backups automáticos
4. Setup de alertas (Uptime Robot, etc)
5. Configurar CDN (Cloudflare, etc)

---

**Checklist criado:** 2026-09-14
**Aplica a:** Heroku, Railway, Render, Docker, VPS
