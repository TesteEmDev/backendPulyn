// utils/gameRequirements.js - o que cada jogo precisa para poder começar
//
// Um jogo só inicia se o evento tiver a quantidade mínima de checkpoints ONLINE para ele.
// Os mínimos saem das regras de cada jogo; para mudar algum, é só ajustar aqui.
const { allQuery, queryOne } = require('../database');

const MIN_CHECKPOINTS = {
  // um checkpoint normal (10 de dano) e um especial (30 de dano)
  monster_hunt: 2,
  // o checkpoint-alvo nunca repete em seguida, então precisa de pelo menos dois
  treasure_hunt: 2,
  // a equipe não relê um checkpoint que já domina: precisa de outro para conquistar
  zone_team: 2,
  // só dá para reler o mesmo checkpoint depois de ler 3 diferentes: 3 + 1
  zone_individual: 4,
  // dois locais de bomba (A e B)
  bomb_defusal: 2,
  // a equipe só relê um checkpoint depois de ler 3 diferentes: 3 + 1 (igual à Zona individual)
  zone_domination: 4,
  // o refém percorre os checkpoints em sequência: precisa de ao menos o início e o fim
  hostage_rescue: 2,
};

const GAME_LABELS = {
  monster_hunt: 'Caça ao Monstro',
  treasure_hunt: 'Caça ao Tesouro',
  zone_team: 'Zona (equipe)',
  zone_individual: 'Zona (individual)',
  bomb_defusal: 'Conquistar e Destruir',
  zone_domination: 'Zona (domínio total)',
  hostage_rescue: 'Resgate do Refém',
};

// Mesma leitura do tipo que as rotas de início usam: brincadeiras.type é a fonte da verdade.
function resolveGameKind(game) {
  const type = String(game?.tipo || game?.tipoJogo || '').trim().toLowerCase();
  if (type === 'monster_hunt') return 'monster_hunt';
  if (type === 'treasure_hunt') return 'treasure_hunt';
  if (type === 'bomb_defusal') return 'bomb_defusal';
  if (type === 'zone_domination') return 'zone_domination';
  if (type === 'hostage_rescue') return 'hostage_rescue';
  if (type === 'individual' || type === 'zone_conquest_individual') return 'zone_individual';
  return 'zone_team';
}

function parseConfiguredIds(rawCheckpoints) {
  if (!rawCheckpoints) return [];
  let items = rawCheckpoints;
  if (typeof items === 'string') {
    try { items = JSON.parse(items); } catch { return []; }
  }
  if (!Array.isArray(items)) return [];
  return items.map((item) => String(item?.id ?? item ?? '').trim().toLowerCase()).filter(Boolean);
}

/**
 * Confere se o evento tem checkpoints online suficientes para o jogo começar.
 * `game` pode ser a linha da brincadeira (com `tipo` e `checkpoints`) ou só o id dela.
 * Só o Caça ao Tesouro restringe pela lista de checkpoints do jogo (é assim que a partida começa
 * de verdade: o alvo sai dessa lista). No Monstro a lista só escolhe o checkpoint especial e todos
 * os checkpoints do evento participam, como nos jogos de Zona; assim uma lista antiga, com
 * checkpoints de outro evento, não impede o Monstro de começar.
 * @returns {Promise<{ ok: boolean, kind: string, required: number, available: number, message: string|null }>}
 */
async function checkGameStartRequirements(eventoId, game) {
  const row = game && typeof game === 'object' && 'tipo' in game && 'checkpoints' in game
    ? game
    : await queryOne(
      'SELECT brincadeiraId, nome, tipo, tipoJogo, checkpoints FROM "brincadeira" WHERE LOWER(brincadeiraId) = LOWER(@id)',
      { id: typeof game === 'object' ? game?.brincadeiraId : game }
    );

  const kind = resolveGameKind(row);
  const required = MIN_CHECKPOINTS[kind];

  const online = await allQuery(
    `SELECT checkpointId FROM "pontoVerificacao"
     WHERE LOWER(eventoId) = LOWER(@eventoId)
       AND LOWER(COALESCE(proposito, 'game')) <> 'reception'
       AND LOWER(COALESCE(status, 'offline')) = 'online'`,
    { eventoId }
  );

  let ids = online.map((checkpoint) => String(checkpoint.checkpointId).trim().toLowerCase());
  const configured = (kind === 'treasure_hunt' || kind === 'bomb_defusal' || kind === 'hostage_rescue') ? parseConfiguredIds(row?.checkpoints) : [];
  const scopedToGame = configured.length > 0;
  if (scopedToGame) {
    const allowed = new Set(configured);
    ids = ids.filter((id) => allowed.has(id));
  }

  const available = ids.length;
  if (available >= required && kind === 'zone_domination') {
    // sem zona com checkpoint dentro ninguém consegue dominar "todas as zonas"
    const { situacaoDasZonas } = require('./zonaDominio');
    const { totalZonas } = await situacaoDasZonas(eventoId);
    if (totalZonas < 1) {
      return {
        ok: false, kind, required, available,
        message: 'O jogo Zona (domínio total) precisa de pelo menos uma zona desenhada no mapa com checkpoints posicionados dentro dela. Configure as zonas e posicione os checkpoints antes de iniciar.',
      };
    }
  }
  if (available >= required) return { ok: true, kind, required, available, message: null };

  const name = row?.nome ? `"${row.nome}"` : GAME_LABELS[kind];
  const plural = (n) => (n === 1 ? 'checkpoint' : 'checkpoints');
  const where = scopedToGame ? 'configurados neste jogo e online neste evento' : 'online neste evento';
  return {
    ok: false,
    kind,
    required,
    available,
    message: `O jogo ${name} precisa de pelo menos ${required} ${plural(required)} ${scopedToGame ? 'configurados no jogo e online' : 'online'} para começar, `
      + `mas há ${available} ${plural(available)} ${where}. Cadastre ou ligue mais checkpoints antes de iniciar.`,
  };
}

module.exports = { MIN_CHECKPOINTS, GAME_LABELS, resolveGameKind, checkGameStartRequirements };
