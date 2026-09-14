# ⚡ Supabase Local - Quick Start

## 🚀 Passo 1: Instalar Docker

Baixe [Docker Desktop para Windows](https://www.docker.com/products/docker-desktop) e instale.

## 🔧 Passo 2: Baixar Supabase

```powershell
mkdir C:\Supabase
cd C:\Supabase
git clone https://github.com/supabase/supabase.git
cd supabase/docker
```

## ⚙️ Passo 3: Criar `.env`

Na pasta `C:\Supabase\supabase\docker`, crie um arquivo `.env`:

```env
POSTGRES_PASSWORD=postgres
POSTGRES_DB=postgres
JWT_SECRET=super-secret-jwt-token-with-at-least-32-characters-long
```

## 🎬 Passo 4: Iniciar Supabase

```powershell
docker-compose up
```

Aguarde 2-3 minutos.

## 🧪 Passo 5: Testar Conexão

No arquivo `.env` do seu projeto:

```env
DB_DRIVER=postgres
PGHOST=localhost
PGPORT=5432
PGDATABASE=postgres
PGUSER=postgres
PGPASSWORD=postgres
DB_SSL=false
```

Execute:

```bash
node test-supabase-connection.js
```

## 🚀 Passo 6: Iniciar Backend

```bash
npm start
```

## 🎉 Pronto!

Você tem um Supabase Local completamente funcional rodando em Docker! 🎊
