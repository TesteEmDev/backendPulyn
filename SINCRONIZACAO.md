# Sincronização do banco local com a nuvem

O banco **local** (no buffet) é a fonte da verdade. A **nuvem** (Supabase) é uma cópia que se mantém
sozinha, sem derrubar o sistema quando a internet cai. A direção é uma só: **local → nuvem**.

## Como funciona

1. **Gatilhos no Postgres local** gravam em `sincronizacaoFila` toda inserção, alteração e exclusão
   de qualquer tabela (`migrations/018-sincronizacao-fila.sql`). Isso não depende do código das rotas
   e a fila continua enchendo mesmo sem internet.
2. A cada ciclo (padrão: 15 s), `utils/sincronizacao.js` lê a fila, busca o **estado atual** de cada
   linha no banco local e grava (ou apaga) a mesma linha na nuvem, respeitando a ordem das chaves
   estrangeiras (pai antes do filho).
3. Como o que vai é sempre o estado atual, **repetir um envio não duplica nada**, e várias alterações
   da mesma linha viram um único envio.
4. Na primeira execução faz uma **carga inicial** (controlada por tabela) com tudo o que já existe.

Garantias: cada lote vai numa transação; se a internet cai, nada é perdido nem penalizado e o envio
continua quando ela voltar; uma linha com erro (por exemplo, rejeitada por uma regra da nuvem) fica
marcada com o erro, é tentada de novo com espera crescente (5 s até 15 min) e **não trava as demais**.

## Ligar

No `.env` do backend (nunca no código):

```
SYNC_ENABLED=1
SYNC_NUVEM_URL=postgresql://USUARIO:SENHA@HOST:5432/postgres
SYNC_NUVEM_SSL=true            # false só para testes em banco local
SYNC_INTERVALO_MS=15000        # opcional
SYNC_LOTE=500                  # opcional: linhas por ciclo
SYNC_RETENCAO_DIAS=7           # opcional: por quanto tempo guardar a fila já enviada
```

Ao iniciar, o backend instala a fila e os gatilhos no banco local (a migração 018 é idempotente).

### Antes de apontar para o Supabase de verdade

1. **Troque a senha do banco** (a anterior ficou exposta) e use a nova só em `SYNC_NUVEM_URL`.
2. A nuvem precisa ter o **mesmo schema** do local. No Supabase atual ainda faltam as migrações
   `015`, `016` e `017` (tabelas em inglês, linhas duplicadas e chaves primárias). Aplique-as antes.
   O sincronizador confere sozinho: tabela ausente, coluna ausente ou **sem chave primária** na
   nuvem não derruba nada, a tabela só é pulada e aparece em `tabelasComProblema`.
3. **Faça um backup da nuvem.** A carga inicial grava por chave primária: linhas da nuvem com a mesma
   chave são **sobrescritas** pelas do local. Linhas que só existem na nuvem não são apagadas.
4. Reinicie o backend e acompanhe `GET /api/sincronizacao/status`.

## Acompanhar

| Rota | Quem | O que faz |
|---|---|---|
| `GET /api/sincronizacao/status` | admin, master | `pendentes`, `comErro`, `ultimoEnvioEm`, `ultimoErro`, `cargaInicialEm`, `tabelasComProblema` |
| `POST /api/sincronizacao/executar` | master | dispara um ciclo agora, sem esperar o intervalo |

Sinais de atenção: `pendentes` crescendo sem parar (nuvem fora do ar ou muito lenta), `comErro > 0`
(veja a coluna `erro` em `sincronizacaoFila`) ou `tabelasComProblema` não vazio.

```sql
-- Linhas que a nuvem rejeitou
SELECT "tabela", "chave", "tentativas", "erro", "proximaTentativaEm"
FROM "sincronizacaoFila" WHERE "enviadoEm" IS NULL AND "tentativas" > 0 ORDER BY "filaId";
```

## Limites que valem saber

- **É uma via só.** Alteração feita direto na nuvem é sobrescrita na próxima sincronização daquela
  linha. A nuvem é cópia, não um segundo lugar para editar.
- **`TRUNCATE` não é registrado** (use `DELETE`). Hoje o código não usa `TRUNCATE`.
- **Tabela sem chave primária não sincroniza.** Hoje todas as 45 têm. Se criar uma nova, dê uma chave e
  rode `SELECT * FROM "sincronizacaoInstalarGatilhos"();` para instalar o gatilho nela.
- **O que ainda estava na fila quando o servidor local é perdido, se perde.** O que já foi enviado
  está na nuvem.
- Datas e horas viajam como texto, então a precisão de microssegundos é preservada.

## Desligar e remover

Para parar: `SYNC_ENABLED=0` e reinicie. Para remover o mecanismo do banco local:

```sql
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relkind = 'r' LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS "sincronizacaoGatilho" ON %I', t.relname);
  END LOOP;
END $$;
DROP FUNCTION IF EXISTS "sincronizacaoInstalarGatilhos"();
DROP FUNCTION IF EXISTS "sincronizacaoRegistrar"();
DROP TABLE IF EXISTS "sincronizacaoFila", "sincronizacaoEstado";
```

## Testes

- `npm test` cobre as funções puras (montagem de SQL, agrupamento da fila, ordem das tabelas, backoff).
- O comportamento com dois bancos (carga inicial, exclusões, chaves estrangeiras, queda de internet,
  linha rejeitada, mudança de chave primária, 20.000 linhas, nuvem com tabela sem chave) foi verificado
  com dois bancos de teste, sem tocar no banco de trabalho nem no Supabase.
