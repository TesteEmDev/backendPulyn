# Implementação de QR Code para Acompanhamento de Desempenho

## 📋 Visão Geral

Foi implementado um sistema completo de geração de QR Codes para permitir que os pais acompanhem o desempenho dos filhos através de leitura de código QR.

### Estrutura

- **Arquivo Principal**: `utils/qrcode.js` - Funções de geração de QR Codes
- **Endpoints**: Novos endpoints adicionados a `routes/criancas.js`
- **Banco de Dados**: Coluna `qrcode` nas tabelas `criancas` e `family_child_links` (VARCHAR)

---

## 🔧 Configuração

### 1. Instalar Dependência

A biblioteca `qrcode` deve estar instalada no seu `package.json`. Se não estiver:

```bash
npm install qrcode
```

### 2. Variáveis de Ambiente

Adicione ao seu `.env`:

```env
FRONTEND_URL=http://localhost:3000
```

---

## 📁 Arquivo: `utils/qrcode.js`

### Funções Disponíveis

#### 1. `generateQRCode()`
Gera um código único no formato `PULYN-XXXXXXXX`

```javascript
const code = generateQRCode();
// Resultado: "PULYN-A1B2C3D4"
```

#### 2. `generateParentTrackingUrl(qrCodeValue, criancaId, baseUrl)`
Cria a URL para acompanhamento do filho

```javascript
const url = generateParentTrackingUrl('PULYN-A1B2C3D4', 'crianca-uuid', 'https://app.pulyn.com');
// Resultado: "https://app.pulyn.com/child-performance/<token-base64>"
```

#### 3. `generateQRCodeImage(trackingUrl)`
Gera a imagem PNG do QR Code (assíncrono)

```javascript
const imageBuffer = await generateQRCodeImage(url);
// Resultado: Buffer contendo a imagem PNG
```

#### 4. `generateQRCodeSVG(trackingUrl)`
Gera o SVG do QR Code (alternativa para salvar como arquivo)

```javascript
const svgString = await generateQRCodeSVG(url);
// Resultado: String SVG com o código
```

#### 5. `createQRCodeForChild(criancaId, baseUrl)` ⭐ Principal
Função completa que:
- Gera um código único
- Cria a URL de rastreamento
- Gera a imagem PNG

```javascript
const result = await createQRCodeForChild('crianca-uuid');
// Resultado: {
//   qrCode: 'PULYN-A1B2C3D4',
//   trackingUrl: 'https://app.pulyn.com/child-performance/Y3JpYW5jYS11dWlkOlBVTFlOLUExQjJDM0Q0',
//   image: Buffer<...>
// }
```

---

## 🌐 Endpoints da API

### 1. POST `/criancas/:crianca_id/generate-qrcode`

**Descrição**: Gera ou regenera um QR Code para uma criança

**Autenticação**: Requerida (verifyToken)

**Resposta (200)**:
```json
{
  "ok": true,
  "message": "QR Code gerado com sucesso",
  "qrCode": "PULYN-A1B2C3D4",
  "trackingUrl": "https://app.pulyn.com/child-performance/..."
}
```

---

### 2. GET `/criancas/:crianca_id/qrcode-image`

**Descrição**: Retorna a imagem PNG do QR Code. Se ainda não foi gerado, gera automaticamente.

**Autenticação**: Requerida (verifyToken)

**Content-Type**: `image/png`

**Resposta**: Buffer da imagem PNG

---

### 3. POST `/criancas/eventos/:evento_id/generate-qrcodes-batch`

**Descrição**: Gera QR Codes em lote para todas as crianças de um evento que ainda não possuem código

**Autenticação**: Requerida (roles: admin, reception, game_master)

**Resposta (200)**:
```json
{
  "ok": true,
  "message": "15 QR Code(s) gerado(s) com sucesso",
  "generated": 15,
  "total": 15,
  "results": [...]
}
```

---

## 💾 Banco de Dados

### Estrutura das Colunas

As tabelas `criancas` e `family_child_links` devem ter:

```sql
ALTER TABLE criancas ADD COLUMN qrcode VARCHAR(50) NULL;
ALTER TABLE family_child_links ADD COLUMN qrcode VARCHAR(50) NULL;
```

---

## 🔗 Fluxo de Funcionamento

### 1. Criação de QR Code

```
Usuário clica em "Gerar QR Code"
    ↓
POST /criancas/:crianca_id/generate-qrcode
    ↓
Função generateQRCode() → PULYN-XXXXXXXX
    ↓
Função generateParentTrackingUrl() → URL completa com token
    ↓
Atualizar banco de dados com o código
    ↓
Retornar sucesso ao usuário
```

### 2. Visualização do QR Code

```
GET /criancas/:crianca_id/qrcode-image
    ↓
Verificar se QR Code existe no banco
    ↓
Se não existe: gerar automaticamente
    ↓
Gerar imagem PNG usando generateQRCodeImage()
    ↓
Retornar como imagem/png
    ↓
Frontend exibe a imagem
```

---

## 🛡️ Segurança

### Token de Rastreamento

O token gerado segue o padrão:
```
Base64(crianca_id:qrcode)
```

---

## 🧪 Testes

### Teste Manual: Gerar QR Code

```bash
curl -X POST http://localhost:3000/criancas/crianca-uuid-teste/generate-qrcode \
  -H "Authorization: Bearer seu_token_valido" \
  -H "Content-Type: application/json"
```

### Teste Manual: Obter Imagem

```bash
curl -X GET http://localhost:3000/criancas/crianca-uuid-teste/qrcode-image \
  -H "Authorization: Bearer seu_token_valido" \
  --output qrcode.png
```

---

## ❓ Troubleshooting

| Problema | Solução |
|----------|---------|
| Módulo `qrcode` não encontrado | `npm install qrcode` |
| QR Code não aparece | Verificar se a criança existe e token está válido |
| Imagem quebrada no frontend | Verificar CORS e autenticação do token |
| Erro "criança não encontrada" | Verificar ID da criança e permissões |

---

## 📝 Próximos Passos

1. **Frontend**: Criar interface para gerar e visualizar QR Codes
2. **Página de Rastreamento**: Criar endpoint `/child-performance/:token` que valida o token e exibe desempenho
3. **PDF Export**: Adicionar função para exportar QR Code em PDF para impressão
4. **Email**: Enviar QR Code por email aos pais
