# 🚀 Pulyn Backend - Setup Guia Rápido

## ⚡ Quick Start (30 segundos)

```bash
# 1. Instalar dependências
npm install

# 2. Configurar ambiente interativamente
npm run setup-env

# 3. Testar conexão
npm run test-postgres  # Se PostgreSQL
npm run test-connection # Se SQL Server

# 4. Rodar servidor
npm run dev
```

**Servidor rodando em:** `http://localhost:3001`

---

## 📁 O que foi criado?

```
api/server/
├── .env.local                ← Seu arquivo local (NÃO versionar)
├── .env.example              ← Template para novos devs
├── .env.production.example   ← Template para produção
├── ENVIRONMENT.md            ← Documentação completa
└── setup-env.js              ← Script de configuração
```

---

## 🔧 Manual: Se preferir editar `.env.local` direto

### PostgreSQL/Supabase (Recomendado)

```env
NODE_ENV=development
PORT=3001
JWT_SECRET=seu-segredo-aqui

DB_DRIVER=postgres
DATABASE_URL=postgresql://usuario:senha@host:5432/postgres
DB_TIMEOUT=30000

FRONTEND_URL=http://localhost:5173
```

### SQL Server Local

```env
NODE_ENV=development
PORT=3001
JWT_SECRET=seu-segredo-aqui

DB_DRIVER=sqlserver
DB_SERVER=localhost
DB_NAME=PulynDB
DB_USER=sa
DB_PASSWORD=123456
DB_TIMEOUT=30000

FRONTEND_URL=http://localhost:5173
```

---

## ✅ Checklist

- [ ] Dependências instaladas (`npm install`)
- [ ] `.env.local` criado e preenchido
- [ ] Conexão testada (`npm run test-postgres` ou `test-connection`)
- [ ] Servidor rodando (`npm run dev`)
- [ ] Pode fazer requisições para `http://localhost:3001`

---

## 📝 Importante: Git & Segurança

✅ **SIM, versione isso:**
- `.env.example`
- `.env.production.example`
- `ENVIRONMENT.md`
- `setup-env.js`

❌ **NÃO, não versione isso:**
- `.env`
- `.env.local`
- `.env.*` (exceto exemplos)

O `.gitignore` já está configurado corretamente!

---

## 🆘 Problemas?

### Erro: "DATABASE_URL is not set"
- Edite `.env.local` e adicione `DATABASE_URL`

### Erro: "Cannot find module 'pg'"
```bash
npm install
```

### Porta 3001 já em uso?
Edite `.env.local` e mude `PORT=3002` (ou outra)

### Conexão com Supabase recusada?
- Verificar `DATABASE_URL` correto
- Testar: `npm run test-postgres`
- Verificar firewall/VPN

---

## 📚 Mais Informações

Veja `ENVIRONMENT.md` para:
- Configuração completa
- Deploy em produção (Heroku, Railway, etc)
- Troubleshooting avançado
- Segurança

---

## 🎯 Próximos Passos

1. ✅ Setup concluído
2. Integrar com frontend em `../front-pulyn`
3. Testar endpoints da API
4. Preparar para produção

---

**Dúvidas?** Consulte `ENVIRONMENT.md` ou `setup-env.js`
