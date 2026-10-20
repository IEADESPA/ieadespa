// Testes de UNIDADE do motor do painel de conteúdo (src/lib/painelConteudo.ts) e da moderação (src/lib/painelModeracao.ts): só as
// funções puras — datas locais, endereço (slug), validação, serialização, URL segura, erros do Directus, a configuração dos tipos,
// a ordem manual (▲/▼), as várias fotos, o envio de arquivo (PDF: tipo, tamanho, assinatura) e a moderação (filtros das abas,
// regras de aprovação, textos de confirmação, cartões da página inicial).
// Não usa rede nem Directus. Como rodar (de dentro de site/):  node scripts/testes/painel-unidade.cjs
//   (para conferir o fuso:  PC_TZ=America/Belem node scripts/testes/painel-unidade.cjs   e   PC_TZ=Asia/Tokyo …)
if (process.env.PC_TZ) process.env.TZ = process.env.PC_TZ;
const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");

// Carrega um arquivo .ts da pasta src/lib como módulo CommonJS, trocando por dublês o que só existe no navegador/no Astro.
const original = Module._load;
const modulosCarregados = {};
function carregar(nome) {
  const arquivo = path.join(__dirname, `../../src/lib/${nome}.ts`);
  const js = ts.transpileModule(fs.readFileSync(arquivo, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = new Module(`${nome}.js`);
  Module._load = function (req, ...resto) {
    if (req === "marked") return { marked: { parse: () => "" } };
    if (req === "@/lib/painelAuth")
      return { irParaLogin() {}, obterTokenValido: async () => null, renovarToken: async () => null };
    if (req === "@/lib/painelConteudo" && modulosCarregados.painelConteudo)
      return modulosCarregados.painelConteudo;
    return original.call(this, req, ...resto);
  };
  try {
    mod._compile(js, `${nome}.js`);
  } finally {
    Module._load = original;
  }
  modulosCarregados[nome] = mod.exports;
  return mod.exports;
}
const L = carregar("painelConteudo");
const M = carregar("painelModeracao");

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
    "relatorios",
    "configuracoes",
  ],
  "registro: os nove tipos, na ordem dos cartões",
);
eq(L.obterTipo("faq").colecao, "faq", "obterTipo");
eq(L.obterTipo("__proto__"), null, "obterTipo não cai em protótipo");
eq(L.obterTipo("constructor"), null, "obterTipo(constructor) é nulo");
eq(L.obterTipo(null), null, "obterTipo(null)");
const gruposIds = L.GRUPOS_HOME.map((g) => g.id);
eq(
  L.GRUPOS_HOME.map((g) => g.titulo),
  ["Moderação", "Notícias e mensagens", "Páginas e informações", "Institucional"],
  "seções da página inicial (Moderação primeiro: é a fila de decisões da Diretoria)",
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

// ---------------------------------------------------------------- terceiro lote: arquivo (PDF)
const PDF = L.REGRA_PDF;
const MBYTES = 1024 * 1024;
eq(
  [PDF.tipos, PDF.extensoes, PDF.maxBytes, PDF.assinatura],
  [["application/pdf"], [".pdf"], 25 * MBYTES, "%PDF-"],
  "regra padrão: só PDF, até 25 MB, começando com %PDF-",
);
eq(
  [0, 1, 1023, 1024, 820 * 1024, MBYTES, Math.round(1.4 * MBYTES), 10.4 * MBYTES, 25 * MBYTES, 25 * MBYTES + 1].map(L.tamanhoLegivel),
  ["0 bytes", "1 bytes", "1023 bytes", "1 KB", "820 KB", "1 MB", "1,4 MB", "10 MB", "25 MB", "25 MB"],
  "tamanho legível em português (vírgula, sem casa decimal quando passa de 10 MB)",
);
eq([NaN, -5].map(L.tamanhoLegivel), ["", ""], "tamanho inválido → vazio");
const arq = (type, size, name) => ({ type, size, name });
eq(L.validarArquivoPorRegra(arq("application/pdf", 1 * MBYTES, "balanco.pdf"), PDF), null, "PDF de 1 MB passa");
eq(L.validarArquivoPorRegra(arq("application/pdf", 25 * MBYTES, "grande.pdf"), PDF), null, "PDF de exatamente 25 MB passa");
eq(
  /limite é 25 MB/.test(L.validarArquivoPorRegra(arq("application/pdf", 25 * MBYTES + 1, "grande.pdf"), PDF)) &&
    /tem 25 MB/.test(L.validarArquivoPorRegra(arq("application/pdf", 25 * MBYTES + 1, "grande.pdf"), PDF)),
  true,
  "PDF de 25 MB + 1 byte: recusa dizendo o tamanho e o limite",
);
eq(
  /tem 40 MB e o limite é 25 MB/.test(L.validarArquivoPorRegra(arq("application/pdf", 40 * MBYTES, "x.pdf"), PDF)),
  true,
  "PDF de 40 MB: 'tem 40 MB e o limite é 25 MB'",
);
eq(L.validarArquivoPorRegra(arq("application/pdf", 0, "vazio.pdf"), PDF), "O arquivo está vazio.", "arquivo vazio");
eq(
  /não serve: envie um PDF\./.test(L.validarArquivoPorRegra(arq("text/plain", 10, "nota.txt"), PDF)) &&
    /Salvar como PDF/.test(L.validarArquivoPorRegra(arq("text/plain", 10, "nota.txt"), PDF)),
  true,
  "texto: recusa e diz como gerar um PDF",
);
eq(
  L.validarArquivoPorRegra(arq("image/png", 10, "foto.pdf"), PDF) !== null,
  true,
  "tipo diz imagem mesmo com nome .pdf: recusa",
);
eq(
  L.validarArquivoPorRegra(arq("application/vnd.openxmlformats-officedocument.wordprocessingml.document", 10, "balanco.docx"), PDF) !== null,
  true,
  "Word (.docx): recusa",
);
eq(L.validarArquivoPorRegra(arq("", 100, "relatorio.PDF"), PDF), null, "aparelho que não informa o tipo: vale a extensão (.PDF)");
eq(L.validarArquivoPorRegra(arq("", 100, "relatorio.txt"), PDF) !== null, true, "tipo em branco e extensão errada: recusa");
eq(L.validarArquivoPorRegra(arq("", 100, undefined), PDF) !== null, true, "tipo em branco e sem nome: recusa");
eq(L.validarArquivoPorRegra(arq("APPLICATION/PDF", 100, "a.pdf"), PDF), null, "tipo em maiúsculas é aceito");
const bytesDe = (t) => Array.from(t).map((c) => c.charCodeAt(0));
eq(L.confereAssinatura(bytesDe("%PDF-1.7\n%âãÏÓ"), "%PDF-"), true, "PDF de verdade: assinatura confere");
eq(L.confereAssinatura(bytesDe("PK\u0003\u0004word/document.xml"), "%PDF-"), false, "arquivo Word renomeado para .pdf: não confere");
eq(L.confereAssinatura(bytesDe("lixo\r\n".repeat(20) + "%PDF-1.4"), "%PDF-"), true, "assinatura com lixo antes (até 1 KB): confere");
eq(L.confereAssinatura(bytesDe("x".repeat(1100) + "%PDF-1.4"), "%PDF-"), false, "assinatura depois de 1 KB: não confere");
eq(L.confereAssinatura([], "%PDF-"), false, "arquivo sem nenhum byte: não confere");
eq(/não é de um PDF de verdade/.test(L.MENSAGEM_ASSINATURA), true, "mensagem da assinatura explica");

// ---------------------------------------------------------------- terceiro lote: relatórios de transparência
const rel = L.obterTipo("relatorios");
eq(rel.colecao, "relatorios", "relatórios: coleção");
eq(rel.rascunho, undefined, "relatórios: sem rascunho (vai ao site na próxima montagem)");
eq(rel.grupo, "institucional", "relatórios: cartão em Institucional");
eq(rel.paginasPublicas, [{ rotulo: "Transparência", url: "/transparencia/" }], "relatórios: 'Ver no site' leva a /transparencia/");
eq(obrig(rel), ["title", "period", "date", "file"], "relatórios: título, período, data e arquivo obrigatórios");
eq(
  L.todosCampos(rel).map((c) => [c.nome, c.tipo]),
  [["title", "text"], ["period", "text"], ["date", "date"], ["excerpt", "textarea"], ["file", "arquivo"]],
  "relatórios: campos e tipos",
);
eq(L.todosCampos(rel).find((c) => c.nome === "file").regraArquivo, PDF, "relatórios: o arquivo usa a regra de PDF até 25 MB");
eq(rel.campoArquivo, "file", "relatórios: a lista abre o arquivo do campo 'file'");
eq(
  ["id", "title", "date", "file", "period"].every((c) => L.camposDaLista(rel).includes(c)),
  true,
  "relatórios: a lista lê título, data, período e arquivo",
);
eq(L.camposDaEdicao(rel).includes("file") && L.camposDaEdicao(rel).includes("excerpt"), true, "relatórios: a edição lê o arquivo e o resumo");
eq(L.camposDaEdicao(rel).includes("draft"), false, "relatórios: não há campo draft");
eq(rel.ordenacao, ["-date", "-id"], "relatórios: do mais recente para o mais antigo");
eq(rel.urlPublica({ id: 1 }), null, "relatórios: não há página própria por item");
eq(L.estaPublicado(rel, {}), true, "relatórios: todo item salvo já vale no site");
eq(L.caminhoItem(rel, 4), "/items/relatorios/4", "relatórios: caminho de um item");
const errRel = L.validarTudo(rel, { title: "", period: null, date: null, excerpt: null, file: null }, false);
eq(errRel.map((e) => e.campo), ["title", "period", "date", "file"], "relatório vazio: quatro erros, na ordem do formulário");
eq(/PDF do relatório/.test(errRel[3].mensagem), true, "o erro do arquivo explica: escolha o PDF do relatório");
eq(/período/.test(errRel[1].mensagem), true, "o erro do período explica");
eq(
  L.validarTudo(rel, { title: "Prestação de contas", period: "1º semestre de 2026", date: "2026-07-10", excerpt: null, file: "7f5c2f0e-1111-4222-8333-444455556666" }, false),
  [],
  "relatório completo passa",
);
eq(
  L.validarTudo(rel, { title: "x", period: "y", date: "2026-02-30", excerpt: null, file: "u" }, false).map((e) => e.campo),
  ["date"],
  "relatório com data impossível: erro na data",
);
eq(L.paraDirectus(L.todosCampos(rel).find((c) => c.nome === "file"), "uuid"), "uuid", "o arquivo vai ao Directus como o id (texto)");
eq(L.valorPadrao(L.todosCampos(rel).find((c) => c.nome === "file")), null, "arquivo novo começa sem nada");
eq(L.valorPadrao(L.todosCampos(rel).find((c) => c.nome === "date")), L.hojeLocal(), "a data do relatório começa em hoje");
eq(L.painelUrls.destino(rel), "/painel-conteudo/lista/?tipo=relatorios", "o cartão dos relatórios abre a lista");

// ---------------------------------------------------------------- terceiro lote: moderação (filtros, regras, textos)
eq(Object.keys(M.TIPOS_MODERACAO), ["depoimentos", "mural_oracao"], "moderação: dois tipos, na ordem dos cartões");
eq(M.obterTipoModeracao("mural_oracao").colecao, "mural_oracao", "obterTipoModeracao");
eq([M.obterTipoModeracao("__proto__"), M.obterTipoModeracao("constructor"), M.obterTipoModeracao(null), M.obterTipoModeracao("faq")], [null, null, null, null], "obterTipoModeracao não cai em protótipo nem em tipo de conteúdo");
const dep = M.obterTipoModeracao("depoimentos");
const mur = M.obterTipoModeracao("mural_oracao");
for (const t of Object.values(M.TIPOS_MODERACAO)) {
  eq(gruposIds.includes(t.grupo) && t.grupo === "moderacao", true, `${t.id}: cartão na seção Moderação`);
  eq(t.paginasPublicas.length > 0 && t.paginasPublicas.every((p) => p.url.startsWith("/") && p.rotulo), true, `${t.id}: tem a página pública para "Ver no site"`);
  eq(Boolean(t.descricao) && t.descricao.length < 140, true, `${t.id}: descrição curta no cartão`);
  const idsAbas = t.abas.map((a) => a.id);
  eq(new Set(idsAbas).size === idsAbas.length && idsAbas[0] === "aguardando", true, `${t.id}: abas únicas, a primeira é "Aguardando"`);
  eq(t.abas.every((a) => a.rotulo && a.vazio && a.vazio.length > 10), true, `${t.id}: toda aba tem nome e frase de aba vazia`);
  eq(t.abas.find((a) => a.id === "aguardando").cartao !== undefined, true, `${t.id}: a contagem de "aguardando" aparece no cartão`);
  eq(Object.keys(L.TIPOS_CONTEUDO).includes(t.id), false, `${t.id}: o identificador não colide com um tipo de conteúdo`);
}
eq(dep.abas.map((a) => a.id), ["aguardando", "publicados"], "depoimentos: abas Aguardando e Publicados");
eq(mur.abas.map((a) => a.id), ["aguardando", "publicados", "confidenciais"], "mural: abas Aguardando, Publicados e Confidenciais");
eq(mur.abas[2].rotulo, "🔒 Confidenciais (só a equipe pastoral)", "mural: nome da aba confidencial");
eq(/Só a Diretoria vê esta aba/.test(mur.abas[2].aviso) && /nunca são publicados/.test(mur.abas[2].aviso), true, "mural: a aba confidencial avisa que só a Diretoria vê e que nunca é publicado");
eq(/IMEDIATAMENTE/.test(mur.abas[0].aviso) && /90 dias/.test(mur.abas[0].aviso), true, "mural: o aviso de 'Aguardando' diz que aprovar publica na hora");
eq(/20 minutos/.test(dep.abas[0].aviso), true, "depoimentos: o aviso diz que leva uns 20 minutos");
eq([dep.publicacao, mur.publicacao], [{ imediata: false }, { imediata: true, dias: 90 }], "publicação: depoimento na próxima montagem; mural na hora, por 90 dias");
eq(M.abaInicial(mur, "confidenciais"), "confidenciais", "?aba= válida é respeitada");
eq([M.abaInicial(dep, "confidenciais"), M.abaInicial(dep, null), M.abaInicial(mur, "lixo")], ["aguardando", "aguardando", "aguardando"], "?aba= que não existe NESTE tipo: volta para Aguardando");

// Um avaliador mínimo do filtro do Directus (só o que usamos: _and, _or, _eq, _null), para provar que as abas cobrem tudo sem sobrepor.
function casa(filtro, item) {
  return Object.entries(filtro).every(([chave, v]) => {
    if (chave === "_and") return v.every((f) => casa(f, item));
    if (chave === "_or") return v.some((f) => casa(f, item));
    const alvo = item[chave] === undefined ? null : item[chave];
    if ("_eq" in v) return alvo === v._eq;
    if ("_null" in v) return (alvo === null) === v._null;
    throw new Error("operador não previsto " + JSON.stringify(v));
  });
}
const tri = [true, false, null];
const itensMural = [];
for (const a of tri) for (const c of tri) itensMural.push({ id: itensMural.length + 1, aprovado: a, confidencial: c });
for (const it of itensMural) {
  const abas = mur.abas.map((a) => a.id).filter((id) => casa(M.filtroDaAba(mur, id), it));
  const esperada = it.confidencial === true ? "confidenciais" : it.aprovado === true ? "publicados" : "aguardando";
  eq(abas, [esperada], `mural: aprovado=${it.aprovado} confidencial=${it.confidencial} cai numa aba só (${esperada})`);
}
for (const a of tri) {
  const it = { aprovado: a };
  const abas = dep.abas.map((x) => x.id).filter((id) => casa(M.filtroDaAba(dep, id), it));
  eq(abas, [a === true ? "publicados" : "aguardando"], `depoimentos: aprovado=${a} cai numa aba só`);
}
eq(
  casa(M.filtroDaAba(mur, "aguardando"), { aprovado: false, confidencial: true }),
  false,
  "mural: pedido confidencial NUNCA entra em 'Aguardando' (então nunca ganha botão Aprovar na fila)",
);
eq(M.filtroDaAba(mur, "confidenciais"), { confidencial: { _eq: true } }, "filtro das confidenciais");
eq(
  M.filtroDaAba(dep, "aguardando"),
  { _or: [{ aprovado: { _eq: false } }, { aprovado: { _null: true } }] },
  "filtro do 'Aguardando' de depoimentos",
);
eq(M.filtroDaAba(dep, "confidenciais"), { id: { _null: true } }, "tipo sem campo confidencial: a aba confidencial nunca acha nada");
const filtroDaUrl = (u) => JSON.parse(decodeURIComponent(/[?&]filter=([^&]*)/.exec(u)[1]));
eq(filtroDaUrl(M.consultaContagem(mur, "aguardando")), M.filtroDaAba(mur, "aguardando"), "consulta de contagem leva o filtro da aba (JSON, escapado)");
eq(
  M.consultaContagem(dep, "publicados").startsWith("/items/depoimentos?limit=1&fields=id&meta=filter_count&filter="),
  true,
  "contagem: pede só o total (limit=1, meta=filter_count)",
);
const lista = M.consultaLista(mur, "publicados", 20, 40);
eq(
  ["limit=20", "offset=40", "meta=filter_count", "sort=-date_created,-id"].every((p) => lista.includes(p)) && lista.startsWith("/items/mural_oracao?fields="),
  true,
  "lista: do mais novo para o mais antigo, página e deslocamento",
);
eq(filtroDaUrl(lista), M.filtroDaAba(mur, "publicados"), "lista: o filtro é o da aba");
eq(decodeURIComponent(/fields=([^&]*)/.exec(lista)[1]).split(","), ["id", "nome", "texto", "aprovado", "consentimento_lgpd", "date_created", "confidencial", "orando_count"], "mural: campos lidos (confidencial e contador, sem foto)");
eq(decodeURIComponent(/fields=([^&]*)/.exec(M.consultaLista(dep, "aguardando", 20, 0))[1]).split(","), ["id", "nome", "texto", "aprovado", "consentimento_lgpd", "date_created", "foto"], "depoimentos: campos lidos (foto, sem confidencial nem contador)");
eq(M.consultaItem(dep, 7).startsWith("/items/depoimentos/7?fields="), true, "consulta de um item");
eq(M.consultaItem(dep, "a/b").includes("/items/depoimentos/a%2Fb?"), true, "o id vai escapado no caminho");

// Regras de aprovação e ações por item
const ok1 = { aprovado: false, consentimento_lgpd: true, confidencial: false };
eq(M.avaliarAprovacao(mur, ok1), { pode: true, motivo: null }, "pedido com consentimento e não confidencial: pode aprovar");
eq(M.avaliarAprovacao(mur, { ...ok1, confidencial: true }), { pode: false, motivo: M.MOTIVO_CONFIDENCIAL }, "pedido CONFIDENCIAL: nunca pode aprovar");
eq(M.avaliarAprovacao(mur, { ...ok1, confidencial: true, consentimento_lgpd: false }).motivo, M.MOTIVO_CONFIDENCIAL, "confidencial sem consentimento: o motivo é o da confidencialidade");
eq(M.avaliarAprovacao(dep, { aprovado: false, consentimento_lgpd: false }), { pode: false, motivo: M.MOTIVO_SEM_CONSENTIMENTO }, "depoimento SEM consentimento LGPD: não pode aprovar");
eq(M.avaliarAprovacao(dep, { aprovado: false, consentimento_lgpd: null }).pode, false, "consentimento vazio (null) conta como 'não'");
eq(M.avaliarAprovacao(dep, { aprovado: false }).pode, false, "consentimento ausente conta como 'não'");
eq(M.avaliarAprovacao(dep, { aprovado: false, consentimento_lgpd: true }).pode, true, "depoimento com consentimento: pode aprovar");
eq(M.avaliarAprovacao(mur, { aprovado: false, consentimento_lgpd: false, confidencial: false }).pode, false, "pedido sem consentimento: também não (o formulário público exige a caixa)");
eq(M.avaliarAprovacao(dep, { aprovado: false, consentimento_lgpd: "true" }).pode, false, "consentimento só vale se for exatamente verdadeiro");
eq(M.avaliarAprovacao(dep, { aprovado: false, consentimento_lgpd: true, confidencial: true }).pode, true, "depoimento não tem 'confidencial': o campo é ignorado");
eq(/^Confidencial: só a equipe pastoral lê; nunca é publicado$/.test(M.MOTIVO_CONFIDENCIAL), true, "texto do rótulo confidencial");
eq(M.acoesDoItem(mur, { aprovado: false, confidencial: true }), ["excluir"], "confidencial: SÓ excluir (sem Aprovar)");
eq(M.acoesDoItem(mur, { aprovado: true, confidencial: true }), ["excluir"], "confidencial (mesmo marcado aprovado por engano no Directus): SÓ excluir");
eq(M.acoesDoItem(mur, { aprovado: false, confidencial: false }), ["aprovar", "excluir"], "aguardando: aprovar e excluir");
eq(M.acoesDoItem(mur, { aprovado: false, confidencial: null }), ["aprovar", "excluir"], "confidencial vazio conta como 'não': aprovar e excluir");
eq(M.acoesDoItem(dep, { aprovado: true }), ["tirar", "excluir"], "publicado: tirar do ar e excluir");
eq(M.acoesDoItem(dep, { aprovado: null }), ["aprovar", "excluir"], "aprovado vazio conta como 'aguardando'");
eq(M.corpoDaAcao("aprovar"), { aprovado: true }, "aprovar grava SÓ { aprovado: true }");
eq(M.corpoDaAcao("tirar"), { aprovado: false }, "tirar do ar grava SÓ { aprovado: false }");
eq([M.nomeDoAutor({ nome: "  Maria  " }), M.nomeDoAutor({ nome: "" }), M.nomeDoAutor({ nome: "   " }), M.nomeDoAutor({ nome: null }), M.nomeDoAutor({})], ["Maria", "Anônimo", "Anônimo", "Anônimo", "Anônimo"], "nome do autor: vazio vira 'Anônimo'");

// 90 dias do mural
const agora = new Date("2026-10-15T12:00:00Z");
const novo = { aprovado: true, confidencial: false, date_created: "2026-09-15T12:00:00Z" };
const velho = { aprovado: true, confidencial: false, date_created: "2026-06-01T12:00:00Z" };
const fimNovo = new Date(Date.parse("2026-09-15T12:00:00Z") + 90 * 86400000);
const dd = (d) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
eq(M.situacaoNoMural(mur, novo, agora), { noMural: true, frase: `No mural público até ${dd(fimNovo)}` }, "mural: pedido de 30 dias está no ar e diz até quando");
eq(M.situacaoNoMural(mur, velho, agora), { noMural: false, frase: "Já saiu do mural público (passou de 90 dias)" }, "mural: pedido de mais de 90 dias já saiu do mural");
eq(M.situacaoNoMural(mur, { ...novo, aprovado: false }, agora), null, "mural: não aprovado não tem situação");
eq(M.situacaoNoMural(mur, { ...novo, confidencial: true }, agora), null, "mural: confidencial não tem situação (nunca vai ao ar)");
eq(M.situacaoNoMural(dep, novo, agora), null, "depoimentos: sem prazo de dias");
eq(M.situacaoNoMural(mur, { ...novo, date_created: "lixo" }, agora), null, "data inválida: sem situação (não quebra)");

// Textos de confirmação (cada promessa feita à pessoa)
const cmur = M.textoConfirmacao(mur, "aprovar", { nome: "Ana", aprovado: false });
eq(/IMEDIATAMENTE/.test(cmur.paragrafos.join(" ")) && /90 dias/.test(cmur.paragrafos.join(" ")) && /na hora/.test(cmur.paragrafos.join(" ")), true, "aprovar pedido: a confirmação diz IMEDIATAMENTE, na hora, por 90 dias");
eq([cmur.titulo, cmur.sim, cmur.digitar], ["Aprovar o pedido de “Ana”?", "Sim, publicar agora", undefined], "aprovar pedido: título e botão, sem digitar");
const cdep = M.textoConfirmacao(dep, "aprovar", { nome: "", aprovado: false });
eq(/20 minutos/.test(cdep.paragrafos.join(" ")) && !/IMEDIATAMENTE/.test(cdep.paragrafos.join(" ")), true, "aprovar depoimento: a confirmação diz próxima montagem (uns 20 minutos), nunca imediatamente");
eq(cdep.titulo, "Aprovar o depoimento de “Anônimo”?", "aprovar depoimento anônimo");
const cex = M.textoConfirmacao(dep, "excluir", { nome: "Zé", aprovado: true, foto: "abc" });
eq([cex.digitar, cex.perigo, cex.sim], ["EXCLUIR", true, "Excluir definitivamente"], "excluir: exige digitar EXCLUIR");
eq(/para sempre/.test(cex.paragrafos[0]) && /sai do site/.test(cex.paragrafos.join(" ")) && /foto continua guardada/.test(cex.paragrafos.join(" ")), true, "excluir depoimento publicado com foto: avisa que sai do site e que a foto continua no Directus");
eq(M.textoConfirmacao(dep, "excluir", { nome: "Zé", aprovado: false }).paragrafos.some((p) => /foto/.test(p)), false, "excluir sem foto: nada sobre foto");
eq(M.textoConfirmacao(mur, "excluir", { nome: "Ana", confidencial: true }).paragrafos.some((p) => /equipe pastoral já tiver atendido/.test(p)), true, "excluir pedido confidencial: só depois do atendimento pastoral");
eq(M.textoConfirmacao(mur, "excluir", { nome: "Ana", aprovado: true, confidencial: false }).paragrafos.some((p) => /sai do mural público na hora/.test(p)), true, "excluir pedido publicado: sai do mural na hora");
eq(M.PALAVRA_EXCLUIR, "EXCLUIR", "a palavra digitada");
eq(
  [M.textoSucesso(mur, "aprovar"), M.textoSucesso(dep, "aprovar"), M.textoSucesso(mur, "tirar"), M.textoSucesso(dep, "tirar"), M.textoSucesso(dep, "excluir")],
  [
    "Pedido aprovado: já está no mural público.",
    "Depoimento aprovado. Ele aparece no site na próxima montagem (em até uns 20 minutos).",
    "Pedido tirado do mural público (vale na hora).",
    "Depoimento tirado do ar. Sai do site na próxima montagem (em até uns 20 minutos).",
    "Excluído para sempre.",
  ],
  "frases de sucesso de cada ação",
);
eq(
  [M.textoContagemCartao(dep, "aguardando", 0), M.textoContagemCartao(dep, "aguardando", 1), M.textoContagemCartao(dep, "aguardando", 3), M.textoContagemCartao(dep, "publicados", 9)],
  ["Nenhum aguardando", "1 aguardando", "3 aguardando", ""],
  "contagem no cartão: nenhum / 1 / vários; abas fora do cartão não mostram nada",
);
eq(
  [M.textoContagemCartao(mur, "confidenciais", 0), M.textoContagemCartao(mur, "confidenciais", 1), M.textoContagemCartao(mur, "confidenciais", 2)],
  ["", "1 confidencial", "2 confidenciais"],
  "contagem das confidenciais no cartão do mural (zero não aparece)",
);
eq(L.painelUrls.moderar("mural_oracao"), "/painel-conteudo/moderar/?tipo=mural_oracao", "endereço da moderação");
eq(L.painelUrls.moderar("mural_oracao", "confidenciais"), "/painel-conteudo/moderar/?tipo=mural_oracao&aba=confidenciais", "endereço da moderação com aba");

// Cartões da página inicial: conteúdo e moderação juntos
const cartoes = M.cartoesHome();
eq(cartoes.map((c) => c.id), [...Object.keys(L.TIPOS_CONTEUDO), "depoimentos", "mural_oracao"], "cartões: conteúdo na ordem do registro, depois a moderação");
eq(new Set(cartoes.map((c) => c.id)).size, cartoes.length, "cartões: nenhum identificador repetido (a tela usa o id para achar o cartão)");
eq(L.GRUPOS_HOME.every((g) => cartoes.some((c) => c.grupo === g.id)), true, "cartões: toda seção da página inicial tem pelo menos um cartão");
eq(cartoes.every((c) => gruposIds.includes(c.grupo)), true, "cartões: todo cartão está numa seção que existe");
eq(cartoes.filter((c) => c.grupo === "moderacao").map((c) => [c.id, c.origem, c.href]), [["depoimentos", "moderacao", "/painel-conteudo/moderar/?tipo=depoimentos"], ["mural_oracao", "moderacao", "/painel-conteudo/moderar/?tipo=mural_oracao"]], "cartões da Moderação abrem a tela de moderação");
eq(cartoes.find((c) => c.id === "relatorios").grupo, "institucional", "o cartão dos relatórios está em Institucional");
eq(cartoes.find((c) => c.id === "relatorios").href, "/painel-conteudo/lista/?tipo=relatorios", "o cartão dos relatórios abre a lista");
eq(cartoes.find((c) => c.id === "configuracoes").unico, true, "o cartão das páginas fixas segue sendo de item único");
eq(cartoes.filter((c) => c.origem === "moderacao").every((c) => !c.unico), true, "cartões de moderação não são de item único");

console.log(falhas ? `\n${falhas} FALHA(S) de ${total}` : `\n${total}/${total} verificações ok`);
process.exitCode = falhas ? 1 : 0;
