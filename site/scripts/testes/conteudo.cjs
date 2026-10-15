// Bateria do PAINEL DE CONTEÚDO (/painel-conteudo/) contra o Directus de verdade e o site publicado (15/10/2026).
// Cria um usuário temporário com a função "Editor de notícias" e confere, com o token DELE (o mesmo que o painel usa):
//   - o que pode: ler, criar (SÓ rascunho), alterar e apagar notícias, mensagens e perguntas frequentes (FAQ); ler (e, pelo
//     mapa de permissões, escrever em) programação, galeria, história (e suas fotos) e ministérios; ler órgãos; enviar imagem
//     (só imagem); trocar a ordem (`sort`) de itens em LOTE, como o painel faz com as setas ▲/▼;
//   - o que NÃO pode: nada sigiloso (mural de oração, contas, inscrições, pedidos de camiseta, avisos do navegador, mensagens
//     de contato, relatórios, depoimentos…), nem as páginas fixas do site (`configuracoes`), nem gravar em órgãos/categorias de
//     órgão, nem enviar arquivo que não seja imagem, nem apagar arquivo;
//   - que as quatro páginas do painel respondem no site (e a tela de moderação).
// Terceiro lote (moderação do que o público envia e relatórios de transparência, só da Diretoria): com um segundo usuário
// temporário, da função "Semi-administrador", confere que ele LÊ depoimentos, mural de oração e relatórios, que as consultas
// das abas da moderação (Aguardando, Publicados, Confidenciais) acham cada item de teste numa aba só, que ele envia imagem E PDF
// (o PDF fica servido ao público em /assets e o painel lê o nome e o tamanho do arquivo) e que texto puro é recusado (400);
// e que o "Editor de notícias" leva 403 nas três coleções e não envia PDF (só imagem).
// REGRA DE SEGURANÇA DO TERCEIRO LOTE: o mural é público e em TEMPO REAL, então esta bateria NUNCA grava `aprovado: true` em
// nenhuma coleção. Itens de teste dessas coleções só nascem pela mão do administrador, SEMPRE `aprovado: false`, com o texto
// começando por "TESTE" (a versão do conteúdo os ignora) e duram segundos: são apagados no `finally`. Em `relatorios` (que não tem
// rascunho: o que for gravado vai ao site na montagem seguinte) NUNCA se grava nada — só leitura, mapa de permissões e arquivos.
// REGRA DE SEGURANÇA: o Directus daqui é o de produção e um item com draft=false e notificacao_enviada=false dispara notificação
// de verdade para quem ativou os avisos. Por isso TODO item criado aqui nasce `draft: true` E `notificacao_enviada: true`,
// com slug "teste-conteudo-…" (a versão do conteúdo ignora "teste-…") e é apagado no `finally`, junto com o usuário e o arquivo.
// Os tipos SEM rascunho (programação, ministérios, história, galeria, configuracoes) são públicos no instante em que se grava:
// aqui NUNCA se grava neles — só leitura, 403 e o mapa de permissões (`/permissions/me`). O FAQ tem `draft`: os itens de teste
// dele nascem `draft: true`, começam por "TESTE" (a versão do conteúdo os ignora) e são apagados no `finally`.
// No começo e no fim a bateria conta os itens desses tipos (e confere o texto das páginas fixas): se algo mudou, falha.
//
// Variáveis: SITE_URL (padrão: produção), DIRECTUS_URL, DIRECTUS_ADMIN_TOKEN (ver README desta pasta). Nada de segredo é impresso.
const crypto = require("node:crypto");
const { ambiente, Verificador, pdfMinimo } = require("./comum.cjs");

