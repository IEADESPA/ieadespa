// e2e-35-trava7c-politicas.js — Trava 7-C, achado B: as migrações não desfazem mais, a cada deploy, a base legal que o Encarregado editou na tela; e a migração 153
// troca a base legal das políticas pelo texto corrigido SÓ onde ainda está o original. Sobre a base "cenario-crise" (até a 152, SEM a 153):
//   BASE=cenario-crise bash rodar.sh roteiro e2e-35-trava7c-politicas.js
// Roteiro: (1) o Encarregado edita textos pela rota de verdade (PUT /api/politicas-retencao/{id}); (2) as migrações 117, 142, 143, 144, 145, 148, 150 e 152 rodam de novo,
// como em todo deploy: o editado fica; (3) a 153 roda duas vezes: o original troca, o editado fica, as políticas novas nascem com o texto e o prazo; (4) o texto da 153
// editado na tela também sobrevive a mais uma rodada; (5) a política que voltou ao texto original exato é corrigida na rodada seguinte.
const fs = require("fs");
const L = require("./lib");
const { ok, fim, q, um, escalar, obterPool, API, path, GERAL } = L;
const H = require(path.join(API, "GestaoPoliticasRetencao/index.js"));
const PASTA = path.join(API, "..", "sql", "migrations");

async function aplicar(numero, vezes = 1) {
  const pool = await obterPool();
  const arq = fs.readdirSync(PASTA).find((n) => n.startsWith(`${numero}_`) && n.endsWith(".sql"));
  const lotes = fs.readFileSync(path.join(PASTA, arq), "utf8").split(/^\s*GO\s*$/gim).map((t) => t.trim()).filter(Boolean);
  for (let i = 0; i < vezes; i++) for (const lote of lotes) await pool.request().query(lote);
}
const ENCARREGADO = GERAL(1002, ["protecaodedados"]);
async function editarNaTela(categoria, baseLegal) {
  const id = await escalar("SELECT PoliticaId FROM PoliticasRetencao WHERE Categoria = @c", { c: categoria });
  const ctx = { bindingData: { id: String(id) }, log: { error() { }, info() { }, warn() { }, verbose() { } } };
  await H(ctx, { method: "PUT", query: {}, body: { baseLegal }, headers: { "x-auth-token": ENCARREGADO } });
  return ctx.res || { status: 0 };
}
const texto = (categoria) => escalar("SELECT BaseLegal FROM PoliticasRetencao WHERE Categoria = @c", { c: categoria });
// o original de cada política, tirado do arquivo da migração que a criou (o mesmo texto que a 153 procura)
const T153 = fs.readFileSync(path.join(PASTA, fs.readdirSync(PASTA).find((n) => n.startsWith("153_"))), "utf8");
const CORRECOES = [...T153.matchAll(/SET BaseLegal = N'([^']*)'\s+WHERE Categoria = N'([^']+)'\s+AND BaseLegal = N'([^']*)';/g)]
  .filter((m) => m[3] !== "x").map((m) => ({ novo: m[1], categoria: m[2], original: m[3] }));

