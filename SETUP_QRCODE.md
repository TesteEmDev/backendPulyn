# Setup - Sistema de QR Code

## Passo 1: Instalar a Dependência

```bash
npm install qrcode
```

## Passo 2: Atualizar o Banco de Dados

Execute o script de migração:

```bash
node check-qrcode-columns.js
```

Ou execute manualmente no seu banco:

### Para PostgreSQL:

```sql
ALTER TABLE criancas ADD COLUMN qrcode VARCHAR(50) NULL;
ALTER TABLE family_child_links ADD COLUMN qrcode VARCHAR(50) NULL;
CREATE INDEX idx_criancas_qrcode ON criancas(qrcode);
CREATE INDEX idx_family_child_links_qrcode ON family_child_links(qrcode);
```

### Para SQL Server:

```sql
ALTER TABLE criancas ADD qrcode VARCHAR(50) NULL;
ALTER TABLE family_child_links ADD qrcode VARCHAR(50) NULL;
CREATE INDEX idx_criancas_qrcode ON criancas(qrcode);
CREATE INDEX idx_family_child_links_qrcode ON family_child_links(qrcode);
```

## Passo 3: Adicionar Variável de Ambiente

No seu `.env`:

```env
FRONTEND_URL=http://localhost:3000
```

## Passo 4: Reiniciar o Servidor

```bash
npm start
```

## Passo 5: Testar

```bash
node test-qrcode-api.js
```

## ✅ Pronto!

Seus endpoints de QR Code estão prontos para usar!