// PNG de 1 pixel (o menor arquivo de imagem válido).
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function main() {
  const { SITE, URL, dx } = ambiente();
  const v = new Verificador("painel de conteúdo");
  const prefixo = "teste-conteudo-" + Date.now();
  let usuarioId = null;
  let semiId = null; // usuário temporário da função "Semi-administrador" (terceiro lote)
  const arquivos = [];
  const TEXTO_TESTE = `TESTE ${prefixo}`; // todo item de teste de depoimentos/mural começa assim (e nasce aprovado: false)
  // Coleções em que a bateria NUNCA grava: o retrato de antes e de depois tem que ser idêntico.
  const SO_LEITURA = ["programacao", "ministerios", "historia", "historia_files", "galeria"];
  const contar = async (col) => {
    const r = await dx("GET", `/items/${col}?aggregate[count]=*`);
    const d = Array.isArray(r.data) ? r.data[0] : r.data;
    return d && d.count !== undefined ? Number(d.count) : null;
  };
  const retrato = async () => {
    const o = {};
    for (const c of SO_LEITURA) o[c] = await contar(c);
    const cfg = await dx("GET", "/items/configuracoes");
    o.configuracoes = crypto.createHash("sha256").update(JSON.stringify(cfg.data || null)).digest("hex").slice(0, 12);
    // Terceiro lote: depoimentos, mural e relatórios têm que ficar com a mesma contagem (os itens de teste duram segundos).
    for (const c of ["depoimentos", "mural_oracao", "relatorios"]) o[c] = await contar(c);
    return o;
  };
  const antes = await retrato();

  // O Directus (plano pequeno) devolve 503/429 de vez em quando: a limpeza tenta de novo, para não deixar lixo de teste em produção.
  async function tentar(fn) {
    let r;
    for (let i = 0; i < 5; i++) {
      r = await fn();
      if (r.ok || r.status === 404) return r;
      await new Promise((ok) => setTimeout(ok, 1500 * (i + 1)));
    }
    return r;
  }

  async function limpar() {
    for (const col of ["noticias", "mensagens"]) {
      const r = await tentar(() =>
        dx("GET", `/items/${col}?filter[slug][_starts_with]=${prefixo}&fields=id&limit=-1`),
      );
      const ids = (r.data || []).map((x) => x.id);
      if (ids.length) await tentar(() => dx("DELETE", `/items/${col}`, ids));
    }
    {
      const r = await tentar(() =>
        dx("GET", `/items/faq?filter[pergunta][_starts_with]=TESTE ${prefixo}&fields=id&limit=-1`),
      );
      const ids = (r.data || []).map((x) => x.id);
      if (ids.length) await tentar(() => dx("DELETE", "/items/faq", ids));
    }
    // Terceiro lote: itens de teste de depoimentos (nome) e do mural (texto), sempre `aprovado: false`.
    for (const [col, campo] of [["depoimentos", "nome"], ["mural_oracao", "texto"]]) {
      const r = await tentar(() =>
        dx("GET", `/items/${col}?filter[${campo}][_starts_with]=${encodeURIComponent(TEXTO_TESTE)}&fields=id&limit=-1`),
      );
      const ids = (r.data || []).map((x) => x.id);
      if (ids.length) await tentar(() => dx("DELETE", `/items/${col}`, ids));
    }
    for (const dono of [usuarioId, semiId]) {
      if (!dono) continue;
      const f = await tentar(() =>
        dx("GET", `/files?filter[uploaded_by][_eq]=${dono}&fields=id&limit=-1`),
      );
      for (const x of f.data || []) if (!arquivos.includes(x.id)) arquivos.push(x.id);
    }
    for (const id of arquivos) await tentar(() => dx("DELETE", `/files/${id}`));
    if (usuarioId) await tentar(() => dx("DELETE", `/users/${usuarioId}`));
    if (semiId) await tentar(() => dx("DELETE", `/users/${semiId}`));
  }

  try {
    const papeis = (await dx("GET", "/roles?limit=-1&fields=id,name")).data || [];
    const papel = papeis.find((p) => String(p.name).includes("Editor de not"));
    v.ok("a função 'Editor de notícias' existe no Directus", !!papel);
    if (!papel) return;

    const senha = crypto.randomBytes(18).toString("base64url");
    const email = `teste-conteudo-${Date.now()}@exemplo.com`;
    const u = await dx("POST", "/users", {
      email,
      password: senha,
      first_name: "TESTE",
      last_name: "conteúdo (apagar)",
      role: papel.id,
      status: "active",
    });
    if (!u.ok) throw new Error("não criou o usuário de teste: " + u.status + " " + u.erro);
    usuarioId = u.data.id;
    const lg = await fetch(URL + "/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: senha, mode: "json" }),
    });
    const lj = await lg.json().catch(() => ({}));
    const token = lj.data && lj.data.access_token;
    if (!token) throw new Error("login do usuário de teste falhou: " + lg.status);

    // Chamada com o token do próprio usuário (como o painel faz).
    const comoDe = (tokenDaPessoa) => async (metodo, caminho, corpo, extra = {}) => {
      const r = await fetch(URL + caminho, {
        method: metodo,
        headers: {
          Authorization: "Bearer " + tokenDaPessoa,
          ...(corpo && !(corpo instanceof FormData) ? { "Content-Type": "application/json" } : {}),
        },
        body: corpo ? (corpo instanceof FormData ? corpo : JSON.stringify(corpo)) : undefined,
        ...extra,
      });
      const j = await r.json().catch(() => ({}));
      return {
        status: r.status,
        j,
        erro:
          j.errors &&
          j.errors[0] &&
          ((j.errors[0].extensions && j.errors[0].extensions.code) || j.errors[0].message),
      };
    };
    const como = comoDe(token);

    // ---- o que o Editor de notícias PODE (leitura)
    for (const c of [
      "noticias",
      "mensagens",
      "orgao_membros",
      "orgao_categorias",
      "faq",
      "programacao",
      "galeria",
      "ministerios",
      "historia",
      "historia_files",
    ]) {
      const r = await como("GET", `/items/${c}?limit=1&fields=id`);
      v.ok(`lê ${c} (200)`, r.status === 200, r.status);
    }
    // A história com as linhas da tabela de fotos (é o que o formulário pede) e os ministérios com o tipo de órgão.
    const h = await como("GET", "/items/historia?limit=1&fields=id,title,photo,fotos.id,fotos.directus_files_id,fotos.sort");
    v.ok(
      "lê a história junto com as linhas da tabela de fotos (fotos.id, fotos.directus_files_id, fotos.sort)",
      h.status === 200 && Array.isArray(h.j.data) && h.j.data.length === 1 && Array.isArray(h.j.data[0].fotos),
      h.status,
    );
    // O mapa de permissões da própria conta (leitura, sem gravar nada): o que o editor PODE e NÃO PODE escrever.
    const pm = await como("GET", "/permissions/me");
    const mapa = (pm.j && pm.j.data) || {};
    const acesso = (col, acao) => (mapa[col] && mapa[col][acao] && mapa[col][acao].access) || "none";
    v.ok("GET /permissions/me responde (200)", pm.status === 200 && Object.keys(mapa).length > 0, pm.status);
    for (const col of ["noticias", "mensagens", "faq", "programacao", "galeria", "ministerios", "historia", "historia_files"]) {
      v.ok(
        `mapa de permissões: escreve (cria, altera, apaga) e lê ${col}`,
        ["create", "read", "update", "delete"].every((a) => acesso(col, a) !== "none"),
        ["create", "read", "update", "delete"].map((a) => acesso(col, a)).join("/"),
      );
    }
    for (const col of ["orgao_membros", "orgao_categorias"]) {
      v.ok(
        `mapa de permissões: só LÊ ${col} (não cria, altera nem apaga)`,
        acesso(col, "read") !== "none" && ["create", "update", "delete"].every((a) => acesso(col, a) === "none"),
        ["create", "read", "update", "delete"].map((a) => acesso(col, a)).join("/"),
      );
    }
    for (const col of [
      "configuracoes",
      "relatorios",
      "depoimentos",
      "mural_oracao",
      "contas",
      "contas_codigos",
      "inscricoes_eventos",
      "camiseta_pedidos",
      "push_subscriptions",
      "contato_mensagens",
    ]) {
      v.ok(
        `mapa de permissões: NENHUM acesso a ${col}`,
        ["create", "read", "update", "delete"].every((a) => acesso(col, a) === "none"),
        ["create", "read", "update", "delete"].map((a) => acesso(col, a)).join("/"),
      );
    }
    // Campos que o painel manda ao gravar um tipo sem rascunho: tudo liberado ("*") nas coleções do segundo lote.
    for (const col of ["faq", "programacao", "galeria", "ministerios", "historia", "historia_files"]) {
      const campos = (mapa[col] && mapa[col].update && mapa[col].update.fields) || [];
      v.ok(`${col}: o editor altera todos os campos (inclui "sort", usado pelas setas ▲/▼)`, campos.includes("*") || campos.includes("sort"), JSON.stringify(campos).slice(0, 80));
    }

    // ---- ciclo completo em RASCUNHO (nunca publicado) nas duas coleções
    const modelos = {
      noticias: { category: "institucional" },
      mensagens: { category: "Notícias e Avisos" },
    };
    for (const [col, extra] of Object.entries(modelos)) {
      const slug = `${prefixo}-${col}`;
      const base = {
        title: `TESTE conteúdo (apagar) ${col}`,
        slug,
        excerpt: "teste",
        body: "**teste**",
        date: new Date().toISOString().slice(0, 10),
        draft: true,
        ...extra,
      };
      const c = await como("POST", `/items/${col}`, base);
      const id = c.j.data && c.j.data.id;
      v.ok(
        `cria rascunho em ${col} (200)`,
        c.status === 200 && !!id,
        `${c.status} ${c.erro || ""}`,
      );
      if (!id) continue;
      // O editor NÃO escreve "notificacao_enviada" (15/10/2026: quem a controla é o robô de avisos; um editor poderia religar o aviso de uma
      // notícia antiga para todos). Quem marca o item de teste como "já notificado" é o administrador, logo depois de criado.
      await dx("PATCH", `/items/${col}/${id}`, { notificacao_enviada: true });
      const comAviso = await como("POST", `/items/${col}`, { ...base, slug: `${slug}-aviso`, notificacao_enviada: false });
      v.ok(`${col}: o editor NÃO consegue criar item escrevendo "notificacao_enviada" (403)`, comAviso.status === 403, `${comAviso.status}`);
      // (se um dia a trava falhar, o item de teste — sempre rascunho — não fica para trás)
      if (comAviso.j.data && comAviso.j.data.id) await dx("DELETE", `/items/${col}/${comAviso.j.data.id}`);
      const religar = await como("PATCH", `/items/${col}/${id}`, { notificacao_enviada: false });
      v.ok(`${col}: o editor NÃO consegue religar o aviso de um item (403)`, religar.status === 403, `${religar.status}`);
      const noAdmin =
        (await dx("GET", `/items/${col}/${id}?fields=draft,notificacao_enviada,slug`)).data || {};
      v.ok(
        `${col}: o item de teste nasceu RASCUNHO e já "notificado" (nenhum aviso real pode sair)`,
        noAdmin.draft === true && noAdmin.notificacao_enviada === true && noAdmin.slug === slug,
        JSON.stringify(noAdmin),
      );
      const dup = await como("POST", `/items/${col}`, {
        ...base,
        title: "TESTE conteúdo duplicado (apagar)",
      });
      v.ok(
        `${col}: endereço (slug) repetido é recusado com 400 RECORD_NOT_UNIQUE (o painel mostra a mensagem certa)`,
        dup.status === 400 && dup.erro === "RECORD_NOT_UNIQUE",
        `${dup.status} ${dup.erro || ""}`,
      );
      const p = await como("PATCH", `/items/${col}/${id}`, { excerpt: "alterado pelo teste" });
      v.ok(
        `altera em ${col} (200)`,
        p.status === 200 && p.j.data && p.j.data.excerpt === "alterado pelo teste",
        p.status,
      );
      const d = await como("DELETE", `/items/${col}/${id}`);
      v.ok(`apaga em ${col} (204)`, d.status === 204, d.status);
      const some = await dx("GET", `/items/${col}?filter[slug][_eq]=${slug}&fields=id`);
      v.ok(`${col}: o item de teste sumiu mesmo`, (some.data || []).length === 0);
    }

    // ---- FAQ: ciclo completo em RASCUNHO + troca de ordem em lote (como as setas ▲/▼ do painel). Só itens "TESTE", sempre draft:true.
    {
      const baseFaq = (n, sort) => ({
        pergunta: `TESTE ${prefixo} ${n} (apagar)`,
        resposta: "teste do painel",
        categoria: "site",
        draft: true,
        sort,
      });
      const a = await como("POST", "/items/faq", baseFaq("A", 9001));
      const b = await como("POST", "/items/faq", baseFaq("B", 9002));
      const idA = a.j.data && a.j.data.id;
      const idB = b.j.data && b.j.data.id;
      v.ok("cria dois itens de FAQ em rascunho (200)", a.status === 200 && b.status === 200 && !!idA && !!idB, `${a.status} ${b.status} ${a.erro || ""}`);
      if (idA && idB) {
        const noAdmin = (await dx("GET", `/items/faq?filter[id][_in]=${idA},${idB}&fields=id,draft,sort,categoria&sort=id`)).data || [];
        v.ok(
          "faq: os itens de teste nasceram RASCUNHO (nada vai ao ar)",
          noAdmin.length === 2 && noAdmin.every((x) => x.draft === true),
          JSON.stringify(noAdmin),
        );
        // O painel descobre o "maior sort" do grupo antes de criar um item novo.
        const maior = await como("GET", "/items/faq?fields=sort&sort=-sort&limit=1&filter[sort][_nnull]=true&filter[categoria][_eq]=site");
        v.ok(
          "faq: a consulta do 'maior sort da categoria' funciona para o editor e enxerga o item novo",
          maior.status === 200 && maior.j.data && maior.j.data[0] && maior.j.data[0].sort === 9002,
          `${maior.status} ${JSON.stringify(maior.j.data)}`,
        );
        // Setas ▲/▼: um PATCH em lote, com os ids no corpo, troca os dois valores de uma vez (tudo ou nada).
        const lote = await como("PATCH", "/items/faq", [
          { id: idA, sort: 9002 },
          { id: idB, sort: 9001 },
        ]);
        v.ok("faq: PATCH em lote [{id, sort}, {id, sort}] (troca de ordem) responde 200", lote.status === 200, `${lote.status} ${lote.erro || ""}`);
        const depois = (await dx("GET", `/items/faq?filter[id][_in]=${idA},${idB}&fields=id,sort&sort=id`)).data || [];
        const porId = Object.fromEntries(depois.map((x) => [x.id, x.sort]));
        v.ok("faq: os dois valores de sort foram trocados de verdade", porId[idA] === 9002 && porId[idB] === 9001, JSON.stringify(porId));
        const p = await como("PATCH", `/items/faq/${idA}`, { resposta: "alterada pelo teste" });
        v.ok("altera em faq (200)", p.status === 200 && p.j.data && p.j.data.resposta === "alterada pelo teste", p.status);
        const noAdmin2 = (await dx("GET", `/items/faq/${idA}?fields=draft`)).data || {};
        v.ok("faq: continua RASCUNHO depois de alterar", noAdmin2.draft === true, JSON.stringify(noAdmin2));
        const d = await como("DELETE", `/items/faq/${idA}`);
        v.ok("apaga em faq (204)", d.status === 204, d.status);
      }
    }
    // O editor NÃO escreve nas páginas fixas nem nos órgãos: sonda SEM efeito (id que não existe / nada é enviado).
    const orgaoNaoExiste = await como("PATCH", "/items/orgao_membros/987654", { name: "x" });
    v.ok("NÃO altera orgao_membros (403, sem chegar a existir o item)", orgaoNaoExiste.status === 403, orgaoNaoExiste.status);
    const orgaoApaga = await como("DELETE", "/items/orgao_membros/987654");
    v.ok("NÃO apaga em orgao_membros (403)", orgaoApaga.status === 403, orgaoApaga.status);
    const catApaga = await como("DELETE", "/items/orgao_categorias/nao-existe-teste");
    v.ok("NÃO apaga em orgao_categorias (403)", catApaga.status === 403, catApaga.status);

    // ---- envio de arquivo: só imagem
    const fd = new FormData();
    fd.append("file", new Blob([PNG_1PX], { type: "image/png" }), "teste-conteudo-1px.png");
    const up = await como("POST", "/files", fd);
    const arquivoId = up.j.data && up.j.data.id;
    if (arquivoId) arquivos.push(arquivoId);
    v.ok(
      "envia uma imagem PNG de 1 pixel para /files (200)",
      up.status === 200 && !!arquivoId,
      `${up.status} ${up.erro || ""}`,
    );
    if (arquivoId) {
      const meta = await como("GET", `/files/${arquivoId}?fields=id,type`);
      v.ok(
        "e consegue ler o arquivo que enviou",
        meta.status === 200 && meta.j.data && meta.j.data.type === "image/png",
        meta.status,
      );
      const del = await como("DELETE", `/files/${arquivoId}`);
      v.ok(
        "mas NÃO apaga arquivo (403): quem apaga é a Secretaria",
        del.status === 403,
        del.status,
      );
      const ativo = await fetch(`${URL}/assets/${arquivoId}`);
      v.ok(
        "o arquivo enviado é servido ao público em /assets (200)",
        ativo.status === 200,
        ativo.status,
      );
    }
    const fdTexto = new FormData();
    fdTexto.append(
      "file",
      new Blob(["isto não é uma imagem"], { type: "text/plain" }),
      "teste-conteudo.txt",
    );
    const upTexto = await como("POST", "/files", fdTexto);
    if (upTexto.j.data && upTexto.j.data.id) arquivos.push(upTexto.j.data.id);
    v.ok(
      "envio de text/plain é recusado (400): a função só envia imagem",
      upTexto.status === 400,
      upTexto.status,
    );
    const fdPdf = new FormData();
    fdPdf.append("file", new Blob([pdfMinimo()], { type: "application/pdf" }), "teste-conteudo.pdf");
    const upPdf = await como("POST", "/files", fdPdf);
    if (upPdf.j.data && upPdf.j.data.id) arquivos.push(upPdf.j.data.id);
    v.ok("envio de um PDF válido também é recusado (400): o Editor de notícias só envia imagem; PDF é da Diretoria", upPdf.status === 400, upPdf.status);
    // Moderação e relatórios são só da Diretoria: sondas SEM efeito (id que não existe) mostram que nem escrever o Editor consegue.
    for (const col of ["depoimentos", "mural_oracao", "relatorios"]) {
      const alt = await como("PATCH", `/items/${col}/987654`, col === "relatorios" ? { period: "x" } : { aprovado: false });
      v.ok(`NÃO altera ${col} (403, sem chegar a existir o item)`, alt.status === 403, alt.status);
      const apaga = await como("DELETE", `/items/${col}/987654`);
      v.ok(`NÃO apaga em ${col} (403)`, apaga.status === 403, apaga.status);
    }

    // ---- o que NÃO pode: nada sigiloso
    for (const c of [
      "mural_oracao",
      "contas",
      "contas_codigos",
      "inscricoes_eventos",
      "camiseta_pedidos",
      "push_subscriptions",
      "contato_mensagens",
      "depoimentos",
      "configuracoes",
      "eventos",
      "relatorios",
    ]) {
      const r = await como("GET", `/items/${c}?limit=1&fields=id`);
      v.ok(`NÃO lê ${c} (403)`, r.status === 403, r.status);
    }
    // As páginas fixas (singleton): o endereço do item único também é recusado — e nada é gravado.
    const cfgLe = await como("GET", "/items/configuracoes?fields=tagline");
    v.ok("NÃO lê as páginas fixas pelo endereço do item único (403)", cfgLe.status === 403, cfgLe.status);
    // Contas de outras pessoas: o Directus deixa todo usuário do painel ver a PRÓPRIA conta (e só ela).
    const us = await como("GET", "/users?limit=-1&fields=id");
    v.ok(
      "só enxerga a própria conta de usuário (nenhuma outra pessoa aparece)",
      us.status === 403 ||
        (us.status === 200 &&
          Array.isArray(us.j.data) &&
          us.j.data.length === 1 &&
          us.j.data[0].id === usuarioId),
      `${us.status} ${us.j.data ? us.j.data.length + " conta(s)" : ""}`,
    );

    // ---- Terceiro lote: o que o SEMI-ADMINISTRADOR (Diretoria) faz na moderação e nos relatórios
    {
      const papelSemi = papeis.find((p) => p.name === "Semi-administrador");
      v.ok("a função 'Semi-administrador' existe no Directus", !!papelSemi);
      if (papelSemi) {
        const senhaSemi = crypto.randomBytes(18).toString("base64url");
        const emailSemi = `teste-conteudo-semi-${Date.now()}@exemplo.com`;
        const uSemi = await dx("POST", "/users", {
          email: emailSemi,
          password: senhaSemi,
          first_name: "TESTE",
          last_name: "conteúdo semi (apagar)",
          role: papelSemi.id,
          status: "active",
        });
        if (!uSemi.ok) throw new Error("não criou o usuário semi de teste: " + uSemi.status + " " + uSemi.erro);
        semiId = uSemi.data.id;
        const lgSemi = await fetch(URL + "/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: emailSemi, password: senhaSemi, mode: "json" }),
        });
        const ljSemi = await lgSemi.json().catch(() => ({}));
        const tokenSemi = ljSemi.data && ljSemi.data.access_token;
        if (!tokenSemi) throw new Error("login do usuário semi de teste falhou: " + lgSemi.status);
        const comoSemi = comoDe(tokenSemi);

        // Leitura e mapa de permissões (a tela só mostra o cartão de quem consegue ler).
        for (const c of ["depoimentos", "mural_oracao", "relatorios"]) {
          const r = await comoSemi("GET", `/items/${c}?limit=1&fields=id`);
          v.ok(`semi-administrador lê ${c} (200)`, r.status === 200, r.status);
        }
        const pmS = await comoSemi("GET", "/permissions/me");
        const mapaS = (pmS.j && pmS.j.data) || {};
        const acessoS = (col, acao) => (mapaS[col] && mapaS[col][acao] && mapaS[col][acao].access) || "none";
        for (const col of ["depoimentos", "mural_oracao", "relatorios"]) {
          v.ok(
            `mapa de permissões do semi-administrador: escreve (cria, altera, apaga) e lê ${col}`,
            ["create", "read", "update", "delete"].every((a) => acessoS(col, a) !== "none"),
            ["create", "read", "update", "delete"].map((a) => acessoS(col, a)).join("/"),
          );
        }

        // Itens de teste (pelo administrador, SEMPRE aprovado: false; nunca um aprovado: true em nenhum pedido desta bateria).
        const novo = async (col, corpo) => {
          const r = await dx("POST", `/items/${col}`, corpo);
          return r.data && r.data.id;
        };
        const dep1 = await novo("depoimentos", { nome: `${TEXTO_TESTE} dep1`, texto: `${TEXTO_TESTE} depoimento com consentimento`, aprovado: false, consentimento_lgpd: true });
        const dep2 = await novo("depoimentos", { nome: `${TEXTO_TESTE} dep2`, texto: `${TEXTO_TESTE} depoimento SEM consentimento`, aprovado: false, consentimento_lgpd: false });
        const dep3 = await novo("depoimentos", { nome: `${TEXTO_TESTE} dep3`, texto: `${TEXTO_TESTE} depoimento com aprovado vazio`, aprovado: null, consentimento_lgpd: true });
        const mur1 = await novo("mural_oracao", { nome: null, texto: `${TEXTO_TESTE} pedido comum`, aprovado: false, confidencial: false, consentimento_lgpd: true });
        const mur2 = await novo("mural_oracao", { nome: null, texto: `${TEXTO_TESTE} pedido CONFIDENCIAL`, aprovado: false, confidencial: true, consentimento_lgpd: true });
        v.ok("itens de teste criados (3 depoimentos e 2 pedidos de oração)", !!(dep1 && dep2 && dep3 && mur1 && mur2), JSON.stringify([dep1, dep2, dep3, mur1, mur2]));
        const aprovadosPorEngano = [];
        for (const [col, campo] of [["depoimentos", "nome"], ["mural_oracao", "texto"]]) {
          const r = await dx("GET", `/items/${col}?filter[${campo}][_starts_with]=${encodeURIComponent(TEXTO_TESTE)}&filter[aprovado][_eq]=true&fields=id`);
          aprovadosPorEngano.push(...(r.data || []));
        }
        v.ok("SEGURANÇA: nenhum item de teste está aprovado (o mural é em tempo real e público)", aprovadosPorEngano.length === 0, aprovadosPorEngano.length);

        // As consultas das abas da moderação (as MESMAS de src/lib/painelModeracao.ts, `filtroDaAba`), restritas aos itens de teste.
        const naoConf = { _or: [{ confidencial: { _eq: false } }, { confidencial: { _null: true } }] };
        const naoAprov = { _or: [{ aprovado: { _eq: false } }, { aprovado: { _null: true } }] };
        const abaDep = { aguardando: naoAprov, publicados: { aprovado: { _eq: true } } };
        const abaMur = {
          aguardando: { _and: [naoAprov, naoConf] },
          publicados: { _and: [{ aprovado: { _eq: true } }, naoConf] },
          confidenciais: { confidencial: { _eq: true } },
        };
        const consulta = (col, campo, filtroAba, extra = "") => {
          const f = { _and: [{ [campo]: { _starts_with: TEXTO_TESTE } }, filtroAba] };
          return `/items/${col}?${extra}meta=filter_count&filter=${encodeURIComponent(JSON.stringify(f))}`;
        };
        const contaAba = async (col, campo, filtroAba) => {
          const r = await comoSemi("GET", consulta(col, campo, filtroAba, "limit=1&fields=id&"));
          return r.status === 200 && r.j.meta ? Number(r.j.meta.filter_count) : `HTTP ${r.status}`;
        };
        v.ok("moderação (depoimentos): 'Aguardando' acha os 3 de teste (inclusive o de aprovado vazio e o sem consentimento)", (await contaAba("depoimentos", "nome", abaDep.aguardando)) === 3);
        v.ok("moderação (depoimentos): 'Publicados' não acha nenhum", (await contaAba("depoimentos", "nome", abaDep.publicados)) === 0);
        v.ok("moderação (mural): 'Aguardando' acha SÓ o pedido comum (o confidencial nunca entra na fila de aprovação)", (await contaAba("mural_oracao", "texto", abaMur.aguardando)) === 1);
        v.ok("moderação (mural): 'Publicados' não acha nenhum", (await contaAba("mural_oracao", "texto", abaMur.publicados)) === 0);
        v.ok("moderação (mural): 'Confidenciais' acha o confidencial", (await contaAba("mural_oracao", "texto", abaMur.confidenciais)) === 1);
        // A lista, com os campos que a tela pede, do mais novo para o mais antigo.
        const lista = await comoSemi(
          "GET",
          consulta("mural_oracao", "texto", { id: { _nnull: true } }, "fields=id,nome,texto,aprovado,consentimento_lgpd,date_created,confidencial,orando_count&sort=-date_created,-id&limit=20&offset=0&"),
        );
        const linhas = (lista.j && lista.j.data) || [];
        v.ok(
          "moderação: a lista do mural traz os campos da tela (confidencial, orando_count, date_created) e vem do mais novo para o mais antigo",
          lista.status === 200 && linhas.length === 2 && linhas[0].id === mur2 && linhas[1].id === mur1 && linhas.every((l) => l.orando_count === 0 && l.date_created && typeof l.confidencial === "boolean"),
          `${lista.status} ${JSON.stringify(linhas).slice(0, 120)}`,
        );
        // Escrever (só com valores seguros): "Tirar do ar" (aprovado: false) num item que já não está no ar e Excluir os itens de teste.
        const tirar = dep1 ? await comoSemi("PATCH", `/items/depoimentos/${dep1}`, { aprovado: false }) : { status: 0 };
        v.ok("semi-administrador grava aprovado:false em depoimentos (200) — o mesmo PATCH do 'Tirar do ar'", tirar.status === 200, tirar.status);
        const apagaDep = dep2 ? await comoSemi("DELETE", `/items/depoimentos/${dep2}`) : { status: 0 };
        v.ok("semi-administrador exclui um depoimento (204)", apagaDep.status === 204, apagaDep.status);
        const apagaMur = mur2 ? await comoSemi("DELETE", `/items/mural_oracao/${mur2}`) : { status: 0 };
        v.ok("semi-administrador exclui um pedido confidencial (204)", apagaMur.status === 204, apagaMur.status);
        const restoDep = dep2 ? await dx("GET", `/items/depoimentos/${dep2}?fields=id`) : { status: 0 };
        v.ok("…e o item excluído sumiu mesmo", restoDep.status === 403 || restoDep.status === 404, restoDep.status);

        // Envio de arquivo: o semi-administrador envia imagem E PDF (o do relatório); texto puro e SVG são recusados.
        const envia = async (conteudo, tipo, nome) => {
          const f = new FormData();
          f.append("file", new Blob([conteudo], { type: tipo }), nome);
          const r = await comoSemi("POST", "/files", f);
          if (r.j.data && r.j.data.id) arquivos.push(r.j.data.id);
          return r;
        };
        const upPng = await envia(PNG_1PX, "image/png", "teste-conteudo-semi-1px.png");
        v.ok("semi-administrador envia uma imagem PNG (200)", upPng.status === 200 && !!(upPng.j.data && upPng.j.data.id), `${upPng.status} ${upPng.erro || ""}`);
        const upPdfS = await envia(pdfMinimo(), "application/pdf", "teste-conteudo-relatorio.pdf");
        const pdfId = upPdfS.j.data && upPdfS.j.data.id;
        v.ok("semi-administrador envia um PDF (200): é assim que sobe o relatório de transparência", upPdfS.status === 200 && !!pdfId, `${upPdfS.status} ${upPdfS.erro || ""}`);
        if (pdfId) {
          const meta = await comoSemi("GET", `/files/${pdfId}?fields=id,filename_download,filesize,type`);
          v.ok(
            "e consegue ler nome, tamanho e tipo do arquivo (o painel mostra isso ao lado do botão 'Trocar arquivo')",
            meta.status === 200 && meta.j.data && meta.j.data.filename_download === "teste-conteudo-relatorio.pdf" && Number(meta.j.data.filesize) > 0 && meta.j.data.type === "application/pdf",
            `${meta.status} ${JSON.stringify(meta.j.data || {}).slice(0, 120)}`,
          );
          const publico = await fetch(`${URL}/assets/${pdfId}`);
          const bytes = Buffer.from(await publico.arrayBuffer());
          v.ok(
            "o PDF enviado é baixado por QUALQUER pessoa em /assets (200, application/pdf, mesmo conteúdo)",
            publico.status === 200 && /application\/pdf/.test(publico.headers.get("content-type") || "") && bytes.equals(pdfMinimo()),
            `${publico.status} ${publico.headers.get("content-type")}`,
          );
        }
        const upTxt = await envia("isto não é um relatório", "text/plain", "teste-conteudo-semi.txt");
        v.ok("semi-administrador: texto puro é recusado (400)", upTxt.status === 400, upTxt.status);
        const upSvg = await envia('<svg xmlns="http://www.w3.org/2000/svg"/>', "image/svg+xml", "teste-conteudo-semi.svg");
        v.ok("semi-administrador: SVG é recusado (400)", upSvg.status === 400, upSvg.status);
      }
    }

    // ---- as páginas do painel respondem no site (e são noindex)
    for (const [caminho, marca] of [
      ["/painel-conteudo/", "data-pc-inicio"],
      ["/painel-conteudo/entrar/", "data-pc-entrar"],
      ["/painel-conteudo/lista/", "data-pc-lista"],
      ["/painel-conteudo/editar/", "data-pc-editar"],
      ["/painel-conteudo/moderar/", "data-pc-moderar"],
    ]) {
      const t0 = Date.now();
      const r = await fetch(SITE + caminho);
      const html = await r.text();
      v.ok(
        `${caminho} responde 200, é a tela certa e tem noindex`,
        r.status === 200 && html.includes(marca) && /name="robots" content="noindex/.test(html),
        `${r.status} ${Date.now() - t0} ms`,
      );
    }
  } finally {
    await limpar();
    // Conferência final: nada de teste ficou no Directus.
    const sobra = [];
    for (const col of ["noticias", "mensagens"]) {
      const r = await dx("GET", `/items/${col}?filter[slug][_starts_with]=${prefixo}&fields=id`);
      sobra.push(...(r.data || []));
    }
    const sobraFaq = await dx("GET", `/items/faq?filter[pergunta][_starts_with]=TESTE ${prefixo}&fields=id`);
    sobra.push(...(sobraFaq.data || []));
    for (const [col, campo] of [["depoimentos", "nome"], ["mural_oracao", "texto"]]) {
      const r = await dx("GET", `/items/${col}?filter[${campo}][_starts_with]=${encodeURIComponent(TEXTO_TESTE)}&fields=id`);
      sobra.push(...(r.data || []));
    }
    v.ok("limpeza: nenhum item de teste ficou no Directus", sobra.length === 0, sobra.length);
    const depois = await retrato();
    v.ok(
      "nada foi gravado onde não se pode: programação, ministérios, história (e fotos), galeria, depoimentos, mural e relatórios com a mesma contagem; páginas fixas com o mesmo texto",
      JSON.stringify(antes) === JSON.stringify(depois),
      `antes ${JSON.stringify(antes)} depois ${JSON.stringify(depois)}`,
    );
    const usuariosSobra = await dx(
      "GET",
      `/users?filter[email][_starts_with]=teste-conteudo-&fields=id&limit=-1`,
    );
    const arquivosSobra = await dx(
      "GET",
      `/files?filter[filename_download][_starts_with]=teste-conteudo&fields=id&limit=-1`,
    );
    v.ok(
      "limpeza: nenhum usuário nem arquivo de teste ficou no Directus",
      (usuariosSobra.data || []).length === 0 && (arquivosSobra.data || []).length === 0,
      `${(usuariosSobra.data || []).length} usuário(s), ${(arquivosSobra.data || []).length} arquivo(s)`,
    );
    v.fim();
  }
}

main().catch((e) => {
  console.error("ERRO:", e);
  process.exit(1);
});
