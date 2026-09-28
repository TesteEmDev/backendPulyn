# 🔗 Guia: Vinculação Familiar via QR Code

## 📋 Visão Geral

Sistema completo que permite pais/responsáveis escanear um QR Code para se vincularem às crianças no app mobile Pulyn Family.

### Fluxo

```
1. RECEPÇÃO gera QR Code para criança
   └─ POST /api/family/qrcode/generate
   └─ Retorna: imagem PNG + URL rastreamento

2. RECEPÇÃO mostra QR Code para pais (impressão/tela)

3. PAI escaneia QR Code no app mobile
   └─ QRScannerScreen
   └─ Detecta código

4. PAI confirma vinculação
   └─ POST /api/family/qrcode/validate
   └─ Criança aparece em "Minhas Crianças"

5. PAI acompanha performance filho
   └─ GET /api/family/children
   └─ GET /api/family/children/{id}/performance
```

---

## 🗄️ Estrutura do Banco de Dados

### `family_linking_codes`
Códigos QR temporários para vinculação

```sql
CREATE TABLE family_linking_codes (
  id UNIQUEIDENTIFIER,
  crianca_id UNIQUEIDENTIFIER,
  evento_id UNIQUEIDENTIFIER,
  empresa_id UNIQUEIDENTIFIER,
  qr_code_value VARCHAR(50) UNIQUE,
  tracking_url VARCHAR(500),
  status VARCHAR(20),          -- active, used, expired
  created_at DATETIME2,
  expires_at DATETIME2,        -- 24 horas
  used_at DATETIME2,
  used_by_login_id UNIQUEIDENTIFIER
)
```

### `family_child_links`
Links entre pais e crianças (permanentes)

```sql
CREATE TABLE family_child_links (
  id UNIQUEIDENTIFIER,
  family_login_id UNIQUEIDENTIFIER,
  crianca_id UNIQUEIDENTIFIER,
  empresa_id UNIQUEIDENTIFIER,
  relationship VARCHAR(50),     -- parent, guardian, relative
  status VARCHAR(20),           -- active, pending, inactive
  linked_at DATETIME2,
  unlinked_at DATETIME2
)
```

---

## 🔌 Endpoints da API

### 1. Gerar QR Code (RECEPÇÃO)

**Request:**
```bash
POST /api/family/qrcode/generate
Authorization: Bearer {token-recepcion}
Content-Type: application/json

{
  "criancaId": "uuid-da-crianca",
  "eventoId": "uuid-do-evento"
}
```

**Response (200):**
```json
{
  "success": true,
  "qrCode": "PULYN-A1B2C3D4",
  "trackingUrl": "http://localhost:3000/child-performance/...",
  "crianca": {
    "id": "uuid",
    "name": "João Silva",
    "nickname": "João",
    "evento": "Festa de Aniversário"
  },
  "qrCodeImage": "data:image/png;base64,iVBORw0KGgoAAAANS..."
}
```

**cURL:**
```bash
curl -X POST http://localhost:3001/api/family/qrcode/generate \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "criancaId": "123e4567-e89b-12d3-a456-426614174000",
    "eventoId": "123e4567-e89b-12d3-a456-426614174111"
  }'
```

---

### 2. Validar QR Code (APP MOBILE)

**Request:**
```bash
POST /api/family/qrcode/validate
Authorization: Bearer {token-family}
Content-Type: application/json

{
  "qrCodeValue": "PULYN-A1B2C3D4"
}
```

**Response (200) - Sucesso:**
```json
{
  "success": true,
  "message": "Criança vinculada com sucesso!",
  "linkedChild": {
    "id": "uuid",
    "name": "João Silva",
    "nickname": "João",
    "age": 7,
    "evento": "Festa de Aniversário"
  }
}
```

**Response (400) - Já Vinculado:**
```json
{
  "error": "Você já está vinculado a esta criança",
  "code": "ALREADY_LINKED"
}
```

**Response (404) - Código Inválido:**
```json
{
  "error": "Código QR inválido ou expirado",
  "code": "INVALID_QR_CODE"
}
```

---

### 3. Listar Crianças Vinculadas (APP MOBILE)

**Request:**
```bash
GET /api/family/children
Authorization: Bearer {token-family}
```

**Response:**
```json
{
  "success": true,
  "children": [
    {
      "link_id": "uuid",
      "crianca_id": "uuid",
      "name": "João Silva",
      "nickname": "João",
      "age": 7,
      "time_name": "Time Vermelho",
      "time_color": "#FF0000",
      "evento_id": "uuid",
      "evento_nome": "Festa de Aniversário",
      "date": "2026-09-14",
      "status": "active"
    }
  ]
}
```

---

### 4. Buscar Performance da Criança (APP MOBILE)

**Request:**
```bash
GET /api/family/children/{criancaId}/performance
Authorization: Bearer {token-family}
```

**Response:**
```json
{
  "success": true,
  "crianca": {
    "id": "uuid",
    "name": "João Silva",
    "nickname": "João",
    "age": 7,
    "totalScore": 150,
    "team": {
      "name": "Time Vermelho",
      "color": "#FF0000"
    },
    "event": {
      "name": "Festa de Aniversário",
      "date": "2026-09-14",
      "status": "active"
    }
  },
  "scoreHistory": [
    {
      "checkpoint_id": "uuid",
      "points": 10,
      "created_at": "2026-09-14T10:30:00Z"
    }
  ]
}
```

---

