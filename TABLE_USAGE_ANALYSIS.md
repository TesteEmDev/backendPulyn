# 📊 Análise de Uso de Tabelas

## Resumo Executivo

| Status | Quantidade | Percentual |
|--------|-----------|-----------|
| ✅ **Tabelas Utilizadas** | 34 / 45 | **75.6%** |
| ⚠️ **Tabelas Não Utilizadas** | 11 / 45 | **24.4%** |

---

## ✅ Tabelas Ativas (34)

### Tier 1 - Mais Utilizadas (>100 referências)
| Tabela | Referências | Arquivos |
|--------|-----------|---------|
| `eventos` | 226 | 20 arquivos |
| `criancas` | 152 | 15 arquivos |
| `pontoVerificacao` | 148 | 17 arquivos |
| `times` | 127 | 9 arquivos |

### Tier 2 - Muito Utilizadas (50-100 referências)
| Tabela | Referências | Arquivos |
|--------|-----------|---------|
| `empresas` | 69 | 12 arquivos |
| `pulseiras` | 57 | 7 arquivos |
| `acessos` | 51 | 4 arquivos |
| `brincadeiras` | 51 | 6 arquivos |
| `clientes` | 51 | 6 arquivos |

### Tier 3 - Utilizadas (10-50 referências)
- `vinculoFamiliar` (38)
- `leituras` (35)
- `zonas` (25)
- `pontuacoes` (24)
- `chamadosSuport` (21)
- `logs` (14)
- `eventoBrincadeiras` (13)
- `conviteFamilia` (12)
- `configuracoes` (11)
- `etiquetasCheckpoint` (10)

### Tier 4 - Minimamente Utilizadas (1-10 referências)
- `cacaTesourPartidas` (7)
- `zonasConquistaPartidaIndividual` (7)
- `zonasConquistaPartidaTime` (7)
- `cacaTesourScans` (6)
- `mensagensDisplay` (6)
- `conquistas` (5)
- `codigosVinculoFamiliar` (4)
- `criancaConquistas` (3)
- `monsterCacaPartidas` (3)
- `zonasConquistaLeituraIndividual` (3)
- `zonasConquistaLeituraTime` (3)
- `zonasConquistaProtecaoCheckpointIndividual` (3)
- `zonasConquistaTempoTime` (3)
- `monsterCacaLeituras` (2)
- `sessoesJogo` (1)

---

## ⚠️ Tabelas Não Utilizadas (11)

```
1. bonusVencedorJogo
2. cacaTesourTempos
3. empresaEventoControle
4. estadoJogoEvento
5. monsterCacaEstadosTime
6. zonasConquistaEstadosCheckpoint
7. zonasConquistaEstadosParticipanteIndividual
8. zonasConquistaEstadosZona
9. zonasEquipesEstadosTime
10. zonasEquipesPartidas
11. zonasEquipesScans
```

---

## 🔍 Análise das Tabelas Não Utilizadas

### Categoria: Tabelas de Estado/Cache
- `empresaEventoControle` - Aparentemente cache de controle
- `estadoJogoEvento` - Estado do jogo em evento
- `monsterCacaEstadosTime` - Estado de time na caça ao monstro
- `zonasConquistaEstadosCheckpoint` - Estados de checkpoint
- `zonasConquistaEstadosParticipanteIndividual` - Estados de participante
- `zonasConquistaEstadosZona` - Estados de zona
- `zonasEquipesEstadosTime` - Estados de time em zonas de equipes

**Conclusão**: Parecem ser tabelas de cache/estado que talvez não estejam integradas ainda.

### Categoria: Tabelas de Tempos/Duração
- `cacaTesourTempos` - Tempos da caça ao tesouro
- `zonasEquipesPartidas` - Partidas de zonas de equipes
- `zonasEquipesScans` - Leituras de zonas de equipes

**Conclusão**: Parecem ser tabelas de gamificação que podem estar em desenvolvimento.

### Categoria: Bônus
- `bonusVencedorJogo` - Bônus para vencedor do jogo

**Conclusão**: Recurso de bônus que pode estar planejado mas não implementado.

---

## 💡 Recomendações

### Opção 1: Manter Tudo (Seguro para Futuros Desenvolvimentos)
✅ Mantém a estrutura pronta para novos features
✅ Sem risco de quebrar código futuro
❌ Banco com tabelas não usadas
❌ Confuso para novos desenvolvedores

### Opção 2: Remover Não Utilizadas (Limpeza)
✅ Banco mais limpo
✅ Melhor performance
✅ Mais fácil de manter
❌ Se precisar depois, terá que recriar

### Opção 3: Arquivar Não Utilizadas (Híbrido)
✅ Mantém dados se precisar
✅ Schema mais limpo
✅ Tabelas separadas por prefixo `_archive_`
❌ Complexidade moderada

---

## 📋 Próximos Passos Sugeridos

### Se decidir remover:
```sql
DROP TABLE IF EXISTS bonusVencedorJogo;
DROP TABLE IF EXISTS cacaTesourTempos;
DROP TABLE IF EXISTS empresaEventoControle;
DROP TABLE IF EXISTS estadoJogoEvento;
DROP TABLE IF EXISTS monsterCacaEstadosTime;
DROP TABLE IF EXISTS zonasConquistaEstadosCheckpoint;
DROP TABLE IF EXISTS zonasConquistaEstadosParticipanteIndividual;
DROP TABLE IF EXISTS zonasConquistaEstadosZona;
DROP TABLE IF EXISTS zonasEquipesEstadosTime;
DROP TABLE IF EXISTS zonasEquipesPartidas;
DROP TABLE IF EXISTS zonasEquipesScans;
```

### Se decidir manter:
Implementar queries para usar as tabelas de estado (recomendado para cache de performance)

---

## 📊 Distribuição de Uso por Módulo

| Módulo | Tabelas Principais | Tabelas Secundárias |
|--------|------------------|-------------------|
| **Eventos** | eventos, criancas, pontoVerificacao, times | eventoBrincadeiras, zonas |
| **Autenticação** | acessos, clientes, empresas | logs |
| **Gamificação** | brincadeiras, pontuacoes, conquistas | cacaTesourPartidas, cacaTesourScans |
| **Pulseiras/NFC** | pulseiras, leituras | - |
| **Família/Vinculação** | vinculoFamiliar, codigosVinculoFamiliar, conviteFamilia | - |
| **Zona Conquest** | - | zonasConquistaPartidas, zonasConquistaLeituras |
| **Sistema** | logs, configuracoes, mensagensDisplay, chamadosSuport | - |

---

**Data da Análise**: 2026-10-06  
**Total de Tabelas**: 45  
**Método**: Análise de queries em todas as rotas do backend
