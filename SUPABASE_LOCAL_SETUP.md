# 🚀 Supabase Local - Setup Completo

## O que é Supabase Local?

Supabase é um backend open-source que fornece PostgreSQL + autenticação + APIs. Você pode rodar tudo **localmente** em um container Docker.

---

## 📋 Pré-requisitos

1. **Docker Desktop** - [Download aqui](https://www.docker.com/products/docker-desktop)
2. **Git** (opcional)

---

## 🔧 Instalação do Supabase Local

### Passo 1: Clonar o repositório Supabase

```bash
mkdir C:\Supabase
cd C:\Supabase
git clone https://github.com/supabase/supabase.git
cd supabase/docker
```

### Passo 2: Configurar variáveis de ambiente

Crie um arquivo `.env` na pasta `docker`:

```env
POSTGRES_PASSWORD=postgres
POSTGRES_DB=postgres
JWT_SECRET=super-secret-jwt-token-with-at-least-32-characters-long
```

### Passo 3: Iniciar Supabase

```bash
docker-compose up
```

Aguarde 2-3 minutos. Quando pronto, você verá:

```
db | ready to accept connections
```

---

## 🔌 Conectar seu Backend ao Supabase Local

No seu `.env`:

```env
DB_DRIVER=postgres
PGHOST=localhost
PGPORT=5432
PGDATABASE=postgres
PGUSER=postgres
PGPASSWORD=postgres
DB_SSL=false
```

Teste a conexão:

```bash
node test-supabase-connection.js
```

---

## ✅ Pronto!

Seu Supabase Local está funcionando! 🎉
