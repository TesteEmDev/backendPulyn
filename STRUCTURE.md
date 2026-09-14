# 📊 Estrutura de Configuração - Pulyn Backend

## 🗂️ Arquivos Criados/Atualizados

```
api/server/
├── 📋 Configuração de Ambiente
│   ├── .env                          ← ❌ LOCAL (NÃO versiona)
│   ├── .env.local                    ← ❌ LOCAL (NÃO versiona)
│   ├── .env.example                  ✅ TEMPLATE (versiona)
│   ├── .env.production.example       ✅ TEMPLATE (versiona)
│   └── .env.lan.example              ✅ TEMPLATE (versiona)
│
├── 📚 Documentação
│   ├── README-SETUP.md               ✅ Quick start (5 min)
│   ├── ENVIRONMENT.md                ✅ Guia completo
│   ├── STRUCTURE.md                  ✅ Você está aqui!
│   └── .gitignore                    ✅ Já configurado
│
├── 🤖 Scripts
│   └── setup-env.js                  ✅ Configuração interativa
│
├── 📦 Dependências
│   ├── package.json                  ✅ Atualizado (novo script)
│   └── package-lock.json
│
└── 🎮 Backend
    ├── index.js                      ← Servidor principal
    ├── database.js                   ← Conexão com banco
    ├── routes/                       ← Endpoints da API
    └── migrations/                   ← Scripts de migração
```

---

## 🎯 Fluxo de Setup

```
┌─────────────────────────────────────────────────────────┐
│  DESENVOLVEDOR NOVO CLONA O PROJETO                     │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
         ┌──────────────────┐
         │  npm install     │
         └────────┬─────────┘
                  │
                  ▼
      ┌────────────────────────┐
      │  npm run setup-env     │
      │  (Script Interativo)   │
      └────────┬───────────────┘
               │
      ┌────────▼─────────────────┐
      │ Escolhe banco de dados   │
      │  1) PostgreSQL/Supabase  │
      │  2) SQL Server Local     │
      └────────┬─────────────────┘
               │
      ┌────────▼───────────────────────┐
      │ Preenche credenciais (interativo)
      │ - DATABASE_URL                 │
      │ - JWT_SECRET (ou gera novo)    │
      │ - FRONTEND_URL                 │
      └────────┬───────────────────────┘
               │
      ┌────────▼──────────────────┐
      │ Cria .env.local           │
      │ (NÃO versiona no git)     │
      └────────┬───────────────────┘
               │
      ┌────────▼──────────────────┐
      │  npm run test-postgres    │
      │  ou test-connection       │
      └────────┬───────────────────┘
               │
      ┌────────▼──────────────────┐
      │  npm run dev             │
      │  Servidor rodando! 🚀    │
      └──────────────────────────┘
```

---

## 📝 Regras de Versionamento Git

### ✅ SEMPRE versione:
```
✅ .env.example              (template para novos devs)
✅ .env.production.example   (guia para produção)
✅ .env.lan.example          (exemplo de LAN)
✅ ENVIRONMENT.md            (documentação)
✅ README-SETUP.md           (instruções quick start)
✅ STRUCTURE.md              (você está aqui)
✅ setup-env.js              (script de setup)
✅ package.json              (com script novo)
```

### ❌ NUNCA versione:
```
❌ .env                      (credenciais de desenvolvimento)
❌ .env.local                (credenciais pessoais)
❌ .env.producao             (credenciais de produção)
❌ Qualquer .env com dados reais
```

O `.gitignore` já está configurado para isso!

---

## 🔄 Ciclo de Vida

### 📍 Desenvolvimento Local

```
1. npm run setup-env
   └─ Gera .env.local com suas credenciais
   
2. npm run test-postgres (ou test-connection)
   └─ Verifica conexão com banco
   
3. npm run dev
   └─ Servidor em http://localhost:3001
   
4. Editar código, servidor reinicia automaticamente
```

### 🚀 Deploy em Produção

```
1. Copia variáveis de .env.production.example
   
2. Configura no seu host (Heroku, Railway, etc):
   - NODE_ENV=production
   - JWT_SECRET=seu-segredo-aleatorio
   - DATABASE_URL=postgresql://...
   - FRONTEND_URL=seu-dominio.com
   
3. Faz git push
   
4. Servidor em produção inicia com variáveis
   └─ .env NÃO é lido (porque não existe no servidor)
```

---

## 🔐 Segurança - Três Camadas

### Camada 1: Git
```
.gitignore bloqueia arquivos sensíveis
```

### Camada 2: Códi
```javascript
// database.js carrega variáveis de .env
require('dotenv').config({ path: path.join(__dirname, '.env') });

const DB_DRIVER = process.env.DB_DRIVER || 'sqlserver';
const DATABASE_URL = process.env.DATABASE_URL;
```

### Camada 3: Produção
```
// Variáveis definidas no servidor, .env não existe
// Exemplo: Heroku Config Vars
heroku config:set JWT_SECRET=xxx
heroku config:set DATABASE_URL=postgresql://xxx
```

---

## 📊 Comparação: Antes vs Depois

### ❌ ANTES (Inseguro)
```
api/server/.env
├─ DB_DRIVER=postgres
├─ SUPABASE_DB_URL=postgresql://usuario:SENHA@host/db  ← CREDENCIAL REAL!
├─ JWT_SECRET=um-segredo-longo-e-aleatorio             ← VULNERÁVEL!
└─ Versionado no Git ❌ RISCO DE SEGURANÇA
```

### ✅ DEPOIS (Organizado & Seguro)
```
api/server/
├── .env                          ← GIT IGNORE ✅
├── .env.local                    ← GIT IGNORE ✅ (seu arquivo local)
├── .env.example                  ← VERSIONA ✅ (template para devs)
├── .env.production.example       ← VERSIONA ✅ (guia para produção)
├── ENVIRONMENT.md                ← VERSIONA ✅ (documentação)
├── README-SETUP.md               ← VERSIONA ✅ (quick start)
└── setup-env.js                  ← VERSIONA ✅ (script automático)

Em produção:
├── Variáveis definidas no host   ← SEGURO ✅
└── .env não existe
```

---

## 🎯 Próximas Melhorias (Opcional)

- [ ] Criar `.env.ci` para CI/CD (GitHub Actions)
- [ ] Adicionar validação de variáveis obrigatórias
- [ ] Criar docker-compose com PostgreSQL local
- [ ] Adicionar health check endpoint
- [ ] Configurar logs com rotação
- [ ] Adicionar Sentry para error tracking

---

## 📞 Suporte Rápido

| Erro | Solução |
|------|---------|
| "DATABASE_URL is not set" | Edite `.env.local` e preench DATABASE_URL |
| "Cannot find module 'pg'" | Execute `npm install` |
| "Connection refused" | Verificar se DATABASE_URL está correto |
| "JWT_SECRET too short" | Gere com: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| ".env não é reconhecido" | Usar script: `npm run setup-env` |

---

**Documentação criada em:** 2026-09-14
**Última atualização:** Setup completo com 4 novos arquivos + 2 arquivos atualizados
