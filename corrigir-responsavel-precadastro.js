#!/usr/bin/env node
// corrigir-responsavel-precadastro.js - preenche o responsável dos cadastros de criança feitos pelo app antes da correção.
//
// Contexto: o Kiosk só acha uma criança quando o nome do responsável digitado bate com o gravado no cadastro
// (perfilCrianca.nomeResponsavel). O pré-cadastro feito pelo app não gravava esse nome, então a criança não aparecia.
// Agora o app grava o nome da conta (login.nomeFamilia); este script faz o mesmo para os cadastros que já existem.
//
// Só mexe em cadastros que: estão sem responsável (NULL ou vazio) E têm uma conta ligada pelo pré-cadastro
// (perfilVinculoFamiliar) com nome. Cadastros da recepção (que já têm responsável) não são tocados. Se mais de uma conta
// está ligada ao mesmo cadastro, vale a que ligou primeiro.
//
// Uso (na pasta do backend, com o .env do banco que será corrigido):
//   node corrigir-responsavel-precadastro.js                       simulação: só mostra o que seria alterado
//   node corrigir-responsavel-precadastro.js --nome "Maria"        simulação só das crianças cujo nome/apelido tem "Maria"
//   node corrigir-responsavel-precadastro.js --aplicar             grava
//   node corrigir-responsavel-precadastro.js --nome "Maria" --aplicar
// Funciona com SQL Server e PostgreSQL (DB_DRIVER do .env). Nomes aparecem abreviados no resultado.
const { connectDB, closeDB, query, allQuery, withTransaction } = require('./database');
const { normalizarBusca, nomeAbreviado } = require('./utils/perfilCrianca');

const aplicar = process.argv.includes('--aplicar');
const posicaoNome = process.argv.indexOf('--nome');
const filtroNome = posicaoNome >= 0 ? normalizarBusca(process.argv[posicaoNome + 1]) : '';

async function main() {
  if (posicaoNome >= 0 && filtroNome.length < 2) {
    console.error('Use --nome "texto" com pelo menos 2 letras.');
    process.exit(2);
  }
  await connectDB();

  const linhas = await allQuery(
    `SELECT p.perfilCriancaId, p.nome, p.apelido, l.nomeFamilia, pv.criadoEm
     FROM perfilCrianca p
     JOIN perfilVinculoFamiliar pv ON pv.perfilCriancaId = p.perfilCriancaId
     JOIN login l ON l.loginId = pv.loginId
     WHERE (p.nomeResponsavel IS NULL OR p.nomeResponsavel = '')
       AND l.nomeFamilia IS NOT NULL
     ORDER BY pv.criadoEm ASC`
  );

  // Um cadastro por vez, com a conta que ligou primeiro (a lista já vem na ordem)
  const porPerfil = new Map();
  for (const linha of linhas) {
    const responsavel = String(linha.nomeFamilia || '').trim().slice(0, 200);
    if (!responsavel || porPerfil.has(linha.perfilCriancaId)) continue;
    const alvo = normalizarBusca(`${linha.nome} ${linha.apelido || ''}`);
    if (filtroNome && !alvo.includes(filtroNome)) continue;
    porPerfil.set(linha.perfilCriancaId, { ...linha, responsavel });
  }

  const lista = [...porPerfil.values()];
  if (lista.length === 0) {
    console.log('Nenhum cadastro precisa de correção' + (filtroNome ? ' com esse nome.' : '.'));
    return;
  }

  console.log(`${lista.length} cadastro(s) ${aplicar ? 'a corrigir' : 'seriam corrigidos'}:`);
  for (const item of lista) {
    console.log(`  - ${nomeAbreviado(item.nome)}  →  responsável: ${nomeAbreviado(item.responsavel)}`);
  }

  if (!aplicar) {
    console.log('\nSimulação: nada foi gravado. Rode de novo com --aplicar para gravar.');
    return;
  }

  // atualizadoEm acompanha a mudança, como nas outras edições do cadastro (a sincronização com a nuvem enxerga a alteração)
  await withTransaction(async () => {
    for (const item of lista) {
      await query(
        `UPDATE perfilCrianca
         SET nomeResponsavel = @responsavel, atualizadoEm = CURRENT_TIMESTAMP
         WHERE perfilCriancaId = @perfilCriancaId AND (nomeResponsavel IS NULL OR nomeResponsavel = '')`,
        { responsavel: item.responsavel, perfilCriancaId: item.perfilCriancaId }
      );
    }
  });
  console.log(`\nPronto: ${lista.length} cadastro(s) atualizado(s).`);
}

main()
  .catch((erro) => {
    console.error('Não foi possível corrigir os cadastros:', erro.message);
    process.exitCode = 1;
  })
  .finally(() => closeDB().catch(() => {}));