### 5. Desvinc ular Criança (APP MOBILE)

**Request:**
```bash
DELETE /api/family/children/{criancaId}/unlink
Authorization: Bearer {token-family}
```

**Response:**
```json
{
  "success": true,
  "message": "Criança desvinculada com sucesso"
}
```

---

## 📱 Screens no App Flutter

### QRScannerScreen
- Acessa câmera do telefone
- Escaneia código QR
- Valida com backend
- Mostra sucesso/erro

```dart
QRScannerScreen(
  apiUrl: 'http://localhost:3001',
  token: authToken,
  onChildLinked: (child) {
    // Atualizar lista de crianças
  }
)
```

### LinkedChildrenScreen
- Lista crianças vinculadas
- Botão para escanear novo
- Acesso a detalhes/performance
- Opção de desvinc ular

---

## 🧪 Testes Recomendados

### 1. Teste de Geração (Recepção)

```bash
# 1. Faça login como recepcionista
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "reception@buffet.com",
    "password": "senha123"
  }'

# 2. Use o token para gerar QR Code
RECEPTION_TOKEN="eyJhbGc..." # Do passo anterior

curl -X POST http://localhost:3001/api/family/qrcode/generate \
  -H "Authorization: Bearer $RECEPTION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "criancaId": "YOUR_CHILD_ID",
    "eventoId": "YOUR_EVENT_ID"
  }' > qrcode.json

# 3. Salve a imagem
jq -r '.qrCodeImage' qrcode.json | \
  sed 's/^data:image\/png;base64,//' | \
  base64 -d > qrcode.png
```

### 2. Teste de Validação (App)

```bash
# 1. Faça login como pais
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "pai@email.com",
    "password": "senha123"
  }'

# 2. Valide o QR Code
FAMILY_TOKEN="eyJhbGc..." # Do passo anterior
QR_CODE="PULYN-A1B2C3D4" # Do teste 1

curl -X POST http://localhost:3001/api/family/qrcode/validate \
  -H "Authorization: Bearer $FAMILY_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"qrCodeValue\": \"$QR_CODE\"
  }"

# 3. Listar crianças vinculadas
curl -X GET http://localhost:3001/api/family/children \
  -H "Authorization: Bearer $FAMILY_TOKEN"
```

---

## 🚀 Instalação & Setup

### 1. Executar Migração

```bash
cd api/server

# Criar tabelas
node -e "
const migrations = require('./migrations/family-linking-tables');
migrations.up().then(() => process.exit(0));
"
```

### 2. Adicionar Dependências no App Mobile

```bash
cd pulyn_family_app

# QR Scanner
flutter pub add mobile_scanner

# HTTP
flutter pub add http
```

### 3. Configurar Permissions (Android/iOS)

**android/app/AndroidManifest.xml:**
```xml
<uses-permission android:name="android.permission.CAMERA" />
```

**ios/Runner/Info.plist:**
```xml
<key>NSCameraUsageDescription</key>
<string>Precisamos da câmera para escanear códigos QR</string>
```

---

## 📊 Fluxo de Dados

```
RECEPÇÃO
  │
  ├─ POST /api/family/qrcode/generate
  │  └─ Gera: PULYN-A1B2C3D4
  │  └─ Cria: family_linking_codes (active, 24h)
  │  └─ Retorna: PNG image + URL
  │
  └─ Imprime/Exibe QR Code

APP MOBILE (PAI)
  │
  ├─ Escaneia QR Code
  │  └─ Detecta: PULYN-A1B2C3D4
  │
  └─ POST /api/family/qrcode/validate
     ├─ Busca: family_linking_codes[PULYN-A1B2C3D4]
     ├─ Verifica: status='active' + not expired
     ├─ Cria: family_child_links (active)
     ├─ Atualiza: family_linking_codes[status='used']
     └─ Retorna: {sucesso, dados-crianca}

RESULTADO
  │
  ├─ Criança aparece em "Minhas Crianças"
  ├─ Pais pode acompanhar pontuação
  └─ QR Code fica "used" (não pode ser reusado)
```

---

## ⚠️ Validações & Segurança

✅ **Aplicadas:**
- Token JWT validado em todos endpoints
- Código QR expira em 24 horas
- Evita duplicatas (UNIQUE constraint)
- Role-based access (reception vs family)
- Empresas isoladas (multi-tenant)

❓ **Considerar:**
- Rate limiting para geração de QR codes
- Notificação ao pais quando criança é vinculada
- Histórico de tentativas de vinculação
- Confirmação de email antes de ativar

---

## 📞 Troubleshooting

### "Código QR inválido ou expirado"
- Verifique se QR Code foi gerado há menos de 24 horas
- Verifique se não foi usado (status = used)
- Gere um novo código

### "Você já está vinculado a esta criança"
- Pais já tem vínculo ativo com esta criança
- Remova (DELETE /unlink) se quiser refazer

### "Apenas recepção pode gerar QR codes"
- Role do usuário não é 'reception' ou 'admin'
- Verificar permissões do usuário

---

## 📝 Próximas Melhorias

- [ ] Notificações push quando pais se vincula
- [ ] Geração em lote de QR codes (arquivo PDF)
- [ ] Histórico de tentativas falhadas
- [ ] Confirmação de email antes de ativar
- [ ] Rate limiting por IP
- [ ] Código QR customizável (logo, cores)

---

**Versão:** 1.0.0
**Data:** 2026-09-14
**Status:** Pronto para Testes ✅
