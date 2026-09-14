# 🌳 Decision Tree - Qual Arquivo Ler?

## 🎯 O que você quer fazer?

```
┌─────────────────────────────────────────────────────────────┐
│ Sou novo no projeto e quero começar rápido                 │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
              📖 README-SETUP.md
              ⏱️ 5 minutos
              
┌─────────────────────────────────────────────────────────────┐
│ Quero entender toda a configuração de ambiente              │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
              📖 ENVIRONMENT.md
              ⏱️ 15 minutos
              
┌─────────────────────────────────────────────────────────────┐
│ Preciso saber qual arquivo faz o quê                        │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
              📖 STRUCTURE.md
              ⏱️ 10 minutos
              
┌─────────────────────────────────────────────────────────────┐
│ Vou fazer deploy para produção                              │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
              📖 DEPLOY-CHECKLIST.md
              ⏱️ 20 minutos
              
┌─────────────────────────────────────────────────────────────┐
│ Preciso de um comando rápido/atalho                         │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
              📖 QUICK-REFERENCE.md
              ⏱️ 2 minutos
              
┌─────────────────────────────────────────────────────────────┐
│ Estou confuso, onde começo?                                 │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
              🏃 1. npm run setup-env
              🏃 2. npm run dev
              ✅ Pronto!
```

---

## 📖 Guia por Cenário

### 1️⃣ Desenvolvedor Novo

**Seu fluxo:**
1. Clonar repositório
2. `npm install`
3. `npm run setup-env` ← Siga as perguntas!
4. `npm run test-postgres`
5. `npm run dev`

**Leia:** `README-SETUP.md`

---

### 2️⃣ DevOps / Deploy

**Seu fluxo:**
1. Revisar `.env.production.example`
2. Configurar variáveis no host (Heroku, Railway, etc)
3. Seguir `DEPLOY-CHECKLIST.md`
4. Git push
5. Testar endpoints

**Leia:** `DEPLOY-CHECKLIST.md` → `ENVIRONMENT.md`

---

### 3️⃣ Revisor de Código

**Seu fluxo:**
1. Verificar que `.env` NÃO está em staging
2. Garantir que `.env.example` foi atualizado
3. Verificar credenciais não estão no código

**Leia:** `STRUCTURE.md` (seção Git)

---

### 4️⃣ Troubleshooting / SOS

**Seu fluxo:**
1. Verificar `QUICK-REFERENCE.md` problemas comuns
2. Se não encontrou: `ENVIRONMENT.md` troubleshooting
3. Se ainda não resolveu: `DEPLOY-CHECKLIST.md`

**Leia:** `QUICK-REFERENCE.md` → `ENVIRONMENT.md`

---

### 5️⃣ Aprender Segurança

**Seu fluxo:**
1. Entender multi-tenancy: `ENVIRONMENT.md`
2. Segurança de credenciais: `STRUCTURE.md`
3. Best practices: `DEPLOY-CHECKLIST.md`

**Leia:** `STRUCTURE.md` (seção Segurança)

---

## 🗺️ Mapa Completo

```
┌──────────────────────────────────────────────────────┐
│        DOCUMENTAÇÃO - PULYN BACKEND                  │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ENTRADA (Novo Desenvolvedor)                       │
│  └─ README-SETUP.md ⭐ COMECE AQUI                  │
│                                                      │
│  QUICK START                                        │
│  └─ QUICK-REFERENCE.md (Comandos & Atalhos)        │
│                                                      │
│  APRENDIZADO                                        │
│  ├─ STRUCTURE.md (Visão Geral)                     │
│  └─ ENVIRONMENT.md (Guia Completo)                 │
│                                                      │
│  PRODUÇÃO                                           │
│  └─ DEPLOY-CHECKLIST.md (Antes de Deploy)          │
│                                                      │
│  DECISION-TREE (Você está aqui)                    │
│  └─ Como navegar entre documentos                   │
│                                                      │
│  SCRIPTS AUTOMÁTICOS                                │
│  └─ setup-env.js (Configuração Interativa)         │
│                                                      │
│  TEMPLATES (Git)                                    │
│  ├─ .env.example                                    │
│  ├─ .env.production.example                         │
│  └─ .env.lan.example                                │
│                                                      │
└──────────────────────────────────────────────────────┘
```

---

## ⏱️ Quanto Tempo Leva?

| Tarefa | Tempo | Documento |
|--------|-------|-----------|
| Setup inicial | 5 min | README-SETUP.md |
| Entender tudo | 15 min | ENVIRONMENT.md |
| Deploy | 20 min | DEPLOY-CHECKLIST.md |
| Troubleshooting | 5 min | QUICK-REFERENCE.md |
| **TOTAL FIRST RUN** | **~10 min** | README-SETUP.md |

---

## 🎯 Checklist de Leitura

**Novo Dev:**
- [ ] README-SETUP.md (5 min)
- [ ] QUICK-REFERENCE.md (2 min)
- [ ] Seguir npm run setup-env

**Time Todo:**
- [ ] STRUCTURE.md (10 min)
- [ ] ENVIRONMENT.md (15 min)
- [ ] Entender segurança

**Antes de Deploy:**
- [ ] DEPLOY-CHECKLIST.md (20 min)
- [ ] Verificar todas as variáveis
- [ ] Testar em staging

---

## 🆘 Emergência

**Algo não funciona?**
```
1. npm run setup-env           (Reconfigura tudo)
2. npm install                 (Garante dependências)
3. npm run test-postgres       (Testa banco)
4. npm run dev                 (Tenta rodar)
5. Leia QUICK-REFERENCE.md     (Problemas comuns)
```

---

## 📞 Contato Rápido

- **Não sabe por onde começar?** → README-SETUP.md
- **Precisa de um comando?** → QUICK-REFERENCE.md
- **Quer entender tudo?** → ENVIRONMENT.md
- **Vai fazer deploy?** → DEPLOY-CHECKLIST.md
- **Qual arquivo lê?** → DECISION-TREE.md (você está aqui!)

---

**Última atualização:** 2026-09-14
**Versão da Doc:** 1.0
