# ⚡ Quick Start - Sistema de QR Code

## 1️⃣ Configure PostgreSQL no `.env`

Adicione sua **senha do PostgreSQL**:

```env
PGPASSWORD=sua_senha_aqui
```

Ou use:

```env
DATABASE_URL=postgresql://postgres:sua_senha_aqui@localhost:5432/PulynDB
```

## 2️⃣ Instale a dependência `qrcode`

```bash
npm install qrcode
```

## 3️⃣ Verifique as Colunas do Banco

```bash
node check-qrcode-columns.js
```

## 4️⃣ Inicie o Servidor

```bash
npm start
```

## 5️⃣ Teste os Endpoints

```bash
node test-qrcode-api.js
```

## 📚 Documentação

- `QRCODE_IMPLEMENTATION.md` - Documentação técnica
- `FRONTEND_QRCODE_EXAMPLES.md` - Exemplos React/Vue
- `SUPABASE_LOCAL_SETUP.md` - Setup Supabase
- `DATABASE_OPTIONS.md` - Comparação de bancos

## 🚀 Endpoints Prontos

- **POST** `/criancas/:crianca_id/generate-qrcode`
- **GET** `/criancas/:crianca_id/qrcode-image`
- **POST** `/criancas/eventos/:evento_id/generate-qrcodes-batch`

## ✅ Pronto!

Seu sistema de QR Code está 100% configurado! 🎉
