# ⚡ Quick Reference - Pulyn Backend Setup

## 🚀 30 Segundos de Setup

```bash
npm install                # Instala dependências
npm run setup-env         # Configuração interativa 🎯
npm run test-postgres     # Testa conexão
npm run dev               # Servidor rodan
```

---

## 📁 Arquivos Importantes

| Arquivo | Propósito | Git? |
|---------|-----------|------|
| `.env.local` | Suas credenciais locais | ❌ |
| `.env.example` | Template para novos devs | ✅ |
| `.env.production.example` | Guia para produção | ✅ |
| `ENVIRONMENT.md` | Documentação completa | ✅ |
| `setup-env.js` | Script de configuração | ✅ |

---

## 🔧 Comandos Essenciais

```bash
npm run dev                  # Desenvolver (auto-reload)
npm run start               # Rodar servidor
npm run setup-env          # Configurar ambiente
npm run test-postgres      # Testar banco (PostgreSQL)
npm run test-connection    # Testar banco (SQL Server)
npm run test-api           # Testar API endpoints
```

---

## 🗄️ Configuração Rápida

### PostgreSQL/Supabase
```env
DB_DRIVER=postgres
DATABASE_URL=postgresql://usuario:senha@host:5432/db
```

### SQL Server
```env
DB_DRIVER=sqlserver
DB_SERVER=localhost
DB_NAME=PulynDB
DB_USER=sa
DB_PASSWORD=123456
```

---

## 🚀 Deploy

### Variáveis Obrigatórias
- `NODE_ENV=production`
- `JWT_SECRET=<gere-um-novo>`
- `DATABASE_URL=<sua-url>`
- `FRONTEND_URL=<seu-dominio>`

### Gerar JWT_SECRET
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Rodar em Produção
```bash
# Heroku
heroku config:set NODE_ENV=production
heroku config:set JWT_SECRET=seu-valor
heroku config:set DATABASE_URL=postgresql://...
git push heroku main

# Docker
docker run -e NODE_ENV=production \
  -e DATABASE_URL=postgresql://... \
  -e JWT_SECRET=... \
  -p 3001:3001 \
  pulyn-backend:latest
```

---

## 🔐 Segurança

✅ **SIM**
- Versionador `.env.example`
- Adicionar credenciais em `.env.local`
- Usar variáveis de ambiente em produção

❌ **NÃO**
- Versionador `.env` com credenciais reais
- Expor JWT_SECRET no código
- Usar senhas padrão/simples

---

## 📞 SOS - Problemas Comuns

| Problema | Solução |
|----------|---------|
| DATABASE_URL not found | Execute `npm run setup-env` |
| Cannot find module 'pg' | Execute `npm install` |
| Connection refused | Verificar DATABASE_URL |
| Porta 3001 já em uso | Mudar PORT no `.env.local` |
| JWT_SECRET inválido | Gerar novo com comando acima |

---

## 📚 Documentação Completa

- `README-SETUP.md` - Setup guia rápido
- `ENVIRONMENT.md` - Configuração detalhada
- `STRUCTURE.md` - Visão geral da estrutura
- `DEPLOY-CHECKLIST.md` - Antes de ir para produção
- `QUICK-REFERENCE.md` - Você está aqui!

---

## 🎯 Fluxo Rápido

```
[ ] npm install
[ ] npm run setup-env        ← Responda perguntas
[ ] npm run test-postgres    ← Verificar conexão
[ ] npm run dev              ← Servidor ligado! 🚀
```

**Servidor em:** `http://localhost:3001`

---

**Última atualização:** 2026-09-14
