// Testes de UNIDADE do motor do painel de conteúdo (src/lib/painelConteudo.ts): só as funções puras — datas locais, endereço (slug),
// validação, serialização, URL segura, erros do Directus, a configuração dos tipos, a ordem manual (▲/▼) e as várias fotos.
// Não usa rede nem Directus. Como rodar (de dentro de site/):  node scripts/testes/painel-unidade.cjs
//   (para conferir o fuso:  PC_TZ=America/Belem node scripts/testes/painel-unidade.cjs   e   PC_TZ=Asia/Tokyo …)
if (process.env.PC_TZ) process.env.TZ = process.env.PC_TZ;
const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");

const arquivo = path.join(__dirname, "../../src/lib/painelConteudo.ts");
const js = ts.transpileModule(fs.readFileSync(arquivo, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const m = new Module("painelConteudo.js");
const original = Module._load;
Module._load = function (req, ...resto) {
  if (req === "marked") return { marked: { parse: () => "" } };
  if (req === "@/lib/painelAuth")
    return { irParaLogin() {}, obterTokenValido: async () => null, renovarToken: async () => null };
  return original.call(this, req, ...resto);
};
m._compile(js, "painelConteudo.js");
Module._load = original;
const L = m.exports;

let falhas = 0;
let total = 0;
const eq = (a, b, d) => {
  total++;
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) {
    falhas++;
    console.log("  FALHA", d, "→", JSON.stringify(a), "esperado", JSON.stringify(b));
  } else console.log("  ok   ", d);
};
const ZW = String.fromCharCode(0x200b);
console.log(
  "TZ =",
  process.env.TZ || "(padrão)",
  "offset(min) =",
  new Date(2026, 9, 15, 12).getTimezoneOffset(),
);

// ---------------------------------------------------------------- slug
eq(
  L.slugify("Culto de Gratidão — Ação & Fé!"),
  "culto-de-gratidao-acao-fe",
  "slugify tira acento e símbolos",
);
eq(L.slugify("  Ñandú  ÇÃO  "), "nandu-cao", "slugify: Ñ, Ç, espaços");
eq(L.slugify("!!!"), "", "slugify de só símbolos é vazio");
eq(
  L.slugify("a".repeat(30) + " " + "b".repeat(30) + " " + "c".repeat(30), 50).length <= 50,
  true,
  "slugify respeita o limite",
);
eq(L.SLUG_VALIDO.test("abc-123"), true, "slug válido");
eq(
  ["Abc", "a--b", "-a", "a-", "a b", "ação"].map((s) => L.SLUG_VALIDO.test(s)),
  [false, false, false, false, false, false],
  "slugs inválidos",
);

// ---------------------------------------------------------------- datas
eq(L.dataBR("2026-09-05"), "05/09/2026", "dataBR de date");
eq(
  L.dataBR("2026-09-05T23:59:00-03:00"),
  "05/09/2026",
  "dataBR de ISO usa o dia escrito (sem fuso)",
);
eq(L.dataBR(null), "", "dataBR vazio");
eq(L.hojeLocal(new Date(2026, 0, 2, 23, 59)), "2026-01-02", "hojeLocal usa o calendário local");
eq(L.agoraLocalInput(new Date(2026, 9, 15, 18, 5)), "2026-10-15T18:05", "agoraLocalInput");
const iso = L.localInputParaIso("2026-10-15T18:30");
eq(
  new Date(iso).getHours() === 18 && new Date(iso).getMinutes() === 30,
  true,
  "datetime-local → ISO preserva o horário LOCAL",
);
eq(
  L.isoParaLocalInput(iso),
  "2026-10-15T18:30",
  "ISO → datetime-local devolve o mesmo horário local (ida e volta)",
);
eq(L.localInputParaIso(""), null, "datetime vazio → null");
eq(L.localInputParaIso("lixo"), null, "datetime inválido → null");
eq(
  L.isoParaLocalInput("2026-10-15T18:30:00"),
  "2026-10-15T18:30",
  "dateTime do Directus sem fuso vale como horário local",
);
eq(L.isoParaLocalInput(null), "", "ISO nulo → vazio");

// ---------------------------------------------------------------- validação
const campo = (extra) => ({ nome: "x", rotulo: "Campo", tipo: "text", ...extra });
eq(
  L.validarCampo(campo({ obrigatorio: true }), null, false),
  'Preencha o campo "Campo".',
  "obrigatório vazio",
);
eq(
  L.validarCampo(campo({ obrigatorio: true, mensagemObrigatorio: "Explique melhor." }), "", false),
  "Explique melhor.",
  "obrigatório vazio com mensagem própria",
);
eq(
  L.validarCampo(campo({ obrigatorioParaPublicar: true }), "", false),
  null,
  "obrigatório-para-publicar vazio passa no rascunho",
);
eq(
  /Para publicar/.test(L.validarCampo(campo({ obrigatorioParaPublicar: true }), "", true)),
  true,
  "…e barra na publicação",
);
eq(L.validarCampo(campo({ tipo: "url" }), "https://a.b/c", false), null, "url https ok");
eq(
  /endereço completo/.test(L.validarCampo(campo({ tipo: "url" }), "javascript:alert(1)", false)),
  true,
  "url javascript: barrada",
);
eq(
  /menor/.test(L.validarCampo(campo({ tipo: "number", min: 1 }), 0, false)),
  true,
  "número abaixo do mínimo",
);
eq(
  L.validarCampo(campo({ tipo: "date" }), "2026-02-30", false) !== null,
  true,
  "data impossível barrada",
);
eq(L.validarCampo(campo({ tipo: "date" }), "2026-02-28", false), null, "data válida");
eq(
  /limite de 5/.test(L.validarCampo(campo({ maxLength: 5 }), "123456", false)),
  true,
  "tamanho máximo",
);
eq(L.validarCampo(campo({ tipo: "slug" }), "Olá", false) !== null, true, "slug com acento barrado");
eq(
  L.validarCampo(campo({ tipo: "imagens", obrigatorio: true }), [], false),
  'Preencha o campo "Campo".',
  "lista de fotos vazia conta como vazio",
);
eq(
  /no máximo 2 fotos/.test(
    L.validarCampo(campo({ tipo: "imagens", maximo: 2 }), [{}, {}, {}], false),
  ),
  true,
  "limite de fotos",
);
eq(
  L.validarCampo(campo({ tipo: "imagens", maximo: 2 }), [{}, {}], false),
  null,
  "dentro do limite de fotos",
);

// ---------------------------------------------------------------- serialização e padrões
eq(L.paraDirectus(campo(), "  oi  "), "oi", "texto: trim");
eq(L.paraDirectus(campo(), "   "), null, "texto vazio → null");
eq(
  L.paraDirectus(campo({ tipo: "markdown" }), "a\r\nb\n\n"),
  "a\nb",
  "markdown: normaliza quebras e tira o rabo",
);
eq(L.paraDirectus(campo({ tipo: "number" }), "7"), 7, "número digitado → número");
eq(L.paraDirectus(campo({ tipo: "m2o" }), "12"), 12, "relação numérica → id numérico");
eq(
  L.paraDirectus(campo({ tipo: "m2o" }), "departamentos"),
  "departamentos",
  "relação por texto (ex.: tipo de órgão) fica texto",
);
eq(L.paraDirectus(campo({ tipo: "m2o" }), ""), null, "relação vazia → null");
eq(
  L.paraDirectus(campo({ tipo: "imagens" }), [{ id: 1 }]),
  [{ id: 1 }],
  "várias fotos passam como estão",
);
eq(L.valorPadrao(campo({ tipo: "imagens" })), [], "várias fotos: padrão é lista vazia");
eq(
  L.valorPadrao(campo({ tipo: "date", padrao: "hoje" })),
  L.hojeLocal(),
  "padrão 'hoje' em campo date",
);
eq(L.valorPadrao(campo({ tipo: "boolean" })), false, "booleano sem padrão = false");

// ---------------------------------------------------------------- URL segura
eq(L.urlSegura("https://a.b/c?d=1", false), "https://a.b/c?d=1", "https ok");
eq(L.urlSegura("  JaVaScRiPt:alert(1)", true), null, "javascript: com espaço/caixa recusado");
eq(L.urlSegura("java\tscript:alert(1)", true), null, "javascript: com TAB no meio recusado");
eq(L.urlSegura("data:text/html;base64,AAAA", false), null, "data: recusado");
eq(L.urlSegura("mailto:a@b.c", true), "mailto:a@b.c", "mailto ok em link");
eq(L.urlSegura("mailto:a@b.c", false), null, "mailto recusado em imagem");
eq(L.urlSegura("/noticia/x/", false), "/noticia/x/", "relativo ok");
eq(
  L.urlSegura(ZW + "javascript:alert(1)", true),
  null,
  "javascript: com caractere invisível recusado",
);

// ---------------------------------------------------------------- registro e configuração dos tipos
eq(
  Object.keys(L.TIPOS_CONTEUDO),
  [
    "noticias",
    "mensagens",
    "faq",
    "programacao",
    "galeria",
    "ministerios",
    "historia",
    "configuracoes",
  ],
  "registro: os oito tipos, na ordem dos cartões",
);
eq(L.obterTipo("faq").colecao, "faq", "obterTipo");
eq(L.obterTipo("__proto__"), null, "obterTipo não cai em protótipo");
eq(L.obterTipo("constructor"), null, "obterTipo(constructor) é nulo");
eq(L.obterTipo(null), null, "obterTipo(null)");
const gruposIds = L.GRUPOS_HOME.map((g) => g.id);
eq(
  L.GRUPOS_HOME.map((g) => g.titulo),
  ["Notícias e mensagens", "Páginas e informações", "Institucional"],
  "seções da página inicial",
);
for (const t of Object.values(L.TIPOS_CONTEUDO)) {
  const campos = L.todosCampos(t).map((c) => c.nome);
  eq(new Set(campos).size, campos.length, `${t.id}: nomes de campo únicos`);
  eq(gruposIds.includes(t.grupo), true, `${t.id}: pertence a uma seção da página inicial`);
  eq(
    t.paginasPublicas.length > 0 &&
      t.paginasPublicas.every((p) => p.url.startsWith("/") && p.rotulo),
    true,
    `${t.id}: tem a(s) página(s) pública(s) para "Ver no site"`,
  );
  eq(
    Boolean(t.descricao) && t.descricao.length < 140,
    true,
    `${t.id}: descrição curta (uma linha) no cartão`,
  );
  eq(campos.includes(t.campoTitulo), true, `${t.id}: o campo do título existe no formulário`);
  if (t.rascunho)
    eq(
      L.todosCampos(t).some((c) => c.nome === t.rascunho.campo),
      false,
      `${t.id}: o formulário não tem checkbox de rascunho (os botões decidem)`,
    );
  if (t.ordem) {
    eq(
      L.camposDaLista(t).includes(t.ordem.campo),
      true,
      `${t.id}: a lista lê o campo de ordem (${t.ordem.campo})`,
    );
    eq(
      !t.ordem.agruparPor || campos.includes(t.ordem.agruparPor),
      true,
      `${t.id}: o campo de grupo existe no formulário`,
    );
    eq(
      campos.includes(t.ordem.campo),
      false,
      `${t.id}: a ordem não é digitada no formulário (só pelas setas)`,
    );
  }
}
for (const id of ["noticias", "mensagens"]) {
  const t = L.obterTipo(id);
  const campos = L.todosCampos(t).map((c) => c.nome);
  eq(
    ["title", "slug", "date", "cover", "body"].every((n) => campos.includes(n)),
    true,
    `${id}: tem título, endereço, data, capa e texto`,
  );
  eq(
    L.camposDaLista(t).includes("draft") && L.camposDaLista(t).includes("notificacao_enviada"),
    true,
    `${id}: a lista lê draft e notificacao_enviada`,
  );
  eq(
    L.todosCampos(t)
      .filter((c) => c.nome === "notificacao_enviada")
      .every((c) => c.tipo === "readonly"),
    true,
    `${id}: notificacao_enviada é somente leitura`,
  );
  eq(t.ordem, undefined, `${id}: sem ordem manual (a data decide)`);
}
const n = L.obterTipo("noticias");
eq(n.urlPublica({ slug: "ola" }), "/noticia/ola/", "URL pública da notícia");
eq(
  L.obterTipo("mensagens").urlPublica({ slug: "ola" }),
  "/mensagem/ola/",
  "URL pública da mensagem",
);
eq(L.estaPublicado(n, { draft: true }), false, "draft:true = rascunho");
eq(L.estaPublicado(n, { draft: false }), true, "draft:false = publicado");

// o segundo lote
const faq = L.obterTipo("faq");
const prog = L.obterTipo("programacao");
const mini = L.obterTipo("ministerios");
const hist = L.obterTipo("historia");
const gal = L.obterTipo("galeria");
const cfg = L.obterTipo("configuracoes");
eq(faq.rascunho, { campo: "draft", valorRascunho: true }, "faq tem rascunho (draft)");
eq(faq.campoNotificacao, undefined, "faq NÃO avisa ninguém ao publicar");
eq(
  [prog, mini, hist, gal, cfg].map((t) => t.rascunho),
  [undefined, undefined, undefined, undefined, undefined],
  "programação, ministérios, história, galeria e configurações: sem rascunho (vão direto ao site)",
);
eq(
  [faq, prog, mini, hist, gal, cfg].map((t) => t.unico === true),
  [false, false, false, false, false, true],
  "só configurações é item único",
);
eq(L.estaPublicado(prog, {}), true, "tipo sem rascunho: todo item vale no site");
eq(L.estaPublicado(faq, { draft: true }), false, "faq: draft:true é rascunho");
eq(
  [faq, prog, mini, hist, gal].map((t) => t.ordem.campo),
  ["sort", "sort", "sort", "sort", "sort"],
  "cinco tipos com ordem manual por sort",
);
eq(
  [faq, prog, mini, hist, gal].map((t) => t.ordem.agruparPor || null),
  ["categoria", "day", "category", null, "album"],
  "ordem vale dentro de: categoria (faq), dia (programação), tipo do órgão (ministérios), álbum (galeria); história é uma fila só",
);
eq(cfg.ordem, undefined, "configurações: sem ordem");
eq(mini.urlPublica({ slug: "jovens" }), "/orgao/jovens/", "URL do ministério");
eq(mini.urlPublica({}), null, "ministério sem slug: sem URL");
const obrig = (t) =>
  L.todosCampos(t)
    .filter((c) => c.obrigatorio)
    .map((c) => c.nome);
eq(
  obrig(faq),
  ["pergunta", "resposta", "categoria"],
  "faq: pergunta, resposta e grupo obrigatórios",
);
eq(obrig(prog), ["day", "title"], "programação: dia e nome obrigatórios");
eq(obrig(mini), ["name", "slug", "category"], "ministérios: nome, endereço e tipo obrigatórios");
eq(obrig(gal), ["photo", "alt"], "galeria: foto e descrição (alt) obrigatórias");
eq(obrig(hist), ["title"], "história: só o título é obrigatório");
eq(
  obrig(cfg),
  ["tagline", "about", "sobre_corpo"],
  "configurações: frase, resumo e texto do Sobre obrigatórios (como no Directus)",
);
const opcoes = (t, nome) =>
  L.todosCampos(t)
    .find((c) => c.nome === nome)
    .opcoes.map((o) => o.valor);
eq(
  opcoes(faq, "categoria"),
  [
    "primeira-visita",
    "cultos",
    "doacoes",
    "mensagens",
    "site",
    "oracao",
    "eventos",
    "transparencia",
  ],
  "faq: opções de categoria = campo do Directus",
);
eq(
  opcoes(prog, "day"),
  ["segunda", "terca", "quarta", "quinta", "sexta", "sabado", "domingo_manha", "domingo_noite"],
  "programação: dias = campo do Directus",
);
eq(opcoes(prog, "scope"), ["todas", "sede", "congregacoes"], "programação: onde acontece");
eq(opcoes(prog, "occurrence"), ["1", "2", "3", "4_se_5", "ultimo"], "programação: qual domingo");
eq(
  L.todosCampos(mini).find((c) => c.nome === "category").colecaoRelacionada,
  "orgao_categorias",
  "ministérios: tipo vem de orgao_categorias",
);
const erGal = L.validarTudo(gal, { photo: null, alt: "", caption: null, album: null }, false);
eq(
  erGal.map((e) => e.campo),
  ["photo", "alt"],
  "galeria sem foto e sem descrição: dois erros",
);
eq(
  /leitor de tela/.test(erGal[1].mensagem) && /cegas/.test(erGal[1].mensagem),
  true,
  "o erro do alt explica POR QUÊ é obrigatório",
);
eq(
  L.validarTudo(gal, { photo: "uuid", alt: "Batismo", caption: null, album: null }, false),
  [],
  "galeria completa passa",
);
eq(
  L.validarTudo(prog, { day: null, title: "Culto", scope: "todas" }, false).map((e) => e.campo),
  ["day"],
  "programação sem dia: erro no dia",
);

// campos lidos do Directus
eq(
  L.camposDaEdicao(hist).includes("fotos.directus_files_id") &&
    L.camposDaEdicao(hist).includes("fotos.sort") &&
    L.camposDaEdicao(hist).includes("fotos.id") &&
    !L.camposDaEdicao(hist).includes("fotos"),
  true,
  "história: a edição lê as linhas da tabela de fotos (e não o campo 'fotos' cru)",
);
eq(
  L.camposDaEdicao(hist, { semRelacoes: true }).some((c) => c.startsWith("fotos")),
  false,
  "sem acesso à ligação: pede tudo menos as fotos extras",
);
eq(
  L.camposDaEdicao(faq).includes("draft") && L.camposDaEdicao(faq).includes("pergunta"),
  true,
  "faq: a edição lê draft e pergunta",
);
eq(L.camposDaEdicao(prog).includes("draft"), false, "programação não tem campo draft");
eq(
  ["sort", "categoria", "draft"].every((c) => L.camposDaLista(faq).includes(c)),
  true,
  "faq: a lista lê sort, categoria e draft",
);
eq(
  L.camposDaLista(prog).includes("occurrence") &&
    L.camposDaLista(prog).includes("time") &&
    L.camposDaLista(prog).includes("day"),
  true,
  "programação: a lista lê dia, ocorrência e horário",
);
eq(L.caminhoItem(faq, 7), "/items/faq/7", "caminho de um item");
eq(
  L.caminhoItem(cfg, 1),
  "/items/configuracoes",
  "item único usa o endereço da coleção (singleton)",
);
eq(L.caminhoItem(faq, null), "/items/faq", "sem id: a coleção");
eq(
  L.painelUrls.destino(cfg),
  "/painel-conteudo/editar/?tipo=configuracoes",
  "o cartão do item único abre direto o formulário",
);
eq(
  L.painelUrls.destino(faq),
  "/painel-conteudo/lista/?tipo=faq",
  "o cartão dos outros abre a lista",
);

// ---------------------------------------------------------------- ordem manual
const it = (id, sort, extra = {}) => ({ id, sort, ...extra });
eq(
  L.calcularTroca([it(1, 1), it(2, 2), it(3, 3)], "sort", 2, 1),
  [
    { id: 2, sort: 1 },
    { id: 1, sort: 2 },
  ],
  "subir o 2º: troca só os dois valores",
);
eq(
  L.calcularTroca([it(1, 1), it(2, 2), it(3, 3)], "sort", 2, 3),
  [
    { id: 2, sort: 3 },
    { id: 3, sort: 2 },
  ],
  "descer o 2º: troca só os dois valores",
);
eq(
  L.calcularTroca([it(5, 10), it(6, 20), it(7, 30)], "sort", 6, 5),
  [
    { id: 6, sort: 10 },
    { id: 5, sort: 20 },
  ],
  "valores não consecutivos: troca os valores como estão",
);
eq(
  L.calcularTroca([it(1, 1), it(2, 2), it(3, 3)], "sort", 1, 3),
  [
    { id: 1, sort: 3 },
    { id: 3, sort: 1 },
  ],
  "vizinho que pulou um do meio (lista filtrada): troca os dois valores",
);
eq(L.calcularTroca([it(1, 1), it(2, 2)], "sort", 1, 1), [], "trocar com ele mesmo: nada");
eq(L.calcularTroca([it(1, 1), it(2, 2)], "sort", 1, 99), [], "vizinho que não existe: nada");
eq(
  L.calcularTroca([it(1, 2), it(2, 2), it(3, 3)], "sort", 2, 1),
  [{ id: 2, sort: 1 }],
  "ordens repetidas (1 e 2 valem 2): renumera o grupo e grava só o que mudou (o item 1 passa a ser o 2º com o mesmo valor 2, o 3º não muda)",
);
eq(
  L.calcularTroca([it(1, 5), it(2, 5), it(3, 5)], "sort", 3, 2),
  [
    { id: 1, sort: 1 },
    { id: 3, sort: 2 },
    { id: 2, sort: 3 },
  ],
  "tudo igual: renumera 1, 2, 3 com a troca feita",
);
eq(
  L.calcularTroca([it(1, 1), it(2, null), it(3, null)], "sort", 3, 2),
  [
    { id: 3, sort: 2 },
    { id: 2, sort: 3 },
  ],
  "ordem nula: renumera (o 1º já valia 1 e não é regravado)",
);
eq(
  L.calcularTroca([it(1, 1), it(2, 2)], "ordem", 1, 2),
  [
    { id: 2, ordem: 1 },
    { id: 1, ordem: 2 },
  ],
  "campo de ordem sem valores no grupo: renumera usando o nome do campo certo",
);
eq(
  L.calcularTroca([it(1, 1, { ordem: 1 }), it(2, 2, { ordem: 2 })], "ordem", 1, 2),
  [
    { id: 1, ordem: 2 },
    { id: 2, ordem: 1 },
  ],
  "o corpo usa o nome do campo de ordem do tipo",
);
eq(L.proximaOrdem(null), 1, "primeiro item da ordem = 1");
eq(L.proximaOrdem(undefined), 1, "sem maior: 1");
eq(L.proximaOrdem(16), 17, "maior 16 → 17");
eq(L.proximaOrdem("9"), 10, "maior em texto → número");
eq(
  L.consultaMaiorOrdem(faq, "cultos"),
  "/items/faq?fields=sort&sort=-sort&limit=1&filter[sort][_nnull]=true&filter[categoria][_eq]=cultos",
  "maior ordem do faq: dentro da categoria",
);
eq(
  L.consultaMaiorOrdem(gal, null),
  "/items/galeria?fields=sort&sort=-sort&limit=1&filter[sort][_nnull]=true&filter[album][_null]=true",
  "maior ordem da galeria sem álbum: itens sem álbum",
);
eq(
  L.consultaMaiorOrdem(gal, "Culto de Natal"),
  "/items/galeria?fields=sort&sort=-sort&limit=1&filter[sort][_nnull]=true&filter[album][_eq]=Culto%20de%20Natal",
  "maior ordem do álbum (com acentos e espaços escapados)",
);
eq(
  L.consultaMaiorOrdem(hist, null),
  "/items/historia?fields=sort&sort=-sort&limit=1&filter[sort][_nnull]=true",
  "maior ordem da história: coleção toda",
);
const gr = L.montarGrupos(
  [
    it(1, 3, { c: "b" }),
    it(2, 1, { c: "a" }),
    it(3, 2, { c: "b" }),
    it(4, null, { c: "a" }),
    it(5, 5, { c: null }),
    it(6, 4, { c: "z" }),
  ],
  "c",
  {
    campoOrdem: "sort",
    ordemChaves: ["a", "b"],
    rotulos: { a: "Alfa", b: "Beta" },
    rotuloSemGrupo: "Outros",
  },
);
eq(
  gr.map((g) => [g.chave, g.rotulo, g.itens.map((i) => i.id)]),
  [
    ["a", "Alfa", [2, 4]],
    ["b", "Beta", [3, 1]],
    ["z", "z", [6]],
    ["", "Outros", [5]],
  ],
  "grupos: ordem das opções, depois os outros, 'sem grupo' por último; dentro de cada, por ordem (nulo por último)",
);
eq(
  L.montarGrupos([it(2, 2), it(1, 1)], undefined, { campoOrdem: "sort" }).map((g) => [
    g.rotulo,
    g.itens.map((i) => i.id),
  ]),
  [["", [1, 2]]],
  "sem campo de grupo: um grupo só, ordenado",
);

// ---------------------------------------------------------------- várias fotos
const campoFotos = hist.secoes.flatMap((s) => s.campos).find((c) => c.nome === "fotos");
eq(
  L.fotosDeDirectus(campoFotos, [
    { id: 8, directus_files_id: "b", sort: 2 },
    { id: 7, directus_files_id: "a", sort: 1 },
    99,
    null,
  ]),
  [
    { id: 7, arquivo: "a", ordem: 1 },
    { id: 8, arquivo: "b", ordem: 2 },
  ],
  "fotos do Directus: ordena por posição e ignora o que não é linha completa",
);
eq(
  L.fotosDeDirectus(campoFotos, [1, 2, 3]),
  [],
  "só ids soltos (sem os campos pedidos): lista vazia",
);
eq(L.fotosDeDirectus(campoFotos, null), [], "nada → lista vazia");
const f1 = { id: 1, arquivo: "a", ordem: 1 };
const f2 = { id: 2, arquivo: "b", ordem: 2 };
const f3 = { id: 3, arquivo: "c", ordem: 3 };
eq(L.diferencaFotos(campoFotos, [f1, f2], [f1, f2]), null, "fotos iguais: nada a gravar");
eq(
  L.diferencaFotos(
    campoFotos,
    [],
    [
      { id: null, arquivo: "x" },
      { id: null, arquivo: "y" },
    ],
  ),
  {
    create: [
      { directus_files_id: "x", sort: 1 },
      { directus_files_id: "y", sort: 2 },
    ],
    update: [],
    delete: [],
  },
  "fotos novas viram linhas novas com a posição",
);
eq(
  L.diferencaFotos(campoFotos, [f1, f2, f3], [f1, f3]),
  { create: [], update: [{ id: 3, sort: 2 }], delete: [2] },
  "foto tirada: apaga a linha e a seguinte sobe uma posição",
);
eq(
  L.diferencaFotos(campoFotos, [f1, f2], [f2, f1]),
  {
    create: [],
    update: [
      { id: 2, sort: 1 },
      { id: 1, sort: 2 },
    ],
    delete: [],
  },
  "fotos trocadas de lugar: grava as posições novas",
);
eq(
  L.diferencaFotos(campoFotos, [f1], [f1, { id: null, arquivo: "z" }]),
  { create: [{ directus_files_id: "z", sort: 2 }], update: [], delete: [] },
  "uma foto nova no fim: só a nova é criada",
);
eq(
  L.diferencaFotos(
    campoFotos,
    [{ id: 1, arquivo: "a", ordem: 5 }],
    [{ id: 1, arquivo: "a", ordem: 5 }],
  ),
  { create: [], update: [{ id: 1, sort: 1 }], delete: [] },
  "posição guardada fora do padrão (5): renumera para 1",
);

// ---------------------------------------------------------------- erros do Directus
const err = (status, code, field, msg, acao = "salvar") =>
  L.explicarErroDirectus(
    status,
    { errors: [{ message: msg || "x", extensions: { code, field } }] },
    acao,
    n,
  );
eq(
  err(400, "RECORD_NOT_UNIQUE", "slug").mensagem,
  "Já existe outro item com este endereço (slug). Troque o endereço e salve de novo.",
  "slug repetido",
);
eq(err(403).mensagem, "Seu perfil não pode salvar aqui.", "403 amigável");
eq(/instável/.test(err(503).mensagem), true, "5xx: servidor instável, texto continua na tela");
eq(
  /recusou/.test(err(400, "FAILED_VALIDATION", "title", "Value is required").mensagem),
  true,
  "validação do servidor vira frase com o motivo",
);
eq(/sessão acabou/.test(err(401).mensagem), true, "401");
eq(
  /ligado a outros registros/.test(err(400, "INVALID_FOREIGN_KEY", null, "x", "excluir").mensagem),
  true,
  "excluir algo em uso (ex.: ministério com membros): explica",
);
eq(
  /aponta para algo que não existe/.test(err(400, "INVALID_FOREIGN_KEY").mensagem),
  true,
  "chave estrangeira inválida ao salvar: explica",
);
eq(L.explicarErroDirectus(500, null, "salvar").status, 500, "resposta sem corpo não quebra");

console.log(falhas ? `\n${falhas} FALHA(S) de ${total}` : `\n${total}/${total} verificações ok`);
process.exitCode = falhas ? 1 : 0;
