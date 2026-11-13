// utils/jogosPadrao.js - jogos que cada plano já entrega cadastrados para o cliente
//
// O cliente não cria nem renomeia jogos: ele recebe um jogo de cada tipo que o plano permite (utils/jogosDoPlano.js) e só
// muda a duração, que vale para todos os eventos dele. Nome, descrição, regras e pontos abaixo são o padrão do sistema.
// Os pontos e os checkpoints de cada jogo continuam sendo configurados como antes.
const JOGOS_PADRAO = {
  team: {
    nome: "Zona - Equipe",
    duracao: 15,
    pontosPadrao: 10,
    descricao: "As equipes disputam os checkpoints espalhados pelo espaço. Encoste a pulseira em um checkpoint para conquistá-lo para a sua equipe e ganhar pontos. Quando uma equipe domina todos os checkpoints de uma zona, a zona inteira fica com a cor dela. Vence a equipe com mais pontos quando o tempo acabar.",
    regras: "1- Todas as equipes jogam ao mesmo tempo, sem fila nem turnos. Qualquer checkpoint online pode ser lido a qualquer momento.\n2- Cada leitura vale 10 pontos para o participante e para a equipe.\n3- Ao ler um checkpoint, ele passa a ser da sua equipe, mesmo que estivesse com outra.\n4- Você não pode reler um checkpoint que você mesmo já domina. Ele só libera quando outra equipe o conquistar, ou depois de 1m30s sem nenhuma leitura, quando volta a ficar livre para todos.\n5- Uma zona só é dominada quando todos os checkpoints dentro dela pertencem à mesma equipe. Se estiverem misturados ou algum estiver livre, a zona fica \"em disputa\".\n6- O jogo termina quando o tempo configurado acaba ou o recreador encerra. Os pontos ficam salvos e os domínios são zerados.\n7- É preciso estar com a pulseira ativa, vinculada à sua conta e ao evento, e pertencer a uma equipe.",
  },
  individual: {
    nome: "Zona - Individual",
    duracao: 10,
    pontosPadrao: 10,
    descricao: "Cada participante joga por si. Conquiste checkpoints com a pulseira, acumule pontos e mantenha o seu nome e a sua cor no mapa. Quem tiver mais pontos no fim do tempo lidera o ranking.",
    regras: "1- Não há equipes: cada participante disputa por conta própria, e o telão mostra o nome e a cor de quem domina cada checkpoint.\n2- Cada leitura vale 10 pontos, com bónus progressivo: a cada 10 checkpoints lidos, cada nova leitura passa a valer 1 ponto a mais (11, 12, 13...).\n3- Ao ler um checkpoint, ele passa a ser seu, mesmo que fosse de outro participante.\n4- Para reler o mesmo checkpoint, você precisa antes ler 3 checkpoints diferentes.\n5- O domónio de um checkpoint não expira: ele só muda de dono quando outro participante o lê, e é zerado no fim do jogo.\n6- Uma zona só é dominada quando todos os seus checkpoints são do mesmo participante. Caso contrário, fica \"em disputa\".\n7- O ranking é por pontos totais. Os pontos ficam salvos ao final.",
  },
  treasure_hunt: {
    nome: "Caça ao Tesouro",
    duracao: 18,
    pontosPadrao: 10,
    descricao: "Uma corrida contra o relógio entre equipes. Uma equipe de cada vez precisa \"acender\" todos os checkpoints do jogo, sempre lendo o checkpoint-alvo indicado. A equipe mais rápida vence.",
    regras: "1- São necessárias pelo menos 2 equipes com participantes. Só entram os checkpoints online configurados no jogo.\n2- As equipes jogam uma por vez. A primeira é sorteada, e cada vez começa após 10 segundos de preparação. O cronômetro de cada equipe começa quando a sua vez é liberada.\n3- Em cada etapa existe um checkpoint-alvo sorteado. Só ele conta, e só a equipe da vez pode lê-lo.\n4- Todos os integrantes da equipe precisam ler o alvo, e cada criança conta uma vez por etapa. Quando o último lê, o checkpoint fica com a cor da equipe e um novo alvo é sorteado.\n5- A equipe termina quando domina todos os checkpoints do jogo. A vez passa para a próxima equipe que ainda não terminou, e o mapa é limpo para ela recomeçar.\n6- O jogo acaba quando todas as equipes terminam. Vence a equipe com o menor tempo. Se o tempo configurado do jogo se esgotar antes, o jogo é encerrado automaticamente.\n7- Os membros da equipe vencedora ganham 200 pontos ao final.",
  },
  monster_hunt: {
    nome: "Caça ao Monstro",
    duracao: 28,
    pontosPadrao: 10,
    descricao: "Cada equipe tem o seu próprio monstro de 500 de vida. Percorra os checkpoints atacando o monstro da sua equipe e derrote-o antes das outras.",
    regras: "1- Cada equipe tem um monstro com 500 HP. Todas as equipes jogam ao mesmo tempo.\n2- Cada leitura em um checkpoint do jogo é um ataque: 10 de dano em checkpoint normal e 30 no checkpoint especial (marcado pelo administrador ou sorteado).\n3- Ataque especial: quando o último integrante da equipe que ainda não tinha atacado faz o seu primeiro ataque, o dano é de 50.\n4- Depois de uma leitura, aquele checkpoint fica bloqueado para a sua equipe por um tempo de recarga (de 1 a 120 segundos, padrão de 15).\n5- Quando o HP chega a zero, o monstro é derrotado e a equipe vence. O jogo acaba quando todos os monstros forem derrotados ou o tempo se esgotar.\n6- Os membros da equipe vencedora ganham 200 pontos ao final.",
  },
  bomb_defusal: {
    nome: "Conquistar e Destruir",
    duracao: 15,
    pontosPadrao: 10,
    descricao: "Duas equipes se enfrentam em rounds: os Rebeldes tentam plantar a bomba em um dos locais e os Agentes precisam impedir ou desarmá-la. Vence a primeira equipe a chegar ao número de vitórias do jogo.",
    regras: "1- São duas equipes: os Rebeldes plantam a bomba e os Agentes a desarmam. Cada jogador recebe um número, e as equipes trocam de lado a cada certo número de rounds (padrão de 5).\n2- No começo de cada round, um jogador dos Rebeldes é sorteado: só a pulseira dele pode plantar a bomba.\n3- Para plantar, o sorteado mantém a pulseira encostada no checkpoint do local (A ou B) pelo tempo configurado, sem tirar (padrão de 6 segundos). Se a leitura falhar por mais de 2 segundos, a contagem recomeça do zero.\n4- Só existe uma bomba por round: depois de plantada, o outro local fica bloqueado até o próximo round.\n5- A bomba plantada fica ativa pelo tempo configurado (padrão de 2m30s). Se ela explodir, os Rebeldes vencem o round.\n6- Para desarmar, qualquer jogador dos Agentes mantém a pulseira no checkpoint da bomba pelo tempo configurado, sem interrupção (padrão de 12,5 segundos). Se parar antes, o tempo zera e recomeça do zero para quem tentar em seguida. Desarmou, os Agentes vencem o round. Os Rebeldes não podem desarmar a própria bomba.\n7- Se o tempo do round acabar sem a bomba ser plantada (padrão de 6 minutos), os Agentes vencem o round. O recreacionista também pode encerrar o round à mão, por exemplo quando uma equipe inteira foi eliminada.\n8- Cada round vencido vale 1 vitória. Vence o jogo a primeira equipe que chegar ao número de vitórias configurado (padrão de 10).",
  },
  zone_domination: {
    nome: "Domínio Total",
    duracao: 20,
    pontosPadrao: 10,
    descricao: "As equipes disputam os checkpoints do jogo. Encoste a pulseira em um checkpoint para conquistá-lo para a sua equipe e ganhar pontos. Vence a primeira equipe que dominar todos os checkpoints ao mesmo tempo.",
    regras: "1- Todas as equipes jogam ao mesmo tempo, sem fila nem turnos. Qualquer checkpoint online do jogo pode ser lido a qualquer momento.\n2- Ao ler um checkpoint, ele passa a ser da sua equipe, mesmo que estivesse com outra.\n3- Cada leitura vale 10 pontos, com bônus crescente: a cada checkpoint já lido pela equipe, as próximas leituras passam a valer 1% a mais.\n4- Para reler o mesmo checkpoint, a equipe precisa antes ler 3 checkpoints diferentes.\n5- O domínio de um checkpoint não expira sozinho: ele só muda de dono quando outra equipe o lê.\n6- Vence a equipe que for dona de todos os checkpoints do jogo ao mesmo tempo. A vitória aparece no telão e nos checkpoints, e o jogo é encerrado sozinho logo depois. Depois da vitória, novas leituras não valem.\n7- É preciso estar com a pulseira ativa, vinculada à sua conta e ao evento, e pertencer a uma equipe.",
  },
  hostage_rescue: {
    nome: "Resgate do Refém",
    duracao: 17,
    pontosPadrao: 10,
    descricao: "Os Agentes escoltam um refém por uma sequência de checkpoints até o último, enquanto os Rebeldes tentam recuperá-lo e levá-lo de volta ao início. Vence a primeira equipe a chegar ao número de vitórias do jogo.",
    regras: "1- São duas equipes: os Agentes levam o refém e os Rebeldes tentam recuperá-lo. Cada jogador recebe um número, e as equipes trocam de lado a cada certo número de rounds (padrão de 3).\n2- Os checkpoints do jogo formam uma sequência, na ordem do número deles, do primeiro ao último.\n3- No começo de cada round, um jogador dos Agentes é sorteado como refém: só a pulseira dele avança na sequência.\n4- O refém lê o primeiro checkpoint, depois o segundo e assim por diante, sempre o próximo da sequência. Ler fora de ordem ou repetir um checkpoint não vale.\n5- Quando o refém lê o último checkpoint, os Agentes vencem o round.\n6- Os Rebeldes recuperam o refém lendo a pulseira no checkpoint onde ele está parado (o último que ele alcançou). O refém volta ao início da sequência e o round continua.\n7- Logo depois de chegar a um checkpoint, o refém fica protegido pelo tempo configurado (padrão de 10 segundos) para ter tempo de sair dali. Nesse intervalo, a recuperação não vale.\n8- Se o tempo do round acabar sem o resgate completo (padrão de 5 minutos), os Rebeldes vencem o round. O recreacionista também pode encerrar o round à mão.\n9- Cada round vencido vale 1 vitória. Vence o jogo a primeira equipe que chegar ao número de vitórias configurado (padrão de 5).",
  },
};

module.exports = { JOGOS_PADRAO };
