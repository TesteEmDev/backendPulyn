# 🐘 Setup PostgreSQL - Pulyn Backend

## Configurar o Banco de Dados

### 1. Criar banco de dados e usuário

Se você ainda não tem um banco criado:

```sql
CREATE DATABASE "PulynDB";
CREATE USER postgres WITH PASSWORD 'sua_senha_aqui';
ALTER ROLE postgres SUPERUSER;
```

### 2. Verificar Credenciais

No Windows, o PostgreSQL geralmente usa:
- **Host**: `localhost` ou `127.0.0.1`
- **Port**: `5432`
- **Database**: `PulynDB`
- **User**: `postgres`
- **Password**: A senha que você definiu

### 3. Configurar `.env`

```env
DB_DRIVER=postgres
PGHOST=localhost
PGPORT=5432
PGDATABASE=PulynDB
PGUSER=postgres
PGPASSWORD=sua_senha
DB_SSL=false
```

### 4. Verificar Conexão

```bash
psql -h localhost -U postgres -d PulynDB
```

### 5. Adicionar Coluna para QR Code

```sql
ALTER TABLE criancas ADD COLUMN qrcode VARCHAR(50) NULL;
ALTER TABLE family_child_links ADD COLUMN qrcode VARCHAR(50) NULL;
CREATE INDEX idx_criancas_qrcode ON criancas(qrcode);
CREATE INDEX idx_family_child_links_qrcode ON family_child_links(qrcode);
```

### 6. Iniciar o Servidor

```bash
npm start
```

Você deve ver:

```
✅ Conectado ao PostgreSQL com sucesso!
```

## 🔧 Troubleshooting

| Problema | Solução |
|----------|---------|
| `ECONNREFUSED` na porta 5432 | PostgreSQL não está rodando |
| `password authentication failed` | Senha incorreta no `.env` |
| `database "PulynDB" does not exist` | Crie o banco: `CREATE DATABASE "PulynDB";` |

## ✅ Pronto!

Seu PostgreSQL está configurado e pronto para usar!
