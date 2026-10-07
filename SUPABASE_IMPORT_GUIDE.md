# Guia de Importação para Supabase

## 📊 Arquivo de Backup
- **Nome**: `backup_full_portuguese.sql`
- **Tamanho**: ~0.94 MB
- **Tabelas**: 45 (todas em português)
- **Status**: Pronto para importar

## ✅ O que está incluído:
- Esquema completo de todas as 45 tabelas
- Dados existentes no banco local
- Todos os nomes em português (sem snake_case)
- Índices e constraints

## 🚀 Como importar no Supabase:

### Opção 1: Via Dashboard Supabase (Recomendado)
1. Acesse seu projeto no [Supabase](https://supabase.com)
2. Vá para **SQL Editor** (ou **SQL** na esquerda)
3. Clique em **New Query**
4. Copie e cole o conteúdo do arquivo `backup_full_portuguese.sql`
5. Clique em **Run** para executar

### Opção 2: Via psql (Linha de comando)
```bash
# Substitua as credenciais do seu Supabase
psql -h seu-host-supabase.supabase.co \
     -U postgres \
     -d postgres \
     -f backup_full_portuguese.sql
```

### Opção 3: Via SSH (Para projetos maiores)
```bash
# Tunnel para Supabase
ssh -L 5432:localhost:5432 seu-usuario@seu-host

# Em outro terminal
psql -h localhost -U postgres -d sua-db -f backup_full_portuguese.sql
```

## ⚠️ Pontos Importantes:

### Antes de importar:
- ✅ Verifique se você tem permissões de admin no Supabase
- ✅ Faça backup do banco Supabase existente (se houver)
- ✅ Se o banco já tem dados, considere criar um novo projeto
- ✅ Verifique se as extensões estão habilitadas (se necessário)

### Possíveis conflitos:
- Se houver tabelas com mesmo nome, a importação pode falhar
- Nesse caso, delete as tabelas antigas no Supabase primeiro
- Ou renomeie o arquivo SQL e edite os nomes das tabelas

## 🔧 Próximos passos:

### 1. Verificar dados após importação:
```sql
-- Contar tabelas importadas
SELECT count(*) FROM information_schema.tables 
WHERE table_schema = 'public';
-- Deve retornar 45

-- Verificar nomes das tabelas
SELECT tablename FROM pg_tables 
WHERE schemaname = 'public' 
ORDER BY tablename;
```

### 2. Atualizar credenciais no backend:
Atualize `.env` no backend com as credenciais do Supabase:
```
PGHOST=seu-host.supabase.co
PGPORT=5432
PGDATABASE=postgres
PGUSER=postgres
PGPASSWORD=sua-senha
```

### 3. Atualizar credenciais no frontend (se necessário):
Se usar Supabase cliente (JavaScript), atualize:
```javascript
const supabase = createClient('https://seu-url.supabase.co', 'sua-public-key');
```

## 📋 Checklist Final:

- [ ] Arquivo `backup_full_portuguese.sql` copiado para local seguro
- [ ] Projeto Supabase criado e ativo
- [ ] Backup do banco Supabase existente feito (se necessário)
- [ ] Dados importados com sucesso
- [ ] 45 tabelas visíveis no Supabase
- [ ] Dados verificados (row count confere)
- [ ] Backend atualizado com novas credenciais
- [ ] Frontend atualizado com novas credenciais (se cliente-side)
- [ ] Testado conexão com novo banco

## 🆘 Troubleshooting:

### "Permission denied"
- Use conta de admin no Supabase
- Verifique se a senha está correta

### "Table already exists"
- Delete tabelas antigas no Supabase antes de importar
- Ou edite o SQL para usar `DROP TABLE IF EXISTS` primeiro

### "Extension not found"
- Algunas extensões podem não estar disponíveis no Supabase
- Comente as linhas com CREATE EXTENSION no arquivo SQL

### Caracteres estranhos (português)
- Verifique que a encoding está UTF-8
- Supabase usa UTF-8 por padrão

## 📞 Suporte:
- [Documentação Supabase](https://supabase.com/docs)
- [Supabase Community](https://discord.supabase.io)
