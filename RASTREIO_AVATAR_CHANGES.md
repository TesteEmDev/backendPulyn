# 🎯 Rastreio de Avatar para Todos os Jogos

## ✅ Mudanças Implementadas

### Arquivo: `routes/leituras.js`

#### 1. Treasure Hunt (Caça ao Tesouro)
**Local:** Após o broadcast de `TREASURE_PROGRESS`

```javascript
// ✨ NOVO: Enviar TERRITORY_CONQUERED para rastreio do avatar no mobile
if (treasureResult.accepted) {
  const checkpointData = await queryOne(
    'SELECT map_x, map_y FROM checkpoints WHERE id = @id',
    { id: checkpointId }
  );
  
  broadcast({
    type: 'TERRITORY_CONQUERED',
    payload: {
      id: leituraId,
      checkpointId,
      uid: normalizedUid,
      criancaId: crianca.id,
      criancaName: crianca.name,
      timeId: crianca.time_id,
      teamColor: treasureResult.teamColor || '#00AA00',
      points: 0,
      lockDurationSeconds: 0,
      timestamp: now.toISOString(),
      eventoId: checkpoint.evento_id,
      gameType: 'treasure_hunt',
      mapX: checkpointData?.map_x,
      mapY: checkpointData?.map_y,
    }
  });
}
```

#### 2. Monster Hunt (Caça ao Monstro)
**Local:** Após o broadcast de `MONSTER_PROGRESS`

```javascript
// ✨ NOVO: Enviar TERRITORY_CONQUERED para rastreio do avatar no mobile
const checkpointData = await queryOne(
  'SELECT map_x, map_y FROM checkpoints WHERE id = @id',
  { id: checkpointId }
);

broadcastEvent({
  type: 'TERRITORY_CONQUERED',
  payload: {
    id: leituraId,
    checkpointId,
    uid: normalizedUid,
    criancaId: crianca.id,
    criancaName: crianca.name,
    timeId: crianca.time_id,
    teamColor: monsterResult.teamColor || '#FF0000',
    points: 0,
    lockDurationSeconds: 0,
    timestamp: now.toISOString(),
    eventoId: checkpoint.evento_id,
    gameType: 'monster_hunt',
    mapX: checkpointData?.map_x,
    mapY: checkpointData?.map_y,
  }
});
```

#### 3. Zone Conquest (Conquest de Zonas)
**Local:** Antes do res.json() - Adicionadas coordenadas

```javascript
// 📍 Buscar coordenadas do checkpoint para rastreio no mobile
const checkpointCoords = await queryOne(
  'SELECT map_x, map_y FROM checkpoints WHERE id = @id',
  { id: checkpointId }
);

broadcast({
  type: 'TERRITORY_CONQUERED',
  payload: {
    id: leituraId,
    checkpointId,
    uid: normalizedUid,
    criancaId: crianca.id,
    criancaName: crianca.name,
    timeId: crianca.time_id,
    teamColor,
    points: pointsAwarded,
    lockDurationSeconds: 15,
    timestamp: now.toISOString(),
    eventoId: crianca.evento_id,
    gameType: 'zone_conquest',
    mapX: checkpointCoords?.map_x,
    mapY: checkpointCoords?.map_y,
  }
});
```

---

## 📝 Dados Enviados no WebSocket

### Evento: `TERRITORY_CONQUERED`

```json
{
  "type": "TERRITORY_CONQUERED",
  "payload": {
    "checkpointId": "uuid",
    "criancaId": "uuid",
    "criancaName": "João Silva",
    "timeId": "uuid",
    "teamColor": "#FF0000",
    "gameType": "treasure_hunt|monster_hunt|zone_conquest",
    "mapX": 150,
    "mapY": 120,
    "points": 10,
    "lockDurationSeconds": 15,
    "timestamp": "2026-07-15T10:30:00Z",
    "eventoId": "uuid"
  }
}
```

---

## 🚀 Como Fazer o Commit

```bash
cd "c:\Users\Walisson\Documents\Pullyn Web\backendPulyn"
git add routes/leituras.js
git commit -m "feat: rastreio de avatar para todos os jogos (Treasure Hunt, Monster Hunt, Zone Conquest)

- Treasure Hunt agora envia TERRITORY_CONQUERED com coordenadas do checkpoint
- Monster Hunt agora envia TERRITORY_CONQUERED com coordenadas do checkpoint
- Zone Conquest melhorado com mapX e mapY no broadcast
- Mobile identifica tipo de jogo via 'gameType' no payload
- Suporte a rastreio em tempo real para todos os tipos de jogos"

git push
```

---

## ✅ Status

- ✅ Backend implementado e rodando (porta 3001)
- ✅ Todos os 3 tipos de jogos suportados
- ✅ Coordenadas de checkpoint incluídas
- ✅ Mobile pronto para receber eventos
- ⏳ Aguardando commit e push no Git

---

## 🎯 Próximos Passos

1. Fazer commit e push deste arquivo
2. Testar rastreio no mobile com evento ativo
3. Verificar logs do mobile para confirmar animação

