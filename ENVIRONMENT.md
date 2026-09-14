# 🔧 Guia de Configuração de Ambiente - Pulyn Backend

## 📋 Resumo Rápido

```bash
# 1. Desenvolvimento Local
cp .env.example .env.local
# Edite .env.local com suas credenciais de desenvolvimento

# 2. Rodar o servidor
npm install
npm run dev  # ou npm start
```

---

## 📁 Estrutura de Arquivos de Ambiente

```
api/server/
├── .env                          ❌ GIT IGNORE (não versiona)
├── .env.local                    ❌ GIT IGNORE (seu ambiente local)
├── .env.example                  ✅ GIT VERSIONADO (template para devs)
├── .env.production.example       ✅ GIT VERSIONADO (template para produção)
└── ENVIRONMENT.md                ✅ Você está aqui!
```

---

## 🏠 Desenvolvimento Local

### Passo 1: Criar arquivo de ambiente local

```bash
cp .env.example .env.local
```

### Passo 2: Editar `.env.local`

Escolha **UMA** das opções:

#### ✅ OPÇÃO A: PostgreSQL/Supabase (Recomendado)

```env
NODE_ENV=development
PORT=3001
JWT_SECRET=seu-segredo-desenvolvimento

DB_DRIVER=postgres
DATABASE_URL=postgresql://usuario:senha@host:5432/postgres
DB_TIMEOUT=30000

FRONTEND_URL=http://localhost:5173
```

#### ✅ OPÇÃO B: SQL Server Local

```env
NODE_ENV=development
PORT=3001
JWT_SECRET=seu-segredo-desenvolvimento

DB_DRIVER=sqlserver
DB_SERVER=localhost\SQLEXPRESS
DB_NAME=PulynDB
DB_USER=sa
DB_PASSWORD=sua-senha-local
DB_TIMEOUT=30000

FRONTEND_URL=http://localhost:5173
```

### Passo 3: Testar conexão

```bash
# PostgreSQL
npm run test-postgres

# SQL Server
npm run test-connection
```

### Passo 4: Rodar

```bash
npm run dev
```

Servidor estará em: **http://localhost:3001**

---

## 🚀 Produção

### Variáveis Obrigatórias

| Variável | Exemplo | Obrigatório |
|----------|---------|------------|
| `NODE_ENV` | `production` | ✅ Sim |
| `PORT` | `3001` ou `${PORT}` | ✅ Sim |
| `JWT_SECRET` | `seu-segredo-complexo-aleatorio` | ✅ Sim |
| `DB_DRIVER` | `postgres` | ✅ Sim |
| `DATABASE_URL` | `postgresql://...` | ✅ Sim (se postgres) |
| `FRONTEND_URL` | `https://seu-dominio.com` | ✅ Sim |

### ⚠️ Segurança - CRÍTICO

- **NUNCA** faça commit do `.env` com credenciais reais
- **SEMPRE** use variáveis de ambiente no seu host
- **JWT_SECRET** deve ser aleatório e complexo (mínimo 32 caracteres)

Gere JWT_SECRET com:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Exemplo: Deployar no Heroku

```bash
# 1. Criar aplicação
heroku create pulyn-backend

# 2. Configurar variáveis
heroku config:set NODE_ENV=production
heroku config:set JWT_SECRET=seu-segredo-aleatorio-aqui
heroku config:set DATABASE_URL=postgresql://usuario:senha@host/db
heroku config:set FRONTEND_URL=https://seu-front.herokuapp.com

# 3. Deploy
git push heroku main

# 4. Verificar logs
heroku logs --tail
```

### Exemplo: Deployar no Railway

```bash
# 1. Conectar repositório no railway.app
# 2. Adicionar variáveis de ambiente:
#    - NODE_ENV = production
#    - JWT_SECRET = seu-segredo
#    - DATABASE_URL = postgresql://...
#    - FRONTEND_URL = seu-dominio.com
# 3. Deploy automático via git push
```

### Exemplo: Deployar no Docker (VPS/AWS)

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3001

CMD ["node", "index.js"]
```

```bash
# Build
docker build -t pulyn-backend:latest .

# Run
docker run -e NODE_ENV=production \
  -e DATABASE_URL=postgresql://... \
  -e JWT_SECRET=seu-segredo \
  -p 3001:3001 \
  pulyn-backend:latest
```

---

## 🔍 Variáveis Opcionais

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `DB_TIMEOUT` | `30000` | Timeout em ms para conexão com banco |
| `PG_POOL_MAX` | `10` | Máximo de conexões PostgreSQL simultâneas |
| `DB_SSL` | `true` | Habilitar SSL em PostgreSQL |

---

## 📊 Drivers de Banco Suportados

### PostgreSQL (Recomendado para produção)

```env
DB_DRIVER=postgres
DATABASE_URL=postgresql://usuario:senha@host:5432/postgres?sslmode=require
```

**Benefícios:**
- ✅ Suporta Supabase, Railway, Render, Heroku, AWS RDS
- ✅ Melhor performance em produção
- ✅ Escalabilidade garantida
- ✅ Backups automáticos (geralmente)

### SQL Server (Apenas desenvolvimento local)

```env
DB_DRIVER=sqlserver
DB_SERVER=localhost\SQLEXPRESS
DB_NAME=PulynDB
DB_USER=sa
DB_PASSWORD=sua-senha
```

**Quando usar:**
- 🏠 Desenvolvimento puro local
- 📊 Integração com sistemas legados

---

## ✅ Checklist Antes de Deploy

- [ ] `.env` não está versionado (verificar `.gitignore`)
- [ ] `.env.example` está atualizado e versionado
- [ ] `DATABASE_URL` testado e funcionando
- [ ] `JWT_SECRET` é complexo e aleatório
- [ ] `NODE_ENV=production`
- [ ] `FRONTEND_URL` aponta para domínio correto
- [ ] Variáveis configuradas no host (Heroku, Railway, etc)
- [ ] Testes de conexão passam
- [ ] SSL/HTTPS habilitado (produção)

---

## 🐛 Troubleshooting

### Erro: "Parâmetro PostgreSQL ausente: xxx"
- Certifique-se de todas as variáveis estão definidas em `.env.local`
- Verificar se `DATABASE_URL` está correta

### Erro: "Cannot find module 'pg'"
```bash
npm install
```

### Conexão recusada ao Supabase
- Verificar se `DATABASE_URL` está correta
- Testar manualmente: `npm run test-postgres`
- Verificar firewall/VPN

### JWT_SECRET muito curto
```bash
# Gerar novo
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 📚 Referências

- [Supabase Docs](https://supabase.com/docs)
- [Railway Deployment](https://railway.app/docs)
- [Render Deployment](https://render.com/docs)
- [Node.js dotenv](https://github.com/motdotla/dotenv)
