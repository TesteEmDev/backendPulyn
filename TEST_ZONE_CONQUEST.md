# Teste: Zone Conquest com Persistência em BD

## Setup

1. **Criar Evento** (POST /eventos)
```json
{
  "name": "Teste Zone Conquest",
  "description": "Teste de persistência",
  "date": "2026-09-11",
  "time": "14:00",
  "duration": 60,
  "enableDisplay": true,
  "enableLocation": false
}
```
Salvar `evento_id`.

2. **Criar Crianças** (POST /eventos/:evento_id/criancas)
```json
{
  "name": "Criança 1",
  "nickname": "C1",
  "age": 10,
  "avatar": "smile",
  "braceletCode": "NFC001",
  "timeId": null
}
```

3. **Criar Pulseiras** (se necessário)
- Criar pulseiras com codes: NFC001, NFC002, etc.

4. **Criar Times** (se TEAM mode)
```json
{
  "evento_id": "evento_id",
  "name": "Time 1",
  "color": "#FF0000"
}
```
Associar crianças aos times.

5. **Criar Checkpoints** (POST /eventos/:evento_id/checkpoints)
```json
{
  "name": "Checkpoint A",
  "evento_id": "evento_id",
  "status": "online",
  "coordinates": [10.5, 20.5]
}
```
Criar 3-5 checkpoints.

6. **Criar Brincadeira (Jogo)**
```json
{
  "name": "Zone Conquest - Individual",
  "type": "zone_conquest_individual",
  "game_type": "zone_conquest_individual",
  "empresa_id": "empresa_id"
}
```

## Teste 1: Zone Conquest INDIVIDUAL

### Fluxo
1. **POST /eventos/:evento_id/start-game** com `brincadeiraId` = jogo Individual
   - Esperado: Retorna `gameType: 'zone_conquest_individual'`
   - BD: Cria partida em `zone_conquest_individual_partidas` com `version = 0`
   - BD: Cria participant_states em `zone_conquest_individual_participant_states` com `version = 0`

2. **POST /leituras** com criança A lendo checkpoint 1
   - Body: `{ checkpointId: "...", uid: "NFC001", brincadeiraId: "..." }`
   - Esperado: 
     - `authorized: true`
     - `pointsGained: 10` (10 × 1.00)
     - `totalPoints: 10`
     - `checkpointsRead: 1`
     - `gameMode: 'zone_conquest_individual'`
   - BD: 
     - INSERT em `zone_conquest_individual_scans` com version=1
     - UPDATE participant_state: `total_points=10, checkpoints_read=1, version=1`
     - UPDATE checkpoint: `territory_owner_time_id = crianca_id`

3. **POST /leituras** com criança A lendo checkpoint 2
   - Esperado:
     - `pointsGained: 10.1` (10 × 1.01)
     - `totalPoints: 20.1`
     - `checkpointsRead: 2`
   - BD:
     - INSERT em `zone_conquest_individual_scans` com version=2
     - UPDATE participant_state: `total_points=20.1, checkpoints_read=2, version=2`

4. **POST /leituras** com criança B lendo checkpoint 1
   - Esperado:
     - `pointsGained: 10`
     - `totalPoints: 10`
     - `ranking: [Criança A (20.1), Criança B (10)]`
   - BD:
     - INSERT em `zone_conquest_individual_scans`
     - CREATE participant_state para criança B
     - UPDATE ranking em ambas

5. **GET /leituras/:evento_id/zone-conquest/status**
   - Esperado: Status com ranking, participantes, partida_id
   ```json
   {
     "gameRunning": true,
     "mode": "individual",
     "participants": [
       { "name": "Criança A", "total_points": 20.1, "ranking": 1 },
       { "name": "Criança B", "total_points": 10, "ranking": 2 }
     ]
   }
   ```

6. **POST /eventos/:evento_id/stop-game**
   - BD: UPDATE `zone_conquest_individual_partidas` SET `status='finished'`
   - BD: UPDATE `zone_conquest_individual_participant_states` SET `status='finished'`

7. **POST /eventos/:evento_id/start-game** (novo jogo)
   - BD: DELETE ou criar nova partida
   - Esperado: Dados anteriores persistidos, nova partida vazia
   - Verificar que `zone_conquest_individual_partidas` tem 2 registros: 1 finished, 1 active

## Teste 2: Zone Conquest TEAM

### Fluxo Similar
1. Criar brincadeira com `type: 'zone_conquest_team'`
2. POST /start-game com tipo TEAM
3. POST /leituras com criança lendo checkpoint
   - Esperado: Time inteiro acumula pontos
   - BD: INSERT em `zone_conquest_team_scans`
4. Validar que apenas time cuja vez é pode ler (baseado em Treasure Hunt)

## Teste 3: Reset de Dados

### Fluxo
1. Iniciar jogo Individual, ler 5 checkpoints
2. POST /eventos/:evento_id/stop-game
3. Verificar BD:
   - `zone_conquest_individual_partidas`: status='finished'
   - `zone_conquest_individual_participant_states`: status='finished'
4. POST /eventos/:evento_id/start-game (novo jogo, mesmo tipo)
   - Esperado: Nova partida com version=0
   - Todos os participant_states: version=0
   - Nenhum dado do jogo anterior

## Teste 4: Idempotência

### Fluxo
1. POST /leituras com `readingId: "uuid-123"` (criança A, checkpoint 1)
   - Resposta: `pointsGained: 10`
2. POST /leituras com **MESMO** `readingId: "uuid-123"` (retry)
   - Resposta: IDEMPOTENTE - deve retornar mesma resposta
   - BD: Nenhum novo INSERT de scan
   - Pontos: NÃO somam novamente (prevent duplicate scoring)

## Teste 5: Version Conflict (Race Condition)

### Fluxo Simulado
1. Criança A, version=5
2. Duas requisições simultâneas com checkpoint diferentes
3. Primeira confirma: UPDATE com WHERE version=5, UPDATE version=6 ✅
4. Segunda tenta: UPDATE com WHERE version=5 - FALHA (version já é 6)
   - Resposta: `versionConflict: true`, client retry
5. Retry de segunda requisição:
   - SELECT participant_state (version=6 agora)
   - Processa com WHERE version=6 ✅

## Checklist

- [ ] Sintaxe JavaScript OK (node -c)
- [ ] BD migration executada
- [ ] Partida criada ao start-game
- [ ] Scans inseridos corretamente
- [ ] Versionning incrementa
- [ ] Ranking recalculado
- [ ] Reset funciona
- [ ] Idempotência OK
- [ ] Version conflict tratado
- [ ] Broadcast envia eventos corretos
- [ ] Frontend recebe status via GET

## Debugging

```bash
# Verificar partidas
SELECT * FROM zone_conquest_individual_partidas;

# Verificar states
SELECT * FROM zone_conquest_individual_participant_states ORDER BY version DESC;

# Verificar scans
SELECT * FROM zone_conquest_individual_scans ORDER BY created_at DESC;

# Verificar ranking
SELECT id, crianca_id, total_points, ranking, version FROM zone_conquest_individual_participant_states ORDER BY ranking ASC;
```