(async () => {
  await obterPool();
  console.log("== o ponto de partida (cenario-crise, até a 152) ==");
  ok(CORRECOES.length === 9, "a 153 corrige 9 políticas", CORRECOES.length);
  // o `preparar` aplica TODAS as migrações (a 153 inclusive): a base já pode estar com o texto novo — volta ao original para ver o antes e o depois
  for (const c of CORRECOES) {
    if ((await texto(c.categoria)) === c.novo) await escalar("UPDATE PoliticasRetencao SET BaseLegal = @o WHERE Categoria = @c; SELECT @@ROWCOUNT", { o: c.original, c: c.categoria });
  }
  for (const c of CORRECOES) ok((await texto(c.categoria)) === c.original, `"${c.categoria}" está com o texto original da migração que a criou`, await texto(c.categoria));
  ok((await escalar("SELECT COUNT(*) FROM PoliticasRetencao WHERE BaseLegal = N'x'")) === 0, "nenhuma política ficou com o texto de partida 'x'");

  console.log("== (1) o Encarregado edita na tela ==");
  const EDITADAS = {
    "Voluntariado: adesão, rodízios e remoção da escala": "EDITADO NA TELA — 117",
    "Termo de Vistoria de antecedentes": "EDITADO NA TELA — 142",
    "Ministério com menores: aceites, consentimentos, retiradas": "EDITADO NA TELA — 143",
    "Incidentes de proteção de crianças e adolescentes": "EDITADO NA TELA — 144",
    "Check-in infantil (entrega e retirada de crianças)": "EDITADO NA TELA — 145",
    "Cuidado pastoral — pedidos de oração com sinal de risco": "EDITADO NA TELA — 148",
    "Comunicação — registro de entrega da convocação oficial": "EDITADO NA TELA — 150",
    "Crise — contato do jornalista na demanda de imprensa": "EDITADO NA TELA — 152",
    "Formação e certificados (trilhas)": "EDITADO NA TELA — 112"
  };
  for (const [cat, t] of Object.entries(EDITADAS)) {
    const r = await editarNaTela(cat, t);
    ok(r.status === 200 && (await texto(cat)) === t, `a tela grava o texto de "${cat}"`, r.status);
  }

  console.log("== (2) o deploy roda as migrações de novo (todas, como o executar-migracoes.js) ==");
  for (const n of [112, 117, 142, 143, 144, 145, 148, 150, 152]) await aplicar(n);
  for (const [cat, t] of Object.entries(EDITADAS)) ok((await texto(cat)) === t, `o deploy NÃO desfaz o que o Encarregado escreveu em "${cat}"`, await texto(cat));

  console.log("== (3) a 153, duas vezes ==");
  await aplicar(153, 2);
  for (const c of CORRECOES) {
    const agora = await texto(c.categoria);
    if (EDITADAS[c.categoria]) ok(agora === EDITADAS[c.categoria], `"${c.categoria}" editada na tela fica como o Encarregado deixou`, agora);
    else ok(agora === c.novo, `"${c.categoria}" estava com o original: recebe o texto corrigido`, agora);
  }
  ok((await texto("Incidentes de proteção de crianças e adolescentes")) === EDITADAS["Incidentes de proteção de crianças e adolescentes"], "a política de incidentes editada não é tocada pela 153");
  const novas = await q(`SELECT Categoria, BaseLegal, DiasRetencao, Ativo FROM PoliticasRetencao WHERE Categoria IN (N'Calendário — justificativa de ausência na Santa Ceia',
    N'Canais — ocorrência de moderação encerrada', N'Canais — administrador que deixou a função', N'Eventos — contato do convidado externo') ORDER BY Categoria`);
  ok(novas.length === 4, "as 4 políticas novas existem, uma vez cada (a 153 rodou duas vezes)", novas.length);
  ok(novas.every((p) => p.BaseLegal !== "x" && p.BaseLegal.length > 40 && p.Ativo), "cada política nova tem o texto (não ficou 'x') e está ativa");
  const dias = Object.fromEntries(novas.map((p) => [p.Categoria, p.DiasRetencao]));
  ok(dias["Calendário — justificativa de ausência na Santa Ceia"] === 730 && dias["Canais — ocorrência de moderação encerrada"] === 1825
    && dias["Canais — administrador que deixou a função"] === 1825 && dias["Eventos — contato do convidado externo"] === 365, "os prazos padrão: 2 anos, 5, 5 e 1 ano", dias);
  ok((await escalar("SELECT COUNT(*) FROM PoliticasRetencao WHERE BaseLegal LIKE N'%organiza_ão religiosa%' OR BaseLegal LIKE N'%arts. 13 e 245%'")) === 0,
    "nenhuma política diz 'organização religiosa' nem cita o Art. 245");
  ok((await escalar("SELECT COUNT(*) FROM PoliticasRetencao WHERE BaseLegal = N'x'")) === 0, "nenhuma política ficou com 'x'");

  console.log("== (4) o texto que a 153 escreveu, editado na tela, também fica ==");
  await editarNaTela("Canais — ocorrência de moderação encerrada", "EDITADO NA TELA — 153");
  await editarNaTela("Cuidado pastoral — acompanhamentos", "EDITADO NA TELA — 148b");
  for (const n of [148, 153]) await aplicar(n);
  ok((await texto("Canais — ocorrência de moderação encerrada")) === "EDITADO NA TELA — 153", "a política nova editada sobrevive à 153 de novo");
  ok((await texto("Cuidado pastoral — acompanhamentos")) === "EDITADO NA TELA — 148b", "o texto corrigido e depois editado sobrevive à 148 e à 153");

  console.log("== (5) a política que volta ao texto original exato é corrigida na rodada seguinte ==");
  const inc = CORRECOES.find((c) => c.categoria === "Incidentes de proteção de crianças e adolescentes");
  await editarNaTela(inc.categoria, inc.original);
  await aplicar(144);
  ok((await texto(inc.categoria)) === inc.original, "a 144 não regrava (o texto já não é 'x')");
  await aplicar(153);
  ok((await texto(inc.categoria)) === inc.novo, "a 153 troca o original pelo corrigido (sem o Art. 245)", await texto(inc.categoria));

  console.log("== o esquema da 153 ==");
  const cols = await q(`SELECT OBJECT_NAME(object_id) AS t, name, is_nullable FROM sys.columns WHERE (object_id = OBJECT_ID('dbo.CalendarioPresencasDirigente') AND name = 'JustificativaApagadaEm')
    OR (object_id = OBJECT_ID('dbo.EventoConvidados') AND name = 'ContatoApagadoEm') OR (object_id = OBJECT_ID('dbo.CanalOcorrencias') AND name IN ('AnonimizadaEm', 'RelatadaPorMembroId'))
    OR (object_id = OBJECT_ID('dbo.CanalAdministradores') AND name IN ('AnonimizadoEm', 'MembroId'))`);
  ok(cols.length === 6 && cols.every((c) => c.is_nullable), "as 4 colunas novas existem e quem avisou / o administrador aceitam vazio", cols);
  ok((await escalar("SELECT COUNT(*) FROM sys.indexes WHERE name IN ('UX_CanalAdministradores_Ativo', 'IX_CanalAdministradores_Membro') AND object_id = OBJECT_ID('dbo.CanalAdministradores')")) === 2,
    "os dois índices do administrador voltaram");
  ok((await escalar("SELECT is_unique FROM sys.indexes WHERE name = 'UX_CanalAdministradores_Ativo'")) === true, "o índice do administrador ativo continua único");
  ok((await escalar("SELECT COUNT(*) FROM sys.check_constraints WHERE name IN ('CK_CanalOcorrencias_Anonimizada', 'CK_CanalAdministradores_Anonimizado') AND is_disabled = 0")) === 2,
    "os dois CHECK da anonimização estão ligados");
  ok((await escalar("SELECT COUNT(*) FROM sys.triggers WHERE name = 'TR_CanalOcorrencias_RelogioImutavel' AND is_disabled = 0")) === 1, "o gatilho do relógio está ligado");
  const fks = await escalar(`SELECT COUNT(*) FROM sys.foreign_key_columns fc JOIN sys.columns c ON c.object_id = fc.parent_object_id AND c.column_id = fc.parent_column_id
    WHERE (fc.parent_object_id = OBJECT_ID('dbo.CanalOcorrencias') AND c.name = 'RelatadaPorMembroId') OR (fc.parent_object_id = OBJECT_ID('dbo.CanalAdministradores') AND c.name = 'MembroId')`);
  ok(fks === 2, "as chaves estrangeiras de quem avisou e do administrador continuam", fks);
  fim("e2e-35 (Trava 7-C: políticas de retenção e migração 153)");
})().catch((e) => { console.log("ERRO:", e && e.stack); L.shimEncerrar(); process.exitCode = 1; });
