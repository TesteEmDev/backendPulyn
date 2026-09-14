# 📱 Exemplos de Integração - Frontend (React/Vue)

## Exemplo 1: Componente React

```jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function ChildQRCode({ criancaId, token }) {
  const [loading, setLoading] = useState(false);
  const [qrCode, setQrCode] = useState(null);
  const [imageSrc, setImageSrc] = useState(null);

  const handleGenerateQR = async () => {
    setLoading(true);
    try {
      const response = await axios.post(
        `${process.env.REACT_APP_API_URL}/criancas/${criancaId}/generate-qrcode`,
        {},
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      
      setQrCode(response.data.qrCode);
      const imgUrl = `${process.env.REACT_APP_API_URL}/criancas/${criancaId}/qrcode-image?t=${Date.now()}`;
      setImageSrc(imgUrl);
    } catch (err) {
      alert('Erro ao gerar QR Code');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const imgUrl = `${process.env.REACT_APP_API_URL}/criancas/${criancaId}/qrcode-image`;
    setImageSrc(imgUrl);
  }, [criancaId, token]);

  return (
    <div style={{ border: '1px solid #ddd', padding: '20px', borderRadius: '8px', textAlign: 'center' }}>
      <h2>QR Code da Criança</h2>
      
      {imageSrc && (
        <div style={{ marginBottom: '20px' }}>
          <img src={imageSrc} alt="QR Code" style={{ width: '250px', height: '250px' }} />
        </div>
      )}

      {qrCode && (
        <p style={{ fontSize: '12px', color: '#666' }}>
          Código: <strong>{qrCode}</strong>
        </p>
      )}

      <button 
        onClick={handleGenerateQR}
        disabled={loading}
        style={{
          padding: '10px 20px',
          backgroundColor: '#4CAF50',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: loading ? 'not-allowed' : 'pointer'
        }}
      >
        {loading ? '⏳ Gerando...' : '🔄 Gerar QR Code'}
      </button>
    </div>
  );
}
```

**Uso**:
```jsx
<ChildQRCode criancaId="uuid-da-crianca" token="seu-token-jwt" />
```

---

## Exemplo 2: Componente Vue

```vue
<template>
  <div class="qrcode-container">
    <h2>QR Code da Criança</h2>
    
    <div v-if="imageSrc" class="qrcode-image">
      <img :src="imageSrc" alt="QR Code" width="250" height="250" />
    </div>

    <p v-if="qrCode" class="qrcode-text">
      Código: <strong>{{ qrCode }}</strong>
    </p>

    <button 
      @click="handleGenerateQR" 
      :disabled="loading"
      class="btn btn-primary"
    >
      {{ loading ? '⏳ Gerando...' : '🔄 Gerar QR Code' }}
    </button>
  </div>
</template>

<script>
import axios from 'axios';

export default {
  props: {
    criancaId: String,
    token: String
  },
  data() {
    return {
      loading: false,
      qrCode: null,
      imageSrc: null
    };
  },
  mounted() {
    this.loadQRCodeImage();
  },
  methods: {
    async handleGenerateQR() {
      this.loading = true;
      try {
        const response = await axios.post(
          `${process.env.VUE_APP_API_URL}/criancas/${this.criancaId}/generate-qrcode`,
          {},
          { headers: { 'Authorization': `Bearer ${this.token}` } }
        );
        
        this.qrCode = response.data.qrCode;
        this.loadQRCodeImage();
      } catch (err) {
        alert('Erro ao gerar QR Code');
      } finally {
        this.loading = false;
      }
    },
    
    loadQRCodeImage() {
      const imgUrl = `${process.env.VUE_APP_API_URL}/criancas/${this.criancaId}/qrcode-image?t=${Date.now()}`;
      this.imageSrc = imgUrl;
    }
  }
};
</script>

<style scoped>
.qrcode-container {
  border: 1px solid #ddd;
  padding: 20px;
  border-radius: 8px;
  text-align: center;
  max-width: 400px;
}

.qrcode-image {
  margin-bottom: 20px;
}

.qrcode-text {
  font-size: 12px;
  color: #666;
}

.btn {
  padding: 10px 20px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.btn-primary {
  background-color: #4CAF50;
  color: white;
}

.btn-primary:disabled {
  background-color: #ccc;
  cursor: not-allowed;
}
</style>
```

---

## Exemplo 3: Função para Gerar QR Codes em Lote

```javascript
async function generateQRCodesForEvent(eventoId, token) {
  try {
    const response = await fetch(
      `${process.env.REACT_APP_API_URL}/criancas/eventos/${eventoId}/generate-qrcodes-batch`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const data = await response.json();

    if (response.ok) {
      console.log(`✅ ${data.generated} QR Codes gerados`);
      return data;
    } else {
      throw new Error(data.error);
    }
  } catch (err) {
    console.error('Erro:', err);
  }
}
```

---

## 💡 Dicas

1. **CORS**: Se frontend está em domínio diferente, configure CORS no backend
2. **Cache**: Use `?t=${Date.now()}` para evitar cache
3. **Erro**: Sempre trate erros da API
4. **Token**: Sempre inclua header `Authorization: Bearer ${token}`

## ✅ Pronto!

Seu frontend agora pode gerar e exibir QR Codes! 🚀
